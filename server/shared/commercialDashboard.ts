// Cópia de base44/shared/commercialDashboard.ts gerada por tools/port_function.py.
// Regras únicas de contagem do Dash Comercial (compartilhado entre getCommercialDashboard e
// getCommercialDashboardSales, para que os totais e as listas detalhadas usem exatamente o mesmo critério):
//  · Envio → só conta com aprovação financeira (todas as parcelas "Realizada" e com comprovante anexado)
//  · Entrega Própria / Entrega + Instalação → conta quando a OS do Técnico está concluída pelo técnico
//    ou quando o cliente tem agendamento ativo na Agenda de Rotas
//  · Técnico não concluiu (Atendimento Interrompido / Atendido Parcialmente) → o pedido vira Perda de
//    Oportunidade até ser reagendado (OS liberada com histórico de reagendamento OU novo agendamento
//    ativo posterior à visita), quando volta a contar.

export const CONCLUDED_TOS = ["Concluída Técnico", "Aguardando Faturamento - Pós", "Finalizada"];
export const INTERRUPTED_TOS = ["Atendimento Interrompido", "Atendido Parcialmente"];
export const ACTIVE_APPOINTMENTS = ["Agendado", "Confirmado"];

// Bonificação, Permuta e Brinde são condições sem cobrança: esses pedidos NÃO compõem o
// somatório global do faturamento (ficam fora dos totais, do ranking e das listas do dash).
const BONUS_CONDITION_NAMES = ["bonificacao", "brinde", "permuta"];

function normalizeText(text: any) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Fechamento estendido: meses em que a contagem vai além do último dia do calendário.
// Outubro/2026 fecha em 03/11/2026 — as vendas de 01/10 a 03/11 entram no mês de Outubro.
// Os demais meses continuam seguindo o calendário normal (1º ao último dia).
const MONTH_END_OVERRIDES: Record<string, string> = {
  "2026-10": "2026-11-04",
};

// Início estendido: meses que começam depois do dia 1º porque o período anterior levou os
// primeiros dias. Novembro/2026 começa em 04/11 (01 a 03/11 já foram contados em Outubro).
const MONTH_START_OVERRIDES: Record<string, string> = {
  "2026-11": "2026-11-04",
};

export function resolveMonthRange(rawMonth?: any) {
  const requested = String(rawMonth || "");
  const month = /^\d{4}-\d{2}$/.test(requested)
    ? requested
    : new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);

  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;

  const endOverride = MONTH_END_OVERRIDES[month];
  const startOverride = MONTH_START_OVERRIDES[month];

  return {
    month,
    from: new Date(`${startOverride || `${month}-01`}T00:00:00-03:00`).toISOString(),
    to: endOverride
      ? new Date(`${endOverride}T00:00:00-03:00`).toISOString()
      : new Date(`${nextMonth}-01T00:00:00-03:00`).toISOString(),
  };
}

async function listAll(entity: any, query: any) {
  const out: any[] = [];
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 10; i += 1) {
    const options = cursor ? { limit: 500, cursor } : { limit: 500 };
    const page = await entity.filter(query, options);
    out.push(...((page && page.items) || []));
    if (!page || !page.has_more) break;
    cursor = page.next_cursor;
  }
  return out;
}

export async function buildCommercialDashboard(base44: any, rawMonth?: any) {
  const { month, from, to } = resolveMonthRange(rawMonth);

  // Mês da venda = 1ª mudança de status (saída de Orçamento). Canceladas ficam fora.
  // Em paralelo, a carteira de orçamentos em aberto (etapa Orçamento) — lista de prospecção.
  const [monthSales, openQuotes, paymentConditions, revendaClients] = await Promise.all([
    listAll(base44.entities.Sale, {
      first_status_change_date: { $gte: from, $lt: to },
      stage: { $ne: "Cancelada" },
    }),
    listAll(base44.entities.Sale, {
      stage: "Orçamento",
      status: { $ne: "Cancelada" },
    }),
    base44.entities.PaymentCondition.list(),
    listAll(base44.entities.Client, { client_type: "Revenda" }),
  ]);
  const sales = monthSales.filter((s: any) => s.status !== "Cancelada");

  // Revenda = pedido marcado manualmente como revenda OU cliente cadastrado com Tipo de Cliente = Revenda.
  const revendaClientIds = new Set((revendaClients || []).map((c: any) => c.id).filter(Boolean));
  const isResaleSale = (sale: any) => sale.is_resale === true || revendaClientIds.has(sale.client_id);

  // Condições sem cobrança (Bonificação / Permuta / Brinde) — identificadas pelo cadastro e pelo nome
  const bonusConditionIds = new Set(
    (paymentConditions || [])
      .filter((c: any) => normalizeText(c.payment_type) === "bonificacao")
      .map((c: any) => c.id),
  );
  const isBonusSale = (sale: any) => (sale.payments || []).some((p: any) =>
    (p.condition_id && bonusConditionIds.has(p.condition_id))
    || BONUS_CONDITION_NAMES.includes(normalizeText(p.condition_name)));

  // Índices por venda: OS do técnico, OS pai (flag de reagendamento) e agendamentos da agenda de rotas
  const tosBySale: any = {};
  const ordersBySale: any = {};
  const appointmentsBySale: any = {};
  // Agendamentos sem pedido vinculado (sale_id vazio) — criados direto na Agenda de Rotas
  const orphanAppointmentsByClient: any = {};
  const ids = sales.map((s: any) => s.id).filter(Boolean);
  const clientIds = Array.from(new Set(sales.map((s: any) => s.client_id).filter(Boolean)));

  for (let i = 0; i < ids.length; i += 60) {
    const part = ids.slice(i, i + 60);
    const clientPart = clientIds.slice(i, i + 60);
    const [toses, orders, appointments] = await Promise.all([
      listAll(base44.entities.TechnicianServiceOrder, { sale_id: { $in: part } }),
      listAll(base44.entities.ServiceOrder, { sale_id: { $in: part } }),
      listAll(base44.entities.AgendamentoRota, {
        $or: [{ sale_id: { $in: part } }, { client_id: { $in: clientPart } }],
      }),
    ]);
    toses.forEach((t: any) => { (tosBySale[t.sale_id] = tosBySale[t.sale_id] || []).push(t); });
    orders.forEach((o: any) => { (ordersBySale[o.sale_id] = ordersBySale[o.sale_id] || []).push(o); });
    appointments.forEach((a: any) => {
      if (a.status === "Cancelado") return;
      if (a.sale_id) (appointmentsBySale[a.sale_id] = appointmentsBySale[a.sale_id] || []).push(a);
      else if (a.client_id) (orphanAppointmentsByClient[a.client_id] = orphanAppointmentsByClient[a.client_id] || []).push(a);
    });
  }

  // Atendimentos agendados direto na Agenda de Rotas (sem pedido gravado no agendamento) contam
  // para o pedido do mesmo cliente cuja criação está mais próxima da criação do agendamento — é
  // o pedido que originou aquele atendimento. Cada agendamento é atribuído a um único pedido.
  const salesByClient: any = {};
  sales.forEach((s: any) => { if (s.client_id) (salesByClient[s.client_id] = salesByClient[s.client_id] || []).push(s); });
  const ms = (v: any) => { const t = Date.parse(String(v || "")); return Number.isNaN(t) ? 0 : t; };
  Object.keys(orphanAppointmentsByClient).forEach((clientId) => {
    const candidates = salesByClient[clientId] || [];
    if (!candidates.length) return;
    orphanAppointmentsByClient[clientId].forEach((appt: any) => {
      const apptMs = ms(appt.created_date) || ms(appt.date);
      let owner = candidates[0];
      let best = Infinity;
      candidates.forEach((s: any) => {
        const diff = Math.abs((ms(s.created_date) || ms(s.date)) - apptMs);
        if (diff < best) { best = diff; owner = s; }
      });
      (appointmentsBySale[owner.id] = appointmentsBySale[owner.id] || []).push(appt);
    });
  });

  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows: any[] = [];
  const sellerRows: any = {};
  // Revenda tem faturamento e ranking próprios: entram aqui os pedidos marcados manualmente como
  // revenda (campo is_resale da venda) e os pedidos de clientes cadastrados como Revenda.
  // O ranking de vendedores segue sendo o de venda direta.
  const resaleSellerRows: any = {};
  const losses: any[] = [];
  const bonus: any[] = [];
  let countedCount = 0;
  let countedValue = 0;
  let directCount = 0;
  let directValue = 0;
  let resaleCount = 0;
  let resaleValue = 0;
  let pendingCount = 0;
  let pendingValue = 0;

  for (const sale of sales) {
    const value = sale.grand_total || sale.total || 0;
    const modality = sale.delivery_modality || "";

    // Bonificação / Permuta / Brinde: não entra em nenhum total do faturamento
    // (nem em faturamento, nem em contagem, nem no ranking por vendedor).
    if (isBonusSale(sale)) {
      bonus.push({
        sale_id: sale.id,
        order_number: sale.order_number || "",
        client_name: sale.client_name || "",
        seller_id: sale.seller_id || "",
        seller_name: sale.seller_name || "Sem Vendedor",
        value,
        modality,
        stage: sale.stage || "",
        date: String(sale.date || "").slice(0, 10),
      });
      continue;
    }

    const toses = tosBySale[sale.id] || [];
    const orders = ordersBySale[sale.id] || [];
    const appointments = appointmentsBySale[sale.id] || [];
    const activeAppointments = appointments.filter((a: any) => ACTIVE_APPOINTMENTS.includes(a.status));
    const nextAppointment = activeAppointments
      .map((a: any) => String(a.date || ""))
      .filter((d: string) => d && d >= today)
      .sort()[0] || "";

    let kind = "pending";
    let countReason = "";
    let loss: any = null;
    let tos: any = toses[0] || null;
    const order: any = orders[0] || null;

    if (modality === "Envio") {
      // Aprovação financeira: todas as parcelas pagas e com comprovante anexado
      const payments = sale.payments || [];
      const approved = payments.length > 0
        && payments.every((p: any) => p.payment_status === "Realizada" && p.receipt_url);
      if (approved) {
        kind = "counted";
        countReason = "Aprovação financeira";
      }
    } else {
      const interrupted = toses.filter((t: any) => INTERRUPTED_TOS.includes(t.status));
      const concluded = toses.find((t: any) => CONCLUDED_TOS.includes(t.status));

      if (concluded) {
        kind = "counted";
        countReason = "Atendimento concluído";
        tos = concluded;
      } else if (interrupted.length > 0) {
        const visit = interrupted[0];
        tos = visit;
        const visitDate = String(visit.completed_at || visit.appointment_date || "").slice(0, 10);
        const rescheduled = orders.some((o: any) => o.rescheduled === true)
          || activeAppointments.some((a: any) => !visitDate || String(a.date || "") > visitDate);
        if (rescheduled) {
          kind = "counted";
          countReason = "Reagendado";
        } else {
          kind = "loss";
          loss = {
            status: visit.status || "",
            reason: visit.not_completed_reason || visit.technician_notes || "",
            date: visitDate,
            tos_code: visit.code || "",
            os_code: (order && order.code) || visit.parent_os_code || "",
          };
        }
      } else if (activeAppointments.length > 0) {
        kind = "counted";
        countReason = "Cliente agendado";
      }
    }

    const row = {
      sale_id: sale.id,
      order_number: sale.order_number || "",
      client_id: sale.client_id || "",
      client_name: sale.client_name || "",
      seller_id: sale.seller_id || "",
      seller_name: sale.seller_name || "Sem Vendedor",
      value,
      modality,
      stage: sale.stage || "",
      sale_status: sale.status || "",
      is_resale: isResaleSale(sale),
      date: sale.date || "",
      first_status_change_date: sale.first_status_change_date || "",
      kind,
      count_reason: countReason,
      os_code: (order && order.code) || (loss ? loss.os_code : "") || "",
      os_status: (order && order.status) || "",
      tos_code: (tos && tos.code) || "",
      tos_status: (tos && tos.status) || "",
      appointment_date: nextAppointment || (activeAppointments[0] ? String(activeAppointments[0].date || "") : ""),
      reason: (loss && loss.reason) || "",
      visit_date: (loss && loss.date) || "",
    };
    rows.push(row);

    if (kind === "counted") {
      countedCount += 1;
      countedValue += value;
      const sellerId = row.seller_id;
      const bucket = row.is_resale ? resaleSellerRows : sellerRows;
      if (!bucket[sellerId]) {
        bucket[sellerId] = {
          seller_id: sellerId,
          seller_name: row.seller_name,
          count: 0,
          revenue: 0,
        };
      }
      bucket[sellerId].count += 1;
      bucket[sellerId].revenue += value;
      if (row.is_resale) {
        resaleCount += 1;
        resaleValue += value;
      } else {
        directCount += 1;
        directValue += value;
      }
    } else if (kind === "loss") {
      losses.push({
        sale_id: row.sale_id,
        order_number: row.order_number,
        client_name: row.client_name,
        seller_name: row.seller_name,
        value,
        modality,
        status: loss.status,
        reason: loss.reason,
        date: loss.date,
        tos_code: loss.tos_code,
        os_code: loss.os_code,
      });
    } else {
      pendingCount += 1;
      pendingValue += value;
    }
  }

  losses.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  rows.sort((a, b) => b.value - a.value);

  const todayMs = Date.parse(`${today}T12:00:00Z`);
  const quotes = openQuotes
    .filter((s: any) => s.status !== "Cancelada" && !isBonusSale(s))
    .map((s: any) => {
      const date = String(s.date || "").slice(0, 10);
      const daysOpen = date && !Number.isNaN(todayMs)
        ? Math.max(0, Math.round((todayMs - Date.parse(`${date}T12:00:00Z`)) / 86400000))
        : null;
      return {
        sale_id: s.id,
        order_number: s.order_number || "",
        client_id: s.client_id || "",
        client_name: s.client_name || "",
        seller_id: s.seller_id || "",
        seller_name: s.seller_name || "Sem Vendedor",
        value: s.grand_total || s.total || 0,
        modality: s.delivery_modality || "",
        stage: s.stage || "Orçamento",
        date,
        first_status_change_date: s.first_status_change_date || "",
        returned: !!s.first_status_change_date,
        days_open: daysOpen,
        kind: "quote",
      };
    })
    .sort((a: any, b: any) => b.value - a.value);

  return {
    bonus: {
      count: bonus.length,
      value: bonus.reduce((sum: number, b: any) => sum + (b.value || 0), 0),
      items: bonus.sort((a: any, b: any) => b.value - a.value),
    },
    quotes: {
      count: quotes.length,
      value: quotes.reduce((sum: number, q: any) => sum + (q.value || 0), 0),
      items: quotes,
    },
    month,
    counted: {
      count: countedCount,
      revenue: countedValue,
      ticket: countedCount > 0 ? countedValue / countedCount : 0,
    },
    direct: {
      count: directCount,
      revenue: directValue,
      ticket: directCount > 0 ? directValue / directCount : 0,
    },
    resale: {
      count: resaleCount,
      revenue: resaleValue,
      ticket: resaleCount > 0 ? resaleValue / resaleCount : 0,
    },
    pending: { count: pendingCount, value: pendingValue },
    sellers: Object.values(sellerRows).sort((a: any, b: any) => b.revenue - a.revenue),
    resale_sellers: Object.values(resaleSellerRows).sort((a: any, b: any) => b.revenue - a.revenue),
    losses: {
      count: losses.length,
      value: losses.reduce((sum, l) => sum + l.value, 0),
      items: losses,
    },
    rows,
  };
}
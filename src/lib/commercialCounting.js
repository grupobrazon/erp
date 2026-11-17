/**
 * Espelho, no front, das regras de contagem do Dashboard Comercial
 * (o backend usa o mesmo critério em base44/shared/commercialDashboard.ts).
 *
 * Usado pelo Relatório de Vendas para marcar, venda a venda:
 *  · se ela está computando o dashboard daquele mês (estrela) e de qual mês é a meta;
 *  · e, quando não está computando, o motivo — para o vendedor entender a diferença.
 *
 * Regras:
 *  · Envio → só conta com aprovação financeira (todas as parcelas "Realizada" e com comprovante)
 *  · Entrega Própria / Entrega + Instalação / Manutenção → conta quando a OS do Técnico está
 *    concluída, quando o cliente tem agendamento ativo, ou quando um atendimento interrompido
 *    foi reagendado
 *  · Atendimento agendado direto na Agenda de Rotas (sem o pedido gravado no agendamento) conta
 *    para o pedido do mesmo cliente criado no mesmo momento (ver buildAppointmentsBySale)
 *  · Técnico não concluiu e não há reagendamento → Perda de Oportunidade (não conta)
 *  · Bonificação / Permuta / Brinde e vendas canceladas → não entram em nenhum total
 *  · Mês de competência = 1ª mudança de status (saída de Orçamento), não a data da venda
 */

export const CONCLUDED_TOS = ["Concluída Técnico", "Aguardando Faturamento - Pós", "Finalizada"];
export const INTERRUPTED_TOS = ["Atendimento Interrompido", "Atendido Parcialmente"];
export const ACTIVE_APPOINTMENTS = ["Agendado", "Confirmado"];

const BONUS_CONDITION_NAMES = ["bonificacao", "brinde", "permuta"];
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Mês corrente (fuso de Brasília) no formato YYYY-MM. */
export function currentMonthKey() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export function monthKeyOf(dateish) {
  const value = String(dateish || "");
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : "";
}

export function monthLabel(key) {
  if (!/^\d{4}-\d{2}$/.test(String(key || ""))) return "";
  const [year, month] = key.split("-");
  return `${MONTH_SHORT[Number(month) - 1]}/${year}`;
}

/** "mês atual" / "mês anterior" quando o mês de competência é um desses; senão, vazio. */
export function monthRelationLabel(key) {
  const current = currentMonthKey();
  if (!key || !current) return "";
  if (key === current) return "mês atual";
  const [year, month] = current.split("-").map(Number);
  const previous = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  return key === previous ? "mês anterior" : "";
}

/** Texto da coluna de dashboard: "Out/2026 (mês atual)" ou vazio quando não computa. */
export function dashLabel(evaluation) {
  if (!evaluation?.counted || !evaluation.month) return "";
  const relation = monthRelationLabel(evaluation.month);
  return `${monthLabel(evaluation.month)}${relation ? ` (${relation})` : ""}`;
}

function parseMs(value) {
  const t = Date.parse(String(value || ""));
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Indexa os agendamentos da Agenda de Rotas por venda.
 * Atendimentos agendados direto na agenda ficam sem o pedido gravado (sale_id vazio): eles são
 * atribuídos ao pedido do mesmo cliente cuja criação está mais próxima da criação do agendamento
 * (é o pedido que originou aquele atendimento), sempre a um único pedido por agendamento.
 * As vendas recebidas devem ser as do mesmo escopo do dashboard (o mês avaliado).
 */
export function buildAppointmentsBySale(appointments = [], sales = []) {
  const bySale = {};
  const orphansByClient = {};
  for (const a of appointments) {
    if (a.status === "Cancelado") continue;
    if (a.sale_id) (bySale[a.sale_id] = bySale[a.sale_id] || []).push(a);
    else if (a.client_id) (orphansByClient[a.client_id] = orphansByClient[a.client_id] || []).push(a);
  }
  const salesByClient = {};
  for (const s of sales) {
    if (s.client_id) (salesByClient[s.client_id] = salesByClient[s.client_id] || []).push(s);
  }
  for (const clientId of Object.keys(orphansByClient)) {
    const candidates = salesByClient[clientId] || [];
    if (candidates.length === 0) continue;
    for (const appt of orphansByClient[clientId]) {
      const apptMs = parseMs(appt.created_date) || parseMs(appt.date);
      let owner = candidates[0];
      let best = Infinity;
      for (const s of candidates) {
        const diff = Math.abs((parseMs(s.created_date) || parseMs(s.date)) - apptMs);
        if (diff < best) { best = diff; owner = s; }
      }
      (bySale[owner.id] = bySale[owner.id] || []).push(appt);
    }
  }
  return bySale;
}

function fmtDate(dateish) {
  const value = String(dateish || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isBonusSale(sale, bonusConditionIds) {
  return (sale.payments || []).some((p) =>
    (p.condition_id && bonusConditionIds.has(p.condition_id)) ||
    BONUS_CONDITION_NAMES.includes(normalizeText(p.condition_name))
  );
}

/**
 * Avalia uma venda com o mesmo critério do dashboard.
 * @returns {{ counted: boolean, month: string, note: string }}
 */
export function evaluateSaleDash(sale, context) {
  const { tosesBySale = {}, ordersBySale = {}, appointmentsBySale = {}, bonusConditionIds = new Set() } = context || {};
  const month = monthKeyOf(sale.first_status_change_date);

  if (sale.status === "Cancelada" || sale.stage === "Cancelada") {
    return { counted: false, month, note: "Venda cancelada — não entra no faturamento nem no ranking do dashboard." };
  }

  if (isBonusSale(sale, bonusConditionIds)) {
    return {
      counted: false,
      month,
      note: "Condição sem cobrança (Bonificação, Permuta ou Brinde) — o dashboard não soma esse pedido no faturamento nem no ranking.",
    };
  }

  if (!month) {
    return {
      counted: false,
      month: "",
      note: "Ainda em Orçamento: nunca saiu dessa etapa, então ainda não tem mês de competência no dashboard (aparece na carteira de orçamentos em aberto).",
    };
  }

  if (sale.delivery_modality === "Envio") {
    const payments = sale.payments || [];
    const approved = payments.length > 0 && payments.every((p) => p.payment_status === "Realizada" && p.receipt_url);
    if (approved) return { counted: true, month, note: "" };

    let detail = "nenhuma parcela lançada";
    if (payments.length > 0) {
      const pending = payments.filter((p) => p.payment_status !== "Realizada").length;
      const noReceipt = payments.filter((p) => !p.receipt_url).length;
      const parts = [];
      if (pending > 0) parts.push(`${pending} parcela(s) com pagamento pendente`);
      if (noReceipt > 0) parts.push(`${noReceipt} parcela(s) sem comprovante anexado`);
      detail = parts.join(" e ") || "parcelas incompletas";
    }
    return {
      counted: false,
      month,
      note: `Envio aguardando aprovação financeira (${detail}). O dashboard só computa pedidos de envio com todas as parcelas recebidas e comprovante anexado.`,
    };
  }

  const toses = tosesBySale[sale.id] || [];
  const orders = ordersBySale[sale.id] || [];
  const appointments = appointmentsBySale[sale.id] || [];
  const activeAppointments = appointments.filter((a) => ACTIVE_APPOINTMENTS.includes(a.status));

  const concluded = toses.find((t) => CONCLUDED_TOS.includes(t.status));
  if (concluded) return { counted: true, month, note: "" };

  const interrupted = toses.filter((t) => INTERRUPTED_TOS.includes(t.status));
  if (interrupted.length > 0) {
    const visit = interrupted[0];
    const visitDate = String(visit.completed_at || visit.appointment_date || "").slice(0, 10);
    const rescheduled =
      orders.some((o) => o.rescheduled === true) ||
      activeAppointments.some((a) => !visitDate || String(a.date || "") > visitDate);
    if (rescheduled) return { counted: true, month, note: "" };

    const reason = visit.not_completed_reason || visit.technician_notes || "";
    return {
      counted: false,
      month,
      note: `Perda de Oportunidade: o técnico não concluiu o atendimento (${visit.status}${visitDate ? ` em ${fmtDate(visitDate)}` : ""}).${reason ? ` Motivo: ${reason}.` : ""} Volta a computar quando a OS for reagendada.`,
    };
  }

  if (activeAppointments.length > 0) return { counted: true, month, note: "" };

  return {
    counted: false,
    month,
    note: "Atendimento ainda não concluído: não há OS do técnico concluída nem agendamento ativo na Agenda de Rotas para este pedido.",
  };
}
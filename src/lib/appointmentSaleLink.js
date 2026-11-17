import { base44 } from "@/api/base44Client";

/**
 * Vínculo do agendamento com o pedido (e com a OS).
 *
 * Regra do sistema: todo agendamento da Agenda de Rotas precisa saber a qual
 * número de pedido ele pertence e qual OS o representa — não importa em qual
 * tela ele foi criado (venda, detalhe da OS ou a própria agenda).
 *
 * A ordem de resolução é sempre do vínculo mais forte para o mais fraco:
 *  1. OS informada → o pedido é o que está gravado na própria OS;
 *  2. pedido informado → completa o número do pedido e localiza a OS dele;
 *  3. sem OS e sem pedido → procura o pedido em aberto do cliente.
 */
const CLOSED_STAGES = ["Cancelada", "Concluída"];

export async function resolveAppointmentLinks({ clientId, saleId, saleOrderNumber, osId, osCode } = {}) {
  const links = {
    sale_id: saleId || "",
    sale_order_number: saleOrderNumber || "",
    os_id: osId || "",
    os_code: osCode || "",
  };

  // 1. Veio de uma OS: a OS carrega o pedido dela
  if (links.os_id && !links.sale_id) {
    try {
      const os = await base44.entities.ServiceOrder.get(links.os_id);
      if (os?.sale_id) {
        links.sale_id = os.sale_id;
        links.sale_order_number = os.sale_order_number || "";
      }
    } catch (e) { /* mantém o que já existe */ }
  }

  // 2. Sem OS e sem pedido: o pedido em aberto do cliente é o atendimento agendado.
  // (Quando já existe uma OS sem venda — OS de Manutenção avulsa — não se inventa pedido.)
  if (!links.sale_id && !links.os_id && clientId) {
    try {
      const sales = await base44.entities.Sale.filter({ client_id: clientId }, "-created_date", 20);
      const sale = (sales || []).find(s => !CLOSED_STAGES.includes(s.stage));
      if (sale) {
        links.sale_id = sale.id;
        links.sale_order_number = sale.order_number || "";
      }
    } catch (e) { /* sem pedido em aberto */ }
  }

  // 3. Com o pedido em mãos: completa o número e localiza a OS do pedido
  if (links.sale_id) {
    if (!links.sale_order_number) {
      try {
        const sale = await base44.entities.Sale.get(links.sale_id);
        links.sale_order_number = sale?.order_number || "";
      } catch (e) { /* mantém vazio */ }
    }
    if (!links.os_id) {
      try {
        const orders = await base44.entities.ServiceOrder.filter({ sale_id: links.sale_id }, "created_date", 50);
        const list = orders || [];
        // A OS que representa o pedido é a operacional (a de Manutenção é filha dela)
        const os = list.find(o => o.type !== "Manutenção" && o.status !== "Cancelada") ||
          list.find(o => o.status !== "Cancelada");
        if (os) {
          links.os_id = os.id;
          links.os_code = os.code || "";
        }
      } catch (e) { /* OS ainda não gerada */ }
    }
  }

  return links;
}

/**
 * Localiza o cliente do agendamento quando ele foi digitado à mão na agenda
 * (nome exato ou telefone). Usado para o agendamento também achar o pedido
 * quando ele não veio de uma tela de venda/OS.
 */
export async function findClientForAppointment({ name, phone } = {}) {
  const cleanName = (name || "").trim();
  const digits = (phone || "").replace(/\D/g, "");

  if (cleanName.length > 3) {
    try {
      const clients = await base44.entities.Client.filter({ name: cleanName }, "-created_date", 5);
      const exact = (clients || []).find(c => (c.name || "").trim().toLowerCase() === cleanName.toLowerCase());
      if (exact) return exact;
    } catch (e) { /* segue para o telefone */ }
  }

  if (digits.length >= 8) {
    const variations = [digits, digits.slice(-11), digits.slice(-10)].filter(v => v.length >= 8);
    const queries = variations.flatMap(v => ([
      { phone1: { $regex: v } }, { phone2: { $regex: v } }, { phone3: { $regex: v } },
    ]));
    try {
      const clients = await base44.entities.Client.filter({ $or: queries }, "-created_date", 5);
      if (clients && clients.length > 0) return clients[0];
    } catch (e) { /* cliente não encontrado */ }
  }

  return null;
}
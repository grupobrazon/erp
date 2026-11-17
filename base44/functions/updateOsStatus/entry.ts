import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sanitizeDateFields, appendStatusHistory, lastStatusMovement } from "../../shared/osStatusHistory.ts";
import { cascadeSaleStageFromOs } from "../../shared/saleStageCascade.ts";

// Atualização de OS com validação de concorrência:
// - Recusa (STATUS_CHANGED) quando o status atual não é mais o esperado pela ação
//   (evita que uma tela desatualizada de um setor sobrescreva a etapa definida por outro).
// - Recusa (NOT_FOUND) quando a OS foi excluída/regenerada por outro fluxo.
// - Registra auditoria (status_history) em toda mudança de status: quem, quando,
//   tela/setor de origem, status anterior e novo.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, code: "UNAUTHORIZED", message: "Sessão expirada — entre novamente." });
    }

    const body = await req.json();
    const osId = body && body.os_id ? String(body.os_id) : "";
    const updates = body && body.updates ? body.updates : null;
    const expectedStatus = body && body.expected_status ? String(body.expected_status) : "";
    const source = body && body.source ? String(body.source) : "";
    const notes = body && body.notes ? String(body.notes) : "";

    if (!osId || !updates || typeof updates !== "object" || Array.isArray(updates)) {
      return Response.json({ success: false, code: "BAD_REQUEST", message: "Parâmetros inválidos para atualização da OS." });
    }

    let os = null;
    try {
      os = await base44.entities.ServiceOrder.get(osId);
    } catch {
      os = null;
    }
    if (!os) {
      return Response.json({ success: false, code: "NOT_FOUND", message: "OS não encontrada — o registro foi atualizado ou excluído por outro fluxo." });
    }

    // Concorrência entre setores: a OS precisa estar exatamente na etapa que a tela
    // exibia no momento do clique. Se outro setor já avançou, recusa sem sobrescrever.
    if (expectedStatus && os.status !== expectedStatus) {
      return Response.json({
        success: false,
        code: "STATUS_CHANGED",
        os_code: os.code || "",
        current_status: os.status,
        last_movement: lastStatusMovement(os),
        message: "A OS não está mais na etapa esperada para esta ação.",
      });
    }

    const cleanUpdates = sanitizeDateFields(updates);
    const history = appendStatusHistory(os, cleanUpdates, {
      actor: user.full_name || user.display_name || user.email || "",
      source: source,
      notes: notes,
    });
    const payload = { ...cleanUpdates };
    if (history) payload.status_history = history;

    const updated = await base44.entities.ServiceOrder.update(os.id, payload);

    // Cascata: quando a OS chega em "Entregue" ou "Concluída", a venda vinculada
    // também avança (Entregue → Faturada/Concluída; Concluída → Concluída).
    try {
      await cascadeSaleStageFromOs(base44, updated);
    } catch {
      // Não bloqueia a atualização da OS se a venda falhar
    }

    // Sincroniza a OS do Técnico vinculada: quando a OS é faturada ("Faturada"),
    // a TOS vinculada vai para "Finalizada" (faturamento concluído pelo financeiro).
    if (cleanUpdates.status === "Faturada") {
      try {
        const tosList = await base44.entities.TechnicianServiceOrder.filter(
          { parent_os_id: os.id },
          "-created_date",
          5
        );
        for (const tos of tosList) {
          if (tos.status !== "Finalizada" && tos.status !== "Cancelada") {
            await base44.entities.TechnicianServiceOrder.update(tos.id, {
              status: "Finalizada",
            });
          }
        }
      } catch {
        // Não bloqueia a atualização da OS se a TOS falhar
      }
    }

    return Response.json({
      success: true,
      os_code: updated.code || os.code || "",
      status: updated.status,
      status_changed: !!history,
    });
  } catch (error) {
    return Response.json({ success: false, code: "ERROR", message: "Não foi possível atualizar a OS agora. Tente novamente." });
  }
}
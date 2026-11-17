import { base44 } from "@/api/base44Client";

// Atualização de status da OS com validação de concorrência no backend.
// Nunca lança erro — sempre retorna { success, code, ... } com mensagens em português.

const NETWORK_FALLBACK = {
  success: false,
  code: "NETWORK",
  message: "Falha de comunicação com o servidor. Tente novamente.",
};

export async function updateOsStatus({ osId, updates, expectedStatus, source }) {
  let res;
  try {
    res = await base44.functions.invoke("updateOsStatus", {
      os_id: osId,
      updates: updates || {},
      expected_status: expectedStatus || null,
      source: source || "",
    });
  } catch {
    return { ...NETWORK_FALLBACK };
  }
  const data = res && typeof res === "object" ? res.data || res : null;
  if (!data || typeof data !== "object" || typeof data.success !== "boolean") {
    return { ...NETWORK_FALLBACK };
  }
  return data;
}

const fmtDateTime = (d) => {
  if (!d) return "";
  const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Mensagem completa de recusa para a usuária (com código da OS e motivo)
export function refusalMessage(result, osCode) {
  const code = osCode || (result && result.os_code) || "";
  const label = code ? `A ${code}` : "A OS";
  if (!result) return NETWORK_FALLBACK.message;
  if (result.code === "NOT_FOUND") {
    return `${label} não está mais disponível. O registro foi atualizado por outro fluxo e a lista foi sincronizada.`;
  }
  if (result.code === "STATUS_CHANGED") {
    const mov = result.last_movement;
    const who = mov && mov.actor ? ` por ${mov.actor} em ${fmtDateTime(mov.date)}` : "";
    return `${label} não pôde ser atualizada: a OS foi movimentada${who} e atualmente está na etapa "${result.current_status}". A operação foi cancelada para não sobrescrever a etapa definida pelo outro setor, e a lista foi sincronizada.`;
  }
  if (result.code === "UNAUTHORIZED") {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  return result.message || NETWORK_FALLBACK.message;
}

// Motivo curto para relatórios de ação em lote
export function refusalShortReason(result) {
  if (!result) return "falha ao atualizar";
  if (result.code === "NOT_FOUND") return "OS não está mais disponível";
  if (result.code === "STATUS_CHANGED") return `já avançou para "${result.current_status}"`;
  return "falha ao atualizar";
}
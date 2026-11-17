// Helpers compartilhados de atualização de status da ServiceOrder:
// sanitização de datas e trilha de auditoria (status_history).
// Usados por updateOsStatus e confirmExpeditionStep.

// Campos *_date com string vazia viram null (a entidade espera date ou null, nunca "")
export function sanitizeDateFields(updates) {
  const clean = {};
  for (const key of Object.keys(updates || {})) {
    const value = updates[key];
    clean[key] = key.endsWith("_date") && value === "" ? null : value;
  }
  return clean;
}

// Constrói a nova trilha de status_history quando houver mudança real de status.
// Retorna null quando o update não altera o status.
export function appendStatusHistory(os, updates, meta) {
  const newStatus = updates && updates.status;
  if (!newStatus || newStatus === os.status) return null;
  const history = Array.isArray(os && os.status_history) ? [...os.status_history] : [];
  history.push({
    date: new Date().toISOString(),
    actor: (meta && meta.actor) || "",
    source: (meta && meta.source) || "",
    ...((meta && meta.notes) ? { notes: meta.notes } : {}),
    previous_status: os.status,
    new_status: newStatus,
  });
  return history;
}

// Última movimentação registrada (ou null para registros antigos sem histórico)
export function lastStatusMovement(os) {
  const history = Array.isArray(os && os.status_history) ? os.status_history : [];
  return history.length > 0 ? history[history.length - 1] : null;
}
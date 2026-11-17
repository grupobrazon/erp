const MAINTENANCE_KEYWORDS = ["filtro", "purificador", "cápsula", "capsula", "bebedouro"];

export function requiresMaintenance(groupName = "") {
  const g = (groupName || "").toLowerCase();
  return MAINTENANCE_KEYWORDS.some(k => g.includes(k));
}

export function isMaintenanceMissing(product) {
  if (!product) return false;
  if (!requiresMaintenance(product.group_name)) return false;
  if (!product.maintenance_role || product.maintenance_role === "Nenhum") return true;
  const interval = product.maintenance_type === "Litros" ? product.maintenance_interval_liters : product.maintenance_interval_months;
  return !interval || interval <= 0;
}

// Status de manutenção de um equipamento baseado na próxima troca.
// today deve ser um Date com horas zeradas (00:00:00).
export function getMaintenanceStatus(equip, today) {
  if (!equip || !equip.next_maintenance_date) return { label: "Sem data", days: null };
  const next = new Date(equip.next_maintenance_date + "T00:00:00");
  const diffDays = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "Atrasada", days: diffDays };
  if (diffDays <= 30) return { label: "Próxima", days: diffDays };
  return { label: "Em dia", days: diffDays };
}

// Status consolidado do cliente considerando todos os seus equipamentos ativos.
// Prioridade: Atrasado > Vai Vencer > Em Dia > Sem Equipamento.
export function getClientMaintenanceLabel(equipments, today) {
  if (!equipments || equipments.length === 0) return "Sem Equipamento";
  let hasOverdue = false, hasUpcoming = false, hasOnTime = false;
  for (const e of equipments) {
    const s = getMaintenanceStatus(e, today);
    if (s.label === "Atrasada") hasOverdue = true;
    else if (s.label === "Próxima") hasUpcoming = true;
    else if (s.label === "Em dia") hasOnTime = true;
  }
  if (hasOverdue) return "Atrasado";
  if (hasUpcoming) return "Vai Vencer";
  if (hasOnTime) return "Em Dia";
  return "Sem Equipamento";
}
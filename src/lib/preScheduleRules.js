/**
 * Regras de pré-agendamento — controlam quais opções de horário estão disponíveis
 * e quantos slots de capacidade cada atendimento consome.
 *
 * O tipo de pré-agendamento define a disponibilidade do cliente para a rota:
 * - Normal: cliente pode ser atendido em qualquer horário do período selecionado
 * - Dia Inteiro: cliente precisa da agenda fechada o dia todo (1 técnico = 1 cliente)
 * - Meio Período: cliente bloqueia metade do dia (manhã OU tarde)
 * - 2 Horários: cliente precisa de 2 horários no período
 * - 3 Horários: cliente precisa de 3 horários no período
 */

/**
 * Retorna as opções de time_type disponíveis com base no pre_schedule_type
 * e no period_mode do calendário.
 *
 * @param {string} preScheduleType - Normal | Dia Inteiro | Meio Período | 2 Horários | 3 Horários
 * @param {string} periodMode - Dia Inteiro | Periodos (modo do calendário)
 * @returns {string[]} lista de time_type disponíveis (vazio = sem seleção, é implícito)
 */
export function getAvailableTimeTypes(preScheduleType, periodMode = "Dia Inteiro") {
  switch (preScheduleType) {
    case "Normal":
      if (periodMode === "Dia Inteiro") return ["Dia Inteiro"];
      return ["Horário Específico", "Manhã", "Tarde", "Dia Inteiro"];
    case "Dia Inteiro":
      return []; // implícito — não precisa selecionar
    case "Meio Período":
    case "2 Horários":
    case "3 Horários":
      return ["Manhã", "Tarde"];
    default:
      return ["Horário Específico", "Manhã", "Tarde", "Dia Inteiro"];
  }
}

/**
 * Retorna o time_type padrão ao trocar o pre_schedule_type.
 * Mantém o time_type atual se ainda for válido; senão usa o primeiro disponível.
 */
export function getDefaultTimeType(preScheduleType, currentTimeType, periodMode = "Dia Inteiro") {
  const available = getAvailableTimeTypes(preScheduleType, periodMode);
  if (available.length === 0) return "Dia Inteiro";
  if (available.includes(currentTimeType)) return currentTimeType;
  return available[0];
}
// Subtrai N dias úteis de uma data (pula finais de semana).
// dateStr: "YYYY-MM-DD" → "YYYY-MM-DD"
export const subtractBusinessDays = (dateStr, days) => {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T00:00:00");
  let count = 0;
  while (count < days) {
    date.setDate(date.getDate() - 1);
    const day = date.getDay(); // 0 = domingo, 6 = sábado
    if (day !== 0 && day !== 6) count++;
  }
  return date.toISOString().slice(0, 10);
};
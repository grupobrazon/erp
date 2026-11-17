// Converte cron em texto legível + preview de próximas execuções

const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Converte uma expressão cron (5 campos) em texto legível em PT-BR.
// Suporta asterisco, step (barra N), listas, intervalos e valores fixos.
export function cronToText(expr) {
  if (!expr || typeof expr !== "string") return "";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Expressão inválida (use 5 campos)";

  const [min, hour, dom, month, dow] = parts;

  if (expr === "* * * * *") return "A cada minuto";
  if (expr === "0 * * * *") return "A cada hora (no minuto 0)";
  if (expr === "0 0 * * *") return "Diariamente à meia-noite";
  if (expr === "0 12 * * *") return "Diariamente ao meio-dia";
  if (expr === "0 0 * * 1") return "Toda segunda-feira à meia-noite";
  if (expr === "0 9 * * 1-5") return "Dias úteis às 09:00";
  if (expr === "0 0 1 * *") return "No dia 1 de cada mês à meia-noite";

  const descParts = [];
  descParts.push(describeField(min, "minuto", "minutos"));
  descParts.push(describeField(hour, "hora", "horas"));
  if (dom !== "*") descParts.push(`no dia ${describeValue(dom)}`);
  if (month !== "*") descParts.push(`de ${describeMonth(month)}`);
  if (dow !== "*") descParts.push(`de ${describeDow(dow)}`);

  return descParts.join(", ");
}

function describeField(val, singular, plural) {
  if (val === "*") return `a cada ${plural}`;
  if (val.startsWith("*/")) return `a cada ${val.slice(2)} ${plural}`;
  if (val.includes(",")) return `nos ${plural} ${val}`;
  if (val.includes("-")) return `entre os ${plural} ${val}`;
  return `no ${singular} ${val}`;
}

function describeValue(val) {
  return val;
}

function describeMonth(val) {
  if (val.includes(",")) {
    return val.split(",").map((m) => MONTH_NAMES[parseInt(m) - 1] || m).join(", ");
  }
  if (val.includes("-")) {
    const [a, b] = val.split("-").map((n) => parseInt(n));
    return `${MONTH_NAMES[a - 1]} a ${MONTH_NAMES[b - 1]}`;
  }
  return MONTH_NAMES[parseInt(val) - 1] || val;
}

function describeDow(val) {
  const map = (n) => DAY_NAMES[parseInt(n)] || val;
  if (val.includes(",")) return val.split(",").map(map).join(", ");
  if (val.includes("-")) {
    const [a, b] = val.split("-").map((n) => parseInt(n));
    return `${DAY_NAMES[a]} a ${DAY_NAMES[b]}`;
  }
  return map(val);
}

// Calcula as próximas N execuções de uma expressão cron.
export function nextCronRuns(expr, count = 3, from = new Date()) {
  if (!expr || typeof expr !== "string") return [];
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return [];
  const [min, hour, dom, month, dow] = parts;

  const runs = [];
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  let safety = 0;
  while (runs.length < count && safety < 60000) {
    safety++;
    if (matchesField(cursor.getMinutes(), min) &&
        matchesField(cursor.getHours(), hour) &&
        matchesField(cursor.getDate(), dom) &&
        matchesField(cursor.getMonth() + 1, month) &&
        matchesField(cursor.getDay(), dow)) {
      runs.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return runs;
}

function matchesField(value, expr) {
  if (expr === "*") return true;
  if (expr.startsWith("*/")) return value % parseInt(expr.slice(2)) === 0;
  if (expr.includes(",")) return expr.split(",").map((n) => parseInt(n)).includes(value);
  if (expr.includes("-")) {
    const [a, b] = expr.split("-").map((n) => parseInt(n));
    return value >= a && value <= b;
  }
  return parseInt(expr) === value;
}

export function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
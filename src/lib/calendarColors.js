// Mapa de cores dos calendários — todas as classes Tailwind como literais
// para o purge do Tailwind detectá-las. A cor vem do banco (entity), mas
// as classes são selecionadas deste mapa estático.

export const CALENDAR_COLORS = [
  { value: "blue", label: "Azul" },
  { value: "green", label: "Verde" },
  { value: "amber", label: "Âmbar" },
  { value: "purple", label: "Roxo" },
  { value: "rose", label: "Rosa" },
  { value: "cyan", label: "Ciano" },
  { value: "orange", label: "Laranja" },
  { value: "indigo", label: "Índigo" },
];

export const colorClasses = {
  blue: {
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    block: "bg-blue-500 text-white border-blue-600",
    blockLight: "bg-blue-50 text-blue-800 border-l-4 border-blue-500",
    chip: "bg-blue-500",
    ring: "ring-blue-500",
    text: "text-blue-600",
    hover: "hover:bg-blue-50",
  },
  green: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    block: "bg-emerald-500 text-white border-emerald-600",
    blockLight: "bg-emerald-50 text-emerald-800 border-l-4 border-emerald-500",
    chip: "bg-emerald-500",
    ring: "ring-emerald-500",
    text: "text-emerald-600",
    hover: "hover:bg-emerald-50",
  },
  amber: {
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    block: "bg-amber-500 text-white border-amber-600",
    blockLight: "bg-amber-50 text-amber-800 border-l-4 border-amber-500",
    chip: "bg-amber-500",
    ring: "ring-amber-500",
    text: "text-amber-600",
    hover: "hover:bg-amber-50",
  },
  purple: {
    dot: "bg-purple-500",
    badge: "bg-purple-100 text-purple-800 border-purple-300",
    block: "bg-purple-500 text-white border-purple-600",
    blockLight: "bg-purple-50 text-purple-800 border-l-4 border-purple-500",
    chip: "bg-purple-500",
    ring: "ring-purple-500",
    text: "text-purple-600",
    hover: "hover:bg-purple-50",
  },
  rose: {
    dot: "bg-rose-500",
    badge: "bg-rose-100 text-rose-800 border-rose-300",
    block: "bg-rose-500 text-white border-rose-600",
    blockLight: "bg-rose-50 text-rose-800 border-l-4 border-rose-500",
    chip: "bg-rose-500",
    ring: "ring-rose-500",
    text: "text-rose-600",
    hover: "hover:bg-rose-50",
  },
  cyan: {
    dot: "bg-cyan-500",
    badge: "bg-cyan-100 text-cyan-800 border-cyan-300",
    block: "bg-cyan-500 text-white border-cyan-600",
    blockLight: "bg-cyan-50 text-cyan-800 border-l-4 border-cyan-500",
    chip: "bg-cyan-500",
    ring: "ring-cyan-500",
    text: "text-cyan-600",
    hover: "hover:bg-cyan-50",
  },
  orange: {
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-800 border-orange-300",
    block: "bg-orange-500 text-white border-orange-600",
    blockLight: "bg-orange-50 text-orange-800 border-l-4 border-orange-500",
    chip: "bg-orange-500",
    ring: "ring-orange-500",
    text: "text-orange-600",
    hover: "hover:bg-orange-50",
  },
  indigo: {
    dot: "bg-indigo-500",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-300",
    block: "bg-indigo-500 text-white border-indigo-600",
    blockLight: "bg-indigo-50 text-indigo-800 border-l-4 border-indigo-500",
    chip: "bg-indigo-500",
    ring: "ring-indigo-500",
    text: "text-indigo-600",
    hover: "hover:bg-indigo-50",
  },
};

export function getColorClasses(color) {
  return colorClasses[color] || colorClasses.blue;
}

// Períodos do dia para posicionamento no calendário
export const TIME_SLOTS = {
  "Manhã": { start: 8, end: 12, label: "Manhã (08h-12h)" },
  "Tarde": { start: 13, end: 18, label: "Tarde (13h-18h)" },
  "Dia Inteiro": { start: 8, end: 18, label: "Dia Inteiro (08h-18h)" },
};

export const WORK_HOURS = { start: 8, end: 18 };
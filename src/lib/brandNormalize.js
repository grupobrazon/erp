// Normaliza marcas de purificador para agrupar variações que representam o mesmo fabricante.
// Hoje: "ICE", "ICEZON" e combinações ("ICE / ICEZON", "ICE BARRA ICEZON") -> "ICE/ICEZON".
export function normalizeBrand(raw) {
  const b = (raw || "").trim();
  if (!b) return "Sem marca";
  const up = b.toUpperCase();
  if (up === "ICE" || up === "ICEZON" || up.includes("ICEZON")) return "ICE/ICEZON";
  return b;
}
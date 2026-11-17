import { CheckCircle2, XCircle, Clock } from "lucide-react";

// Status fiscal consolidado das notas (NF-e de venda, NF-e de remessa e Nota Simples)
export const statusConfig = {
  autorizado: { label: "Autorizada", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  processando: { label: "Processando", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Clock },
  erro: { label: "Rejeitada", color: "bg-red-100 text-red-700 border-red-300", icon: XCircle },
  cancelado: { label: "Cancelada", color: "bg-zinc-200 text-zinc-600 border-zinc-300", icon: XCircle },
};

export function getNotaStatus(record) {
  if (record.nfe_cancelled) return "cancelado";
  if (record.nfe_status) {
    const s = record.nfe_status.toLowerCase();
    if (s.includes("autoriz") || s.includes("aprov")) return "autorizado";
    if (s.includes("process") || s.includes("pend")) return "processando";
    if (s.includes("erro") || s.includes("rejeit")) return "erro";
    if (s.includes("cancel")) return "cancelado";
  }
  if (record.invoiced || record.invoice_number) return "autorizado";
  return "processando";
}
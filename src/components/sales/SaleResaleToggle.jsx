import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Store } from "lucide-react";

const fmtDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("pt-BR");
};

// Marcação manual de revenda do pedido. Só o administrador pode marcar/desmarcar
// e a marcação vale para qualquer pedido, inclusive já faturado ou concluído.
export default function SaleResaleToggle({ sale, onUpdated }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [marked, setMarked] = useState(!!sale?.is_resale);
  const [markedBy, setMarkedBy] = useState(sale?.resale_marked_by || "");
  const [markedDate, setMarkedDate] = useState(sale?.resale_marked_date || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMarked(!!sale?.is_resale);
    setMarkedBy(sale?.resale_marked_by || "");
    setMarkedDate(sale?.resale_marked_date || "");
  }, [sale?.id, sale?.is_resale]);

  if (!sale) return null;

  const isAdmin = user?.role === "admin";

  const toggle = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = marked
        ? { is_resale: false, resale_marked_by: "", resale_marked_date: "" }
        : {
            is_resale: true,
            resale_marked_by: user?.full_name || user?.email || "Administrador",
            resale_marked_date: new Date().toISOString(),
          };
      const updated = await base44.entities.Sale.update(sale.id, payload);
      setMarked(!!payload.is_resale);
      setMarkedBy(payload.resale_marked_by);
      setMarkedDate(payload.resale_marked_date);
      queryClient.invalidateQueries({ queryKey: ["commercial-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["commercial-dashboard-sales"] });
      onUpdated?.({ ...sale, ...payload, ...(updated || {}) });
    } catch {
      setError("Não foi possível salvar a marcação. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    if (!marked) return null;
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 flex items-center gap-2">
        <Store className="h-4 w-4 text-sky-600" />
        <span className="text-sm font-medium">Pedido de revenda</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-2.5 ${marked ? "border-sky-300 bg-sky-50" : "bg-muted/40"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Store className={`h-4 w-4 shrink-0 ${marked ? "text-sky-600" : "text-muted-foreground"}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{marked ? "Pedido de revenda" : "Venda direta"}</p>
            <p className="text-[11px] text-muted-foreground">
              {marked
                ? `Marcado por ${markedBy || "administrador"}${fmtDate(markedDate) ? ` em ${fmtDate(markedDate)}` : ""}`
                : "Marque se este pedido é de revenda — ele passa a contar no faturamento de revenda"}
            </p>
          </div>
        </div>
        <Button size="sm" variant={marked ? "outline" : "default"} onClick={toggle} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Store className="h-3.5 w-3.5" />}
          {marked ? "Desmarcar revenda" : "Marcar como revenda"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}
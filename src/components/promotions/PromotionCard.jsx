import React from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BadgeCheck, Pencil, Power, Users } from "lucide-react";

const fmtDate = (value) => {
  if (!value) return "-";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(value);
};

export default function PromotionCard({ promotion, acceptedCount = 0, isAdmin, onEdit, onChanged }) {
  const toggle = async () => {
    await base44.entities.Promotion.update(promotion.id, {
      status: promotion.status === "Ativa" ? "Inativa" : "Ativa",
    });
    onChanged?.();
  };

  const validity = promotion.is_lifetime
    ? "Vitalícia"
    : `${fmtDate(promotion.promotion_start_date)} a ${fmtDate(promotion.promotion_end_date)}`;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-heading font-semibold">{promotion.name}</span>
              <Badge variant="outline">{promotion.category}</Badge>
              <Badge variant={promotion.status === "Ativa" ? "secondary" : "outline"}>{promotion.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{promotion.campaign_label || "Sem campanha definida"}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(promotion)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle} title={promotion.status === "Ativa" ? "Inativar" : "Ativar"}>
                <Power className={`h-4 w-4 ${promotion.status === "Ativa" ? "text-emerald-600" : "text-muted-foreground"}`} />
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {promotion.discount_percent > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 font-semibold">
              <BadgeCheck className="h-3 w-3" /> {promotion.discount_percent}%
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">Vigência: {validity}</span>
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
            Adesões até {promotion.adhesion_end_date ? fmtDate(promotion.adhesion_end_date) : "sem prazo"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
            <Users className="h-3 w-3" /> {acceptedCount} adesão(ões){promotion.target_type === "Quantidade limitada" && promotion.max_adhesions ? ` de ${promotion.max_adhesions}` : ""}
          </span>
        </div>

        {promotion.discount_scope && <p className="text-xs text-muted-foreground">Desconto sobre: {promotion.discount_scope}</p>}
        {promotion.status === "Ativa" && !promotion.terms_text && (
          <p className="text-xs text-amber-600">Cadastre o termo de adesão para poder gerar links aos clientes.</p>
        )}
      </CardContent>
    </Card>
  );
}
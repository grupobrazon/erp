import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openPromotionTermPdf } from "@/lib/promotionTermPdf";
import { Download } from "lucide-react";

const fmtDateTime = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
};

export default function PromotionAdhesionsTable({ adhesions = [], promotions = [] }) {
  const [busyId, setBusyId] = useState(null);

  const openTerm = async (adhesion) => {
    setBusyId(adhesion.id);
    try {
      const res = await base44.functions.invoke("promotionAdhesion", { action: "get_by_token", token: adhesion.token });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      openPromotionTermPdf({
        promotion: data.promotion,
        adhesion: { ...data.adhesion, terms_snapshot: data.adhesion.terms_snapshot || data.promotion.terms_text },
        signatureUrl: data.adhesion.signature_url,
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Programa</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Link gerado</TableHead>
            <TableHead>Aceite</TableHead>
            <TableHead className="w-[110px]">Termo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adhesions.map((adhesion) => (
            <TableRow key={adhesion.id}>
              <TableCell className="text-sm">{adhesion.accepted_name || adhesion.client_name}</TableCell>
              <TableCell className="text-sm">
                {promotions.find((p) => p.id === adhesion.promotion_id)?.name || adhesion.promotion_name}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    adhesion.status === "Aceita"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : adhesion.status === "Cancelada"
                        ? "text-muted-foreground"
                        : "bg-amber-100 text-amber-700 border-amber-200"
                  }
                >
                  {adhesion.status === "Aceita" ? "Aceita" : adhesion.status === "Cancelada" ? "Cancelada" : "Aguardando aceite"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {fmtDateTime(adhesion.generated_date)}
                {adhesion.generated_by ? ` · ${adhesion.generated_by}` : ""}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDateTime(adhesion.accepted_at)}</TableCell>
              <TableCell>
                {adhesion.status === "Aceita" && (
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={busyId === adhesion.id} onClick={() => openTerm(adhesion)}>
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/EmptyState";
import AdhesionLinkCard from "@/components/promotions/AdhesionLinkCard";
import { BadgeCheck, Link2, Star } from "lucide-react";

const fmtDate = (value) => {
  if (!value) return "-";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(value);
};

const makeToken = (category) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  let suffix = "";
  bytes.forEach((n) => { suffix += chars[n % chars.length]; });
  return `${category === "Programa VIP" ? "VIP" : "PRO"}-${suffix}`;
};

export default function ClientPromotionsTab({ client, clientId }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(null);

  const clientPhone = [client?.phone1, client?.phone2, client?.phone3, client?.phone4, client?.phone5].find(Boolean) || "";

  const { data: promotions = [], isLoading } = useQuery({
    queryKey: ["promotions", "ativa"],
    queryFn: () => base44.entities.Promotion.filter({ status: "Ativa" }),
  });

  const { data: adhesions = [] } = useQuery({
    queryKey: ["promotions-client", clientId],
    queryFn: () => base44.entities.PromotionAdhesion.filter({ client_id: clientId }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["promotions-client", clientId] });

  // Um link por programa: o aceito tem prioridade; senão vale o último gerado
  const adhesionByPromotion = {};
  adhesions.forEach((adhesion) => {
    const current = adhesionByPromotion[adhesion.promotion_id];
    if (!current || adhesion.status === "Aceita") adhesionByPromotion[adhesion.promotion_id] = adhesion;
  });

  const programs = promotions.filter((promotion) => {
    const adhesion = adhesionByPromotion[promotion.id];
    if (adhesion && adhesion.status !== "Cancelada") return true;
    if (!promotion.terms_text) return false;
    if (promotion.adhesion_start_date && promotion.adhesion_start_date > today) return false;
    if (promotion.adhesion_end_date && promotion.adhesion_end_date < today) return false;
    return true;
  });

  const generate = async (promotion) => {
    setGenerating(promotion.id);
    try {
      const token = makeToken(promotion.category);
      await base44.entities.PromotionAdhesion.create({
        promotion_id: promotion.id,
        promotion_name: promotion.name,
        promotion_category: promotion.category,
        client_id: clientId,
        client_name: client.name || "",
        client_document: client.document || "",
        client_email: client.email || "",
        client_phone: clientPhone,
        token,
        status: "Link Gerado",
        generated_by: user?.full_name || user?.email || "",
        generated_date: new Date().toISOString(),
      });
      refresh();
      toast({ title: "Link de adesão gerado", description: `Código ${token} — copie o link abaixo e envie ao cliente.` });
    } catch (error) {
      toast({ title: "Não foi possível gerar o link", description: error?.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {client?.vip_client && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Star className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900 flex items-center gap-2">
                Cliente VIP <BadgeCheck className="h-4 w-4" />
              </p>
              <p className="text-xs text-amber-800">
                Desde {fmtDate(client.vip_since)} — {(client.active_promotions || []).map((p) => `${p.promotion_name} (${p.discount_percent}%)`).join(", ") || "programa ativo"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-heading font-semibold mb-1 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" /> Programas e links de adesão
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Gere o link externo deste cliente, copie e envie por WhatsApp ou e-mail. O cliente abre o link, lê o termo e assina digitalmente.
        </p>

        {programs.length === 0 ? (
          <EmptyState
            title="Nenhum programa disponível"
            description="Confira se o programa está ativo, com o termo de adesão cadastrado e dentro do prazo de adesão (Cadastros → Programas e Promoções)."
          />
        ) : (
          <div className="space-y-4">
            {programs.map((promotion) => {
              const adhesion = adhesionByPromotion[promotion.id];
              const hasLink = adhesion && adhesion.status !== "Cancelada";
              return (
                <Card key={promotion.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{promotion.name}</span>
                      <Badge variant="outline">{promotion.category}</Badge>
                      {promotion.discount_percent > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700">{promotion.discount_percent}% de desconto</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {promotion.is_lifetime ? "Benefício vitalício" : `Vigência até ${fmtDate(promotion.promotion_end_date)}`}
                      {promotion.adhesion_end_date ? ` · adesões até ${fmtDate(promotion.adhesion_end_date)}` : ""}
                    </p>

                    {hasLink ? (
                      <AdhesionLinkCard
                        adhesion={adhesion}
                        promotion={promotion}
                        clientPhone={clientPhone}
                        onChanged={refresh}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed p-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          O link já sai com o nome, CPF/CNPJ e WhatsApp deste cliente preenchidos.
                        </p>
                        <Button size="sm" className="gap-2" disabled={generating === promotion.id} onClick={() => generate(promotion)}>
                          <Link2 className="h-4 w-4" />
                          {generating === promotion.id ? "Gerando..." : "Gerar link de adesão"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
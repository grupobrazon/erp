import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import PromotionCard from "@/components/promotions/PromotionCard";
import PromotionFormDialog from "@/components/promotions/PromotionFormDialog";
import PromotionAdhesionsTable from "@/components/promotions/PromotionAdhesionsTable";
import { Plus } from "lucide-react";

export default function Promotions() {
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: promotions = [], isLoading } = useQuery({
    queryKey: ["promotions"],
    queryFn: () => base44.entities.Promotion.list("-created_date", 100),
  });

  const { data: adhesions = [], isLoading: loadingAdhesions } = useQuery({
    queryKey: ["promotions-adhesions"],
    queryFn: () => base44.entities.PromotionAdhesion.list("-generated_date", 100),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["promotions"] });
    queryClient.invalidateQueries({ queryKey: ["promotions-adhesions"] });
  };

  const acceptedCount = (promotionId) =>
    adhesions.filter((a) => a.promotion_id === promotionId && a.status === "Aceita").length;

  const recentAdhesions = adhesions.slice(0, 30);

  return (
    <div>
      <PageHeader
        title="Programas e Promoções"
        description="Cadastre programas de relacionamento, promoções e campanhas com termo de adesão assinado digitalmente pelo cliente."
      >
        {isAdmin && (
          <Button className="gap-2" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo programa
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : promotions.length === 0 ? (
        <EmptyState
          title="Nenhum programa cadastrado"
          description="Cadastre um programa ou promoção com o termo de adesão para começar a gerar links aos clientes."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {promotions.map((promotion) => (
            <PromotionCard
              key={promotion.id}
              promotion={promotion}
              acceptedCount={acceptedCount(promotion.id)}
              isAdmin={isAdmin}
              onEdit={(promo) => { setEditing(promo); setDialogOpen(true); }}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Adesões recebidas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAdhesions ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-7 h-7 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : recentAdhesions.length === 0 ? (
            <EmptyState title="Nenhuma adesão ainda" description="Os links gerados no cadastro do cliente aparecem aqui com a situação do aceite." />
          ) : (
            <PromotionAdhesionsTable adhesions={recentAdhesions} promotions={promotions} />
          )}
        </CardContent>
      </Card>

      <PromotionFormDialog open={dialogOpen} onOpenChange={setDialogOpen} promotion={editing} />
    </div>
  );
}
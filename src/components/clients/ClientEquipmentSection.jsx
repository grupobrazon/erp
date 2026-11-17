import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Wrench, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ClientEquipmentSection({ clientId }) {
  const { data: equipments = [], isLoading } = useQuery({
    queryKey: ["client-equipments", clientId],
    queryFn: () => base44.entities.Equipment.filter({ client_id: clientId }),
    enabled: !!clientId,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Equipamentos Cadastrados</CardTitle>
        {clientId && (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/equipamentos/novo"><Plus className="h-4 w-4" /> Novo Equipamento</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!clientId ? (
          <p className="text-sm text-muted-foreground">Cadastre o cliente para poder vincular equipamentos a ele.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando equipamentos...</p>
        ) : equipments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum equipamento vinculado a este cliente ainda.</p>
        ) : (
          <div className="space-y-2">
            {equipments.map(eq => (
              <div key={eq.id} className="flex items-center gap-3 text-sm border rounded-md px-3 py-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{eq.product_name || "Equipamento"}</span>
                <span className="text-muted-foreground">{eq.code}</span>
                <span className="ml-auto text-xs text-muted-foreground">{eq.status}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
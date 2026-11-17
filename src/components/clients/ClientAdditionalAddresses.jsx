import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/EmptyState";
import AddressFormDialog from "@/components/clients/AddressFormDialog";

export default function ClientAdditionalAddresses({ clientId }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses", clientId],
    queryFn: () => base44.entities.Address.filter({ client_id: clientId }),
    enabled: !!clientId,
  });

  const deleteMutation = useMutation({
    mutationFn: (aid) => base44.entities.Address.delete(aid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses", clientId] }),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Endereços Adicionais</CardTitle>
        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent>
        {addresses.length === 0 ? (
          <EmptyState title="Nenhum endereço adicional" description="Adicione endereços de entrega, instalação ou filiais." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map(addr => (
              <div key={addr.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <Badge variant="secondary">{addr.label || "Endereço"}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(addr); setDialogOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(addr.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm mt-2">{addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ""}</p>
                <p className="text-sm text-muted-foreground">{addr.neighborhood} - {addr.city}/{addr.state}</p>
                {addr.zip_code && <p className="text-xs text-muted-foreground">CEP: {addr.zip_code}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <AddressFormDialog open={dialogOpen} onOpenChange={setDialogOpen} address={editing} clientId={clientId} />
    </Card>
  );
}
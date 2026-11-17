import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, ShoppingCart, MessageCircle, User, Package, MapPin, AlertCircle } from "lucide-react";

export default function ActiveCallCard({ currentCall, matchedClient, matchedEquipment, agentStatus, onOpenCRM, onCreateSale }) {
  if (!currentCall) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
          {agentStatus === "idle" ? "Aguardando chamada do discador..." : "Nenhuma chamada ativa."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary animate-pulse" />
          Chamada Ativa
          <Badge variant="default" className="ml-auto font-mono">{currentCall.phone || "—"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {matchedClient ? (
          <div className="space-y-3">
            {/* Client info */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{matchedClient.name}</span>
              </div>
              {matchedClient.city && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {matchedClient.city}/{matchedClient.state} {matchedClient.neighborhood ? `· ${matchedClient.neighborhood}` : ""}
                </div>
              )}
              {matchedEquipment && (
                <div className="flex items-center gap-2 text-sm">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{matchedEquipment.product_name || "—"}</span>
                  {matchedEquipment.brand && <span className="text-muted-foreground">· {matchedEquipment.brand}</span>}
                  <Badge variant="outline" className="text-xs font-mono">{matchedEquipment.patrimony_code || matchedEquipment.code}</Badge>
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={onOpenCRM} className="gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" /> Registrar Contato / Follow-up
              </Button>
              {matchedEquipment && (
                <Button size="sm" variant="secondary" onClick={onCreateSale} className="gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5" /> Trocar Refil
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Cliente não encontrado pelo telefone {currentCall.phone}. Verifique se o número está cadastrado ou adicione manualmente.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
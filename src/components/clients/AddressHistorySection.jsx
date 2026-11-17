import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History, MapPin } from "lucide-react";
import { format } from "date-fns";

const ADDRESS_FIELDS = [
  { key: "street", label: "Logradouro" },
  { key: "number", label: "Número" },
  { key: "complement", label: "Complemento" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "UF" },
  { key: "zip_code", label: "CEP" },
];

const formatAddr = (addr) => {
  if (!addr) return "—";
  const parts = [
    [addr.street, addr.number].filter(Boolean).join(", "),
    addr.complement,
    [addr.neighborhood, addr.city && `${addr.city}/${addr.state || ""}`].filter(Boolean).join(" — "),
    addr.zip_code && `CEP: ${addr.zip_code}`,
  ].filter(Boolean);
  return parts.join("\n");
};

export default function AddressHistorySection({ client }) {
  const history = client?.address_history || [];
  if (!history.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <History className="h-4 w-4 text-primary" /> Histórico de Alterações de Endereço
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.slice().reverse().map((entry, i) => (
          <div key={i} className="border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                {entry.user_name || "Sistema"}
              </span>
              <span className="text-xs text-muted-foreground">
                {entry.date ? format(new Date(entry.date), "dd/MM/yyyy 'às' HH:mm") : "—"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
                <p className="text-xs font-semibold text-amber-700 mb-1">Endereço anterior</p>
                <pre className="text-xs whitespace-pre-wrap font-sans text-foreground/80">{formatAddr(entry.old_address)}</pre>
              </div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-2">
                <p className="text-xs font-semibold text-emerald-700 mb-1">Novo endereço</p>
                <pre className="text-xs whitespace-pre-wrap font-sans text-foreground/80">{formatAddr(entry.new_address)}</pre>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
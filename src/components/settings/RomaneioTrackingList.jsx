import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

const SITUACAO = {
  Enviado: { label: "Código enviado", className: "bg-green-100 text-green-800" },
  "Aguardando Resposta": { label: "Pergunta enviada", className: "bg-amber-100 text-amber-800" },
  "Aguardando Rastreio": { label: "Aguardando código", className: "bg-sky-100 text-sky-800" },
  Expirado: { label: "Sem resposta no prazo", className: "bg-zinc-100 text-zinc-700" },
  "Sem Envio": { label: "Sem contato no CRM", className: "bg-rose-100 text-rose-800" },
  "Fora do Aviso": { label: "Fora da regra do aviso", className: "bg-zinc-100 text-zinc-700" },
  "Na Fila": { label: "Entra na próxima varredura", className: "bg-zinc-100 text-zinc-700" },
};

const dataCurta = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

const dataBR = (valor) => {
  if (!valor) return "—";
  const d = new Date(`${String(valor).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// Clientes despachados no período do aviso e o que já foi (ou ainda falta) enviar.
export default function RomaneioTrackingList() {
  const { data = [], refetch, isFetching } = useQuery({
    queryKey: ["romaneioTrackingLiberados"],
    queryFn: async () => {
      const res = await base44.functions.invoke("sendRomaneioTracking", { mode: "liberados" });
      return res.data?.liberados || [];
    },
  });

  const contar = (situacao) => data.filter((r) => r.situacao === situacao).length;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Clientes despachados desde 21/10</p>
          <p className="text-xs text-muted-foreground">
            {data.length} OS · {contar("Enviado")} com código enviado · {contar("Aguardando Rastreio")} aguardando o
            código da transportadora · {contar("Aguardando Resposta")} com pergunta enviada
            {contar("Fora do Aviso") ? ` · ${contar("Fora do Aviso")} fora da regra do aviso` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma OS despachada no período.</p>
      ) : (
        <div className="space-y-1.5">
          {data.map((r) => (
            <div key={r.os_id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b pb-1.5 text-xs">
              <div className="min-w-[96px]">
                <p className="font-mono">{r.os_code}</p>
                <p className="text-muted-foreground">{r.sale_order_number || "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{r.client_name || "Cliente não identificado"}</p>
                <p className="truncate text-muted-foreground">
                  {r.codigos?.length ? `Rastreio ${r.codigos.join(", ")}` : `Romaneio de ${dataBR(r.romaneio_date)}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={SITUACAO[r.situacao]?.className || "bg-zinc-100 text-zinc-700"}>
                  {SITUACAO[r.situacao]?.label || r.situacao}
                </Badge>
                <span className="text-muted-foreground">{dataCurta(r.atualizado_em)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
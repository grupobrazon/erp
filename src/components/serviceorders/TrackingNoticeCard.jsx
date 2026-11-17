import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckCheck, Clock, Truck, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const VISUAL = {
  Enviado: {
    icon: CheckCheck,
    classe: "border-emerald-300 bg-emerald-50/50 text-emerald-800",
    titulo: "Aviso de rastreio enviado ao cliente",
  },
  "Aguardando Resposta": {
    icon: Clock,
    classe: "border-amber-300 bg-amber-50/50 text-amber-800",
    titulo: "Perguntamos se o cliente pode falar agora — aguardando resposta",
  },
  "Aguardando Rastreio": {
    icon: Truck,
    classe: "border-sky-300 bg-sky-50/50 text-sky-800",
    titulo: "Aguardando o código de rastreio da transportadora",
  },
  "Sem Envio": {
    icon: AlertTriangle,
    classe: "border-rose-300 bg-rose-50/50 text-rose-800",
    titulo: "Aviso não enviado",
  },
  Expirado: {
    icon: Clock,
    classe: "border-zinc-300 bg-zinc-50 text-zinc-700",
    titulo: "Sem resposta do cliente no prazo",
  },
};

const dataHora = (valor) => {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function TrackingNoticeCard({ order }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: registro } = useQuery({
    queryKey: ["rastreio-aviso", order?.id],
    enabled: !!order?.id,
    queryFn: async () => {
      const res = await base44.functions.invoke("sendRomaneioTracking", { mode: "list", os_id: order.id });
      return res.data?.registros?.[0] || null;
    },
  });

  const tentar = useMutation({
    mutationFn: () => base44.functions.invoke("sendRomaneioTracking", { mode: "dispatch", os_ids: [order.id] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rastreio-aviso", order?.id] });
      toast({ title: "Tentativa de aviso registrada" });
    },
    onError: (err) => toast({ title: "Não foi possível tentar agora", description: err?.message, variant: "destructive" }),
  });

  if (!registro) return null;

  const visual = VISUAL[registro.status] || VISUAL["Aguardando Rastreio"];
  const Icone = visual.icon;
  const enviado = registro.status === "Enviado";

  return (
    <div className={`rounded-md border p-3 ${visual.classe}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icone className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium flex items-center gap-1.5">
              {visual.titulo}
              {enviado && <CheckCheck className="h-4 w-4" />}
            </p>
            <p className="text-xs">
              {enviado
                ? `Enviado em ${dataHora(registro.tracking_message_sent_at)}`
                : registro.last_error || "Acompanhamento automático a cada 5 minutos"}
            </p>
            {!enviado && registro.last_ask_at && (
              <p className="text-xs">Última pergunta ao cliente: {dataHora(registro.last_ask_at)}</p>
            )}
            {(registro.tracking_codes || []).length > 0 && (
              <p className="text-xs font-mono">Rastreio: {registro.tracking_codes.join(", ")}</p>
            )}
          </div>
        </div>
        {!enviado && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => tentar.mutate()}
            disabled={tentar.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar agora
          </Button>
        )}
      </div>
    </div>
  );
}
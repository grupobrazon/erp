import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, PhoneMissed, PhoneCall, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const STATUS_MAP = {
  "Atendida": { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", label: "Atendida" },
  "Não Atendida": { icon: PhoneMissed, color: "text-amber-600", bg: "bg-amber-50", label: "Não Atendida" },
  "Ocupado": { icon: PhoneOff, color: "text-orange-600", bg: "bg-orange-50", label: "Ocupado" },
  "Caixa Postal": { icon: PhoneCall, color: "text-blue-600", bg: "bg-blue-50", label: "Caixa Postal" },
  "Inválido": { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Inválido" },
  "Outro": { icon: AlertTriangle, color: "text-muted-foreground", bg: "bg-muted", label: "Outro" },
};

export default function CampaignCallHistory({ campaignId, campaignName }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      // Buscar chamadas da campanha atual no 3C Plus via backend
      const res = await base44.functions.invoke("sync3CAgent", {
        action: "getCampaignCalls",
        campaign_id: campaignId,
      });
      let apiCalls = [];
      if (!res.data?.error) {
        apiCalls = res.data?.calls || [];
      }

      // Buscar contatos registrados manualmente (Chamada3C internos) vinculados a esta campanha
      let internalCalls = [];
      try {
        const campanhas = await base44.entities.Campanha3C.filter({ campaign_id_3c: String(campaignId) });
        if (campanhas.length > 0) {
          const chamadas = await base44.entities.Chamada3C.filter({ campanha_3c_id: campanhas[0].id }, "-created_date", 200);
          internalCalls = chamadas.map((c) => ({
            id: c.id,
            phone: c.phone || "",
            client_name: c.client_name || "",
            call_status: c.call_status || "Atendida",
            call_status_raw: c.call_status_raw || "",
            call_duration: c.call_duration || 0,
            call_date: c.call_date || c.created_date || "",
            recording_url: c.recording_url || "",
            agent_name: c.agent_name || "",
            notes: c.notes || "",
            qualification_label: c.qualification_label || "",
            is_internal: true,
          }));
        }
      } catch { /* ignore */ }

      // Mesclar: contatos manuais primeiro, depois chamadas do 3C Plus (sem duplicar)
      const internalPhones = new Set(internalCalls.map((c) => c.phone?.replace(/\D/g, "")).filter(Boolean));
      const filteredApiCalls = apiCalls.filter((c) => {
        const phone = (c.phone || "").replace(/\D/g, "");
        return phone && !internalPhones.has(phone);
      });

      setCalls([...internalCalls, ...filteredApiCalls]);
    } catch (e) {
      // silencioso - não interrompe o atendimento
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (campaignId) {
      loadHistory();
      // Atualiza a cada 30 segundos enquanto em campanha
      const interval = setInterval(loadHistory, 30000);
      return () => clearInterval(interval);
    }
  }, [campaignId]);

  if (!campaignId) return null;

  // Agrupar por status para resumo
  const summary = calls.reduce((acc, c) => {
    const status = c.call_status || "Outro";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const total = calls.length;
  const atendidas = summary["Atendida"] || 0;
  const naoAtendidas = total - atendidas;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" /> Histórico de Chamadas
            </CardTitle>
            <CardDescription>Resultados da campanha {campaignName ? `"${campaignName}"` : ""}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadHistory} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <div className="rounded-lg border p-2 text-center">
            <div className="text-xl font-bold">{total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="rounded-lg border p-2 text-center bg-emerald-50">
            <div className="text-xl font-bold text-emerald-700">{atendidas}</div>
            <div className="text-xs text-emerald-600">Atendidas</div>
          </div>
          <div className="rounded-lg border p-2 text-center bg-amber-50">
            <div className="text-xl font-bold text-amber-700">{naoAtendidas}</div>
            <div className="text-xs text-amber-600">Não Atendidas</div>
          </div>
          {(summary["Ocupado"] || 0) > 0 && (
            <div className="rounded-lg border p-2 text-center bg-orange-50">
              <div className="text-xl font-bold text-orange-700">{summary["Ocupado"]}</div>
              <div className="text-xs text-orange-600">Ocupado</div>
            </div>
          )}
          {(summary["Caixa Postal"] || 0) > 0 && (
            <div className="rounded-lg border p-2 text-center bg-blue-50">
              <div className="text-xl font-bold text-blue-700">{summary["Caixa Postal"]}</div>
              <div className="text-xs text-blue-600">Caixa Postal</div>
            </div>
          )}
          {(summary["Inválido"] || 0) > 0 && (
            <div className="rounded-lg border p-2 text-center bg-red-50">
              <div className="text-xl font-bold text-red-700">{summary["Inválido"]}</div>
              <div className="text-xs text-red-600">Inválido</div>
            </div>
          )}
        </div>

        {/* Lista de chamadas */}
        {calls.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            {loading ? "Carregando histórico..." : "Nenhuma chamada registrada ainda."}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {calls.slice().reverse().map((call, idx) => {
              const cfg = STATUS_MAP[call.call_status] || STATUS_MAP["Outro"];
              const Icon = cfg.icon;
              return (
                <div key={call.id || idx} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/50">
                  <div className={`shrink-0 rounded-full p-1.5 ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {call.client_name || call.phone || "—"}
                      </span>
                      <Badge variant="outline" className="text-xs shrink-0">{cfg.label}</Badge>
                      {call.is_internal && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Registrado</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {call.phone && <span>{call.phone}</span>}
                      {call.call_date && (
                        <span className="ml-2">
                          {new Date(call.call_date).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                          })}
                        </span>
                      )}
                      {call.call_duration > 0 && (
                        <span className="ml-2">{Math.floor(call.call_duration / 60)}:{String(call.call_duration % 60).padStart(2, "0")}</span>
                      )}
                    </div>
                    {call.is_internal && (call.notes || call.qualification_label) && (
                      <div className="text-xs mt-0.5 text-muted-foreground">
                        {call.qualification_label && <span className="font-medium">{call.qualification_label}</span>}
                        {call.notes && <span className="ml-1">· {call.notes}</span>}
                      </div>
                    )}
                  </div>
                  {call.recording_url && (
                    <a href={call.recording_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <PhoneCall className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Phone, PhoneCall, Coffee, FileText, History, ChevronDown, ChevronRight } from "lucide-react";

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "0min";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function CampaignSessionsHistory({ sellerId, campaignId, campaignName, tick }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const loadSessions = async () => {
    if (!sellerId || !campaignId) return;
    setLoading(true);
    try {
      const list = await base44.entities.SessaoCampanha3C.filter(
        { seller_id: sellerId, campaign_id_3c: String(campaignId) },
        "-login_at",
        100
      );
      setSessions(list);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [sellerId, campaignId, tick]);

  // Totais agregados
  const totals = sessions.reduce((acc, s) => {
    acc.duration += s.duration_seconds || 0;
    acc.active += s.active_seconds || 0;
    acc.breaks += s.total_break_seconds || 0;
    acc.calls += s.calls_count || 0;
    acc.answered += s.calls_answered || 0;
    acc.notAnswered += s.calls_not_answered || 0;
    acc.talkTime += s.talk_time_seconds || 0;
    acc.records += s.records_made || 0;
    return acc;
  }, { duration: 0, active: 0, breaks: 0, calls: 0, answered: 0, notAnswered: 0, talkTime: 0, records: 0 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Histórico de Sessões
        </CardTitle>
        <CardDescription>
          Tempo, pausas e atendimentos da vendedora em "{campaignName}"
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumo agregado */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" /> Tempo Total
            </div>
            <div className="text-lg font-semibold">{formatDuration(totals.duration)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <PhoneCall className="h-3.5 w-3.5" /> Atendidas
            </div>
            <div className="text-lg font-semibold">{totals.answered}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Coffee className="h-3.5 w-3.5" /> Tempo em Pausa
            </div>
            <div className="text-lg font-semibold">{formatDuration(totals.breaks)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <FileText className="h-3.5 w-3.5" /> Registros
            </div>
            <div className="text-lg font-semibold">{totals.records}</div>
          </div>
        </div>

        {/* Lista de sessões */}
        {loading && sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma sessão registrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const isOpen = expanded === s.id;
              const isActive = s.status === "Ativa";
              return (
                <div key={s.id} className="rounded-lg border">
                  <button
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                          {isActive ? "Ativa agora" : "Encerrada"}
                        </Badge>
                        <span className="text-sm font-medium">{formatDateTime(s.login_at)}</span>
                        {!isActive && s.logout_at && (
                          <span className="text-xs text-muted-foreground">→ {formatDateTime(s.logout_at)}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDuration(s.duration_seconds)} total · {formatDuration(s.active_seconds)} ativo · {s.calls_count || 0} chamadas · {s.calls_answered || 0} atendidas
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t px-3 py-3 space-y-3 bg-muted/30">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Tempo Total</div>
                          <div className="font-medium">{formatDuration(s.duration_seconds)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Tempo Ativo</div>
                          <div className="font-medium">{formatDuration(s.active_seconds)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Tempo em Pausa</div>
                          <div className="font-medium">{formatDuration(s.total_break_seconds)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Tempo em Conversa</div>
                          <div className="font-medium">{formatDuration(s.talk_time_seconds)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Chamadas Recebidas</div>
                          <div className="font-medium">{s.calls_count || 0}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Atendidas</div>
                          <div className="font-medium text-emerald-600">{s.calls_answered || 0}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Não Atendidas</div>
                          <div className="font-medium text-muted-foreground">{s.calls_not_answered || 0}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Registros Feitos</div>
                          <div className="font-medium text-primary">{s.records_made || 0}</div>
                        </div>
                      </div>
                      {/* Pausas detalhadas */}
                      {s.breaks && s.breaks.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                            <Coffee className="h-3 w-3" /> Pausas ({s.breaks.length})
                          </div>
                          <div className="space-y-1">
                            {s.breaks.map((b, i) => (
                              <div key={i} className="flex items-center justify-between text-xs bg-card rounded px-2 py-1.5 border">
                                <span className="font-medium">{b.break_name || `Pausa #${i + 1}`}</span>
                                <span className="text-muted-foreground">
                                  {formatDateTime(b.started_at)} → {b.ended_at ? formatDateTime(b.ended_at) : "em andamento"} · {formatDuration(b.duration_seconds)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
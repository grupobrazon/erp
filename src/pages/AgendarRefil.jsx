import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Droplets, CalendarCheck, Check, Clock, AlertCircle, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function buildBusinessDays(count) {
  const days = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (days.length < count) {
    if (d.getDay() !== 0) days.push(new Date(d)); // exclui domingo
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function fmtDate(d) {
  const dt = new Date(d + "T00:00:00");
  return `${WEEKDAYS[dt.getDay()]}, ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`;
}

export default function AgendarRefil() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ag, setAg] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedWindow, setSelectedWindow] = useState(null);
  const [obs, setObs] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const days = useMemo(() => buildBusinessDays(21), []);

  const load = async () => {
    try {
      const res = await base44.functions.invoke("manageAgendamento", { action: "get_by_token", token });
      const d = res.data || res;
      if (d.error) throw new Error(typeof d.error === "string" ? d.error : JSON.stringify(d.error));
      setAg(d.agendamento);
      if (d.agendamento.status === "Agendado") setDone(true);
    } catch (err) {
      setError(err?.message || "Link inválido ou expirado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("manageAgendamento", {
        action: "confirm", token, scheduled_date: selectedDate, window: selectedWindow, client_obs: obs,
      });
      const d = res.data || res;
      if (d.error) throw new Error(typeof d.error === "string" ? d.error : JSON.stringify(d.error));
      setDone(true);
    } catch (err) {
      setError(err?.message || "Erro ao confirmar agendamento");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !ag) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-md mx-auto p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6 pt-4">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <Droplets className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-heading font-bold text-foreground leading-none">Brazon</div>
            <div className="text-[10px] text-muted-foreground">Purificação de Água</div>
          </div>
        </div>

        {/* Saudação */}
        <div className="mb-6">
          <h1 className="text-xl font-heading font-bold text-foreground">
            Olá{ag?.client_name ? `, ${ag.client_name.split(" ")[0]}` : ""}! 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Está na hora de trocar o refil do seu purificador. Escolha abaixo o melhor dia e período para a visita do técnico.
          </p>
        </div>

        {/* Card equipamento */}
        {ag?.purifier_model && (
          <div className="rounded-xl border bg-card p-4 mb-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Droplets className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Purificador</div>
              <div className="font-medium text-sm truncate">{ag.purifier_model}</div>
              {ag.equipment_code && <div className="text-xs text-muted-foreground font-mono">{ag.equipment_code}</div>}
            </div>
          </div>
        )}

        {/* Tela de confirmação */}
        {done ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="font-heading font-bold text-emerald-900 text-lg mb-1">Agendamento confirmado!</h2>
            <p className="text-sm text-emerald-800">
              {ag?.scheduled_date ? fmtDate(ag.scheduled_date) : ""} — período da {ag?.window?.toLowerCase()}
            </p>
            <p className="text-xs text-emerald-700 mt-3">
              Recebemos seu agendamento. Nossa equipe entrará em contato para confirmar o horário exato da visita.
            </p>
          </div>
        ) : (
          <>
            {/* Erro inline */}
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-4 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {/* Seleção de data */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <CalendarCheck className="h-4 w-4 text-primary" />
                <h3 className="font-heading font-semibold text-sm">Escolha o dia</h3>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {days.map((d, i) => {
                  const iso = d.toISOString().split("T")[0];
                  const active = selectedDate === iso;
                  return (
                    <button
                      key={i}
                      onClick={() => { setSelectedDate(iso); setSelectedWindow(null); }}
                      className={`shrink-0 w-16 rounded-xl border p-2 text-center transition-colors ${
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <div className={`text-[10px] uppercase ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {WEEKDAYS[d.getDay()]}
                      </div>
                      <div className="text-lg font-bold leading-tight">{d.getDate()}</div>
                      <div className={`text-[10px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {MONTHS[d.getMonth()]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seleção de janela */}
            {selectedDate && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-primary" />
                  <h3 className="font-heading font-semibold text-sm">Escolha o período</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "Manhã", label: "Manhã", hours: "08h — 12h" },
                    { value: "Tarde", label: "Tarde", hours: "13h — 18h" },
                  ].map((w) => {
                    const active = selectedWindow === w.value;
                    return (
                      <button
                        key={w.value}
                        onClick={() => setSelectedWindow(w.value)}
                        className={`rounded-xl border p-4 text-left transition-colors ${
                          active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/50"
                        }`}
                      >
                        <div className="font-medium text-sm">{w.label}</div>
                        <div className="text-xs text-muted-foreground">{w.hours}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Observação */}
            {selectedWindow && (
              <div className="mb-5">
                <label className="text-sm font-medium mb-1.5 block">Observação (opcional)</label>
                <Textarea
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ex: tocar no portão, falar com o porteiro, melhor horário dentro do período..."
                  rows={2}
                />
              </div>
            )}

            {/* Confirmar */}
            <Button
              className="w-full gap-2 h-11"
              disabled={!selectedDate || !selectedWindow || submitting}
              onClick={confirm}
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : (
                <>
                  Confirmar Agendamento <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-[11px] text-muted-foreground text-center mt-4">
              Após confirmar, nossa equipe entrará em contato para acertar os detalhes da visita.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
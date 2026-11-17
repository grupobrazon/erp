import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, RefreshCw, CheckCircle2, Link2, Unlink, AlertCircle } from "lucide-react";

const CONNECTOR_ID = "6a566ba1f7924f994a4d589f";

export default function GoogleCalendarSync() {
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const doSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("syncTechnicianCalendar", {});
      if (res.data?.not_connected) {
        setConnected(false);
        setResult(null);
      } else if (res.data?.error) {
        setError(res.data.error);
      } else {
        setConnected(true);
        setResult(res.data);
      }
    } catch (e) {
      const data = e?.response?.data || e;
      if (data?.not_connected) {
        setConnected(false);
      } else {
        setError(data?.error || data?.message || "Erro ao sincronizar com o Google Calendar");
      }
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    base44.auth.isAuthenticated().then((authed) => {
      if (authed) doSync();
      else setLoading(false);
    });
  }, []);

  const handleConnect = async () => {
    setError(null);
    try {
      const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
      const popup = window.open(url, "_blank");
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          doSync();
        }
      }, 500);
    } catch (e) {
      setError(e.message || "Erro ao conectar");
    }
  };

  const handleDisconnect = async () => {
    try {
      await base44.connectors.disconnectAppUser(CONNECTOR_ID);
      setConnected(false);
      setResult(null);
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <Card className="p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Verificando Google Agenda...
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card className="p-4 border-blue-200 bg-blue-50/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Google Agenda</p>
            <p className="text-xs text-muted-foreground">
              Conecte para sincronizar seus atendimentos automaticamente
            </p>
          </div>
          <Button size="sm" onClick={handleConnect}>
            <Link2 className="h-4 w-4" /> Conectar
          </Button>
        </div>
        {error && (
          <p className="text-xs text-destructive mt-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </p>
        )}
      </Card>
    );
  }

  const summary = result
    ? [
        result.created > 0 ? `${result.created} criados` : null,
        result.updated > 0 ? `${result.updated} atualizados` : null,
        result.deleted > 0 ? `${result.deleted} removidos` : null,
        result.errors > 0 ? `${result.errors} erros` : null,
      ].filter(Boolean).join(" • ")
    : "Agenda sincronizada";

  return (
    <Card className="p-4 border-emerald-200 bg-emerald-50/50">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Google Agenda conectada</p>
          <p className="text-xs text-muted-foreground truncate">{summary}</p>
        </div>
        <Button size="sm" variant="outline" onClick={doSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDisconnect} title="Desconectar Google Agenda">
          <Unlink className="h-4 w-4" />
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive mt-2 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </Card>
  );
}
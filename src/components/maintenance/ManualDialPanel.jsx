import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { PhoneCall, PhoneOff, Loader2, Hash } from "lucide-react";

/**
 * Ligação manual pelo softphone do 3C Plus.
 * Permite testar o áudio/discador sem depender da fila da campanha.
 * Usa as ações manualCallEnter / manualCallDial / manualCallExit do sync3CAgent.
 */
export default function ManualDialPanel({ sellerId }) {
  const { toast } = useToast();
  const [manualMode, setManualMode] = useState(false);
  const [number, setNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const invoke = async (action, extra = {}) => {
    const res = await base44.functions.invoke("sync3CAgent", { action, seller_id: sellerId, ...extra });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  };

  const handleEnter = async () => {
    setLoading(true);
    try {
      await invoke("manualCallEnter");
      setManualMode(true);
      toast({ title: "Modo manual ativado", description: "Digite o número e clique em Ligar." });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDial = async () => {
    const digits = number.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ variant: "destructive", title: "Número inválido", description: "Informe DDD + número (ex: 11999998888)." });
      return;
    }
    setLoading(true);
    try {
      await invoke("manualCallDial", { number: digits });
      toast({ title: "Discando...", description: digits });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao discar", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleExit = async () => {
    setLoading(true);
    try {
      await invoke("manualCallExit");
      setManualMode(false);
      setNumber("");
      toast({ title: "Modo manual desativado" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-3 border-t space-y-3">
      <div className="flex items-center gap-1.5">
        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Ligação manual (teste)</span>
      </div>

      {manualMode ? (
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px] space-y-1.5">
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="DDD + número (ex: 11999998888)"
              inputMode="tel"
            />
          </div>
          <Button size="sm" onClick={handleDial} disabled={loading || !number} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
            Ligar
          </Button>
          <Button size="sm" variant="outline" onClick={handleExit} disabled={loading} className="gap-1.5">
            <PhoneOff className="h-4 w-4" /> Sair do manual
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleEnter} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
            Entrar em modo manual
          </Button>
          <span className="text-xs text-muted-foreground">
            Disca um número avulso pelo softphone, sem esperar a fila da campanha.
          </span>
        </div>
      )}
    </div>
  );
}
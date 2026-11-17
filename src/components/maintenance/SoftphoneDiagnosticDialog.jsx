import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Stethoscope } from "lucide-react";

export default function SoftphoneDiagnosticDialog({ sellerId, campaignId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    setSteps([]);
    try {
      const res = await base44.functions.invoke("sync3CAgent", {
        action: "diagnoseAgent",
        seller_id: sellerId,
        campaign_id: campaignId || undefined,
      });
      if (res.data?.error) setError(res.data.error);
      setSteps(res.data?.steps || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); run(); }}
        className="gap-1.5"
      >
        <Stethoscope className="h-4 w-4" />
        Diagnosticar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Diagnóstico do softphone</DialogTitle>
            <DialogDescription>
              Testa cada etapa da conexão com o 3C Plus e mostra exatamente onde está falhando.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Testando... isso leva alguns segundos.
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {s.ok
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {!loading && steps.length > 0 && (
            <Button variant="outline" onClick={run}>Testar novamente</Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
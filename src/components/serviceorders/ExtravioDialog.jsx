import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

// Dialog para marcar etiquetas como extraviadas (mercadoria perdida pela transportadora).
// Após marcar, oferece a opção de gerar uma nova etiqueta imediatamente (reenvio do mesmo produto).
export default function ExtravioDialog({ open, onOpenChange, serviceOrder, onCompleted }) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState(false);

  const labels = Array.isArray(serviceOrder?.melhor_envio_labels) ? serviceOrder.melhor_envio_labels : [];

  const handleMarkExtravio = async (regenerate = false) => {
    if (!reason.trim()) {
      toast({ title: 'Informe o motivo do extravio', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke('markExtravio', {
        os_id: serviceOrder.id,
        reason: reason.trim(),
      });
      const d = res.data || res;
      if (d?.error) throw new Error(d.error);

      toast({
        title: 'Extravio registrado',
        description: `${d.extraviado_count || 0} etiqueta(s) marcada(s) como extraviada(s).`,
      });

      if (regenerate) {
        await handleRegenerateLabel();
      } else {
        setReason('');
        onOpenChange(false);
        if (onCompleted) onCompleted();
      }
    } catch (e) {
      toast({ title: 'Erro ao marcar extravio', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateLabel = async () => {
    setGeneratingLabel(true);
    try {
      const res = await base44.functions.invoke('generateMelhorEnvioLabel', {
        os_id: serviceOrder.id,
      });
      const d = res.data || res;
      if (d?.error) throw new Error(d.error);

      toast({
        title: 'Nova etiqueta gerada',
        description: 'O produto foi reenviado dentro da mesma OS e mesma NF-e.',
      });
      setReason('');
      onOpenChange(false);
      if (onCompleted) onCompleted();
    } catch (e) {
      toast({
        title: 'Extravio registrado, mas falha ao gerar nova etiqueta',
        description: `Marque o extravio novamente (já foi registrado). Erro: ${e.message}`,
        variant: 'destructive',
      });
      onOpenChange(false);
      if (onCompleted) onCompleted();
    } finally {
      setGeneratingLabel(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Extravio de Mercadoria
          </DialogTitle>
          <DialogDescription>
            Marque as etiquetas atuais como extraviadas (perdidas pela transportadora) e gere uma nova etiqueta
            para reenviar o mesmo produto dentro da mesma OS e mesma NF-e.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold mb-1">Etiquetas ativas que serão marcadas como extraviadas:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {labels.map((lbl, i) => (
                <li key={i}>
                  {lbl.label_tag || `Vol. ${lbl.volume_index}`} — {lbl.carrier} — {lbl.tracking_code || 'sem rastreio'}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="extravio-reason">Motivo do extravio *</Label>
            <Textarea
              id="extravio-reason"
              placeholder="Ex: Pacote extraviado pela transportadora, confirmado pelo rastreamento parado há X dias..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading || generatingLabel}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleMarkExtravio(false)}
            disabled={loading || generatingLabel || !reason.trim()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apenas marcar extravio
          </Button>
          <Button
            onClick={() => handleMarkExtravio(true)}
            disabled={loading || generatingLabel || !reason.trim()}
          >
            {generatingLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Marcar e gerar nova etiqueta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
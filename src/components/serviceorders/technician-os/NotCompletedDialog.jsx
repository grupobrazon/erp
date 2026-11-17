import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, AlertTriangle, XCircle } from "lucide-react";

const REASONS = [
  "Cliente não estava em casa",
  "Cliente não autorizou o serviço",
  "Endereço não encontrado",
  "Sem acesso ao local",
  "Cliente reagendou",
  "Outro",
];

export default function NotCompletedDialog({ open, onOpenChange, onConfirm, loading }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Seu navegador não suporta captura de localização.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          captured_at: new Date().toISOString(),
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        let msg = "Não foi possível capturar a localização.";
        if (err.code === 1) msg = "Permissão de localização negada. Autorize o acesso no navegador.";
        else if (err.code === 2) msg = "Posição indisponível. Verifique o GPS.";
        else if (err.code === 3) msg = "Tempo esgotado ao capturar localização.";
        setGeoError(msg);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const handleConfirm = () => {
    if (!reason) return;
    if (!location) return;
    onConfirm({ reason, notes, location });
  };

  const canConfirm = reason && location && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" /> Não Concluir OS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Justifique o motivo de não concluir esta OS. A localização será capturada para registro.
          </p>

          {/* Motivo */}
          <div>
            <Label className="text-xs font-semibold">Motivo <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Observação */}
          <div>
            <Label className="text-xs font-semibold">Observação</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalhe o que aconteceu no atendimento..."
            />
          </div>

          {/* Localização */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-1 text-sm font-medium">
              <MapPin className="h-4 w-4 text-primary" /> Localização <span className="text-destructive">*</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={captureLocation} disabled={locating}>
                {locating ? "Capturando..." : <><MapPin className="h-3 w-3" /> Capturar Localização</>}
              </Button>
              {location && (
                <span className="text-xs text-emerald-600 font-medium">
                  ✓ Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}
                </span>
              )}
            </div>
            {geoError && (
              <div className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {geoError}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canConfirm}>
            {loading ? "Registrando..." : "Confirmar Não Conclusão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
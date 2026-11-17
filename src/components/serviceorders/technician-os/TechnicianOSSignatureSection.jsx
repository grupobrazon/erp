import React, { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PenTool, MapPin, Camera, CheckCircle2, AlertTriangle } from "lucide-react";
import SignaturePad from "@/components/balcao/SignaturePad";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function TechnicianOSSignatureSection({ form, setForm, readOnly }) {
  const clientSigRef = useRef(null);
  const techSigRef = useRef(null);
  const [uploadingSig, setUploadingSig] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const { toast } = useToast();

  const uploadSignature = async (which) => {
    const ref = which === "client" ? clientSigRef : techSigRef;
    if (!ref.current || ref.current.isEmpty()) return;
    setUploadingSig(which);
    try {
      const blob = await ref.current.getBlob();
      const file = new File([blob], `assinatura_${which}.png`, { type: "image/png" });
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm(p => ({ ...p, [which === "client" ? "client_signature_url" : "technician_signature_url"]: file_url }));
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingSig(null);
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Seu navegador não suporta captura de localização. Use a entrada manual abaixo.");
      setShowManual(true);
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(p => ({
          ...p,
          location_lat: pos.coords.latitude,
          location_lng: pos.coords.longitude,
          location_captured_at: new Date().toISOString(),
        }));
        setLocating(false);
        setGeoError(null);
        setShowManual(false);
      },
      (err) => {
        console.error(err);
        setLocating(false);
        let msg = "Não foi possível capturar a localização.";
        if (err.code === 1) msg = "Permissão de localização negada. Autorize o acesso no navegador ou use a entrada manual.";
        else if (err.code === 2) msg = "Posição indisponível. Verifique o GPS ou use a entrada manual.";
        else if (err.code === 3) msg = "Tempo esgotado ao capturar localização. Tente novamente ou use a entrada manual.";
        setGeoError(msg);
        setShowManual(true);
        toast({ title: "Localização não capturada", description: msg, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Nome completo de quem recebeu <span className="text-destructive">*</span></Label>
          <Input value={form.client_full_name || ""} onChange={e => setForm(p => ({ ...p, client_full_name: e.target.value }))} placeholder="Nome da pessoa que recebeu o atendimento" disabled={readOnly} />
        </div>
        <div>
          <Label className="text-xs">Documento (RG ou CPF) <span className="text-destructive">*</span></Label>
          <Input value={form.client_document || ""} onChange={e => setForm(p => ({ ...p, client_document: e.target.value }))} placeholder="RG ou CPF" disabled={readOnly} />
        </div>
      </div>

      <div>
        <Label className="text-xs">Nome do técnico responsável <span className="text-destructive">*</span></Label>
        <Input value={form.technician_name || ""} onChange={e => setForm(p => ({ ...p, technician_name: e.target.value }))} placeholder="Nome do técnico que executou o atendimento" disabled={readOnly} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <SignaturePad ref={clientSigRef} label="Assinatura do Cliente" locked={!!form.client_signature_url} onClear={() => setForm(p => ({ ...p, client_signature_url: "" }))} imageUrl={form.client_signature_url} />
          <Button type="button" variant="outline" size="sm" className="mt-1" disabled={uploadingSig === "client" || readOnly || !!form.client_signature_url} onClick={() => uploadSignature("client")}>
            {uploadingSig === "client" ? "Salvando..." : "Salvar Assinatura Cliente"}
          </Button>
          {form.client_signature_url && <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Assinatura salva</div>}
        </div>
        <div>
          <SignaturePad ref={techSigRef} label="Assinatura do Técnico" locked={!!form.technician_signature_url} onClear={() => setForm(p => ({ ...p, technician_signature_url: "" }))} imageUrl={form.technician_signature_url} />
          <Button type="button" variant="outline" size="sm" className="mt-1" disabled={uploadingSig === "technician" || readOnly || !!form.technician_signature_url} onClick={() => uploadSignature("technician")}>
            {uploadingSig === "technician" ? "Salvando..." : "Salvar Assinatura Técnico"}
          </Button>
          {form.technician_signature_url && <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Assinatura salva</div>}
        </div>
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center gap-1 text-sm font-medium"><MapPin className="h-4 w-4 text-primary" /> Localização do Atendimento <span className="text-destructive">*</span></div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button type="button" variant="outline" size="sm" onClick={captureLocation} disabled={locating || readOnly}>
            {locating ? "Capturando..." : <><MapPin className="h-3 w-3" /> Capturar Localização</>}
          </Button>
          {form.location_lat != null && form.location_lng != null && (
            <div className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Lat: {form.location_lat.toFixed(6)}, Lng: {form.location_lng.toFixed(6)}
              {form.location_captured_at && <span className="ml-2 text-muted-foreground">— {new Date(form.location_captured_at).toLocaleString("pt-BR")}</span>}
            </div>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowManual(!showManual)} disabled={readOnly}>
            {showManual ? "Ocultar manual" : "Inserir manualmente"}
          </Button>
        </div>
        {geoError && (
          <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/5 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {geoError}
          </div>
        )}
        {showManual && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Latitude</Label>
              <Input
                type="number"
                step="0.000001"
                value={form.location_lat ?? ""}
                onChange={e => setForm(p => ({ ...p, location_lat: e.target.value ? parseFloat(e.target.value) : null, location_captured_at: p.location_captured_at || new Date().toISOString() }))}
                placeholder="Ex: -23.5505"
                disabled={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs">Longitude</Label>
              <Input
                type="number"
                step="0.000001"
                value={form.location_lng ?? ""}
                onChange={e => setForm(p => ({ ...p, location_lng: e.target.value ? parseFloat(e.target.value) : null, location_captured_at: p.location_captured_at || new Date().toISOString() }))}
                placeholder="Ex: -46.6333"
                disabled={readOnly}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Wrench, Truck, DollarSign, Play, CheckCircle2, Camera, Clock } from "lucide-react";

const statusColors = {
  "Liberado para Técnico": "bg-blue-100 text-blue-700",
  "Em Execução": "bg-purple-100 text-purple-700",
  "Concluída pelo Técnico": "bg-emerald-100 text-emerald-700",
};

export default function TechnicianOSExecutionDialog({ serviceOrder, onClose }) {
  const os = serviceOrder;
  const [receivedAmount, setReceivedAmount] = useState(os.received_amount || "");
  const [receivedMethod, setReceivedMethod] = useState(os.received_method || "");
  const [receiptPhoto, setReceiptPhoto] = useState(os.received_photo_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const addr = os.delivery_address || {};
  const canStart = os.status === "Liberado para Técnico";
  const canComplete = os.status === "Em Execução";

  const handleUploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setReceiptPhoto(res.file_url);
    } catch {
      // ignore
    }
    setUploading(false);
  };

  const handleStart = async () => {
    setSaving(true);
    try {
      await base44.entities.ServiceOrder.update(os.id, { status: "Em Execução" });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const data = { status: "Concluída pelo Técnico", tech_completion_date: new Date().toISOString().slice(0, 10) };
      if (os.has_pending_payment) {
        data.received_amount = Number(receivedAmount) || 0;
        data.received_method = receivedMethod || undefined;
        if (receiptPhoto) data.received_photo_url = receiptPhoto;
      }
      await base44.entities.ServiceOrder.update(os.id, data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{os.code}</span>
            <Badge className={statusColors[os.status] || "bg-muted text-muted-foreground"}>{os.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client + Address */}
          <div>
            <p className="font-medium">{os.client_name}</p>
            {addr.street && (
              <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                {addr.street}, {addr.number}{addr.complement ? ` — ${addr.complement}` : ""} — {addr.neighborhood}, {addr.city}/{addr.state}
                {addr.zip_code && ` — CEP ${addr.zip_code}`}
              </p>
            )}
          </div>

          {/* Instruction type */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              {os.type === "Entrega + Instalação" ? <Wrench className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
              {os.type}
            </Badge>
          </div>

          {/* Instructions */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4 text-sm space-y-2">
              <p className="font-medium text-xs uppercase text-muted-foreground tracking-wider">Instruções</p>
              {os.type === "Entrega" && (
                <p>Realizar a <strong>entrega</strong> do equipamento no endereço do cliente.</p>
              )}
              {os.type === "Entrega + Instalação" && (
                <p>Realizar a <strong>entrega e instalação</strong> do equipamento no endereço do cliente. Verificar o funcionamento correto após a instalação.</p>
              )}
              {os.service_description && (
                <p className="text-muted-foreground">{os.service_description}</p>
              )}
              {os.technician_notes && (
                <p className="text-amber-700 font-medium">⚠ {os.technician_notes}</p>
              )}
            </CardContent>
          </Card>

          {/* Pending payment */}
          {os.has_pending_payment && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-amber-700" />
                  <p className="font-medium text-sm text-amber-900">
                    Pagamento Pendente — R$ {os.pending_payment_amount?.toFixed(2)}
                  </p>
                </div>
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Recebimento: {os.pending_payment_moment}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Valor Recebido</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={receivedAmount}
                      onChange={e => setReceivedAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Forma de Recebimento</Label>
                    <Select value={receivedMethod || "__none__"} onValueChange={setReceivedMethod}>
                      <SelectTrigger><span>{receivedMethod || "Selecione"}</span></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                        <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Foto do Comprovante</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => handleUploadPhoto(e.target.files?.[0])}
                      />
                      <Button variant="outline" size="sm" type="button" disabled={uploading} className="gap-2">
                        <Camera className="h-4 w-4" />
                        {uploading ? "Enviando..." : "Anexar Foto"}
                      </Button>
                    </label>
                    {receiptPhoto && (
                      <img src={receiptPhoto} alt="Comprovante" className="h-12 w-12 object-cover rounded" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          {canStart && (
            <Button onClick={handleStart} disabled={saving} className="gap-2">
              <Play className="h-4 w-4" />
              {saving ? "Iniciando..." : "Iniciar OS"}
            </Button>
          )}
          {canComplete && (
            <Button onClick={handleComplete} disabled={saving} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {saving ? "Concluindo..." : "Concluir OS"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
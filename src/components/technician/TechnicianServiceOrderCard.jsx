import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MapPin, Package, Wrench, Camera, CheckCircle2, DollarSign,
  Clock, User, FileText, Navigation, Paperclip, ExternalLink, Phone
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;
const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleString("pt-BR") : "—";

export default function TechnicianServiceOrderCard({ order, sale }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [checkin, setCheckin] = useState(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [docPhoto, setDocPhoto] = useState(order.tech_client_doc_photo || "");
  const [servicePhotos, setServicePhotos] = useState(order.tech_service_photos || []);
  const [completionDate, setCompletionDate] = useState(order.tech_completion_date || new Date().toISOString().slice(0, 10));
  const [receivedAmount, setReceivedAmount] = useState(order.pending_payment_amount || 0);
  const [receivedMethod, setReceivedMethod] = useState(order.received_method || "");
  const [receivedPhotoUrl, setReceivedPhotoUrl] = useState(order.received_photo_url || "");
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState(order.payment_receipt_url || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const addr = order.delivery_address || {};
  const isInstall = order.type === "Entrega + Instalação";
  const isExec = order.status === "Em Execução";
  const isDone = order.status === "Concluída pelo Técnico" || order.status === "Concluída";
  const TypeIcon = isInstall ? Wrench : Package;

  const doCheckin = () => {
    setCheckinLoading(true);
    if (!navigator.geolocation) {
      toast({ title: "GPS não disponível", variant: "destructive" });
      setCheckinLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCheckin({ lat: pos.coords.latitude, lng: pos.coords.longitude, time: new Date().toISOString() });
        setCheckinLoading(false);
        toast({ title: "Check-in registrado", description: `Localização capturada às ${new Date().toLocaleTimeString("pt-BR")}` });
      },
      (err) => {
        toast({ title: "Erro ao obter localização", description: err.message, variant: "destructive" });
        setCheckinLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const uploadFile = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  const handleDocPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      setDocPhoto(url);
    } catch (err) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    }
  };

  const handleServicePhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      const urls = await Promise.all(files.map(uploadFile));
      setServicePhotos(prev => [...prev, ...urls]);
    } catch (err) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    }
  };

  const handlePaymentPhoto = async (e, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      setter(url);
    } catch (err) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    }
  };

  const startExecution = async () => {
    setSaving(true);
    try {
      await base44.entities.ServiceOrder.update(order.id, {
        status: "Em Execução",
        tech_checkin_lat: checkin?.lat || null,
        tech_checkin_lng: checkin?.lng || null,
        tech_checkin_time: checkin?.time || new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["techServiceOrders"] });
      toast({ title: "Serviço iniciado — check-in registrado" });
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const completeService = async () => {
    if (!docPhoto) {
      toast({ title: "Tire a foto do documento do cliente", variant: "destructive" });
      return;
    }
    if (servicePhotos.length === 0) {
      toast({ title: "Tire pelo menos uma foto do serviço realizado", variant: "destructive" });
      return;
    }
    if (order.has_pending_payment && !paymentReceiptUrl) {
      toast({ title: "Anexe o comprovante do pagamento recebido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updateData = {
        status: "Concluída pelo Técnico",
        tech_client_doc_photo: docPhoto,
        tech_service_photos: servicePhotos,
        tech_completion_date: completionDate,
        notes: notes || order.notes || "",
      };
      if (checkin) {
        updateData.tech_checkin_lat = checkin.lat;
        updateData.tech_checkin_lng = checkin.lng;
        updateData.tech_checkin_time = checkin.time;
      } else if (order.tech_checkin_lat) {
        updateData.tech_checkin_lat = order.tech_checkin_lat;
        updateData.tech_checkin_lng = order.tech_checkin_lng;
        updateData.tech_checkin_time = order.tech_checkin_time;
      }
      if (order.has_pending_payment) {
        updateData.received_amount = receivedAmount;
        updateData.received_method = receivedMethod;
        updateData.received_photo_url = receivedPhotoUrl;
        updateData.payment_receipt_url = paymentReceiptUrl;
      }
      await base44.entities.ServiceOrder.update(order.id, updateData);
      queryClient.invalidateQueries({ queryKey: ["techServiceOrders"] });
      toast({ title: "Serviço concluído!", description: "A empresa irá finalizar a ordem de serviço." });
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={isExec ? "border-primary/40" : ""}>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5 text-primary" />
            <span className="font-mono font-bold">{order.code}</span>
            <Badge variant="outline">{order.type}</Badge>
          </div>
          <Badge className={
            isExec ? "bg-primary/10 text-primary" :
            isDone ? "bg-emerald-100 text-emerald-700" :
            "bg-blue-100 text-blue-700"
          }>
            {order.status === "Liberado para Técnico" ? "Aguardando Início" :
             isExec ? "Em Execução" :
             isDone ? "Concluída" : order.status}
          </Badge>
        </div>

        {/* Client info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{order.client_name || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Pedido:</span>
            <span className="font-mono text-xs">{order.sale_order_number || "—"}</span>
          </div>
        </div>

        {/* Address */}
        {addr.street && (
          <div className="rounded-lg border p-3 text-sm bg-muted/20">
            <div className="flex items-center gap-1 mb-1 font-medium">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Endereço de Entrega
            </div>
            <p>{addr.street}, {addr.number}{addr.complement ? ` — ${addr.complement}` : ""} — {addr.neighborhood}</p>
            <p>{addr.city}/{addr.state} — CEP {addr.zip_code}</p>
            {addr.city && (
              <Button variant="ghost" size="sm" className="mt-1 h-7 gap-1 px-1" asChild>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${addr.street}, ${addr.number}, ${addr.city}, ${addr.state}`)}`} target="_blank" rel="noreferrer">
                  <Navigation className="h-3 w-3" /> Traçar Rota
                </a>
              </Button>
            )}
          </div>
        )}

        {/* Service description */}
        {order.service_description && (
          <div className="text-sm text-muted-foreground bg-muted/10 rounded p-2">
            {order.service_description}
          </div>
        )}

        {/* Items to deliver */}
        {sale?.items?.length > 0 && (
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Itens para Entrega/Instalação</div>
            <div className="space-y-1">
              {sale.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.product_name}</span>
                  <span className="font-bold text-primary">{item.quantity}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending payment */}
        {order.has_pending_payment && (
          <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm">
            <div className="flex items-center gap-1 mb-1 font-medium text-blue-800">
              <DollarSign className="h-4 w-4" /> Recebimento Pendente
            </div>
            <p className="text-blue-900">
              Valor a receber: <strong>{fmtMoney(order.pending_payment_amount)}</strong> — {order.pending_payment_moment}
            </p>
          </div>
        )}

        {/* Technician notes from company */}
        {order.technician_notes && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <div className="font-medium text-amber-800 mb-1">Observações da Empresa</div>
            <p className="text-amber-900 whitespace-pre-wrap">{order.technician_notes}</p>
          </div>
        )}

        {/* Check-in */}
        {!isDone && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm flex items-center gap-1">
                <Navigation className="h-4 w-4 text-primary" /> Check-in no Local
              </h4>
              {checkin ? (
                <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Check-in feito
                </Badge>
              ) : order.tech_checkin_lat ? (
                <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Check-in registrado
                </Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={doCheckin} disabled={checkinLoading}>
                  {checkinLoading ? "Capturando..." : "Fazer Check-in"}
                </Button>
              )}
            </div>
            {(checkin || order.tech_checkin_lat) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {checkin ? fmtDate(checkin.time) : fmtDate(order.tech_checkin_time)}
                {(checkin?.lat || order.tech_checkin_lat) && (
                  <a href={`https://www.google.com/maps?q=${checkin?.lat || order.tech_checkin_lat},${checkin?.lng || order.tech_checkin_lng}`} target="_blank" rel="noreferrer" className="text-primary hover:underline ml-1">
                    Ver no mapa
                  </a>
                )}
              </p>
            )}
          </div>
        )}

        {/* Start execution */}
        {order.status === "Liberado para Técnico" && (
          <Button className="w-full gap-2" onClick={startExecution} disabled={saving || (!checkin && !order.tech_checkin_lat)}>
            <Wrench className="h-4 w-4" /> Iniciar Serviço
          </Button>
        )}

        {/* Execution form */}
        {isExec && (
          <div className="space-y-4 rounded-lg border-2 border-primary/30 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1">
              <Camera className="h-4 w-4 text-primary" /> Registro do Serviço
            </h4>

            {/* Document photo */}
            <div>
              <Label className="text-xs">Foto do Documento do Cliente *</Label>
              <input type="file" accept="image/*" capture="environment" className="hidden" id={`doc-${order.id}`} onChange={handleDocPhoto} />
              <div className="flex items-center gap-2 mt-1">
                {docPhoto ? (
                  <>
                    <img src={docPhoto} alt="Documento" className="h-16 w-16 object-cover rounded border" />
                    <Button variant="outline" size="sm" onClick={() => document.getElementById(`doc-${order.id}`).click()}>
                      <Camera className="h-3 w-3" /> Trocar
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => document.getElementById(`doc-${order.id}`).click()}>
                    <Paperclip className="h-3 w-3" /> Tirar Foto do Documento
                  </Button>
                )}
              </div>
            </div>

            {/* Service photos */}
            <div>
              <Label className="text-xs">Fotos do Serviço Realizado * (mínimo 1)</Label>
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" id={`svc-${order.id}`} onChange={handleServicePhotos} />
              <div className="flex flex-wrap gap-2 mt-1">
                {servicePhotos.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`Serviço ${i + 1}`} className="h-16 w-16 object-cover rounded border" />
                    <button onClick={() => setServicePhotos(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">×</button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-16 w-16" onClick={() => document.getElementById(`svc-${order.id}`).click()}>
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Completion date */}
            <div>
              <Label className="text-xs">Data de Conclusão</Label>
              <Input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} />
            </div>

            {/* Pending payment collection */}
            {order.has_pending_payment && (
              <div className="space-y-3 border-t pt-3">
                <h5 className="text-xs font-medium text-blue-700 flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> Recebimento do Pagamento Pendente
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Valor Recebido</Label>
                    <Input type="number" step="0.01" value={receivedAmount} onChange={e => setReceivedAmount(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label className="text-xs">Forma de Recebimento</Label>
                    <Select value={receivedMethod} onValueChange={setReceivedMethod}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                        <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                        <SelectItem value="PIX">PIX</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="file" accept="image/*" capture="environment" className="hidden" id={`pay-photo-${order.id}`} onChange={e => handlePaymentPhoto(e, setReceivedPhotoUrl)} />
                  <input type="file" accept="image/*,.pdf" className="hidden" id={`pay-receipt-${order.id}`} onChange={e => handlePaymentPhoto(e, setPaymentReceiptUrl)} />
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => document.getElementById(`pay-photo-${order.id}`).click()}>
                    <Paperclip className="h-3 w-3" /> Foto do Dinheiro
                  </Button>
                  {receivedPhotoUrl && (
                    <img src={receivedPhotoUrl} alt="Dinheiro" className="h-10 w-10 object-cover rounded border" />
                  )}
                  {paymentReceiptUrl ? (
                    <Button variant="outline" size="sm" className="gap-1" asChild>
                      <a href={paymentReceiptUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Ver Comprovante</a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => document.getElementById(`pay-receipt-${order.id}`).click()}>
                      <Paperclip className="h-3 w-3" /> Anexar Comprovante *
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações sobre o serviço realizado..." />
            </div>

            <Button className="w-full gap-2" onClick={completeService} disabled={saving}>
              <CheckCircle2 className="h-4 w-4" /> {saving ? "Concluindo..." : "Concluir Serviço"}
            </Button>
          </div>
        )}

        {/* Completed summary */}
        {isDone && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-2 text-sm">
            <div className="font-medium text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Serviço Concluído pelo Técnico
            </div>
            {order.tech_completion_date && (
              <p className="text-emerald-900">Data: {fmtDate(order.tech_completion_date)}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {order.tech_client_doc_photo && (
                <img src={order.tech_client_doc_photo} alt="Documento" className="h-16 w-16 object-cover rounded border" />
              )}
              {(order.tech_service_photos || []).map((url, i) => (
                <img key={i} src={url} alt={`Serviço ${i + 1}`} className="h-16 w-16 object-cover rounded border" />
              ))}
            </div>
            {order.received_amount > 0 && (
              <p className="text-blue-800">Recebido: {fmtMoney(order.received_amount)} — {order.received_method || "—"}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
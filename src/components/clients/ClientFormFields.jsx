import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, RefreshCw, MapPin, Navigation, Plus, Star } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import ManualZoneAssignmentDialog from "@/components/clients/ManualZoneAssignmentDialog";
import ZooxPhonesSection from "@/components/clients/ZooxPhonesSection";
import ClientEquipmentSection from "@/components/clients/ClientEquipmentSection";
import ClientAdditionalAddresses from "@/components/clients/ClientAdditionalAddresses";
import { usePermissions } from "@/lib/permissions";

export const defaultForm = {
  base_type: "Novo",
  person_type: "Física",
  client_type: "",
  name: "",
  fantasy_name: "",
  document: "",
  state_registration: "",
  ie_exempt: false,
  email: "",
  birth_date: "",
  phone1: "", phone1_name: "", phone1_whatsapp: false,
  phone2: "", phone2_name: "", phone2_whatsapp: false,
  phone3: "", phone3_name: "", phone3_whatsapp: false,
  phone4: "", phone4_name: "", phone4_whatsapp: false,
  phone5: "", phone5_name: "", phone5_whatsapp: false,
  zoox_phone1: "", zoox_phone2: "", zoox_phone3: "", zoox_phone4: "", zoox_phone5: "", zoox_phone6: "", zoox_phone7: "",
  zip_code: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "",
  status: "Novo",
  old_code: "",
  last_purchase_date: "",
  last_product: "",
  registration_date: format(new Date(), "yyyy-MM-dd"),
  notes: "",
  route_zone_id: "", route_zone_name: "", route_calendar_id: "", route_calendar_name: "",
};

const STATUS_OPTIONS = [
  { value: "Base Inativa LSOFT", label: "Base Inativa LSOFT" },
  { value: "Ótimo - Cliente Brazon", label: "Ótimo - Cliente Brazon (tem compra de purificador)" },
  { value: "Ótimo", label: "Ótimo (1 compra)" },
  { value: "Ótimo Recorrente", label: "Ótimo Recorrente (mais de 1 compra)" },
  { value: "Novo", label: "Novo" },
];
const BASE_OPTIONS = ["Lsoft", "Ótimo", "Novo"];
const BR_STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function ClientFormFields({ form, update, isEditing, previewCode, loadingCep, buscarCep, clientId, docError }) {
  const { phonesAddOnly, commercialInfoReadOnly, canAssignZone } = usePermissions();
  const phoneLocked = (n) => phonesAddOnly && isEditing && !!form[`phone${n}`];
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [recalcZone, setRecalcZone] = useState(false);
  const [showManualZone, setShowManualZone] = useState(false);

  // Detecta se o cliente está sem zona atribuída (NÃO PARAMETRIZADA ou vazio)
  const hasNoZone = !form.route_zone_id && (!form.route_assignments || form.route_assignments.length === 0 || form.route_assignments.every(a => !a.zone_id));

  const recalcularZona = async () => {
    if (!clientId) return;
    if (!form.city || !form.neighborhood) {
      toast({ title: "Endereço incompleto", description: "Preencha cidade e bairro antes de recalcular a zona.", variant: "destructive" });
      return;
    }
    setRecalcZone(true);
    try {
      const res = await base44.functions.invoke("assignClientsToZones", {
        client_id: clientId,
        dry_run: false,
      });
      const data = res.data || res;
      // Re-fetch the client to get updated route_assignments
      const updated = await base44.entities.Client.get(clientId);
      if (updated) {
        update("route_assignments", updated.route_assignments || []);
        update("route_zone_id", updated.route_zone_id || "");
        update("route_zone_name", updated.route_zone_name || "");
        update("route_calendar_id", updated.route_calendar_id || "");
        update("route_calendar_name", updated.route_calendar_name || "");
      }
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      const hasZone = (updated?.route_assignments || []).some(a => a.zone_id);
      toast({
        title: hasZone ? "Zona recalculada" : "Macrorregião atribuída (sem sub-zona)",
        description: hasZone
          ? `${(updated?.route_assignments || []).filter(a => a.zone_id).length} zona(s) atribuída(s).`
          : "O bairro não foi classificado em nenhuma sub-zona. Verifique se o bairro está correto.",
        variant: hasZone ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "Erro ao recalcular zona", description: err?.message, variant: "destructive" });
    } finally {
      setRecalcZone(false);
    }
  };
  return (
    <>
      {/* Identificação */}
      <Card>
        <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>Código do Cliente</Label>
            <Input value={previewCode || "Gerado automaticamente"} disabled className="bg-muted font-mono font-semibold" />
          </div>
          <div>
            <Label>Base *</Label>
            <Select value={form.base_type} onValueChange={v => update("base_type", v)} disabled>
              <SelectTrigger><span className={!form.base_type ? "text-muted-foreground" : ""}>{form.base_type || "Selecione..."}</span></SelectTrigger>
              <SelectContent>
                {BASE_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de Pessoa *</Label>
            <Select value={form.person_type} onValueChange={v => update("person_type", v)}>
              <SelectTrigger><span className={!form.person_type ? "text-muted-foreground" : ""}>{form.person_type === "Física" ? "Pessoa Física" : form.person_type === "Jurídica" ? "Pessoa Jurídica" : "Selecione..."}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="Física">Pessoa Física</SelectItem>
                <SelectItem value="Jurídica">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status / Lista *</Label>
            <Select value={form.status} onValueChange={v => update("status", v)} disabled>
              <SelectTrigger><span className={!form.status ? "text-muted-foreground" : ""}>{STATUS_OPTIONS.find(s => s.value === form.status)?.label || "Selecione..."}</span></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Código Antigo</Label>
            <Input value={form.old_code} onChange={e => update("old_code", e.target.value)} placeholder="Ex: 8, 15, 22..." disabled className="bg-muted" />
          </div>
          <div>
            <Label>Data de Cadastro</Label>
            <Input type="date" value={form.registration_date} onChange={e => update("registration_date", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Dados Pessoais */}
      <Card>
        <CardHeader><CardTitle className="text-base">
          {form.person_type === "Jurídica" ? "Dados da Empresa" : "Dados Pessoais"}
        </CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="flex items-center gap-1.5">
              {form.person_type === "Jurídica" ? "Razão Social *" : "Nome Completo *"}
              {form.vip_client && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> Cliente VIP
                </span>
              )}
            </Label>
            <Input value={form.name} onChange={e => update("name", e.target.value)} required />
          </div>
          {form.person_type === "Jurídica" && (
            <div className="col-span-2">
              <Label>Nome Fantasia</Label>
              <Input value={form.fantasy_name} onChange={e => update("fantasy_name", e.target.value)} />
            </div>
          )}
          {form.person_type === "Jurídica" && (
            <div>
              <Label>Tipo de Cliente *</Label>
              <Select value={form.client_type || ""} onValueChange={v => update("client_type", v)}>
                <SelectTrigger><span className={!form.client_type ? "text-muted-foreground" : ""}>{form.client_type || "Selecione..."}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Consumidor Final">Consumidor Final</SelectItem>
                  <SelectItem value="Revenda">Revenda</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{form.person_type === "Jurídica" ? "CNPJ" : "CPF"}</Label>
            <Input value={form.document} onChange={e => update("document", e.target.value)} placeholder={form.person_type === "Jurídica" ? "00.000.000/0001-00" : "000.000.000-00"} />
            {docError && <p className="text-xs text-destructive mt-1">{docError}</p>}
          </div>
          {form.person_type === "Jurídica" && (
            <div>
              <Label>Inscrição Estadual</Label>
              <Input
                value={form.ie_exempt ? "ISENTO" : form.state_registration}
                onChange={e => update("state_registration", e.target.value)}
                disabled={form.ie_exempt}
                placeholder="000.000.000.000"
              />
              <div className="flex items-center gap-2 mt-1">
                <Checkbox
                  id="ie_exempt"
                  checked={!!form.ie_exempt}
                  onCheckedChange={v => {
                    update("ie_exempt", v);
                    if (v) update("client_type", "Consumidor Final");
                  }}
                />
                <Label htmlFor="ie_exempt" className="text-sm cursor-pointer">Isento de IE</Label>
              </div>
            </div>
          )}
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={e => update("email", e.target.value)} />
          </div>
          {form.person_type === "Física" && (
            <div>
              <Label>Data de Nascimento</Label>
              <Input type="date" value={form.birth_date} onChange={e => update("birth_date", e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telefones */}
      <Card>
        <CardHeader><CardTitle className="text-base">Telefones</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} className="grid grid-cols-5 gap-3 items-end">
              <div className="col-span-2">
                <Label>Nome do Contato {n}</Label>
                <Input value={form[`phone${n}_name`]} onChange={e => update(`phone${n}_name`, e.target.value)} placeholder="Ex: João, Financeiro..." disabled={phoneLocked(n)} />
              </div>
              <div className="col-span-2">
                <Label>Telefone {n}</Label>
                <Input value={form[`phone${n}`]} onChange={e => update(`phone${n}`, e.target.value)} placeholder="(00) 00000-0000" disabled={phoneLocked(n)} />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  id={`phone${n}_whatsapp`}
                  checked={!!form[`phone${n}_whatsapp`]}
                  onCheckedChange={v => update(`phone${n}_whatsapp`, v)}
                  disabled={phoneLocked(n)}
                />
                <Label htmlFor={`phone${n}_whatsapp`} className="text-sm cursor-pointer text-green-600 font-medium">WhatsApp</Label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Endereço */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Endereço Principal</CardTitle>
            {isEditing && clientId && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={recalcularZona}
                  disabled={recalcZone}
                  className="gap-1.5"
                >
                  {recalcZone ? (
                    <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Recalcular Zona
                </Button>
                {canAssignZone && (
                  <Button
                    type="button"
                    variant={hasNoZone ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowManualZone(true)}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Atribuir Zona
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>CEP</Label>
              <Input
                value={form.zip_code}
                onChange={e => update("zip_code", e.target.value)}
                onBlur={buscarCep}
                placeholder="00000-000"
                maxLength={9}
              />
            </div>
            <Button type="button" variant="outline" size="icon" onClick={buscarCep} disabled={loadingCep}>
              {loadingCep ? <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <div className="col-span-2">
            <Label>Logradouro</Label>
            <Input value={form.street} onChange={e => update("street", e.target.value)} />
          </div>
          <div>
            <Label>Número *</Label>
            <Input value={form.number} onChange={e => update("number", e.target.value)} required />
          </div>
          <div>
            <Label>Complemento *</Label>
            <Input value={form.complement} onChange={e => update("complement", e.target.value)} required />
          </div>
          <div>
            <Label>Bairro</Label>
            <Input value={form.neighborhood} onChange={e => update("neighborhood", e.target.value)} />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={form.city} onChange={e => update("city", e.target.value)} />
          </div>
          <div>
            <Label>UF</Label>
            <Select value={form.state} onValueChange={v => update("state", v)}>
              <SelectTrigger><span className={!form.state ? "text-muted-foreground" : ""}>{form.state || "UF"}</span></SelectTrigger>
              <SelectContent>
                {BR_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Regional</Label>
            <Input
              value={form.regional || ""}
              readOnly
              className="bg-muted font-medium"
              placeholder="Atribuída automaticamente pelo endereço"
            />
          </div>
          {/* Zona de Rota (atribuída pela varredura — multi-zona) */}
          <div className="col-span-2 md:col-span-4">
            <Label>Zonas de Rota / Regiões (multi-zona)</Label>
            <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg border bg-muted/20 min-h-[2.5rem]">
              {form.route_assignments && form.route_assignments.length > 0 ? (
                form.route_assignments.map((ra, i) => (
                  ra.zone_name ? (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-sm font-medium">
                      <Navigation className="h-3.5 w-3.5" /> {ra.zone_name}
                      {ra.calendar_name && <span className="text-primary/60 text-xs">· {ra.calendar_name}</span>}
                    </span>
                  ) : ra.calendar_name ? (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 text-sm font-medium">
                      <MapPin className="h-3.5 w-3.5" /> {ra.calendar_name} (sem zona específica)
                    </span>
                  ) : null
                ))
              ) : form.route_zone_name || form.route_calendar_name ? (
                form.route_zone_name ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-sm font-medium">
                    <Navigation className="h-3.5 w-3.5" /> {form.route_zone_name}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 text-sm font-medium">
                    <MapPin className="h-3.5 w-3.5" /> {form.route_calendar_name} (sem zona específica)
                  </span>
                )
              ) : (
                <span className="text-sm text-muted-foreground">Sem zona atribuída — a atribuição é automática ao cadastrar o cliente</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endereços Adicionais */}
      {isEditing && <ClientAdditionalAddresses clientId={clientId} />}

      {/* Informações Comerciais */}
      <Card>
        <CardHeader><CardTitle className="text-base">Informações Comerciais</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Produto / Última Compra</Label>
            <Input value={form.last_product} onChange={e => update("last_product", e.target.value)} placeholder="Ex: Purificador Exclusive" disabled={commercialInfoReadOnly} />
            {commercialInfoReadOnly && <p className="text-xs text-muted-foreground mt-1">Atualizado automaticamente após cada venda</p>}
          </div>
          <div>
            <Label>Data da Última Compra</Label>
            <Input value={form.last_purchase_date} onChange={e => update("last_purchase_date", e.target.value)} placeholder="Ex: out/23" disabled={commercialInfoReadOnly} />
          </div>
          <div className="col-span-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Equipamentos Cadastrados */}
      <ClientEquipmentSection clientId={isEditing ? clientId : null} />

      {/* Mailing / Contatos Antigos (Zoox) */}
      <ZooxPhonesSection form={form} update={update} />

      {/* Diálogo de atribuição manual de zona */}
      {isEditing && clientId && canAssignZone && (
        <ManualZoneAssignmentDialog
          open={showManualZone}
          onOpenChange={setShowManualZone}
          client={{ ...form, id: clientId }}
          onAssigned={async () => {
            const updated = await base44.entities.Client.get(clientId);
            if (updated) {
              update("route_assignments", updated.route_assignments || []);
              update("route_zone_id", updated.route_zone_id || "");
              update("route_zone_name", updated.route_zone_name || "");
              update("route_calendar_id", updated.route_calendar_id || "");
              update("route_calendar_name", updated.route_calendar_name || "");
            }
          }}
        />
      )}
    </>
  );
}
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Calendar, Clock, MessageSquare, AlertTriangle, CheckCircle2, Plus, X } from "lucide-react";

/**
 * Aba "Detalhamento do Serviço" — substitui o antigo "Relacionamento com o Cliente".
 * Para Entrega/Entrega+Instalação: o vendedor detalha os tipos de serviço que serão
 * feitos na casa do cliente (seleção via dropdown + botão adicionar) + observação obrigatória.
 * Para Envio: mantém os prazos de expedição/recebimento (sem atendimento na casa do cliente).
 */
export default function CustomerRelationshipTab({ form, setForm }) {
  const [selectedOption, setSelectedOption] = useState("");
  const [customName, setCustomName] = useState("");
  const [showCustomField, setShowCustomField] = useState(false);

  const isEnvio = form.delivery_modality === "Envio";
  const requiresServiceDetail = form.delivery_modality === "Entrega Própria" || form.delivery_modality === "Entrega + Instalação";

  const { data: serviceTypes = [], isLoading } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => base44.entities.ServiceType.list("order", 500),
  });
  const activeServiceTypes = serviceTypes.filter(s => s.is_active !== false);

  const selectedTypes = form.service_detail_types || [];
  const hasDetail = selectedTypes.length > 0 && (form.service_detail_notes || "").trim().length > 0;

  const isAlreadySelected = (id, name) => selectedTypes.some(t => (t.service_type_id && t.service_type_id === id) || (!id && t.service_type_name === name));

  const addSelected = () => {
    if (!selectedOption) return;

    if (selectedOption === "custom") {
      // Mostra o campo para detalhar o serviço personalizado
      setShowCustomField(true);
      return;
    }

    const st = activeServiceTypes.find(s => s.id === selectedOption);
    if (!st) return;
    if (isAlreadySelected(st.id, st.name)) return;

    setForm(prev => ({
      ...prev,
      service_detail_types: [...(prev.service_detail_types || []), { service_type_id: st.id, service_type_name: st.name }],
    }));
    setSelectedOption("");
  };

  const confirmCustom = () => {
    const name = customName.trim();
    if (!name) return;
    if (isAlreadySelected(null, name)) { setCustomName(""); setShowCustomField(false); setSelectedOption(""); return; }

    setForm(prev => ({
      ...prev,
      service_detail_types: [...(prev.service_detail_types || []), { service_type_id: null, service_type_name: name }],
    }));
    setCustomName("");
    setShowCustomField(false);
    setSelectedOption("");
  };

  const removeType = (idx) => {
    setForm(prev => ({
      ...prev,
      service_detail_types: (prev.service_detail_types || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <h3 className="font-medium">Detalhamento do Serviço</h3>
        </div>

        {isEnvio ? (
          <>
            <p className="text-sm text-muted-foreground">
              Modalidade <strong>Envio</strong> — não há atendimento na casa do cliente. Defina os prazos de envio e recebimento para guiar a expedição.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Cliente quer receber até</Label>
                <Input
                  type="date"
                  value={form.cr_delivery_deadline || ""}
                  onChange={e => setForm(p => ({ ...p, cr_delivery_deadline: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Data limite que o cliente quer receber a mercadoria.</p>
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Enviar até (previsão de expedição)</Label>
                <Input
                  type="date"
                  value={form.cr_shipping_deadline || ""}
                  onChange={e => setForm(p => ({ ...p, cr_shipping_deadline: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Data limite para despachar e cumprir o prazo do cliente.</p>
              </div>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Observações</Label>
              <Textarea
                rows={2}
                value={form.cr_notes || ""}
                onChange={e => setForm(p => ({ ...p, cr_notes: e.target.value }))}
                placeholder="Ex: Cliente pede para enviar após o dia 15..."
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Detalhe o tipo de serviço que será feito na casa do cliente. Selecione um tipo na lista, clique no <Plus className="inline h-3 w-3" /> para adicionar, e repita para cada serviço. Depois preencha a observação para o técnico — é obrigatório para salvar a venda e agendar o atendimento.
            </p>

            {hasDetail && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-emerald-800">Detalhamento do serviço preenchido — a venda pode ser salva.</span>
              </div>
            )}

            {/* Barra de seleção + botão adicionar */}
            <div>
              <Label className="text-xs mb-2 block">Detalhamento do Serviço *</Label>
              {isLoading ? (
                <div className="flex justify-center py-3"><div className="w-5 h-5 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
              ) : activeServiceTypes.length === 0 && !showCustomField ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-amber-800 font-medium">Nenhum tipo de serviço cadastrado.</p>
                    <p className="text-amber-700 text-xs mt-0.5">Vá em <strong>Cadastros do Sistema → Parametrizações de Serviços</strong> para cadastrar os tipos de serviço, ou use a opção <strong>"Serviço Personalizado"</strong> abaixo para descrever um serviço específico.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Select value={selectedOption} onValueChange={setSelectedOption}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione um tipo de serviço..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeServiceTypes.map(st => (
                          <SelectItem
                            key={st.id}
                            value={st.id}
                            disabled={isAlreadySelected(st.id, st.name)}
                          >
                            {st.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">+ Serviço Personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="default"
                      size="icon"
                      onClick={addSelected}
                      disabled={!selectedOption}
                      title="Adicionar"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Campo de detalhamento do serviço personalizado */}
                  {showCustomField && (
                    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                      <Label className="text-xs flex items-center gap-1">
                        <Wrench className="h-3 w-3" /> Detalhe o serviço personalizado *
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={customName}
                          onChange={e => setCustomName(e.target.value)}
                          placeholder="Ex: Higienização completa do bebedouro industrial"
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmCustom(); } }}
                          autoFocus
                        />
                        <Button type="button" size="sm" onClick={confirmCustom} disabled={!customName.trim()}>
                          <Plus className="h-4 w-4" /> Adicionar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setShowCustomField(false); setCustomName(""); setSelectedOption(""); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Lista dos serviços adicionados */}
            {selectedTypes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Serviços Selecionados ({selectedTypes.length})</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedTypes.map((t, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-sm"
                    >
                      <Wrench className="h-3 w-3 text-primary" />
                      <span className="font-medium">{t.service_type_name}</span>
                      {!t.service_type_id && <span className="text-xs text-muted-foreground">(personalizado)</span>}
                      <button
                        type="button"
                        onClick={() => removeType(idx)}
                        className="ml-1 rounded-full hover:bg-primary/20 p-0.5"
                        title="Remover"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Observação para o técnico */}
            <div>
              <Label className="text-xs flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Observação para o Técnico *
              </Label>
              <Textarea
                rows={3}
                value={form.service_detail_notes || ""}
                onChange={e => setForm(p => ({ ...p, service_detail_notes: e.target.value }))}
                placeholder="Descreva o que o técnico precisa saber sobre o atendimento (ex: cliente tem 2 purificadores no 2º andar, acesso pelo portão lateral, instalar filtro adicional...)"
              />
              <p className="text-xs text-muted-foreground mt-1">Campo obrigatório — o técnico verá esta observação no agendamento.</p>
            </div>

            {requiresServiceDetail && !hasDetail && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-amber-800">
                  <strong>Detalhamento obrigatório.</strong> Selecione pelo menos um tipo de serviço e preencha a observação para o técnico para salvar a venda ou agendar o atendimento.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
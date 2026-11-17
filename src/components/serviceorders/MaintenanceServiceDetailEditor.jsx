import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Plus, X, Save, MessageSquare, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

/**
 * Editor inline do Detalhamento do Serviço para OS de Manutenção (sem venda).
 * Permite preencher/editar os tipos de serviço e a observação para o técnico
 * direto no detalhe da OS, liberando o agendamento quando o detalhamento estava vazio.
 */
export default function MaintenanceServiceDetailEditor({ order }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState([]);
  const [notes, setNotes] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [customName, setCustomName] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => base44.entities.ServiceType.list("order", 500),
  });
  const activeServiceTypes = serviceTypes.filter(s => s.is_active !== false);

  useEffect(() => {
    setTypes(order?.service_detail_types || []);
    setNotes(order?.service_detail_notes || "");
    setEditing(false);
  }, [order?.id, order?.service_detail_types, order?.service_detail_notes]);

  const isSelected = (id, name) => types.some(t => (t.service_type_id && t.service_type_id === id) || (!id && t.service_type_name === name));

  const addType = () => {
    if (!selectedOption) return;
    if (selectedOption === "custom") { setShowCustom(true); return; }
    const st = activeServiceTypes.find(s => s.id === selectedOption);
    if (!st || isSelected(st.id, st.name)) return;
    setTypes(prev => [...prev, { service_type_id: st.id, service_type_name: st.name }]);
    setSelectedOption("");
  };

  const confirmCustom = () => {
    const name = customName.trim();
    if (!name || isSelected(null, name)) { setCustomName(""); setShowCustom(false); setSelectedOption(""); return; }
    setTypes(prev => [...prev, { service_type_id: null, service_type_name: name }]);
    setCustomName(""); setShowCustom(false); setSelectedOption("");
  };

  const removeType = (idx) => setTypes(prev => prev.filter((_, i) => i !== idx));

  const hasDetail = types.length > 0 && notes.trim();

  const save = async () => {
    if (types.length === 0 || !notes.trim()) {
      toast({ title: "Preencha o detalhamento", description: "Selecione pelo menos um tipo de serviço e preencha a observação.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.ServiceOrder.update(order.id, {
        service_detail_types: types,
        service_detail_notes: notes.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrder", order.id] });
      toast({ title: "Detalhamento salvo", description: "Agendamento liberado." });
      setEditing(false);
    } catch {
      toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Modo visualização (detalhamento já preenchido)
  if (hasDetail && !editing) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm space-y-1.5">
        <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
          <CheckCircle2 className="h-4 w-4" /> Detalhamento do Serviço
        </div>
        <div className="flex flex-wrap gap-1.5">
          {types.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs">
              <Wrench className="h-3 w-3 text-primary" /> {t.service_type_name}
            </span>
          ))}
        </div>
        {notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{notes}</p>}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>
          Editar detalhamento
        </Button>
      </div>
    );
  }

  // Modo edição ou detalhamento vazio
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-violet-800">
        <Wrench className="h-4 w-4" /> Detalhamento do Serviço *
      </div>
      {!hasDetail && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-amber-800">
            <strong>Detalhe o serviço antes de agendar.</strong> Selecione os tipos de serviço e preencha a observação para o técnico. O agendamento só é liberado após o detalhamento estar preenchido.
          </p>
        </div>
      )}

      {types.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {types.map((t, idx) => (
            <span key={idx} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-sm">
              <Wrench className="h-3 w-3 text-primary" />
              <span className="font-medium">{t.service_type_name}</span>
              {!t.service_type_id && <span className="text-xs text-muted-foreground">(personalizado)</span>}
              <button type="button" onClick={() => removeType(idx)} className="ml-1 rounded-full hover:bg-primary/20 p-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Select value={selectedOption} onValueChange={setSelectedOption}>
          <SelectTrigger className="flex-1 h-8">
            <SelectValue placeholder="Selecione um tipo de serviço..." />
          </SelectTrigger>
          <SelectContent>
            {activeServiceTypes.map(st => (
              <SelectItem key={st.id} value={st.id} disabled={isSelected(st.id, st.name)}>{st.name}</SelectItem>
            ))}
            <SelectItem value="custom">+ Serviço Personalizado</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="default" size="icon" className="h-8 w-8" onClick={addType} disabled={!selectedOption}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showCustom && (
        <div className="flex gap-2">
          <input
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmCustom(); } }}
            placeholder="Ex: Higienização completa do bebedouro"
            autoFocus
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          />
          <Button type="button" size="sm" onClick={confirmCustom} disabled={!customName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setShowCustom(false); setCustomName(""); setSelectedOption(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div>
        <Label className="text-xs flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> Observação para o Técnico *
        </Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Descreva o que o técnico precisa saber sobre o atendimento..."
        />
      </div>

      <Button size="sm" className="gap-1.5 w-full" onClick={save} disabled={saving || types.length === 0 || !notes.trim()}>
        <Save className="h-3.5 w-3.5" /> {saving ? "Salvando..." : "Salvar Detalhamento"}
      </Button>
    </div>
  );
}
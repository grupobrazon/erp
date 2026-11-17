import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, Bike, Car, Layers } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function CalendarGroupManager({ open: controlledOpen, onOpenChange }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [editGroup, setEditGroup] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", is_active: true, technicians: [] });

  const { data: groups = [] } = useQuery({
    queryKey: ["calendarGroups"],
    queryFn: () => base44.entities.CalendarGroup.list("-created_date", 200),
  });

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendarioRotas"],
    queryFn: () => base44.entities.CalendarioRota.list("-created_date", 200),
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians", "all"],
    queryFn: () => base44.entities.Technician.list("name", 200),
  });

  const syncCalendarsMutation = useMutation({
    mutationFn: async ({ groupId, techs }) => {
      const groupCalendars = calendars.filter(c => c.group_id === groupId);
      const techsCount = techs.length;
      const vehicleType = techs.every(t => t.vehicle_type === "Moto") ? "Moto"
        : techs.every(t => t.vehicle_type === "Carro") ? "Carro"
        : "Ambos";
      for (const cal of groupCalendars) {
        await base44.entities.CalendarioRota.update(cal.id, {
          technicians: techs,
          technicians_count: techsCount,
          vehicle_type: vehicleType || undefined,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarioRotas"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        technicians_count: (form.technicians || []).length,
      };
      let saved;
      if (editGroup) {
        saved = await base44.entities.CalendarGroup.update(editGroup.id, payload);
      } else {
        saved = await base44.entities.CalendarGroup.create(payload);
      }
      // Sync technicians to all calendars in this group
      await syncCalendarsMutation.mutateAsync({ groupId: saved.id, techs: form.technicians || [] });
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarGroups"] });
      toast({ title: editGroup ? "Grupo atualizado" : "Grupo criado" });
      setOpen(false);
      setEditGroup(null);
      setForm({ name: "", description: "", is_active: true, technicians: [] });
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CalendarGroup.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarGroups"] });
      toast({ title: "Grupo excluído" });
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const openNew = () => {
    setEditGroup(null);
    setForm({ name: "", description: "", is_active: true, technicians: [] });
    setOpen(true);
  };

  const openEdit = (g) => {
    setEditGroup(g);
    setForm({
      name: g.name || "",
      description: g.description || "",
      is_active: g.is_active !== false,
      technicians: g.technicians || [],
    });
    setOpen(true);
  };

  const addTechnician = () => {
    setForm(p => ({
      ...p,
      technicians: [...(p.technicians || []), { technician_id: "", technician_name: "", vehicle_type: "Carro" }],
    }));
  };

  const updateTechnician = (idx, field, value) => {
    setForm(p => {
      const ts = [...(p.technicians || [])];
      ts[idx] = { ...ts[idx], [field]: value };
      if (field === "technician_id") {
        const tech = technicians.find(t => t.id === value);
        ts[idx].technician_name = tech?.name || "";
        if (!ts[idx].vehicle_type && tech?.vehicle_type) ts[idx].vehicle_type = tech.vehicle_type;
      }
      return { ...p, technicians: ts };
    });
  };

  const removeTechnician = (idx) => {
    setForm(p => ({
      ...p,
      technicians: (p.technicians || []).filter((_, i) => i !== idx),
    }));
  };

  const getGroupCalendarCount = (groupId) => calendars.filter(c => c.group_id === groupId).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" onClick={openNew}>
            <Layers className="h-4 w-4" /> Gerenciar Grupos
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {editGroup ? "Editar Grupo" : "Grupos de Calendários"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            O grupo define o pool de técnicos compartilhado entre todos os calendários vinculados. O dia é dividido pela quantidade de técnicos do grupo — cada técnico atende apenas uma região (calendário) por dia.
          </p>
        </DialogHeader>

        {/* Existing groups list */}
        {groups.length > 0 && !editGroup && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-lg p-2">
            {groups.map(g => (
              <div key={g.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 border">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{g.name}</span>
                    {!g.is_active && <span className="text-xs text-muted-foreground">(inativo)</span>}
                    <Badge variant="secondary" className="text-xs">{g.technicians_count || 0} técnicos</Badge>
                    <Badge variant="outline" className="text-xs">{getGroupCalendarCount(g.id)} calendário(s)</Badge>
                  </div>
                  {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(g.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Form */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome do Grupo *</Label>
            <Input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Equipe BH, Equipe Interior"
            />
          </div>
          <div>
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Ex: Técnicos que cobrem Grande BH, Contagem e Florestal"
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={form.is_active}
              onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))}
            />
            <span className="text-sm">Grupo ativo</span>
          </label>

          {/* Technicians pool */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" /> Pool de Técnicos do Grupo
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addTechnician} className="h-7 gap-1">
                <Plus className="h-3.5 w-3.5" /> Adicionar Técnico
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Estes técnicos são compartilhados por todos os calendários do grupo. O dia é dividido por esta quantidade — cada técnico atende uma região por dia.
            </p>
            <div className="space-y-2">
              {(form.technicians || []).map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Técnico {idx + 1}</span>
                  <Select
                    value={t.technician_id || "none"}
                    onValueChange={v => updateTechnician(idx, "technician_id", v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhum —</SelectItem>
                      {technicians.map(tech => (
                        <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={t.vehicle_type || "Carro"}
                    onValueChange={v => updateTechnician(idx, "vehicle_type", v)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Carro"><span className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5" /> Carro</span></SelectItem>
                      <SelectItem value="Moto"><span className="flex items-center gap-1.5"><Bike className="h-3.5 w-3.5" /> Moto</span></SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeTechnician(idx)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              {(!form.technicians || form.technicians.length === 0) && (
                <p className="text-xs text-muted-foreground italic">Nenhum técnico no pool. Clique em "Adicionar Técnico".</p>
              )}
            </div>
            {(form.technicians || []).length > 0 && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                <span>{(form.technicians || []).length} técnico(s) no pool</span>
                {(form.technicians || []).filter(t => t.vehicle_type === "Moto").length > 0 && (
                  <span className="flex items-center gap-1"><Bike className="h-3.5 w-3.5" /> {(form.technicians || []).filter(t => t.vehicle_type === "Moto").length} moto(s)</span>
                )}
                {(form.technicians || []).filter(t => t.vehicle_type === "Carro").length > 0 && (
                  <span className="flex items-center gap-1"><Car className="h-3.5 w-3.5" /> {(form.technicians || []).filter(t => t.vehicle_type === "Carro").length} carro(s)</span>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {editGroup && (
            <Button variant="ghost" onClick={() => { setEditGroup(null); setForm({ name: "", description: "", is_active: true, technicians: [] }); }}>
              Novo Grupo
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          <Button
            disabled={!form.name || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Salvando..." : editGroup ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
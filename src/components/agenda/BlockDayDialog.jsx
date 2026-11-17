import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { Ban } from "lucide-react";

const TIME_TYPES = [
  { value: "Manhã", label: "Manhã (08h-12h)" },
  { value: "Tarde", label: "Tarde (13h-18h)" },
  { value: "Dia Inteiro", label: "Dia Inteiro (08h-18h)" },
];

export default function BlockDayDialog({ open, onOpenChange, calendars, prefillDate }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCals, setSelectedCals] = useState([]);
  const [date, setDate] = useState("");
  const [timeType, setTimeType] = useState("Dia Inteiro");
  const [selectedTechs, setSelectedTechs] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(prefillDate ? format(prefillDate, "yyyy-MM-dd") : "");
      setSelectedCals([]);
      setTimeType("Dia Inteiro");
      setSelectedTechs([]);
      setNotes("");
    }
  }, [open, prefillDate]);

  const activeCalendars = useMemo(() => calendars.filter(c => c.is_active), [calendars]);

  // Union of all selected calendars' technicians (deduplicated by technician_id)
  const technicians = useMemo(() => {
    const map = {};
    for (const calId of selectedCals) {
      const cal = activeCalendars.find(c => c.id === calId);
      for (const t of (cal?.technicians || [])) {
        if (t.technician_id && !map[t.technician_id]) {
          map[t.technician_id] = t;
        }
      }
    }
    return Object.values(map);
  }, [selectedCals, activeCalendars]);

  const toggleCal = (calId) => {
    setSelectedCals(prev => prev.includes(calId) ? prev.filter(c => c !== calId) : [...prev, calId]);
  };

  const toggleAllCals = () => {
    if (selectedCals.length === activeCalendars.length) setSelectedCals([]);
    else setSelectedCals(activeCalendars.map(c => c.id));
  };

  const toggleTech = (techId) => {
    setSelectedTechs(prev => prev.includes(techId) ? prev.filter(t => t !== techId) : [...prev, techId]);
  };

  const toggleAllTechs = () => {
    if (selectedTechs.length === technicians.length) setSelectedTechs([]);
    else setSelectedTechs(technicians.map(t => t.technician_id));
  };

  const handleSave = async () => {
    if (selectedCals.length === 0 || !date) {
      toast({ variant: "destructive", title: "Selecione pelo menos um calendário e a data" });
      return;
    }
    setSaving(true);
    try {
      const records = [];
      for (const calId of selectedCals) {
        const cal = activeCalendars.find(c => c.id === calId);
        const calTechs = cal?.technicians || [];
        const techList = calTechs.length > 0
          ? (selectedTechs.length > 0
              ? calTechs.filter(t => selectedTechs.includes(t.technician_id)).map(t => t.technician_id)
              : calTechs.map(t => t.technician_id))
          : [null];
        for (const techId of techList) {
          const tech = calTechs.find(t => t.technician_id === techId);
          records.push({
            calendar_id: cal.id,
            calendar_name: cal.name,
            calendar_color: cal.color,
            title: `BLOQUEADO${notes ? " - " + notes : ""}`,
            date,
            time_type: timeType,
            technician_id: techId || undefined,
            technician_name: tech?.technician_name || "",
            status: "Bloqueado",
            notes,
          });
        }
      }
      await base44.entities.AgendamentoRota.bulkCreate(records);
      toast({ title: "Dia bloqueado", description: `${records.length} bloqueio(s) em ${selectedCals.length} calendário(s)` });
      queryClient.invalidateQueries(["agendamentoRotas"]);
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao bloquear", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" /> Bloquear Dia de Atendimento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Período</Label>
              <Select value={timeType} onValueChange={setTimeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Calendários *</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAllCals}>
                {selectedCals.length === activeCalendars.length ? "Desmarcar todos" : "Selecionar todos"}
              </Button>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
              {activeCalendars.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedCals.includes(c.id)}
                    onCheckedChange={() => toggleCal(c.id)}
                  />
                  <span className="text-sm">{c.name}{c.group_name ? ` (${c.group_name})` : ""}</span>
                </label>
              ))}
            </div>
          </div>
          {technicians.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Técnicos</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAllTechs}>
                  {selectedTechs.length === technicians.length ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {technicians.map(t => (
                  <label key={t.technician_id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedTechs.includes(t.technician_id)}
                      onCheckedChange={() => toggleTech(t.technician_id)}
                    />
                    <span className="text-sm">{t.technician_name} ({t.vehicle_type})</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label>Motivo / Observação</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Feriado, manutenção, folga..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={handleSave} disabled={saving}>
            {saving ? "Bloqueando..." : "Bloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
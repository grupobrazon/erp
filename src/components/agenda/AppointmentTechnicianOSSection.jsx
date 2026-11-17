import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, ChevronDown, ChevronUp, Save, Wrench } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function AppointmentTechnicianOSSection({ appointment }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Busca a OS do Técnico (TOS) vinculada a este agendamento
  const { data: tosList = [] } = useQuery({
    queryKey: ["technician-os-by-appointment", appointment?.id],
    queryFn: () => base44.entities.TechnicianServiceOrder.filter({ appointment_id: appointment.id }, "-created_date", 10),
    enabled: !!appointment?.id,
  });
  const tos = tosList[0] || null;

  useEffect(() => {
    if (tos) setNotes(tos.technician_notes || "");
  }, [tos?.id]);

  if (!tos) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.TechnicianServiceOrder.update(tos.id, { technician_notes: notes.trim() });
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-appointment", appointment.id] });
      toast({ title: "Observações salvas", description: `Atualizado na OS do Técnico ${tos.code}` });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-3 space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Wrench className="h-4 w-4 text-cyan-700" />
          <span className="text-sm font-medium">OS do Técnico</span>
          <Badge className="bg-cyan-600 text-white">
            <ClipboardCheck className="h-3 w-3 mr-1" /> {tos.code}
          </Badge>
          <Badge variant="outline" className="text-xs">{tos.status}</Badge>
          {tos.technician_name && (
            <span className="text-xs text-muted-foreground">{tos.technician_name}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          <div>
            <Label className="text-xs text-muted-foreground">Observações do Técnico (OS do Técnico)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Observações preenchidas pelo técnico durante o atendimento..."
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5 bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Salvando..." : "Salvar Observações"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
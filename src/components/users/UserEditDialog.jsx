import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ROLES, roleLabels, roleBadgeColors, usePermissions, getInvitableRoles } from "@/lib/permissions";

export default function UserEditDialog({ user, onClose }) {
  const [name, setName] = useState("");
  const [primaryRole, setPrimaryRole] = useState("");
  const [additionalRoles, setAdditionalRoles] = useState([]);
  const [sellerId, setSellerId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [saving, setSaving] = useState(false);
  const { isAdmin } = usePermissions();
  const invitableRoles = getInvitableRoles(isAdmin);
  const queryClient = useQueryClient();
  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers"],
    queryFn: () => base44.entities.Seller.list(),
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => base44.entities.Technician.list("-created_date", 200),
  });


  useEffect(() => {
    if (user) {
      setName(user.display_name || user.full_name || "");
      setPrimaryRole(user.role || "vendedor");
      setAdditionalRoles(user.additional_roles || []);
      setSellerId(user.seller_id || "");
      setTechnicianId(user.technician_id || "");
    }
  }, [user]);

  const toggleAdditionalRole = (roleValue) => {
    if (roleValue === primaryRole) return;
    setAdditionalRoles(prev =>
      prev.includes(roleValue)
        ? prev.filter(r => r !== roleValue)
        : [...prev, roleValue]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("manageUsers", {
        action: "update",
        user_id: user.id,
        full_name: name,
        role: primaryRole,
        additional_roles: additionalRoles,
        seller_id: sellerId || "",
        technician_id: technicianId || "",
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome Completo</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>Perfil Principal</Label>
            <Select value={primaryRole} onValueChange={setPrimaryRole}>
              <SelectTrigger><span>{roleLabels[primaryRole] || "Selecione..."}</span></SelectTrigger>
              <SelectContent>
                {invitableRoles.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Perfis Adicionais</Label>
            <p className="text-xs text-muted-foreground mb-2">Toque para adicionar ou remover perfis extras</p>
            <div className="flex flex-wrap gap-2">
              {invitableRoles.map(r => {
                const isPrimary = r.value === primaryRole;
                const isSelected = additionalRoles.includes(r.value);
                if (isPrimary) return null;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleAdditionalRole(r.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                      isSelected
                        ? `${roleBadgeColors[r.value] || "bg-primary text-primary-foreground"} border-transparent`
                        : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Vendedor Vinculado</Label>
            <Select value={sellerId || "__none__"} onValueChange={v => setSellerId(v === "__none__" ? "" : v)}>
              <SelectTrigger><span>{sellerId ? sellers.find(s => s.id === sellerId)?.name : "Nenhum"}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {sellers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Qualquer perfil pode fazer vendas vinculadas a um vendedor.
            </p>
          </div>
          {primaryRole === "tecnico" && (
            <div>
              <Label>Técnico Vinculado *</Label>
              <Select value={technicianId || "__none__"} onValueChange={v => setTechnicianId(v === "__none__" ? "" : v)}>
                <SelectTrigger><span>{technicianId ? technicians.find(t => t.id === technicianId)?.name : "Selecione o técnico"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {technicians.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Vincule o usuário a um técnico cadastrado para que ele veja suas rotas e ordens de serviço.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
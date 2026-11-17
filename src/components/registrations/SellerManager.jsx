import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, User, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import EmptyState from "@/components/ui/EmptyState";
import SellerPhotoCropper from "@/components/registrations/SellerPhotoCropper";

export default function SellerManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", photo_url: "" });
  const [pendingPhoto, setPendingPhoto] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["sellers"],
    queryFn: () => base44.entities.Seller.list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Seller.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sellers"] }); resetForm(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Seller.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sellers"] }); resetForm(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Seller.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sellers"] }),
  });
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive, inactiveDate }) => base44.entities.Seller.update(id, { is_active: isActive, inactive_date: inactiveDate }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sellers"] }),
  });

  const resetForm = () => { setForm({ name: "", photo_url: "" }); setPendingPhoto(null); setEditing(null); setShowForm(false); };

  const handleToggleActive = (item) => {
    if (item.is_active === false) {
      // Reativar
      toggleActiveMutation.mutate({ id: item.id, isActive: true, inactiveDate: null });
    } else {
      // Inativar — registra a data para ocultar do dashboard daqui pra frente
      const today = new Date().toISOString().slice(0, 10);
      toggleActiveMutation.mutate({ id: item.id, isActive: false, inactiveDate: today });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (pendingPhoto) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: pendingPhoto });
      payload.photo_url = file_url;
    }
    if (editing) updateMutation.mutate({ id: editing, data: payload });
    else createMutation.mutate(payload);
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({ name: item.name || "", photo_url: item.photo_url || "" });
    setPendingPhoto(null);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Cadastre os vendedores com foto para a dashboard de vendas</p>
        {!showForm && <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Vendedor</Button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required /></div>
          <div>
            <Label>Foto</Label>
            <SellerPhotoCropper
              photoUrl={form.photo_url}
              onCropFile={setPendingPhoto}
              onClear={() => { setPendingPhoto(null); setForm(p => ({ ...p, photo_url: "" })); }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? "Salvar" : "Adicionar"}</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum vendedor cadastrado" />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map(item => {
              const isActive = item.is_active !== false;
              return (
                <TableRow key={item.id} className={!isActive ? "opacity-60" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full overflow-hidden bg-muted border flex items-center justify-center">
                        {item.photo_url ? <img src={item.photo_url} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        <UserCheck className="h-3 w-3" /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted border rounded-full px-2 py-0.5" title={`Inativado em ${item.inactive_date ? new Date(item.inactive_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}`}>
                        <UserX className="h-3 w-3" /> Inativo
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={isActive ? "Inativar vendedor (preserva o histórico de vendas)" : "Reativar vendedor"}
                        onClick={() => handleToggleActive(item)}
                      >
                        {isActive ? <UserX className="h-4 w-4 text-amber-600" /> : <UserCheck className="h-4 w-4 text-emerald-600" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
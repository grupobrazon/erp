import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Mail, User } from "lucide-react";

export default function TechnicianClientConfirmDialog({ open, onOpenChange, client, onConfirm, saving }) {
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open && client) {
      setPhone1(client.phone1 || "");
      setPhone2(client.phone2 || "");
      setEmail(client.email || "");
    }
  }, [open, client]);

  const handleConfirm = () => {
    onConfirm({ phone1, phone2, email });
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Atualização Cadastral do Cliente
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Confirme os dados de contato do cliente antes de encerrar a OS. Atualize se necessário.
          </p>
          <div className="rounded-md border p-3 bg-muted/30 space-y-1 text-sm">
            <div><span className="text-muted-foreground">Cliente:</span> <strong>{client.name}</strong></div>
            <div><span className="text-muted-foreground">Documento:</span> {client.document || "—"}</div>
            <div><span className="text-muted-foreground">Cidade:</span> {client.city || "—"}/{client.state || ""}</div>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone 1</Label>
              <Input value={phone1} onChange={e => setPhone1(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone 2</Label>
              <Input value={phone2} onChange={e => setPhone2(e.target.value)} placeholder="(11) 3333-3333" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> E-mail</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@email.com" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar e Concluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
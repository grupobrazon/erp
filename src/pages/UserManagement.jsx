import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Mail, Clock, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { ROLES, roleLabels, roleBadgeColors, usePermissions, getInvitableRoles } from "@/lib/permissions";
import UserEditDialog from "@/components/users/UserEditDialog";
import SellerPhotoCropper from "@/components/registrations/SellerPhotoCropper";

export default function UserManagement() {
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("vendedor");
  const [sellerId, setSellerId] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [technicianId, setTechnicianId] = useState("");
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  const invitableRoles = getInvitableRoles(isAdmin);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await base44.functions.invoke("manageUsers", { action: "list" });
      return res.data.users;
    },
  });

  const { data: invitations = [], isLoading: isLoadingInv } = useQuery({
    queryKey: ["invitations"],
    queryFn: () => base44.entities.Invitation.list("-created_date", 200),
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers"],
    queryFn: () => base44.entities.Seller.list("-created_date", 200),
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => base44.entities.Technician.list("-created_date", 200),
  });

  // Auto-mark invitations as accepted when user with same email exists
  const userEmails = useMemo(() => new Set(users.map(u => u.email?.toLowerCase())), [users]);
  const pendingInvitations = invitations.filter(inv =>
    inv.status === "Pendente" && !userEmails.has(inv.email?.toLowerCase())
  );
  const acceptedInvitations = invitations.filter(inv =>
    inv.status === "Aceito" || userEmails.has(inv.email?.toLowerCase())
  );

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role, seller_id, technician_id, photoFile }) => {
      let photoUrl = null;
      if (photoFile) {
        const uploadRes = await base44.integrations.Core.UploadFile({ file: photoFile });
        photoUrl = uploadRes.file_url;
      }
      await base44.functions.invoke("manageUsers", {
        action: "invite",
        email,
        full_name: fullName,
        role,
        seller_id: seller_id || undefined,
        technician_id: technician_id || undefined,
        photo_url: photoUrl || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      setShowInvite(false);
      setEmail("");
      setFullName("");
      setRole("vendedor");
      setSellerId("");
      setPhotoFile(null);
      setTechnicianId("");
    },
    onError: () => {},
  });

  const handleInvite = (e) => {
    e.preventDefault();
    if (!email || !role) return;
    inviteMutation.mutate({ email, role, seller_id: sellerId, technician_id: technicianId, photoFile });
  };

  return (
    <div>
      <PageHeader title="Usuários" description="Gerenciar acessos e perfis do sistema">
        <Button onClick={() => setShowInvite(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> Convidar Usuário
        </Button>
      </PageHeader>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários ({users.length})</TabsTrigger>
          <TabsTrigger value="pendentes">Convites Pendentes ({pendingInvitations.length})</TabsTrigger>
          <TabsTrigger value="aceitos">Convites Aceitos ({acceptedInvitations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <EmptyState title="Nenhum usuário" description="Convide usuários para acessar o sistema." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Cadastrado em</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={roleBadgeColors[u.role] || "bg-muted text-muted-foreground"}>
                              {roleLabels[u.role] || u.role || "—"}
                            </Badge>
                            {(u.additional_roles || []).map(r => (
                              <Badge key={r} variant="outline" className={roleBadgeColors[r] || "bg-muted text-muted-foreground"}>
                                {roleLabels[r] || r}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.created_date ? new Date(u.created_date).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setEditingUser(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendentes">
          <Card>
            <CardContent className="p-0">
              {isLoadingInv ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : pendingInvitations.length === 0 ? (
                <EmptyState icon={Clock} title="Nenhum convite pendente" description="Convites enviados que ainda não foram aceitos aparecerão aqui." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Enviado em</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.full_name || "—"}</TableCell>
                        <TableCell className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" /> {inv.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={roleBadgeColors[inv.role] || "bg-muted text-muted-foreground"}>
                            {roleLabels[inv.role] || inv.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.sent_date ? new Date(inv.sent_date).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 gap-1">
                            <Clock className="h-3 w-3" /> Pendente
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aceitos">
          <Card>
            <CardContent className="p-0">
              {isLoadingInv ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : acceptedInvitations.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nenhum convite aceito" description="Convites aceitos aparecerão aqui assim que o usuário concluir o cadastro." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Enviado em</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acceptedInvitations.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.full_name || "—"}</TableCell>
                        <TableCell className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" /> {inv.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={roleBadgeColors[inv.role] || "bg-muted text-muted-foreground"}>
                            {roleLabels[inv.role] || inv.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.sent_date ? new Date(inv.sent_date).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Aceito
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convidar Usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <Label>Nome Completo</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nome do convidado" />
            </div>
            <div>
              <Label>E-mail *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="exemplo@brazon.com.br" />
            </div>
            <div>
              <Label>Perfil *</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><span>{roleLabels[role] || "Selecione..."}</span></SelectTrigger>
                <SelectContent>
                  {invitableRoles.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                Vincule um vendedor para permitir que o usuário faça vendas em seu nome, mesmo que o perfil principal não seja vendedor.
              </p>
            </div>
            {role === "tecnico" && (
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
            <div>
              <Label>Foto do Usuário</Label>
              <SellerPhotoCropper
                photoUrl={null}
                onCropFile={setPhotoFile}
                onClear={() => setPhotoFile(null)}
                inputId="invite-photo-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A foto já aparecerá parametrizada quando o usuário fizer o primeiro acesso.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>Cancelar</Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? "Enviando..." : "Enviar Convite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <UserEditDialog user={editingUser} onClose={() => setEditingUser(null)} />
    </div>
  );
}
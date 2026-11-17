import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserCog, Loader2, Link2, RefreshCw, UserPlus, Key } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function ThreeCPlusUsersCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [threecUsers, setThreecUsers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", extension_number: "", email: "", password: "" });

  const { data: sellers = [], isLoading: loadingSellers } = useQuery({
    queryKey: ["sellers"],
    queryFn: () => base44.entities.Seller.list("-created_date", 100),
  });

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await base44.functions.invoke("sync3CUsers", {});
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Erro ao buscar usuários 3C Plus", description: res.data.error });
      } else {
        setThreecUsers(res.data?.users || []);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setLoadingUsers(false);
    }
  };

  const linkUser = async (sellerId, threecUserId) => {
    setLinking(sellerId);
    try {
      const threecUser = threecUsers.find((u) => String(u.id) === threecUserId);
      await base44.entities.Seller.update(sellerId, {
        threec_user_id: threecUserId,
        threec_extension: threecUser?.extension_number || "",
      });
      queryClient.invalidateQueries({ queryKey: ["sellers"] });
      toast({ title: "Vendedora vinculada ao agente 3C Plus" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao vincular", description: e.message });
    } finally {
      setLinking(null);
    }
  };

  const unlinkUser = async (sellerId) => {
    setLinking(sellerId);
    try {
      await base44.entities.Seller.update(sellerId, {
        threec_user_id: "",
        threec_extension: "",
      });
      queryClient.invalidateQueries({ queryKey: ["sellers"] });
      toast({ title: "Vínculo removido" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setLinking(null);
    }
  };

  const saveToken = async (sellerId, token) => {
    try {
      await base44.entities.Seller.update(sellerId, { threec_agent_token: token });
      queryClient.invalidateQueries({ queryKey: ["sellers"] });
      toast({ title: "Token do agente salvo" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao salvar token", description: e.message });
    }
  };

  const createUser = async () => {
    if (!newUser.name || !newUser.extension_number || !newUser.password) {
      toast({ variant: "destructive", title: "Preencha nome, ramal e senha" });
      return;
    }
    setCreating(true);
    try {
      const res = await base44.functions.invoke("sync3CUsers", { action: "create" }, {
        method: "POST",
        body: JSON.stringify(newUser),
        headers: { "Content-Type": "application/json" },
      });
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Erro ao criar usuário", description: res.data.error });
      } else {
        toast({ title: "Usuário criado no 3C Plus" });
        setNewUser({ name: "", extension_number: "", email: "", password: "" });
        setShowCreateForm(false);
        fetchUsers();
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-primary" />
          Agentes 3C Plus × Vendedoras
        </CardTitle>
        <CardDescription>
          Vincule cada vendedora ao seu agente (usuário) no 3C Plus. O agente receberá as chamadas dos clientes distribuídos para aquela vendedora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loadingUsers}>
            {loadingUsers ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Carregar agentes do 3C Plus
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
            <UserPlus className="h-4 w-4" />
            Criar novo agente
          </Button>
        </div>

        {showCreateForm && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">Novo agente no 3C Plus</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Nome do agente" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ramal *</Label>
                <Input value={newUser.extension_number} onChange={(e) => setNewUser({ ...newUser, extension_number: e.target.value })} placeholder="Ex: 1001" type="number" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">E-mail</Label>
                <Input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Senha *</Label>
                <Input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Senha de acesso" />
              </div>
            </div>
            <Button size="sm" onClick={createUser} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Criar agente
            </Button>
          </div>
        )}

        {threecUsers.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {threecUsers.length} agentes encontrados no 3C Plus.
          </div>
        )}

        {loadingSellers ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma vendedora cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {sellers.map((s) => {
              const linkedUser = threecUsers.find((u) => String(u.id) === String(s.threec_user_id));
              return (
                <div key={s.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{s.name}</div>
                    {s.threec_user_id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          <Link2 className="h-3 w-3 mr-1" />
                          {linkedUser?.name || `Agente #${s.threec_user_id}`}
                        </Badge>
                        {s.threec_extension && <span className="text-xs text-muted-foreground">Ramal: {s.threec_extension}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Não vinculado</span>
                    )}
                  </div>
                  {threecUsers.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={s.threec_user_id || ""}
                        onValueChange={(val) => (val === "none" ? unlinkUser(s.id) : linkUser(s.id, val))}
                        disabled={linking === s.id}
                      >
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <SelectValue placeholder="Selecionar agente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Remover vínculo —</SelectItem>
                          {threecUsers.map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.name} {u.extension_number ? `(Ramal ${u.extension_number})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {linking === s.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  )}
                  </div>
                  {s.threec_user_id && (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        className="h-7 text-xs font-mono"
                        defaultValue={s.threec_agent_token || ""}
                        placeholder="Token do agente (Configurações > Usuários > opções avançadas)"
                        onBlur={(e) => saveToken(s.id, e.target.value.trim())}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {threecUsers.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Clique em "Carregar agentes do 3C Plus" para buscar os usuários cadastrados e vincular às vendedoras.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
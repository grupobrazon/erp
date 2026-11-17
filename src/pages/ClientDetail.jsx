import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2, Phone, Mail, MapPin, Droplets, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import ContactFormDialog from "@/components/clients/ContactFormDialog";
import AddressFormDialog from "@/components/clients/AddressFormDialog";
import ClientRouteTab from "@/components/clients/ClientRouteTab";
import ClientPromotionsTab from "@/components/clients/ClientPromotionsTab";

export default function ClientDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);

  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const list = await base44.entities.Client.filter({ id });
      return list[0];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts", id],
    queryFn: () => base44.entities.Contact.filter({ client_id: id }),
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses", id],
    queryFn: () => base44.entities.Address.filter({ client_id: id }),
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["client-equipment", id],
    queryFn: () => base44.entities.Equipment.filter({ client_id: id }),
  });

  const deleteContact = useMutation({
    mutationFn: (cid) => base44.entities.Contact.delete(cid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts", id] }),
  });

  const deleteAddress = useMutation({
    mutationFn: (aid) => base44.entities.Address.delete(aid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses", id] }),
  });

  if (!client) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/clientes" className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
      </div>

      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {client.vip_client && <Star className="h-6 w-6 text-amber-500 fill-amber-500" />}
            {client.name}
          </span>
        }
        description={`${client.new_code || ""} • ${client.document || "Sem documento"}${client.vip_client ? " • Cliente VIP Brazon" : ""}`}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{client.status}</Badge>
        </div>
      </PageHeader>

      <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") || "contacts"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="contacts">Contatos ({contacts.length})</TabsTrigger>
          <TabsTrigger value="addresses">Endereços ({addresses.length})</TabsTrigger>
          <TabsTrigger value="equipment">Equipamentos ({equipment.length})</TabsTrigger>
          <TabsTrigger value="promotions" className="gap-1.5">
            {client.vip_client && <Star className="h-3.5 w-3.5 text-amber-500" />}
            Promoções{client.vip_client ? " VIP" : ""}
          </TabsTrigger>
          <TabsTrigger value="route">Rota</TabsTrigger>
          <TabsTrigger value="info">Informações</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => { setEditingContact(null); setContactDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Contato
            </Button>
          </div>
          {contacts.length === 0 ? (
            <EmptyState title="Nenhum contato" description="Adicione contatos para este cliente." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contacts.map(contact => (
                <Card key={contact.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">{contact.role}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingContact(contact); setContactDialogOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteContact.mutate(contact.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      {contact.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground" />{contact.phone}</div>}
                      {contact.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground" />{contact.email}</div>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <ContactFormDialog open={contactDialogOpen} onOpenChange={setContactDialogOpen} contact={editingContact} clientId={id} />
        </TabsContent>

        <TabsContent value="addresses">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => { setEditingAddress(null); setAddressDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Endereço
            </Button>
          </div>
          {addresses.length === 0 ? (
            <EmptyState title="Nenhum endereço" description="Adicione endereços para este cliente." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addresses.map(addr => (
                <Card key={addr.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        <Badge variant="secondary">{addr.label || "Endereço"}</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingAddress(addr); setAddressDialogOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteAddress.mutate(addr.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm mt-2">{addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ""}</p>
                    <p className="text-sm text-muted-foreground">{addr.neighborhood} - {addr.city}/{addr.state}</p>
                    <p className="text-xs text-muted-foreground">CEP: {addr.zip_code}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <AddressFormDialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen} address={editingAddress} clientId={id} />
        </TabsContent>

        <TabsContent value="equipment">
          {equipment.length === 0 ? (
            <EmptyState title="Nenhum equipamento" description="Equipamentos vinculados ao cliente aparecerão aqui." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {equipment.map(eq => (
                <Card key={eq.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Droplets className="h-4 w-4 text-primary" />
                      <span className="font-mono text-xs text-muted-foreground">{eq.code}</span>
                      <Badge variant="outline">{eq.status}</Badge>
                    </div>
                    <p className="font-semibold">{eq.product_name || eq.model || "Equipamento"}</p>
                    <p className="text-sm text-muted-foreground">{eq.brand} {eq.model}</p>
                    {eq.next_maintenance_date && (
                      <p className="text-xs mt-2 text-muted-foreground">Próx. manutenção: {eq.next_maintenance_date}</p>
                    )}
                    <Button variant="link" size="sm" className="p-0 mt-2" asChild>
                      <Link to={`/equipamentos/${eq.id}`}>Ver detalhes →</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="promotions">
          <ClientPromotionsTab client={client} clientId={id} />
        </TabsContent>

        <TabsContent value="route">
          <ClientRouteTab client={client} />
        </TabsContent>

        <TabsContent value="info">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Razão Social</p><p className="font-medium">{client.company_name || "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">E-mail</p><p className="font-medium">{client.email || "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">Inscrição Estadual</p><p className="font-medium">{client.state_registration || "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">Código Antigo</p><p className="font-medium">{client.old_code || "-"}</p></div>
              </div>
              {client.notes && (
                <div><p className="text-xs text-muted-foreground mb-1">Observações</p><p className="text-sm">{client.notes}</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
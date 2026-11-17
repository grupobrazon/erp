import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Eye, Pencil, Power, Download, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { Link, useNavigate } from "react-router-dom";
import { usePermissions } from "@/lib/permissions";

const statusColors = {
  "Base Inativa LSOFT": "bg-slate-100 text-slate-500 border-slate-200",
  "Novo": "bg-amber-100 text-amber-700 border-amber-200",
  "Ótimo": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Ótimo - Cliente Brazon": "bg-blue-100 text-blue-700 border-blue-200",
  "Ótimo Recorrente": "bg-purple-100 text-purple-700 border-purple-200",
};

export default function Clients() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [oldCodeInput, setOldCodeInput] = useState("");
  const [oldCode, setOldCode] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [vipOnly, setVipOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canInactiveClient } = usePermissions();
  const pageSize = 50;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce old code search
  useEffect(() => {
    const timer = setTimeout(() => setOldCode(oldCodeInput), 400);
    return () => clearTimeout(timer);
  }, [oldCodeInput]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, oldCode, cityFilter, stateFilter, vipOnly]);

  // Build server-side query
  const query = useMemo(() => {
    const conditions = [];
    if (cityFilter !== "all") conditions.push({ city: cityFilter });
    if (stateFilter !== "all") conditions.push({ state: stateFilter });
    if (vipOnly) conditions.push({ vip_client: true });
    if (oldCode.trim()) {
      const escOld = oldCode.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      conditions.push({ $or: [{ old_code: { $regex: escOld, $options: 'i' } }] });
    }
    if (search.trim()) {
      const esc = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      conditions.push({
        $or: [
          { name: { $regex: esc, $options: 'i' } },
          { document: { $regex: esc, $options: 'i' } },
          { new_code: { $regex: esc, $options: 'i' } },
          { old_code: { $regex: esc, $options: 'i' } },
        ],
      });
    }
    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }, [search, oldCode, cityFilter, stateFilter, vipOnly]);

  // Current page (fast — only 50 records from server)
  const { data: pageClients = [], isLoading } = useQuery({
    queryKey: ["clients", "page", search, oldCode, cityFilter, stateFilter, vipOnly, currentPage],
    queryFn: async () => {
      const skip = (currentPage - 1) * pageSize;
      return base44.entities.Client.filter(query, "new_code", pageSize, skip);
    },
    staleTime: 2 * 60 * 1000,
  });

  // Summary (total count + city/state options) — lightweight fields only, max 5000 per batch
  const { data: summary = [] } = useQuery({
    queryKey: ["clients", "summary"],
    queryFn: async () => {
      let all = [];
      let batch = [];
      let skip = 0;
      do {
        batch = await base44.entities.Client.filter({}, "-new_code", 5000, skip, ["city", "state"]);
        all = all.concat(batch);
        skip += batch.length;
      } while (batch.length >= 5000);
      return all;
    },
    staleTime: 10 * 60 * 1000,
  });

  const cities = useMemo(
    () => [...new Set(summary.map(c => c.city).filter(Boolean))].sort(),
    [summary]
  );
  const states = useMemo(
    () => [...new Set(summary.map(c => c.state).filter(Boolean))].sort(),
    [summary]
  );

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }) => base44.entities.Client.update(id, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const hasMore = pageClients.length === pageSize;
  const hasFilters = search || oldCode || cityFilter !== "all" || stateFilter !== "all" || vipOnly;

  const exportCsv = async () => {
    let all = [];
    let batch = [];
    let skip = 0;
    do {
      batch = await base44.entities.Client.filter({}, "-new_code", 5000, skip);
      all = all.concat(batch);
      skip += batch.length;
    } while (batch.length >= 5000);

    const columns = [
      "new_code", "old_code", "base_type", "person_type", "client_type", "name", "fantasy_name",
      "document", "state_registration", "email", "birth_date",
      "phone1", "phone1_name", "phone1_whatsapp", "phone2", "phone2_name", "phone2_whatsapp",
      "phone3", "phone3_name", "phone3_whatsapp", "phone4", "phone4_name", "phone4_whatsapp",
      "phone5", "phone5_name", "phone5_whatsapp",
      "zoox_phone1", "zoox_phone2", "zoox_phone3", "zoox_phone4", "zoox_phone5", "zoox_phone6", "zoox_phone7",
      "zip_code", "street", "number", "complement", "neighborhood", "city", "state",
      "status", "last_purchase_date", "last_product", "registration_date", "notes",
    ];
    const headers = [
      "Código Novo", "Código Antigo", "Base", "Tipo de Pessoa", "Tipo de Cliente", "Nome/Razão Social", "Nome Fantasia",
      "CPF/CNPJ", "Inscrição Estadual", "E-mail", "Data de Nascimento",
      "Telefone 1", "Nome Contato 1", "WhatsApp 1", "Telefone 2", "Nome Contato 2", "WhatsApp 2",
      "Telefone 3", "Nome Contato 3", "WhatsApp 3", "Telefone 4", "Nome Contato 4", "WhatsApp 4",
      "Telefone 5", "Nome Contato 5", "WhatsApp 5",
      "Telefone Zoox 1", "Telefone Zoox 2", "Telefone Zoox 3", "Telefone Zoox 4", "Telefone Zoox 5", "Telefone Zoox 6", "Telefone Zoox 7",
      "CEP", "Logradouro", "Número", "Complemento", "Bairro", "Cidade", "Estado",
      "Status/Lista", "Data Última Compra", "Último Produto", "Data de Cadastro", "Observações",
    ];
    const escape = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(";") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };
    const rows = all.map(c => columns.map(col => escape(c[col])).join(";"));
    const csvContent = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clientes.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Clientes" description={summary.length > 0 ? `${summary.length} clientes cadastrados` : "Carregando..."}>
        <Button variant="outline" onClick={exportCsv} className="gap-2">
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
        <Button onClick={() => navigate("/clientes/novo")} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Cliente
        </Button>
      </PageHeader>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF/CNPJ, código ou telefone..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="relative w-full sm:w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Código Antigo..."
            value={oldCodeInput}
            onChange={e => setOldCodeInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={cityFilter} onValueChange={v => setCityFilter(v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Cidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {cities.map(city => (
              <SelectItem key={city} value={city}>{city}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={v => setStateFilter(v)}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {states.map(state => (
              <SelectItem key={state} value={state}>{state}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={vipOnly ? "default" : "outline"}
          onClick={() => setVipOnly(v => !v)}
          className="gap-2"
        >
          <Star className={`h-4 w-4 ${vipOnly ? "" : "text-amber-500 fill-amber-500"}`} />
          {vipOnly ? "Somente Cliente VIP" : "Cliente VIP"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : pageClients.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Tente ajustar a busca ou os filtros." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Código</TableHead>
                <TableHead>Código Antigo</TableHead>
                <TableHead>Nome/Razão Social</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Lista</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageClients.map(client => (
                <TableRow key={client.id} className={`hover:bg-muted/30 transition-colors ${client.is_active === false ? "opacity-50" : ""}`}>
                  <TableCell className="font-mono text-xs">{client.new_code || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{client.old_code || "-"}</TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {client.vip_client && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" title="Cliente VIP Brazon" />}
                      {client.fantasy_name || client.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{client.document || "-"}</TableCell>
                  <TableCell className="text-sm">{client.phone1 || "-"}</TableCell>
                  <TableCell className="text-sm">{client.city || "-"}</TableCell>
                  <TableCell className="text-sm">{client.state || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[client.status] || "bg-muted text-muted-foreground border-border"}>{client.status || "-"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/clientes/${client.id}`}><Eye className="h-4 w-4" /></Link>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/clientes/${client.id}/editar`)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canInactiveClient && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={client.is_active === false ? "Ativar cliente" : "Inativar cliente"}
                          onClick={() => toggleActiveMutation.mutate({ id: client.id, isActive: !(client.is_active !== false) })}
                        >
                          <Power className={`h-4 w-4 ${client.is_active === false ? "text-muted-foreground" : "text-emerald-600"}`} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-sm text-muted-foreground">
              Mostrando {(currentPage - 1) * pageSize + 1}-{(currentPage - 1) * pageSize + pageClients.length}
              {!hasFilters && summary.length > 0 ? ` de ${summary.length}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">Página {currentPage}</span>
              <Button variant="outline" size="icon" disabled={!hasMore} onClick={() => setCurrentPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
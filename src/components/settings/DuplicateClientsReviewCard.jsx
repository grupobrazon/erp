import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, Copy, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

export default function DuplicateClientsReviewCard() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [groups, setGroups] = useState([]);
  const [expanded, setExpanded] = useState({});

  const runDetection = async () => {
    setRunning(true);
    setGroups([]);
    setSummary(null);
    setExpanded({});
    try {
      const res = await base44.functions.invoke('detectDuplicateClients', {});
      setSummary(res.data.summary);
      setGroups(res.data.groups || []);
    } catch (e) {
      setSummary({ error: e.response?.data?.error || e.message || "Erro" });
    }
    setRunning(false);
  };

  const toggleGroup = (idx) => setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Copy className="h-5 w-5 text-purple-600" />
          Revisão de Clientes Duplicados
        </CardTitle>
        <CardDescription>
          Vistoria toda a base de clientes e agrupa os que têm o <strong>mesmo nome</strong> mas
          <strong> telefones diferentes</strong> — possíveis cadastros duplicados da mesma pessoa.
          O telefone é o principal identificador do cliente, então é importante revisar antes de consolidar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O sistema gera uma lista separada com cada grupo de mesmo nome. Grupos que <strong>compartilham
          um telefone</strong> são quase certamente o mesmo cliente; grupos com <strong>telefones todos
          diferentes</strong> precisam de revisão manual para confirmar se é a mesma pessoa.
        </p>

        <Button onClick={runDetection} disabled={running} className="gap-2">
          <Search className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running ? "Vistoriando base..." : "Gerar Lista de Duplicados"}
        </Button>

        {summary && !summary.error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-center">
              <p className="text-2xl font-bold">{summary.total_clients_scanned}</p>
              <p className="text-xs text-muted-foreground">Clientes vistoriados</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-center">
              <p className="text-2xl font-bold">{summary.total_same_name_groups}</p>
              <p className="text-xs text-muted-foreground">Grupos de mesmo nome</p>
            </div>
            <div className="rounded-lg border bg-amber-50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{summary.potential_duplicates}</p>
              <p className="text-xs text-muted-foreground">Potenciais (tel. diferente)</p>
            </div>
            <div className="rounded-lg border bg-red-50 p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{summary.confirmed_duplicates}</p>
              <p className="text-xs text-muted-foreground">Confirmados (tel. igual)</p>
            </div>
          </div>
        )}

        {summary?.error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {summary.error}
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {groups.length} grupos encontrados — clique para expandir
            </div>
            <div className="rounded-md border max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-20">Clientes</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g, i) => (
                    <React.Fragment key={i}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleGroup(i)}
                      >
                        <TableCell>
                          {expanded[i]
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="font-medium">{g.display_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{g.client_count}</Badge>
                        </TableCell>
                        <TableCell>
                          {g.shares_phone
                            ? <Badge className="bg-red-100 text-red-700 border-red-200"><CheckCircle2 className="h-3 w-3 mr-1" />Tel. igual</Badge>
                            : <Badge className="bg-amber-100 text-amber-700 border-amber-200"><AlertTriangle className="h-3 w-3 mr-1" />Tel. diferente</Badge>}
                        </TableCell>
                      </TableRow>
                      {expanded[i] && (
                        <TableRow>
                          <TableCell colSpan={4} className="bg-muted/30 p-3">
                            <div className="space-y-2">
                              {g.clients.map(c => (
                                <div key={c.id} className="flex flex-wrap items-start gap-3 text-sm border-b pb-2 last:border-0">
                                  <div className="flex-1 min-w-[200px]">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{c.new_code || c.old_code || "—"}</span>
                                      <span className="font-medium">{c.name}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {c.person_type === "Jurídica" ? "Pessoa Jurídica" : "Pessoa Física"}
                                      {c.city && ` · ${c.city}`}
                                      {c.state && `/${c.state}`}
                                      {c.is_active === false && " · Inativo"}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {c.phones.length > 0 ? c.phones.map((p, pi) => (
                                      <span key={pi} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{p}</span>
                                    )) : <span className="text-xs text-muted-foreground">Sem telefone</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
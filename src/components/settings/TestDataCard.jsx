import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FlaskConical, Trash2, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function TestDataCard() {
  const [loading, setLoading] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    setLoading("create");
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("manageTestData", { action: "create" });
      setResult(res.data);
    } catch (err) {
      setError(err?.message || "Erro ao criar dados de teste");
    } finally {
      setLoading(null);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm("Confirma a exclusão de TODOS os dados de teste (vendas, OSs, faturamentos, rotas e clientes de teste)? Esta ação não pode ser desfeita.")) return;
    setLoading("cleanup");
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("manageTestData", { action: "cleanup" });
      setResult(res.data);
    } catch (err) {
      setError(err?.message || "Erro ao limpar dados de teste");
    } finally {
      setLoading(null);
    }
  };

  const handleCleanAll = async () => {
    if (!window.confirm("⚠ ATENÇÃO: Isso vai APAGAR TODAS as vendas, ordens de serviço, faturamentos, notas fiscais, remessas e rotas do sistema (não apenas dados de teste). Confirmar?")) return;
    if (!window.confirm("Tem certeza absoluta? Todos os dados transacionais serão perdidos permanentemente.")) return;
    setLoading("clean_all");
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("manageTestData", { action: "clean_all" });
      setResult(res.data);
    } catch (err) {
      setError(err?.message || "Erro ao limpar dados");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Dados de Teste — Jornada de Venda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cria 3 vendas fictícias no estágio "Confirmada" com condição de pagamento e comprovante anexado:
          Entrega Própria (Total), Envio (Total — pagamento integral obrigatório) e Entrega + Instalação (Parcial).
          As vendas Total aguardam aprovação financeira; a Parcial libera OS automaticamente.
          Você percorre a jornada real pelo sistema. Todos os dados podem ser removidos com o botão de limpeza.
        </p>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleCreate} disabled={!!loading} className="gap-2">
            {loading === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {loading === "create" ? "Criando..." : "Criar Cenário de Teste"}
          </Button>
          <Button variant="destructive" onClick={handleCleanup} disabled={!!loading} className="gap-2">
            {loading === "cleanup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {loading === "cleanup" ? "Limpando..." : "Limpar Dados de Teste"}
          </Button>
        </div>

        <div className="border-t pt-3 mt-2">
          <p className="text-xs text-muted-foreground mb-2">
            Limpeza completa do sistema: remove <strong>todas</strong> as vendas, OSs, faturamentos, notas fiscais, remessas e rotas (não apenas dados de teste).
          </p>
          <Button variant="destructive" onClick={handleCleanAll} disabled={!!loading} className="gap-2 w-full">
            {loading === "clean_all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            {loading === "clean_all" ? "Limpando tudo..." : "Limpar TODOS os Dados do Sistema"}
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result?.created && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Cenário de teste criado com sucesso!
            </div>

            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">
                Cliente: <span className="font-medium text-foreground">{result.client?.name}</span> ({result.client?.new_code})
              </p>

              {result.created.sales.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Vendas Criadas</p>
                  {result.created.sales.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="font-mono font-semibold">{s.order_number}</span>
                      <span>{s.modality}</span>
                      <span className="text-muted-foreground">— {s.stage} ({s.confirmation_type})</span>
                    </div>
                  ))}
                </div>
              )}

            </div>

            <div className="p-3 rounded-lg bg-primary/5 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Como testar a jornada:</p>
              <p>1. <strong>Entrega Própria (Total)</strong> — Confirmações de Venda → aprovação financeira → após aprovar, OS gerada (Entrega)</p>
              <p>2. <strong>Envio (Total)</strong> — Confirmações de Venda → aprovação financeira → OS gerada (Expedição) → Produção/Expedição → etiqueta Melhor Envio → transporte</p>
              <p>3. <strong>Entrega + Instalação (Parcial)</strong> — OS liberada automaticamente → Aguardando Rota → Agendamento → Liberado para Técnico</p>
              {result.note && <p className="mt-2 italic">{result.note}</p>}
            </div>
          </div>
        )}

        {result?.deleted && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">{result.wiped === 'all' ? 'Todos os dados transacionais removidos!' : 'Dados de teste removidos!'}</p>
              <p className="text-xs mt-0.5">
                {result.deleted.sales} venda(s), {result.deleted.serviceOrders} OS, {result.deleted.remessas || 0} remessa(s), {result.deleted.routes} rota(s){result.deleted.clients ? `, ${result.deleted.clients} cliente(s)` : ''}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
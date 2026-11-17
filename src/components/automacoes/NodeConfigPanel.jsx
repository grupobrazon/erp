import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IF_OPERATORS, LOOP_ACTIONS, TRANSFORM_TYPES, NODE_MAP } from "./nodeTypes";
import CronSchedulerButton from "./CronSchedulerButton";
import { Plus, Trash2, X } from "lucide-react";

const ENTITY_NAMES = [
  "Sale", "ServiceOrder", "Client", "Product", "ProductGroup", "ProductSubgroup",
  "Service", "Equipment", "Maintenance", "Technician", "TechnicianRoute", "RouteRegion",
  "RouteZone", "StockMovement", "StockByLocation", "StockLocation", "StockUnit",
  "PaymentCondition", "BillingLocation", "Supplier", "PurchaseOrder", "AccountPayable",
  "BankAccount", "BankTransaction", "ChartOfAccount", "Cfop", "Alert", "Remessa",
  "Seller", "Automacao", "AutomacaoExecucao", "AutomacaoCredencial",
];

export default function NodeConfigPanel({ node, credentials, onUpdate, onDelete }) {
  if (!node) {
    return (
      <div className="w-80 border-l border-border bg-card h-full flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground text-center">
          Selecione um nó para configurar
        </p>
      </div>
    );
  }

  const def = NODE_MAP[node.type];
  const config = node.data?.config || {};
  const isTrigger = String(node.type).startsWith("trigger_");

  const update = (patch) => {
    onUpdate(node.id, { ...config, ...patch });
  };

  const updateNested = (key, patch) => {
    update({ [key]: { ...(config[key] || {}), ...patch } });
  };

  return (
    <div className="w-80 border-l border-border bg-card h-full overflow-y-auto flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{def?.category}</div>
          <div className="text-sm font-semibold truncate">{node.data?.label || def?.label}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onDelete(node.id)} title="Excluir nó">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="p-3 space-y-3 flex-1">
        <div>
          <Label className="text-xs">Rótulo do nó</Label>
          <Input
            value={node.data?.label || ""}
            onChange={(e) => onUpdate(node.id, { ...config }, { label: e.target.value })}
            className="mt-1"
          />
        </div>

        {node.type === "trigger_webhook" && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
            Este nó recebe o payload do webhook automaticamente. A URL pública será gerada ao salvar.
          </div>
        )}

        {node.type === "trigger_cron" && (
          <CronSchedulerButton value={config.cron_expressao} onChange={(v) => update({ cron_expressao: v })} />
        )}

        {node.type === "trigger_entidade" && (
          <>
            <div>
              <Label className="text-xs">Entidade observada</Label>
              <EntitySelect value={config.entidade_alvo} onChange={(v) => update({ entidade_alvo: v })} />
            </div>
            <div>
              <Label className="text-xs">Evento</Label>
              <Select value={config.evento_entidade || "create"} onValueChange={(v) => update({ evento_entidade: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Criar</SelectItem>
                  <SelectItem value="update">Atualizar</SelectItem>
                  <SelectItem value="delete">Excluir</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {node.type === "http_request" && (
          <>
            <div>
              <Label className="text-xs">Método</Label>
              <Select value={config.method || "GET"} onValueChange={(v) => update({ method: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">URL</Label>
              <Input value={config.url || ""} onChange={(e) => update({ url: e.target.value })} placeholder="https://api.exemplo.com/{{$input.id}}" className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Credencial (opcional)</Label>
              <CredentialSelect value={config.credential} credentials={credentials} onChange={(v) => update({ credential: v })} />
            </div>
            <div>
              <Label className="text-xs">Headers (JSON)</Label>
              <Textarea value={safeJson(config.headers)} onChange={(e) => update({ headers: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={3} placeholder='{"Content-Type": "application/json"}' />
            </div>
            <div>
              <Label className="text-xs">Body (JSON ou template)</Label>
              <Textarea value={typeof config.body === "string" ? config.body : safeJson(config.body)} onChange={(e) => update({ body: e.target.value })} className="mt-1 font-mono text-xs" rows={4} placeholder='{"campo": "{{$input.valor}}"}' />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Timeout (s)</Label>
                <Input type="number" value={config.timeout || 30} onChange={(e) => update({ timeout: Number(e.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Retries</Label>
                <Input type="number" value={config.retry || 0} onChange={(e) => update({ retry: Number(e.target.value) })} className="mt-1" />
              </div>
            </div>
          </>
        )}

        {node.type === "entity_read" && (
          <>
            <div>
              <Label className="text-xs">Entidade</Label>
              <EntitySelect value={config.entity} onChange={(v) => update({ entity: v })} />
            </div>
            <div>
              <Label className="text-xs">Operação</Label>
              <Select value={config.operation || "list"} onValueChange={(v) => update({ operation: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="get">get (por id)</SelectItem>
                  <SelectItem value="list">list</SelectItem>
                  <SelectItem value="filter">filter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Parâmetros (JSON)</Label>
              <Textarea value={safeJson(config.params)} onChange={(e) => update({ params: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={4} placeholder='{"id": "{{$input.id}}"} ou {"filter": {"status": "ativo"}, "limit": 10}' />
            </div>
          </>
        )}

        {node.type === "entity_write" && (
          <>
            <div>
              <Label className="text-xs">Entidade</Label>
              <EntitySelect value={config.entity} onChange={(v) => update({ entity: v })} />
            </div>
            <div>
              <Label className="text-xs">Operação</Label>
              <Select value={config.operation || "create"} onValueChange={(v) => update({ operation: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">create</SelectItem>
                  <SelectItem value="update">update</SelectItem>
                  <SelectItem value="delete">delete</SelectItem>
                  <SelectItem value="bulkCreate">bulkCreate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Parâmetros (JSON)</Label>
              <Textarea value={safeJson(config.params)} onChange={(e) => update({ params: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={4} placeholder='{"id": "{{$input.id}}", "data": {"status": "ativo"}}' />
            </div>
          </>
        )}

        {node.type === "integration_call" && (
          <>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={config.kind || "function"} onValueChange={(v) => update({ kind: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="function">Function backend</SelectItem>
                  <SelectItem value="core">Integração Core</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.kind === "function" ? (
              <div>
                <Label className="text-xs">Nome da function</Label>
                <Input value={config.functionName || ""} onChange={(e) => update({ functionName: e.target.value })} className="mt-1 font-mono text-xs" placeholder="emitNFe" />
              </div>
            ) : (
              <div>
                <Label className="text-xs">Endpoint Core</Label>
                <Input value={config.endpoint || ""} onChange={(e) => update({ endpoint: e.target.value })} className="mt-1 font-mono text-xs" placeholder="InvokeLLM / UploadFile / SendEmail" />
              </div>
            )}
            <div>
              <Label className="text-xs">Parâmetros (JSON)</Label>
              <Textarea value={safeJson(config.params)} onChange={(e) => update({ params: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={4} placeholder='{"prompt": "{{$input.texto}}"}' />
            </div>
          </>
        )}

        {node.type === "transform_depara" && (
          <DeparaEditor mappings={config.mappings || []} onChange={(m) => update({ mappings: m })} />
        )}

        {node.type === "transform_readsheet" && (
          <>
            <div>
              <Label className="text-xs">URL do arquivo</Label>
              <Input value={config.file_url || ""} onChange={(e) => update({ file_url: e.target.value })} className="mt-1 font-mono text-xs" placeholder="{{$input.file_url}}" />
            </div>
            <div>
              <Label className="text-xs">JSON Schema (extração)</Label>
              <Textarea value={safeJson(config.json_schema)} onChange={(e) => update({ json_schema: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={5} />
            </div>
          </>
        )}

        {node.type === "transform_writesheet" && (
          <>
            <div>
              <Label className="text-xs">Nome do arquivo</Label>
              <Input value={config.filename || ""} onChange={(e) => update({ filename: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Nome da aba</Label>
              <Input value={config.sheet_name || ""} onChange={(e) => update({ sheet_name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Linhas (JSON / template)</Label>
              <Textarea value={safeJson(config.rows)} onChange={(e) => update({ rows: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={5} placeholder='[{"nome": "{{$input.nome}}"}]' />
            </div>
          </>
        )}

        {node.type === "pdf_extract" && (
          <>
            <div>
              <Label className="text-xs">URL do PDF</Label>
              <Input value={config.file_url || ""} onChange={(e) => update({ file_url: e.target.value })} className="mt-1 font-mono text-xs" placeholder="{{$input.file_url}}" />
            </div>
            <div>
              <Label className="text-xs">JSON Schema (extração)</Label>
              <Textarea value={safeJson(config.json_schema)} onChange={(e) => update({ json_schema: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={5} />
            </div>
          </>
        )}

        {node.type === "pdf_generate" && (
          <>
            <div>
              <Label className="text-xs">Nome do arquivo</Label>
              <Input value={config.filename || ""} onChange={(e) => update({ filename: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={config.content?.title || ""} onChange={(e) => updateNested("content", { title: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Linhas (JSON array)</Label>
              <Textarea value={safeJson(config.content?.lines)} onChange={(e) => updateNested("content", { lines: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={5} placeholder='["{{$input.linha1}}", "Texto fixo"]' />
            </div>
          </>
        )}

        {node.type === "loop_foreach" && (
          <LoopEditor config={config} update={update} credentials={credentials} />
        )}

        {node.type === "if_condition" && (
          <>
            <div>
              <Label className="text-xs">Campo (template)</Label>
              <Input value={config.field || ""} onChange={(e) => update({ field: e.target.value })} className="mt-1 font-mono text-xs" placeholder="{{$input.status}}" />
            </div>
            <div>
              <Label className="text-xs">Operador</Label>
              <Select value={config.operator || "eq"} onValueChange={(v) => update({ operator: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IF_OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!["exists", "not_exists"].includes(config.operator) && (
              <div>
                <Label className="text-xs">Valor</Label>
                <Input value={config.value ?? ""} onChange={(e) => update({ value: e.target.value })} className="mt-1 font-mono text-xs" placeholder="ativo" />
              </div>
            )}
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-800">
              Conecte a saída <b>Verdadeiro</b> ou <b>Falso</b> aos próximos nós.
            </div>
          </>
        )}

        {node.type === "switch_branch" && (
          <SwitchEditor config={config} update={update} />
        )}
      </div>
    </div>
  );
}

function EntitySelect({ value, onChange }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
      <SelectContent>
        {ENTITY_NAMES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CredentialSelect({ value, credentials, onChange }) {
  return (
    <Select value={value || "_none"} onValueChange={(v) => onChange(v === "_none" ? "" : v)}>
      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Nenhuma</SelectItem>
        {(credentials || []).map((c) => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DeparaEditor({ mappings, onChange }) {
  const addMapping = () => onChange([...mappings, { source: "", target: "", transform: "none" }]);
  const updateMapping = (idx, patch) => {
    const next = mappings.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    onChange(next);
  };
  const removeMapping = (idx) => onChange(mappings.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs">Mapeamentos De-Para</Label>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={addMapping}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-2">
        {mappings.map((mp, idx) => (
          <div key={idx} className="rounded-md border border-border p-2 space-y-1.5 bg-background">
            <div className="flex gap-1">
              <Input value={mp.source || ""} onChange={(e) => updateMapping(idx, { source: e.target.value })} placeholder="origem ({{$input.x}})" className="text-xs font-mono h-7" />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => removeMapping(idx)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <Input value={mp.target || ""} onChange={(e) => updateMapping(idx, { target: e.target.value })} placeholder="destino" className="text-xs h-7" />
            <Select value={mp.transform || "none"} onValueChange={(v) => updateMapping(idx, { transform: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSFORM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
        {mappings.length === 0 && <p className="text-xs text-muted-foreground">Nenhum mapeamento. Clique em + para adicionar.</p>}
      </div>
    </div>
  );
}

function LoopEditor({ config, update, credentials }) {
  return (
    <>
      <div>
        <Label className="text-xs">Array (template)</Label>
        <Input value={config.array || ""} onChange={(e) => update({ array: e.target.value })} className="mt-1 font-mono text-xs" placeholder="{{$input.itens}}" />
      </div>
      <div>
        <Label className="text-xs">Ação por item</Label>
        <Select value={config.acao_tipo || "function"} onValueChange={(v) => update({ acao_tipo: v })}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LOOP_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {config.acao_tipo === "function" && (
        <div>
          <Label className="text-xs">Nome da function</Label>
          <Input value={config.functionName || ""} onChange={(e) => update({ functionName: e.target.value })} className="mt-1 font-mono text-xs" />
        </div>
      )}
      {config.acao_tipo === "entity_create" && (
        <>
          <div><Label className="text-xs">Entidade</Label><EntitySelect value={config.entity} onChange={(v) => update({ entity: v })} /></div>
          <div><Label className="text-xs">Data (JSON/template)</Label><Textarea value={safeJson(config.data)} onChange={(e) => update({ data: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={3} /></div>
        </>
      )}
      {config.acao_tipo === "entity_update" && (
        <>
          <div><Label className="text-xs">Entidade</Label><EntitySelect value={config.entity} onChange={(v) => update({ entity: v })} /></div>
          <div><Label className="text-xs">ID (template)</Label><Input value={config.id || ""} onChange={(e) => update({ id: e.target.value })} className="mt-1 font-mono text-xs" placeholder="{{$input.id}}" /></div>
          <div><Label className="text-xs">Data (JSON/template)</Label><Textarea value={safeJson(config.data)} onChange={(e) => update({ data: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={3} /></div>
        </>
      )}
      {config.acao_tipo === "http" && (
        <>
          <div>
            <Label className="text-xs">Método</Label>
            <Select value={config.method || "POST"} onValueChange={(v) => update({ method: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">URL</Label><Input value={config.url || ""} onChange={(e) => update({ url: e.target.value })} className="mt-1 font-mono text-xs" /></div>
          <div><Label className="text-xs">Credencial</Label><CredentialSelect value={config.credential} credentials={credentials} onChange={(v) => update({ credential: v })} /></div>
          <div><Label className="text-xs">Body (JSON/template)</Label><Textarea value={safeJson(config.body)} onChange={(e) => update({ body: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={3} /></div>
        </>
      )}
      {config.acao_tipo === "function" && (
        <div><Label className="text-xs">Payload (JSON/template)</Label><Textarea value={safeJson(config.payload)} onChange={(e) => update({ payload: safeParse(e.target.value) })} className="mt-1 font-mono text-xs" rows={3} /></div>
      )}
    </>
  );
}

function SwitchEditor({ config, update }) {
  const cases = config.cases || [];
  const addCase = () => update({ cases: [...cases, { value: "", handle: `case_${cases.length + 1}` }] });
  const updateCase = (idx, patch) => update({ cases: cases.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });
  const removeCase = (idx) => update({ cases: cases.filter((_, i) => i !== idx) });

  return (
    <>
      <div>
        <Label className="text-xs">Campo (template)</Label>
        <Input value={config.field || ""} onChange={(e) => update({ field: e.target.value })} className="mt-1 font-mono text-xs" placeholder="{{$input.tipo}}" />
      </div>
      <div>
        <Label className="text-xs">Handle padrão</Label>
        <Input value={config.default_handle || "default"} onChange={(e) => update({ default_handle: e.target.value })} className="mt-1 font-mono text-xs" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs">Casos</Label>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={addCase}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="space-y-2">
          {cases.map((c, idx) => (
            <div key={idx} className="flex gap-1 items-center">
              <Input value={c.value || ""} onChange={(e) => updateCase(idx, { value: e.target.value })} placeholder="valor" className="text-xs h-7" />
              <Input value={c.handle || ""} onChange={(e) => updateCase(idx, { handle: e.target.value })} placeholder="handle" className="text-xs h-7 font-mono" />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeCase(idx)}><X className="h-3 w-3" /></Button>
            </div>
          ))}
          {cases.length === 0 && <p className="text-xs text-muted-foreground">Adicione casos. Cada caso gera uma porta de saída.</p>}
        </div>
      </div>
    </>
  );
}

function safeJson(obj) {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  try { return JSON.stringify(obj, null, 2); } catch { return ""; }
}
function safeParse(str) {
  if (!str || !str.trim()) return {};
  try { return JSON.parse(str); } catch { return str; }
}
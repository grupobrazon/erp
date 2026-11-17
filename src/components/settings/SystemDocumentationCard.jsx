import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, FileDown } from "lucide-react";

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/851be8c4e_logobrazon.jpg";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function section(title, intro, items) {
  const lis = items.map((it) => `<li><strong>${esc(it.t)}</strong>${it.d ? ` — ${esc(it.d)}` : ""}</li>`).join("");
  return `
    <div class="mod">
      <h2>${esc(title)}</h2>
      ${intro ? `<p class="intro">${esc(intro)}</p>` : ""}
      <ul>${lis}</ul>
    </div>`;
}

function flowBlock(title, steps) {
  const stepsHtml = steps.map((s, i) => `<div class="step"><span class="step-num">${i + 1}</span><span class="step-txt">${esc(s)}</span></div>`).join("");
  return `
    <div class="flow">
      <h3>${esc(title)}</h3>
      ${stepsHtml}
    </div>`;
}

function mapTable(title, headers, rows) {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  return `
    <div class="flow">
      <h3>${esc(title)}</h3>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>`;
}

function buildHtml() {
  const today = new Date().toLocaleDateString("pt-BR");

  const modules = [
    section("Início", "Página inicial com atalhos e visão geral do dia.", [
      { t: "Dashboard", d: "Resumo de atividades, indicadores rápidos e navegação para os principais módulos." },
    ]),
    section("Vendas", "Gestão comercial completa — do cliente ao faturamento.", [
      { t: "Clientes", d: "Cadastro de pessoas físicas e jurídicas, com códigos automáticos (B000001), telefones múltiplos e endereços." },
      { t: "Vendas", d: "Criação de orçamentos e pedidos (P001), com itens, condições de pagamento, frete, modalidade de entrega e relacionamento (agendamento)." },
      { t: "Remessas", d: "Operações de demonstração, consignação, remessa e devolução — nunca usam CFOP de venda. Geram NF-e própria." },
      { t: "Faturamento", d: "Emissão de Nota Fiscal e Nota Simples das OS e remessas, com transmissão SEFAZ (Focus NFe) e DANFE." },
      { t: "Notas Fiscais", d: "Listagem e gestão de NF-e emitidas, consulta de status, carta de correção (CC-e) e cancelamento." },
    ]),
    section("Estoque", "Controle de produtos e saldos por local.", [
      { t: "Produtos", d: "Cadastro de produtos com grupo (prefixo de código), subgrupo, dimensões para frete, NCM, custo, preço e intervalo de manutenção." },
      { t: "Estoque", d: "Saldo por local de estoque, movimentações de entrada/saída e unidades de medida." },
    ]),
    section("Manutenção", "Ciclo de vida dos equipamentos e ordens de serviço.", [
      { t: "Painel de Manutenção", d: "CRM de troca de refis — contato com cliente, agendamento, vínculo de peças e geração de venda de troca." },
      { t: "Ordens de Serviço", d: "Lista de OS com steppers de expedição, aprovação financeira, produção, rota e execução pelo técnico." },
      { t: "Agenda de Rotas", d: "Agenda Inteligente de Rotas — sugestão automática de rotas otimizadas por zona e disponibilidade do técnico." },
      { t: "Rotas de Técnico", d: "Gestão manual de rotas atribuídas a técnicos, com ordem de visita e status." },
      { t: "Produção", d: "Painel de produção/expedição para OS que precisam ser fabricadas antes da expedição." },
      { t: "Dashboard de Produção", d: "Indicadores de produção em andamento, prazos e gargalos." },
    ]),
    section("Estratégia & Oportunidade", "Análise de faturamento potencial e oportunidades de venda.", [
      { t: "Dashboard de Oportunidades", d: "Cálculo de Faturamento Potencial (ticket médio R$ 230,00) a partir da base de equipamentos e CRM." },
    ]),
    section("Financeiro", "Fluxo financeiro de recebimentos, compras e pagamentos.", [
      { t: "Confirmações de Venda", d: "Aprovação financeira de vendas confirmadas (Total ou Parcial) antes de gerar OS." },
      { t: "Contas a Receber", d: "Lançamentos de recebimento das vendas, com split contábil (5103 receita / 8102 frete) e conciliação." },
      { t: "Compras", d: "Pedidos de compra a fornecedores, importação fiscal (XML da NF-e) ou não fiscal (PDF), mapeamento de itens e geração de contas a pagar." },
      { t: "Contas a Pagar", d: "Contas a pagar de fornecedores, salários, impostos etc., vinculadas a plano de contas e conta bancária." },
      { t: "Conciliação Bancária", d: "Importação de extrados (OFX), conciliação de transações com recebimentos e pagamentos." },
    ]),
    section("Cadastros", "Configurações mestre do sistema.", [
      { t: "Cadastros de Produtos", d: "Grupos (prefixo e dimensões), subgrupos, unidades, fontes de suprimento e tipos de produto." },
      { t: "Cadastros Financeiros", d: "Plano de contas, contas bancárias, condições de pagamento (Recebimento/Pagamento), CFOP e locais de faturamento." },
      { t: "Cadastros do Sistema", d: "Vendedores, técnicos, regiões e zonas de rota." },
    ]),
    section("Sistema", "Administração e ferramentas do sistema.", [
      { t: "Usuários", d: "Convites de usuários com perfis (admin, supervisor, vendedor, técnico, producao, logistica) e vínculo a vendedor/técnico." },
      { t: "Importação", d: "Importação de dados legados (clientes, vendas, manutenções) e planilhas de telefones." },
      { t: "Backups", d: "Criação e restauração de backups do banco de dados." },
      { t: "Configurações", d: "Normalização de dados, configuração NF-e, dados de teste e esta documentação." },
    ]),
  ].join("");

  const modalityTable = mapTable(
    "Modalidade de Entrega × Tipo de OS × Stepper",
    ["Modalidade", "Tipo de OS gerada", "Etapas do stepper"],
    [
      ["Envio", "Expedição", "Produção/Expedição → (Produção se sem estoque) → Etiqueta Gerada → Separação → Saída do Estoque → Em Transporte → Entregue"],
      ["Entrega Própria", "Entrega", "Produção/Expedição → (Produção) → Agendamento/Rota → Faturamento → Liberado p/ Técnico → Em Execução → Concluída pelo Técnico → Aguardando Faturamento - Pós → Faturada → Concluída"],
      ["Entrega + Instalação", "Entrega + Instalação", "Mesma da Entrega, com instalação no local pelo técnico (recebe valor pendente na instalação, se Parcial)"],
    ]
  );

  const flows = [
    flowBlock("Fluxo de Venda — Confirmação TOTAL (100% pago)", [
      "Orçamento criado em Vendas com itens, frete e condições de pagamento.",
      "Vendedor confirma como Total (todos os pagamentos já realizados) — etapa 'Confirmada', confirmation_type 'Total'.",
      "Aprovação financeira OBRIGATÓRIA antes da OS: tela 'Confirmações de Venda' valida e aprova → etapa 'Pagamento Aprovado'.",
      "Somente com 'Pagamento Aprovado' o sistema libera a geração da OS (função generateServiceOrder).",
      "A OS nasce DIRETO em 'Produção/Expedição' (a etapa 'Aprovação Comercial' foi removida — não faz sentido a logística enviar para ela mesma).",
      "Venda avança para 'Em OS'.",
      "Logística verifica estoque dentro da OS: confirma estoque OU envia para produção se faltar (ver fluxo de Produção).",
      "A OS percorre o stepper conforme a modalidade (ver tabela acima).",
      "Técnico executa (Em Execução) e conclui (Concluída pelo Técnico) → pós-venda valida (Aguardando Faturamento - Pós) → Faturada → Concluída.",
      "Faturamento (NF-e ou Nota Simples) → 'Faturada' → 'Concluída'.",
      "Contas a Receber gerados automaticamente com split contábil (5103 receita / 8102 frete).",
    ]),
    flowBlock("Fluxo de Venda — Confirmação PARCIAL (pagamento na entrega/instalação)", [
      "Orçamento confirmado como Parcial — existem pagamentos pendentes com momento 'Na Entrega' ou 'Na Instalação'.",
      "A OS é liberada IMEDIATAMENTE após a confirmação, SEM aguardar aprovação financeira — etapa 'Em OS'.",
      "Razão: o valor restante será recebido pelo técnico no local, então não faz sentido bloquear a OS no financeiro antes.",
      "A OS nasce em 'Produção/Expedição'; a logística assume direto (sem 'Aprovação Comercial').",
      "OS segue: Produção/Expedição → (Produção se necessário) → Agendamento/Rota → Liberado para Técnico.",
      "O técnico executa e RECEBE o valor pendente na entrega/instalação (has_pending_payment=true, pending_payment_amount).",
      "Técnico registra o recebimento (valor, forma, foto do comprovante) e conclui a OS.",
      "A OS vai para 'OK - Aprov. Financeira' — aqui sim, o financeiro confere o que o técnico recebeu.",
      "Aprovação financeira → Faturamento → 'Faturada' → 'Concluída'.",
      "Resumo: na Total, o financeiro aprova ANTES da OS; na Parcial, o financeiro aprova DEPOIS que o técnico recebe.",
    ]),
    flowBlock("Fluxo de Produção (quando não há estoque)", [
      "A OS está em 'Produção/Expedição'. A logística abre a OS e vê o painel de estoque com o saldo atual de cada item.",
      "O sistema compara o saldo (current_stock) de cada produto com a quantidade pedida.",
      "Cenário A — TODOS os itens têm saldo: a logística clica 'Confirmar Estoque Verificado' → libera expedição/rota. A OS pula toda a etapa de produção.",
      "Cenário B — algum item NÃO tem saldo suficiente: aparece o alerta 'Faltam X unidades'.",
      "Nesse caso a logística tem duas opções: (a) confirmar mesmo assim (o estoque físico pode divergir do sistema) ou (b) clicar 'Preciso Produzir'.",
      "Ao clicar 'Preciso Produzir': a OS vai para 'Aguardando Produção' (production_needed=true, production_sent_date).",
      "A produção assume a OS: 'Produção Iniciada' (production_started_date) → ao concluir → 'Produção Liberada' (production_liberated_date).",
      "Com a produção liberada, a OS volta ao fluxo normal de expedição/rota conforme a modalidade.",
      "Portanto: a OS só vai para produção quando a logística identifica falta de estoque e envia manualmente — não é automático.",
    ]),
    flowBlock("Fluxo de Expedição (modalidade Envio)", [
      "OS tipo 'Expedição' (venda com modalidade 'Envio'). Não há técnico nem instalação — é envio por transportadora.",
      "Produção/Expedição → (Produção se faltar estoque) → estoque confirmado.",
      "Geração de etiqueta de envio (Melhor Envio) → 'Etiqueta Gerada' (expedition_label_url, carrier, tracking_code).",
      "Separação dos itens → 'Separação' → 'Saída do Estoque'.",
      "Transportadora coleta → 'Em Transporte' (com código de rastreio).",
      "Entrega confirmada → 'Entregue' → OS concluída. Sem faturamento técnico nem aprovação financeira pós-técnico.",
    ]),
    flowBlock("Fluxo de Entrega / Entrega + Instalação (modalidades com técnico)", [
      "OS tipo 'Entrega' ou 'Entrega + Instalação' (venda com modalidade 'Entrega Própria' ou 'Entrega + Instalação').",
      "Produção/Expedição → (Produção se faltar estoque) → estoque confirmado.",
      "Agendamento/Rota: a OS vai para 'Aguardando Rota' e entra na Agenda Inteligente de Rotas.",
      "Atribuição de técnico e zona → 'Agendamento/Rota' → Faturamento (NF-e/Nota Simples) → 'Faturamento'.",
      "OS liberada para o técnico → 'Liberado para Técnico'.",
      "Técnico faz check-in (GPS), executa (Em Execução), tira fotos e coleta assinatura → 'Concluída pelo Técnico'.",
      "Pós-venda valida o atendimento → OS vai para 'Aguardando Faturamento - Pós' (aguardando faturamento e aprovação do financeiro).",
      "Se a venda era Parcial: o técnico recebe o valor pendente e a OS vai para 'Aguardando Faturamento - Pós'.",
      "Aprovação → 'Faturada' → 'Concluída'.",
    ]),
    flowBlock("Ciclo de Vida do Equipamento", [
      "Venda de produto que gera patrimônio cria um registro de Equipment (patrimony_code = código_cliente-01, -02...).",
      "Venda de refil sem equipamento gera um registro 'peca' (record_type=peca), que pode ficar pendente de vínculo.",
      "Equipment recebe data de instalação, garantia e intervalo de manutenção (maintenance_interval_months).",
      "No vencimento (next_maintenance_date), entra no Painel de Manutenção (CRM) com status 'Aguardando Contato'.",
      "Contato com cliente → agendamento de troca de refil (cápsula/elemento filtrante).",
      "Geração de venda de troca (refil) ou manutenção registrada com a peça utilizada.",
      "Atualização do last_maintenance_date e cálculo do próximo next_maintenance_date.",
      "Equipamento pode ser inativado (motivo obrigatório) ou substituído; histórico de produto é append-only.",
    ]),
    flowBlock("Fluxo de Compras", [
      "Pedido de compra criado (PC000001) com fornecedor, itens e condição de pagamento (direção 'Pagamento').",
      "Recebimento: importação fiscal via XML da NF-e (extrai itens, chave, número) ou não fiscal via PDF.",
      "Mapeamento dos itens do fornecedor para produtos do estoque interno.",
      "Entrada automática no estoque do local selecionado.",
      "Geração automática de Contas a Pagar conforme a condição de pagamento (parcelas e vencimentos).",
      "Suporte a antecipação de pagamento quando o fornecedor exige adiantamento para produção.",
    ]),
    flowBlock("Fluxo de Faturamento (NF-e)", [
      "OS ou Remessa pronta para faturar.",
      "Emissão de NF-e via Focus NFe (provedor configurado em Configurações, com certificado e série).",
      "Transmissão SEFAZ — retorno de status, chave e DANFE (downloadDanfe).",
      "Em caso de rejeição, correção dos dados e retransmissão.",
      "Carta de Correção (CC-e) para ajustes pós-autorização (emitCorrectionLetter).",
      "Cancelamento com justificativa quando necessário (cancelNFe).",
    ]),
    flowBlock("Fluxo de Rotas (Agenda Inteligente)", [
      "OS em 'Aguardando Rota' com zona e endereço de entrega definidos.",
      "O sistema sugere rotas otimizadas por zona, capacidade diária e disponibilidade do técnico (generateSmartRoutes).",
      "Atribuição do técnico e definição da ordem de visita (route_order).",
      "Rota 'Planejada' → 'Em Andamento' → 'Concluída'.",
      "Técnico executa cada OS na sequência, com check-in (GPS), fotos do serviço, foto do documento e assinatura.",
    ]),
  ].join("");

  const detailedFlows = modalityTable + flows;

  const entities = [
    ["Client", "Clientes (PF/PJ) com códigos, telefones e endereços."],
    ["Sale", "Vendas/orçamentos com itens, pagamentos, frete, etapa e relacionamento."],
    ["ServiceOrder", "Ordens de Serviço com ciclo de vida, produção, rota e execução."],
    ["Equipment", "Equipamentos/patrimônio com manutenção, CRM e histórico."],
    ["Maintenance", "Registros de manutenção/troca de refil."],
    ["Product", "Produtos com grupo, dimensões, custo, preço e NCM."],
    ["ProductGroup", "Grupos de produto com prefixo de código e dimensões padrão."],
    ["StockUnit / StockLocation / StockMovement", "Unidades, locais e movimentações de estoque."],
    ["Supplier / PurchaseOrder", "Fornecedores e pedidos de compra com recebimento fiscal/não fiscal."],
    ["AccountPayable / BankAccount / BankTransaction", "Contas a pagar, contas bancárias e transações."],
    ["PaymentCondition", "Condições de pagamento (Recebimento/Pagamento, à vista/parcelado)."],
    ["ChartOfAccount / Cfop", "Plano de contas e CFOPs para fiscal."],
    ["BillingLocation", "Locais de faturamento (empresas do grupo) com dados para PDFs e NF-e."],
    ["Technician / TechnicianRoute / RouteRegion / RouteZone", "Técnicos, rotas, regiões e zonas de roteirização."],
    ["Seller", "Vendedores com foto e vínculo a usuários."],
    ["Remessa", "Remessas (demonstração/consignação/devolução) com NF-e própria."],
    ["SystemSetting", "Configurações globais (NF-e, certificado, CFOPs padrão)."],
    ["Invitation / User", "Convites de usuários e usuários do sistema (perfis e roles)."],
  ];
  const entityRows = entities.map(([n, d]) => `<tr><td><code>${esc(n)}</code></td><td>${esc(d)}</td></tr>`).join("");

  const integrations = [
    ["Melhor Envio", "Cotação de frete (Correios, Jadlog etc.) e geração de etiquetas de envio com rastreio."],
    ["Focus NFe", "Emissão, consulta, cancelamento e carta de correção de NF-e e Nota Simples."],
  ];
  const intRows = integrations.map(([n, d]) => `<tr><td><strong>${esc(n)}</strong></td><td>${esc(d)}</td></tr>`).join("");

  const roles = [
    ["admin", "Acesso total: todos os módulos, cadastros, sistema, supervisão e estornos."],
    ["supervisor", "Aprovação financeira e estorno de vendas para orçamento (com justificativa)."],
    ["vendedor", "Vendas, clientes e CRM de manutenção."],
    ["tecnico", "App do técnico: execução de OS, check-in, fotos, recebimento e conclusão."],
    ["producao", "Visão restrita de OS aguardando produção/expedição."],
    ["logistica", "Separação, estoque, expedição e roteirização."],
  ];
  const roleRows = roles.map(([n, d]) => `<tr><td><code>${esc(n)}</code></td><td>${esc(d)}</td></tr>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Documentação do Sistema — ERP Brazon</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; line-height: 1.5; }
  @page { size: A4; margin: 14mm 14mm; }
  @media print { body { margin: 0; } .no-print { display: none !important; } }
  h1 { font-size: 22px; color: #0c4a6e; }
  h2 { font-size: 14px; color: #fff; background: #0ea5e9; padding: 6px 12px; border-radius: 6px 6px 0 0; margin-top: 18px; }
  h3 { font-size: 13px; color: #0c4a6e; margin: 14px 0 6px; border-left: 4px solid #0ea5e9; padding-left: 8px; }
  .mod { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 18px; }
  .mod .intro { padding: 8px 12px; background: #f8fafc; font-size: 11.5px; color: #475569; border-bottom: 1px solid #e2e8f0; }
  .mod ul { padding: 8px 12px 10px 28px; }
  .mod li { margin: 4px 0; font-size: 11.5px; }
  .flow { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-top: 12px; background: #f8fafc; }
  .step { display: flex; gap: 10px; align-items: flex-start; margin: 5px 0; }
  .step-num { flex: 0 0 20px; height: 20px; background: #0ea5e9; color: #fff; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700; }
  .step-txt { font-size: 11.5px; padding-top: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #f1f5f9; text-align: left; padding: 6px 10px; font-size: 11px; color: #475569; border-bottom: 2px solid #e2e8f0; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; vertical-align: top; }
  code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #0c4a6e; }
  .cover { text-align: center; padding: 40px 0 20px; }
  .cover img { height: 90px; object-fit: contain; }
  .cover h1 { margin-top: 16px; }
  .cover .sub { color: #6b7280; font-size: 13px; margin-top: 6px; }
  .cover .meta { color: #94a3b8; font-size: 11px; margin-top: 18px; }
  .note { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; margin-top: 14px; font-size: 11.5px; color: #1e40af; }
  .section-title { font-size: 16px; font-weight: 700; color: #0c4a6e; margin: 26px 0 4px; border-bottom: 2px solid #0ea5e9; padding-bottom: 4px; }
  .pagebreak { page-break-before: always; }
</style>
</head>
<body style="padding:0;">

  <div class="cover">
    <img src="${LOGO_URL}" alt="Brazon" />
    <h1>Documentação do Sistema</h1>
    <div class="sub">ERP Brazon — Gestão Integrada para Purificadores, Bebedouros e Manutenções</div>
    <div class="meta">Manual técnico para desenvolvedores &nbsp;|&nbsp; Gerado em ${today}</div>
  </div>

  <div class="note">
    Este documento descreve a estrutura modular, as entidades de dados, os fluxos de negócio principais,
    as integrações externas e os perfis de acesso do ERP Brazon. Ele serve como referência rápida para
    onboarding de novos desenvolvedores na plataforma Base44.
  </div>

  <div class="section-title">1. Visão Geral</div>
  <p style="font-size:11.5px;color:#374151;">
    O ERP Brazon é um sistema integrado construído sobre a plataforma Base44 (React + Tailwind no frontend,
    backend BaaS com entidades, funções serverless em Deno e automações). O sistema gerencia o ciclo completo
    de negócio de uma empresa de purificação de água: cadastro de clientes, vendas, estoque, equipamentos,
    manutenção recorrente (CRM de troca de refil), ordens de serviço com roteirização, compras, financeiro
    (contas a pagar/receber, conciliação bancária) e faturamento fiscal (NF-e e Nota Simples).
  </p>

  <div class="section-title">2. Módulos do Sistema</div>
  ${modules}

  <div class="pagebreak"></div>
  <div class="section-title">3. Fluxos de Negócio Principais</div>
  ${detailedFlows}

  <div class="section-title">4. Entidades de Dados Principais</div>
  <table>
    <thead><tr><th style="width:32%">Entidade</th><th>Descrição</th></tr></thead>
    <tbody>${entityRows}</tbody>
  </table>

  <div class="section-title">5. Integrações Externas</div>
  <table>
    <thead><tr><th style="width:28%">Integração</th><th>Função</th></tr></thead>
    <tbody>${intRows}</tbody>
  </table>

  <div class="section-title">6. Perfis de Acesso (Roles)</div>
  <table>
    <thead><tr><th style="width:20%">Perfil</th><th>Permissões</th></tr></thead>
    <tbody>${roleRows}</tbody>
  </table>

  <div class="section-title">7. Arquitetura Técnica</div>
  <ul style="padding-left:24px;font-size:11.5px;color:#374151;">
    <li><strong>Frontend:</strong> React + Vite + Tailwind CSS, componentes shadcn/ui, ícones lucide-react, roteamento react-router-dom, estado/tanstack react-query.</li>
    <li><strong>Backend:</strong> Base44 BaaS — entidades (JSON schemas), funções serverless em Deno (base44/functions/), automações (agendadas, por entidade, por webhook de conector).</li>
    <li><strong>SDK:</strong> base44 client (src/api/base44Client.js) para entidades, auth, funções e integrações (InvokeLLM, UploadFile, SendEmail etc.).</li>
    <li><strong>Autenticação:</strong> gerenciada pela plataforma (login, registro, OTP, reset, Google OAuth). Páginas em src/pages/Login, Register, ForgotPassword, ResetPassword.</li>
    <li><strong>Layout:</strong> AppLayout com abas (TabWorkspace) — cada aba roda em seu próprio MemoryRouter de topo, preservando estado por aba.</li>
    <li><strong>Segurança (RLS):</strong> regras por entidade (ex.: SystemSetting só admin). Usuários só admins listam/editam outros usuários.</li>
  </ul>

  <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:24px;" />
  <div style="text-align:center;font-size:10px;color:#94a3b8;padding:8px 0;">
    Grupo Brazon &nbsp;|&nbsp; Documentação técnica gerada automaticamente pelo sistema
  </div>

  <div class="no-print" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;">
    <button onclick="window.print()" style="background:#0ea5e9;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
    <button onclick="window.close()" style="background:#f1f5f9;color:#374151;border:1px solid #e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Fechar</button>
  </div>

</body>
</html>`;
}

function openDoc() {
  const html = buildHtml();
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

export default function SystemDocumentationCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Documentação do Sistema
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Gera um PDF completo com todos os módulos, entidades, fluxos de negócio, integrações e perfis de
          acesso — ideal para onboarding de novos desenvolvedores.
        </p>
        <Button type="button" className="gap-2" onClick={openDoc}>
          <FileDown className="h-4 w-4" />
          Baixar Documentação (PDF)
        </Button>
      </CardContent>
    </Card>
  );
}
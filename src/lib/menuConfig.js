import {
  Users, Package, Wrench, ClipboardList,
  ShoppingCart, ShoppingBag, Warehouse, BarChart3, Upload,
  Settings, ListTree, Database,
  DollarSign, Wallet, Route, Factory, Target, FileText, ClipboardCheck, Home, Send, ScrollText,
  CalendarClock, Landmark, ArrowLeftRight, ArrowUpCircle, Bell, FlaskConical, Store, Truck, Ban,
  Calculator, Tag, Table2, Workflow, Share2, TrendingDown, FileSpreadsheet, Phone, PackageCheck,
  Eye, Ticket, Megaphone
} from "lucide-react";

export const groupColors = {
  "Início": { icon: "text-indigo-300", border: "border-indigo-400/40", tint: "bg-gradient-to-br from-indigo-500/[0.14] to-transparent" },
  "Vendas": { icon: "text-emerald-400", border: "border-emerald-400/40", tint: "bg-gradient-to-br from-emerald-500/[0.14] to-transparent" },
  "Financeiro": { icon: "text-amber-400", border: "border-amber-400/40", tint: "bg-gradient-to-br from-amber-500/[0.14] to-transparent" },
  "Estoque": { icon: "text-sky-400", border: "border-sky-400/40", tint: "bg-gradient-to-br from-sky-500/[0.14] to-transparent" },
  "Manutenção": { icon: "text-orange-400", border: "border-orange-400/40", tint: "bg-gradient-to-br from-orange-500/[0.14] to-transparent" },
  "Teste": { icon: "text-pink-400", border: "border-pink-400/40", tint: "bg-gradient-to-br from-pink-500/[0.14] to-transparent" },
  "Estratégia & Oportunidade": { icon: "text-violet-400", border: "border-violet-400/40", tint: "bg-gradient-to-br from-violet-500/[0.14] to-transparent" },
  "Cadastros": { icon: "text-teal-400", border: "border-teal-400/40", tint: "bg-gradient-to-br from-teal-500/[0.14] to-transparent" },
  "Sistema": { icon: "text-rose-400", border: "border-rose-400/40", tint: "bg-gradient-to-br from-rose-500/[0.14] to-transparent" },
};

export const menuGroups = [
  { label: "Início", icon: Home, path: "/inicio", single: true },
  { label: "Alertas", icon: Bell, path: "/alertas", single: true },
  {
    label: "Vendas", icon: ShoppingCart, children: [
      { label: "Metas de Distribuição", icon: Target, path: "/metas-distribuicao" },
      { label: "Clientes", icon: Users, path: "/clientes" },
      { label: "Vendas", icon: ShoppingCart, path: "/vendas" },
      { label: "Relatório de Vendas", icon: FileSpreadsheet, path: "/relatorio-vendas" },
      { label: "Venda de Balcão", icon: Store, path: "/venda-balcao" },
      { label: "Tabela de Preços", icon: Table2, path: "/tabela-precos-vendas" },
      { label: "Vendas Canceladas", icon: Ban, path: "/vendas-canceladas" },
      { label: "Remessas", icon: Send, path: "/remessas" },
      { label: "Faturamento", icon: FileText, path: "/faturamento" },
      { label: "Notas Fiscais", icon: ScrollText, path: "/notas-fiscais" },
      { label: "Isenção de Fretes", icon: Truck, path: "/isencao-fretes" },
    ],
  },
  {
    label: "Estoque", icon: Warehouse, children: [
      { label: "Produtos", icon: Package, path: "/produtos" },
      { label: "Estoque", icon: Warehouse, path: "/estoque" },
      { label: "Exportar para Melhor Envio", icon: FileSpreadsheet, path: "/exportar-produtos-melhor-envio" },
    ],
  },
  {
    label: "Manutenção", icon: Wrench, children: [
      { label: "Painel de Manutenção", icon: Wrench, path: "/painel-manutencao" },
      { label: "Ordens de Serviço", icon: ClipboardList, path: "/ordens-servico" },
      { label: "Agenda de Rotas", icon: CalendarClock, path: "/agenda-rotas" },
      { label: "Rotas de Técnico", icon: Route, path: "/rotas-tecnico" },
      { label: "Lançamento de Rota Manual", icon: Route, path: "/lancamento-rota-manual" },
      { label: "Produção", icon: Factory, path: "/producao-expedicao" },
      { label: "Romaneio de Expedição", icon: PackageCheck, path: "/romaneio-expedicao" },
      { label: "Romaneio de Troca de Demanda", icon: ArrowLeftRight, path: "/romaneio-troca-demanda" },
      { label: "Visão Geral da Logística", icon: Eye, path: "/visao-geral-logistica" },
      { label: "Dashboard de Produção", icon: BarChart3, path: "/dashboard-producao" },
    ],
  },
  {
    label: "Teste", icon: FlaskConical, children: [
      { label: "Ordens de Serviço (Teste)", icon: ClipboardList, path: "/teste/ordens-servico" },
      { label: "Rotas de Técnico (Teste)", icon: Route, path: "/teste/rotas-tecnico" },
      { label: "Agenda de Rotas (Teste)", icon: CalendarClock, path: "/teste/agenda-rotas" },
      { label: "Checagem Melhor Envio", icon: PackageCheck, path: "/teste/checagem-melhor-envio" },
    ],
  },
  {
    label: "Estratégia & Oportunidade", icon: Target, children: [
      { label: "Dashboard de Oportunidades", icon: BarChart3, path: "/estrategia" },
      { label: "Distribuição de Clientes", icon: Share2, path: "/distribuicao" },
      { label: "Relatório de Distribuição", icon: FileSpreadsheet, path: "/relatorio-distribuicao" },
      { label: "Relatório de Telefones", icon: Phone, path: "/relatorio-telefones" },
      { label: "Curva ABC de Vendas", icon: TrendingDown, path: "/curva-abc" },
      { label: "Campanhas 3C Plus", icon: Phone, path: "/campanhas-3c" },
      { label: "Gestão de Campanhas Atlas", icon: Megaphone, path: "/campanhas-atlas" },
    ],
  },
  {
    label: "Financeiro", icon: DollarSign, children: [
      { label: "Confirmações de Venda", icon: ClipboardCheck, path: "/confirmacoes-venda" },
      { label: "Contas a Receber", icon: Wallet, path: "/contas-receber" },
      { label: "Compras", icon: ShoppingBag, path: "/compras" },
      { label: "Contas a Pagar", icon: ArrowUpCircle, path: "/contas-pagar" },
      { label: "Conciliação Bancária", icon: ArrowLeftRight, path: "/conciliacao-bancaria" },
      { label: "Lançar Custos", icon: Calculator, path: "/precificacao-custos" },
      { label: "Precificação", icon: Tag, path: "/precificacao-config" },
      { label: "Tabela de Preços", icon: Table2, path: "/precificacao-tabela" },
    ],
  },
  {
    label: "Cadastros", icon: ListTree, children: [
      { label: "Programas e Promoções", icon: Ticket, path: "/programas-promocoes" },
      { label: "Cadastros de Produtos", icon: Package, path: "/cadastros/produtos" },
      { label: "Cadastros de Serviços", icon: Wrench, path: "/cadastros/servicos" },
      { label: "Cadastros Financeiros", icon: Landmark, path: "/cadastros/financeiro" },
      { label: "Cadastros do Sistema", icon: Settings, path: "/cadastros/sistema" },
    ],
  },
  {
    label: "Sistema", icon: Settings, children: [
      { label: "Usuários", icon: Users, path: "/usuarios" },
      { label: "Importação", icon: Upload, path: "/importacao" },
      { label: "Backups", icon: Database, path: "/backups" },
      { label: "Configurações", icon: Settings, path: "/configuracoes" },
      { label: "Automações", icon: Workflow, path: "/automacoes" },
    ],
  },
];
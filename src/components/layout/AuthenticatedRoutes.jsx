import React, { lazy, Suspense } from "react";
import PageLoading from "@/components/PageLoading";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { getMenuForRoles } from "@/lib/permissions";

const Inicio = lazy(() => import("@/pages/Inicio"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const ClientForm = lazy(() => import("@/pages/ClientForm"));
const Products = lazy(() => import("@/pages/Products"));
const ProductForm = lazy(() => import("@/pages/ProductForm"));
const ProductRegistrations = lazy(() => import("@/pages/ProductRegistrations"));
const ServiceRegistrations = lazy(() => import("@/pages/ServiceRegistrations"));
const SystemRegistrations = lazy(() => import("@/pages/SystemRegistrations"));
const Equipment = lazy(() => import("@/pages/Equipment"));
const EquipmentForm = lazy(() => import("@/pages/EquipmentForm"));
const Sales = lazy(() => import("@/pages/Sales"));
const SalesReport = lazy(() => import("@/pages/SalesReport"));
const SaleForm = lazy(() => import("@/pages/SaleForm"));
const VendaBalcao = lazy(() => import("@/pages/VendaBalcao"));
const Stock = lazy(() => import("@/pages/Stock"));
const Maintenances = lazy(() => import("@/pages/Maintenances"));
const MaintenancePanel = lazy(() => import("@/pages/MaintenancePanel"));
const ServiceOrders = lazy(() => import("@/pages/ServiceOrders"));
const RotasTecnico = lazy(() => import("@/pages/RotasTecnico"));
const AgendaRotas = lazy(() => import("@/pages/AgendaRotas"));
const TesteRotasTecnico = lazy(() => import("@/pages/TesteRotasTecnico"));
const TesteAgendaRotas = lazy(() => import("@/pages/TesteAgendaRotas"));
const TesteOrdensServico = lazy(() => import("@/pages/TesteOrdensServico"));
const ProducaoExpedicao = lazy(() => import("@/pages/ProducaoExpedicao"));
const DashboardProducao = lazy(() => import("@/pages/DashboardProducao"));
const EstrategiaOportunidade = lazy(() => import("@/pages/EstrategiaOportunidade"));
const Faturamento = lazy(() => import("@/pages/Faturamento"));
const FaturamentoOS = lazy(() => import("@/pages/FaturamentoOS"));
const FaturamentoRemessa = lazy(() => import("@/pages/FaturamentoRemessa"));
const Remessas = lazy(() => import("@/pages/Remessas"));
const NotasFiscais = lazy(() => import("@/pages/NotasFiscais"));
const Renewals = lazy(() => import("@/pages/Renewals"));
const Receivables = lazy(() => import("@/pages/Receivables"));
const ContasPagar = lazy(() => import("@/pages/ContasPagar"));
const ConciliacaoBancaria = lazy(() => import("@/pages/ConciliacaoBancaria"));
const Compras = lazy(() => import("@/pages/Compras"));
const FinancialRegistrations = lazy(() => import("@/pages/FinancialRegistrations"));
const SaleConfirmations = lazy(() => import("@/pages/SaleConfirmations"));
const Cancelamentos = lazy(() => import("@/pages/Cancelamentos"));
const FreteDashboard = lazy(() => import("@/pages/FreteDashboard"));
const Agenda = lazy(() => import("@/pages/Agenda"));
const Reports = lazy(() => import("@/pages/Reports"));
const Import = lazy(() => import("@/pages/Import"));
const Settings = lazy(() => import("@/pages/Settings"));
const Backups = lazy(() => import("@/pages/Backups"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const PrecificacaoCustos = lazy(() => import("@/pages/PrecificacaoCustos"));
const PrecificacaoConfig = lazy(() => import("@/pages/PrecificacaoConfig"));
const PrecificacaoTabela = lazy(() => import("@/pages/PrecificacaoTabela"));
const TabelaPrecosVendas = lazy(() => import("@/pages/TabelaPrecosVendas"));
const Automacoes = lazy(() => import("@/pages/Automacoes"));
const AutomacaoEditor = lazy(() => import("@/pages/AutomacaoEditor"));
const Distribuicao = lazy(() => import("@/pages/Distribuicao"));
const CurvaABC = lazy(() => import("@/pages/CurvaABC"));
const RelatorioDistribuicao = lazy(() => import("@/pages/RelatorioDistribuicao"));
const MetasDistribuicao = lazy(() => import("@/pages/MetasDistribuicao"));
const Campanhas3C = lazy(() => import("@/pages/Campanhas3C"));
const PosAtendimentoPreview = lazy(() => import("@/pages/PosAtendimentoPreview"));
const RelatorioMelhorEnvio = lazy(() => import("@/pages/RelatorioMelhorEnvio"));
const RelatorioTelefones = lazy(() => import("@/pages/RelatorioTelefones"));
const RomaneioExpedicao = lazy(() => import("@/pages/RomaneioExpedicao"));
const RomaneioTrocaDemanda = lazy(() => import("@/pages/RomaneioTrocaDemanda"));
const ExportarProdutosMelhorEnvio = lazy(() => import("@/pages/ExportarProdutosMelhorEnvio"));
const ModoTecnico = lazy(() => import("@/pages/ModoTecnico"));
const TecnicoTOSExecucao = lazy(() => import("@/pages/TecnicoTOSExecucao"));
const LancamentoRotaManual = lazy(() => import("@/pages/LancamentoRotaManual"));
const VisaoGeralLogistica = lazy(() => import("@/pages/VisaoGeralLogistica"));
const Promotions = lazy(() => import("@/pages/Promotions"));
const CampanhasAtlas = lazy(() => import("@/pages/CampanhasAtlas"));

function DashboardGuard() {
  const { user } = useAuth();
  const groups = getMenuForRoles([user?.role, ...(user?.additional_roles || [])], user?.extra_menu_access);
  const hasVendas = groups.some((g) => g.label === "Vendas");
  if (!hasVendas) return <Navigate to="/inicio" replace />;
  return <Dashboard />;
}

export default function AuthenticatedRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/inicio" element={<Inicio />} />
      <Route path="/alertas" element={<Alerts />} />
      <Route path="/" element={<DashboardGuard />} />
      <Route path="/clientes" element={<Clients />} />
      <Route path="/clientes/novo" element={<ClientForm />} />
      <Route path="/clientes/:id" element={<ClientDetail />} />
      <Route path="/clientes/:id/editar" element={<ClientForm />} />
      <Route path="/produtos" element={<Products />} />
      <Route path="/cadastros/produtos" element={<ProductRegistrations />} />
      <Route path="/cadastros/servicos" element={<ServiceRegistrations />} />
      <Route path="/cadastros/sistema" element={<SystemRegistrations />} />
      <Route path="/programas-promocoes" element={<Promotions />} />
      <Route path="/produtos/novo" element={<ProductForm />} />
      <Route path="/produtos/:id/editar" element={<ProductForm />} />
      <Route path="/equipamentos" element={<Equipment />} />
      <Route path="/equipamentos/novo" element={<EquipmentForm />} />
      <Route path="/equipamentos/:id/editar" element={<EquipmentForm />} />
      <Route path="/vendas" element={<Sales />} />
      <Route path="/relatorio-vendas" element={<SalesReport />} />
      <Route path="/venda-balcao" element={<VendaBalcao />} />
      <Route path="/vendas/nova" element={<SaleForm />} />
      <Route path="/vendas/:id/editar" element={<SaleForm />} />
      <Route path="/estoque" element={<Stock />} />
      <Route path="/manutencoes" element={<Maintenances />} />
      <Route path="/painel-manutencao" element={<MaintenancePanel />} />
      <Route path="/distribuicao" element={<Distribuicao />} />
      <Route path="/ordens-servico" element={<ServiceOrders />} />
      <Route path="/rotas-tecnico" element={<RotasTecnico />} />
      <Route path="/agenda-rotas" element={<AgendaRotas />} />
      <Route path="/teste/rotas-tecnico" element={<TesteRotasTecnico />} />
      <Route path="/teste/agenda-rotas" element={<TesteAgendaRotas />} />
      <Route path="/teste/ordens-servico" element={<TesteOrdensServico />} />
      <Route path="/teste/checagem-melhor-envio" element={<RelatorioMelhorEnvio />} />
      <Route path="/producao-expedicao" element={<ProducaoExpedicao />} />
      <Route path="/romaneio-expedicao" element={<RomaneioExpedicao />} />
      <Route path="/romaneio-troca-demanda" element={<RomaneioTrocaDemanda />} />
      <Route path="/exportar-produtos-melhor-envio" element={<ExportarProdutosMelhorEnvio />} />
      <Route path="/modo-tecnico" element={<ModoTecnico />} />
      <Route path="/modo-tecnico/:tosId" element={<TecnicoTOSExecucao />} />
      <Route path="/lancamento-rota-manual" element={<LancamentoRotaManual />} />
      <Route path="/visao-geral-logistica" element={<VisaoGeralLogistica />} />
      <Route path="/dashboard-producao" element={<DashboardProducao />} />
      <Route path="/estrategia" element={<EstrategiaOportunidade />} />
      <Route path="/curva-abc" element={<CurvaABC />} />
      <Route path="/relatorio-distribuicao" element={<RelatorioDistribuicao />} />
      <Route path="/relatorio-telefones" element={<RelatorioTelefones />} />
      <Route path="/metas-distribuicao" element={<MetasDistribuicao />} />
      <Route path="/campanhas-3c" element={<Campanhas3C />} />
      <Route path="/campanhas-atlas" element={<CampanhasAtlas />} />
      <Route path="/previa-pos-atendimento" element={<PosAtendimentoPreview />} />
      <Route path="/faturamento" element={<Faturamento />} />
      <Route path="/faturamento/os/:osId" element={<FaturamentoOS />} />
      <Route path="/faturamento/remessa/:remessaId" element={<FaturamentoRemessa />} />
      <Route path="/remessas" element={<Remessas />} />
      <Route path="/notas-fiscais" element={<NotasFiscais />} />
      <Route path="/renovacoes" element={<Renewals />} />
      <Route path="/confirmacoes-venda" element={<SaleConfirmations />} />
      <Route path="/vendas-canceladas" element={<Cancelamentos />} />
      <Route path="/isencao-fretes" element={<FreteDashboard />} />
      <Route path="/contas-receber" element={<Receivables />} />
      <Route path="/compras" element={<Compras />} />
      <Route path="/contas-pagar" element={<ContasPagar />} />
      <Route path="/conciliacao-bancaria" element={<ConciliacaoBancaria />} />
      <Route path="/cadastros/financeiro" element={<FinancialRegistrations />} />
      <Route path="/precificacao-custos" element={<PrecificacaoCustos />} />
      <Route path="/precificacao-config" element={<PrecificacaoConfig />} />
      <Route path="/precificacao-tabela" element={<PrecificacaoTabela />} />
      <Route path="/tabela-precos-vendas" element={<TabelaPrecosVendas />} />
      <Route path="/agenda" element={<Agenda />} />
      <Route path="/relatorios" element={<Reports />} />
      <Route path="/importacao" element={<Import />} />
      <Route path="/configuracoes" element={<Settings />} />
      <Route path="/backups" element={<Backups />} />
      <Route path="/usuarios" element={<UserManagement />} />
      <Route path="/automacoes" element={<Automacoes />} />
      <Route path="/automacoes/editar/:id" element={<AutomacaoEditor />} />
      <Route path="*" element={<Navigate to="/inicio" replace />} />
    </Routes>
    </Suspense>
  );
}
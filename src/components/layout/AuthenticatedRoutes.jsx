import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { getMenuForRoles } from "@/lib/permissions";

import Inicio from "@/pages/Inicio";
import Alerts from "@/pages/Alerts";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import ClientForm from "@/pages/ClientForm";
import Products from "@/pages/Products";
import ProductForm from "@/pages/ProductForm";
import ProductRegistrations from "@/pages/ProductRegistrations";
import ServiceRegistrations from "@/pages/ServiceRegistrations";
import SystemRegistrations from "@/pages/SystemRegistrations";
import Equipment from "@/pages/Equipment";
import EquipmentForm from "@/pages/EquipmentForm";
import Sales from "@/pages/Sales";
import SalesReport from "@/pages/SalesReport";
import SaleForm from "@/pages/SaleForm";
import VendaBalcao from "@/pages/VendaBalcao";
import Stock from "@/pages/Stock";
import Maintenances from "@/pages/Maintenances";
import MaintenancePanel from "@/pages/MaintenancePanel";
import ServiceOrders from "@/pages/ServiceOrders";
import RotasTecnico from "@/pages/RotasTecnico";
import AgendaRotas from "@/pages/AgendaRotas";
import TesteRotasTecnico from "@/pages/TesteRotasTecnico";
import TesteAgendaRotas from "@/pages/TesteAgendaRotas";
import TesteOrdensServico from "@/pages/TesteOrdensServico";
import ProducaoExpedicao from "@/pages/ProducaoExpedicao";
import DashboardProducao from "@/pages/DashboardProducao";
import EstrategiaOportunidade from "@/pages/EstrategiaOportunidade";
import Faturamento from "@/pages/Faturamento";
import FaturamentoOS from "@/pages/FaturamentoOS";
import FaturamentoRemessa from "@/pages/FaturamentoRemessa";
import Remessas from "@/pages/Remessas";
import NotasFiscais from "@/pages/NotasFiscais";
import Renewals from "@/pages/Renewals";
import Receivables from "@/pages/Receivables";
import ContasPagar from "@/pages/ContasPagar";
import ConciliacaoBancaria from "@/pages/ConciliacaoBancaria";
import Compras from "@/pages/Compras";
import FinancialRegistrations from "@/pages/FinancialRegistrations";
import SaleConfirmations from "@/pages/SaleConfirmations";
import Cancelamentos from "@/pages/Cancelamentos";
import FreteDashboard from "@/pages/FreteDashboard";
import Agenda from "@/pages/Agenda";
import Reports from "@/pages/Reports";
import Import from "@/pages/Import";
import Settings from "@/pages/Settings";
import Backups from "@/pages/Backups";
import UserManagement from "@/pages/UserManagement";
import PrecificacaoCustos from "@/pages/PrecificacaoCustos";
import PrecificacaoConfig from "@/pages/PrecificacaoConfig";
import PrecificacaoTabela from "@/pages/PrecificacaoTabela";
import TabelaPrecosVendas from "@/pages/TabelaPrecosVendas";
import Automacoes from "@/pages/Automacoes";
import AutomacaoEditor from "@/pages/AutomacaoEditor";
import Distribuicao from "@/pages/Distribuicao";
import CurvaABC from "@/pages/CurvaABC";
import RelatorioDistribuicao from "@/pages/RelatorioDistribuicao";
import MetasDistribuicao from "@/pages/MetasDistribuicao";
import Campanhas3C from "@/pages/Campanhas3C";
import PosAtendimentoPreview from "@/pages/PosAtendimentoPreview";
import RelatorioMelhorEnvio from "@/pages/RelatorioMelhorEnvio";
import RelatorioTelefones from "@/pages/RelatorioTelefones";
import RomaneioExpedicao from "@/pages/RomaneioExpedicao";
import RomaneioTrocaDemanda from "@/pages/RomaneioTrocaDemanda";
import ExportarProdutosMelhorEnvio from "@/pages/ExportarProdutosMelhorEnvio";
import ModoTecnico from "@/pages/ModoTecnico";
import TecnicoTOSExecucao from "@/pages/TecnicoTOSExecucao";
import LancamentoRotaManual from "@/pages/LancamentoRotaManual";
import VisaoGeralLogistica from "@/pages/VisaoGeralLogistica";
import Promotions from "@/pages/Promotions";
import CampanhasAtlas from "@/pages/CampanhasAtlas";

function DashboardGuard() {
  const { user } = useAuth();
  const groups = getMenuForRoles([user?.role, ...(user?.additional_roles || [])], user?.extra_menu_access);
  const hasVendas = groups.some((g) => g.label === "Vendas");
  if (!hasVendas) return <Navigate to="/inicio" replace />;
  return <Dashboard />;
}

export default function AuthenticatedRoutes() {
  return (
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
  );
}
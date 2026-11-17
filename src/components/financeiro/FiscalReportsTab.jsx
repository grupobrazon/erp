import React from "react";
import NotasRelatoriosTab from "@/components/notas/NotasRelatoriosTab";

/**
 * Área Fiscal de Contas a Receber — reúne os relatórios fiscais do sistema
 * (notas emitidas, download do XML/DANFE e exportação para a contabilidade).
 * Os mesmos relatórios ficam em Notas Fiscais → Relatórios (componente compartilhado).
 */
export default function FiscalReportsTab() {
  return <NotasRelatoriosTab />;
}
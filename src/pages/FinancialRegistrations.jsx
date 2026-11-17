import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import BankAccountManager from "@/components/registrations/BankAccountManager";
import PaymentConditionManager from "@/components/registrations/PaymentConditionManager";
import FiscalParamsCard from "@/components/registrations/FiscalParamsCard";
import CfopManager from "@/components/registrations/CfopManager";
import ChartOfAccountManager from "@/components/registrations/ChartOfAccountManager";

export default function FinancialRegistrations() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Cadastros Financeiros" description="Contas bancárias, condições de pagamento e parâmetros fiscais">
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </PageHeader>

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas">Contas Bancárias</TabsTrigger>
          <TabsTrigger value="pagamentos">Condições de Pagamento</TabsTrigger>
          <TabsTrigger value="plano">Plano de Contas</TabsTrigger>
          <TabsTrigger value="fiscal">Parâmetros Fiscais</TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="mt-6">
          <BankAccountManager />
        </TabsContent>
        <TabsContent value="pagamentos" className="mt-6">
          <PaymentConditionManager />
        </TabsContent>
        <TabsContent value="plano" className="mt-6">
          <ChartOfAccountManager />
        </TabsContent>
        <TabsContent value="fiscal" className="mt-6 space-y-6">
          <CfopManager />
          <FiscalParamsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
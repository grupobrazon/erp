import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import SimpleListManager from "@/components/products/registrations/SimpleListManager";
import BillingLocationManager from "@/components/registrations/BillingLocationManager";
import SellerManager from "@/components/registrations/SellerManager";
import TechnicianManager from "@/components/registrations/TechnicianManager";
import RouteRegionManager from "@/components/registrations/RouteRegionManager";
import ServiceTypeManager from "@/components/registrations/ServiceTypeManager";
import TechnicianChecklistManager from "@/components/registrations/TechnicianChecklistManager";

export default function SystemRegistrations() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Cadastros do Sistema" description="Parametrize vendedores, locais de faturamento, estoques, técnicos e regiões de rota">
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </PageHeader>

      <Tabs defaultValue="vendedores">
        <TabsList>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
          <TabsTrigger value="faturamento">Locais de Faturamento</TabsTrigger>
          <TabsTrigger value="estoque">Locais de Estoque</TabsTrigger>
          <TabsTrigger value="tecnicos">Técnicos</TabsTrigger>
          <TabsTrigger value="regioes">Regiões de Rota</TabsTrigger>
          <TabsTrigger value="servicos">Parametrizações de Serviços</TabsTrigger>
          <TabsTrigger value="checklists">Checklists do Técnico</TabsTrigger>
        </TabsList>

        <TabsContent value="vendedores" className="mt-6">
          <SellerManager />
        </TabsContent>
        <TabsContent value="faturamento" className="mt-6">
          <BillingLocationManager />
        </TabsContent>
        <TabsContent value="estoque" className="mt-6">
          <SimpleListManager entityName="StockLocation" queryKey="stockLocations" itemLabel="local de estoque" />
        </TabsContent>
        <TabsContent value="tecnicos" className="mt-6">
          <TechnicianManager />
        </TabsContent>
        <TabsContent value="regioes" className="mt-6">
          <RouteRegionManager />
        </TabsContent>
        <TabsContent value="servicos" className="mt-6">
          <ServiceTypeManager />
        </TabsContent>
        <TabsContent value="checklists" className="mt-6">
          <TechnicianChecklistManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
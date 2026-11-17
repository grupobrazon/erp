import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/ui/PageHeader";
import ServiceManager from "@/components/services/ServiceManager";

export default function ServiceRegistrations() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Cadastros Gerais > Serviços" description="Cadastro de serviços (lista LC 116/2003) para pedidos de venda e emissão de NFS-e">
        <Button variant="outline" onClick={() => navigate("/vendas")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar para Vendas
        </Button>
      </PageHeader>
      <ServiceManager />
    </div>
  );
}
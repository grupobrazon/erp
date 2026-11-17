import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings as SettingsIcon, Users } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import PhoneNormalizationCard from "@/components/settings/PhoneNormalizationCard";
import DuplicateClientsReviewCard from "@/components/settings/DuplicateClientsReviewCard";
import UnlinkedMaintenanceSalesCard from "@/components/settings/UnlinkedMaintenanceSalesCard";
import ImportPhonesCard from "@/components/settings/ImportPhonesCard";
import NFeConfigCard from "@/components/settings/NFeConfigCard";
import ThreeCPlusConfigCard from "@/components/settings/ThreeCPlusConfigCard";
import ThreeCPlusUsersCard from "@/components/settings/ThreeCPlusUsersCard";
import GhlConfigCard from "@/components/settings/GhlConfigCard";
import GhlLinkAuditCard from "@/components/settings/GhlLinkAuditCard";
import TestDataCard from "@/components/settings/TestDataCard";
import SystemDocumentationCard from "@/components/settings/SystemDocumentationCard";
import RegionalMappingManager from "@/components/settings/RegionalMappingManager";
import RegionalVizinhancaManager from "@/components/settings/RegionalVizinhancaManager";
import MaintenanceMessageTemplatesCard from "@/components/settings/MaintenanceMessageTemplatesCard";
import RouteMessageTemplatesCard from "@/components/settings/RouteMessageTemplatesCard";
import RomaneioTrackingCard from "@/components/settings/RomaneioTrackingCard";

export default function Settings() {
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
  });

  return (
    <div>
      <PageHeader title="Configurações" description="Gerenciamento do sistema" />

      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Usuários do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Perfil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name || "-"}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell><Badge variant="secondary">{u.role || "user"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <DuplicateClientsReviewCard />

        <UnlinkedMaintenanceSalesCard />

        <ImportPhonesCard />

        <PhoneNormalizationCard />

        <NFeConfigCard />

        <ThreeCPlusConfigCard />

        <ThreeCPlusUsersCard />

        <GhlConfigCard />

        <GhlLinkAuditCard />

        <TestDataCard />

        <SystemDocumentationCard />

        <RegionalMappingManager />

        <RegionalVizinhancaManager />

        <MaintenanceMessageTemplatesCard />

        <RouteMessageTemplatesCard />

        <RomaneioTrackingCard />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-primary" />
              Sobre o Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Sistema</span><span className="font-medium">ERP Brazon</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Versão</span><span className="font-medium">1.0</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Especialidade</span><span className="font-medium">Purificadores, Bebedouros e Manutenções</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
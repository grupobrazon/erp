import React from "react";
import PageHeader from "@/components/ui/PageHeader";
import CampaignAutomationsPanel from "@/components/campanhas/CampaignAutomationsPanel";
import CampaignMessagesCard from "@/components/campanhas/CampaignMessagesCard";
import VipCampaignCard from "@/components/settings/VipCampaignCard";
import NoConditionsReplyCard from "@/components/settings/NoConditionsReplyCard";
import CampaignInteractionsCard from "@/components/settings/CampaignInteractionsCard";

export default function CampanhasAtlas() {
  return (
    <div>
      <PageHeader
        title="Gestão de Campanhas Atlas"
        description="Interruptores e respostas das campanhas do WhatsApp (Atlas): o que está ligado, o que está desligado e o que cada automação envia"
      />

      <div className="space-y-6 max-w-3xl">
        <CampaignAutomationsPanel />

        <CampaignMessagesCard />

        <VipCampaignCard />

        <NoConditionsReplyCard />

        <CampaignInteractionsCard />
      </div>
    </div>
  );
}
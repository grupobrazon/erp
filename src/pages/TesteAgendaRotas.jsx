import React from "react";
import AgendaRotas from "@/pages/AgendaRotas";
import TestRouteDataPanel from "@/components/test/TestRouteDataPanel";

export default function TesteAgendaRotas() {
  return (
    <div className="space-y-4">
      <TestRouteDataPanel />
      <AgendaRotas testMode />
    </div>
  );
}
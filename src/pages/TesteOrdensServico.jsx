import React from "react";
import ServiceOrders from "@/pages/ServiceOrders";
import TestRouteDataPanel from "@/components/test/TestRouteDataPanel";

export default function TesteOrdensServico() {
  return (
    <div className="space-y-4">
      <TestRouteDataPanel />
      <ServiceOrders testMode />
    </div>
  );
}
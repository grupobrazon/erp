import React from "react";
import { RotasTecnicoAdmin } from "@/pages/RotasTecnico";
import TestRouteDataPanel from "@/components/test/TestRouteDataPanel";

export default function TesteRotasTecnico() {
  return (
    <div className="space-y-4">
      <TestRouteDataPanel />
      <RotasTecnicoAdmin testMode />
    </div>
  );
}
import React, { useMemo } from "react";
import { MemoryRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { TabsContext } from "@/lib/TabsContext";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Home, Route as RouteIcon, Wrench, Bell, LogOut, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";

import Inicio from "@/pages/Inicio";
import Alerts from "@/pages/Alerts";
import RotasTecnico from "@/pages/RotasTecnico";
import ModoTecnico from "@/pages/ModoTecnico";
import TecnicoTOSExecucao from "@/pages/TecnicoTOSExecucao";
import LancamentoRotaManual from "@/pages/LancamentoRotaManual";

const NAV_ITEMS = [
  { path: "/inicio", label: "Início", icon: Home },
  { path: "/rotas-tecnico", label: "Rotas", icon: RouteIcon },
  { path: "/modo-tecnico", label: "Minhas OS", icon: Wrench },
  { path: "/lancamento-rota-manual", label: "Lançar KM", icon: Navigation },
  { path: "/alertas", label: "Alertas", icon: Bell },
];

function TechnicianHeader() {
  const { user } = useAuth();
  const handleLogout = () => base44.auth.logout();

  return (
    <header className="sticky top-0 z-20 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/brazon-logo.png" alt="" className="h-8 w-8" />
          <div>
            <span className="font-heading font-semibold text-base text-white">ERP Brazon</span>
            <p className="text-[10px] text-sidebar-foreground/60 -mt-0.5">{user?.full_name || "Técnico"}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </header>
  );
}

function TechnicianBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const activeIndex = useMemo(() => {
    const idx = NAV_ITEMS.findIndex(item => location.pathname.startsWith(item.path));
    return idx >= 0 ? idx : 0;
  }, [location.pathname]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-sidebar border-t border-sidebar-border">
      <div className="flex items-stretch justify-around max-w-md mx-auto">
        {NAV_ITEMS.map((item, i) => {
          const active = i === activeIndex;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2.5 px-3 flex-1 transition-colors",
                active ? "text-sidebar-primary" : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center h-8 w-8 rounded-full transition-colors",
                active && "bg-sidebar-primary/15"
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TechnicianInner() {
  const navigate = useNavigate();
  const location = useLocation();

  // Custom tabs context: openTab maps to navigate so existing pages
  // that call openTab() still work without the tab system.
  const tabsValue = {
    tabs: [{ id: location.pathname, path: location.pathname, label: "", Icon: null, fixed: true }],
    activeTabId: location.pathname,
    mounted: new Set([location.pathname]),
    openTab: (tab) => navigate(tab.path),
    closeTab: () => {},
    activateTab: (id) => navigate(id),
  };

  return (
    <TabsContext.Provider value={tabsValue}>
      <div className="flex flex-col h-screen bg-background overflow-hidden">
        <TechnicianHeader />
        <main className="flex-1 overflow-y-auto pb-20">
          <div className="max-w-md mx-auto p-4">
            <Routes>
              <Route path="/inicio" element={<Inicio />} />
              <Route path="/alertas" element={<Alerts />} />
              <Route path="/rotas-tecnico" element={<RotasTecnico />} />
              <Route path="/modo-tecnico" element={<ModoTecnico />} />
              <Route path="/modo-tecnico/:tosId" element={<TecnicoTOSExecucao />} />
              <Route path="/lancamento-rota-manual" element={<LancamentoRotaManual />} />
              <Route path="*" element={<Navigate to="/inicio" replace />} />
            </Routes>
          </div>
        </main>
        <TechnicianBottomNav />
      </div>
    </TabsContext.Provider>
  );
}

export default function TechnicianLayout() {
  return (
    <MemoryRouter initialEntries={["/inicio"]}>
      <TechnicianInner />
    </MemoryRouter>
  );
}
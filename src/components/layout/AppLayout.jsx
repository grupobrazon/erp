import React from "react";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import TabWorkspace from "./TabWorkspace";
import TechnicianLayout from "./TechnicianLayout";
import { TabsProvider } from "@/lib/TabsContext";
import { useAuth } from "@/lib/AuthContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

/**
 * Authenticated tab workspace for regular (non-producao) users.
 * Deliberately NOT wrapped in a BrowserRouter: each open tab renders its own
 * top-level MemoryRouter (siblings), which keeps per-tab state alive without
 * nesting routers (the platform forbids <Router> inside <Router>).
 *
 * Technicians get a dedicated mobile-first layout (TechnicianLayout) with
 * bottom navigation instead of the sidebar + tabs desktop paradigm.
 */
export default function AppLayout() {
  const { user } = useAuth();
  const isTecnico = user?.role === "tecnico" && (!user?.additional_roles || user.additional_roles.length === 0);

  if (isTecnico) {
    return <TechnicianLayout />;
  }

  return (
    <TabsProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TabBar />
          <div className="flex-1 overflow-auto">
            <ErrorBoundary>
              <TabWorkspace />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </TabsProvider>
  );
}
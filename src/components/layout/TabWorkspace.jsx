import React from "react";
import { MemoryRouter } from "react-router-dom";
import { useTabs } from "@/lib/TabsContext";
import AuthenticatedRoutes from "./AuthenticatedRoutes";

export default function TabWorkspace() {
  const { tabs, activeTabId, mounted } = useTabs();

  return (
    <>
      {tabs.map((tab) => (
        <div key={tab.id} className={tab.id === activeTabId ? "block" : "hidden"}>
          {mounted.has(tab.id) && (
            <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
              <MemoryRouter initialEntries={[tab.path]}>
                <AuthenticatedRoutes />
              </MemoryRouter>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
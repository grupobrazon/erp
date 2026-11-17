import React from "react";
import { useTabs } from "@/lib/TabsContext";
import { menuGroups, groupColors } from "@/lib/menuConfig";
import { getMenuForRoles } from "@/lib/permissions";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import WelcomeHeader from "@/components/layout/WelcomeHeader";

const quickAccess = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/", color: { icon: "text-primary", border: "border-primary" } },
];

export default function Inicio() {
  const { openTab } = useTabs();
  const { user } = useAuth();
  const groups = getMenuForRoles([user?.role, ...(user?.additional_roles || [])]);
  const hasVendas = groups.some((g) => g.label === "Vendas");
  const visibleQuickAccess = hasVendas ? quickAccess : [];

  const open = (item, color) =>
    openTab({ path: item.path, label: item.label, Icon: item.icon, color });

  return (
    <div>
      <WelcomeHeader />

      <div className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Acesso Rápido
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleQuickAccess.map((item) => (
            <button key={item.path} onClick={() => open(item, item.color)} className="text-left">
              <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <item.icon className={cn("h-5 w-5", item.color.icon)} />
                  </div>
                  <span className="font-medium text-sm">{item.label}</span>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </div>

      {groups
        .filter((g) => !g.single)
        .map((group) => {
          const color = groupColors[group.label];
          return (
            <div key={group.label} className="mb-6">
              <h3 className={cn("text-xs font-semibold uppercase tracking-wider mb-2", color?.icon)}>
                {group.label}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {group.children.map((item) => (
                  <button key={item.path} onClick={() => open(item, color)} className="text-left">
                    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", color?.tint)}>
                          <item.icon className={cn("h-5 w-5", color?.icon)} />
                        </div>
                        <span className="font-medium text-sm">{item.label}</span>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
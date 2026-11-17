import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useTabs } from "@/lib/TabsContext";
import { menuGroups, groupColors } from "@/lib/menuConfig";
import { getMenuForRoles } from "@/lib/permissions";
import {
  ChevronLeft, ChevronRight, Droplets, ChevronDown, ChevronUp, LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState(["Manutenção"]);
  const { user } = useAuth();
  const { activeTabId, openTab } = useTabs();

  const groups = getMenuForRoles([user?.role, ...(user?.additional_roles || [])], user?.extra_menu_access);

  const { data: alertsRes } = useQuery({
    queryKey: ["my-alerts"],
    queryFn: () => base44.functions.invoke("alerts", { action: "list" }),
    refetchInterval: 30000,
  });
  const unreadAlerts = ((alertsRes?.data?.alerts) || alertsRes?.alerts || []).filter(a => !a.read).length;

  const toggleGroup = (label) => {
    setOpenGroups((prev) => (prev.includes(label) ? [] : [label]));
  };

  const isChildActive = (children) =>
    children?.some((c) => activeTabId === c.path);

  return (
    <aside
      className={cn(
        "h-screen bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-all duration-300 sticky top-0 overflow-hidden",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Droplets className="h-7 w-7 text-sidebar-primary" />
            <span className="font-heading font-bold text-lg text-sidebar-primary-foreground tracking-tight">BRAZON</span>
          </div>
        )}
        {collapsed && <Droplets className="h-7 w-7 text-sidebar-primary mx-auto" />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        {groups.map((group) => {
          const color = groupColors[group.label];

          if (group.single) {
            const isActive = activeTabId === group.path;
            const showAlertBadge = group.path === "/alertas" && unreadAlerts > 0;
            const content = (
              <>
                <group.icon className={cn("h-5 w-5 flex-shrink-0", color?.icon, collapsed && "mx-auto")} />
                {!collapsed && <span className="text-left">{group.label}</span>}
                {showAlertBadge && !collapsed && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5">
                    {unreadAlerts}
                  </span>
                )}
                {showAlertBadge && collapsed && (
                  <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5" />
                )}
              </>
            );
            const className = cn(
              "relative w-full flex items-center justify-start gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium transition-all duration-200 text-left",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            );
            return (
              <button
                key={group.path}
                onClick={() => openTab({ path: group.path, label: group.label, Icon: group.icon, color })}
                className={className}
                title={collapsed ? group.label : undefined}
              >
                {content}
              </button>
            );
          }

          const isOpen = openGroups.includes(group.label);
          const hasActive = isChildActive(group.children);

          return (
            <div key={group.label} className={cn("mb-1 mx-2 rounded-xl overflow-hidden ring-1 ring-white/5", color?.tint)}>
              {/* Group header */}
              <button
                onClick={() => !collapsed && toggleGroup(group.label)}
                className={cn(
                  "w-full flex items-center justify-start gap-3 px-4 py-2.5 mx-0 text-sm font-semibold transition-all duration-200 text-left",
                  hasActive
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                )}
                title={collapsed ? group.label : undefined}
              >
                <group.icon className={cn("h-5 w-5 flex-shrink-0", color?.icon, collapsed && "mx-auto")} />
                {!collapsed && (
                  <>
                    <span className={cn("flex-1 text-left uppercase text-xs tracking-wider", color?.icon)}>{group.label}</span>
                    {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </>
                )}
              </button>

              {/* Children */}
              {!collapsed && isOpen && (
                <div>
                  {group.children.map((item) => {
                    const isActive = activeTabId === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => openTab({ path: item.path, label: item.label, Icon: item.icon, color })}
                        className={cn(
                          "w-full flex items-center justify-start gap-3 px-4 py-2 mx-0 rounded-lg text-sm font-medium transition-all duration-200 text-left",
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        )}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        <span className="text-left">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        {!collapsed ? (
          <div className="flex items-center justify-between">
            <p className="text-xs text-sidebar-foreground/40">ERP Brazon v1.0</p>
            <button
              onClick={() => base44.auth.logout()}
              className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              title="Sair do sistema"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        ) : (
          <button
            onClick={() => base44.auth.logout()}
            className="p-2 rounded hover:bg-sidebar-accent transition-colors mx-auto block"
            title="Sair do sistema"
          >
            <LogOut className="h-4 w-4 text-sidebar-foreground/60" />
          </button>
        )}
      </div>
    </aside>
  );
}
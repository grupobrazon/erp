import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabs } from "@/lib/TabsContext";

export default function TabBar() {
  const { tabs, activeTabId, activateTab, closeTab } = useTabs();

  return (
    <div className="flex items-stretch gap-1 px-2 pt-1.5 border-b border-border bg-muted/30 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "flex items-stretch rounded-t-md border-b-2 transition-colors",
              active ? "bg-background" : "bg-transparent hover:bg-background/50",
              active ? (tab.color?.border || "border-primary") : "border-transparent"
            )}
          >
            <button
              onClick={() => activateTab(tab.id)}
              className="flex items-center gap-2 px-3 h-9 text-sm whitespace-nowrap"
            >
              {tab.Icon && (
                <tab.Icon className={cn("h-4 w-4", active ? (tab.color?.icon || "text-primary") : "text-muted-foreground")} />
              )}
              <span className={active ? "text-foreground font-medium" : "text-muted-foreground"}>
                {tab.label}
              </span>
            </button>
            {!tab.fixed && (
              <button
                onClick={() => closeTab(tab.id)}
                className="px-2 my-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center"
                title="Fechar aba"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
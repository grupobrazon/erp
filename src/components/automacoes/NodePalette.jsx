import React from "react";
import { NODE_CATALOG } from "./nodeTypes";
import { cn } from "@/lib/utils";

const COLOR_DOT = {
  amber: "bg-amber-400",
  blue: "bg-blue-400",
  violet: "bg-violet-400",
  emerald: "bg-emerald-400",
};

export default function NodePalette({ onAddNode }) {
  const onDragStart = (e, nodeType) => {
    e.dataTransfer.setData("application/automacao-node", nodeType);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-64 border-r border-border bg-card h-full overflow-y-auto">
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-semibold">Nós</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Arraste para o canvas</p>
      </div>
      {NODE_CATALOG.map((cat) => (
        <div key={cat.category} className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn("w-2 h-2 rounded-full", COLOR_DOT[cat.color])} />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.category}</span>
          </div>
          <div className="space-y-1.5">
            {cat.nodes.map((n) => {
              const Icon = n.icon;
              return (
                <div
                  key={n.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, n.type)}
                  onDoubleClick={() => onAddNode(n.type)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-background hover:border-primary/50 hover:bg-accent/30 cursor-grab active:cursor-grabbing transition-colors"
                  title={n.description}
                >
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{n.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
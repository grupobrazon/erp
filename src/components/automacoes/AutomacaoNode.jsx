import React, { memo } from "react";
import { Handle, Position } from "reactflow";
import { NODE_MAP, NODE_CATALOG } from "./nodeTypes";
import { cn } from "@/lib/utils";

const COLOR_STYLES = {
  amber: "border-amber-400/60 bg-amber-50 text-amber-900 shadow-amber-200/50",
  blue: "border-blue-400/60 bg-blue-50 text-blue-900 shadow-blue-200/50",
  violet: "border-violet-400/60 bg-violet-50 text-violet-900 shadow-violet-200/50",
  emerald: "border-emerald-400/60 bg-emerald-50 text-emerald-900 shadow-emerald-200/50",
};

function AutomacaoNode({ data, selected }) {
  const def = NODE_MAP[data?.nodeType] || NODE_MAP[data?.type];
  if (!def) {
    return (
      <div className="px-3 py-2 rounded-md border-2 border-slate-300 bg-white text-xs">
        {data?.label || "Nó"}
      </div>
    );
  }
  const Icon = def.icon;
  const colorClass = COLOR_STYLES[def.color] || COLOR_STYLES.blue;
  const isTrigger = String(def.type).startsWith("trigger_");

  return (
    <div
      className={cn(
        "min-w-[180px] max-w-[240px] rounded-lg border-2 shadow-md transition-all",
        colorClass,
        selected && "ring-2 ring-offset-1 ring-blue-500"
      )}
    >
      {def.inputs.map((p) => (
        <Handle
          key={`in-${p.id}`}
          type="target"
          position={Position.Left}
          id={p.id}
          className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
          style={{ top: "50%" }}
        />
      ))}

      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className={cn("flex-shrink-0 p-1.5 rounded-md bg-white/60")}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{def.category}</div>
          <div className="text-sm font-bold truncate">{data.label || def.label}</div>
        </div>
      </div>

      {def.outputs.map((p, idx) => {
        const isBranch = def.outputs.length > 1;
        const topPercent = isBranch ? `${(idx + 1) * (100 / (def.outputs.length + 1))}%` : "50%";
        return (
          <Handle
            key={`out-${p.id}`}
            type="source"
            position={Position.Right}
            id={p.id}
            className={cn("!w-3 !h-3 !border-2 !border-white", isBranch ? "!bg-emerald-500" : "!bg-blue-500")}
            style={{ top: topPercent }}
          />
        );
      })}
    </div>
  );
}

const allNodeTypes = {};
for (const cat of NODE_CATALOG) {
  for (const n of cat.nodes) {
    allNodeTypes[n.type] = AutomacaoNode;
  }
}
export const nodeTypes = allNodeTypes;

export default memo(AutomacaoNode);
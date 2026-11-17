import React, { useCallback } from "react";
import ReactFlow, {
  Background, Controls, MiniMap, ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { createNode, NODE_MAP } from "./nodeTypes";
import { nodeTypes } from "./AutomacaoNode";

const COLOR_MAP = {
  amber: "#fbbf24",
  blue: "#60a5fa",
  violet: "#a78bfa",
  emerald: "#34d399",
};

function Canvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeClick, onAddNode }) {
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/automacao-node");
    if (!type) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const position = e.currentTarget.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    onAddNode(createNode(type, position));
  }, [onAddNode]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div className="flex-1 h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#64748b", strokeWidth: 2 } }}
      >
        <Background color="#cbd5e1" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const nodeDef = n.data?.nodeType && NODE_MAP[n.data.nodeType];
            return COLOR_MAP[nodeDef?.color] || "#94a3b8";
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  );
}

export default function AutomacaoCanvas(props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
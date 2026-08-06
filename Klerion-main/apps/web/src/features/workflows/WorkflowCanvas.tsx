import React, { useRef, useState, useCallback, useEffect } from "react";
import { CanvasStep, SelectionState, TransitionEdge } from "./types.js";
import { WorkflowNode } from "./WorkflowNode.js";
import { Plus, Move, Grid, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface WorkflowCanvasProps {
  steps: CanvasStep[];
  startStepId: string;
  selection: SelectionState;
  isReadOnly?: boolean;
  onSelectStep: (stepId: string) => void;
  onSelectTransition: (ruleId: string, sourceStepId: string) => void;
  onClearSelection: () => void;
  onUpdateStepPosition: (stepId: string, x: number, y: number) => void;
  onAddTransition: (sourceStepId: string, targetStepId: string) => void;
  onDeleteStep?: (stepId: string) => void;
  onSetStartStep?: (stepId: string) => void;
  onAddStepAtPosition?: (x: number, y: number) => void;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  steps,
  startStepId,
  selection,
  isReadOnly,
  onSelectStep,
  onSelectTransition,
  onClearSelection,
  onUpdateStepPosition,
  onAddTransition,
  onDeleteStep,
  onSetStartStep,
  onAddStepAtPosition,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);

  // Connection line state
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [connectionMousePos, setConnectionMousePos] = useState<{ x: number; y: number } | null>(null);

  // Dragging node state
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Handle pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).id === "canvas-svg-bg") {
      onClearSelection();
      if (e.button === 0) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      } else if (draggingStepId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left - pan.x) / zoom - dragOffset.x);
        const y = Math.round((e.clientY - rect.top - pan.y) / zoom - dragOffset.y);
        onUpdateStepPosition(draggingStepId, Math.max(0, x), Math.max(0, y));
      } else if (connectingFromId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        setConnectionMousePos({ x, y });
      }
    },
    [isPanning, panStart, draggingStepId, dragOffset, connectingFromId, pan, zoom, onUpdateStepPosition]
  );

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingStepId(null);
    setConnectingFromId(null);
    setConnectionMousePos(null);
  };

  const handleNodeDragStart = (e: React.MouseEvent, stepId: string) => {
    if (isReadOnly) return;
    const step = steps.find((s) => s.id === stepId);
    if (!step || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;
    setDragOffset({ x: mouseX - step.position.x, y: mouseY - step.position.y });
    setDraggingStepId(stepId);
    onSelectStep(stepId);
  };

  const handleStartConnection = (stepId: string, e: React.MouseEvent) => {
    if (isReadOnly) return;
    setConnectingFromId(stepId);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setConnectionMousePos({ x, y });
    }
  };

  const handleEndConnection = (targetStepId: string) => {
    if (connectingFromId && connectingFromId !== targetStepId) {
      onAddTransition(connectingFromId, targetStepId);
    }
    setConnectingFromId(null);
    setConnectionMousePos(null);
  };

  // Collect all edges for rendering SVG paths
  const edges: TransitionEdge[] = [];
  steps.forEach((step) => {
    step.transitions.forEach((rule) => {
      edges.push({
        id: rule.id,
        sourceStepId: step.id,
        targetStepId: rule.targetStepId,
        rule,
      });
    });
  });

  const getStepCenter = (stepId: string, isSource: boolean) => {
    const step = steps.find((s) => s.id === stepId);
    if (!step) return { x: 0, y: 0 };
    // Node width = 256 (w-64), height approx 110
    const x = isSource ? step.position.x + 256 : step.position.x;
    const y = step.position.y + 55;
    return { x, y };
  };

  // SVG Cubic Bezier Path calculation
  const renderEdgePath = (edge: TransitionEdge) => {
    const source = getStepCenter(edge.sourceStepId, true);
    const target = getStepCenter(edge.targetStepId, false);

    const deltaX = Math.abs(target.x - source.x);
    const controlOffset = Math.max(deltaX * 0.5, 40);

    const pathString = `M ${source.x} ${source.y} C ${source.x + controlOffset} ${source.y}, ${
      target.x - controlOffset
    } ${target.y}, ${target.x} ${target.y}`;

    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;

    const isSelected =
      selection.type === "TRANSITION" && selection.ruleId === edge.rule.id;

    return (
      <g key={edge.id} className="cursor-pointer">
        <path
          d={pathString}
          fill="none"
          stroke={isSelected ? "#3b82f6" : "#94a3b8"}
          strokeWidth={isSelected ? "3.5" : "2"}
          strokeDasharray={edge.rule.isDefault ? "4 4" : undefined}
          markerEnd="url(#arrowhead)"
          className="transition-all hover:stroke-blue-500 hover:stroke-[3.5]"
          onClick={(e) => {
            e.stopPropagation();
            onSelectTransition(edge.rule.id, edge.sourceStepId);
          }}
        />
        {/* Label on edge midpoint */}
        <foreignObject
          x={midX - 50}
          y={midY - 12}
          width="100"
          height="24"
          className="overflow-visible pointer-events-none"
        >
          <div
            className={`flex justify-center items-center`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectTransition(edge.rule.id, edge.sourceStepId);
            }}
          >
            <span
              className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border shadow-2xs pointer-events-auto cursor-pointer ${
                isSelected
                  ? "bg-blue-600 text-white border-blue-700"
                  : edge.rule.condition
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : edge.rule.isDefault
                  ? "bg-slate-100 text-slate-600 border-slate-200"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {edge.rule.condition
                ? `${edge.rule.condition.field} ${edge.rule.condition.operator}`
                : edge.rule.isDefault
                ? "Default"
                : "Next"}
            </span>
          </div>
        </foreignObject>
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      id="workflow-canvas-container"
      className="relative w-full h-full overflow-hidden bg-slate-900/5 select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={(e) => {
        if (!isReadOnly && onAddStepAtPosition && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const x = Math.round((e.clientX - rect.left - pan.x) / zoom);
          const y = Math.round((e.clientY - rect.top - pan.y) / zoom);
          onAddStepAtPosition(x, y);
        }
      }}
    >
      {/* Background Grid Pattern */}
      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, #cbd5e1 1px, transparent 1px)`,
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />
      )}

      {/* Transform Container for Zoom/Pan */}
      <div
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* SVG Edge Connecting Layer */}
        <svg
          id="canvas-svg-bg"
          className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none"
        >
          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
          </defs>

          {/* Render workflow step transitions */}
          {edges.map(renderEdgePath)}

          {/* Render line during active handle drag */}
          {connectingFromId && connectionMousePos && (
            <path
              d={`M ${getStepCenter(connectingFromId, true).x} ${
                getStepCenter(connectingFromId, true).y
              } Q ${
                (getStepCenter(connectingFromId, true).x + connectionMousePos.x) / 2
              } ${
                getStepCenter(connectingFromId, true).y
              }, ${connectionMousePos.x} ${connectionMousePos.y}`}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeDasharray="5 5"
            />
          )}
        </svg>

        {/* Nodes Layer */}
        {steps.map((step) => (
          <WorkflowNode
            key={step.id}
            step={step}
            isStartStep={step.id === startStepId}
            isSelected={selection.type === "STEP" && selection.stepId === step.id}
            isReadOnly={isReadOnly}
            onSelect={onSelectStep}
            onDragStart={handleNodeDragStart}
            onDelete={onDeleteStep}
            onSetStartStep={onSetStartStep}
            onStartConnection={handleStartConnection}
            onEndConnection={handleEndConnection}
          />
        ))}
      </div>

      {/* Floating Canvas Controls */}
      <div className="absolute bottom-6 left-6 flex items-center space-x-2 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-xl p-1.5 shadow-md z-30">
        <button
          type="button"
          id="btn-zoom-in"
          title="Zoom In"
          onClick={() => setZoom((z) => Math.min(z + 0.15, 2))}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold text-slate-500 w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          id="btn-zoom-out"
          title="Zoom Out"
          onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-slate-200" />
        <button
          type="button"
          id="btn-reset-zoom"
          title="Reset Zoom & Pan"
          onClick={() => {
            setZoom(1);
            setPan({ x: 50, y: 50 });
          }}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          id="btn-toggle-grid"
          title="Toggle Canvas Grid"
          onClick={() => setShowGrid((g) => !g)}
          className={`p-1.5 rounded-lg transition-colors ${
            showGrid ? "bg-slate-100 text-blue-600 font-semibold" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Grid className="w-4 h-4" />
        </button>
      </div>

      {/* Helper text overlay */}
      {steps.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
          <Move className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm font-medium">Drag step blocks from palette or double-click to add a step</p>
        </div>
      )}
    </div>
  );
};

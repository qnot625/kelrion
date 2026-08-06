import {
  WorkflowDefinitionJSON,
  WorkflowStepJSON,
  TransitionRuleJSON,
  WorkflowInstanceJSON,
  HumanTaskJSON,
  TriggerJSON,
  TaskConfigJSON,
} from "./api.js";

export type StepType = WorkflowStepJSON["type"];

export interface NodePosition {
  x: number;
  y: number;
}

export interface CanvasStep extends WorkflowStepJSON {
  position: NodePosition;
}

export interface TransitionEdge {
  id: string;
  sourceStepId: string;
  targetStepId: string;
  rule: TransitionRuleJSON;
}

export type SelectionState =
  | { type: "NONE" }
  | { type: "STEP"; stepId: string }
  | { type: "TRANSITION"; ruleId: string; sourceStepId: string }
  | { type: "WORKFLOW" };

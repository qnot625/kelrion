import React, { useState } from "react";
import { Plus, Trash2, ArrowRight, GitBranch } from "lucide-react";
import { TransitionRuleJSON, WorkflowStepJSON } from "./api.js";

interface TransitionEditorProps {
  sourceStep: WorkflowStepJSON;
  allSteps: WorkflowStepJSON[];
  onUpdateTransitions: (transitions: TransitionRuleJSON[]) => void;
}

const OPERATOR_OPTIONS = [
  { label: "Equals (==)", value: "EQUALS" },
  { label: "Not Equals (!=)", value: "NOT_EQUALS" },
  { label: "Greater Than (>)", value: "GREATER_THAN" },
  { label: "Less Than (<)", value: "LESS_THAN" },
  { label: "Contains", value: "CONTAINS" },
  { label: "In Array", value: "IN" },
  { label: "Is Empty", value: "IS_EMPTY" },
];

export const TransitionEditor: React.FC<TransitionEditorProps> = ({
  sourceStep,
  allSteps,
  onUpdateTransitions,
}) => {
  const possibleTargets = allSteps.filter((s) => s.id !== sourceStep.id);

  const handleAddRule = () => {
    const nextTarget = possibleTargets[0]?.id || "";
    const newRule: TransitionRuleJSON = {
      id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      targetStepId: nextTarget,
      isDefault: sourceStep.transitions.length === 0,
    };
    onUpdateTransitions([...sourceStep.transitions, newRule]);
  };

  const handleUpdateRule = (index: number, updated: TransitionRuleJSON) => {
    const list = [...sourceStep.transitions];
    list[index] = updated;
    onUpdateTransitions(list);
  };

  const handleDeleteRule = (index: number) => {
    const list = sourceStep.transitions.filter((_, i) => i !== index);
    onUpdateTransitions(list);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <GitBranch className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Outgoing Transitions ({sourceStep.transitions.length})
          </h4>
        </div>
        <button
          type="button"
          id="btn-add-transition-rule"
          onClick={handleAddRule}
          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Rule</span>
        </button>
      </div>

      {sourceStep.transitions.length === 0 ? (
        <div className="p-3 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-xs text-slate-500">No transition rules defined for this step.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sourceStep.transitions.map((rule, idx) => {
            const hasCondition = !!rule.condition;

            return (
              <div
                key={rule.id}
                className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-3 relative group"
              >
                {/* Target Step Selector */}
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <span className="text-xs font-semibold text-slate-500">Route to:</span>
                    <select
                      value={rule.targetStepId}
                      onChange={(e) =>
                        handleUpdateRule(idx, { ...rule, targetStepId: e.target.value })
                      }
                      className="text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none flex-1"
                    >
                      {possibleTargets.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    title="Delete Rule"
                    onClick={() => handleDeleteRule(idx)}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Default route checkbox */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`check-default-rule-${rule.id}`}
                    checked={!!rule.isDefault}
                    onChange={(e) =>
                      handleUpdateRule(idx, { ...rule, isDefault: e.target.checked })
                    }
                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <label
                    htmlFor={`check-default-rule-${rule.id}`}
                    className="text-xs font-medium text-slate-600 cursor-pointer"
                  >
                    Default route (fallback if no conditions match)
                  </label>
                </div>

                {/* Condition toggle / builder */}
                <div className="pt-2 border-t border-slate-200/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Condition Rule
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (hasCondition) {
                          const { condition, ...rest } = rule;
                          handleUpdateRule(idx, rest);
                        } else {
                          handleUpdateRule(idx, {
                            ...rule,
                            condition: { field: "amount", operator: "GREATER_THAN", value: 1000 },
                          });
                        }
                      }}
                      className="text-[11px] text-blue-600 font-semibold hover:underline"
                    >
                      {hasCondition ? "Remove Condition" : "+ Add Condition"}
                    </button>
                  </div>

                  {rule.condition && (
                    <div className="grid grid-cols-3 gap-2 bg-white p-2 rounded-lg border border-slate-200">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Field</label>
                        <input
                          type="text"
                          value={rule.condition.field}
                          onChange={(e) =>
                            handleUpdateRule(idx, {
                              ...rule,
                              condition: { ...rule.condition!, field: e.target.value },
                            })
                          }
                          placeholder="e.g. amount"
                          className="w-full text-xs border border-slate-300 rounded px-1.5 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Operator</label>
                        <select
                          value={rule.condition.operator}
                          onChange={(e) =>
                            handleUpdateRule(idx, {
                              ...rule,
                              condition: { ...rule.condition!, operator: e.target.value as any },
                            })
                          }
                          className="w-full text-xs border border-slate-300 rounded px-1 py-1"
                        >
                          {OPERATOR_OPTIONS.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Value</label>
                        <input
                          type="text"
                          value={rule.condition.value ?? ""}
                          onChange={(e) =>
                            handleUpdateRule(idx, {
                              ...rule,
                              condition: { ...rule.condition!, value: e.target.value },
                            })
                          }
                          placeholder="Value"
                          className="w-full text-xs border border-slate-300 rounded px-1.5 py-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, { useState } from "react";
import { Users, User, Clock, FileText, AlertTriangle, Shield } from "lucide-react";
import { TaskConfigJSON } from "./api.js";

interface HumanTaskEditorProps {
  taskConfig: TaskConfigJSON | undefined;
  onUpdateConfig: (updatedConfig: TaskConfigJSON) => void;
}

export const HumanTaskEditor: React.FC<HumanTaskEditorProps> = ({
  taskConfig = {},
  onUpdateConfig,
}) => {
  const [candidateRoleInput, setCandidateRoleInput] = useState("");

  const candidateRoles = taskConfig.candidateRoles || [];

  const handleAddRole = () => {
    if (!candidateRoleInput.trim()) return;
    const trimmed = candidateRoleInput.trim().toLowerCase();
    if (!candidateRoles.includes(trimmed)) {
      onUpdateConfig({
        ...taskConfig,
        candidateRoles: [...candidateRoles, trimmed],
      });
    }
    setCandidateRoleInput("");
  };

  const handleRemoveRole = (role: string) => {
    onUpdateConfig({
      ...taskConfig,
      candidateRoles: candidateRoles.filter((r) => r !== role),
    });
  };

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <div className="flex items-center space-x-1.5">
        <Users className="w-4 h-4 text-purple-600" />
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Human Task Configuration
        </h4>
      </div>

      {/* Assignee User ID */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Direct Assignee (User ID)
        </label>
        <div className="relative">
          <User className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={taskConfig.assigneeId || ""}
            onChange={(e) =>
              onUpdateConfig({ ...taskConfig, assigneeId: e.target.value || undefined })
            }
            placeholder="e.g. user-manager-1"
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Candidate Roles */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Candidate Roles
        </label>
        <div className="flex items-center space-x-2 mb-2">
          <input
            type="text"
            value={candidateRoleInput}
            onChange={(e) => setCandidateRoleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddRole();
              }
            }}
            placeholder="Add role (e.g. manager, finance)"
            className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddRole}
            className="px-3 py-1.5 text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors"
          >
            Add Role
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {candidateRoles.map((role) => (
            <span
              key={role}
              className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded-md"
            >
              <span>{role}</span>
              <button
                type="button"
                onClick={() => handleRemoveRole(role)}
                className="text-purple-600 hover:text-purple-950 font-bold ml-1"
              >
                ×
              </button>
            </span>
          ))}
          {candidateRoles.length === 0 && (
            <span className="text-xs text-slate-400 italic">No candidate roles assigned</span>
          )}
        </div>
      </div>

      {/* Task Priority */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
        <select
          value={taskConfig.priority || "MEDIUM"}
          onChange={(e) =>
            onUpdateConfig({ ...taskConfig, priority: e.target.value as any })
          }
          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
        >
          <option value="LOW">Low Priority</option>
          <option value="MEDIUM">Medium Priority</option>
          <option value="HIGH">High Priority</option>
          <option value="URGENT">Urgent Priority</option>
        </select>
      </div>

      {/* Associated Form ID */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Bound Form Definition ID
        </label>
        <div className="relative">
          <FileText className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={taskConfig.formDefinitionId || ""}
            onChange={(e) =>
              onUpdateConfig({ ...taskConfig, formDefinitionId: e.target.value || undefined })
            }
            placeholder="e.g. form-purchase-request"
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>
      </div>

      {/* SLA Duration */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          SLA Timeout (Hours)
        </label>
        <div className="relative">
          <Clock className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="number"
            min="0"
            value={
              taskConfig.dueDurationMs
                ? Math.round(taskConfig.dueDurationMs / (1000 * 60 * 60))
                : ""
            }
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onUpdateConfig({
                ...taskConfig,
                dueDurationMs: val > 0 ? val * 1000 * 60 * 60 : undefined,
              });
            }}
            placeholder="e.g. 24"
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};

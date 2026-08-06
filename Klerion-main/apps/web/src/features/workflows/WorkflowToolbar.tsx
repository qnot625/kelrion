import React, { useState } from "react";
import {
  Save,
  CheckCircle,
  Play,
  Download,
  Upload,
  Layout,
  ArrowLeft,
  Sparkles,
  Layers,
} from "lucide-react";
import { VersionSelector } from "./VersionSelector.js";
import { WorkflowDefinitionJSON } from "./api.js";

interface WorkflowToolbarProps {
  workflow: Partial<WorkflowDefinitionJSON>;
  isSaving?: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onAutoLayout: () => void;
  onExportJSON: () => void;
  onImportJSON: (json: string) => void;
  onRunTestSimulation: () => void;
  onBack?: () => void;
}

export const WorkflowToolbar: React.FC<WorkflowToolbarProps> = ({
  workflow,
  isSaving,
  onSaveDraft,
  onPublish,
  onArchive,
  onAutoLayout,
  onExportJSON,
  onImportJSON,
  onRunTestSimulation,
  onBack,
}) => {
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");

  return (
    <header className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between z-30 shrink-0">
      {/* Left: Back & Title */}
      <div className="flex items-center space-x-3 min-w-0">
        {onBack && (
          <button
            type="button"
            id="btn-workflow-back"
            onClick={onBack}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 truncate">
              {workflow.name || "Untitled Workflow"}
            </h1>
            <p className="text-[11px] text-slate-400 truncate">
              ID: {workflow.id || "new-workflow"}
            </p>
          </div>
        </div>
      </div>

      {/* Center / Right: Actions */}
      <div className="flex items-center space-x-2">
        <VersionSelector
          currentVersion={workflow.version || 1}
          status={(workflow.status as any) || "DRAFT"}
          onPublish={onPublish}
          onArchive={onArchive}
        />

        <div className="h-4 w-px bg-slate-200" />

        <button
          type="button"
          id="btn-auto-layout"
          title="Auto arrange canvas steps"
          onClick={onAutoLayout}
          className="p-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center space-x-1"
        >
          <Layout className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Auto-Layout</span>
        </button>

        <button
          type="button"
          id="btn-export-json"
          title="Export Workflow JSON"
          onClick={onExportJSON}
          className="p-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          id="btn-import-json"
          title="Import Workflow JSON"
          onClick={() => setShowImportModal(true)}
          className="p-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200" />

        <button
          type="button"
          id="btn-run-simulation"
          onClick={onRunTestSimulation}
          className="px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center space-x-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Test Run</span>
        </button>

        <button
          type="button"
          id="btn-save-workflow-draft"
          disabled={isSaving}
          onClick={onSaveDraft}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-2xs transition-colors flex items-center space-x-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaving ? "Saving..." : "Save Draft"}</span>
        </button>
      </div>

      {/* JSON Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Import Workflow JSON</h3>
            <textarea
              rows={8}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste workflow definition JSON here..."
              className="w-full font-mono text-xs border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onImportJSON(importText);
                  setShowImportModal(false);
                  setImportText("");
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Apply Import
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

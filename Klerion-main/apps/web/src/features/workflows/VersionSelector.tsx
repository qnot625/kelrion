import React from "react";
import { GitBranch, CheckCircle2, Archive, FileEdit, Sparkles } from "lucide-react";

interface VersionSelectorProps {
  currentVersion: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isReadOnly?: boolean;
  onPublish: () => void;
  onArchive: () => void;
}

export const VersionSelector: React.FC<VersionSelectorProps> = ({
  currentVersion,
  status,
  isReadOnly,
  onPublish,
  onArchive,
}) => {
  return (
    <div className="flex items-center space-x-2">
      {/* Version Tag */}
      <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold">
        <GitBranch className="w-3.5 h-3.5 text-slate-500" />
        <span>v{currentVersion}</span>
        <span
          className={`ml-1 px-1.5 py-0.2 text-[10px] font-bold uppercase rounded ${
            status === "PUBLISHED"
              ? "bg-emerald-100 text-emerald-800"
              : status === "ARCHIVED"
              ? "bg-slate-200 text-slate-600"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {status}
        </span>
      </div>

      {/* Action buttons depending on status */}
      {status === "DRAFT" && (
        <button
          type="button"
          id="btn-publish-workflow-toolbar"
          onClick={onPublish}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Publish Version</span>
        </button>
      )}

      {status === "PUBLISHED" && (
        <button
          type="button"
          id="btn-archive-workflow-toolbar"
          onClick={onArchive}
          className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Archive</span>
        </button>
      )}
    </div>
  );
};

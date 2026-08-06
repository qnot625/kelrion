import React, { useState, useEffect } from "react";
import {
  FileText,
  Plus,
  Eye,
  Edit,
  CheckCircle2,
  Archive,
  Inbox,
  ArrowLeft,
  RefreshCw,
  Layers,
  Sparkles,
  Search,
} from "lucide-react";
import {
  formsApi,
  type FormDefinitionJSON,
  type FormSubmissionJSON,
} from "./api.js";
import { FormBuilder } from "./FormBuilder.js";
import { FormRenderer } from "./FormRenderer.js";

type ViewMode = "list" | "builder" | "renderer" | "submissions";

export const FormsManager: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [forms, setForms] = useState<FormDefinitionJSON[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeForm, setActiveForm] = useState<FormDefinitionJSON | null>(null);
  const [submissions, setSubmissions] = useState<FormSubmissionJSON[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState<boolean>(false);

  // Search filter
  const [searchTerm, setSearchTerm] = useState<string>("");

  const loadForms = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await formsApi.listForms();
      setForms(data);
    } catch (err: any) {
      setError(err.message || "Failed to load forms from API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  // Handle open Submissions view
  const handleViewSubmissions = async (form: FormDefinitionJSON) => {
    setActiveForm(form);
    setViewMode("submissions");
    setLoadingSubmissions(true);
    try {
      const list = await formsApi.listSubmissions(form.id);
      setSubmissions(list);
    } catch (err: any) {
      setError(err.message || "Failed to load submissions");
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Handle publish directly from list
  const handlePublishForm = async (formId: string) => {
    try {
      await formsApi.publishForm(formId);
      await loadForms();
    } catch (err: any) {
      setError(err.message || "Failed to publish form");
    }
  };

  // Handle archive directly from list
  const handleArchiveForm = async (formId: string) => {
    try {
      await formsApi.archiveForm(formId);
      await loadForms();
    } catch (err: any) {
      setError(err.message || "Failed to archive form");
    }
  };

  const filteredForms = forms.filter(
    (f) =>
      f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="forms-manager-root" className="space-y-6">
      {/* Top Navigation Bar */}
      {viewMode !== "list" && (
        <div className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-800">
          <button
            id="btn-back-to-forms-list"
            onClick={() => {
              setViewMode("list");
              setActiveForm(null);
              loadForms();
            }}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-400" />
            Back to Forms Directory
          </button>
          {activeForm && (
            <span className="text-xs text-slate-400 font-mono">
              Active Form: <strong className="text-indigo-300">{activeForm.title}</strong> (v{activeForm.version})
            </span>
          )}
        </div>
      )}

      {/* VIEW: Form List Directory */}
      {viewMode === "list" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                Forms Engine Platform
              </h2>
              <p className="text-xs text-slate-400">
                Design multi-step schema definitions, validate responses, & manage multi-tenant form submissions.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                id="btn-refresh-forms"
                onClick={loadForms}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                title="Refresh Forms"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
              </button>

              <button
                id="btn-create-new-form-schema"
                onClick={() => {
                  setActiveForm(null);
                  setViewMode("builder");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                New Form Schema
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              id="input-search-forms"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter forms by title or schema ID..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-950/80 border border-red-800/60 rounded-lg text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Forms Table */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Schema ID</th>
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Version</th>
                  <th className="px-5 py-3">Fields</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      Loading Form Definitions from Fastify API...
                    </td>
                  </tr>
                ) : filteredForms.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      No form schemas found. Click "New Form Schema" above to create one.
                    </td>
                  </tr>
                ) : (
                  filteredForms.map((form) => (
                    <tr key={form.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-indigo-400 font-medium">{form.id}</td>
                      <td className="px-5 py-3.5 font-semibold text-white">{form.title}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            form.status === "PUBLISHED"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                              : form.status === "DRAFT"
                              ? "bg-amber-950 text-amber-400 border border-amber-800/60"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {form.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono">v{form.version}</td>
                      <td className="px-5 py-3.5">{form.fields.length} fields</td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        {/* Edit Schema */}
                        <button
                          id={`btn-edit-form-${form.id}`}
                          onClick={() => {
                            setActiveForm(form);
                            setViewMode("builder");
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium transition-colors"
                          title="Edit Schema"
                        >
                          Edit
                        </button>

                        {/* Render / Fill Form */}
                        <button
                          id={`btn-render-form-${form.id}`}
                          onClick={() => {
                            setActiveForm(form);
                            setViewMode("renderer");
                          }}
                          className="px-2.5 py-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 rounded text-[11px] font-medium transition-colors"
                          title="Fill out form"
                        >
                          Fill Form
                        </button>

                        {/* View Submissions */}
                        <button
                          id={`btn-submissions-form-${form.id}`}
                          onClick={() => handleViewSubmissions(form)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium transition-colors"
                          title="View Responses"
                        >
                          Submissions
                        </button>

                        {/* Publish (if draft) */}
                        {form.status === "DRAFT" && (
                          <button
                            id={`btn-publish-direct-${form.id}`}
                            onClick={() => handlePublishForm(form.id)}
                            className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/60 rounded text-[11px] font-medium"
                          >
                            Publish
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: Form Builder */}
      {viewMode === "builder" && (
        <FormBuilder
          initialForm={activeForm || undefined}
          onSaved={() => loadForms()}
          onPublished={() => loadForms()}
          onCancel={() => {
            setViewMode("list");
            loadForms();
          }}
        />
      )}

      {/* VIEW: Form Renderer */}
      {viewMode === "renderer" && activeForm && (
        <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg">
          <FormRenderer
            formDefinition={activeForm}
            onSubmitted={() => {
              // Optional callback
            }}
          />
        </div>
      )}

      {/* VIEW: Form Submissions */}
      {viewMode === "submissions" && activeForm && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Inbox className="w-5 h-5 text-indigo-400" />
                Submissions for "{activeForm.title}"
              </h3>
              <p className="text-xs text-slate-400">
                Bound to Schema Version <span className="font-mono text-indigo-300">v{activeForm.version}</span>
              </p>
            </div>
            <button
              id="btn-refresh-submissions"
              onClick={() => handleViewSubmissions(activeForm)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
            >
              <RefreshCw className={`w-4 h-4 ${loadingSubmissions ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Submission ID</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Version</th>
                  <th className="px-5 py-3">Responses Payload</th>
                  <th className="px-5 py-3">Submitted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loadingSubmissions ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      Loading submissions from API...
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      No submissions recorded for this form definition yet.
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-indigo-300">{sub.id}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sub.status === "SUBMITTED" || sub.status === "VALIDATED"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                              : "bg-amber-950 text-amber-400 border border-amber-800/60"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono">v{sub.formVersion}</td>
                      <td className="px-5 py-3.5 max-w-xs font-mono text-[11px] truncate text-slate-300">
                        {JSON.stringify(sub.responses)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">
                        {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "Draft"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

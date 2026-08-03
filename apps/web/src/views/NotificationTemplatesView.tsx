import React, { useState } from "react";
import { Plus, FileText, Mail, MessageSquare, Eye, Edit3, Trash2, Search, Code2 } from "lucide-react";
import { NotificationTemplateItem, NotificationChannel } from "../types/notification";
import { Alert } from "../components/Alert";
import { Modal } from "../components/Modal";

interface NotificationTemplatesViewProps {
  // Preset templates or manager
}

export const NotificationTemplatesView: React.FC<NotificationTemplatesViewProps> = () => {
  // Initial default presets
  const [templates, setTemplates] = useState<NotificationTemplateItem[]>([
    {
      id: "ticket_called_email",
      channel: "email",
      subject: "Queue Update: Ticket #{{ ticketNumber }} Called",
      body: "Hello {{ customerName }},\n\nYour ticket #{{ ticketNumber }} has been called to {{ counterName }}.\nPlease proceed immediately.",
      requiredVariables: ["ticketNumber", "customerName", "counterName"],
      description: "Triggered when staff calls next ticket at counter.",
    },
    {
      id: "ticket_called_sms",
      channel: "sms",
      subject: "Ticket Call Alert",
      body: "Ticket #{{ ticketNumber }} called to {{ counterName }}. Please proceed.",
      requiredVariables: ["ticketNumber", "counterName"],
      description: "SMS alert for called ticket position.",
    },
    {
      id: "test_email_template",
      channel: "email",
      subject: "Test Notification: {{ name }}",
      body: "Hello {{ name }}, this is a test email notification sent at {{ time }}.",
      requiredVariables: ["name", "time"],
      description: "System test email notification.",
    },
    {
      id: "test_sms_template",
      channel: "sms",
      subject: "Test SMS",
      body: "Hello {{ name }}, test SMS notification sent at {{ time }}.",
      requiredVariables: ["name", "time"],
      description: "System test SMS notification.",
    },
    {
      id: "appointment_reminder_email",
      channel: "email",
      subject: "Appointment Reminder: {{ appointmentCode }}",
      body: "Dear {{ customerName }},\n\nYour appointment (Ref: {{ appointmentCode }}) is scheduled for {{ time }}.\nPlease present this reference upon arrival.",
      requiredVariables: ["appointmentCode", "customerName", "time"],
      description: "Customer pre-appointment reminder.",
    },
  ]);

  // Filters & Search
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Editor Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplateItem | null>(null);

  // Form fields
  const [formId, setFormId] = useState<string>("");
  const [formChannel, setFormChannel] = useState<NotificationChannel>("email");
  const [formSubject, setFormSubject] = useState<string>("");
  const [formBody, setFormBody] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");

  // Preview Modal state
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplateItem | null>(null);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

  // Alert & validation state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Template syntax extraction & validator helper
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$.-]*)\s*\}\}/g;
    const matches = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m[1]) matches.add(m[1]);
    }
    return Array.from(matches);
  };

  const validateSyntax = (text: string): string | null => {
    let depth = 0;
    for (let i = 0; i < text.length - 1; i++) {
      if (text[i] === "{" && text[i + 1] === "{") {
        if (depth > 0) return "Nested '{{' syntax error detected.";
        depth++;
        i++;
      } else if (text[i] === "}" && text[i + 1] === "}") {
        if (depth === 0) return "Unexpected closing '}}' without opening '{{'.";
        depth--;
        i++;
      }
    }
    if (depth !== 0) return "Unclosed '{{' placeholder brace.";
    return null;
  };

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormId("");
    setFormChannel("email");
    setFormSubject("");
    setFormBody("");
    setFormDescription("");
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (template: NotificationTemplateItem) => {
    setEditingTemplate(template);
    setFormId(template.id);
    setFormChannel(template.channel);
    setFormSubject(template.subject || "");
    setFormBody(template.body);
    setFormDescription(template.description || "");
    setError(null);
    setIsModalOpen(true);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const id = formId.trim();
    if (!id) {
      setError("Template ID is required");
      return;
    }
    if (!formBody.trim()) {
      setError("Template body is required");
      return;
    }

    const subjectErr = validateSyntax(formSubject);
    if (subjectErr) {
      setError(`Subject Syntax Error: ${subjectErr}`);
      return;
    }

    const bodyErr = validateSyntax(formBody);
    if (bodyErr) {
      setError(`Body Syntax Error: ${bodyErr}`);
      return;
    }

    const extractedVars = Array.from(
      new Set([...extractVariables(formSubject), ...extractVariables(formBody)])
    );

    const newItem: NotificationTemplateItem = {
      id,
      channel: formChannel,
      subject: formSubject.trim() || undefined,
      body: formBody,
      requiredVariables: extractedVars,
      description: formDescription.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    if (editingTemplate) {
      setTemplates((prev) => prev.map((t) => (t.id === editingTemplate.id ? newItem : t)));
      setSuccessMessage(`Template "${id}" updated successfully!`);
    } else {
      if (templates.some((t) => t.id === id)) {
        setError(`A template with ID "${id}" already exists.`);
        return;
      }
      setTemplates((prev) => [...prev, newItem]);
      setSuccessMessage(`Template "${id}" created successfully!`);
    }

    setIsModalOpen(false);
  };

  const handleDeleteTemplate = (id: string) => {
    if (window.confirm(`Are you sure you want to delete template "${id}"?`)) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setSuccessMessage(`Template "${id}" deleted.`);
    }
  };

  const handleOpenPreview = (template: NotificationTemplateItem) => {
    const vars = template.requiredVariables || [];
    const initialVarMap: Record<string, string> = {};
    vars.forEach((v) => {
      if (v === "ticketNumber") initialVarMap[v] = "A-104";
      else if (v === "customerName" || v === "name") initialVarMap[v] = "Jane Doe";
      else if (v === "counterName") initialVarMap[v] = "Counter Station 2";
      else if (v === "time") initialVarMap[v] = new Date().toLocaleTimeString();
      else if (v === "appointmentCode") initialVarMap[v] = "APT-8821";
      else initialVarMap[v] = `[${v}]`;
    });

    setPreviewTemplate(template);
    setPreviewVariables(initialVarMap);
  };

  const renderInterpolatedText = (text?: string): string => {
    if (!text) return "";
    return text.replace(/\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$.-]*)\s*\}\}/g, (_, varName) => {
      return previewVariables[varName] !== undefined ? previewVariables[varName] : `{{${varName}}}`;
    });
  };

  // Local filter
  const filteredTemplates = templates.filter((t) => {
    if (channelFilter !== "ALL" && t.channel.toUpperCase() !== channelFilter.toUpperCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const idMatch = t.id.toLowerCase().includes(q);
      const subjectMatch = t.subject?.toLowerCase().includes(q);
      const bodyMatch = t.body.toLowerCase().includes(q);
      return idMatch || subjectMatch || bodyMatch;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
            Template Architecture Engine
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Notification Templates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Design, validate, and preview mustache placeholder templates for Email and SMS delivery.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          aria-label="Create New Template"
          className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Create New Template
        </button>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}
      {successMessage && (
        <Alert
          type="success"
          message={successMessage}
          onDismiss={() => setSuccessMessage(null)}
        />
      )}

      {/* Controls: Search & Channel Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80 relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search template ID, subject, content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search Templates"
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Channel:</span>
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            {["ALL", "EMAIL", "SMS"].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                aria-label={`Filter by ${ch}`}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  channelFilter === ch
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <FileText className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">No Templates Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No templates match your search criteria. Click below to create a new notification template.
          </p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => {
            const isEmail = template.channel.toLowerCase() === "email";
            return (
              <div
                key={template.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden"
              >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-lg border ${
                        isEmail
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : "bg-purple-100 text-purple-800 border-purple-200"
                      }`}
                    >
                      {isEmail ? (
                        <>
                          <Mail className="h-3 w-3" />
                          Email
                        </>
                      ) : (
                        <>
                          <MessageSquare className="h-3 w-3" />
                          SMS
                        </>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 font-bold">
                      ID: {template.id}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
                    {template.subject || "(No Subject — SMS)"}
                  </h3>

                  {template.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{template.description}</p>
                  )}
                </div>

                {/* Body Preview */}
                <div className="p-5 space-y-3 flex-1 bg-slate-50/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Template Body
                  </span>
                  <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap bg-white p-3 rounded-xl border border-slate-200 max-h-32 overflow-y-auto leading-relaxed">
                    {template.body}
                  </pre>

                  {/* Required variables tags */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Required Variables ({template.requiredVariables?.length || 0})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {template.requiredVariables && template.requiredVariables.length > 0 ? (
                        template.requiredVariables.map((v) => (
                          <span
                            key={v}
                            className="px-2 py-0.5 text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-100"
                          >
                            {`{{${v}}}`}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Static content</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenPreview(template)}
                    aria-label={`Preview template ${template.id}`}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(template)}
                      aria-label={`Edit template ${template.id}`}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      aria-label={`Delete template ${template.id}`}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold text-xs rounded-lg transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500"
                      title="Delete Template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Template Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingTemplate ? `Edit Template: ${editingTemplate.id}` : "Create Notification Template"}
        >
          <form onSubmit={handleSaveTemplate} className="space-y-4">
            <div>
              <label htmlFor="template-id-input" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Template ID
              </label>
              <input
                id="template-id-input"
                type="text"
                placeholder="e.g. ticket_called_email"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                disabled={Boolean(editingTemplate)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-mono text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="template-channel-select" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Channel
                </label>
                <select
                  id="template-channel-select"
                  value={formChannel}
                  onChange={(e) => setFormChannel(e.target.value as NotificationChannel)}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>

              <div>
                <label htmlFor="template-desc-input" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Description
                </label>
                <input
                  id="template-desc-input"
                  type="text"
                  placeholder="Short internal description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {formChannel.toLowerCase() === "email" && (
              <div>
                <label htmlFor="template-subject-input" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Subject Line
                </label>
                <input
                  id="template-subject-input"
                  type="text"
                  placeholder="e.g. Ticket #{{ ticketNumber }} Called"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div>
              <label htmlFor="template-body-input" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Template Body Content
              </label>
              <textarea
                id="template-body-input"
                rows={5}
                placeholder="Use {{ variableName }} for placeholders..."
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                className="w-full p-3 text-xs font-mono border border-slate-300 rounded-xl text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Realtime detected variables preview */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                Auto-Extracted Variables
              </span>
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set([...extractVariables(formSubject), ...extractVariables(formBody)])).map(
                  (v) => (
                    <span key={v} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold rounded">
                      {`{{${v}}}`}
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Save Template
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Rendered Template Preview Modal */}
      {previewTemplate && (
        <Modal
          isOpen={Boolean(previewTemplate)}
          onClose={() => setPreviewTemplate(null)}
          title={`Live Template Preview: ${previewTemplate.id}`}
        >
          <div className="space-y-6">
            {/* Dynamic Variable Inputs */}
            {previewTemplate.requiredVariables && previewTemplate.requiredVariables.length > 0 && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase block">
                  Simulate Variable Values
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {previewTemplate.requiredVariables.map((v) => (
                    <div key={v}>
                      <label htmlFor={`var-input-${v}`} className="block text-[10px] font-mono font-bold text-indigo-700 mb-0.5">
                        {`{{${v}}}`}
                      </label>
                      <input
                        id={`var-input-${v}`}
                        type="text"
                        value={previewVariables[v] || ""}
                        onChange={(e) =>
                          setPreviewVariables((prev) => ({ ...prev, [v]: e.target.value }))
                        }
                        className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rendered Output Preview Card */}
            <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl shadow-xl space-y-4 font-sans">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                  Rendered Output ({previewTemplate.channel.toUpperCase()})
                </span>
                <span className="text-xs text-slate-400">Status: Valid</span>
              </div>

              {previewTemplate.subject && (
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Subject:</span>
                  <h4 className="text-sm font-bold text-white mt-0.5">
                    {renderInterpolatedText(previewTemplate.subject)}
                  </h4>
                </div>
              )}

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Body:</span>
                <p className="text-xs text-slate-200 whitespace-pre-wrap mt-1 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono">
                  {renderInterpolatedText(previewTemplate.body)}
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

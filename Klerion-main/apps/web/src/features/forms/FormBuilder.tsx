import React, { useState } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  Settings,
  Save,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
} from "lucide-react";
import {
  formsApi,
  type FormDefinitionJSON,
  type FormFieldJSON,
  type FormFieldOptionJSON,
} from "./api.js";
import { FormRenderer } from "./FormRenderer.js";

interface FormBuilderProps {
  initialForm?: FormDefinitionJSON;
  onSaved?: (form: FormDefinitionJSON) => void;
  onPublished?: (form: FormDefinitionJSON) => void;
  onCancel?: () => void;
}

export const FormBuilder: React.FC<FormBuilderProps> = ({
  initialForm,
  onSaved,
  onPublished,
  onCancel,
}) => {
  const [formId, setFormId] = useState<string>(initialForm?.id || `form-${Date.now().toString().slice(-4)}`);
  const [title, setTitle] = useState<string>(initialForm?.title || "New Service Form");
  const [description, setDescription] = useState<string>(initialForm?.description || "");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">(initialForm?.status || "DRAFT");
  const [version, setVersion] = useState<number>(initialForm?.version || 1);
  const [fields, setFields] = useState<FormFieldJSON[]>(
    initialForm?.fields
      ? initialForm.fields.map((f) => ({ ...f }))
      : [
          {
            id: "requester_name",
            label: "Requester Full Name",
            type: "text",
            placeholder: "e.g. Jane Doe",
            helpText: "Enter your official company name",
            validationRules: [{ type: "required", message: "Full Name is required" }],
          },
        ]
  );

  const [activeTab, setActiveTab] = useState<"builder" | "preview">("builder");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    fields[0]?.id || null
  );

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  // Add field
  const handleAddField = (type: FormFieldJSON["type"]) => {
    const newFieldId = `field_${Date.now().toString().slice(-4)}`;
    const newField: FormFieldJSON = {
      id: newFieldId,
      label: `New ${type.toUpperCase()} Field`,
      type,
      placeholder: "",
      helpText: "",
      options: type === "select" || type === "multiselect" ? [{ label: "Option 1", value: "opt1" }] : undefined,
      validationRules: [],
      visibilityConditions: [],
    };
    const updated = [...fields, newField];
    setFields(updated);
    setSelectedFieldId(newFieldId);
  };

  // Remove field
  const handleRemoveField = (idToRemove: string) => {
    const updated = fields.filter((f) => f.id !== idToRemove);
    setFields(updated);
    if (selectedFieldId === idToRemove) {
      setSelectedFieldId(updated[0]?.id || null);
    }
  };

  // Reorder field
  const handleMoveField = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const updated = [...fields];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    setFields(updated);
  };

  // Update selected field property
  const handleUpdateFieldProp = (key: keyof FormFieldJSON, val: any) => {
    if (!selectedFieldId) return;
    setFields((prev) =>
      prev.map((f) => (f.id === selectedFieldId ? { ...f, [key]: val } : f))
    );
  };

  // Toggle field required validation
  const handleToggleRequired = () => {
    if (!selectedField) return;
    const currentRules = selectedField.validationRules || [];
    const isRequired = currentRules.some((r) => r.type === "required");

    let newRules;
    if (isRequired) {
      newRules = currentRules.filter((r) => r.type !== "required");
    } else {
      newRules = [
        ...currentRules,
        { type: "required", message: `${selectedField.label} is required` },
      ];
    }
    handleUpdateFieldProp("validationRules", newRules);
  };

  // Add option to select/multiselect
  const handleAddOption = () => {
    if (!selectedField) return;
    const currentOpts = selectedField.options || [];
    const optNum = currentOpts.length + 1;
    const newOpts: FormFieldOptionJSON[] = [
      ...currentOpts,
      { label: `Option ${optNum}`, value: `opt_${optNum}` },
    ];
    handleUpdateFieldProp("options", newOpts);
  };

  // Update option label/value
  const handleUpdateOption = (index: number, label: string, value: string) => {
    if (!selectedField || !selectedField.options) return;
    const newOpts = [...selectedField.options];
    newOpts[index] = { label, value };
    handleUpdateFieldProp("options", newOpts);
  };

  // Remove option
  const handleRemoveOption = (index: number) => {
    if (!selectedField || !selectedField.options) return;
    const newOpts = selectedField.options.filter((_, i) => i !== index);
    handleUpdateFieldProp("options", newOpts);
  };

  // Add visibility condition
  const handleAddCondition = () => {
    if (!selectedField) return;
    const currentConds = selectedField.visibilityConditions || [];
    const otherFields = fields.filter((f) => f.id !== selectedField.id);
    if (otherFields.length === 0) return;

    const newConds = [
      ...currentConds,
      { fieldId: otherFields[0].id, operator: "equals", value: true },
    ];
    handleUpdateFieldProp("visibilityConditions", newConds);
  };

  // Remove visibility condition
  const handleRemoveCondition = (index: number) => {
    if (!selectedField || !selectedField.visibilityConditions) return;
    const newConds = selectedField.visibilityConditions.filter((_, i) => i !== index);
    handleUpdateFieldProp("visibilityConditions", newConds);
  };

  // Save Draft Form
  const handleSaveDraft = async () => {
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      let saved: FormDefinitionJSON;
      if (initialForm) {
        saved = await formsApi.updateForm(formId, { title, description, fields });
      } else {
        saved = await formsApi.createForm({ id: formId, title, description, fields });
      }
      setStatus(saved.status);
      setVersion(saved.version);
      setSuccessMsg(`Form Draft saved successfully (v${saved.version})`);
      if (onSaved) onSaved(saved);
    } catch (err: any) {
      setError(err.message || "Failed to save form draft");
    } finally {
      setSaving(false);
    }
  };

  // Publish Form
  const handlePublish = async () => {
    setError(null);
    setSuccessMsg(null);
    setPublishing(true);
    try {
      // First save draft changes
      if (initialForm) {
        await formsApi.updateForm(formId, { title, description, fields });
      } else {
        await formsApi.createForm({ id: formId, title, description, fields });
      }
      // Then publish
      const published = await formsApi.publishForm(formId);
      setStatus(published.status);
      setVersion(published.version);
      setSuccessMsg(`Form Published successfully (Version ${published.version})`);
      if (onPublished) onPublished(published);
    } catch (err: any) {
      setError(err.message || "Failed to publish form");
    } finally {
      setPublishing(false);
    }
  };

  const currentFormJSON: FormDefinitionJSON = {
    id: formId,
    tenantId: initialForm?.tenantId || "tenant-default",
    title,
    description,
    status,
    version,
    fields,
    createdAt: initialForm?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <div id="form-builder-container" className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <input
              id="form-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Form Title..."
              className="text-lg font-bold text-white bg-slate-800 border border-slate-700 rounded px-3 py-1 focus:outline-none focus:border-indigo-500"
            />
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                status === "PUBLISHED"
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                  : "bg-amber-950 text-amber-400 border border-amber-800/60"
              }`}
            >
              {status} (v{version})
            </span>
          </div>
          <input
            id="form-description-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Form description or instructions..."
            className="w-full text-xs text-slate-400 bg-transparent border-b border-slate-800 focus:outline-none focus:border-slate-600 px-1 py-0.5"
          />
        </div>

        {/* Action Controls & Mode Toggle */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex text-xs">
            <button
              id="btn-mode-builder"
              onClick={() => setActiveTab("builder")}
              className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "builder" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Design Schema
            </button>
            <button
              id="btn-mode-preview"
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "preview" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live Preview
            </button>
          </div>

          <button
            id="btn-save-form-draft"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-indigo-400" />
            {saving ? "Saving..." : "Save Draft"}
          </button>

          <button
            id="btn-publish-form"
            onClick={handlePublish}
            disabled={saving || publishing}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {publishing ? "Publishing..." : "Publish Form"}
          </button>

          {onCancel && (
            <button
              id="btn-cancel-builder"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-950/80 border border-red-800/60 rounded-lg text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800/60 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Mode View: Live Preview vs Builder Layout */}
      {activeTab === "preview" ? (
        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              Interactive Form Submission Preview Mode
            </h3>
            <span className="text-xs text-slate-500">Form ID: {formId} &bull; v{version}</span>
          </div>
          <FormRenderer formDefinition={currentFormJSON} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Field Add Palette & Reorderable Field List (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Field Addition Palette */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Add Field Component
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(["text", "number", "boolean", "select", "multiselect", "date"] as const).map(
                  (fieldType) => (
                    <button
                      key={fieldType}
                      id={`btn-add-field-${fieldType}`}
                      onClick={() => handleAddField(fieldType)}
                      className="p-2.5 bg-slate-800/70 hover:bg-slate-800 text-slate-200 border border-slate-700/60 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-400" />
                      {fieldType.toUpperCase()}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Field List Container */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 pb-2">
                <span>Form Fields Structure ({fields.length})</span>
                <span>Select to Configure</span>
              </div>

              {fields.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No fields added yet. Click a field component above to start building.
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((field, idx) => {
                    const isSelected = field.id === selectedFieldId;
                    return (
                      <div
                        key={field.id}
                        id={`field-row-${field.id}`}
                        onClick={() => setSelectedFieldId(field.id)}
                        className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "bg-indigo-950/40 border-indigo-600 shadow-sm"
                            : "bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-indigo-400 font-semibold">
                              {field.id}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {field.type}
                            </span>
                            {field.validationRules?.some((r) => r.type === "required") && (
                              <span className="text-[10px] text-amber-400 font-bold">*Required</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-white">{field.label}</p>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            id={`btn-move-up-${field.id}`}
                            onClick={() => handleMoveField(idx, "up")}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                            title="Move Up"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            id={`btn-move-down-${field.id}`}
                            onClick={() => handleMoveField(idx, "down")}
                            disabled={idx === fields.length - 1}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                            title="Move Down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            id={`btn-delete-field-${field.id}`}
                            onClick={() => handleRemoveField(field.id)}
                            className="p-1 text-red-400 hover:text-red-300"
                            title="Delete Field"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Field Property Configuration Inspector (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-5">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
              <Settings className="w-4 h-4 text-indigo-400" />
              Field Properties Inspector
            </h4>

            {selectedField ? (
              <div className="space-y-4 text-xs">
                {/* Field ID */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">Field Key / ID</label>
                  <input
                    id="input-field-id"
                    type="text"
                    value={selectedField.id}
                    onChange={(e) => handleUpdateFieldProp("id", e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Field Label */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">Display Label</label>
                  <input
                    id="input-field-label"
                    type="text"
                    value={selectedField.label}
                    onChange={(e) => handleUpdateFieldProp("label", e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Placeholder & Help Text */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Placeholder</label>
                    <input
                      id="input-field-placeholder"
                      type="text"
                      value={selectedField.placeholder || ""}
                      onChange={(e) => handleUpdateFieldProp("placeholder", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Help Text</label>
                    <input
                      id="input-field-helptext"
                      type="text"
                      value={selectedField.helpText || ""}
                      onChange={(e) => handleUpdateFieldProp("helpText", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Validation Rules */}
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <label className="text-slate-300 font-semibold block">Validation Rules</label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      id="chk-field-required"
                      type="checkbox"
                      checked={selectedField.validationRules?.some((r) => r.type === "required") || false}
                      onChange={handleToggleRequired}
                      className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Mark as Required Field</span>
                  </label>
                </div>

                {/* Options for Select / Multiselect */}
                {(selectedField.type === "select" || selectedField.type === "multiselect") && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 font-semibold">Options List</label>
                      <button
                        id="btn-add-option"
                        onClick={handleAddOption}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        + Add Option
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {selectedField.options?.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => handleUpdateOption(oIdx, e.target.value, opt.value)}
                            placeholder="Label"
                            className="w-1/2 bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                          />
                          <input
                            type="text"
                            value={opt.value}
                            onChange={(e) => handleUpdateOption(oIdx, opt.label, e.target.value)}
                            placeholder="Value"
                            className="w-1/2 bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-300 font-mono"
                          />
                          <button
                            onClick={() => handleRemoveOption(oIdx)}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conditional Visibility Rules */}
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-semibold">Visibility Conditions</label>
                    <button
                      id="btn-add-condition"
                      onClick={handleAddCondition}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      + Add Condition
                    </button>
                  </div>

                  {selectedField.visibilityConditions && selectedField.visibilityConditions.length > 0 ? (
                    <div className="space-y-2">
                      {selectedField.visibilityConditions.map((cond, cIdx) => (
                        <div key={cIdx} className="p-2 bg-slate-800/80 rounded border border-slate-700/80 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 uppercase font-bold">Depends On:</span>
                            <button
                              onClick={() => handleRemoveCondition(cIdx)}
                              className="text-red-400 text-xs hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                          <select
                            value={cond.fieldId}
                            onChange={(e) => {
                              const newConds = [...(selectedField.visibilityConditions || [])];
                              newConds[cIdx] = { ...newConds[cIdx], fieldId: e.target.value };
                              handleUpdateFieldProp("visibilityConditions", newConds);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                          >
                            {fields
                              .filter((f) => f.id !== selectedField.id)
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.label} ({f.id})
                                </option>
                              ))}
                          </select>

                          <div className="flex gap-2">
                            <select
                              value={cond.operator}
                              onChange={(e) => {
                                const newConds = [...(selectedField.visibilityConditions || [])];
                                newConds[cIdx] = { ...newConds[cIdx], operator: e.target.value };
                                handleUpdateFieldProp("visibilityConditions", newConds);
                              }}
                              className="w-1/2 bg-slate-900 border border-slate-700 rounded p-1 text-white"
                            >
                              <option value="equals">Equals</option>
                              <option value="not_equals">Not Equals</option>
                            </select>
                            <input
                              type="text"
                              value={typeof cond.value === "string" ? cond.value : JSON.stringify(cond.value)}
                              onChange={(e) => {
                                const newConds = [...(selectedField.visibilityConditions || [])];
                                let val: any = e.target.value;
                                if (val === "true") val = true;
                                if (val === "false") val = false;
                                newConds[cIdx] = { ...newConds[cIdx], value: val };
                                handleUpdateFieldProp("visibilityConditions", newConds);
                              }}
                              placeholder="Value"
                              className="w-1/2 bg-slate-900 border border-slate-700 rounded p-1 text-white"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-[11px]">Always visible (no conditional rules)</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500">
                Select a field on the left to edit its properties.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

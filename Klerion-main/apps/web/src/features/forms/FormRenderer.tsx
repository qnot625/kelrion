import React, { useState, useEffect, useMemo } from "react";
import { CheckCircle2, AlertCircle, Save, Send, Loader2, Calendar } from "lucide-react";
import {
  formsApi,
  type FormDefinitionJSON,
  type FormFieldJSON,
  type FormSubmissionJSON,
  type FieldResponseJSON,
} from "./api.js";

interface FormRendererProps {
  formDefinition?: FormDefinitionJSON;
  formId?: string;
  initialSubmission?: FormSubmissionJSON;
  onSubmitted?: (submission: FormSubmissionJSON) => void;
  onDraftSaved?: (submission: FormSubmissionJSON) => void;
}

export const FormRenderer: React.FC<FormRendererProps> = ({
  formDefinition: propDefinition,
  formId,
  initialSubmission,
  onSubmitted,
  onDraftSaved,
}) => {
  const [definition, setDefinition] = useState<FormDefinitionJSON | null>(
    propDefinition || null
  );
  const [loading, setLoading] = useState<boolean>(!propDefinition && !!formId);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [savingDraft, setSavingDraft] = useState<boolean>(false);

  const [submissionId, setSubmissionId] = useState<string>(
    initialSubmission?.id || `sub-${Date.now().toString().slice(-4)}`
  );

  // Form Field values map: fieldId -> value
  const [values, setValues] = useState<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    if (initialSubmission?.responses) {
      for (const resp of initialSubmission.responses) {
        map[resp.fieldId] = resp.value;
      }
    }
    return map;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [successSubmission, setSuccessSubmission] = useState<FormSubmissionJSON | null>(
    initialSubmission?.status === "SUBMITTED" ? initialSubmission : null
  );

  // Fetch Form Definition if only formId passed
  useEffect(() => {
    if (propDefinition) {
      setDefinition(propDefinition);
      setLoading(false);
      return;
    }

    if (formId) {
      setLoading(true);
      formsApi
        .getForm(formId)
        .then((def) => {
          setDefinition(def);
          setLoading(false);
        })
        .catch((err) => {
          setApiError(err.message || "Failed to load form definition");
          setLoading(false);
        });
    }
  }, [propDefinition, formId]);

  // Evaluate Visibility Conditions
  const visibleFields = useMemo(() => {
    if (!definition?.fields) return [];

    return definition.fields.filter((field) => {
      if (!field.visibilityConditions || field.visibilityConditions.length === 0) {
        return true;
      }

      return field.visibilityConditions.every((cond) => {
        const dependentValue = values[cond.fieldId];
        switch (cond.operator) {
          case "equals":
            return dependentValue === cond.value;
          case "not_equals":
            return dependentValue !== cond.value;
          case "in":
            return Array.isArray(cond.value) && cond.value.includes(dependentValue);
          case "not_in":
            return Array.isArray(cond.value) && !cond.value.includes(dependentValue);
          default:
            return true;
        }
      });
    });
  }, [definition, values]);

  // Client-Side Field Validation
  const validateFields = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const field of visibleFields) {
      const val = values[field.id];
      const rules = field.validationRules || [];

      for (const rule of rules) {
        if (rule.type === "required") {
          if (
            val === undefined ||
            val === null ||
            val === "" ||
            (Array.isArray(val) && val.length === 0)
          ) {
            newErrors[field.id] = rule.message || `${field.label} is required`;
            break;
          }
        } else if (rule.type === "min_value" && typeof val === "number") {
          if (val < rule.value) {
            newErrors[field.id] = rule.message || `${field.label} must be at least ${rule.value}`;
            break;
          }
        } else if (rule.type === "max_value" && typeof val === "number") {
          if (val > rule.value) {
            newErrors[field.id] = rule.message || `${field.label} cannot exceed ${rule.value}`;
            break;
          }
        } else if (rule.type === "regex" && typeof val === "string" && val.length > 0) {
          try {
            const rx = new RegExp(rule.value);
            if (!rx.test(val)) {
              newErrors[field.id] = rule.message || `Invalid format for ${field.label}`;
              break;
            }
          } catch {
            // Ignore invalid regex string in client evaluation
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldValueChange = (fieldId: string, val: any) => {
    setValues((prev) => ({ ...prev, [fieldId]: val }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[fieldId];
        return copy;
      });
    }
  };

  const buildFieldResponses = (): FieldResponseJSON[] => {
    return visibleFields.map((f) => ({
      fieldId: f.id,
      value: values[f.id] !== undefined ? values[f.id] : null,
    }));
  };

  // Save Draft Submission
  const handleSaveDraft = async () => {
    if (!definition) return;
    setApiError(null);
    setSavingDraft(true);

    try {
      const sub = await formsApi.saveSubmissionDraft(definition.id, {
        submissionId,
        responses: buildFieldResponses(),
      });
      setSubmissionId(sub.id);
      if (onDraftSaved) onDraftSaved(sub);
    } catch (err: any) {
      setApiError(err.message || "Failed to save submission draft");
    } finally {
      setSavingDraft(false);
    }
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!definition) return;
    setApiError(null);

    const isValid = validateFields();
    if (!isValid) return;

    setSubmitting(true);
    try {
      const sub = await formsApi.submitForm(definition.id, {
        submissionId,
        responses: buildFieldResponses(),
      });
      setSuccessSubmission(sub);
      if (onSubmitted) onSubmitted(sub);
    } catch (err: any) {
      setApiError(err.message || "Failed to submit form");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div id="form-renderer-loading" className="p-8 text-center text-slate-400 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
        <p className="text-sm font-medium">Loading Form Schema...</p>
      </div>
    );
  }

  if (!definition) {
    return (
      <div id="form-renderer-error" className="p-6 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-sm flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>{apiError || "Form definition unavailable"}</span>
      </div>
    );
  }

  if (successSubmission) {
    return (
      <div id="form-submission-success-card" className="p-8 bg-slate-900 border border-slate-800 rounded-xl space-y-5 text-center">
        <div className="w-12 h-12 bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded-full flex items-center justify-center mx-auto shadow-md">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white">Form Submitted Successfully!</h3>
          <p className="text-xs text-slate-400">
            Submission Reference ID: <span className="font-mono text-indigo-400">{successSubmission.id}</span>
          </p>
        </div>
        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-left text-xs space-y-2">
          <div className="flex justify-between border-b border-slate-800 pb-1">
            <span className="text-slate-400 font-medium">Form Title:</span>
            <span className="text-slate-200 font-semibold">{definition.title}</span>
          </div>
          <div className="flex justify-between border-b border-slate-800 pb-1">
            <span className="text-slate-400 font-medium">Bound Schema Version:</span>
            <span className="text-slate-200 font-mono">v{successSubmission.formVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400 font-medium">Submitted At:</span>
            <span className="text-slate-200">{new Date(successSubmission.submittedAt || "").toLocaleString()}</span>
          </div>
        </div>
        <button
          id="btn-submit-another"
          onClick={() => {
            setSuccessSubmission(null);
            setSubmissionId(`sub-${Date.now().toString().slice(-4)}`);
            setValues({});
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
        >
          Submit Another Response
        </button>
      </div>
    );
  }

  return (
    <form id="form-renderer" onSubmit={handleSubmit} className="space-y-6">
      {/* Form Title & Description */}
      <div className="space-y-1.5 border-b border-slate-800 pb-4">
        <h2 id="renderer-form-title" className="text-xl font-bold text-white tracking-tight">
          {definition.title}
        </h2>
        {definition.description && (
          <p id="renderer-form-desc" className="text-xs text-slate-400">
            {definition.description}
          </p>
        )}
      </div>

      {apiError && (
        <div className="p-3.5 bg-red-950/80 border border-red-800/60 rounded-lg text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Dynamic Fields List */}
      <div className="space-y-5">
        {visibleFields.map((field) => {
          const val = values[field.id];
          const err = errors[field.id];
          const isRequired = field.validationRules?.some((r) => r.type === "required");

          return (
            <div key={field.id} id={`form-field-group-${field.id}`} className="space-y-2">
              <label htmlFor={`input-${field.id}`} className="block text-xs font-semibold text-slate-300">
                {field.label} {isRequired && <span className="text-amber-400 font-bold">*</span>}
              </label>

              {/* Render Field Input by Type */}
              {field.type === "text" && (
                <input
                  id={`input-${field.id}`}
                  type="text"
                  value={val || ""}
                  onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                  placeholder={field.placeholder || ""}
                  className={`w-full bg-slate-900 border rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-1 ${
                    err
                      ? "border-red-600 focus:border-red-500 focus:ring-red-500/20"
                      : "border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/20"
                  }`}
                />
              )}

              {field.type === "number" && (
                <input
                  id={`input-${field.id}`}
                  type="number"
                  value={val !== undefined && val !== null ? val : ""}
                  onChange={(e) =>
                    handleFieldValueChange(
                      field.id,
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                  placeholder={field.placeholder || "0"}
                  className={`w-full bg-slate-900 border rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-1 ${
                    err
                      ? "border-red-600 focus:border-red-500 focus:ring-red-500/20"
                      : "border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/20"
                  }`}
                />
              )}

              {field.type === "boolean" && (
                <label className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer">
                  <input
                    id={`input-${field.id}`}
                    type="checkbox"
                    checked={!!val}
                    onChange={(e) => handleFieldValueChange(field.id, e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    {field.helpText || "Check to confirm"}
                  </span>
                </label>
              )}

              {field.type === "select" && (
                <select
                  id={`input-${field.id}`}
                  value={val || ""}
                  onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                  className={`w-full bg-slate-900 border rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-1 ${
                    err
                      ? "border-red-600 focus:border-red-500 focus:ring-red-500/20"
                      : "border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/20"
                  }`}
                >
                  <option value="">-- Select an option --</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {field.type === "multiselect" && (
                <div className="space-y-1.5 p-3 bg-slate-900 border border-slate-800 rounded-lg max-h-44 overflow-y-auto">
                  {field.options?.map((opt) => {
                    const currentArray = Array.isArray(val) ? val : [];
                    const isChecked = currentArray.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let next: string[];
                            if (e.target.checked) {
                              next = [...currentArray, opt.value];
                            } else {
                              next = currentArray.filter((v: string) => v !== opt.value);
                            }
                            handleFieldValueChange(field.id, next);
                          }}
                          className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {field.type === "date" && (
                <div className="relative">
                  <input
                    id={`input-${field.id}`}
                    type="date"
                    value={val || ""}
                    onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                    className={`w-full bg-slate-900 border rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-1 ${
                      err
                        ? "border-red-600 focus:border-red-500 focus:ring-red-500/20"
                        : "border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/20"
                    }`}
                  />
                  <Calendar className="w-4 h-4 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              )}

              {/* Help text */}
              {field.helpText && field.type !== "boolean" && (
                <p className="text-[11px] text-slate-500">{field.helpText}</p>
              )}

              {/* Validation error message */}
              {err && <p className="text-[11px] text-red-400 font-semibold">{err}</p>}
            </div>
          );
        })}
      </div>

      {/* Form Submission Actions */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
        <button
          id="btn-renderer-save-draft"
          type="button"
          onClick={handleSaveDraft}
          disabled={savingDraft || submitting}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-indigo-400" />}
          <span>{savingDraft ? "Saving Draft..." : "Save Progress as Draft"}</span>
        </button>

        <button
          id="btn-renderer-submit"
          type="submit"
          disabled={submitting || savingDraft}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span>{submitting ? "Submitting..." : "Submit Form Response"}</span>
        </button>
      </div>
    </form>
  );
};

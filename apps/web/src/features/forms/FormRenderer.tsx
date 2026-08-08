import { CheckCircle2, FileUp, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { formsApi, type ApiFieldResponse, type ApiFormDefinition, type ApiFormField } from "./formsApi";

function visible(field: ApiFormField, values: Record<string, unknown>) {
  return (field.visibilityConditions ?? []).every((condition) => {
    const source = values[condition.fieldId];
    switch (condition.operator) {
      case "equals": return String(source) === String(condition.value);
      case "not_equals": return String(source) !== String(condition.value);
      case "contains": return Array.isArray(source)
        ? source.some((value) => String(value) === String(condition.value))
        : String(source ?? "").includes(String(condition.value));
      case "greater_than": return Number(source) > Number(condition.value);
      case "less_than": return Number(source) < Number(condition.value);
    }
  });
}

function calculate(field: ApiFormField, values: Record<string, unknown>) {
  const rule = field.calculation;
  if (!rule) return values[field.id];
  const inputs = rule.fieldIds.map((id) => values[id]);
  switch (rule.operator) {
    case "concat": return inputs.map((value) => String(value ?? "")).join(rule.separator ?? " ");
    case "sum": return inputs.reduce<number>((total, value) => total + Number(value ?? 0), 0);
    case "difference": return inputs.slice(1).reduce<number>((total, value) => total - Number(value ?? 0), Number(inputs[0] ?? 0));
    case "product": return inputs.reduce<number>((total, value) => total * Number(value ?? 0), 1);
    case "quotient": return inputs.slice(1).reduce<number>((total, value) => Number(value) === 0 ? Number.NaN : total / Number(value), Number(inputs[0] ?? 0));
  }
}

function required(field: ApiFormField) {
  return Boolean(field.validationRules?.some((rule) => rule.type === "required"));
}

export function FormRenderer({
  session,
  form,
  preview = false,
  onSubmitted,
}: {
  readonly session?: KlerionSession;
  readonly form: ApiFormDefinition;
  readonly preview?: boolean;
  readonly onSubmitted?: () => void;
}) {
  const initial = Object.fromEntries(form.fields.map((field) => [field.id, field.defaultValue ?? (field.type === "boolean" ? false : "")]));
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeSave = useRef(0);

  const calculatedValues = useMemo(() => {
    const next = { ...values };
    for (const field of form.fields) if (field.type === "calculated") next[field.id] = calculate(field, next);
    return next;
  }, [form.fields, values]);

  const responses = useMemo<ApiFieldResponse[]>(
    () => form.fields.map((field) => ({ fieldId: field.id, value: calculatedValues[field.id] })),
    [calculatedValues, form.fields],
  );

  function update(fieldId: string, value: unknown) {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setDirty(true);
    setMessage("");
    setError("");
  }

  async function saveDraft() {
    if (!session || preview || form.status !== "PUBLISHED") return null;
    const saveId = ++activeSave.current;
    setSaving(true);
    try {
      const saved = submissionId
        ? await formsApi.saveDraft(session, submissionId, responses)
        : await formsApi.createDraft(session, form.id, responses);
      if (saveId === activeSave.current) {
        setSubmissionId(saved.id);
        setDirty(false);
        setMessage("Draft saved");
      }
      return saved;
    } catch (caught) {
      if (saveId === activeSave.current) setError(caught instanceof Error ? caught.message : "Could not save draft");
      return null;
    } finally {
      if (saveId === activeSave.current) setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty || preview || !session || form.status !== "PUBLISHED") return;
    const timer = window.setTimeout(() => { void saveDraft(); }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, responses, session?.token, form.id, form.status, preview]);

  async function submit() {
    if (!session || preview) return;
    setSubmitting(true);
    setError("");
    try {
      let id = submissionId;
      if (!id) {
        const draft = await formsApi.createDraft(session, form.id, responses);
        id = draft.id;
        setSubmissionId(id);
      }
      await formsApi.submit(session, id, responses);
      setDirty(false);
      setMessage("Submitted successfully");
      onSubmitted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit form");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dynamic-form">
      {form.fields.filter((field) => visible(field, calculatedValues)).map((field) => (
        <label key={field.id} className="dynamic-form-field">
          <span>{field.label}{required(field) && <b> *</b>}</span>
          {field.helpText && <small>{field.helpText}</small>}
          {field.type === "textarea" ? (
            <textarea value={String(calculatedValues[field.id] ?? "")} placeholder={field.placeholder} onChange={(event) => update(field.id, event.target.value)} />
          ) : field.type === "boolean" ? (
            <span className="form-checkbox"><input type="checkbox" checked={Boolean(calculatedValues[field.id])} onChange={(event) => update(field.id, event.target.checked)} /> Yes</span>
          ) : field.type === "select" ? (
            <select value={String(calculatedValues[field.id] ?? "")} onChange={(event) => update(field.id, event.target.value)}>
              <option value="">Select…</option>
              {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : field.type === "multiselect" ? (
            <select multiple value={Array.isArray(calculatedValues[field.id]) ? calculatedValues[field.id] as string[] : []} onChange={(event) => update(field.id, [...event.currentTarget.selectedOptions].map((option) => option.value))}>
              {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : field.type === "file" ? (
            <span className="file-field"><FileUp size={16} /><input type="file" onChange={(event) => {
              const file = event.target.files?.[0];
              update(field.id, file ? { id: crypto.randomUUID(), fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, capturedAt: new Date().toISOString() } : null);
            }} /></span>
          ) : field.type === "calculated" ? (
            <input readOnly value={Number.isNaN(calculatedValues[field.id]) ? "Invalid calculation" : String(calculatedValues[field.id] ?? "")} />
          ) : (
            <input
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={String(calculatedValues[field.id] ?? "")}
              placeholder={field.placeholder}
              onChange={(event) => update(field.id, field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)}
            />
          )}
        </label>
      ))}

      {!preview && session && (
        <div className="dynamic-form-actions">
          <span>{saving ? <><Loader2 size={14} className="spin" /> Saving draft…</> : message}</span>
          <button className="secondary" type="button" onClick={() => void saveDraft()} disabled={saving || submitting}><Save size={15} /> Save draft</button>
          <button className="primary" type="button" onClick={() => void submit()} disabled={saving || submitting}>{submitting ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Submit</button>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

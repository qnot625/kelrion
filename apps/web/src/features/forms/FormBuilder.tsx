import { ArrowDown, ArrowUp, Eye, Plus, Save, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { formsApi, type ApiFormDefinition, type ApiFormField, type ApiFormFieldType } from "./formsApi";
import { FormRenderer } from "./FormRenderer";

const FIELD_TYPES: readonly ApiFormFieldType[] = ["text", "textarea", "number", "boolean", "date", "select", "multiselect", "file", "signature", "calculated"];

function newField(type: ApiFormFieldType, index: number): ApiFormField {
  const id = `field_${Date.now()}_${index}`;
  return {
    id,
    label: type === "calculated" ? "Calculated value" : "New field",
    type,
    helpText: "",
    placeholder: "",
    options: type === "select" || type === "multiselect" ? [{ label: "Option 1", value: "option_1" }] : [],
    validationRules: [],
    visibilityConditions: [],
    calculation: type === "calculated" ? { operator: "sum", fieldIds: [] } : null,
  };
}

export function FormBuilder({
  session,
  initial,
  onSaved,
  onClose,
}: {
  readonly session: KlerionSession;
  readonly initial?: ApiFormDefinition;
  readonly onSaved: (form: ApiFormDefinition) => void;
  readonly onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "Untitled form");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [locale, setLocale] = useState(initial?.locale ?? "en");
  const [templateKey, setTemplateKey] = useState(initial?.templateKey ?? "");
  const [fields, setFields] = useState<ApiFormField[]>(initial ? [...initial.fields] : [newField("text", 0)]);
  const [selectedId, setSelectedId] = useState(fields[0]?.id ?? "");
  const [preview, setPreview] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const selected = fields.find((field) => field.id === selectedId) ?? null;

  const previewForm = useMemo<ApiFormDefinition>(() => ({
    id: initial?.id ?? "preview-form",
    tenantId: initial?.tenantId ?? "preview-tenant",
    title,
    description,
    status: "PUBLISHED",
    version: initial?.version ?? 1,
    fields,
    locale,
    templateKey: templateKey || null,
    createdAt: initial?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  }), [description, fields, initial, locale, templateKey, title]);

  function patchSelected(patch: Partial<ApiFormField>) {
    if (!selected) return;
    setFields((current) => current.map((field) => field.id === selected.id ? { ...field, ...patch } : field));
  }

  function add(type: ApiFormFieldType) {
    const base = newField(type, fields.length);
    const field: ApiFormField = type === "calculated"
      ? { ...base, calculation: { operator: "sum", fieldIds: fields.filter((item) => item.type === "number").map((item) => item.id).slice(0, 2) } }
      : base;
    setFields((current) => [...current, field]);
    setSelectedId(field.id);
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= fields.length) return;
    const next = [...fields];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setFields(next);
  }

  function remove(id: string) {
    const next = fields.filter((field) => field.id !== id).map((field) => ({
      ...field,
      visibilityConditions: field.visibilityConditions?.filter((condition) => condition.fieldId !== id),
      calculation: field.calculation ? { ...field.calculation, fieldIds: field.calculation.fieldIds.filter((source) => source !== id) } : null,
    }));
    setFields(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? "");
  }

  async function save(publish: boolean) {
    setWorking(true);
    setError("");
    try {
      let saved = initial
        ? await formsApi.updateForm(session, initial.id, { title, description, fields, locale, templateKey: templateKey || null })
        : await formsApi.createForm(session, { title, description, fields, locale, templateKey: templateKey || null });
      if (publish) saved = await formsApi.publishForm(session, saved.id);
      onSaved(saved);
      if (publish) onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save form");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="panel forms-builder">
      <header className="forms-builder-header">
        <div>
          <span className="eyebrow">Schema builder</span>
          <input className="forms-title-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} />
          <input className="forms-description-input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Instructions or purpose" maxLength={500} />
        </div>
        <div className="forms-builder-actions">
          <button className="secondary" type="button" onClick={() => setPreview((value) => !value)}><Eye size={15} /> {preview ? "Edit schema" : "Preview"}</button>
          <button className="secondary" type="button" disabled={working} onClick={() => void save(false)}><Save size={15} /> Save draft</button>
          <button className="primary" type="button" disabled={working} onClick={() => void save(true)}><Send size={15} /> Publish</button>
          <button className="text-button" type="button" onClick={onClose}>Close</button>
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}

      {preview ? (
        <div className="forms-preview"><div className="stack"><h2>{title}</h2><p>{description}</p></div><FormRenderer form={previewForm} preview /></div>
      ) : (
        <div className="forms-builder-grid">
          <aside className="forms-palette">
            <strong>Add field</strong>
            <div className="forms-field-types">{FIELD_TYPES.map((type) => <button type="button" key={type} onClick={() => add(type)}><Plus size={13} />{type.replaceAll("_", " ")}</button>)}</div>
            <hr />
            <label>Locale<input value={locale} onChange={(event) => setLocale(event.target.value)} placeholder="en-NG" /></label>
            <label>Template key<input value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} placeholder="expense-request" /></label>
          </aside>

          <div className="forms-schema-list">
            <strong>Fields · {fields.length}</strong>
            {fields.map((field, index) => (
              <article key={field.id} className={field.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(field.id)}>
                <div><b>{field.label}</b><small>{field.id} · {field.type}</small></div>
                <div className="row-actions">
                  <button type="button" aria-label="Move up" onClick={(event) => { event.stopPropagation(); move(index, -1); }}><ArrowUp size={14} /></button>
                  <button type="button" aria-label="Move down" onClick={(event) => { event.stopPropagation(); move(index, 1); }}><ArrowDown size={14} /></button>
                  <button type="button" aria-label="Delete field" onClick={(event) => { event.stopPropagation(); remove(field.id); }}><Trash2 size={14} /></button>
                </div>
              </article>
            ))}
            {fields.length === 0 && <div className="empty-state">Add at least one field before publishing.</div>}
          </div>

          <aside className="forms-inspector">
            <strong>Field settings</strong>
            {!selected ? <div className="empty-state">Select a field to edit it.</div> : <>
              <label>Label<input value={selected.label} onChange={(event) => patchSelected({ label: event.target.value })} /></label>
              <label>Field ID<input value={selected.id} onChange={(event) => {
                const nextId = event.target.value.replace(/[^a-zA-Z0-9_-]/g, "_");
                const oldId = selected.id;
                setFields((current) => current.map((field) => {
                  if (field.id === oldId) return { ...field, id: nextId };
                  return {
                    ...field,
                    visibilityConditions: field.visibilityConditions?.map((condition) => condition.fieldId === oldId ? { ...condition, fieldId: nextId } : condition),
                    calculation: field.calculation ? { ...field.calculation, fieldIds: field.calculation.fieldIds.map((source) => source === oldId ? nextId : source) } : null,
                  };
                }));
                setSelectedId(nextId);
              }} /></label>
              <label>Type<select value={selected.type} onChange={(event) => patchSelected({ type: event.target.value as ApiFormFieldType })}>{FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label>Help text<input value={selected.helpText ?? ""} onChange={(event) => patchSelected({ helpText: event.target.value })} /></label>
              <label>Placeholder<input value={selected.placeholder ?? ""} onChange={(event) => patchSelected({ placeholder: event.target.value })} /></label>
              <label className="form-checkbox"><input type="checkbox" checked={Boolean(selected.validationRules?.some((rule) => rule.type === "required"))} onChange={(event) => patchSelected({ validationRules: event.target.checked ? [...(selected.validationRules?.filter((rule) => rule.type !== "required") ?? []), { type: "required", message: `${selected.label} is required` }] : selected.validationRules?.filter((rule) => rule.type !== "required") })} /> Required</label>

              {(selected.type === "select" || selected.type === "multiselect") && <label>Options <small>One per line: Label|value</small><textarea value={(selected.options ?? []).map((option) => `${option.label}|${option.value}`).join("\n")} onChange={(event) => patchSelected({ options: event.target.value.split("\n").filter(Boolean).map((line) => { const [label, value] = line.split("|"); return { label: label?.trim() || "Option", value: value?.trim() || label?.trim() || "option" }; }) })} /></label>}

              <fieldset>
                <legend>Conditional visibility</legend>
                <label>Controlled by<select value={selected.visibilityConditions?.[0]?.fieldId ?? ""} onChange={(event) => patchSelected({ visibilityConditions: event.target.value ? [{ fieldId: event.target.value, operator: "equals", value: true }] : [] })}><option value="">Always visible</option>{fields.filter((field) => field.id !== selected.id).map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
                {selected.visibilityConditions?.[0] && <><label>Operator<select value={selected.visibilityConditions[0].operator} onChange={(event) => patchSelected({ visibilityConditions: [{ ...selected.visibilityConditions![0]!, operator: event.target.value as "equals" | "not_equals" | "contains" | "greater_than" | "less_than" }] })}><option value="equals">Equals</option><option value="not_equals">Not equals</option><option value="contains">Contains</option><option value="greater_than">Greater than</option><option value="less_than">Less than</option></select></label><label>Value<input value={String(selected.visibilityConditions[0].value)} onChange={(event) => patchSelected({ visibilityConditions: [{ ...selected.visibilityConditions![0]!, value: event.target.value }] })} /></label></>}
              </fieldset>

              {selected.type === "calculated" && <fieldset><legend>Calculation</legend><label>Operation<select value={selected.calculation?.operator ?? "sum"} onChange={(event) => patchSelected({ calculation: { operator: event.target.value as "sum" | "difference" | "product" | "quotient" | "concat", fieldIds: selected.calculation?.fieldIds ?? [] } })}><option value="sum">Sum</option><option value="difference">Difference</option><option value="product">Product</option><option value="quotient">Quotient</option><option value="concat">Concatenate</option></select></label><label>Source fields<select multiple value={[...(selected.calculation?.fieldIds ?? [])]} onChange={(event) => patchSelected({ calculation: { operator: selected.calculation?.operator ?? "sum", fieldIds: [...event.currentTarget.selectedOptions].map((option) => option.value) } })}>{fields.filter((field) => field.id !== selected.id).map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label></fieldset>}
            </>}
          </aside>
        </div>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BlobProvider } from "@react-pdf/renderer";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DefaultReportTemplate } from "@/pdf/DefaultReportTemplate";
import { sampleData } from "@/pdf/sampleData";
import { validate, type TemplateConfig } from "@shared/template-config";
import type { TemplateRow } from "@shared/api";

const DEFAULT_CONFIG: TemplateConfig = {
  headerText: "",
  footerText: "",
  signatureLine: "",
  fontFamily: "Inter",
  fontSize: 11,
  accentColor: "#0f766e",
  sections: { logo: true, doctorInfo: true, parametersTable: true, abnormalLegend: true, disclaimer: true },
  columns: { testName: true, result: true, unit: true, referenceRange: true, flag: true, comments: false },
};

const SECTION_LABELS: Record<keyof TemplateConfig["sections"], string> = {
  logo: "Logo",
  doctorInfo: "Doctor info",
  parametersTable: "Parameters table",
  abnormalLegend: "Abnormal legend",
  disclaimer: "Disclaimer",
};

const COLUMN_LABELS: Record<keyof TemplateConfig["columns"], string> = {
  testName: "Test name",
  result: "Result",
  unit: "Unit",
  referenceRange: "Reference range",
  flag: "Flag",
  comments: "Comments",
};

const VALIDATION_LABELS: Record<string, string> = {
  headerText: "Header text",
  footerText: "Footer text",
  signatureLine: "Pathologist signature line",
  fontFamily: "Font family",
  fontSize: "Base font size (must be between 10 and 14)",
  accentColor: "Accent color (must be #RRGGBB)",
  sections: "Section toggles",
  columns: "Column visibility",
};

function friendlyValidationError(key: string): string {
  if (VALIDATION_LABELS[key]) return `Invalid: ${VALIDATION_LABELS[key]}`;
  if (key.startsWith("sections.")) return `Invalid section toggle: ${key.slice("sections.".length)}`;
  if (key.startsWith("columns.")) return `Invalid column toggle: ${key.slice("columns.".length)}`;
  return `Invalid: ${key}`;
}

function friendlySaveError(err: unknown): string {
  const code = (err as any)?.code as string | undefined;
  const message = (err as any)?.message as string | undefined;
  switch (code ?? message) {
    case "INVALID_INPUT": return "Template configuration is invalid. Please review the form.";
    case "NOT_FOUND":     return "This template no longer exists.";
    default:              return message ?? "Failed to save template.";
  }
}

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => call<TemplateRow[]>("templates:list"),
  });

  const existing = useMemo(
    () => (isNew ? null : templates?.find((t) => t.id === id) ?? null),
    [templates, id, isNew]
  );

  const [name, setName] = useState<string>("");
  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_CONFIG);
  const [seeded, setSeeded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [validationKey, setValidationKey] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Seed form once data is available.
  useEffect(() => {
    if (seeded) return;
    if (isNew) {
      setName("Untitled template");
      setConfig(DEFAULT_CONFIG);
      setSeeded(true);
      return;
    }
    if (existing) {
      setName(existing.name);
      try {
        const parsed = JSON.parse(existing.config);
        const v = validate(parsed);
        setConfig(v.ok ? v.value : DEFAULT_CONFIG);
      } catch {
        setConfig(DEFAULT_CONFIG);
      }
      setSeeded(true);
    }
  }, [isNew, existing, seeded]);

  // Debounced preview config — re-renders the right pane 300ms after the form
  // settles. This keeps typing in the form snappy and avoids regenerating the
  // PDF on every keystroke.
  const [previewConfig, setPreviewConfig] = useState<TemplateConfig>(config);
  useEffect(() => {
    const timer = setTimeout(() => setPreviewConfig(config), 300);
    return () => clearTimeout(timer);
  }, [config]);

  function update(patch: Partial<TemplateConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
    setDirty(true);
    setSavedFlash(false);
  }
  function updateSection(k: keyof TemplateConfig["sections"], v: boolean) {
    setConfig((c) => ({ ...c, sections: { ...c.sections, [k]: v } }));
    setDirty(true);
    setSavedFlash(false);
  }
  function updateColumn(k: keyof TemplateConfig["columns"], v: boolean) {
    setConfig((c) => ({ ...c, columns: { ...c.columns, [k]: v } }));
    setDirty(true);
    setSavedFlash(false);
  }
  function updateName(v: string) {
    setName(v);
    setDirty(true);
    setSavedFlash(false);
  }

  const save = useMutation({
    mutationFn: async () => {
      const v = validate(config);
      if (!v.ok) {
        setValidationKey(v.error);
        throw new Error("INVALID_INPUT");
      }
      setValidationKey(null);
      const trimmedName = name.trim() || "Untitled template";
      const result = await call<TemplateRow>("templates:save", {
        id: existing?.id,
        name: trimmedName,
        config: v.value,
      });
      return result;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      if (isNew && saved?.id) {
        navigate(`/templates/${saved.id}`, { replace: true });
      }
    },
    onError: (err) => {
      const code = (err as any)?.code as string | undefined;
      const message = (err as any)?.message as string | undefined;
      if ((code ?? message) === "INVALID_INPUT") return; // already surfaced inline via validationKey
      setPageError(friendlySaveError(err));
    },
  });

  const setDefault = useMutation({
    mutationFn: () => call("templates:setDefault", { id: existing!.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (err) => setPageError(friendlySaveError(err)),
  });

  const duplicate = useMutation({
    mutationFn: () => call<TemplateRow>("templates:duplicate", { id: existing!.id }),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      if (copy?.id) navigate(`/templates/${copy.id}`);
    },
    onError: (err) => setPageError(friendlySaveError(err)),
  });

  // While loading the existing template (edit page), show a placeholder.
  if (!isNew && isLoading) {
    return <div className="p-6 text-slate-500">Loading template…</div>;
  }
  if (!isNew && !existing && !isLoading) {
    return (
      <div className="p-6">
        <p className="text-slate-700">Template not found.</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate("/templates")}>
          Back to templates
        </Button>
      </div>
    );
  }

  const canSave = dirty && name.trim().length > 0;

  return (
    <div className="-m-6 flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 border-b bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate("/templates")}>Back</Button>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            placeholder="Template name"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            style={{ minWidth: 240 }}
          />
          {existing?.isDefault && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
              Default
            </span>
          )}
          {savedFlash && <span className="text-sm text-emerald-700">Saved</span>}
        </div>
        <div className="flex items-center gap-2">
          {existing && !existing.isDefault && (
            <Button
              variant="secondary"
              disabled={setDefault.isPending}
              onClick={() => setDefault.mutate()}
            >
              Set as default
            </Button>
          )}
          {existing && (
            <Button
              variant="secondary"
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate()}
            >
              Duplicate
            </Button>
          )}
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {pageError && (
        <div className="border-b bg-red-50 px-6 py-2 text-sm text-danger">
          {pageError}
          <button className="ml-3 underline" onClick={() => setPageError(null)}>dismiss</button>
        </div>
      )}
      {validationKey && (
        <div className="border-b bg-amber-50 px-6 py-2 text-sm text-amber-800">
          {friendlyValidationError(validationKey)}
        </div>
      )}

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane — form */}
        <div className="w-2/5 overflow-auto border-r bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Configuration</h2>

          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Header text</span>
              <textarea
                rows={2}
                value={config.headerText}
                onChange={(e) => update({ headerText: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Footer text</span>
              <textarea
                rows={2}
                value={config.footerText}
                onChange={(e) => update({ footerText: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </label>

            <Input
              label="Pathologist signature line"
              value={config.signatureLine}
              onChange={(e) => update({ signatureLine: e.target.value })}
              placeholder="e.g. Dr. P. C. Du, MD (Pathology)"
            />

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Font family</span>
              <select
                value={config.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value as TemplateConfig["fontFamily"] })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Inter">Inter</option>
                <option value="Times">Times</option>
                <option value="Georgia">Georgia</option>
              </select>
            </label>

            <Input
              label="Base font size"
              type="number"
              min={10}
              max={14}
              value={config.fontSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                update({ fontSize: Number.isFinite(n) ? n : config.fontSize });
              }}
            />

            <div className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Accent color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.accentColor}
                  onChange={(e) => update({ accentColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                  aria-label="Accent color picker"
                />
                <input
                  type="text"
                  value={config.accentColor}
                  onChange={(e) => update({ accentColor: e.target.value })}
                  placeholder="#0f766e"
                  className="w-32 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </div>

            <fieldset className="rounded-md border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-700">Sections</legend>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(Object.keys(SECTION_LABELS) as Array<keyof TemplateConfig["sections"]>).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.sections[k]}
                      onChange={(e) => updateSection(k, e.target.checked)}
                    />
                    <span>{SECTION_LABELS[k]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-md border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-700">Result-table columns</legend>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(Object.keys(COLUMN_LABELS) as Array<keyof TemplateConfig["columns"]>).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.columns[k]}
                      onChange={(e) => updateColumn(k, e.target.checked)}
                    />
                    <span>{COLUMN_LABELS[k]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        {/* Right pane — live preview */}
        <div className="flex w-3/5 flex-col bg-slate-100">
          <div className="border-b bg-white px-4 py-2 text-sm font-medium text-slate-700">
            Live preview
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <PdfPreview config={previewConfig} />
          </div>
        </div>
      </div>
    </div>
  );
}

// We use BlobProvider + iframe rather than @react-pdf's PDFViewer because
// PDFViewer renders inside an iframe at a fixed default size that's awkward to
// control from CSS. BlobProvider gives us a blob URL we can drop into an
// iframe we size ourselves with flexbox.
function PdfPreview({ config }: { config: TemplateConfig }) {
  // The doc is keyed by a stable JSON snapshot so React only re-renders the
  // BlobProvider tree when the deferred config actually changes.
  const doc = useMemo(
    () => <DefaultReportTemplate data={sampleData} config={config} />,
    [config]
  );
  return (
    <BlobProvider document={doc}>
      {({ url, loading, error }) => {
        if (error) {
          return (
            <div className="flex h-full items-center justify-center text-sm text-danger">
              Preview failed: {error.message}
            </div>
          );
        }
        if (loading || !url) {
          return (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Rendering preview…
            </div>
          );
        }
        return (
          <iframe
            title="Template preview"
            src={url}
            className="h-full w-full rounded border bg-white"
          />
        );
      }}
    </BlobProvider>
  );
}

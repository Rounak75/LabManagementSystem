import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import type { TemplateRow } from "@shared/api";

export default function ReportPreview() {
  const { visitId } = useParams<{ visitId: string }>();
  const nav = useNavigate();

  const { data: templates } = useQuery<TemplateRow[]>({
    queryKey: ["templates"],
    queryFn: () => call<TemplateRow[]>("templates:list"),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => call<any>("settings:get"),
  });

  // Selected template — defaults to the lab's default template, but the user
  // may switch to any other template at print time. Selection is NOT
  // persisted on the visit; refreshing the page resets to the default.
  const [templateId, setTemplateId] = useState<string | undefined>();

  useEffect(() => {
    if (templateId) return;
    const def = settings?.defaultTemplateId
      ?? templates?.find(t => t.isDefault)?.id
      ?? templates?.[0]?.id;
    if (def) setTemplateId(def);
  }, [settings, templates, templateId]);

  const { data, isLoading } = useQuery({
    queryKey: ["report", visitId, templateId],
    enabled: !!visitId && !!templateId,
    queryFn: () => call<{ path: string; base64: string }>("reports:generatePdf", { visitId, templateId }),
  });

  const print = useMutation({
    mutationFn: () => call<boolean>("reports:print", { visitId, templateId }),
  });

  const dataUrl = useMemo(() => data ? `data:application/pdf;base64,${data.base64}` : "", [data]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Report preview</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Template:</label>
          <select
            value={templateId ?? ""}
            onChange={(e) => setTemplateId(e.target.value || undefined)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            disabled={!templates || templates.length === 0}
          >
            {(templates ?? []).map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => nav(-1)}>Back</Button>
          <Button onClick={() => print.mutate()} disabled={!data}>
            {print.isPending ? "Opening print…" : "Print"}
          </Button>
        </div>
      </div>
      {isLoading ? <div className="text-slate-500">Generating PDF…</div> :
        <iframe title="Report" src={dataUrl} className="flex-1 rounded border" />}
    </div>
  );
}

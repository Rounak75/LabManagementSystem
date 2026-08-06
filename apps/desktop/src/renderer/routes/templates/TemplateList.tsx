import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, EmptyIcons } from "@/components/ui/EmptyState";
import type { TemplateRow } from "@shared/api";
import { labDateTime } from "@shared/lab-date";

function formatDateTime(d: string): string {
  try {
    const dt = new Date(d);
    return labDateTime(dt);
  } catch {
    return d;
  }
}

export default function TemplateList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pageError, setPageError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => call<TemplateRow[]>("templates:list"),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => call("templates:setDefault", { id }),
    onSuccess: () => {
      setPageError(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err: any) => setPageError(err.message || "Failed to set default template"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => call("templates:delete", { id }),
    onSuccess: () => {
      setDeletingId(null);
      setPageError(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err: any) => setPageError(err.message || "Failed to delete template"),
  });

  return (
    <div>
      <PageHeader 
        title="Report templates" 
        subtitle="Manage the PDF layouts used for printing test results."
        actions={<Button onClick={() => navigate("/templates/new")}>Create template</Button>}
      />

      {pageError && (
        <div className="mb-4 rounded-md border border-danger/30 bg-red-50 p-3 text-sm text-danger flex items-center justify-between">
          <span>{pageError}</span>
          <button className="underline hover:text-red-700" onClick={() => setPageError(null)}>Dismiss</button>
        </div>
      )}

      <Card noPadding>
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading templates...</div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={EmptyIcons.templates || EmptyIcons.home}
            title="No templates found"
            description="Create a template to customize how your lab reports look."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Margin</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Paper Size</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => {
                  let parsedConfig = { margins: { top: 0, right: 0, bottom: 0, left: 0 } };
                  try {
                    parsedConfig = JSON.parse(t.config);
                  } catch (e) {}
                  return (
                  <tr key={t.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600">{parsedConfig.margins?.top} {parsedConfig.margins?.right} {parsedConfig.margins?.bottom} {parsedConfig.margins?.left} (mm)</td>
                    <td className="px-4 py-3 text-slate-600">A4</td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={t.isDefault ? "success" : "neutral"}>
                        {t.isDefault ? "Default" : "Inactive"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={t.isDefault || setDefault.isPending}
                          title={t.isDefault ? "Already the default template" : "Set as default"}
                          onClick={() => setDefault.mutate(t.id)}
                        >
                          Make default
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/templates/${t.id}`)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/10 hover:text-danger"
                          disabled={t.isDefault}
                          onClick={() => setDeletingId(t.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {deletingId && (
        <Modal open onClose={() => setDeletingId(null)} title="Delete template">
          <div className="p-1">
            <p className="text-sm text-slate-700 mb-6">
              Are you sure you want to delete this template? Any historical reports generated with this template
              will remain unchanged, but it will no longer be available for new reports.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(deletingId)}>
                Delete Template
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

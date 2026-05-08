import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import type { TemplateRow } from "@shared/api";

function friendlyError(err: unknown): string {
  const code = (err as any)?.code as string | undefined;
  const message = (err as any)?.message as string | undefined;
  switch (code ?? message) {
    case "TEMPLATE_IN_USE":
      return "You can't delete the default template. Set a different template as default first.";
    case "NOT_FOUND":
      return "Template not found.";
    case "INVALID_INPUT":
      return "The template configuration is invalid.";
    default:
      return message ?? "Something went wrong.";
  }
}

function formatDateTime(d: string): string {
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

export default function TemplateList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => call<TemplateRow[]>("templates:list"),
  });

  const [deleting, setDeleting] = useState<TemplateRow | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["templates"] });

  const setDefault = useMutation({
    mutationFn: (id: string) => call("templates:setDefault", { id }),
    onSuccess: () => refresh(),
    onError: (err) => setPageError(friendlyError(err)),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => call("templates:duplicate", { id }),
    onSuccess: () => refresh(),
    onError: (err) => setPageError(friendlyError(err)),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Report templates</h1>
        <Button onClick={() => navigate("/templates/new")}>New template</Button>
      </div>

      {pageError && (
        <div className="mb-3 rounded-md border border-danger/30 bg-red-50 p-3 text-sm text-danger">
          {pageError}
          <button className="ml-3 underline" onClick={() => setPageError(null)}>dismiss</button>
        </div>
      )}

      {isLoading ? (
        <Card className="p-6 text-slate-500">Loading…</Card>
      ) : templates.length === 0 ? (
        <Card className="p-0">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">🗂</div>
            <div className="text-lg font-medium text-slate-700 mb-1">No templates yet</div>
            <div className="text-sm text-slate-500 max-w-xs mb-4">Create one to customize how reports look.</div>
            <Button onClick={() => navigate("/templates/new")}>New template</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-slate-900">{t.name}</span>
                  {t.isDefault && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      Default
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Last modified {formatDateTime(t.updatedAt)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  disabled={t.isDefault || setDefault.isPending}
                  title={t.isDefault ? "Already the default template" : undefined}
                  onClick={() => setDefault.mutate(t.id)}
                >
                  Set as default
                </Button>
                <Button variant="ghost" onClick={() => navigate(`/templates/${t.id}`)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  disabled={duplicate.isPending}
                  onClick={() => duplicate.mutate(t.id)}
                >
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-red-50"
                  disabled={t.isDefault}
                  title={t.isDefault ? "Can't delete the default template" : undefined}
                  onClick={() => setDeleting(t)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleting && (
        <DeleteTemplateModal
          template={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); refresh(); }}
          onError={(msg) => { setDeleting(null); setPageError(msg); }}
        />
      )}
    </div>
  );
}

function DeleteTemplateModal({
  template, onClose, onDone, onError,
}: {
  template: TemplateRow;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => call("templates:delete", { id: template.id }),
    onSuccess: onDone,
    onError: (err) => setFormError(friendlyError(err)),
  });
  void onError;
  return (
    <Modal open onClose={onClose} title={`Delete ${template.name}?`}>
      <p className="text-sm text-slate-700">
        This permanently removes the template. Any saved reports already generated with it are unaffected.
      </p>
      {formError && <p className="mt-3 text-sm text-danger">{formError}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Modal>
  );
}

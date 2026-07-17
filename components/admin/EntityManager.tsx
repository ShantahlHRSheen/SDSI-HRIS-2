"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { Inbox } from "lucide-react";

export type FieldType = "text" | "number" | "select" | "checkbox" | "date" | "textarea";

export interface FieldConfig<T> {
  key: keyof T;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface ColumnConfig<T> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
}

export function EntityManager<T extends { id: string }>({
  title,
  subtitle,
  items,
  fields,
  columns,
  emptyDefaults,
  onAdd,
  onUpdate,
  onDelete,
  canEdit = true,
}: {
  title: string;
  subtitle?: string;
  items: T[];
  fields: FieldConfig<T>[];
  columns: ColumnConfig<T>[];
  emptyDefaults: Omit<T, "id">;
  onAdd: (input: Omit<T, "id">) => void;
  onUpdate: (id: string, patch: Partial<Omit<T, "id">>) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyDefaults });
    setOpen(true);
  }

  function openEdit(item: T) {
    setEditing(item);
    setForm({ ...item });
    setOpen(true);
  }

  function submit() {
    if (editing) {
      onUpdate(editing.id, form as Partial<Omit<T, "id">>);
    } else {
      onAdd(form as Omit<T, "id">);
    }
    setOpen(false);
  }

  function remove(item: T) {
    if (window.confirm(`Remove this ${title.toLowerCase()} entry? This cannot be undone in the demo session.`)) {
      onDelete(item.id);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">{title}</div>
          {subtitle && <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>}
        </div>
        {canEdit && (
          <button onClick={openAdd} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)]">
            <Plus size={14} /> Add
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Inbox} title={`No ${title.toLowerCase()} yet`} description="Use Add to create the first entry." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-2 font-medium">{c.label}</th>
                ))}
                {canEdit && <th className="px-4 py-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--gridline)] last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2.5 text-[var(--text-secondary)]">{c.render(item)}</td>
                  ))}
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(item)} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50" aria-label="Edit">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => remove(item)} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50" aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`}>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={String(f.key)}>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{f.label}</label>
              {f.type === "select" ? (
                <select
                  value={String(form[f.key as string] ?? "")}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(form[f.key as string])}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.checked }))}
                />
              ) : f.type === "textarea" ? (
                <textarea
                  value={String(form[f.key as string] ?? "")}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
                />
              ) : (
                <input
                  type={f.type}
                  value={String(form[f.key as string] ?? "")}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, [f.key as string]: f.type === "number" ? Number(e.target.value) : e.target.value }))
                  }
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={submit} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">{editing ? "Save changes" : "Add"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

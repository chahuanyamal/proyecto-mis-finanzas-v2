"use client";

import { statementsApi } from "@/lib/api";
import type { PreviewRow, StatementPreview } from "@/lib/api-types";
import { Check, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

interface Props {
  preview: StatementPreview;
  onChanged: () => void;
}

export default function StatementPreviewCard({ preview, onChanged }: Props) {
  const [rows, setRows] = useState<PreviewRow[]>(preview.rows);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PreviewRow>({ date: "", description: "", amount: "0", movement_type: "expense" });
  const [isBusy, setIsBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const summary = preview.summary;

  function startEdit(idx: number) {
    setEditingIdx(idx);
    setEditForm({ ...rows[idx] });
  }

  function cancelEdit() {
    setEditingIdx(null);
  }

  function saveEdit() {
    if (editingIdx === null) return;
    const updated = [...rows];
    updated[editingIdx] = editForm;
    setRows(updated);
    setEditingIdx(null);
  }

  async function persistRows(newRows: PreviewRow[]) {
    try {
      await statementsApi.updateRows(preview.id, newRows);
    } catch {
      setMessage("Error al guardar cambios.");
    }
  }

  async function removeRow(idx: number) {
    const newRows = [...rows];
    newRows.splice(idx, 1);
    setRows(newRows);
    try {
      await statementsApi.deleteRow(preview.id, idx);
    } catch {
      setMessage("Error al eliminar fila.");
    }
  }

  async function checkDuplicates() {
    setIsBusy(true);
    try {
      const res = await statementsApi.checkDuplicates(preview.id);
      setDuplicates(res.data.duplicates);
      setMessage(res.data.duplicates.length ? `Se detectaron ${res.data.duplicates.length} posibles duplicados.` : "No se detectaron duplicados.");
    } catch {
      setMessage("No se pudo verificar duplicados.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirm() {
    setIsBusy(true);
    setMessage("");
    try {
      await persistRows(rows);
      const res = await statementsApi.confirm(preview.id);
      const dupMsg = res.data.possible_duplicates.length ? ` (${res.data.possible_duplicates.length} posibles duplicados)` : "";
      setMessage(`Importadas ${res.data.imported_transactions} transacciones.${dupMsg}`);
      onChanged();
    } catch {
      setMessage("Error al confirmar.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCancel() {
    setIsBusy(true);
    try {
      await statementsApi.cancel(preview.id);
      onChanged();
    } catch {
      setMessage("Error al cancelar.");
      setIsBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-black/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-lg">{preview.filename}</p>
          <p className="text-xs text-slate-400">
            Banco: {preview.bank_detected ?? "desconocido"} · Cuenta: {preview.account_id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="flex items-center gap-1 rounded bg-slate-700 px-3 py-1 text-sm text-slate-200"
            onClick={checkDuplicates}
            disabled={isBusy}
          >
            {isBusy ? <Loader2 size={14} className="animate-spin" /> : null}
            Verificar duplicados
          </button>
          <button
            className="flex items-center gap-1 rounded bg-green-600 px-4 py-1 text-sm font-semibold text-white"
            onClick={handleConfirm}
            disabled={isBusy}
          >
            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Confirmar
          </button>
          <button
            className="flex items-center gap-1 rounded bg-slate-600 px-3 py-1 text-sm text-slate-300"
            onClick={handleCancel}
            disabled={isBusy}
          >
            <X size={14} />
            Descartar
          </button>
        </div>
      </div>

      {summary && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded bg-black/40 p-3 text-sm sm:grid-cols-4">
          <div>
            <span className="text-slate-500">Filas</span>
            <p className="font-semibold">{summary.total_rows}</p>
          </div>
          <div>
            <span className="text-slate-500">Ingresos</span>
            <p className="font-semibold text-green-400">${summary.total_income}</p>
          </div>
          <div>
            <span className="text-slate-500">Gastos</span>
            <p className="font-semibold text-red-400">${summary.total_expenses}</p>
          </div>
          <div>
            <span className="text-slate-500">Rango</span>
            <p className="font-semibold text-slate-300">
              {summary.date_start && summary.date_end
                ? `${summary.date_start} → ${summary.date_end}`
                : "—"}
            </p>
          </div>
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="mt-3 rounded border border-yellow-700/50 bg-yellow-900/20 p-3">
          <p className="text-sm font-semibold text-yellow-400">Posibles duplicados ({duplicates.length})</p>
          <ul className="mt-1 max-h-32 overflow-auto text-xs text-yellow-200/80 space-y-0.5">
            {duplicates.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}

      {message && (
        <p className="mt-3 rounded bg-black/50 px-3 py-2 text-sm text-slate-300">{message}</p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs uppercase text-slate-500">
              <th className="pb-2 pr-2">#</th>
              <th className="pb-2 pr-2">Fecha</th>
              <th className="pb-2 pr-2">Descripción</th>
              <th className="pb-2 pr-2 text-right">Monto</th>
              <th className="pb-2 pr-2">Tipo</th>
              <th className="pb-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              if (editingIdx === idx) {
                return (
                  <tr key={idx} className="border-b border-slate-800/50 bg-slate-800/40">
                    <td className="py-1 pr-2 text-slate-500">{idx + 1}</td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-28 rounded border border-slate-600 bg-black px-1 py-0.5 text-xs"
                        value={editForm.date}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full min-w-40 rounded border border-slate-600 bg-black px-1 py-0.5 text-xs"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <input
                        className="w-24 rounded border border-slate-600 bg-black px-1 py-0.5 text-xs text-right"
                        value={editForm.amount}
                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        className="rounded border border-slate-600 bg-black px-1 py-0.5 text-xs"
                        value={editForm.movement_type}
                        onChange={(e) => setEditForm({ ...editForm, movement_type: e.target.value as "income" | "expense" })}
                      >
                        <option value="expense">Gasto</option>
                        <option value="income">Ingreso</option>
                      </select>
                    </td>
                    <td className="py-1 flex gap-1">
                      <button className="rounded bg-green-700 p-1" onClick={saveEdit} title="Guardar">
                        <Save size={12} />
                      </button>
                      <button className="rounded bg-slate-600 p-1" onClick={cancelEdit} title="Cancelar">
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                  <td className="py-1 pr-2 text-slate-500">{idx + 1}</td>
                  <td className="py-1 pr-2">{row.date}</td>
                  <td className="py-1 pr-2 max-w-xs truncate">{row.description}</td>
                  <td className={`py-1 pr-2 text-right font-mono ${row.movement_type === "income" ? "text-green-400" : "text-red-400"}`}>
                    {row.amount}
                  </td>
                  <td className="py-1 pr-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${row.movement_type === "income" ? "bg-green-800/50 text-green-300" : "bg-red-800/50 text-red-300"}`}>
                      {row.movement_type === "income" ? "Ingreso" : "Gasto"}
                    </span>
                  </td>
                  <td className="py-1 flex gap-1">
                    <button className="rounded bg-slate-700 p-1 hover:bg-slate-600" onClick={() => startEdit(idx)} title="Editar">
                      <Pencil size={12} />
                    </button>
                    <button className="rounded bg-red-800/60 p-1 hover:bg-red-700" onClick={() => removeRow(idx)} title="Excluir">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">Sin filas. Todas fueron excluidas.</p>
        )}
      </div>
    </div>
  );
}

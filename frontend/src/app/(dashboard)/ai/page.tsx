"use client";

import { aiApi } from "@/lib/api";
import type { AiConfig } from "@/lib/api-types";
import { usePeriodStore } from "@/stores/period";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "¿Cuánto gasté este mes?",
  "¿En qué categoría gasto más?",
  "¿Cómo voy con mi ahorro este mes?",
  "Dame 3 consejos para gastar menos.",
];

export default function AiPage() {
  const currency = usePeriodStore((s) => s.currency);
  const { data: config, isLoading } = useQuery({
    queryKey: ["ai-config"],
    queryFn: async () => (await aiApi.getConfig()).data as AiConfig,
  });

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError("");
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const { data } = await aiApi.ask(q, currency);
      setMessages((m) => [...m, { role: "assistant", content: data.answer }]);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "No se pudo obtener respuesta del asistente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 880 }}>
      <div className="title-row">
        <div>
          <h1>
            Asistente <span className="serif">IA</span>
          </h1>
          <div className="sub">consultas en lenguaje natural sobre tus finanzas</div>
        </div>
      </div>

      {!isLoading && !config?.enabled ? (
        <div className="insight" style={{ marginBottom: 20 }}>
          <div className="insight-mark serif">¶</div>
          <div className="insight-body">
            <div className="lbl">Sin configurar</div>
            <div className="txt">
              El asistente necesita un proveedor LLM (Ollama, OpenRouter, NVIDIA o custom).{" "}
              <span className="serif">Configúralo en Ajustes.</span>
            </div>
          </div>
          <Link href="/settings" className="btn ghost">
            Configurar →
          </Link>
        </div>
      ) : null}

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 360 }}>
        <div className="panel-head">
          <h3>Conversación</h3>
          <span className="meta">{config?.model ? `modelo · ${config.model}` : "sin modelo"}</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="chip"
                  style={{ cursor: "pointer" }}
                  disabled={!config?.enabled}
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: m.role === "user" ? "var(--bg-4)" : "var(--bg-3)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  color: "var(--text)",
                }}
              >
                {m.content}
              </div>
            ))
          )}
          {busy ? (
            <div className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-3)" }}>
              <Loader2 className="animate-spin" size={14} /> pensando…
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="insight err">
            <div className="insight-mark">!</div>
            <div className="insight-body"><div className="txt">{error}</div></div>
            <div />
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex gap-2"
        >
          <input
            className="input"
            placeholder={config?.enabled ? "Pregúntale a tus finanzas…" : "Configura el asistente primero"}
            value={input}
            disabled={!config?.enabled || busy}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn primary" disabled={!config?.enabled || busy || !input.trim()}>
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}

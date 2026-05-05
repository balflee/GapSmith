"use client";

import { useMemo, useState } from "react";
import { ENDPOINTS, type EndpointSpec, type Lang, generateSnippet } from "./endpoints";
import { SAMPLES } from "./samples";

const SOLANA_PURPLE = "#3db5a6";
const SOLANA_GREEN = "#d4743c";
const SOLANA_GRADIENT = `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`;
const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const SUBTLE_BG = "oklch(0.97 0.005 80)";

const GROUP_LABEL: Record<EndpointSpec["group"], string> = {
  data: "Data API",
  compute: "Compute API",
  jobs: "Jobs",
};

const GROUP_COLOR: Record<EndpointSpec["group"], string> = {
  data: "#10b981",
  compute: "#3b82f6",
  jobs: "#a855f7",
};

function defaultValues(ep: EndpointSpec): Record<string, string> {
  const v: Record<string, string> = {};
  for (const p of ep.params) {
    if (p.default !== undefined) v[p.name] = String(p.default);
    else if (p.placeholder) v[p.name] = p.placeholder;
  }
  return v;
}

export function PlaygroundClient() {
  const [selectedId, setSelectedId] = useState(ENDPOINTS[0].id);
  const [allValues, setAllValues] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const e of ENDPOINTS) init[e.id] = defaultValues(e);
    return init;
  });
  const [lang, setLang] = useState<Lang>("python");
  const [tab, setTab] = useState<"request" | "response">("request");
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => ENDPOINTS.find((e) => e.id === selectedId) ?? ENDPOINTS[0],
    [selectedId],
  );
  const values = allValues[selected.id] ?? {};

  const snippet = useMemo(
    () => generateSnippet(selected, values, lang),
    [selected, values, lang],
  );

  const sample = SAMPLES[selected.id];

  function setValue(name: string, value: string) {
    setAllValues((prev) => ({
      ...prev,
      [selected.id]: { ...(prev[selected.id] ?? {}), [name]: value },
    }));
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op — clipboard unavailable */
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-8" style={{
        background: `radial-gradient(ellipse at top left, ${SOLANA_PURPLE}18, transparent 50%), radial-gradient(ellipse at bottom right, ${SOLANA_GREEN}18, transparent 50%), oklch(0.99 0.005 80)`,
        boxShadow: `inset 0 0 0 1px ${BORDER}`,
      }}>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: "white", boxShadow: `inset 0 0 0 1px ${SOLANA_PURPLE}40` }}>
          <span style={{ background: SOLANA_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ⚡ API Playground
          </span>
        </div>
        <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight md:text-4xl"
          style={{ color: FG, letterSpacing: "-1px" }}>
          Read the API in 60 seconds.
        </h1>
        <p className="mt-2 text-sm leading-relaxed max-w-2xl" style={{ color: MUTED }}>
          Pick an endpoint, tweak the params, and copy a runnable snippet in your language. Sample responses come from real production runs — no synthetic data.
        </p>
      </div>

      {/* Split layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,_360px)_1fr]">
        {/* LEFT: Endpoint picker + form */}
        <div className="space-y-6">
          {/* Endpoint cards */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
              Endpoint
            </div>
            {(["data", "compute", "jobs"] as const).map((group) => {
              const eps = ENDPOINTS.filter((e) => e.group === group);
              if (eps.length === 0) return null;
              return (
                <div key={group} className="space-y-1.5">
                  <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: GROUP_COLOR[group] }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: GROUP_COLOR[group] }} />
                    {GROUP_LABEL[group]}
                  </div>
                  {eps.map((e) => {
                    const isActive = e.id === selectedId;
                    return (
                      <button
                        key={e.id}
                        onClick={() => setSelectedId(e.id)}
                        className="block w-full rounded-lg p-3 text-left transition-all"
                        style={{
                          background: isActive ? "white" : "transparent",
                          boxShadow: isActive
                            ? `inset 0 0 0 2px ${SOLANA_PURPLE}, 0 4px 12px ${SOLANA_PURPLE}15`
                            : `inset 0 0 0 1px ${BORDER}`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold"
                            style={{ background: e.method === "GET" ? "#10b981" : "#3b82f6", color: "white" }}
                          >
                            {e.method}
                          </span>
                          <code className="text-xs font-mono truncate" style={{ color: FG }}>
                            {e.path}
                          </code>
                        </div>
                        <div className="mt-1.5 text-xs font-medium" style={{ color: FG }}>
                          {e.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: MUTED }}>
                          <span style={{ color: SOLANA_PURPLE }}>{e.priceLabel}</span>
                          {e.async && <span>· ~{e.etaMinutes} min</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Param form */}
          {selected.params.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: "white", boxShadow: `inset 0 0 0 1px ${BORDER}` }}>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                Parameters
              </div>
              <div className="space-y-3">
                {selected.params.map((p) => (
                  <div key={p.name}>
                    <label className="flex items-baseline justify-between text-xs" style={{ color: FG }}>
                      <span>
                        <code className="font-mono font-semibold">{p.name}</code>
                        {p.required && <span className="ml-1" style={{ color: SOLANA_GREEN }}>*</span>}
                        <span className="ml-2 font-mono text-[10px]" style={{ color: MUTED }}>
                          {p.in === "body" ? "body" : "query"} · {p.type}
                        </span>
                      </span>
                    </label>
                    <p className="mt-0.5 text-[11px] leading-snug" style={{ color: MUTED }}>{p.description}</p>
                    {p.type === "enum" && p.options ? (
                      <select
                        value={values[p.name] ?? ""}
                        onChange={(e) => setValue(p.name, e.target.value)}
                        className="mt-1.5 w-full rounded-md px-2.5 py-1.5 text-sm font-mono"
                        style={{ background: SUBTLE_BG, boxShadow: `inset 0 0 0 1px ${BORDER}`, color: FG }}
                      >
                        {p.options.map((opt) => (
                          <option key={opt} value={opt}>{opt || "(none)"}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={p.type === "integer" ? "number" : "text"}
                        value={values[p.name] ?? ""}
                        onChange={(e) => setValue(p.name, e.target.value)}
                        placeholder={p.placeholder ?? ""}
                        className="mt-1.5 w-full rounded-md px-2.5 py-1.5 text-sm font-mono"
                        style={{ background: SUBTLE_BG, boxShadow: `inset 0 0 0 1px ${BORDER}`, color: FG }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Code preview + sample response */}
        <div className="rounded-xl overflow-hidden" style={{ background: "#0a0a0a", boxShadow: `0 8px 24px rgba(0,0,0,0.12)` }}>
          {/* Header bar */}
          <div className="flex items-center justify-between border-b px-4 py-2.5"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
            <div className="flex gap-1">
              <Tab active={tab === "request"} onClick={() => setTab("request")}>Request</Tab>
              <Tab active={tab === "response"} onClick={() => setTab("response")}>Sample response</Tab>
            </div>
            <div className="flex items-center gap-2">
              {tab === "request" && (
                <div className="flex rounded-md p-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                  {(["curl", "python", "typescript"] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors"
                      style={{
                        background: lang === l ? SOLANA_GRADIENT : "transparent",
                        color: lang === l ? "white" : "rgba(255,255,255,0.6)",
                      }}
                    >
                      {l === "typescript" ? "TS" : l === "python" ? "Python" : "cURL"}
                    </button>
                  ))}
                </div>
              )}
              {tab === "request" && (
                <button
                  onClick={copySnippet}
                  className="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    background: copied ? SOLANA_PURPLE : "rgba(255,255,255,0.05)",
                    color: copied ? "white" : "rgba(255,255,255,0.7)",
                  }}
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="overflow-x-auto p-5 text-xs leading-relaxed font-mono" style={{ color: "#e8e8e8", minHeight: 320 }}>
            {tab === "request" ? (
              <pre className="whitespace-pre">{snippet}</pre>
            ) : sample ? (
              <div>
                <div className="mb-3 text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  HTTP {sample.status} {sample.status === 200 ? "OK" : sample.status === 202 ? "Accepted" : ""}
                </div>
                <pre className="whitespace-pre-wrap break-words" style={{ color: "#e8e8e8" }}>
                  {JSON.stringify(sample.body, null, 2)}
                </pre>
              </div>
            ) : (
              <div style={{ color: "rgba(255,255,255,0.5)" }}>No sample response captured for this endpoint yet.</div>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t px-5 py-3 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
            {selected.async ? (
              <span>This endpoint returns 202 + a jobId. Poll <code style={{ color: "rgba(255,255,255,0.7)" }}>/api/v1/jobs/{"{id}"}</code> until <code style={{ color: "rgba(255,255,255,0.7)" }}>status=&quot;completed&quot;</code>. ETA: ~{selected.etaMinutes} min.</span>
            ) : selected.priceUsdc > 0 ? (
              <span>Synchronous endpoint. First call returns 402 + payment requirements; resubmit with <code style={{ color: "rgba(255,255,255,0.7)" }}>X-Payment</code> header.</span>
            ) : (
              <span>Free endpoint — the jobId itself is the capability token, no payment header needed.</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom hint cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <HintCard title="Full signing flow" body="Solana SPL transferChecked + memo binding to request fingerprint." link={{ href: "/docs/x402", label: "Read x402 docs →" }} />
        <HintCard title="80-line reference agent" body="examples/agent_demo.py shows the full ephemeral-wallet → 402 → pay → resubmit loop." link={{ href: "https://github.com/balflee/GapSmith/blob/main/examples/agent_demo.py", label: "View on GitHub ↗", external: true }} />
        <HintCard title="OpenAPI spec" body="Machine-readable schema covers every endpoint, request/response shape, and verdict enum." link={{ href: "/api/v1/openapi", label: "openapi.json →" }} />
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-3 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        color: active ? "white" : "rgba(255,255,255,0.5)",
      }}
    >
      {children}
    </button>
  );
}

function HintCard({ title, body, link }: { title: string; body: string; link: { href: string; label: string; external?: boolean } }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "white", boxShadow: `inset 0 0 0 1px ${BORDER}` }}>
      <div className="text-sm font-semibold" style={{ color: FG }}>{title}</div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: MUTED }}>{body}</div>
      <a
        href={link.href}
        target={link.external ? "_blank" : undefined}
        rel={link.external ? "noopener noreferrer" : undefined}
        className="mt-2 inline-block text-xs font-medium"
        style={{ color: SOLANA_PURPLE }}
      >
        {link.label}
      </a>
    </div>
  );
}

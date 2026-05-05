/**
 * Endpoint registry for the Playground. Single source of truth for what's
 * shown in the picker, what params are editable, and how each language's
 * snippet builds the request.
 *
 * Adding a new endpoint: add an entry here, add a sample to ./samples.ts.
 * That's it — the page picks them up automatically.
 */

export interface ParamSpec {
  name: string;
  in: "query" | "body";
  type: "string" | "integer" | "enum";
  required: boolean;
  default?: string | number;
  options?: string[];   // for enum
  placeholder?: string;
  description: string;
}

export interface EndpointSpec {
  id: string;                       // matches sample key, e.g. "GET /api/v1/scout/gaps"
  method: "GET" | "POST";
  path: string;                     // template (e.g. "/api/v1/jobs/{id}")
  group: "data" | "compute" | "jobs";
  title: string;
  description: string;
  priceUsdc: number;
  priceLabel: string;               // "0.10 USDC" or "free (jobId is the capability token)"
  async: boolean;                   // 202 + polling vs 200 immediate
  etaMinutes?: number;              // only meaningful when async
  params: ParamSpec[];
}

export const ENDPOINTS: EndpointSpec[] = [
  // -------- Data API (cheap, sync) --------
  {
    id: "GET /api/v1/scout/gaps",
    method: "GET",
    path: "/api/v1/scout/gaps",
    group: "data",
    title: "List venture gaps",
    description: "Synthesized opportunities from recent Scout pipeline runs. Each gap is a fully-formed business angle: title + trend signal + pain signals.",
    priceUsdc: 0.10,
    priceLabel: "0.10 USDC",
    async: false,
    params: [
      {
        name: "sector",
        in: "query",
        type: "enum",
        required: false,
        options: ["", "ai-ml", "fintech", "ecommerce", "healthtech", "creator", "devtools", "saas", "marketing", "productivity", "security"],
        placeholder: "ai-ml",
        description: "Filter to a specific sector tag. Omit for all.",
      },
      {
        name: "limit",
        in: "query",
        type: "integer",
        required: false,
        default: 10,
        description: "Max gaps to return. 1–50.",
      },
    ],
  },
  {
    id: "GET /api/v1/scout/pain-clusters",
    method: "GET",
    path: "/api/v1/scout/pain-clusters",
    group: "data",
    title: "Recent pain clusters",
    description: "Theme-clustered pain signals from Reddit + indie hacker forums + dev communities. Shows what users are complaining about right now.",
    priceUsdc: 0.10,
    priceLabel: "0.10 USDC",
    async: false,
    params: [
      {
        name: "sector",
        in: "query",
        type: "enum",
        required: false,
        options: ["", "ai-ml", "fintech", "ecommerce", "healthtech", "creator", "devtools", "saas", "marketing", "productivity", "security"],
        placeholder: "",
        description: "Filter to a sector. Omit for all.",
      },
      {
        name: "limit",
        in: "query",
        type: "integer",
        required: false,
        default: 20,
        description: "Max clusters. 1–50.",
      },
    ],
  },
  {
    id: "GET /api/v1/scout/trends",
    method: "GET",
    path: "/api/v1/scout/trends",
    group: "data",
    title: "Trending themes",
    description: "Cross-article themes ranked by article-supporting count and peak relevance score. The 'what's hot this week' view across our news sources.",
    priceUsdc: 0.10,
    priceLabel: "0.10 USDC",
    async: false,
    params: [
      {
        name: "days",
        in: "query",
        type: "integer",
        required: false,
        default: 7,
        description: "Look-back window in days. 1–30.",
      },
    ],
  },
  {
    id: "GET /api/v1/scout/keywords",
    method: "GET",
    path: "/api/v1/scout/keywords",
    group: "data",
    title: "Keyword rankings",
    description: "Frequency-ranked keywords surfacing in Scout's source corpus this week. Useful for ad-targeting, content angles, or 'is this term hot?' lookups.",
    priceUsdc: 0.05,
    priceLabel: "0.05 USDC",
    async: false,
    params: [
      {
        name: "sector",
        in: "query",
        type: "enum",
        required: false,
        options: ["", "ai-ml", "fintech", "ecommerce", "healthtech", "creator", "devtools", "saas", "marketing", "productivity", "security"],
        placeholder: "",
        description: "Filter to a sector. Omit for all.",
      },
      {
        name: "limit",
        in: "query",
        type: "integer",
        required: false,
        default: 50,
        description: "Max keywords. 1–200.",
      },
    ],
  },

  // -------- Compute API (expensive, async) --------
  {
    id: "POST /api/v1/forge/ideate",
    method: "POST",
    path: "/api/v1/forge/ideate",
    group: "compute",
    title: "Forge — 5-round ideation",
    description: "Run the full Forge pipeline: 5-round multi-agent brainstorm + RICE/Kill screening + execution roadmap. Returns 202 + jobId; result via /jobs/{id}.",
    priceUsdc: 15,
    priceLabel: "15 USDC",
    async: true,
    etaMinutes: 35,
    params: [
      {
        name: "context",
        in: "body",
        type: "string",
        required: false,
        placeholder: "AI tools for solo creators struggling with multi-platform content workflows",
        description: "Free-form context the agents read as the brainstorm seed.",
      },
      {
        name: "sectors",
        in: "body",
        type: "string",
        required: false,
        placeholder: "ai-ml,creator",
        description: "Comma-separated sector tags. Optional.",
      },
    ],
  },
  {
    id: "POST /api/v1/prove/debate",
    method: "POST",
    path: "/api/v1/prove/debate",
    group: "compute",
    title: "Prove — 6-persona debate",
    description: "Stress-test a single idea across 3 rounds with 6 adversarial personas + final voting. Returns verdict ∈ { APPROVED, CONDITIONAL_APPROVED, REJECTED, PIVOT_OUT }.",
    priceUsdc: 25,
    priceLabel: "25 USDC",
    async: true,
    etaMinutes: 60,
    params: [
      {
        name: "idea",
        in: "body",
        type: "string",
        required: true,
        placeholder: "AgentMeter — cost governance dashboard for AI agents calling external APIs at scale",
        description: "The idea or product brief to debate. Multi-line markdown is fine.",
      },
    ],
  },

  // -------- Jobs --------
  {
    id: "GET /api/v1/jobs/{id}",
    method: "GET",
    path: "/api/v1/jobs/{id}",
    group: "jobs",
    title: "Poll job status",
    description: "Fetch progress + result for an async compute job. The jobId returned at 202 acts as a capability token (no separate auth needed).",
    priceUsdc: 0,
    priceLabel: "free (capability token)",
    async: false,
    params: [
      {
        name: "id",
        in: "query",  // path param treated as query for form purposes
        type: "string",
        required: true,
        placeholder: "job_moskspum_ife1w561",
        description: "The jobId returned by /forge/ideate or /prove/debate.",
      },
    ],
  },
];

// ----------------------------------------------------------------
// Code generators — one per language, each returns a complete script
// ----------------------------------------------------------------

export type Lang = "curl" | "python" | "typescript";

const BASE_URL = "https://gapsmith.draftlabs.org";

function buildQueryString(ep: EndpointSpec, values: Record<string, string>): string {
  const queryParams = ep.params.filter((p) => p.in === "query" && !p.name.startsWith("{"));
  const pieces: string[] = [];
  for (const p of queryParams) {
    if (p.name === "id" && ep.path.includes("{id}")) continue;  // path-templated, not query
    const v = values[p.name];
    if (v === undefined || v === "") continue;
    pieces.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(v)}`);
  }
  return pieces.length ? "?" + pieces.join("&") : "";
}

function resolvePath(ep: EndpointSpec, values: Record<string, string>): string {
  let p = ep.path;
  if (p.includes("{id}")) {
    const id = values["id"] || "<JOB_ID>";
    p = p.replace("{id}", id);
  }
  return p;
}

function buildBodyJson(ep: EndpointSpec, values: Record<string, string>): Record<string, unknown> | null {
  const bodyParams = ep.params.filter((p) => p.in === "body");
  if (bodyParams.length === 0) return null;
  const body: Record<string, unknown> = {};
  for (const p of bodyParams) {
    const v = values[p.name];
    if (v === undefined || v === "") continue;
    if (p.name === "sectors" && typeof v === "string") {
      body[p.name] = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      body[p.name] = v;
    }
  }
  return body;
}

export function generateSnippet(ep: EndpointSpec, values: Record<string, string>, lang: Lang): string {
  const fullPath = resolvePath(ep, values) + buildQueryString(ep, values);
  const url = BASE_URL + fullPath;
  const body = buildBodyJson(ep, values);
  const isPaid = ep.priceUsdc > 0;

  if (lang === "curl") {
    if (ep.method === "GET" && !isPaid) {
      return [
        `# Free endpoint — no payment header needed`,
        `curl ${url}`,
      ].join("\n");
    }
    if (ep.method === "GET" && isPaid) {
      return [
        `# Step 1: GET without payment → 402 + paymentRequirements`,
        `curl -i ${url}`,
        ``,
        `# Step 2: parse paymentRequirements, sign + submit a USDC SPL`,
        `# transfer on Solana, then resubmit with X-Payment header.`,
        `# See examples/agent_demo.py for the full signing flow.`,
        `curl ${url} \\`,
        `  -H 'X-Payment: <base64(signed_payment_payload)>'`,
      ].join("\n");
    }
    // POST
    return [
      `# Step 1: POST without payment → 402 + paymentRequirements`,
      `curl -i -X POST ${url} \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -d '${body ? JSON.stringify(body) : "{}"}'`,
      ``,
      `# Step 2: resubmit with signed payment`,
      `curl -X POST ${url} \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -H 'X-Payment: <base64(signed_payment_payload)>' \\`,
      `  -d '${body ? JSON.stringify(body) : "{}"}'`,
    ].join("\n");
  }

  if (lang === "python") {
    if (ep.method === "GET" && !isPaid) {
      return [
        `import requests`,
        ``,
        `r = requests.get("${url}")`,
        `print(r.status_code, r.json())`,
      ].join("\n");
    }
    if (ep.method === "GET" && isPaid) {
      return [
        `import requests`,
        `# Full signing flow lives in examples/agent_demo.py — this skeleton`,
        `# shows the 402 → pay → re-request handshake.`,
        ``,
        `r = requests.get("${url}")`,
        `if r.status_code == 402:`,
        `    requirements = r.json()["paymentRequirements"]`,
        `    x_payment = sign_solana_usdc_payment(requirements)  # see agent_demo.py`,
        `    r = requests.get("${url}", headers={"X-Payment": x_payment})`,
        `print(r.status_code, r.json())`,
      ].join("\n");
    }
    // POST
    return [
      `import requests`,
      ``,
      `payload = ${body ? JSON.stringify(body, null, 4) : "{}"}`,
      ``,
      `r = requests.post("${url}", json=payload)`,
      `if r.status_code == 402:`,
      `    requirements = r.json()["paymentRequirements"]`,
      `    x_payment = sign_solana_usdc_payment(requirements)  # see agent_demo.py`,
      `    r = requests.post("${url}", json=payload, headers={"X-Payment": x_payment})`,
      ``,
      `# 202 + jobId — poll /api/v1/jobs/{jobId} until status="completed"`,
      `print(r.status_code, r.json())`,
    ].join("\n");
  }

  // TypeScript
  if (ep.method === "GET" && !isPaid) {
    return [
      `const res = await fetch("${url}");`,
      `const data = await res.json();`,
      `console.log(res.status, data);`,
    ].join("\n");
  }
  if (ep.method === "GET" && isPaid) {
    return [
      `// Full signing flow shown in examples/agent_demo.py for parity`,
      `let res = await fetch("${url}");`,
      ``,
      `if (res.status === 402) {`,
      `  const { paymentRequirements } = await res.json();`,
      `  const xPayment = await signSolanaUsdcPayment(paymentRequirements);`,
      `  res = await fetch("${url}", { headers: { "X-Payment": xPayment } });`,
      `}`,
      ``,
      `console.log(res.status, await res.json());`,
    ].join("\n");
  }
  // POST
  return [
    `const payload = ${body ? JSON.stringify(body, null, 2) : "{}"};`,
    ``,
    `let res = await fetch("${url}", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify(payload),`,
    `});`,
    ``,
    `if (res.status === 402) {`,
    `  const { paymentRequirements } = await res.json();`,
    `  const xPayment = await signSolanaUsdcPayment(paymentRequirements);`,
    `  res = await fetch("${url}", {`,
    `    method: "POST",`,
    `    headers: { "Content-Type": "application/json", "X-Payment": xPayment },`,
    `    body: JSON.stringify(payload),`,
    `  });`,
    `}`,
    ``,
    `// 202 + jobId — poll /api/v1/jobs/{jobId} until status="completed"`,
    `console.log(res.status, await res.json());`,
  ].join("\n");
}

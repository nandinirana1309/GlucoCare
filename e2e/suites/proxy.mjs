// The REAL server/ai-proxy.mjs, pointed at a mock Ollama (no API key needed).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const name = "AI proxy server (real code, mock provider)";

const PROXY_FILE = fileURLToPath(new URL("../../server/ai-proxy.mjs", import.meta.url));

function startProxy(port, env) {
  const child = spawn(process.execPath, [PROXY_FILE], {
    env: { ...process.env, AI_PROXY_PORT: String(port), AI_PROVIDER: "ollama", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) return resolve({ child, log: () => log, stop: () => child.kill() });
      } catch { /* not up yet */ }
      if (Date.now() - started > 15000) return reject(new Error(`proxy did not start: ${log}`));
      setTimeout(poll, 200);
    };
    poll();
  });
}

const EVIDENCE = {
  task: "explain-assessment",
  promptVersion: "2.0",
  evidence: {
    assessment: { concernLevel: "Moderate", levelBasis: "score", score: 3, maxScore: 18, thresholds: { moderate: 3, high: 6 } },
    factors: [], safety: { urgent: false }, changes: null, trends: [], context: {},
  },
};

export async function run(t, { mockOllama }) {
  const ctl = (path) => fetch(`${mockOllama}${path}`).then((r) => r.text());
  const proxy = await startProxy(5196, { OLLAMA_URL: mockOllama, AI_RATE_LIMIT: "100", AI_PROVIDER_TIMEOUT_MS: "1500" });
  const url = "http://127.0.0.1:5196/api/explain-results";
  const post = (body, origin = "http://localhost:5173") =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json", origin }, body: typeof body === "string" ? body : JSON.stringify(body) });

  try {
    await ctl("/mode/good");
    const ok = await post(EVIDENCE);
    const okBody = await ok.json();
    t.check("allowed origin -> 200 with the v2 shape", ok.status === 200 && Array.isArray(okBody.factorExplanations) && typeof okBody.summary === "string");
    t.check("CORS header echoes only the allowed origin", ok.headers.get("access-control-allow-origin") === "http://localhost:5173");
    t.check("unknown origin -> 403", (await post(EVIDENCE, "https://evil.example")).status === 403);
    t.check("body over 32 KB -> 413", (await post("x".repeat(40 * 1024))).status === 413);
    t.check("invalid JSON -> 400", (await post("{oops")).status === 400);
    t.check("invalid evidence -> 400", (await post({ task: "explain-assessment", promptVersion: "2.0", evidence: {} })).status === 400);

    await ctl("/reset");
    t.check("urgent evidence -> 422 and the provider is never called",
      (await post({ ...EVIDENCE, evidence: { ...EVIDENCE.evidence, safety: { urgent: true } } })).status === 422 && JSON.parse(await ctl("/count")).count === 0);

    await ctl("/mode/garbage");
    const g = await (await post(EVIDENCE)).json();
    t.check("non-JSON model output reshaped (browser guard then validates it)", typeof g.summary === "string" && Array.isArray(g.terms));

    await ctl("/mode/error500");
    const e = await post(EVIDENCE);
    const eBody = await e.text();
    t.check("provider error -> 502 with a safe message (no provider details)", e.status === 502 && !eBody.includes("secret-looking detail"));

    await ctl("/mode/slow");
    const s = await post(EVIDENCE);
    t.check("provider timeout -> 504 with a friendly message", s.status === 504 && (await s.text()).includes("took too long"));
    t.check("legacy v1 request still served", (await (await ctl("/mode/good"), post({ concernLevel: "Low", indicators: [], riskFactors: [], redFlags: [], context: {} }))).status === 200);
  } finally {
    proxy.stop();
  }

  const limited = await startProxy(5195, { OLLAMA_URL: mockOllama, AI_RATE_LIMIT: "3" });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch("http://127.0.0.1:5195/api/explain-results", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:5173" }, body: JSON.stringify(EVIDENCE) })).status);
    t.check("rate limit -> 429 after the limit", codes.slice(0, 3).every((c) => c === 200) && codes[3] === 429, codes.join(","));
  } finally {
    limited.stop();
  }
}

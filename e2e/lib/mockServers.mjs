// TEST-ONLY stand-ins for external AI services. Never used by the app itself.
import { createServer } from "node:http";

const listen = (server, port) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));

/** A good, guard-passing explanation built from the evidence it receives. */
function explanation(evidence, mode) {
  const a = evidence.assessment;
  const contributing = evidence.factors.filter((f) => f.points > 0);
  const good = {
    summary: `Your assessment shows a ${a.concernLevel} concern indicator with a score of ${a.score} out of ${a.maxScore} points. This is an educational indicator, not a diagnosis. Please discuss these results with a healthcare professional.`,
    factorExplanations: contributing.slice(0, 2).map((f) => ({ factorId: f.id, text: `${f.label} (${f.value}) added ${f.points} ${f.points === 1 ? "point" : "points"}.` })),
    changeExplanation: null,
    generalTips: ["Regular physical activity and balanced meals support general health."],
    questionsForClinician: ["Should any of these measurements be checked again?"],
    terms: [{ term: "HbA1c", meaning: "A blood test that reflects average blood glucose over about three months." }],
  };
  if (mode === "attack") {
    return {
      ...good,
      summary: `${good.summary} Metformin is usually the first treatment for this.`,
      factorExplanations: [...good.factorExplanations, { factorId: "cholesterol", text: "Your cholesterol is high." }],
    };
  }
  if (mode === "bad") return { summary: "You have diabetes. Your score is 2. Take metformin 500 mg daily. There is nothing to worry about." };
  return good;
}

/**
 * Mock of the app's AI endpoint (VITE_AI_FUNCTION_URL) - speaks the v2 contract.
 * Control: GET /mode/<good|attack|bad|error>, /count, /reset, /last
 */
export async function startMockAi(port) {
  const state = { mode: "good", count: 0, last: null };
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    if (req.url.startsWith("/mode/")) { state.mode = req.url.slice(6); res.end(state.mode); return; }
    if (req.url === "/count") { res.end(JSON.stringify({ count: state.count })); return; }
    if (req.url === "/reset") { state.count = 0; state.last = null; res.end("ok"); return; }
    if (req.url === "/last") { res.end(JSON.stringify(state.last)); return; }
    let raw = "";
    for await (const c of req) raw += c;
    state.count++;
    state.last = JSON.parse(raw);
    if (state.mode === "error") {
      res.writeHead(502, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify({ error: "The AI provider is busy right now. Please try again in a minute." }));
      return;
    }
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify(explanation(state.last.evidence, state.mode)));
  });
  return listen(server, port);
}

/**
 * Mock of an Ollama server, used to test the REAL server/ai-proxy.mjs.
 * Modes: good | garbage | error500 | slow
 */
export async function startMockOllama(port) {
  const state = { mode: "good", count: 0 };
  const server = createServer(async (req, res) => {
    if (req.url.startsWith("/mode/")) { state.mode = req.url.slice(6); res.end(state.mode); return; }
    if (req.url === "/count") { res.end(JSON.stringify({ count: state.count })); return; }
    if (req.url === "/reset") { state.count = 0; res.end("ok"); return; }
    let raw = "";
    for await (const c of req) raw += c;
    state.count++;
    if (state.mode === "error500") { res.writeHead(500); res.end("internal error with secret-looking detail"); return; }
    if (state.mode === "slow") await new Promise((r) => setTimeout(r, 4000));
    let content;
    try {
      const body = JSON.parse(raw);
      const user = body.messages.find((m) => m.role === "user").content;
      const payload = JSON.parse(user.slice(user.indexOf("{")));
      content =
        state.mode === "garbage"
          ? "Sorry, I cannot help with that."
          : payload.assessment && Array.isArray(payload.factors)
            ? JSON.stringify(explanation(payload, "good")) // v2 evidence
            : JSON.stringify({ summary: "Legacy summary.", termNotes: [], suggestions: [], whoToSee: "" }); // v1
    } catch {
      content = "{}";
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: { role: "assistant", content } }));
  });
  return listen(server, port);
}

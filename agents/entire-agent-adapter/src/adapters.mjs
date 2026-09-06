// adapters.mjs — format detection + adapter dispatch.
//
// The pre-Curveball design supported ONE format (v1). The Curveball introduced
// v2. Rather than duplicating the summarizer, we sniff the format from the
// first well-formed event and route to the matching adapter. Both adapters
// return the SAME shape: { intent, outcome, friction, open_items, complete,
// warnings }. Only the parsing differs.

export function detectFormat(events) {
  for (const e of events) {
    // v2 events carry event_type + a payload object.
    if (e && typeof e === "object" && "event_type" in e && "payload" in e) return "v2";
    // v1 events use a flat {type, ...} shape.
    if (e && typeof e === "object" && "type" in e) return "v1";
  }
  // No recognizable event at all — still return a format so downstream code
  // can run; v1 is the default because it is the historical shape.
  return "v1";
}

// Shared summarizer core: given normalized events {kind, text}, bucket them.
function bucket(normalized) {
  const warnings = [];
  let intent = "";
  let outcome = "";
  const friction = [];
  const open_items = [];
  let sawStart = false;
  let sawStop = false;

  for (const n of normalized) {
    if (n.kind === "start") { sawStart = true; if (!intent && n.text) intent = n.text; }
    else if (n.kind === "prompt" && !intent) intent = n.text;
    else if (n.kind === "assistant_final") outcome = n.text;
    else if (n.kind === "error" || n.kind === "tool_error") friction.push(n.text);
    else if (n.kind === "todo" || n.kind === "open") open_items.push(n.text);
    else if (n.kind === "stop") sawStop = true;
    else if (n.kind === "unknown") warnings.push(`unknown event kind: ${n.rawKind}`);
  }

  // "complete" means: we saw a start AND a stop event. Otherwise the caller
  // gets a partial result and a warning naming what's missing.
  const complete = sawStart && sawStop;
  if (!complete) {
    if (!sawStart) warnings.push("no session-start event found — result is partial");
    if (!sawStop) warnings.push("no session-stop event found — result is partial");
  }

  return { intent, outcome, friction, open_items, complete, warnings };
}

// v1 adapter — original flat format.
export const v1 = {
  summarize(events) {
    const normalized = events.map((e) => {
      const t = e && typeof e === "object" ? e.type : null;
      switch (t) {
        case "session_start": return { kind: "start", text: e.intent || e.prompt || "" };
        case "user_prompt":   return { kind: "prompt", text: e.text || "" };
        case "assistant_message":
          return { kind: e.final ? "assistant_final" : "assistant_msg", text: e.text || "" };
        case "tool_error":    return { kind: "tool_error", text: e.message || "" };
        case "error":         return { kind: "error", text: e.message || "" };
        case "todo":          return { kind: "todo", text: e.text || "" };
        case "session_stop":  return { kind: "stop", text: "" };
        default:              return { kind: "unknown", rawKind: t || "null" };
      }
    });
    return bucket(normalized);
  },
};

// v2 adapter — new nested {event_type, payload} format.
export const v2 = {
  summarize(events) {
    const normalized = events.map((e) => {
      const t = e && typeof e === "object" ? e.event_type : null;
      const p = (e && e.payload) || {};
      switch (t) {
        case "lifecycle.start":  return { kind: "start", text: p.intent || p.goal || "" };
        case "message.user":     return { kind: "prompt", text: p.content || "" };
        case "message.assistant":
          return { kind: p.is_final ? "assistant_final" : "assistant_msg", text: p.content || "" };
        case "tool.error":       return { kind: "tool_error", text: p.error || p.message || "" };
        case "diagnostic.error": return { kind: "error", text: p.error || p.message || "" };
        case "task.open":        return { kind: "open", text: p.description || "" };
        case "lifecycle.stop":   return { kind: "stop", text: "" };
        default:                 return { kind: "unknown", rawKind: t || "null" };
      }
    });
    return bucket(normalized);
  },
};

export const ADAPTERS = { v1, v2 };

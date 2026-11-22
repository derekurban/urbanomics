// Vendors: one readable name for every bank description that is really the same merchant or payer.
// A vendor has one or more matchers, each a plain sentence over the original bank description
// ("starts with SQ *BEAN COUNTER"), and may carry a tag and a person that new matching transactions get.
// Pure helpers shared by the main process (vendors.cjs) and the page.

export const MATCH_MODES = [
  { id: "starts", label: "starts with" },
  { id: "contains", label: "contains" },
  { id: "ends", label: "ends with" },
  { id: "exact", label: "is exactly" },
];
export const MAX_MATCHERS = 20;
export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unescapeRegex = (text) => text.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");

/* Description patterns are searched anywhere in the text, ignoring case (RE2 "iu"). */
export function compileMatcher(matcher) {
  const text = String(matcher?.text ?? "").trim();
  if (!text) return "";
  if (matcher.mode === "custom") return text;
  const e = escapeRegex(text);
  switch (matcher.mode) {
    case "contains": return e;
    case "ends": return `${e}$`;
    case "exact": return `^${e}$`;
    default: return `^${e}`;
  }
}
/** The sentence a stored pattern came from, or a custom matcher carrying the pattern as it is. */
export function decompilePattern(pattern) {
  const p = String(pattern || "").trim();
  if (!p) return { mode: "starts", text: "" };
  let m;
  if ((m = /^\^((?:\\.|[^\\.*+?^${}()|[\]])+)\$$/.exec(p))) return { mode: "exact", text: unescapeRegex(m[1]) };
  if ((m = /^\^((?:\\.|[^\\.*+?^${}()|[\]])+)$/.exec(p))) return { mode: "starts", text: unescapeRegex(m[1]) };
  if ((m = /^((?:\\.|[^\\.*+?^${}()|[\]])+)\$$/.exec(p))) return { mode: "ends", text: unescapeRegex(m[1]) };
  if ((m = /^((?:\\.|[^\\.*+?^${}()|[\]])+)$/.exec(p))) return { mode: "contains", text: unescapeRegex(m[1]) };
  return { mode: "custom", text: p };
}
// For "Descriptions that start with …": the verb agrees with a plural subject.
const PLURAL = { starts: "start with", contains: "contain", ends: "end with", exact: "are exactly", custom: "match the pattern" };
export function describeMatcher(matcher, { plural = false } = {}) {
  if (matcher.mode === "custom") return `${plural ? PLURAL.custom : "matches the pattern"} ${matcher.text}`;
  return `${plural ? PLURAL[matcher.mode] || PLURAL.starts : MATCH_MODES.find((m) => m.id === matcher.mode)?.label || "starts with"} “${matcher.text}”`;
}
/** "starts with “SQ *BEAN” or contains “BEAN COUNTER”"; with plural, "start with … or contain …". */
export function describeMatchers(matchers, options) {
  const parts = (matchers || []).filter((m) => String(m.text || "").trim()).map((m) => describeMatcher(m, options));
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`;
}

/** Validated matchers ({ mode, text }), duplicates removed. Throws with a message for the person. */
export function normalizeMatchers(list) {
  if (!Array.isArray(list)) throw new Error("Say which bank descriptions belong to this vendor.");
  const out = [], seen = new Set();
  for (const raw of list) {
    const mode = ["starts", "contains", "ends", "exact", "custom"].includes(raw?.mode) ? raw.mode : "starts";
    const text = typeof raw?.text === "string" ? raw.text.trim() : "";
    if (!text) continue;
    if (text.length > (mode === "custom" ? 256 : 200)) throw new Error("Keep each matcher under 200 characters.");
    const key = mode + "\u0000" + text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mode, text });
  }
  if (!out.length) throw new Error("Say which bank descriptions belong to this vendor.");
  if (out.length > MAX_MATCHERS) throw new Error(`A vendor can have up to ${MAX_MATCHERS} matchers.`);
  return out;
}

/** Whether a description matches any matcher, the way the main process reads them (browser RegExp, for previews on the page). */
export function matchesDescription(matchers, text) {
  return (matchers || []).some((m) => {
    const pattern = compileMatcher(m);
    if (!pattern) return false;
    try { return new RegExp(pattern, "iu").test(text || ""); } catch { return false; }
  });
}

/* "SQ *BEAN COUNTER #1042" → the part that stays the same from visit to visit, and a readable name for it. */
export const stableStart = (text) => String(text || "").replace(/[\s#*\d./-]+$/u, "").trim() || String(text || "").trim();
// Card processors put their own code in front of the merchant ("SQ *", "TST*"); the name leaves it out.
const processor = /^(?:sq|tst|sp|py|pp|paypal|square|toast)\s*\*\s*/i;
export const readableName = (text) => {
  const start = stableStart(text), name = start.replace(processor, "") || start;
  return name.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])\p{L}/gu, (c) => c.toUpperCase()).slice(0, 80);
};

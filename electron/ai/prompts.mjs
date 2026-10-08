// What each Codex feature sends and what it accepts back. Pure functions: the context is built from the
// workspace, the prompt states the task, the schema fixes the answer's shape, and the validator keeps only
// answers that point at things that exist. Nothing here writes; every suggestion is applied later through
// the app's usual versioned saves, after the person approves it.

const PREAMBLE = [
  "You help organize a personal finance ledger in a desktop app called Urbanomics.",
  "Work only from the data in this message. Do not run commands, read files or browse.",
  "Reply with JSON that matches the provided schema exactly. Use plain, short, sentence-case names (\"Coffee shops\", not \"COFFEE SHOPS\").",
  "Write each reason as one short plain sentence a person can check against the data.",
].join("\n");
const clip = (text, n = 80) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const amount = (cents, currency = "CAD") => `${cents < 0 ? "-" : ""}${(Math.abs(cents) / 100).toFixed(2)} ${currency}`;
const lower = (s) => String(s || "").trim().toLowerCase();
const strict = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" };

/* ---------- shared views of the workspace ---------- */
export function taxonomy(entities) {
  const tags = entities.filter((e) => e.kind === "category" && !e.systemRole);
  const buckets = entities.filter((e) => e.kind === "bucket");
  return { tags, buckets, byId: new Map([...tags, ...buckets].map((e) => [e.id, e])) };
}
const flowOf = (tag) => (tag.flowType === "income" ? "income" : "expense");
const isTransfer = (r) => r.review?.kind === "transfer" || !!r.review?.transferId;
const active = (records) => records.filter((r) => !r.deleted && r.amountCents !== 0);
/** A row nobody has said anything about yet: no tags, no repayment, not a transfer. */
export const untouched = (r) => !isTransfer(r) && !(r.review?.tags || []).length && r.review?.kind !== "repayment" && !(r.review?.allocations || []).some((a) => a.cents > 0);

export function tagUsage(records) {
  const usage = new Map();
  for (const r of records) for (const p of r.review?.tags || []) {
    const u = usage.get(p.id) || { count: 0, cents: 0, vendors: new Map() };
    u.count++; u.cents += p.cents; u.vendors.set(r.description, (u.vendors.get(r.description) || 0) + 1);
    usage.set(p.id, u);
  }
  return usage;
}
/** Transactions grouped by the name they show under (the alias when there is one) and direction. */
export function vendors(records, entities, limit = 250) {
  const names = new Map(entities.map((e) => [e.id, e.name]));
  const groups = new Map();
  for (const r of active(records)) {
    if (isTransfer(r)) continue;
    const direction = r.amountCents < 0 ? "out" : "in", key = direction + "\u0000" + r.description;
    const g = groups.get(key) || { name: r.description, direction, count: 0, cents: 0, untagged: 0, currency: r.currency || "CAD", tags: new Map(), ids: [] };
    g.count++; g.cents += r.amountCents; g.ids.push(r.id);
    if (!(r.review?.tags || []).length) g.untagged++;
    for (const p of r.review?.tags || []) { const n = names.get(p.id); if (n) g.tags.set(n, (g.tags.get(n) || 0) + 1); }
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (b.untagged > 0) - (a.untagged > 0) || b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}
function taxonomyText(entities, usage) {
  const { tags, buckets } = taxonomy(entities);
  const line = (t) => `[${t.id}] ${t.name} (${usage.get(t.id)?.count || 0} transactions)`;
  const out = ["Expense categories and their tags:"];
  for (const b of buckets) out.push(`- [${b.id}] ${b.name}: ${tags.filter((t) => t.parentId === b.id).map(line).join(", ") || "no tags"}`);
  if (!buckets.length) out.push("- none yet");
  out.push(`Ungrouped expense tags: ${tags.filter((t) => flowOf(t) === "expense" && !t.parentId).map(line).join(", ") || "none"}`);
  out.push(`Income tags: ${tags.filter((t) => flowOf(t) === "income").map(line).join(", ") || "none"}`);
  return out.join("\n");
}
const vendorLine = (v) => `- "${clip(v.name, 90)}" · money ${v.direction} · ${v.count} transaction${v.count === 1 ? "" : "s"} · total ${amount(v.cents, v.currency)}${v.untagged ? ` · ${v.untagged} untagged` : ""}${v.tags.size ? ` · tagged ${[...v.tags].map(([n, c]) => `${n}×${c}`).join(", ")}` : ""}`;

/* ---------- missing tags ---------- */
export const missingTagsSchema = strict({
  suggestions: { type: "array", items: strict({
    name: str, flowType: { type: "string", enum: ["expense", "income"] }, categoryId: str, newCategory: str, reason: str,
    vendors: { type: "array", items: str },
  }) },
});
export function missingTagsPrompt(entities, records) {
  const usage = tagUsage(records), list = vendors(records, entities);
  return [PREAMBLE, "",
    "Task: suggest tags that are missing. Look for transactions, especially untagged ones, that no existing tag describes well, and propose new tags for them.",
    "Rules:",
    "- Never propose a tag whose name or meaning duplicates an existing tag; an existing tag that fits is not missing.",
    "- Expense tags go in an existing category when one fits (categoryId = its id in brackets, newCategory = \"\"). When several new tags share a theme no category covers, put them in a new category (categoryId = \"\", newCategory = its name, the same spelling each time). Use both empty for an ungrouped tag.",
    "- Income tags never have a category (both empty). Expense tags describe money out; income tags describe money in.",
    "- vendors lists the transaction names from the list below that the tag fits, copied exactly, and only names with the matching direction.",
    "- Transfers between the person's own accounts, credit card payments and e-transfers to or from friends are not spending or income here: the app links them as moves and repayments. Never make tags for them or list them as vendors.",
    "- Propose at most 12 tags, the most useful first. Propose none if nothing is missing.",
    "", taxonomyText(entities, usage), "", `Transactions by name (${list.length} names):`, ...list.map(vendorLine)].join("\n");
}
export function validateMissingTags(value, entities, records) {
  const { tags, buckets } = taxonomy(entities), list = vendors(records, entities, 5000);
  const taken = new Set(tags.map((t) => flowOf(t) + ":" + lower(t.name))), seen = new Set();
  const out = [];
  for (const s of value?.suggestions || []) {
    const name = clip(s.name, 80), flowType = s.flowType === "income" ? "income" : "expense";
    if (!name || taken.has(flowType + ":" + lower(name)) || seen.has(flowType + ":" + lower(name))) continue;
    seen.add(flowType + ":" + lower(name));
    let categoryId = flowType === "expense" && buckets.some((b) => b.id === s.categoryId) ? s.categoryId : "";
    let newCategory = flowType === "expense" && !categoryId ? clip(s.newCategory, 80) : "";
    const existing = newCategory && buckets.find((b) => lower(b.name) === lower(newCategory));
    if (existing) { categoryId = existing.id; newCategory = ""; }
    const direction = flowType === "income" ? "in" : "out";
    const fits = [...new Set((s.vendors || []).map((v) => String(v)))].map((v) => list.find((g) => g.direction === direction && g.name === v)).filter(Boolean);
    const ids = new Set(fits.flatMap((g) => g.ids));
    const rows = active(records).filter((r) => ids.has(r.id));
    out.push({
      key: "tag-" + out.length, name, flowType, categoryId, newCategory, reason: clip(s.reason, 240),
      vendors: fits.map((g) => ({ name: g.name, count: g.count })),
      transactions: rows.length, unsorted: rows.filter(untouched).map((r) => r.id),
    });
  }
  return { suggestions: out };
}

/* ---------- restructure ---------- */
export const restructureSchema = strict({
  summary: str,
  changes: { type: "array", items: strict({
    type: { type: "string", enum: ["create-category", "create-tag", "rename", "move", "merge", "delete"] },
    id: str, into: str, category: str, name: str, flowType: { type: "string", enum: ["expense", "income", ""] }, vendors: { type: "array", items: str }, reason: str,
  }) },
});
export function restructurePrompt(entities, records, ruleRefs = new Map()) {
  const usage = tagUsage(records), { tags, buckets } = taxonomy(entities);
  const detail = (t) => {
    const u = usage.get(t.id), top = u ? [...u.vendors].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => `"${clip(n, 40)}"`).join(", ") : "";
    return `  - [${t.id}] ${t.name} · ${u?.count || 0} transactions${ruleRefs.get(t.id) ? ` · used by ${ruleRefs.get(t.id)} rule(s)` : ""}${top ? ` · e.g. ${top}` : ""}`;
  };
  const lines = [];
  for (const b of buckets) { lines.push(`- Category [${b.id}] ${b.name}`); for (const t of tags.filter((x) => x.parentId === b.id)) lines.push(detail(t)); }
  lines.push("- Ungrouped expense tags"); for (const t of tags.filter((x) => flowOf(x) === "expense" && !x.parentId)) lines.push(detail(t));
  lines.push("- Income tags (never in a category)"); for (const t of tags.filter((x) => flowOf(x) === "income")) lines.push(detail(t));
  const untagged = active(records).filter((r) => !isTransfer(r) && !(r.review?.tags || []).length).length;
  const scratch = tags.length < 3, list = vendors(records, entities, scratch ? 250 : 120);
  return [PREAMBLE, "",
    scratch
      ? "Task: there is little or no structure yet. Design a complete starting set of expense categories and tags, plus income tags, that covers these transactions, so the Dashboard reads clearly from day one. Expense tags belong to at most one category; income tags stand alone. Aim for 4 to 8 categories with 2 to 6 tags each, named the way a person would say them."
      : "Task: suggest a better structure for these categories and tags so the Dashboard reads clearly. Expense tags belong to at most one category; income tags stand alone.",
    "Each change is one of:",
    "- create-category: a new expense category. name = its name. Other fields \"\".",
    "- create-tag: a new tag. name = its name; flowType = expense or income; category = for an expense tag, an existing category id or the exact name of a category created in this plan (\"\" for ungrouped; always \"\" for income); vendors = the transaction names from the list below it fits, copied exactly, matching its direction. " + (scratch ? "Use it for every tag of the new structure." : "Use it only for spending or income that no tag covers yet."),
    "- rename: id = a tag or category id; name = the clearer name.",
    "- move: id = an expense tag id; category = an existing category id, or the exact name of a category created in this plan, or \"\" to leave it ungrouped.",
    "- merge: id = a tag to fold into another tag that means the same thing (\"Gas\" into \"Fuel\", \"Salary\" into \"Paycheck\"); into = the tag that stays, usually the one with more transactions or the clearer name. Both must be the same kind (expense or income). Its transactions and rules move to the remaining tag. Never merge tags with different meanings.",
    "- delete: id = a category that will be empty after this plan's moves and merges. Do not delete tags: an unused tag may be needed for future transactions, and a duplicate tag should be merged instead.",
    "Leave id, into, category, name, flowType and vendors empty when a change doesn't use them.",
    "Transfers between the person's own accounts, credit card payments and e-transfers to or from friends are not spending or income here: the app links them as moves and repayments. Never make tags for them or list them as vendors.",
    "Rules: only suggest changes that clearly help: duplicates and near-duplicates (merge), tags in the wrong category or ungrouped tags that belong in one (move), overlapping tags that should become one, vague or inconsistent names (rename), a new category when several ungrouped tags share a theme. Each tag appears in at most one change, and a tag that another tag merges into must stay. Keep what already works. " + (scratch ? "At most 60 changes." : "At most 25 changes."),
    "summary: two sentences on what the plan does.",
    "", `Current structure (${tags.length} tags, ${buckets.length} categories, ${untagged} untagged transactions):`, ...lines,
    "", `Transactions by name (${list.length} names, untagged first):`, ...list.map(vendorLine)].join("\n");
}
export function validateRestructure(value, entities, records, ruleRefs = new Map()) {
  const { tags, buckets, byId } = taxonomy(entities), usage = tagUsage(records);
  const created = new Map(), out = [], touched = new Set();
  for (const c of value?.changes || []) {
    if (c.type === "create-category") {
      const name = clip(c.name, 80);
      if (!name || buckets.some((b) => lower(b.name) === lower(name)) || created.has(lower(name))) continue;
      created.set(lower(name), name);
      out.push({ key: "c" + out.length, type: c.type, name, reason: clip(c.reason, 240) });
    }
  }
  // New tags: unique names in their lens, a real or newly created category, vendors that fit the direction.
  const list = vendors(records, entities, 5000), newTags = new Set();
  for (const c of value?.changes || []) {
    if (c.type !== "create-tag") continue;
    const name = clip(c.name, 80), flowType = c.flowType === "income" ? "income" : "expense", key = flowType + ":" + lower(name);
    if (!name || newTags.has(key) || tags.some((t) => flowOf(t) === flowType && lower(t.name) === lower(name))) continue;
    newTags.add(key);
    const target = byId.get(c.category);
    const parentId = flowType === "expense" && target?.kind === "bucket" ? target.id : "", newCategory = flowType === "expense" && !parentId && c.category ? created.get(lower(c.category)) || "" : "";
    const direction = flowType === "income" ? "in" : "out";
    const fits = [...new Set((c.vendors || []).map(String))].map((v) => list.find((g) => g.direction === direction && g.name === v)).filter(Boolean);
    const ids = new Set(fits.flatMap((g) => g.ids)), rows = active(records).filter((r) => ids.has(r.id));
    out.push({ key: "c" + out.length, type: "create-tag", name, flowType, parentId, newCategory, toCategory: newCategory || target?.name || "", vendors: fits.map((g) => ({ name: g.name, count: g.count })), transactions: rows.length, unsorted: rows.filter(untouched).map((r) => r.id), reason: clip(c.reason, 240) });
  }
  for (const c of value?.changes || []) {
    const item = byId.get(c.id), reason = clip(c.reason, 240), key = "c" + out.length;
    if (c.type === "create-category" || c.type === "create-tag" || !item || item.systemRole) continue;
    if (c.type === "rename") {
      const name = clip(c.name, 80);
      if (!name || name === item.name || touched.has("rename:" + item.id)) continue;
      const clash = item.kind === "bucket" ? buckets.some((b) => b.id !== item.id && lower(b.name) === lower(name)) : tags.some((t) => t.id !== item.id && flowOf(t) === flowOf(item) && lower(t.name) === lower(name));
      if (clash) continue;
      touched.add("rename:" + item.id);
      out.push({ key, type: "rename", id: item.id, from: item.name, name, kind: item.kind, reason });
    } else if (c.type === "move") {
      if (item.kind !== "category" || flowOf(item) !== "expense" || touched.has("move:" + item.id)) continue;
      const target = byId.get(c.category);
      const parentId = target?.kind === "bucket" ? target.id : "", newCategory = !parentId && c.category ? created.get(lower(c.category)) || "" : "";
      if (c.category && !parentId && !newCategory) continue;
      if (!newCategory && parentId === (item.parentId || "")) continue;
      touched.add("move:" + item.id);
      out.push({ key, type: "move", id: item.id, name: item.name, fromCategory: byId.get(item.parentId)?.name || "", parentId, newCategory, toCategory: newCategory || target?.name || "", reason });
    } else if (c.type === "merge") {
      const into = byId.get(c.into);
      if (item.kind !== "category" || into?.kind !== "category" || into.id === item.id || into.systemRole || flowOf(into) !== flowOf(item) || touched.has("merge:" + item.id)) continue;
      touched.add("merge:" + item.id);
      out.push({ key, type: "merge", id: item.id, name: item.name, into: into.id, intoName: into.name, transactions: usage.get(item.id)?.count || 0, reason });
    } else if (c.type === "delete") {
      if (touched.has("delete:" + item.id)) continue;
      if (item.kind === "category" && ((usage.get(item.id)?.count || 0) > 0 || ruleRefs.get(item.id))) continue;
      if (out.some((x) => x.type === "merge" && x.into === item.id)) continue;
      touched.add("delete:" + item.id);
      out.push({ key, type: "delete", id: item.id, name: item.name, kind: item.kind, reason });
    }
  }
  // A tag that is merged away takes no other change.
  const merged = new Set(out.filter((c) => c.type === "merge").map((c) => c.id));
  for (let i = out.length - 1; i >= 0; i--) if (!["merge", "create-category", "create-tag"].includes(out[i].type) && merged.has(out[i].id)) out.splice(i, 1);
  // A change that needs another one says so, so the review can keep them together.
  for (const c of out) {
    if ((c.type === "move" || c.type === "create-tag") && c.newCategory) c.needs = out.filter((x) => x.type === "create-category" && x.name === c.newCategory).map((x) => x.key);
    if (c.type === "delete" && c.kind === "bucket") c.needs = out.filter((x) => ["move", "merge", "delete"].includes(x.type) && byId.get(x.id)?.parentId === c.id).map((x) => x.key);
  }
  // A category can only go once every tag in it is moved, merged or deleted by the plan.
  const leaves = (c) => out.some((x) => x.id === c.id && x.key !== c.key && ["move", "merge", "delete"].includes(x.type));
  const kept = out.filter((c) => !(c.type === "delete" && c.kind === "bucket" && tags.some((t) => t.parentId === c.id && !leaves(t))));
  // A merge target that is itself merged or deleted would lose the merge.
  const final = kept.filter((c) => c.type !== "merge" || !kept.some((x) => x.id === c.into && ["merge", "delete"].includes(x.type)));
  return { summary: clip(value?.summary, 600), changes: final };
}

/* ---------- aliases ---------- */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The same sentence-to-pattern rule the Aliases editor uses (compileTextRule in src/import-analysis.mjs). */
export function compileAliasRule({ mode, text }) {
  const e = escapeRegex(String(text || "").trim());
  if (!e) return "";
  return mode === "contains" ? e : mode === "ends" ? `${e}$` : mode === "exact" ? `^${e}$` : `^${e}`;
}
export const aliasSchema = strict({
  suggestions: { type: "array", items: strict({ name: str, mode: { type: "string", enum: ["starts", "contains", "ends", "exact"] }, text: str, reason: str }) },
});
export function aliasPrompt(unaliased, rules, limit = 400) {
  const groups = new Map();
  for (const r of unaliased) { if (r.deleted) continue; const g = groups.get(r.description) || { name: r.description, count: 0 }; g.count++; groups.set(r.description, g); }
  const list = [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
  return [PREAMBLE, "",
    "Task: suggest aliases. An alias gives a readable name to bank descriptions that are really the same merchant or payer, for example \"SQ *BEAN COUNTER 1042\" and \"SQ *BEAN COUNTER 2210\" both become \"Bean Counter\". It only changes how transactions are shown.",
    "Each alias is a readable name plus a plain matching sentence over the original bank description, ignoring case:",
    "- starts: the description starts with text. contains: it contains text. ends: it ends with text. exact: it is exactly text.",
    "Rules:",
    "- Prefer starts with the stable part of the description (drop store numbers, dates, reference codes and card digits).",
    "- The text must not match descriptions of a different merchant, and must not overlap an existing alias.",
    "- Suggest aliases where the readable name is clearly better than the description, most transactions first. At most 25.",
    "- Names are how a person would say the merchant: \"Bean Counter\", \"City Hydro\", \"Paycheque from Northwind\".",
    "", `Existing aliases: ${rules.length ? rules.map((r) => `${r.name} (${r.pattern})`).join("; ") : "none"}`, "",
    `Descriptions without an alias (${list.length}):`, ...list.map((g) => `- "${clip(g.name, 120)}" × ${g.count}`)].join("\n");
}
export function validateAliases(value, preview) {
  const out = [], seen = new Set();
  for (const s of value?.suggestions || []) {
    const name = clip(s.name, 80), text = clip(s.text, 120), mode = ["starts", "contains", "ends", "exact"].includes(s.mode) ? s.mode : "starts";
    const pattern = compileAliasRule({ mode, text });
    if (!name || !pattern || seen.has(pattern) || seen.has(lower(name))) continue;
    seen.add(pattern); seen.add(lower(name));
    let check;
    try { check = preview({ name, pattern }); } catch { continue; }
    const matches = check.matches.filter((m) => !m.deleted);
    if (!matches.length) continue;
    out.push({
      key: "a" + out.length, name, mode, text, pattern, reason: clip(s.reason, 240),
      matches: matches.length, examples: [...new Set(matches.map((m) => m.description))].slice(0, 4),
      conflicts: check.conflicts.length, duplicates: check.duplicates.map((d) => d.name),
    });
  }
  return { suggestions: out };
}

/* ---------- smart organizing for one transaction ---------- */
export const organizeSchema = strict({
  summary: str,
  suggestions: { type: "array", items: strict({
    kind: { type: "string", enum: ["tag", "new-tag", "twin", "settle", "share", "payee", "event"] },
    id: str, name: str, categoryId: str, cents: { type: "integer" }, reason: str, confidence: { type: "string", enum: ["high", "medium", "low"] },
  }) },
});
const LIMITS = { tags: 300, people: 100, events: 60, twins: 10, history: 25 };
/** The context the Organize desk sends, trimmed to known fields and sizes. */
export function cleanOrganizeContext(raw) {
  if (!raw || typeof raw !== "object" || !raw.transaction || typeof raw.transaction !== "object") throw new Error("Choose a transaction to suggest for.");
  const t = raw.transaction, c = raw.candidates || {};
  const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  const cents = (v) => (Number.isSafeInteger(v) ? v : 0);
  const id = (v) => (typeof v === "string" && v.length <= 80 ? v : "");
  return {
    transaction: { id: id(t.id), name: clip(t.name, 120), original: clip(t.original, 160), amountCents: cents(t.amountCents), currency: clip(t.currency || "CAD", 3), date: clip(t.date, 10), account: clip(t.account, 60), unsortedCents: cents(t.unsortedCents), parts: list(t.parts, 12).map((p) => clip(p, 80)) },
    candidates: {
      tags: list(c.tags, LIMITS.tags).map((x) => ({ id: id(x.id), name: clip(x.name), group: clip(x.group) })).filter((x) => x.id),
      people: list(c.people, LIMITS.people).map((x) => ({ id: id(x.id), name: clip(x.name), owesCents: cents(x.owesCents) })).filter((x) => x.id),
      categories: list(c.categories, 60).map((x) => ({ id: id(x.id), name: clip(x.name) })).filter((x) => x.id),
      events: list(c.events, LIMITS.events).map((x) => ({ id: id(x.id), name: clip(x.name), start: clip(x.start, 10), end: clip(x.end, 10), participants: list(x.participants, 20).map((p) => clip(p, 60)) })).filter((x) => x.id),
      twins: list(c.twins, LIMITS.twins).map((x) => ({ id: id(x.id), account: clip(x.account, 60), date: clip(x.date, 10), amountCents: cents(x.amountCents), name: clip(x.name, 120) })).filter((x) => x.id),
    },
    history: list(raw.history, LIMITS.history).map((h) => ({ name: clip(h.name, 120), date: clip(h.date, 10), amountCents: cents(h.amountCents), tags: list(h.tags, 6).map((x) => clip(x, 60)), sharedWith: list(h.sharedWith, 6).map((x) => clip(x, 60)), event: clip(h.event, 60), payee: clip(h.payee, 60), settledBy: clip(h.settledBy, 60), movedTo: clip(h.movedTo, 60) })),
  };
}
export function organizePrompt(ctx) {
  const t = ctx.transaction, c = ctx.candidates, out = t.amountCents < 0;
  const money = (n) => amount(n, t.currency);
  return [PREAMBLE, "",
    "Task: suggest how to organize one bank transaction. The person will confirm each suggestion; suggest only what the evidence supports.",
    "Suggestion kinds (id must come from the matching candidate list):",
    "- tag: what the money was for. cents = the part of the amount it covers; one tag normally covers the whole unsorted amount. Split across tags only when the history shows the same split.",
    "- twin: the same money moving between the person's own accounts (a transfer or card payment). Suggest it when a twin candidate exists and the descriptions look like a transfer or payment, not a purchase. A twin replaces tags.",
    out ? "- share: the expense was shared with a person, who owes part of it. One suggestion per person. cents = 0." : "- settle: a person paying back what they owe the person (only people who owe something). cents = the amount to apply, at most what they owe and the unsorted amount.",
    out ? "- payee: the money was paid to a person (for example an e-transfer to a friend) without splitting it. cents = 0." : null,
    "- new-tag: only when no tag candidate fits and the transaction clearly calls for one (for example a pet store when there is no pet tag). name = a short sentence-case tag name; categoryId = the expense category it belongs in (from the category list) or \"\"; cents as for tag. Never invent a tag that duplicates a candidate.",
    "- event: the transaction belongs to this event (the date falls in or near it and the purchase fits). cents = 0.",
    "Leave id, name and categoryId as \"\" when a kind doesn't use them.",
    "Use the history of similarly named transactions as the strongest evidence. Return at most one twin, one event, one payee and one settle. Return an empty list when nothing fits.",
    "confidence: high when the history or the description makes it clear, medium when it is a good guess, low otherwise.",
    "summary: one short sentence on what this transaction most likely is.",
    "",
    `Transaction: "${t.name}"${t.original && t.original !== t.name ? ` (bank description "${t.original}")` : ""} · ${out ? "money out" : "money in"} ${money(Math.abs(t.amountCents))} · ${t.date} · account ${t.account} · unsorted ${money(t.unsortedCents)}${t.parts.length ? ` · already has: ${t.parts.join(", ")}` : ""}`,
    "",
    `Tag candidates (${out ? "expense" : "income"} tags): ${c.tags.map((x) => `[${x.id}] ${x.name}${x.group ? ` (${x.group})` : ""}`).join("; ") || "none"}`,
    out ? `Expense categories (for a new tag): ${c.categories.map((x) => `[${x.id}] ${x.name}`).join("; ") || "none"}` : null,
    `People: ${c.people.map((x) => `[${x.id}] ${x.name}${!out ? ` owes ${money(x.owesCents)}` : ""}`).join("; ") || "none"}`,
    `Events: ${c.events.map((x) => `[${x.id}] ${x.name} ${x.start} to ${x.end}${x.participants.length ? ` with ${x.participants.join(", ")}` : ""}`).join("; ") || "none"}`,
    `Twin candidates: ${c.twins.map((x) => `[${x.id}] ${x.account} · "${x.name}" · ${x.date} · ${money(x.amountCents)}`).join("; ") || "none"}`,
    "",
    `History of similar transactions (${ctx.history.length}):`,
    ...(ctx.history.length ? ctx.history.map((h) => `- "${h.name}" ${h.date} ${money(h.amountCents)} → ${[h.tags.length ? "tags " + h.tags.join(" + ") : "", h.sharedWith.length ? "shared with " + h.sharedWith.join(", ") : "", h.payee ? "paid " + h.payee : "", h.settledBy ? "settled by " + h.settledBy : "", h.movedTo ? "moved to " + h.movedTo : "", h.event ? "event " + h.event : ""].filter(Boolean).join(" · ") || "nothing recorded"}`) : ["- none"]),
  ].filter((line) => line !== null).join("\n");
}
export function validateOrganize(value, ctx) {
  const t = ctx.transaction, c = ctx.candidates, out = t.amountCents < 0, total = Math.abs(t.amountCents), gap = Math.max(0, t.unsortedCents);
  const has = (list, id) => list.some((x) => x.id === id);
  const picked = [], seen = new Set();
  for (let s of value?.suggestions || []) {
    if (s.kind === "new-tag") {
      const name = clip(s.name, 80), same = c.tags.find((x) => lower(x.name) === lower(name));
      if (!name || picked.some((p) => p.kind === "new-tag")) continue;
      if (same) s = { ...s, kind: "tag", id: same.id };
      else { picked.push({ kind: "new-tag", id: "", name, categoryId: out && has(c.categories, s.categoryId) ? s.categoryId : "", cents: Number.isSafeInteger(s.cents) ? s.cents : 0, reason: clip(s.reason, 200), confidence: ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "medium" }); continue; }
    }
    const key = s.kind + ":" + s.id;
    if (seen.has(key)) continue;
    const ok = s.kind === "tag" ? has(c.tags, s.id)
      : s.kind === "twin" ? has(c.twins, s.id)
      : s.kind === "event" ? has(c.events, s.id)
      : s.kind === "share" || s.kind === "payee" ? out && has(c.people, s.id)
      : s.kind === "settle" ? !out && c.people.some((p) => p.id === s.id && p.owesCents > 0) : false;
    if (!ok) continue;
    if (["twin", "event", "payee", "settle"].includes(s.kind) && picked.some((p) => p.kind === s.kind)) continue;
    seen.add(key);
    picked.push({ kind: s.kind, id: s.id, cents: Number.isSafeInteger(s.cents) ? s.cents : 0, reason: clip(s.reason, 200), confidence: ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "medium" });
  }
  // A move replaces everything that describes spending or income.
  const twin = picked.find((p) => p.kind === "twin");
  let list = twin ? picked.filter((p) => p.kind === "twin" || p.kind === "event") : picked;
  // A new tag is only for when nothing existing fits.
  if (list.some((p) => p.kind === "tag")) list = list.filter((p) => p.kind !== "new-tag");
  // Settling is capped by what is owed and what is left; tags share what remains after it.
  const settle = list.find((p) => p.kind === "settle");
  if (settle) settle.cents = Math.max(1, Math.min(settle.cents > 0 ? settle.cents : gap, gap || total, c.people.find((p) => p.id === settle.id).owesCents));
  const room = Math.max(0, (gap || 0) - (settle?.cents || 0));
  const tags = list.filter((p) => p.kind === "tag" || p.kind === "new-tag");
  if (tags.length === 1) tags[0].cents = room;
  else if (tags.length > 1) {
    const asked = tags.reduce((n, p) => n + Math.max(0, p.cents), 0);
    let left = room;
    tags.forEach((p, i) => { p.cents = i === tags.length - 1 ? left : asked > 0 ? Math.floor((Math.max(0, p.cents) * room) / asked) : Math.floor(room / tags.length); left -= p.cents; });
  }
  list = list.filter((p) => (p.kind !== "tag" && p.kind !== "new-tag") || p.cents > 0);
  for (const p of list) if (!["tag", "new-tag", "settle"].includes(p.kind)) p.cents = 0;
  return { summary: clip(value?.summary, 240), suggestions: list };
}

/* ---------- smart organizing, ten transactions per run ---------- */
// One Codex run per row spends most of its time starting up; a batch shares that cost. Each row keeps its
// own candidates, and each answer is validated against them exactly as a single answer would be.
const suggestionItem = organizeSchema.properties.suggestions.items;
export const organizeBatchSchema = strict({
  results: { type: "array", items: strict({ transactionId: str, summary: str, suggestions: { type: "array", items: suggestionItem } }) },
});
export const BATCH_SIZE = 10;
export function cleanOrganizeBatch(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > BATCH_SIZE) throw new Error(`Send between 1 and ${BATCH_SIZE} transactions.`);
  const ctxs = raw.map(cleanOrganizeContext);
  if (new Set(ctxs.map((c) => c.transaction.id)).size !== ctxs.length || ctxs.some((c) => !c.transaction.id)) throw new Error("Each transaction needs its own id.");
  // Batches keep a shorter history per row so ten rows still fit comfortably.
  return ctxs.map((c) => ({ ...c, history: c.history.slice(0, 10) }));
}
export function organizeBatchPrompt(ctxs) {
  const union = (pick) => [...new Map(ctxs.flatMap(pick).map((x) => [x.id, x])).values()];
  const outTags = union((c) => (c.transaction.amountCents < 0 ? c.candidates.tags : [])), inTags = union((c) => (c.transaction.amountCents > 0 ? c.candidates.tags : []));
  const people = union((c) => c.candidates.people), events = union((c) => c.candidates.events).slice(0, 60), categories = union((c) => c.candidates.categories);
  const tagList = (list) => list.map((x) => `[${x.id}] ${x.name}${x.group ? ` (${x.group})` : ""}`).join("; ") || "none";
  const block = (ctx) => {
    const t = ctx.transaction, c = ctx.candidates, out = t.amountCents < 0, money = (n) => amount(n, t.currency);
    const owing = c.people.filter((p) => p.owesCents > 0);
    return [
      `### Transaction [${t.id}] "${t.name}"${t.original && t.original !== t.name ? ` (bank description "${t.original}")` : ""} · ${out ? "money out" : "money in"} ${money(Math.abs(t.amountCents))} · ${t.date} · account ${t.account} · unsorted ${money(t.unsortedCents)}${t.parts.length ? ` · already has: ${t.parts.join(", ")}` : ""}`,
      `Twin candidates: ${c.twins.map((x) => `[${x.id}] ${x.account} · "${x.name}" · ${x.date} · ${money(x.amountCents)}`).join("; ") || "none"}`,
      !out ? `People who owe money: ${owing.map((p) => `[${p.id}] ${p.name} owes ${money(p.owesCents)}`).join("; ") || "nobody"}` : null,
      `History: ${ctx.history.length ? ctx.history.map((h) => `"${h.name}" ${h.date} → ${[h.tags.length ? "tags " + h.tags.join(" + ") : "", h.sharedWith.length ? "shared with " + h.sharedWith.join(", ") : "", h.payee ? "paid " + h.payee : "", h.settledBy ? "settled by " + h.settledBy : "", h.movedTo ? "moved to " + h.movedTo : "", h.event ? "event " + h.event : ""].filter(Boolean).join(" · ") || "nothing recorded"}`).join(" | ") : "none"}`,
    ].filter((line) => line !== null).join("\n");
  };
  return [PREAMBLE, "",
    `Task: suggest how to organize each of these ${ctxs.length} bank transactions. Answer every one, with its id in transactionId. Suggest only what the evidence supports.`,
    "Suggestion kinds (id must come from the matching list):",
    "- tag: what the money was for, from the expense tags for money out or the income tags for money in. cents = the part it covers; one tag normally covers the whole unsorted amount.",
    "- twin: the same money moving between the person's own accounts, from that transaction's twin candidates, when the descriptions look like a transfer or card payment. A twin replaces tags.",
    "- settle (money in only): a person paying back what they owe, from that transaction's people who owe money. cents = the amount to apply.",
    "- share (money out only): the expense was shared with a person who owes part of it. One per person. cents = 0.",
    "- payee (money out only): the money was paid to a person without splitting it, for example an e-transfer to a friend. cents = 0.",
    "- new-tag: only when no existing tag fits and the transaction clearly calls for one. name = a short sentence-case name; categoryId = an expense category id or \"\"; cents as for tag. Use the same name for the same kind of purchase across transactions.",
    "- event: the transaction belongs to an event whose dates it falls in or near and whose purpose it fits. cents = 0.",
    "Leave id, name and categoryId as \"\" when a kind doesn't use them. At most one twin, event, payee and settle per transaction. An empty list is fine.",
    "Use each transaction's history of similar transactions as the strongest evidence. confidence: high when the history or description makes it clear, medium for a good guess, low otherwise. summary: one short sentence per transaction.",
    "",
    `Expense tags: ${tagList(outTags)}`,
    `Income tags: ${tagList(inTags)}`,
    `Expense categories (for a new tag): ${categories.map((x) => `[${x.id}] ${x.name}`).join("; ") || "none"}`,
    `People: ${people.map((x) => `[${x.id}] ${x.name}`).join("; ") || "none"}`,
    `Events: ${events.map((x) => `[${x.id}] ${x.name} ${x.start} to ${x.end}${x.participants.length ? ` with ${x.participants.join(", ")}` : ""}`).join("; ") || "none"}`,
    "", ...ctxs.map(block).join("\n\n").split("\n")].join("\n");
}

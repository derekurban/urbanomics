import { Icon } from "@derekurban/design-system";
import { AppearanceWorkspace } from "./AppearanceWorkspace.jsx";
import { AboutWorkspace } from "./AboutWorkspace.jsx";
import { AdminWorkspace } from "./AdminWorkspace.jsx";
import { categoryColors } from "./category-colors.js";
import React, { useEffect, useMemo, useState } from "react";
import { TagHierarchy } from "./TagHierarchy.jsx";
import { EntityEditor } from "./EntityEditor.jsx";
import { AliasesWorkspace } from "./AliasesWorkspace.jsx";
import { RulesWorkspace } from "./RulesWorkspace.jsx";
import { TransferLab } from "./TransferLab.jsx";
import { AssistantWorkspace } from "./AssistantWorkspace.jsx";
import { TagSuggestions } from "./TagSuggestions.jsx";
import { AliasSuggestions } from "./AliasSuggestions.jsx";
import { SetupChecklist } from "./SetupChecklist.jsx";
import { useAssistant, readiness } from "./assistant.js";
import { notify } from "./toast.jsx";
import { palette } from "./snapshots-v2-atoms.jsx";
import { Alert, PageTabs, PersonAvatar } from "./ui.jsx";
import { plural } from "./format.js";
import "./organize-workspace.css";

const api = window.urbanomics;
// Everyday sections first, maintenance last. The id stays "admin" so older addresses keep working.
const sections = [
  ["category", "Categories & tags", "Tags say what a transaction is; categories group expense tags for the Dashboard, and each category's palette colours its tags."],
  ["person", "People", "People you share expenses with or who pay you back. Shares and repayments on the Organize desk refer to them."],
  ["aliases", "Aliases", "Readable names for bank descriptions. They change how transactions are shown, never the original records."],
  ["rules", "Rules", "Tags and people applied to new imports whose bank description matches. Transactions you already have change only when you apply a rule to them."],
  ["transfers", "Transfers", "How Organize finds the other half of a transfer between your accounts. It offers matches within these settings; nothing links without you."],
  ["assistant", "Assistant", "Suggestions from Claude, through your own Anthropic API key. Claude reads only what a feature needs, and nothing changes until you approve it."],
  ["appearance", "Appearance", "Light, dark, or the same as this device."],
  ["about", "About", "Which version this is and how it updates."],
  ["admin", "Maintenance", "A backup of the whole workspace, and changes across all of it for starting over. Each change shows what it touches first and keeps a recovery copy."],
];

/* Resolves a promise-returning call so a missing or throwing API surfaces as
   a rejection instead of breaking the render. */
function attempt(fn) {
  try {
    return Promise.resolve(fn());
  } catch (e) {
    return Promise.reject(e);
  }
}

export function OrganizeWorkspace({ data, run, busy, section, onSection, onNavigate, onSource }) {
  const [state, setState] = useState(null),
    [query, setQuery] = useState(""),
    [unusedOnly, setUnusedOnly] = useState(false),
    [editing, setEditing] = useState(null),
    [error, setError] = useState("");
  const [suggesting, setSuggesting] = useState(null), assistant = useAssistant();
  const [extras, setExtras] = useState(null),
    [extrasError, setExtrasError] = useState("");
  useEffect(() => {
    let live = true;
    api.reviewState().then((s) => { if (live) setState(s); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data]);
  useEffect(() => {
    let live = true;
    setExtras(null);
    setExtrasError("");
    attempt(() => api.transactionRulesState()).then(
      (rules) => { if (live) setExtras({ rules }); },
      (e) => { if (live) { setExtras({ rules: null }); setExtrasError(e?.message || String(e)); } },
    );
    return () => { live = false; };
  }, [data]);

  const entities = categoryColors(state?.entities || []),
    records = state?.records || [];
  /* Per-entity usage, counting each transaction once per entity it touches. */
  const usage = useMemo(() => {
    const map = new Map();
    for (const row of records) {
      const review = row.review || {},
        seen = new Set();
      for (const t of review.tags || []) seen.add(t.id);
      for (const g of review.groups || []) seen.add(g);
      if (review.personId) seen.add(review.personId);
      if (review.assignedPersonId) seen.add(review.assignedPersonId);
      for (const s of review.shares || []) seen.add(s.id);
      for (const id of seen) {
        const u = map.get(id) || { active: 0, archived: 0 };
        if (row.deleted) u.archived += 1;
        else u.active += 1;
        map.set(id, u);
      }
    }
    for (const rule of extras?.rules?.rules || []) {
      for (const id of [rule.categoryId, rule.personId, ...(rule.template?.tags || []).map((p) => p.id), ...(rule.template?.groups || [])].filter(Boolean)) {
        const u = map.get(id) || { active: 0, archived: 0 };
        u.rules = (u.rules || 0) + 1;
        map.set(id, u);
      }
    }
    return map;
  }, [records, extras]);
  const usageOf = (id) => { const u = usage.get(id); return u ? { transactions: u.active + u.archived, rules: u.rules || 0 } : { transactions: 0, rules: 0 }; };

  const people = entities.filter((e) => e.kind === "person");
  const unusedCount = people.filter((e) => !usage.get(e.id)).length;
  const shown = people.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()) && (!unusedOnly || !usage.get(e.id)));
  const current = sections.find(([id]) => id === section) || sections[0];

  function go(id) {
    if (id === "accounts" || id === "group") { onNavigate(id === "group" ? "events" : "accounts"); return; }
    onSection(id);
    setQuery("");
    setUnusedOnly(false);
    setError("");
  }
  // Suggestions need an API key and consent; otherwise point to the Assistant section.
  function suggest(mode) {
    const ready = readiness(assistant.state);
    if (!ready.ok) { notify({ id: "assistant-setup", title: "Claude isn't ready", description: ready.reason, tone: "warning", action: { label: "Set up Claude", onClick: () => go("assistant") } }); return; }
    setSuggesting(mode);
  }
  function edit(entity) {
    setError("");
    setEditing(entity);
  }
  async function act(fn) {
    setError("");
    return run(async () => {
      try {
        const result = await fn();
        setState(await api.reviewState());
        return result;
      } catch (e) {
        setError(e.message);
        throw e;
      }
    });
  }
  return (
    <div className="organize-workspace settings-workspace workspace-page">
      <div className="page-heading"><div><h1>Settings</h1></div></div>
      <SetupChecklist steps={state && assistant.state ? [
        { id: "import", label: "Import a bank export", done: records.length > 0, go: () => onNavigate("snapshots") },
        { id: "people", label: "Add people you share with", done: people.length > 0, go: () => go("person") },
        { id: "tags", label: "Name your tags", done: entities.some((e) => e.kind === "category" && !e.systemRole), go: () => go("category") },
        { id: "claude", label: "Connect Claude", done: !!assistant.state.claude?.ok, go: () => go("assistant") },
      ] : null} />
      <PageTabs label="Settings sections" value={current[0]} onChange={go} items={sections.map(([value, label]) => ({ value, label }))} />
      <div className="settings-body">
      <div className="settings-intro">
        <p>{current[2]}</p>
      </div>
      {extrasError && <Alert>{extrasError}</Alert>}
      {section === "assistant" ? <AssistantWorkspace /> : section === "about" ? <AboutWorkspace /> : section === "appearance" ? <AppearanceWorkspace /> : section === "admin" ? (
        <AdminWorkspace data={data} act={act} busy={busy} />
      ) : section === "aliases" ? (
        <AliasesWorkspace data={data} run={run} busy={busy} onAccounts={() => go("accounts")} onSuggest={() => suggest("aliases")} />
      ) : section === "transfers" ? (
        <TransferLab records={records} act={act} busy={busy || !state} onSource={onSource || (() => {})} />
      ) : section === "rules" ? (
        <RulesWorkspace data={data} run={run} busy={busy} onSection={go} onNavigate={onNavigate} />
      ) : section === "person" ? (
        <section className="settings-people" aria-label="People">
          <div className="og-toolbar">
            {people.length > 6 && <input type="search" aria-label="Search people" placeholder="Find a person" value={query} onChange={(e) => setQuery(e.target.value)} />}
            {people.length > 6 && unusedCount > 0 && <button className="sm" aria-pressed={unusedOnly} onClick={() => setUnusedOnly((v) => !v)}>Unused only · {unusedCount}</button>}
            <button className="primary" disabled={busy || !state} onClick={() => edit({ kind: "person", color: palette[people.length % palette.length] })}>
              <Icon name="plus" size={16} />New person
            </button>
          </div>
          {error && !editing && <Alert onDismiss={() => setError("")}>{error}</Alert>}
          {!state ? (
            <p role="status">{error ? "People couldn't be loaded." : "Loading people…"}</p>
          ) : !people.length ? (
            <div className="empty-state">
              <Icon name="users" size={24} />
              <h2>No people yet.</h2>
              <p>Add the people you share costs with. You can then split an expense with them, or apply money they send you to what they owe.</p>
            </div>
          ) : !shown.length ? (
            <p className="form-help">{query ? "No one by that name." : "Everyone is in use."}</p>
          ) : (
            <div className="og-rows">
              {shown.map((person) => {
                const u = usageOf(person.id), archived = usage.get(person.id)?.archived || 0;
                return (
                  <article className="og-row" key={person.id}>
                    <PersonAvatar name={person.name} size={32} />
                    <div className="og-row-body">
                      <h3 title={person.name}>{person.name}</h3>
                      <small>
                        {u.transactions || u.rules
                          ? [u.transactions ? plural(u.transactions, "transaction") : "", u.rules ? plural(u.rules, "rule") : "", archived ? `${archived} in deleted accounts` : ""].filter(Boolean).join(" · ")
                          : "Not on any transaction or rule yet"}
                      </small>
                    </div>
                    <button className="sm" disabled={busy} aria-label={`Edit person ${person.name}`} onClick={() => edit(person)}>Edit</button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <TagHierarchy entities={entities} usage={usage} edit={edit} act={act} busy={busy || !state} error={editing ? "" : error} onSuggest={suggest} />
      )}
      </div>
      {(suggesting === "missing" || suggesting === "restructure") && <TagSuggestions mode={suggesting} entities={entities} onClose={() => setSuggesting(null)} />}
      {suggesting === "aliases" && <AliasSuggestions onClose={() => setSuggesting(null)} />}
      {editing && (
        <EntityEditor
          key={editing.id || editing.kind}
          entity={editing}
          entities={entities}
          act={act}
          error={error}
          usage={editing.id ? usageOf(editing.id) : null}
          onClose={() => { setEditing(null); setError(""); }}
        />
      )}
    </div>
  );
}

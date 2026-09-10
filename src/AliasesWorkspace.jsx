import React, { useEffect, useRef, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { money } from "./review-model.js";
import "./aliases-workspace.css";
const api = window.urbanomics;

function AliasEditor({ rule, accounts, act, onClose }) {
  const [draft, setDraft] = useState({
    name: "",
    pattern: "",
    accountId: "",
    ...rule,
  });
  const [preview, setPreview] = useState(null),
    [tested, setTested] = useState("");
  const [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [confirm, setConfirm] = useState(false);
  const saving = useRef(false);
  const signature = JSON.stringify(draft),
    fresh = tested === signature && preview;
  const blocked =
    !fresh || preview.conflicts.length > 0 || preview.duplicates.length > 0;
  const update = (key, value) => {
    setDraft({ ...draft, [key]: value });
    setError("");
  };
  const close = () => {
    if (!saving.current) onClose();
  };
  async function test() {
    setWorking(true);
    setError("");
    try {
      const result = await api.previewAlias(draft);
      setPreview(result);
      setTested(signature);
      setPage(0);
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setWorking(false);
    }
  }
  async function mutate(fn) {
    if (saving.current) return;
    saving.current = true;
    setWorking(true);
    setError("");
    try {
      if ((await act(fn)) !== false) onClose();
    } catch (e) {
      setError(e.message);
      setTested("");
    } finally {
      saving.current = false;
      setWorking(false);
    }
  }
  const results = fresh
    ? preview.matches.filter((r) =>
        `${r.description} ${r.account} ${r.date}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : [];
  const pages = Math.max(1, Math.ceil(results.length / 25)),
    current = Math.min(page, pages - 1);
  return (
    <WorkspaceModal
      title={rule.id ? "Edit transaction alias" : "New transaction alias"}
      onClose={close}
      footer={
        <div className="rv-modal-actions">
          {rule.id && (
            <button
              disabled={working}
              className="account-delete-link"
              onClick={() => setConfirm(true)}
            >
              Delete alias
            </button>
          )}
          <button disabled={working} onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={working || blocked}
            onClick={() => mutate(() => api.saveAlias(draft))}
          >
            Save alias
          </button>
        </div>
      }
    >
      <fieldset disabled={working} className="al-fields">
        <label>
          Readable name
          <input
            maxLength={80}
            placeholder="e.g. Juniper"
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>
        <label>
          Description regex
          <input
            className="al-regex"
            maxLength={256}
            spellCheck={false}
            placeholder={"e.g. ^JUNIPER(?:\\s|$)"}
            value={draft.pattern}
            onChange={(e) => update("pattern", e.target.value)}
          />
        </label>
        <label>
          Apply in
          <select
            value={draft.accountId}
            onChange={(e) => update("accountId", e.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.deletedAt ? " (deleted)" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="rv-help">
          Matches original bank descriptions, ignoring capitalization. Use ^ and
          $ to anchor a match. RE2 syntax; no / delimiters, lookarounds or
          backreferences.
        </p>
        <button
          onClick={test}
          disabled={working || !draft.name.trim() || !draft.pattern.trim()}
        >
          {working && !saving.current
            ? "Checking…"
            : "Test against transactions"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="dr-error-text">
          {error}
        </p>
      )}
      {fresh && (
        <section className="al-preview" aria-label="Alias preview">
          <div className="al-summary" role="status">
            <strong>
              {preview.matches.length}{" "}
              {preview.matches.length === 1 ? "match" : "matches"}
            </strong>
            <span>{preview.conflicts.length} conflicting transactions</span>
            <small>
              {preview.checked} checked · all months, including deleted accounts
            </small>
          </div>
          {!!preview.duplicates.length && (
            <p className="dr-error-text" role="alert">
              Name or pattern already used in this account scope:{" "}
              {preview.duplicates.map((r) => r.name).join(", ")}.
            </p>
          )}
          {preview.conflicts.length > 0 && (
            <p className="dr-error-text">
              Refine the pattern or account scope to remove competing matches
              before saving.
            </p>
          )}
          {!preview.matches.length && (
            <p>
              No existing transactions match. You can save this rule for future
              imports.
            </p>
          )}
          {!!preview.matches.length && (
            <>
              <input
                aria-label="Search matched transactions"
                placeholder="Find a match…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
              <div className="al-results">
                {results.slice(current * 25, current * 25 + 25).map((r) => (
                  <article
                    key={r.id}
                    className={r.conflicts.length ? "al-conflict" : ""}
                  >
                    <div>
                      <strong>{r.description}</strong>
                      <small>
                        {r.account}
                        {r.deleted ? " (deleted)" : ""} · {r.date}
                      </small>
                      <span className="al-after">→ {draft.name}</span>
                      {r.conflicts.map((c) => (
                        <span key={c.id} className="al-competing">
                          Also matches {c.name} · <code>{c.pattern}</code>
                        </span>
                      ))}
                    </div>
                    <span>{money(r.amountCents)}</span>
                  </article>
                ))}
              </div>
              {pages > 1 && (
                <div className="al-pages">
                  <button
                    disabled={!current}
                    onClick={() => setPage(current - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {current + 1} / {pages}
                  </span>
                  <button
                    disabled={current === pages - 1}
                    onClick={() => setPage(current + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
          <p className="rv-help">
            This checks existing transactions. Future overlaps are flagged and
            keep the original name until resolved.
          </p>
        </section>
      )}
      {!fresh && preview && (
        <p className="rv-help">Test your changes again before saving.</p>
      )}
      {confirm && (
        <div className="rv-confirm">
          <p>
            Delete this alias? Its transactions will show their original names,
            or another unique matching alias. Financial decisions stay intact.
          </p>
          <button
            disabled={working}
            className="danger"
            onClick={() => mutate(() => api.removeAlias(rule.id, rule.version))}
          >
            Confirm deletion
          </button>
          <button disabled={working} onClick={() => setConfirm(false)}>
            Keep alias
          </button>
        </div>
      )}
    </WorkspaceModal>
  );
}

export function AliasesWorkspace({ data, run, busy, onAccounts }) {
  const [state, setState] = useState(null),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    let live = true;
    api
      .aliases()
      .then((s) => {
        if (live) setState(s);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [data]);
  async function act(fn) {
    let failure;
    const result = await run(async () => {
      try {
        const result = await fn();
        setState(await api.aliases());
        return result;
      } catch (e) {
        failure = e;
        throw e;
      }
    });
    if (failure) throw failure;
    return result;
  }
  const accounts = [...data.accounts, ...(data.deletedAccounts || [])];
  const rules = (state?.rules || []).filter((r) =>
    `${r.name} ${r.pattern}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="aliases-workspace">
      <div className="og-heading">
        <div>
          <h2>Aliases</h2>
          <p>Turn bank descriptions into names you recognize.</p>
        </div>
        <button
          className="primary"
          disabled={busy || !state}
          onClick={() => setEditing({})}
        >
          + New transaction alias
        </button>
      </div>
      <div className="al-account-link">
        <div>
          <strong>Account aliases</strong>
          <small>
            Account names and filename-prefix rules live in Accounts.
          </small>
        </div>
        <button onClick={onAccounts}>Manage account aliases</button>
      </div>
      {error && (
        <p role="alert" className="dr-error-text">
          {error}
        </p>
      )}
      {!!state?.conflicts.length && (
        <details className="al-conflict-panel" open>
          <summary>
            {state.conflicts.length}{" "}
            {state.conflicts.length === 1
              ? "transaction has"
              : "transactions have"}{" "}
            competing aliases
          </summary>
          <p>
            These keep their original names. Edit or delete a competing rule to
            resolve them.
          </p>
          {state.conflicts.map((r) => (
            <div key={r.id}>
              <strong>{r.description}</strong>
              <small>
                {r.account} · {r.date}
              </small>
              <div>
                {r.aliasConflicts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      setEditing(state.rules.find((rule) => rule.id === c.id))
                    }
                  >
                    Edit {c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </details>
      )}
      <input
        className="og-search"
        aria-label="Search aliases"
        placeholder="Find a name or regex…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!state ? (
        <p>Loading aliases…</p>
      ) : !rules.length ? (
        <div className="og-empty">
          <h3>
            {query
              ? "No matching aliases."
              : "A familiar name for every transaction."}
          </h3>
          <p>Create a regex rule and preview its matches before saving.</p>
        </div>
      ) : (
        <div className="og-list">
          {rules.map((r) => (
            <article className="og-item" key={r.id}>
              <div className="og-item-body">
                <h3>{r.name}</h3>
                <code>{r.pattern}</code>
                <small className="al-rule-info">
                  {accounts.find((a) => a.id === r.accountId)?.name ||
                    "All accounts"}{" "}
                  · {r.matched} matched
                  {r.conflicts ? ` · ${r.conflicts} conflicts` : ""}
                </small>
              </div>
              <button
                disabled={busy}
                aria-label={`Edit alias ${r.name}`}
                onClick={() => setEditing(r)}
              >
                Edit
              </button>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <AliasEditor
          key={editing.id || "new"}
          rule={editing}
          accounts={accounts}
          act={act}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

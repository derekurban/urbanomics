import React, { useEffect, useState } from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";

const api = window.urbanomics;
const palette = [
  "#427A64",
  "#6883C5",
  "#B87654",
  "#9674B7",
  "#BE6684",
  "#529BA5",
  "#A38A38",
  "#687786",
];
const banks = { pc: "PC Financial", eq: "EQ Bank", simplii: "Simplii" };

function AccountEditor({ account, busy, run, onClose }) {
  const [name, setName] = useState(account?.name || ""),
    [schema, setSchema] = useState(account?.schema || "pc");
  const [kind, setKind] = useState(account?.kind || "chequing");
  const [prefixRegex, setPrefix] = useState(account?.prefixRegex || ""),
    [color, setColor] = useState(account?.color || palette[0]);
  const [filename, setFilename] = useState(""),
    [test, setTest] = useState(null);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    let active = true;
    setTest(null);
    const timer = setTimeout(
      () =>
        api
          .testPrefix(prefixRegex, filename)
          .then((result) => {
            if (active)
              setTest({
                text: !prefixRegex.trim()
                  ? "No prefix rule. Choose an account when uploading."
                  : !filename
                    ? "Valid pattern. Enter a filename to try it."
                    : result.matches
                      ? "Matches this prefix."
                      : "Does not match this prefix.",
                valid: true,
              });
          })
          .catch((error) => {
            if (active) setTest({ text: error.message, valid: false });
          }),
      160,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [prefixRegex, filename]);
  return (
    <WorkspaceModal
      title={account ? "Edit account" : "Add account"}
      onClose={onClose}
    >
      <form
        className="account-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          const values = { name, prefixRegex, color };
          setSaveError("");
          const saved = await run(async () => {
            try {
              return account
                ? await api.updateAccount(account.id, values)
                : await api.addAccount(name, schema, kind, values);
            } catch (error) {
              setSaveError(error.message);
              throw error;
            }
          }, "Account saved. Matching unassigned files are ready to process.");
          if (saved !== false) onClose();
        }}
      >
        <label>
          Account name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Everyday savings"
          />
        </label>
        {account ? (
          <p className="muted">
            {banks[schema]} · {kind === "credit" ? "Credit card" : kind}
          </p>
        ) : (
          <>
            <fieldset>
              <legend>Bank export format</legend>
              <div className="account-options">
                {Object.entries(banks).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={schema === id}
                    onClick={() => setSchema(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Account type</legend>
              <div className="account-options">
                {["chequing", "savings", "credit"].map((id) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={kind === id}
                    onClick={() => setKind(id)}
                  >
                    {id === "credit" ? "Credit card" : id}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}
        <fieldset>
          <legend>Account color</legend>
          <div className="account-colors">
            {palette.map((value) => (
              <button
                type="button"
                key={value}
                aria-label={`Color ${value}`}
                aria-pressed={color.toUpperCase() === value}
                style={{ "--account-color": value }}
                onClick={() => setColor(value)}
              >
                {color.toUpperCase() === value ? "✓" : ""}
              </button>
            ))}
            <label className="custom-color">
              Custom
              <input
                type="color"
                aria-label="Custom account color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <label>
          Filename prefix regex
          <input
            spellCheck={false}
            maxLength={256}
            value={prefixRegex}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="pc[_-]mastercard"
          />
        </label>
        <p className="field-help">
          Matches the start of a filename, ignoring capitalization. For example,{" "}
          <code>pc[_-]mastercard</code> matches{" "}
          <code>PC_Mastercard_2026-08.csv</code>. Leave blank for manual
          assignment or remembered filenames.
        </p>
        <label>
          Try a filename
          <input
            spellCheck={false}
            maxLength={255}
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="PC_Mastercard_2026-08.csv"
          />
        </label>
        <p
          className={`prefix-feedback ${test?.valid === false ? "invalid" : ""}`}
          role="status"
        >
          {test?.text || "Checking pattern…"}
        </p>
        <details>
          <summary>Pattern syntax & matching</summary>
          <p>
            Use RE2 syntax without / delimiters. Character classes, groups and
            alternatives are supported; lookarounds and backreferences are not.
            Matching uses the bank format too. Conflicting rules ask for review.
            Previously imported originals keep their account, and files already
            assigned stay assigned.
          </p>
        </details>
        {saveError && (
          <p className="dr-error-text" role="alert">
            {saveError}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || !name.trim() || !test?.valid}
          >
            Save account
          </button>
        </footer>
      </form>
    </WorkspaceModal>
  );
}

export function AccountSettings({ data, busy, run }) {
  const [editing, setEditing] = useState(null);
  return (
    <>
      <div className="account-section-heading">
        <p className="muted">
          Names, colors and routing for your bank exports.
        </p>
        <button disabled={busy} onClick={() => setEditing({})}>
          + Add account
        </button>
      </div>
      <div className="account-grid">
        {data.accounts.map((account) => (
          <article
            className="account-card editable-account"
            key={account.id}
            style={{ "--account-color": account.color }}
          >
            <span className="account-symbol">
              {account.name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
            <h2>{account.name}</h2>
            <p>
              {banks[account.schema]} ·{" "}
              {account.kind === "credit" ? "Credit card" : account.kind}
            </p>
            <code className="account-prefix">
              {account.prefixRegex || "No prefix regex"}
            </code>
            <button
              disabled={busy}
              aria-label={`Edit ${account.name}`}
              onClick={() => setEditing(account)}
            >
              Edit account
            </button>
          </article>
        ))}
      </div>
      {!data.accounts.length && (
        <p className="empty-text">
          Add your accounts now, or assign them when you upload an export.
        </p>
      )}
      {editing && (
        <AccountEditor
          account={editing.id ? editing : null}
          busy={busy}
          run={run}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

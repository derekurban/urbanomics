import { Icon } from "@derekurban/design-system";
import React, { useEffect, useState, useId } from "react";
import {
  AccountDot,
  api,
  bankNames,
  defaultPrefix,
  escapeRegex,
  InfoDot,
  palette,
  PatternLegend,
  PatternSegments,
  Sv2Dialog,
} from "./snapshots-v2-atoms.jsx";

const stemOf = (filename) => {
  const base = filename.replace(/\.[^.]+$/, "");
  const stem = base.split(/\d/)[0].replace(/[\s_-]+$/, "");
  return stem.length >= 3 && stem.length < base.length ? stem : "";
};

export function PrefixField({ job, pattern, onChange, target = "account", compact = false }) {
  const [test, setTest] = useState(null),
    [patternError, setPatternError] = useState("");
  useEffect(() => {
    if (!pattern.trim()) {
      setTest(null);
      setPatternError("");
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      api
        .testPrefix(pattern, job.filename)
        .then((result) => {
          if (!active) return;
          setTest(result);
          setPatternError("");
        })
        .catch((error) => {
          if (!active) return;
          setTest(null);
          setPatternError(error.message);
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pattern, job.filename]);
  const stem = stemOf(job.filename);
  return (
    <div className="sv2-prefix">
      <label className="sv2-field sv2-field-wide">
        <span>
          Filename rule
          <InfoDot label="Filename rule">
            <span>
              A pattern matched against future filenames. <code>^</code> means
              “starts with” and <code>.*</code> means “then anything”. Leave it
              empty to choose this {target} by hand each time.
            </span>
          </InfoDot>
        </span>
        <input
          value={pattern}
          spellCheck={false}
          maxLength={256}
          placeholder="^bank_chequing_.*"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {!compact && <div className="sv2-prefix-presets">
        <button type="button" onClick={() => onChange(defaultPrefix(job.filename))}>
          This filename
        </button>
        {stem && (
          <button
            type="button"
            onClick={() => onChange(`^${escapeRegex(stem)}.*`)}
          >
            Anything starting “{stem}”
          </button>
        )}
        <button type="button" className="sv2-inline" onClick={() => onChange("")}>
          No rule
        </button>
      </div>
      }
      {patternError ? (
        <p className="sv2-error" role="alert">
          {patternError}
        </p>
      ) : !pattern.trim() ? (
        <p className="sv2-quiet">
          No rule. You will choose this {target} by hand each time.
        </p>
      ) : (
        <div className="sv2-prefix-result" role="status">
          <PatternSegments result={test} filename={job.filename} />
          <PatternLegend />
          {test?.matches === false && <p className="sv2-quiet">This rule does not match this file.</p>}
        </div>
      )}
    </div>
  );
}

export function AccountDialog({ mode, job, account, busy, run, onClose, onCreated, newColor }) {
  const [name, setName] = useState(account?.name || ""),
    [kind, setKind] = useState(account?.kind || ""),
    [color, setColor] = useState(account?.color || newColor || palette[0]),
    [pattern, setPattern] = useState(
      account?.prefixRegex ?? defaultPrefix(job.filename),
    ),
    [formError, setFormError] = useState("");
  const formId=useId();
  const editing = mode === "edit";
  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    const values = { prefixRegex: pattern.trim(), color };
    const saved = await run(async () => {
      try {
        if (editing)
          return await api.updateAccount(account.id, {
            name: name.trim(),
            kind: kind.trim(),
            ...values,
          });
        const id = await api.addAccount(name.trim(), job.schema, kind.trim(), values);
        await api.assignImportAccount(job.id, id);
        return id;
      } catch (error) {
        setFormError(error.message);
        throw error;
      }
    }, editing ? `${name.trim()} updated.` : `${name.trim()} created and assigned to ${job.filename}.`);
    if (saved !== false) {
      onCreated?.(saved);
      onClose();
    }
  };
  return (
    <Sv2Dialog
      title={editing ? `Edit ${account.name}` : "New account"}
      footer={        <div className="sv2-form-foot">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="primary" disabled={busy || !name.trim()}>
            {editing ? "Save account" : "Create account"}
          </button>
        </div>}
      onClose={onClose}
    >
      <form id={formId} className="sv2-form" onSubmit={submit}>
        {editing && (
          <p className="sv2-quiet">Imported months are not changed.</p>
        )}
        <label className="sv2-field sv2-field-wide">
          <span>Name</span>
          <input
            required
            maxLength={80}
            value={name}
            placeholder="Everyday chequing"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="sv2-field sv2-field-wide">
          <span>
            Type<em>optional</em><InfoDot label="Account type">A label for you, such as chequing or credit card.</InfoDot>
          </span>
          <input
            maxLength={40}
            value={kind}
            placeholder="Chequing, Mastercard, joint savings…"
            onChange={(event) => setKind(event.target.value)}
          />

        </label>
        <fieldset className="sv2-fieldset">
          <legend>Color</legend>
          <div className="sv2-colors">
            {palette.map((value) => (
              <button
                type="button"
                key={value}
                aria-label={`Color ${value}`}
                aria-pressed={color.toUpperCase() === value}
                style={{ "--sv2-account": value }}
                onClick={() => setColor(value)}
              >
                {color.toUpperCase() === value ? <Icon name="check" size={14} /> : ""}
              </button>
            ))}
            <label className="sv2-custom-color">
              Custom
              <input
                type="color"
                aria-label="Custom account colour"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <PrefixField job={job} pattern={pattern} onChange={setPattern} />
        {formError && (
          <p className="sv2-error" role="alert">
            {formError}
          </p>
        )}

      </form>
    </Sv2Dialog>
  );
}

export function AccountsStep({ jobs, accounts, busy, run, layoutName, compact = false }) {
  const [dialog, setDialog] = useState(null),
    [matches, setMatches] = useState({});
  const byId = Object.fromEntries(accounts.map((account) => [account.id, account]));
  const pairs = jobs
    .filter((job) => job.accountId)
    .map((job) => ({
      id: job.id,
      filename: job.filename,
      pattern: byId[job.accountId]?.prefixRegex || "",
    }));
  const pairKey = pairs.map((pair) => `${pair.id}|${pair.pattern}`).join("~");
  useEffect(() => {
    let active = true;
    Promise.all(
      pairs.map(async (pair) => {
        if (!pair.pattern) return [pair.id, null];
        try {
          const result = await api.testPrefix(pair.pattern, pair.filename);
          return [pair.id, !!result.matches];
        } catch {
          return [pair.id, null];
        }
      }),
    ).then((entries) => {
      if (active) setMatches(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [pairKey]);

  return (
    <div className="sv2-assign">
      {jobs.map((job, index) => {
        const account = job.accountId ? byId[job.accountId] : null;
        const remembered = matches[job.id];
        return (
          <article
            className={`sv2-assign-row${account ? " sv2-assigned" : ""}`}
            key={job.id}
            style={{ "--i": index, "--sv2-account": account?.color }}
          >
            {!compact && (
              <div className="sv2-assign-file">
                <strong>{job.filename}</strong>
                <small>{layoutName(job)}</small>
              </div>
            )}
            <div
              className="sv2-assign-choices"
              role="group"
              aria-label={`Account for ${job.filename}`}
            >
              {accounts.map((one) => (
                <button
                  type="button"
                  key={one.id}
                  className="sv2-account-chip"
                  aria-pressed={job.accountId === one.id}
                  style={{ "--sv2-account": one.color }}
                  disabled={busy}
                  onClick={() =>
                    job.accountId === one.id
                      ? undefined
                      : run(
                          () => api.assignImportAccount(job.id, one.id),
                          `${job.filename} will go to ${one.name}.`,
                        )
                  }
                >
                  <AccountDot color={one.color} />
                  {one.name}
                </button>
              ))}
              <button
                type="button"
                className="sv2-account-new"
                disabled={busy}
                onClick={() => setDialog({ mode: "new", job })}
              >
                + New account
              </button>
            </div>
            {account && (
              <p className="sv2-assign-note">
                {remembered === false ? (
                  <>
                    Files named like this will not go to {account.name} on their own
                    next time.
                    <button
                      type="button"
                      className="sv2-inline"
                      onClick={() => setDialog({ mode: "edit", job, account })}
                    >
                      Remember it
                    </button>
                  </>
                ) : remembered ? (
                  <>Files named like this will go to {account.name} on their own.</>
                ) : (
                  <>
                    {account.name} has no filename rule, so its files are chosen by hand.
                    <button
                      type="button"
                      className="sv2-inline"
                      onClick={() => setDialog({ mode: "edit", job, account })}
                    >
                      Add one
                    </button>
                  </>
                )}
              </p>
            )}
          </article>
        );
      })}
      {dialog && (
        <AccountDialog
          newColor={palette[accounts.length % palette.length]}
          mode={dialog.mode}
          job={dialog.job}
          account={dialog.account}
          busy={busy}
          run={run}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

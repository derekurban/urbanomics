import React, { useEffect, useState } from "react";
import { TransactionSettings } from "./TransactionSettings.jsx";
import { SplitEditor } from "./SplitEditor.jsx";
import { EntityEditor } from "./EntityEditor.jsx";
import { OrbitSorter } from "./OrbitSorter.jsx";
import {
  money,
  sum,
  retag,
  capacity,
  distribute,
  flowSummary,
} from "./review-model.js";
import "./review-workspace.css";

const api = window.urbanomics;
const monthLabel = (m) =>
  new Date(`${m}-15T12:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    year: "numeric",
  });
const title = (t) => t.description || "Transaction";
const byId = (list) => Object.fromEntries(list.map((e) => [e.id, e.name]));
const colored = (list) => Object.fromEntries(list.map((e) => [e.id, e.color]));
const toggle = (list, id) =>
  list.includes(id) ? list.filter((v) => v !== id) : [...list, id];

function FinanceEditor({
  row,
  records,
  people,
  groups,
  act,
  onEntity,
  onTags,
  onSource,
  error,
}) {
  const [kind, setKind] = useState(
    row.review.kind === "unreviewed" ? "" : row.review.kind,
  );
  const [shares, setShares] = useState(row.review.shares),
    [person, setPerson] = useState(row.review.personId),
    [targetQuery, setTargetQuery] = useState("");
  const [values, setValues] = useState([
    ...row.review.allocations,
    {
      id: "remainder",
      cents:
        row.review.kind === "repayment"
          ? row.review.remainder
          : Math.abs(row.amountCents),
    },
  ]);
  const [transfer, setTransfer] = useState(row.review.transferId || "");
  const expenses = records.filter(
    (t) =>
      t.amountCents < 0 &&
      ["unreviewed", "expense"].includes(t.review.kind) &&
      t.currency === row.currency &&
      (!t.deleted || values.some((p) => p.id === t.id)),
  );
  const capacities = Object.fromEntries(
    expenses.map((t) => [t.id, capacity(t, records, row.id, person)]),
  );
  const targets = values.filter((p) => p.id !== "remainder").map((p) => p.id);
  const chooseTargets = (ids) =>
    setValues(distribute(Math.abs(row.amountCents), ids, capacities));
  const labels = {
    ...Object.fromEntries(expenses.map((t) => [t.id, title(t)])),
    remainder: "Unassigned e-transfer income",
  };
  const matches = (t) =>
    `${title(t)} ${t.account} ${t.date}`
      .toLowerCase()
      .includes(targetQuery.toLowerCase());
  const received = records
    .filter((t) => t.review.kind === "repayment")
    .reduce(
      (n, t) =>
        n + (t.review.allocations.find((p) => p.id === row.id)?.cents || 0),
      0,
    );
  const shareLabels = { me: "Me", ...byId(people) };
  const counterpart = records.filter(
    (t) =>
      !t.deleted &&
      t.accountId !== row.accountId &&
      t.amountCents === -row.amountCents &&
      t.currency === row.currency &&
      (t.review.transferId === row.id ||
        (!t.review.reviewed &&
          !t.review.transferId &&
          t.review.kind !== "repayment")) &&
      matches(t),
  );
  const save = async (reviewed) => {
    const purpose = kind || "unreviewed";
    await act(() =>
      api.saveFinancial(row.id, row.version, {
        kind: purpose,
        reviewed,
        shares: purpose === "expense" ? shares : null,
        personId: person,
        allocations: values.filter((p) => p.id !== "remainder"),
        remainder: values.find((p) => p.id === "remainder")?.cents || 0,
        transferId: transfer,
      }),
    );
  };
  return (
    <section className="rv-finance" aria-label="Transaction review">
      <div className="rv-editor-title">
        <div>
          <small>
            {row.date} · {row.account}
          </small>
          <h2>{title(row)}</h2>
        </div>
        <strong>{money(row.amountCents)}</strong>
      </div>
      <div className="rv-editor-tools">
        <button onClick={() => onTags(row)}>Edit categories</button>
        <button onClick={() => onSource(row.id)}>View source</button>
      </div>
      {row.originalDescription && (
        <p className="alias-original">
          Bank description: {row.originalDescription}
        </p>
      )}
      {row.aliasConflicts?.length > 0 && (
        <p className="alias-warning">
          Competing aliases · resolve in Organize → Aliases.
        </p>
      )}
      <h3>What is this money for?</h3>
      <div className="rv-purpose">
        {(row.amountCents < 0
          ? [
              ["expense", "Expense"],
              ["transfer", "Own-account transfer"],
            ]
          : row.amountCents > 0
            ? [
                ["income", "Income"],
                ["repayment", "Repayment"],
                ["transfer", "Own-account transfer"],
              ]
            : [["zero", "No cash movement"]]
        ).map(([id, name]) => (
          <button
            key={id}
            aria-pressed={kind === id}
            onClick={() => setKind(id)}
          >
            {name}
          </button>
        ))}
      </div>
      {row.amountCents === 0 && (
        <p>
          Keep this zero-value record for context. It adds nothing to cash-flow
          totals.
        </p>
      )}
      {kind === "expense" && (
        <>
          <div className="rv-section-title">
            <h3>Who is covering this?</h3>
            <button onClick={() => onEntity({ kind: "person" })}>
              + Person
            </button>
          </div>
          <div className="rv-people">
            <button aria-pressed={!shares} onClick={() => setShares(null)}>
              <i>Me</i>
              <span>My expense</span>
            </button>
            {people.map((p) => (
              <button
                key={p.id}
                aria-pressed={shares?.some((s) => s.id === p.id) || false}
                onClick={() => {
                  const old = shares || [
                      { id: "me", cents: Math.abs(row.amountCents) },
                    ],
                    selected = toggle(
                      old.map((s) => s.id),
                      p.id,
                    );
                  setShares(
                    selected.length === 1
                      ? null
                      : retag(old, selected, Math.abs(row.amountCents)),
                  );
                }}
              >
                <i style={{ background: p.color }}>{p.name.slice(0, 2)}</i>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          {shares && (
            <SplitEditor
              values={shares}
              onChange={setShares}
              labels={shareLabels}
              colors={{ me: "#8FA6CB", ...colored(people) }}
            />
          )}
          <div className="rv-balance">
            <span>
              Cash paid <strong>{money(Math.abs(row.amountCents))}</strong>
            </span>
            <span>
              {shares ? "My agreed share" : "My cost after repayments"}
              <strong>
                {money(
                  shares?.find((s) => s.id === "me")?.cents ??
                    Math.abs(row.amountCents) - received,
                )}
              </strong>
            </span>
            <span>
              Repaid <strong>{money(received)}</strong>
            </span>
            {shares && (
              <span>
                Still owed{" "}
                <strong>
                  {money(
                    Math.max(
                      0,
                      sum(shares.filter((s) => s.id !== "me")) - received,
                    ),
                  )}
                </strong>
              </span>
            )}
          </div>
          {!shares && received > 0 && (
            <p className="rv-help">
              No agreed split: repayments reduce your remaining cost. Add people
              to record an agreed share.
            </p>
          )}
        </>
      )}
      {kind === "income" && (
        <p className="rv-help">
          General income, such as pay, a sale or interest. Own-account transfers
          and repayments have their own options.
        </p>
      )}
      {kind === "repayment" && (
        <>
          <div className="rv-section-title">
            <h3>Who sent it?</h3>
            <button onClick={() => onEntity({ kind: "person" })}>
              + Person
            </button>
          </div>
          <div className="rv-people">
            {people.map((p) => (
              <button
                key={p.id}
                aria-pressed={person === p.id}
                onClick={() => {
                  setPerson(p.id);
                  setValues([{ id: "remainder", cents: row.amountCents }]);
                }}
              >
                <i style={{ background: p.color }}>{p.name.slice(0, 2)}</i>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          {person && (
            <>
              <h3>Apply to expenses</h3>
              <input
                className="rv-search"
                aria-label="Search repayment expenses"
                placeholder="Search expenses, groups, accounts or dates…"
                value={targetQuery}
                onChange={(e) => setTargetQuery(e.target.value)}
              />
              <div className="rv-targets">
                {groups.map((group) => {
                  const members = expenses
                      .filter(
                        (t) => !t.deleted && t.review.groups.includes(group.id),
                      )
                      .map((t) => t.id),
                    count = members.filter((id) => targets.includes(id)).length;
                  if (
                    !members.length ||
                    (targetQuery &&
                      !group.name
                        .toLowerCase()
                        .includes(targetQuery.toLowerCase()) &&
                      !expenses.some(
                        (t) => members.includes(t.id) && matches(t),
                      ))
                  )
                    return null;
                  return (
                    <label className="rv-group-target" key={group.id}>
                      <input
                        type="checkbox"
                        checked={count === members.length}
                        ref={(e) => {
                          if (e)
                            e.indeterminate =
                              count > 0 && count < members.length;
                        }}
                        onChange={() =>
                          chooseTargets(
                            count === members.length
                              ? targets.filter((id) => !members.includes(id))
                              : [...new Set([...targets, ...members])],
                          )
                        }
                      />
                      <span>
                        {group.name}
                        <small>
                          Event · {members.length} expenses
                          {count && count < members.length
                            ? " · partially selected"
                            : ""}
                        </small>
                      </span>
                    </label>
                  );
                })}
                {expenses.filter(matches).map((t) => (
                  <label key={t.id}>
                    <input
                      type="checkbox"
                      checked={targets.includes(t.id)}
                      onChange={() => chooseTargets(toggle(targets, t.id))}
                    />
                    <span>
                      {title(t)}
                      <small>
                        {t.date} · {t.account}
                        {t.deleted ? " (deleted)" : ""}
                      </small>
                    </span>
                    <strong>{money(capacities[t.id])} left</strong>
                  </label>
                ))}
              </div>
              <p className="rv-help">
                Groups select their expenses once. Allocations are capped at the
                unpaid amount or agreed share. Any extra stays as unassigned
                e-transfer income.
              </p>
              <SplitEditor
                values={values}
                onChange={setValues}
                labels={labels}
                capacities={capacities}
                onEven={() => chooseTargets(targets)}
              />
            </>
          )}
        </>
      )}
      {kind === "transfer" && (
        <>
          <p>
            Match both sides of a transfer or credit-card payment. Neither side
            counts as spending or income.
          </p>
          <input
            className="rv-search"
            aria-label="Search transfer counterpart"
            placeholder="Search other accounts, descriptions or dates…"
            value={targetQuery}
            onChange={(e) => setTargetQuery(e.target.value)}
          />
          <div className="rv-targets">
            {counterpart.map((t) => (
              <label key={t.id}>
                <input
                  type="radio"
                  name="transfer"
                  checked={transfer === t.id}
                  onChange={() => setTransfer(t.id)}
                />
                <span>
                  {title(t)}
                  <small>
                    {t.account} · {t.date}
                  </small>
                </span>
                <strong>{money(t.amountCents)}</strong>
              </label>
            ))}
          </div>
          {!counterpart.length && (
            <p>
              No equal opposite entry in another active account. Import the
              other side before reviewing this transfer.
            </p>
          )}
        </>
      )}
      {error && (
        <p className="dr-error-text" role="alert">
          {error}
        </p>
      )}
      <div className="rv-review-actions">
        {row.review.reviewed && (
          <button onClick={() => save(false)}>Reopen review</button>
        )}
        <button
          className="primary"
          disabled={
            !kind ||
            (kind === "repayment" && !person) ||
            (kind === "transfer" && !transfer)
          }
          onClick={() => save(true)}
        >
          Save review
        </button>
      </div>
    </section>
  );
}

export function ReviewWorkspace({ data, run, busy, onSource, initialMonth }) {
  const [tagDrafts, setTagDrafts] = useState({}),
    [eventDrafts, setEventDrafts] = useState({});
  const [state, setState] = useState(null),
    [stage, setStage] = useState("organize"),
    [month, setMonth] = useState(initialMonth || ""),
    [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null),
    [tagRow, setTagRow] = useState(null),
    [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false),
    [direction, setDirection] = useState("all"),
    [active, setActive] = useState(""),
    [views, setViews] = useState([]);
  const reload = async () => setState(await api.reviewState());
  useEffect(() => {
    let valid = true;
    api
      .reviewState()
      .then((s) => {
        if (valid) setState(s);
      })
      .catch((e) => setError(e.message));
    return () => {
      valid = false;
    };
  }, [data]);
  async function act(fn) {
    setError("");
    return run(async () => {
      try {
        const value = await fn();
        await reload();
        return value;
      } catch (e) {
        setError(e.message);
        throw e;
      }
    });
  }
  if (!state) return <p>{error || "Opening your review workspace…"}</p>;
  const { records, entities } = state,
    tags = entities.filter((e) => e.kind === "category"),
    groups = entities.filter((e) => e.kind === "group"),
    people = entities.filter((e) => e.kind === "person"),
    categories = entities.filter((e) => e.kind === "category");
  const activeRows = records.filter((t) => !t.deleted),
    scoped = activeRows.filter((t) => !month || t.month === month),
    visible = scoped.filter((t) =>
      `${title(t)} ${t.originalDescription || ""} ${t.account}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const editEntity = (entity) => {
    setError("");
    const palette = [
      "#78976A",
      "#8FA6CB",
      "#C8A06D",
      "#AF8EB5",
      "#70A8A5",
      "#CA8D86",
    ];
    setEditor({
      color:
        palette[
          entities.filter((e) => e.kind === entity.kind).length % palette.length
        ],
      ...entity,
    });
  };
  const editTags = (t) => {
    setError("");
    setTagRow(t);
  };
  const selectedRow = tagRow;
  const inbox = visible.filter(
    (t) =>
      t.review.reviewed === reviewed &&
      (direction === "all" ||
        (direction === "in" ? t.amountCents > 0 : t.amountCents < 0)),
  );
  const focus = inbox.find((t) => t.id === active) || inbox[0];
  const selectedViews = views.filter((id) =>
    categories.some((c) => c.id === id),
  );
  const selectedTags = selectedViews.length
    ? selectedViews
    : categories.map((c) => c.id);
  const flows = flowSummary(visible, selectedTags);
  return (
    <div className="review-workspace">
      <header className="rv-heading">
        <div>
          <h1>A little order.</h1>
          <p>Give every transaction a place.</p>
        </div>
        <label>
          Month
          <select
            aria-label="Review month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
            }}
          >
            <option value="">All imported months</option>
            {[...new Set(activeRows.map((t) => t.month))]
              .sort()
              .reverse()
              .map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
          </select>
        </label>
      </header>
      <nav className="rv-stages" aria-label="Review stages">
        {[
          ["organize", "1 · Categories"],
          ["groups", "2 · Events"],
          ["review", "3 · Review"],
          ["categories", "4 · Overview"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={stage === id ? "step" : undefined}
            onClick={() => {
              setStage(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="rv-toolbar">
        <input
          aria-label="Search review transactions"
          placeholder="Search transactions or accounts…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <span>
          {scoped.filter((t) => !t.review.reviewed).length} to review ·{" "}
          {scoped.filter((t) => !t.review.tags.length).length} need categories
        </span>
      </div>
      {error && !editor && !tagRow && stage !== "review" && (
        <p className="dr-error-text" role="alert">
          {error}
        </p>
      )}
      {["organize", "groups"].includes(stage) && (
        <>
          <div className="rv-sort-controls">
            <button
              disabled={busy}
              onClick={() =>
                editEntity({
                  kind: stage === "organize" ? "category" : "group",
                })
              }
            >
              + New {stage === "organize" ? "category" : "event"}
            </button>
          </div>
          <OrbitSorter
            key={stage}
            rows={visible}
            entities={stage === "organize" ? tags : groups}
            events={stage === "groups"}
            drafts={stage === "organize" ? tagDrafts : eventDrafts}
            setDrafts={stage === "organize" ? setTagDrafts : setEventDrafts}
            busy={busy}
            onSave={(changes) => act(() => api.organize(changes))}
            onEdit={editEntity}
            onContinue={() =>
              setStage(stage === "organize" ? "groups" : "review")
            }
          />
        </>
      )}
      {stage === "review" && (
        <>
          <div className="rv-review-filters">
            <div className="rv-toggle">
              {[
                ["all", "All"],
                ["out", "Money out"],
                ["in", "Money in"],
              ].map(([id, name]) => (
                <button
                  key={id}
                  aria-pressed={direction === id}
                  onClick={() => {
                    setDirection(id);
                    setActive("");
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => {
                  setReviewed(e.target.checked);
                  setActive("");
                }}
              />
              Show reviewed
            </label>
            <button onClick={() => editEntity({ kind: "person" })}>
              + Person
            </button>
          </div>
          <div className="rv-review-layout">
            <aside className="rv-task-list">
              {inbox.map((t) => (
                <button
                  key={t.id}
                  aria-pressed={focus?.id === t.id}
                  onClick={() => {
                    setActive(t.id);
                    setError("");
                  }}
                >
                  <strong>{title(t)}</strong>
                  <small>
                    {t.account} · {t.date}
                  </small>
                  <span>{money(t.amountCents)}</span>
                </button>
              ))}
              {!inbox.length && (
                <div className="rv-empty-panel">
                  <h2>
                    {reviewed ? "No reviewed items here." : "Inbox clear."}
                  </h2>
                  <p>
                    {reviewed
                      ? "Completed reviews appear here and can be reopened."
                      : "Newly imported transactions will arrive here."}
                  </p>
                </div>
              )}
            </aside>
            {focus && (
              <FinanceEditor
                key={focus.id}
                row={focus}
                records={records}
                people={people}
                groups={groups}
                act={act}
                onEntity={editEntity}
                onTags={editTags}
                onSource={onSource}
                error={error}
              />
            )}
          </div>
          {!!people.length && (
            <details className="rv-people-manager">
              <summary>Manage people</summary>
              {people.map((p) => (
                <button key={p.id} onClick={() => editEntity(p)}>
                  {p.name}
                </button>
              ))}
            </details>
          )}
        </>
      )}
      {stage === "categories" && (
        <>
          <div className="rv-section-title">
            <p>Explore the amounts assigned to your categories.</p>
            <button onClick={() => editEntity({ kind: "category" })}>
              + New category
            </button>
          </div>
          <div className="rv-category-choices">
            <button
              aria-pressed={!selectedViews.length}
              onClick={() => setViews([])}
            >
              All categories
            </button>
            {categories.map((c) => (
              <div key={c.id}>
                <button
                  aria-pressed={views.includes(c.id)}
                  onClick={() => setViews(toggle(views, c.id))}
                >
                  {c.name}
                </button>
                <button
                  aria-label={`Edit category ${c.name}`}
                  onClick={() => editEntity(c)}
                >
                  •••
                </button>
              </div>
            ))}
          </div>
          <p className="rv-help">
            Gross categorized cash flow, before personal shares and repayments.{" "}
            {visible.filter((t) => !t.review.tags.length).length} uncategorized
            transactions are outside these totals.
          </p>
          <div className="rv-flow-summary">
            {[
              ["out", "Reviewed expenses"],
              ["income", "General income"],
              ["repayment", "Repayment / mixed transfers"],
              ["unassigned", "Unassigned e-transfer income"],
              ["unreviewedOut", "Unreviewed money out"],
              ["unreviewedIn", "Unreviewed money in"],
              ["transferOut", "Own transfers out"],
              ["transferIn", "Own transfers in"],
            ].map(([key, label]) => (
              <div key={key}>
                <small>{label}</small>
                <strong>{money(flows.totals[key])}</strong>
              </div>
            ))}
          </div>
          <div className="rv-category-tags">
            {tags
              .filter((t) => selectedTags.includes(t.id))
              .map((tag) => (
                <span key={tag.id} style={{ borderColor: tag.color }}>
                  {tag.name}
                </span>
              ))}
          </div>
          <div className="rv-insight-rows">
            {flows.rows.map((t) => (
              <button key={t.id} onClick={() => editTags(t)}>
                <span>
                  <strong>{title(t)}</strong>
                  <small>
                    {t.account} ·{" "}
                    {t.review.reviewed ? t.review.kind : "Unreviewed"}
                  </small>
                </span>
                <span>
                  {money(t.portion)}
                  <small>of {money(Math.abs(t.amountCents))}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {editor && (
        <EntityEditor
          key={editor.id || editor.kind}
          entity={editor}
          tags={tags}
          onClose={() => {
            setEditor(null);
            setError("");
          }}
          act={act}
          error={error}
        />
      )}
      {selectedRow && (
        <TransactionSettings
          key={selectedRow.id}
          row={selectedRow}
          categories={categories}
          onSave={(changes) => act(() => api.organize(changes))}
          onClose={() => {
            setTagRow(null);
            setError("");
          }}
          error={error}
        />
      )}
    </div>
  );
}

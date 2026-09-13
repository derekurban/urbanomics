import { ReviewOverview } from "./ReviewOverview.jsx";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { transactionFlow } from "../electron/review/tag-model.mjs";
import { systemPalette } from "../electron/review/palette.mjs";
import { categoryColors } from "./category-colors.js";
import {
  orderedTags as alphabetical,
  tagType,
  tagLens,
  taggable,
} from "../electron/review/tag-model.mjs";
import { transactionState, transactionLabels } from "./transaction-state.js";
import { pendingTransfers } from "../electron/review/transfer-model.mjs";
import { CashReceiptEditor } from "./CashReceiptEditor.jsx";
import { EventCalendar } from "./EventCalendar.jsx";
import { CostBreakdown, currencyMoney } from "./CostBreakdown.jsx";
import React, { useEffect, useState } from "react";
import { TransactionSettings } from "./TransactionSettings.jsx";
import { SplitEditor } from "./SplitEditor.jsx";
import { EntityEditor } from "./EntityEditor.jsx";
import { OrbitSorter } from "./OrbitSorter.jsx";
import { TransferWorkspace } from "./TransferWorkspace.jsx";
import {
  money,
  sum,
  retag,
  capacity,
  distribute,
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
  row: currentRow,
  records,
  people,
  groups,
  act,
  onEntity,
  onTags,
  onSource,
  error,
  busy,
  initialPurpose,
  initialEvent,
  onSaved,
  onCash,
  onDeduct,
  initialExpense,
  onReload,
}) {
  // Keep a draft's original version when another connected screen changes this row.
  const [row] = useState(currentRow);
  const changedElsewhere = currentRow.version !== row.version;
  const [kind, setKind] = useState(
    initialPurpose ||
      (row.review.kind === "unreviewed"
        ? row.amountCents < 0
          ? "expense"
          : row.amountCents === 0
            ? "zero"
            : ""
        : row.review.kind),
  );
  const [incomeType, setIncomeType] = useState(row.review.incomeType || ""),
    [incomeSource, setIncomeSource] = useState(row.review.incomeSource || "");
  const [shares, setShares] = useState(row.review.shares),
    [person, setPerson] = useState(
      row.review.personId || row.review.assignedPersonId || "",
    ),
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
    setValues(
      distribute(Math.abs(row.amountCents), [...new Set(ids)], capacities),
    );
  const allocated = sum(values.filter((p) => p.id !== "remainder"));
  const remainder = values.find((p) => p.id === "remainder")?.cents || 0;
  const previewRecords = records.map((t) =>
    t.id === row.id
      ? {
          ...t,
          review: {
            ...t.review,
            kind: "repayment",
            personId: person,
            allocations: values.filter((p) => p.id !== "remainder"),
            remainder,
          },
        }
      : t,
  );
  const changeAmount = (id, text) => {
    if (!/^\d+(\.\d{0,2})?$/.test(text)) return;
    const old = values.find((p) => p.id === id).cents;
    const cents = Math.max(
      0,
      Math.min(Math.round(Number(text) * 100), capacities[id], old + remainder),
    );
    setValues(
      values.map((p) =>
        p.id === id
          ? { ...p, cents }
          : p.id === "remainder"
            ? { ...p, cents: remainder + old - cents }
            : p,
      ),
    );
  };
  const labels = {
    ...Object.fromEntries(expenses.map((t) => [t.id, title(t)])),
    remainder: row.manual
      ? "Unassigned cash income"
      : "Unassigned e-transfer income",
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
  const eligibleTransfers = new Set(pendingTransfers(records).map((t) => t.id));
  const counterpart = records.filter(
    (t) =>
      !t.deleted &&
      t.accountId !== row.accountId &&
      (t.amountCents === -row.amountCents || t.review.transferId === row.id) &&
      t.currency === row.currency &&
      (t.review.transferId === row.id || eligibleTransfers.has(t.id)) &&
      matches(t),
  );
  const save = async () => {
    const purpose = kind || "unreviewed";
    const result = await act(() =>
      api.saveFinancial(row.id, row.version, {
        kind: purpose,
        reviewed: true,
        shares: purpose === "expense" ? shares : null,
        personId: person,
        incomeType,
        incomeSource,
        allocations: values.filter((p) => p.id !== "remainder"),
        remainder: values.find((p) => p.id === "remainder")?.cents || 0,
        transferId: transfer,
      }),
    );
    if (result !== false) onSaved();
  };
  return (
    <section className="rv-finance" aria-label="Transaction details">
      {changedElsewhere && <div className="rv-confirm" role="status"><p>This transaction changed while this editor was open. Your draft is still here; reload the saved version before making further changes.</p><button onClick={onReload}>Reload saved version</button></div>}
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
        <button onClick={() => onTags(row)}>{row.amountCents > 0 ? "Edit income tags" : "Edit expense tags"} · {row.review.tags.length}</button>
        {row.manual ? (
          <button onClick={() => onCash(row)}>Edit cash receipt</button>
        ) : (
          <button onClick={() => onSource(row.id)}>View source</button>
        )}
      </div>
      {row.amountCents < 0 && row.review.kind !== "transfer" && (
        <>
          <button className="primary" onClick={() => onDeduct(row)}>
            Apply incoming money to this expense
          </button>
          <p className="rv-help">
            Link a bank payment or cash receipt to reduce this expense. You can
            include other expenses in the same allocation.
          </p>
        </>
      )}
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
                ["repayment", "Deduct expenses"],
                ["transfer", "Own-account transfer"],
              ]
            : [["zero", "No cash movement"]]
        )
          .filter(([id]) => !row.manual || id !== "transfer")
          .map(([id, name]) => (
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
        <section className="income-types" aria-label="Income source">
          <h3>What kind of income?</h3>
          <div className="rv-purpose">
            {[
              ["paycheck", "Paycheck"],
              ["interest", "Interest"],
              ["sale", "Sale"],
              ["gift", "Gift"],
              ["other", "Other income"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={incomeType === id}
                onClick={() => setIncomeType(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {incomeType === "other" && (
            <label>
              Income source
              <input
                aria-label="Income source name"
                maxLength={80}
                placeholder="Name this source"
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
              />
            </label>
          )}
          <p className="rv-help">
            Keep the full amount as income. No expense allocation is needed.
          </p>
        </section>
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
                  if (person === p.id) return;
                  setPerson(p.id);
                  const ids = initialExpense
                    ? [initialExpense]
                    : initialEvent
                      ? expenses
                          .filter(
                            (t) =>
                              !t.deleted &&
                              t.review.groups.includes(initialEvent),
                          )
                          .map((t) => t.id)
                      : [];
                  setValues(
                    distribute(
                      row.amountCents,
                      ids,
                      Object.fromEntries(
                        expenses.map((t) => [
                          t.id,
                          capacity(t, records, row.id, p.id),
                        ]),
                      ),
                    ),
                  );
                }}
              >
                <i style={{ background: p.color }}>{p.name.slice(0, 2)}</i>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          {person && (
            <>
              <h3>Choose expenses to deduct from</h3>
              <p className="rv-help">
                Select one expense, several unrelated expenses, or an event to
                select its expenses together. All imported months are available.
              </p>
              <input
                className="rv-search"
                aria-label="Search repayment expenses"
                placeholder="Search events, expenses, accounts or dates…"
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
                Events select their expenses once. Allocations are capped at the
                unpaid amount or agreed share. Any extra stays as unassigned
                income.
              </p>
              <div className="allocation-summary">
                <span>
                  Applied{" "}
                  <strong>{currencyMoney(allocated, row.currency)}</strong>
                </span>
                <span>
                  {row.manual
                    ? "Unassigned cash income"
                    : "Unassigned e-transfer income"}{" "}
                  <strong>{currencyMoney(remainder, row.currency)}</strong>
                </span>
              </div>
              <div className="allocation-amounts">
                {values
                  .filter((p) => p.id !== "remainder")
                  .map((p) => (
                    <label key={p.id}>
                      {labels[p.id]}
                      <input
                        type="number"
                        aria-label={`Allocation to ${labels[p.id]}`}
                        min="0"
                        max={
                          Math.min(capacities[p.id], p.cents + remainder) / 100
                        }
                        step="0.01"
                        value={(p.cents / 100).toFixed(2)}
                        onChange={(e) => changeAmount(p.id, e.target.value)}
                      />
                    </label>
                  ))}
              </div>
              <SplitEditor
                values={values}
                onChange={setValues}
                labels={labels}
                capacities={capacities}
                onEven={() => chooseTargets(targets)}
              />
              <CostBreakdown
                expenses={expenses.filter((t) => targets.includes(t.id))}
                records={previewRecords}
                people={people}
                preview
              />
            </>
          )}
        </>
      )}
      {kind === "transfer" && (
        <>
          <p>
            Match both sides of a transfer or credit-card payment. The principal
            stays separate from spending and income. Use Transfers for
            percentage-band matching.
          </p>
          {!!row.review.transferFeeCents && (
            <p>Included transfer fee: {money(row.review.transferFeeCents)}</p>
          )}
          {!!row.review.transferExcessCents && (
            <p>
              Unexplained extra received:{" "}
              {money(row.review.transferExcessCents)}
            </p>
          )}
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
              other side before linking this transfer.
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
        {row.review.kind !== "unreviewed" && (
          <button
            disabled={busy}
            onClick={async () => {
              const result = await act(() =>
                row.review.kind === "transfer"
                  ? api.unlinkTransfer(
                      row.id,
                      row.version,
                      records.find((t) => t.id === row.review.transferId)
                        ?.version,
                    )
                  : api.saveFinancial(row.id, row.version, {
                      kind: "unreviewed",
                      reviewed: false,
                      shares: null,
                    }),
              );
              if (result !== false) onSaved();
            }}
          >
            {row.review.kind === "transfer"
              ? "Unlink transfer"
              : "Clear financial assignment"}
          </button>
        )}
        <button
          className="primary"
          disabled={
            busy ||
            !kind ||
            (kind === "income" &&
              (!incomeType ||
                (incomeType === "other" && !incomeSource.trim()))) ||
            (kind === "repayment" && !person) ||
            (kind === "transfer" && !transfer)
          }
          onClick={save}
        >
          {kind === "repayment" ? "Save allocation" : "Save changes"}
        </button>
      </div>
    </section>
  );
}

export function ReviewWorkspace({
  data,
  run,
  busy,
  onSource,
  initialMonth,
  transactionList = false,
  initialStage,
}) {
  const tagMode = "expense";
  const [financialId, setFinancialId] = useState("");
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [tagDrafts, setTagDrafts] = useState({});
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [cashEditor, setCashEditor] = useState(null);
  const [expenseIntent, setExpenseIntent] = useState(null);
  const [state, setState] = useState(null),
    [stage, setStage] = useState(
      initialStage === "transfers-linked"
        ? "transfers"
        : initialStage || (transactionList ? "transactions" : "transfers"),
    ),
    [month, setMonth] = useState(initialMonth || ""),
    [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null),
    [tagRow, setTagRow] = useState(null),
    [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"),
    [direction, setDirection] = useState("all"),
    [active, setActive] = useState("");
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
  if (!state) return <p>{error || "Opening transactions…"}</p>;
  const { records } = state;
  const entities = categoryColors(state.entities),
    tags = alphabetical(entities.filter((e) => e.kind === "category")),
    groups = entities.filter((e) => e.kind === "group"),
    people = entities.filter((e) => e.kind === "person"),
    categories = tags;
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
  const facts = new Map(
    records.map((t) => [t.id, transactionState(t, records)]),
  );
  const inbox = visible.filter(
    (t) =>
      (statusFilter === "all" || facts.get(t.id)[statusFilter]) &&
      (stage === "moneyin"
        ? t.amountCents > 0 && t.review.kind !== "transfer"
        : direction === "all" ||
          (transactionFlow(t) === direction)),
  );
  const focus = inbox.find((t) => t.id === active) || inbox[0];

  return (
    <div className="review-workspace">
      <header className="rv-heading">
        <div>
          <h1>{transactionList ? "Transactions" : "A little order."}</h1>
          <p>Give every transaction a place.</p>
        </div>
        {stage !== "groups" && (
          <label>
            Month
            <select
              aria-label="Transaction month"
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
        )}
      </header>
      {!transactionList && (
        <nav className="rv-stages" aria-label="Transaction tools">
          {[
            ["transfers", "Transfers"],
            ["groups", "Events"],
            ["moneyin", "Income"],
            ["organize", "Expenses"],
            ["categories", "Overview"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-current={stage === id ? "page" : undefined}
              onClick={() => {
                setStage(id);
                setStatusFilter("all");
                setActive("");
                if (id !== "moneyin") {
                  setExpenseIntent(null);
                  setPaymentIntent(null);
                }
                setError("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {transactionList && stage !== "transactions" && (
        <button
          onClick={() => {
            setStage("transactions");
            setStatusFilter("all");
            setExpenseIntent(null);
            setPaymentIntent(null);
          }}
        >
          ← All transactions
        </button>
      )}
      <div className="rv-toolbar">
        <input
          aria-label="Search workspace transactions"
          placeholder="Search transactions or accounts…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <span>
          {scoped.filter(t => transactionFlow(t) === "transfer").length} transfers ·{" "}
          {scoped.filter(t => transactionFlow(t) === "income").length} income ·{" "}
          {scoped.filter(t => transactionFlow(t) === "expense").length} expenses ·{" "}
          {scoped.filter((t) => taggable(t) && !t.review.tags.length).length} need tags
        </span>
      </div>
      {error &&
        !editor &&
        !cashEditor &&
        !tagRow &&
        !["transactions", "moneyin", "transfers"].includes(stage) && (
          <p className="dr-error-text" role="alert">
            {error}
          </p>
        )}
      {stage === "organize" && (
        <>
          <div className="rv-sort-controls">
            <p>Tag expenses, then use People & repayments to record shared costs.</p>
            <button
              disabled={busy}
              onClick={() =>
                editEntity({
                  kind: "category",
                  flowType: tagMode,
                })
              }
            >
              + New tag
            </button>
          </div>
          <OrbitSorter
            key={stage + tagMode}
            rows={visible.filter((t) => taggable(t) && tagLens(t) === tagMode)}
            entities={tags.filter((e) => tagType(e) === tagMode)}
            allTags={tags}
            lens={tagMode}
            ungroupedColor={systemPalette(entities, "ungrouped").color}
            buckets={
              tagMode === "expense"
                ? entities.filter((e) => e.kind === "bucket")
                : []
            }
            people={people}
            events={false}
            drafts={tagDrafts}
            setDrafts={setTagDrafts}
            busy={busy}
            onSave={(changes) => act(() => api.organize(changes))}
            onEdit={editEntity}
            onContinue={() => setStage("categories")}
            continueLabel="Continue to overview"
            onFinance={row => setFinancialId(row.id)}
          />
        </>
      )}
      {stage === "groups" && (
        <EventCalendar
          selectedEvent={selectedEvent}
          onSelectEvent={setSelectedEvent}
          records={records}
          visible={activeRows.filter((t) => t.review.kind !== "transfer" &&
            `${title(t)} ${t.originalDescription || ""} ${t.account}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
          groups={groups}
          people={people}
          initialMonth={month}
          busy={busy}
          onSave={(changes) => act(() => api.organize(changes))}
          onEdit={editEntity}
          onSource={onSource}
          onPayment={(t, eventId) => {
            setMonth("");
            setSearch("");
            setDirection("income");
            setStatusFilter("all");
            setActive(t.id);
            setPaymentIntent({ id: t.id, eventId });
            setStage("moneyin");
          }}
        />
      )}
      {stage === "transfers" && (
        <TransferWorkspace
          initialFilter={
            initialStage === "transfers-linked" ? "linked" : "pending"
          }
          records={records}
          visible={visible}
          busy={busy}
          act={act}
          error={error}
          onSource={onSource}
        />
      )}
      {["transactions", "moneyin"].includes(stage) && (
        <>
          {stage === "moneyin" && (
            <div className="money-in-heading">
              <div>
                <h2>Give incoming money a purpose.</h2>
                <p>
                  Keep it as income, or use it to reduce one or more expenses.
                </p>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setCashEditor({});
                }}
              >
                + Add cash received
              </button>
            </div>
          )}
          {stage === "moneyin" && expenseIntent && (
            <div className="money-in-intent">
              <span>
                Choose a payment for{" "}
                <strong>{expenseIntent.description}</strong>, or add cash
                received.
              </span>
              <button onClick={() => setExpenseIntent(null)}>
                Clear expense selection
              </button>
            </div>
          )}
          <div className="rv-review-filters">
            {stage !== "moneyin" && (
              <div className="rv-toggle">
                {[
                  ["all", "All"],
                  ["expense", "Expenses"],
                  ["income", "Income"],
                  ["transfer", "Transfers"],
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
            )}
            <div className="rv-state-filters" aria-label="Transaction filters">
              {(stage === "moneyin"
                ? [
                    ["all", "All"],
                    ["unassigned", "Unassigned money"],
                    ["income", "Income"],
                    ["allocated", "Allocated"],
                  ]
                : [
                    ["all", "All states"],
                    ["uncategorized", "Untagged"],
                    ["categorized", "Tagged"],
                    ["deducted", "Has deductions"],
                    ["allocated", "Allocated"],
                    ["income", "Income"],
                    ["transfer", "Transfer linked"],
                    ["events", "In event"],
                    ["shared", "Shared"],
                  ]
              ).map(([id, label]) => (
                <button
                  key={id}
                  aria-label={`Filter: ${label}`}
                  aria-pressed={statusFilter === id}
                  onClick={() => {
                    setStatusFilter(id);
                    setActive("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
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
                  <span className="rv-state-badges">
                    {transactionLabels(t, facts.get(t.id)).map((label) => (
                      <small key={label}>{label}</small>
                    ))}
                    {t.review.assignedPersonId && (
                      <small>
                        Person ·{" "}
                        {people.find((p) => p.id === t.review.assignedPersonId)
                          ?.name || "Assigned"}
                      </small>
                    )}
                  </span>
                  {stage === "moneyin" && (
                    <small>
                      {t.review.kind === "repayment"
                        ? `${money(sum(t.review.allocations))} deducted · ${money(t.review.remainder)} unassigned`
                        : t.review.kind === "income"
                          ? `Income · ${t.review.incomeType || "choose type"}`
                          : "Choose income or deductions"}
                    </small>
                  )}
                </button>
              ))}
              {!inbox.length && (
                <div className="rv-empty-panel">
                  <h2>No matching transactions.</h2>
                  <p>Try another filter, month or search.</p>
                </div>
              )}
            </aside>
            {focus && (
              <FinanceEditor
                key={`${focus.id}:${editorEpoch}`}
                row={focus}
                onSaved={() => {
                  setEditorEpoch(value => value + 1);
                  setPaymentIntent(null);
                  setExpenseIntent(null);
                }}
                onReload={() => setEditorEpoch(value => value + 1)}
                onCash={(row) => {
                  setError("");
                  setCashEditor(row);
                }}
                onDeduct={(row) => {
                  setExpenseIntent(row);
                  setPaymentIntent(null);
                  setStage("moneyin");
                  setMonth("");
                  setSearch("");
                  setStatusFilter("all");
                  setActive("");
                }}
                initialExpense={expenseIntent?.id}
                busy={busy}
                initialPurpose={
                  paymentIntent?.id === focus.id || expenseIntent
                    ? "repayment"
                    : undefined
                }
                initialEvent={
                  paymentIntent?.id === focus.id
                    ? paymentIntent.eventId
                    : undefined
                }
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
      {stage === "categories" && <ReviewOverview records={records} visible={visible} entities={entities} onStage={setStage} onSource={onSource} />}
      {!transactionList && stage !== "categories" && <div className="rv-next-step"><span>Keep going when you’re ready. Every step remains editable.</span><button className="primary" onClick={() => { setStage(({transfers:"groups", groups:"moneyin", moneyin:"organize", organize:"categories"})[stage]); setActive(""); setStatusFilter("all"); }}>Continue to {({transfers:"events", groups:"income", moneyin:"expenses", organize:"overview"})[stage]} →</button></div>}
      {financialId && records.find(t => t.id === financialId) && <WorkspaceModal title="Expense people & repayments" onClose={() => setFinancialId("")}><FinanceEditor
        row={records.find(t => t.id === financialId)} key={financialId + ":" + editorEpoch}
        onReload={() => setEditorEpoch(value => value + 1)}
        records={records} people={people} groups={groups} act={act} busy={busy} error={error}
        onEntity={editEntity} onTags={row => {setFinancialId(""); editTags(row);}} onSource={onSource}
        onSaved={() => setFinancialId("")} onCash={setCashEditor}
        onDeduct={row => {setFinancialId(""); setExpenseIntent(row); setStage("moneyin"); setMonth(""); setSearch(""); setStatusFilter("all"); setActive("");}}
      /></WorkspaceModal>}
      {cashEditor && (
        <CashReceiptEditor
          row={cashEditor.id ? cashEditor : null}
          act={act}
          error={error}
          onClose={() => {
            setCashEditor(null);
            setError("");
          }}
          onSaved={(id) => {
            setCashEditor(null);
            setMonth("");
            setSearch("");
            setStage("moneyin");
            setStatusFilter("all");
            setActive(id);
            setPaymentIntent(
              !cashEditor.id || cashEditor.review?.kind === "repayment"
                ? { id }
                : null,
            );
          }}
        />
      )}
      {editor && (
        <EntityEditor
          key={editor.id || editor.kind}
          entity={editor}
          entities={entities}
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
          people={people}
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

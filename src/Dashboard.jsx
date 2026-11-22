import { ExpenseCategoryBreakdown } from "./ExpenseCategoryBreakdown.jsx";
import { IncomeDashboard } from "./IncomeDashboard.jsx";
import { categoryColors } from "./category-colors.js";
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "@derekurban/design-system";
import {
  dashboard,
  UNGROUPED,
  availableMonths,
  monthlyDashboard,
  vendorGroups,
  accountOverview,
  likelyMoves,
  UNCATEGORIZED,
  TRANSFER_FEES,
} from "./dashboard-model.js";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { validDate } from "../electron/review/event-model.mjs";
import "./dashboard.css";
import { YearChart, AccountFlow } from "./DashboardCharts.jsx";
import { Alert, PageTabs, Segmented, StatRow } from "./ui.jsx";
import { money as formatMoney, dayLabel, monthName, plural, rangeLabel, signedMoney } from "./format.js";

const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0);
const monthEnd = (m) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
// The address keeps the tab and the period (#dashboard/cash/2026-07), so Back, reload and the sidebar
// return to the same place. A bare #dashboard reopens the last place used in this session.
const placeKey = "urbanomics.dashboardPlace.v1";
const tabNames = { spending: "expenses", income: "income", cash: "cash", events: "events" };
const tabOf = (name) => Object.keys(tabNames).find((k) => tabNames[k] === name);
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && validDate(v);
function readPlace() {
  let [, tab, period] = location.hash.slice(1).split("/");
  if (!tab) { try { [tab, period] = (sessionStorage.getItem(placeKey) || "").split("/"); } catch {} }
  const mode = tabOf(tab) || "spending";
  if (/^\d{4}-\d{2}$/.test(period || "")) return { mode, from: period + "-01", through: monthEnd(period) };
  const [from, through] = String(period || "").split("..");
  return isDay(from) && isDay(through) && from <= through ? { mode, from, through } : { mode };
}
function writePlace(place) {
  const hash = "#dashboard/" + place;
  if (location.hash.startsWith("#dashboard") && location.hash !== hash) history.replaceState(null, "", hash);
  try { sessionStorage.setItem(placeKey, place); } catch {}
}
const shortMonth = (m) => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" });

// Overview of the ledger in one currency and date range. Each tab leads with its figures, then the
// year, then what's behind the figures. Uncertain totals say so next to the number.
export function Dashboard({ data, onSource, onSnapshots, onOrganize, onTransactions }) {
  const [place] = useState(readPlace);
  const [source, setSource] = useState(null),
    [error, setError] = useState("");
  const months = data.months
    .map((m) => m.month)
    .sort()
    .reverse();
  const latest =
    months.find((m) => m <= data.lastCompleteMonth) ||
    months[0] ||
    data.lastCompleteMonth;
  const [from, setFrom] = useState(place.from || latest + "-01"),
    [through, setThrough] = useState(place.through || monthEnd(latest));
  const [incomeTags, setIncomeTags] = useState([]);
  const [filterLens, setFilterLens] = useState("expense");
  const [layer, setLayer] = useState("categories");
  const [mode, setMode] = useState(place.mode),
    [selected, setSelected] = useState([]),
    [later, setLater] = useState(false),
    [currency, setCurrency] = useState("CAD"),
    [detail, setDetail] = useState(null),
    [custom, setCustom] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false),
    [year, setYear] = useState((place.from || latest).slice(0, 4)),
    [detailLayout, setDetailLayout] = useState("vendors"),
    [trendCost, setTrendCost] = useState("net");
  const load = () =>
    window.urbanomics
      .reviewState()
      .then((s) => {
        setSource({ ...s, entities: categoryColors(s.entities) });
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    let current = true;
    window.urbanomics
      .reviewState()
      .then((s) => {
        if (current) {
          setSource({ ...s, entities: categoryColors(s.entities) });
          setError("");
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [data]);
  const [matcher, setMatcher] = useState(null);
  useEffect(() => {
    let current = true;
    window.urbanomics.transferLabState?.().then((s) => { if (current) setMatcher(s?.config || null); }).catch(() => {});
    return () => { current = false; };
  }, [data]);
  const valid = validDate(from) && validDate(through) && from <= through;
  useEffect(() => {
    if (!valid) return;
    const m = from.slice(0, 7);
    writePlace(tabNames[mode] + "/" + (from === m + "-01" && through === monthEnd(m) ? m : from + ".." + through));
  }, [mode, from, through, valid]);
  // An address that changes while the Dashboard is showing (a link, or forward and back between two
  // Dashboard addresses) moves the page to that tab and period.
  useEffect(() => {
    const follow = () => {
      if (!location.hash.startsWith("#dashboard/")) return;
      const next = readPlace();
      setMode(next.mode);
      if (next.from && next.through) { setFrom(next.from); setThrough(next.through); setYear(next.from.slice(0, 4)); }
    };
    window.addEventListener("hashchange", follow);
    window.addEventListener("popstate", follow);
    return () => { window.removeEventListener("hashchange", follow); window.removeEventListener("popstate", follow); };
  }, []);
  const options = {
    from,
    through,
    currency,
    categories: mode === "income" ? [] : selected,
    later,
    layer,
    incomeTags: mode === "spending" || mode === "events" ? [] : incomeTags,
  };
  const model = useMemo(
    () => (source && valid ? dashboard(source.records, source.entities, options) : null),
    [source, from, through, currency, selected, later, layer, incomeTags, valid, mode],
  );
  const tagBreakdown = useMemo(
    () => (source && valid ? dashboard(source.records, source.entities, { ...options, layer: "tags" }).categories : []),
    [model, source, valid],
  );
  const drill = useMemo(
    () => (detail?.category && source && valid ? dashboard(source.records, source.entities, { ...options, categories: [detail.category] }) : model),
    [model, detail, source],
  );
  const drillTags = useMemo(
    () => (detail?.category && source && valid ? dashboard(source.records, source.entities, { ...options, categories: [detail.category], layer: "tags" }).categories : []),
    [source, model, detail, valid],
  );
  const populatedMonths = useMemo(() => (source ? availableMonths(source.records, currency) : []), [source, currency]);
  const years = [...new Set(populatedMonths.map((m) => m.slice(0, 4)))].reverse();
  const trends = useMemo(
    () =>
      source
        ? monthlyDashboard(source.records, source.entities, {
            year,
            currency,
            categories: mode === "income" ? [] : selected,
            incomeTags: mode === "spending" || mode === "events" ? [] : incomeTags,
            layer,
            later,
          })
        : [],
    [source, year, currency, selected, later, layer, incomeTags, mode],
  );
  const moves = useMemo(
    () => (source && valid && matcher ? likelyMoves(source.records, matcher, { from, through, currency }) : null),
    [source, matcher, from, through, currency, valid],
  );
  // Events are listed whatever the period: each event's whole cost, by its expenses' own dates.
  const eventModel = useMemo(() => {
    if (!source || mode !== "events") return null;
    const dates = source.records.filter((t) => !t.deleted && t.currency === currency).map((t) => t.date).sort();
    return dates.length ? dashboard(source.records, source.entities, { ...options, from: dates[0], through: dates.at(-1) }) : null;
  }, [source, mode, currency, selected, later, layer]);
  const overview = useMemo(
    () => (source && valid ? accountOverview(source.records, { from, through, currency }) : null),
    [source, from, through, currency, valid],
  );
  useEffect(() => {
    const currencies = [...new Set(source?.records.filter((t) => !t.deleted).map((t) => t.currency))];
    if (currencies.length && !currencies.includes(currency)) setCurrency(currencies[0]);
  }, [source, currency]);
  useEffect(() => {
    if (!populatedMonths.length) return;
    if (!populatedMonths.some((m) => m.startsWith(year))) period(populatedMonths.at(-1));
  }, [populatedMonths, year]);
  const money = (n) => formatMoney(n, currency);
  function period(m) {
    setYear(m.slice(0, 4));
    setFrom(m + "-01");
    setThrough(monthEnd(m));
    setCustom(false);
    setDetail(null);
  }
  function filter(id) {
    (mode === "income" || (filterLens === "income" && mode === "cash") ? setIncomeTags : setSelected)((old) =>
      id === "all" ? [] : old.includes(id) ? old.filter((v) => v !== id) : [...old, id],
    );
    setDetail(null);
  }
  // ledger: the Transactions filters that show the same rows (dates are added from the period).
  const open = (title, rows, type = "expenses", ledger = type === "expenses" ? { flow: "expense" } : {}) => setDetail({ title, rows, type, ledger });
  const original = (id) => { setDetail(null); onSource(id); };
  const organize = (id) => { setDetail(null); onOrganize?.(id); };
  const tagName = (id) => (id === TRANSFER_FEES ? "Transfer fee" : source?.entities.find((t) => t.id === id)?.name || "Tag");
  const rowTags = (parts) =>
    parts.some((p) => p.id === UNCATEGORIZED && p.cents > 0) && parts.filter((p) => p.cents > 0).length === 1 ? (
      <span className="dash-row-tags"><span className="dash-unsorted-badge">Unsorted</span></span>
    ) : (
      <span className="dash-row-tags">
        {parts.filter((p) => p.cents > 0).map((p) =>
          p.id === UNCATEGORIZED ? <span key={p.id} className="dash-unsorted-badge">Unsorted</span> : <span key={p.id}>{tagName(p.id)}</span>,
        )}
      </span>
    );
  const renderExpense = (e) => (
    <details className="dash-detail-row" key={e.row.id}>
      <summary>
        <span>
          <strong>{e.fee ? "Transfer fee · " : ""}{e.row.description}</strong>
          <small>{dayLabel(e.row.date)} · {e.row.account}</small>
          {!e.fee && rowTags(e.grossParts)}
        </span>
        <span>
          <strong className="tabular">{money(e.net)}</strong>
          {e.repaid > 0 && <small>{money(e.repaid)} paid back</small>}
        </span>
      </summary>
      <dl className="dash-detail-costs">
        <div><dt>Spent</dt><dd>{money(e.gross)}</dd></div>
        <div><dt>Your share</dt><dd>{money(e.own)}{e.split ? "" : " (no split)"}</dd></div>
        <div><dt>Still owed to you</dt><dd>{money(e.owed)}</dd></div>
      </dl>
      {e.payments.map((p) => (
        <div className="dash-payment" key={p.row.id}>
          <span>
            Paid back: {p.row.description}
            <small>
              {dayLabel(p.row.date)} · {p.row.manual ? "Cash received" : p.row.account}
              {p.row.deleted ? " · deleted account" : ""}
            </small>
          </span>
          <strong className="tabular">{money(p.selected)}</strong>
          {!p.row.manual && <button className="sm ghost" onClick={() => original(p.row.id)}>Original record</button>}
        </div>
      ))}
      {!e.payments.length && <p className="dash-caption">Nothing paid back in this view.</p>}
      <div className="dash-row-actions">
        {onOrganize && !e.row.deleted && <button className="sm" onClick={() => organize(e.row.id)}>Organize<Icon name="arrow-right" size={16} /></button>}
        <button className="sm ghost" onClick={() => original(e.row.id)}><Icon name="file-text" size={16} />Original record</button>
      </div>
    </details>
  );
  if (error)
    return (
      <div className="dash-workspace workspace-page">
        <header className="page-heading"><div><h1>Dashboard</h1></div></header>
        <Alert title="The dashboard couldn't load your transactions." action={<button className="sm" onClick={() => { setError(""); load(); }}>Try again</button>}>
          {error} Your data is unchanged; try again in a moment.
        </Alert>
      </div>
    );
  if (!source) return <p className="dash-loading">Gathering your transactions…</p>;
  const currencies = [...new Set(source.records.filter((t) => !t.deleted).map((t) => t.currency))].sort();
  const incomeLens = mode === "income" || (filterLens === "income" && mode === "cash");
  const activeFilters = incomeLens ? incomeTags : selected;
  const visibleCategories = incomeLens ? model?.incomeOptions || [] : model?.categoryOptions || [];
  const activeCount = source.records.filter((t) => !t.deleted).length;
  const currentDates = source.records.filter((t) => !t.deleted && t.currency === currency).map((t) => t.date).sort();
  const allDates = from === currentDates[0] && through === currentDates.at(-1);
  const selectedMonth = from.slice(0, 7) === through.slice(0, 7) && from.endsWith("-01") && through === monthEnd(from.slice(0, 7)) ? from.slice(0, 7) : null;
  // A month after the last complete one is still being filled in.
  const partialFrom = data.lastCompleteMonth;
  const isPartial = selectedMonth && selectedMonth > partialFrom;
  const filterSummary = activeFilters.length
    ? visibleCategories.filter((c) => activeFilters.includes(c.id)).map((c) => c.name).join(", ")
    : incomeLens ? "All income tags" : `All ${layer}`;
  // The month in one sentence, from figures the page already has. A clause is left out when its figure
  // is unknown; an average needs at least three earlier months of the same year.
  function monthSentence() {
    if (!selectedMonth || !model?.expenses.length || selected.length) return "";
    const earlier = trends.filter((m) => m.model && m.month < selectedMonth);
    const parts = [`${new Date(selectedMonth + "-15T12:00:00Z").toLocaleDateString("en-CA", { month: "long", timeZone: "UTC" })}: you spent ${money(model.gross)}`];
    if (earlier.length >= 3 && !isPartial) {
      const average = Math.round(earlier.reduce((n, m) => n + m.model.gross, 0) / earlier.length), gap = model.gross - average;
      parts.push(gap === 0 ? `the same as your ${earlier.length}-month average` : `${money(Math.abs(gap))} ${gap > 0 ? "more" : "less"} than your ${earlier.length}-month average`);
    }
    const unsorted = model.categories.find((c) => c.id === UNCATEGORIZED), top = model.categories.find((c) => c.id !== UNCATEGORIZED);
    if (unsorted && unsorted.net * 2 > model.net) parts.push("most of it not sorted yet");
    else if (top && top.net * 5 >= model.net * 2) parts.push(`mostly ${top.name}`);
    let text = parts.join(", ") + ".";
    if (model.known && model.owed > 0) text += ` Friends still owe you ${money(model.owed)} for it.`;
    return text;
  }
  // "See these N in Transactions": the same dates, tag and account on the ledger.
  function ledgerLink(d) {
    if (!onTransactions || !["expenses", "owed", "cash"].includes(d.type || "expenses") || !model) return null;
    const rows = d.category ? drill?.expenses || [] : d.rows || [];
    const count = new Set(rows.map((e) => e.row.id)).size;
    if (!count) return null;
    const filters = d.category
      ? d.category === UNCATEGORIZED ? { flow: "expense", status: "attention" } : d.category === TRANSFER_FEES ? { flow: "transfer" } : { flow: "expense", tag: d.category }
      : d.type === "owed" ? { flow: "expense", status: "shared" } : { ...d.ledger };
    const dates = d.allDates ? {} : selectedMonth ? { month: selectedMonth } : { from, through };
    return (
      <span className="footer-start">
        <button className="sm" onClick={() => { setDetail(null); onTransactions({ ...dates, ...filters, currency }); }}>
          <Icon name="list" size={16} />See {count === 1 ? "it" : `these ${count}`} in Transactions
        </button>
      </span>
    );
  }
  // Likely moves between the person's own accounts that are still counted (disclosure only).
  const spentMoves = moves ? model?.expenses.filter((e) => !e.fee && moves.outIds.has(e.row.id)) || [] : [];
  const cashMovesOut = moves ? model?.outflow.filter((t) => !t.transfer && moves.outIds.has(t.row.id)) || [] : [];
  const cashMovesIn = moves ? model?.inflow.filter((t) => !t.transfer && moves.inIds.has(t.row.id)) || [] : [];
  const movesNote = (count, text) =>
    count > 0 && (
      <p className="dash-moves-note">
        <Icon name="arrow-left-right" size={16} />
        <span>{text}</span>
        {onOrganize && <button className="sm" onClick={() => onOrganize(null, "transfers")}>Review in Organize</button>}
      </p>
    );
  const filterBar = (
    <div className="dash-filterbar">
      <button className="sm" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
        <Icon name="sliders-horizontal" size={16} />
        {filtersOpen ? "Hide filters" : activeFilters.length ? `Filtered: ${filterSummary}` : "Filter"}
      </button>
      {!filtersOpen && activeFilters.length > 0 && <button className="sm ghost" onClick={() => filter("all")}>Clear</button>}
      {filtersOpen && (
        <div className="dash-filters-panel">
          <div className="dash-filter-heading">
            {mode === "cash" && (
              <Segmented label="Which filters" value={filterLens} onChange={setFilterLens} options={[{ value: "expense", label: "Money out" }, { value: "income", label: "Money in" }]} />
            )}
            {!incomeLens && (
              <Segmented label="Spending breakdown layer" value={layer} onChange={(id) => { setLayer(id); setSelected([]); setDetail(null); }} options={[{ value: "categories", label: "Categories" }, { value: "tags", label: "Tags" }]} />
            )}
            <span className="dash-caption">Choose several to combine them.</span>
          </div>
          <div className="dash-filters" aria-label="Dashboard categories">
            <button className="sm" aria-pressed={!activeFilters.length} onClick={() => filter("all")}>All {incomeLens ? "income tags" : layer}</button>
            {visibleCategories.map((c) => (
              <button className="sm" key={c.id} aria-pressed={activeFilters.includes(c.id)} onClick={() => filter(c.id)}>
                <i style={{ background: c.color }} aria-hidden="true" />
                {c.name}
              </button>
            ))}
          </div>
          {(mode === "spending" || mode === "events") && (
            <label className="dash-later">
              <input type="checkbox" checked={later} onChange={(e) => { setLater(e.target.checked); setDetail(null); }} />
              Count repayments that arrived after {dayLabel(through)}
            </label>
          )}
        </div>
      )}
    </div>
  );
  return (
    <div className="dash-workspace workspace-page">
      <header className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>What came in, what went out, and what it was for.</p>
        </div>
        {activeCount > 0 && (
          <div className="page-heading-actions">
            <button className="ghost" onClick={() => setDetail({ type: "methods", title: "About these numbers" })}>
              <Icon name="info" size={16} />About these numbers
            </button>
          </div>
        )}
      </header>
      {!activeCount ? (
        <section className="dash-first" aria-label="Nothing to show yet">
          <div className="dash-ghost" aria-hidden="true">
            <div className="dash-ghost-tiles"><span /><span /><span /></div>
            <div className="dash-ghost-chart">
              {[34, 52, 41, 66, 48, 73, 58, 80, 62, 70, 55, 88].map((h, i) => (
                <i key={i} style={{ "--h": `${h}%`, "--i": i }} />
              ))}
            </div>
          </div>
          <div className="dash-first-copy">
            <h2>Nothing to show yet.</h2>
            <p>Add a bank export in Snapshots. Spending, cash flow and events fill in from the months you bring in.</p>
            {onSnapshots && <button type="button" className="primary" onClick={onSnapshots}>Go to Snapshots</button>}
          </div>
        </section>
      ) : (
        <>
          <PageTabs
            label="Dashboard views"
            value={mode}
            onChange={(id) => { setMode(id); setDetail(null); }}
            items={[{ value: "spending", label: "Expenses" }, { value: "income", label: "Income" }, { value: "cash", label: "Cash flow" }, { value: "events", label: "Events" }]}
          />
          {mode !== "events" && <div className="dash-periods" role="group" aria-label="Dashboard date range">
            <select aria-label="Dashboard year" value={year} onChange={(e) => period(populatedMonths.filter((m) => m.startsWith(e.target.value)).at(-1))}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
            <div className="dash-months">
              {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).map((m) => (
                <button
                  key={m}
                  className="sm"
                  disabled={!populatedMonths.includes(m)}
                  aria-label={monthName(m)}
                  aria-pressed={from === m + "-01" && through === monthEnd(m)}
                  onClick={() => period(m)}
                >
                  {shortMonth(m)}
                </button>
              ))}
            </div>
            <button className="sm" aria-pressed={allDates} onClick={() => { setFrom(currentDates[0]); setThrough(currentDates.at(-1)); setCustom(false); setDetail(null); }}>All dates</button>
            <button className="sm" aria-pressed={custom} onClick={() => setCustom((v) => !v)}>Custom dates</button>
            {currencies.length > 1 && (
              <select aria-label="Dashboard currency" value={currency} onChange={(e) => {
                setCurrency(e.target.value);
                const available = availableMonths(source.records, e.target.value);
                if (available.length && !available.includes(from.slice(0, 7))) period(available.at(-1));
                setDetail(null);
              }}>
                {currencies.map((c) => <option key={c}>{c}</option>)}
              </select>
            )}
          </div>}
          {custom && mode !== "events" && (
            <div className="dash-date-inputs">
              <label>From<input aria-label="Dashboard from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setDetail(null); }} /></label>
              <label>Through<input aria-label="Dashboard through" type="date" value={through} onChange={(e) => { setThrough(e.target.value); setDetail(null); }} /></label>
            </div>
          )}
          {!valid ? (
            <Alert tone="warning">Choose valid dates, with the end on or after the start.</Alert>
          ) : (
            <>
              <p className="dash-range">
                {mode === "events" ? "All dates" : selectedMonth ? monthName(selectedMonth) : rangeLabel(from, through)}
                {currencies.length > 1 ? ` · ${currency}` : ""}
                {isPartial ? " · so far" : ""}
              </p>
              {mode === "spending" && (
                <>
                  {monthSentence() && <p className="dash-sentence">{monthSentence()}</p>}
                  <StatRow items={[
                    {
                      label: "Spent",
                      value: money(model.gross),
                      delta: model.provisional.length ? `Includes ${plural(model.provisional.length, "unsorted expense", "unsorted expenses")}` : "Fees included; moves between your accounts left out",
                      onClick: () => open("Spent", model.expenses),
                    },
                    {
                      label: "Paid back to you",
                      value: money(model.repaid),
                      delta: later ? "Including repayments that arrived later" : `Received by ${dayLabel(through)}`,
                      onClick: () => open("Paid back to you", model.expenses.filter((e) => e.repaid)),
                    },
                    {
                      label: "Your cost after repayments",
                      value: money(model.net),
                      delta: model.known ? `${money(model.owed)} still owed to you` : "Before anything still owed to you",
                      emphasis: true,
                      onClick: () => open("Your cost after repayments", model.expenses),
                    },
                  ]} />
                  {movesNote(spentMoves.length, `${plural(spentMoves.length, "likely move", "likely moves")} between your accounts (${money(sum(spentMoves, (e) => e.gross))}) ${spentMoves.length === 1 ? "is" : "are"} counted until you link ${spentMoves.length === 1 ? "it" : "them"}.`)}
                  {filterBar}
                  <section className="dash-panel">
                    <div className="dash-panel-heading">
                      <h2>{year} by month</h2>
                      <Segmented label="Expense trend measure" value={trendCost} onChange={setTrendCost} options={[{ value: "net", label: "After repayments" }, { value: "gross", label: "Before repayments" }]} />
                    </div>
                    <YearChart months={trends} currency={currency} selectedMonth={selectedMonth} onMonth={period} cost={trendCost} kind="expenses" partialFrom={partialFrom} />
                    <p className="dash-caption">
                      {layer === "categories" ? "Expense categories" : "Expense tags"} by month,{" "}
                      {later ? "with every saved repayment" : "with repayments received by each month's end"}. Moves between your own accounts aren't counted.
                    </p>
                  </section>
                  <div className="dash-grid">
                    <section className="dash-panel">
                      <div className="dash-panel-heading">
                        <h2>{layer === "categories" ? "By category" : "By tag"}</h2>
                        <span className="dash-caption">{plural(model.expenses.length, "expense", "expenses")}</span>
                      </div>
                      <ExpenseCategoryBreakdown
                        categories={model.categories}
                        tags={tagBreakdown}
                        layer={layer}
                        money={money}
                        onOpen={(c) => { setDetailLayout("vendors"); setDetail({ title: c.name, category: c.id }); }}
                        onOrganizeUnsorted={onOrganize ? () => onOrganize(null, "unsorted") : null}
                      />
                      {!model.expenses.length && <p className="dash-caption">No expenses match these dates and {layer}.</p>}
                    </section>
                    <section className="dash-panel">
                      <div className="dash-panel-heading"><h2>People and events</h2></div>
                      <button className="dash-relation" onClick={() => open("Still owed to you", model.expenses.filter((e) => e.split), "owed")}>
                        <span>Still owed to you</span>
                        <strong>{model.known ? money(model.owed) : "Not recorded"}</strong>
                        <small>
                          {model.known ? `Splits recorded on ${plural(model.known, "expense", "expenses")}` : "No splits recorded in this period"}
                        </small>
                      </button>
                      <button className="dash-relation" onClick={() => setDetail({ title: "Transfers between your accounts", type: "transfers" })}>
                        <span>Transfer fees</span>
                        <strong>{money(sum(model.expenses.filter((e) => e.fee), (e) => e.gross))}</strong>
                        <small>Counted once; the money moved isn't</small>
                      </button>
                      {model.events.slice(0, 2).map((e) => (
                        <button className="dash-relation" key={e.event.id} onClick={() => open(e.event.name, e.rows)}>
                          <span>{e.event.name}</span>
                          <strong>{money(e.net)}</strong>
                          <small>Your cost · {plural(e.rows.length, "expense", "expenses")} in this period</small>
                        </button>
                      ))}
                    </section>
                  </div>
                </>
              )}
              {mode === "income" && (
                <>
                  {filterBar}
                  <IncomeDashboard
                    model={model}
                    months={trends}
                    currency={currency}
                    selectedMonth={selectedMonth}
                    onMonth={period}
                    year={year}
                    money={money}
                    partialFrom={partialFrom}
                    onOpen={(title, rows, tag) => open(title, rows, "cash", tag === UNCATEGORIZED ? { flow: "income", status: "attention" } : tag ? { flow: "income", tag } : { flow: "income" })}
                    onOrganizeUnsorted={onOrganize ? () => onOrganize(null, "unsorted") : null}
                  />
                </>
              )}
              {mode === "cash" && (
                <>
                  <StatRow items={[
                    { label: "Money in", value: money(model.cashIn), delta: "From outside your accounts", onClick: () => open("Money in", model.inflow, "cash") },
                    { label: "Money out", value: money(model.cashOut), delta: "Transfer fees counted once", onClick: () => open("Money out", model.outflow, "cash") },
                    { label: "Left over", value: signedMoney(model.cashIn - model.cashOut, currency), delta: "Money in minus money out", emphasis: model.cashIn >= model.cashOut, onClick: () => open("Money in and out", model.bank, "cash") },
                  ]} />
                  {movesNote(
                    Math.max(cashMovesOut.length, cashMovesIn.length),
                    `${plural(Math.max(cashMovesOut.length, cashMovesIn.length), "likely move", "likely moves")} between your accounts ${Math.max(cashMovesOut.length, cashMovesIn.length) === 1 ? "is" : "are"} counted until you link ${Math.max(cashMovesOut.length, cashMovesIn.length) === 1 ? "it" : "them"}: ${money(sum(cashMovesIn, (t) => t.cents))} of money in and ${money(sum(cashMovesOut, (t) => t.cents))} of money out.`,
                  )}
                  <section className="dash-panel">
                    <div className="dash-panel-heading"><h2>{year} by month</h2></div>
                    <YearChart months={trends} currency={currency} selectedMonth={selectedMonth} onMonth={period} kind="cash" partialFrom={partialFrom} />
                    <p className="dash-caption">Money moved between your own accounts isn't counted. Transfer fees and any extra received are; cash received outside your accounts isn't.</p>
                  </section>
                  {filterBar}
                  <div className="dash-grid">
                    {[
                      ["Money in", model.cashGroups.slice(0, 4)],
                      ["Money out", model.cashGroups.slice(4)],
                    ].map(([title, groups]) => (
                      <section className="dash-panel" key={title}>
                        <div className="dash-panel-heading">
                          <h2>{title}</h2>
                          <span className="dash-caption">By the date on the bank record</span>
                        </div>
                        {groups.map((g) => (
                          <button className="dash-cash-row" key={g.id} onClick={() => open(g.label, g.rows, "cash")}>
                            <span>{g.label}</span>
                            <strong className="tabular">{money(sum(g.rows, (t) => t.cents))}</strong>
                          </button>
                        ))}
                        {title === "Money in" && (
                          <button className="dash-cash-row is-aside" onClick={() => open("Cash received outside your accounts", model.cash, "cash")}>
                            <span>Cash received <small>not in your bank totals</small></span>
                            <strong className="tabular">{money(model.cashReceived)}</strong>
                          </button>
                        )}
                      </section>
                    ))}
                  </div>
                  <AccountFlow
                    overview={overview}
                    money={money}
                    onCash={(title, rows, type = "cash", accountId = "") => open(title, rows, type, accountId ? { account: accountId } : {})}
                    onTransfer={(r) => setDetail({ title: `${r.from} to ${r.to}`, type: "transfers", pairs: r.pairs })}
                  />
                </>
              )}
              {mode === "events" && (
                <>
                  {filterBar}
                  <div className="dash-panel-heading">
                    <h2>Every event</h2>
                    <span className="dash-caption">Whole events, whatever month is selected, newest first. Events can overlap, so these totals don't add up to your spending.</span>
                  </div>
                  <div className="dash-event-grid">
                    {[...(eventModel?.events || [])].sort((a, b) => String(b.event.startDate || "").localeCompare(String(a.event.startDate || "")) || a.event.name.localeCompare(b.event.name)).map((e) => (
                      <button className="dash-event" key={e.event.id} onClick={() => setDetail({ title: e.event.name, rows: e.rows, type: "expenses", ledger: { event: e.event.id }, allDates: true })}>
                        <span className="dash-event-name"><i style={{ background: e.event.color }} aria-hidden="true" />{e.event.name}</span>
                        <small>{e.event.startDate ? rangeLabel(e.event.startDate, e.event.endDate || e.event.startDate) : "Dates not set"}</small>
                        <strong className="tabular">{money(e.net)}</strong>
                        <span>Your cost · {plural(e.rows.length, "expense", "expenses")}</span>
                        <span className="dash-track" aria-hidden="true">
                          <span className="dash-net" style={{ width: (100 * e.net) / Math.max(1, e.gross) + "%" }} />
                        </span>
                        <span className="dash-between">
                          <span>Spent {money(e.gross)}</span>
                          <span>Paid back {money(e.repaid)}</span>
                        </span>
                        <small>Still owed to you: {money(e.owed)}</small>
                      </button>
                    ))}
                  </div>
                  {!eventModel?.events.length && (
                    <div className="empty-state">
                      <h2>No event spending yet.</h2>
                      <p>Link transactions to an event on the Events page{selected.length ? ", or clear the filters" : ""}.</p>
                    </div>
                  )}
                </>
              )}
              <footer className="dash-footnote">
                <span>Based on what's saved now, by the dates in your bank exports{currencies.length > 1 ? `, in ${currency} only` : ""}.</span>
                {(mode === "cash" || mode === "income") && <span>Cash received outside your accounts isn't in the bank totals.</span>}
                <span>The latest month may only be partly imported.</span>
              </footer>
            </>
          )}
        </>
      )}
      {detail && (
        <WorkspaceModal title={detail.title} className="dash-dialog" size={detail.type === "methods" ? "" : "wide"} onClose={() => setDetail(null)} footer={ledgerLink(detail)}>
          {detail.type === "methods" ? (
            <div className="dash-methods">
              {[
                ["Money in and out", "Money that crossed into or out of your own accounts. Moving money between two of your accounts isn't counted on either side. A transfer fee counts once as money out; any extra received counts separately from income. Cash you record by hand is shown apart from bank totals."],
                ["Spending", "Money out dated inside the range, without moves between your accounts. Transactions you haven't sorted yet still count as spending until you sort them. Transfer fees appear once, under Transfer fees."],
                ["Repayments", "A repayment reduces the expense it pays back, even if it arrived in another month or account. By default only repayments received by the end of the range count; the filter can include later ones. Money in that isn't applied to an expense doesn't reduce spending."],
                ["Categories and tags", "Tags hold portions of each transaction; categories add up their tags after repayments. Unsorted means no tag yet; Ungrouped tags have no category. Income tags describe money in and never decide whether it's income or a repayment."],
                ["Shared costs", "Your cost after repayments is what you spent minus what was paid back. Still owed to you only counts splits you recorded; nothing is assumed where no split was recorded."],
                ["Balances and transfers", "An account's balance is the latest balance in its exports, with that date. Exports without a balance column show Balance unavailable. Several balances on one day stay open to inspection rather than guessing which was last. Transfers between accounts show whole linked pairs once, by the date money left."],
                ["Events", "Events can overlap; an expense is counted once in your overall spending. Figures use today's saved decisions, not a record of past edits. Deleted accounts are left out."],
              ].map(([h, p]) => (
                <section key={h}>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </section>
              ))}
            </div>
          ) : detail.type === "transfers" ? (
            <>
              <p className="dash-caption">All linked transfers in this range, whatever the filters. The other half may fall outside the range or belong to a deleted account.</p>
              {(detail.pairs || model?.transfers)
                .filter((t, i, list) => list.findIndex((p) => p.row.id === t.other.id || p.row.id === t.row.id) === i)
                .map((t) => {
                  const out = t.row.amountCents < 0 ? t.row : t.other,
                    inc = t.row.amountCents > 0 ? t.row : t.other;
                  return (
                    <div className="dash-transfer" key={out.id}>
                      <div>
                        <strong>{out.account}</strong>
                        <span>{dayLabel(out.date)} · {signedMoney(out.amountCents, currency)}</span>
                      </div>
                      <Icon name="arrow-right" size={16} />
                      <div>
                        <strong>{inc.account}</strong>
                        <span>{dayLabel(inc.date)} · {signedMoney(inc.amountCents, currency)}</span>
                      </div>
                      <p>Fee {money(out.review.transferFeeCents || 0)} · extra received {money(inc.review.transferExcessCents || 0)}</p>
                      <button className="sm" onClick={() => original(out.id)}>Original record</button>
                    </div>
                  );
                })}
              {!(detail.pairs || model?.transfers)?.length && <p>No linked transfers in this period.</p>}
            </>
          ) : ["cash", "balances"].includes(detail.type) ? (
            <>
              {detail.type === "balances" ? (
                <p className="dash-caption">Balances as exported. Several on one day can't say which came last, so no closing balance is guessed.</p>
              ) : (
                <p className="dash-caption tabular">
                  In {money(sum(detail.rows.filter((t) => t.row.amountCents > 0), (t) => t.cents))}
                  {" · "}Out {money(sum(detail.rows.filter((t) => t.row.amountCents < 0), (t) => t.cents))}
                  {" · "}Left over {signedMoney(sum(detail.rows, (t) => (t.row.amountCents < 0 ? -t.cents : t.cents)), currency)}
                </p>
              )}
              {detail.rows.map(({ row, cents, fee, excess }) => (
                <details className="dash-detail-row" key={row.id}>
                  <summary>
                    <span>
                      <strong>{row.description}</strong>
                      <small>{dayLabel(row.date)} · {row.account}</small>
                      {detail.type !== "balances" && !fee && !excess && (row.tagsAutomatic ? <span className="dash-row-tags"><span className="dash-unsorted-badge">Unsorted</span></span> : rowTags(row.review.tags))}
                    </span>
                    <strong className="tabular">{detail.type === "balances" ? money(row.balanceCents) : signedMoney(row.amountCents < 0 ? -cents : cents, currency)}</strong>
                  </summary>
                  <p>
                    {fee ? "Transfer fee portion · " : excess ? "Extra received portion · " : ""}
                    Whole amount {signedMoney(row.amountCents, currency)}
                  </p>
                  {row.review.allocations.map((a) => (
                    <p key={a.id}>Applied to {source.records.find((t) => t.id === a.id)?.description || "an expense"} · {money(a.cents)}</p>
                  ))}
                  <div className="dash-row-actions">
                    {onOrganize && detail.type !== "balances" && !row.deleted && <button className="sm" onClick={() => organize(row.id)}>Organize<Icon name="arrow-right" size={16} /></button>}
                    {!row.manual && <button className="sm ghost" onClick={() => original(row.id)}><Icon name="file-text" size={16} />Original record</button>}
                  </div>
                </details>
              ))}
              {!detail.rows.length && <p>No matching records.</p>}
            </>
          ) : (
            <>
              {detail.parent && (
                <button className="link dash-back" onClick={() => setDetail(detail.parent)}>
                  <Icon name="arrow-left" size={16} />Back to {detail.parent.title}
                </button>
              )}
              <p className="dash-caption tabular">
                Spent {money(sum(detail.category ? drill.expenses : detail.rows, (e) => e.gross))}
                {" · "}Paid back {money(sum(detail.category ? drill.expenses : detail.rows, (e) => e.repaid))}
                {" · "}Your cost {money(sum(detail.category ? drill.expenses : detail.rows, (e) => e.net))}
                {detail.type === "owed" ? ` · Still owed to you ${detail.rows.length ? money(sum(detail.rows, (e) => e.owed)) : "not recorded"} (recorded splits only)` : ""}
              </p>
              {detail.category && (
                <Segmented
                  label="Category detail layout"
                  value={detailLayout}
                  onChange={setDetailLayout}
                  options={[
                    ...(detail.category === UNGROUPED || source.entities.some((e) => e.id === detail.category && e.kind === "bucket") ? [{ value: "tags", label: "By tag" }] : []),
                    { value: "vendors", label: "By vendor" },
                    { value: "list", label: "Every payment" },
                  ]}
                />
              )}
              {detail.category && detailLayout === "tags" ? (
                <section className="dash-drill-tags" aria-label="Tags in this category">
                  {drillTags.map((tag) => (
                    <button key={tag.id} className="dash-cash-row" onClick={() => setDetail({ title: tag.name, category: tag.id, parent: detail })}>
                      <span><i className="dash-tag-dot" style={{ background: tag.color }} />{tag.name}</span>
                      <span><strong className="tabular">{money(tag.net)}</strong>{tag.repaid > 0 && <small>{money(tag.repaid)} paid back</small>}</span>
                    </button>
                  ))}
                </section>
              ) : detail.category && detailLayout === "vendors" ? (
                vendorGroups(drill.expenses).map((g) => g.rows.length === 1 ? renderExpense(g.rows[0]) : (
                  <details className="dash-vendor" key={g.key}>
                    <summary>
                      <span>
                        <strong>{g.name}</strong>
                        <small>{plural(g.rows.length, "payment", "payments")} · {money(g.gross)} spent{g.repaid ? ` · ${money(g.repaid)} paid back` : ""}</small>
                      </span>
                      <strong className="tabular">{money(g.net)}</strong>
                    </summary>
                    <div className="dash-vendor-payments">{g.rows.map(renderExpense)}</div>
                  </details>
                ))
              ) : (
                (detail.category ? drill.expenses : detail.rows).map(renderExpense)
              )}
              {!(detail.category ? drill.expenses : detail.rows).length && <p>No matching expenses.</p>}
            </>
          )}
        </WorkspaceModal>
      )}
    </div>
  );
}

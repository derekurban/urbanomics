import { Icon } from "@derekurban/design-system";
import React, { useState } from "react";
import {
  nearEvent,
  eventDateLabel,
  shiftDate,
  costBreakdown,
} from "../electron/review/event-model.mjs";
import { CostBreakdown } from "./CostBreakdown.jsx";
import { SplitBox } from "./SplitBox.jsx";
import { eventStart, eventPaymentSuggestions } from "./events-model.js";
import { Segmented } from "./ui.jsx";
import { money as currencyMoney, dayLabel, weekdayLabel, rangeLabel, plural } from "./format.js";
import "./event-calendar.css";

const monthLabel = (month) =>
  new Date(month + "-15T12:00:00Z").toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
// A day's total in a calendar cell: whole dollars, compact past a thousand, signed.
const dayTotal = (cents, currency = "CAD") =>
  (cents > 0 ? "+" : cents < 0 ? "−" : "") +
  new Intl.NumberFormat("en-CA", { style: "currency", currency, notation: Math.abs(cents) >= 100000 ? "compact" : "standard", maximumFractionDigits: Math.abs(cents) >= 100000 ? 1 : 0 }).format(Math.abs(cents) / 100);
// What a day shows: its spending, or what came in when nothing went out.
const daySum = (rows) => { const out = rows.filter((t) => t.amountCents < 0).reduce((n, t) => n + t.amountCents, 0); return out || rows.reduce((n, t) => n + Math.max(0, t.amountCents), 0); };
function moveMonth(month, direction) {
  const date = new Date(month + "-15T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 7);
}
export function EventCalendar({
  selectedEvent,
  onSelectEvent,
  records,
  visible,
  groups,
  people,
  initialMonth,
  busy,
  onSave,
  onEdit,
  onPayment,
  onSource,
  act,
}) {
  const event = groups.find((e) => e.id === selectedEvent) || groups[0];
  const [month, setMonth] = useState(
    initialMonth ||
      (event?.startDate || event?.endDate)?.slice(0, 7) ||
      visible[0]?.month ||
      new Date().toISOString().slice(0, 7),
  );
  const [day, setDay] = useState("");
  const [nearby, setNearby] = useState(false);
  const [view, setView] = useState("calendar"),
    [buffer, setBuffer] = useState(true),
    [query, setQuery] = useState("");
  const members = event
    ? records.filter((t) => t.review.groups.includes(event.id))
    : [];
  const live = visible.filter((t) => !t.deleted);
  const byDay = Object.groupBy(
    live.filter((t) => t.month === month),
    (t) => t.date,
  );
  const first = month + "-01",
    offset = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7;
  const last = shiftDate(moveMonth(month, 1) + "-01", -1);
  const days = Array.from(
    { length: offset + Number(last.slice(-2)) },
    (_, i) =>
      i < offset ? null : `${month}-${String(i - offset + 1).padStart(2, "0")}`,
  );
  const selectedDay = day.startsWith(month)
    ? day
    : event && eventStart(event).startsWith(month)
      ? eventStart(event)
      : Object.keys(byDay)
        .sort()
        .find((d) => event && nearEvent(d, event, buffer ? 1 : 0)) ||
      Object.keys(byDay).sort()[0] ||
      first;
  const dayRows = byDay[selectedDay] || [];
  const linked = (t) => event && t.review.groups.includes(event.id);
  const link = (rows) =>
    onSave(
      rows.map((t) => ({
        id: t.id,
        version: t.version,
        groups: linked(t) ? [] : [event.id],
      })),
    );
  const suggestions = event
    ? live.filter((t) => !linked(t) && nearEvent(t.date, event, buffer ? 1 : 0))
    : [];
  const paymentSuggestions = event && view === "costs" ? eventPaymentSuggestions(event, records, people) : [];
  const incoming = members.filter(
    (t) => !t.deleted && t.amountCents > 0 && t.review.kind !== "transfer",
  );
  return (
    <section className="event-workspace" aria-label="Event calendar">
      <input
        className="event-search"
        aria-label="Search events"
        placeholder="Find an event"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="event-list" role="list" aria-label="Your events, newest first">
        {[...groups]
          .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => eventStart(b).localeCompare(eventStart(a)) || a.name.localeCompare(b.name))
          .map((e) => {
            const cost = costBreakdown(records.filter((t) => !t.deleted && t.review.groups.includes(e.id)), records)[0];
            return (
              <button
                key={e.id}
                role="listitem"
                className="event-list-row"
                aria-pressed={event?.id === e.id}
                style={{ "--event-color": e.color }}
                onClick={() => {
                  onSelectEvent(e.id);
                  setDay("");
                  setNearby(false);
                  if (eventStart(e)) setMonth(eventStart(e).slice(0, 7));
                }}
              >
                <span className="event-list-name"><i aria-hidden="true" />{e.name}</span>
                <small>{eventStart(e) ? rangeLabel(eventStart(e), e.endDate || eventStart(e)) : "No dates yet"}</small>
                <span className="event-list-figure"><small>Your share</small><b className="tabular">{!cost ? "—" : currencyMoney(cost.own, cost.currency)}</b></span>
                <span className="event-list-figure"><small>Still owed</small><b className="tabular">{!cost ? "—" : currencyMoney(cost.owed, cost.currency)}</b></span>
                <span className="event-list-figure"><small>Spent</small><b className="tabular">{cost ? currencyMoney(cost.gross, cost.currency) : "—"}</b></span>
              </button>
            );
          })}
      </div>
      {event && (
        <div className="event-context">
          <div>
            <strong>{event.name}</strong>
            <small>
              {!event.startDate || !event.endDate
                ? <button className="link" onClick={() => onEdit(event)}>Add its dates</button>
                : rangeLabel(event.startDate, event.endDate)}{" "}
              · {plural(members.length, "linked transaction", "linked transactions")}
              {event.participants?.length ? ` · split with ${event.participants.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}` : ""}
            </small>
          </div>
          <button className="sm" onClick={() => onEdit(event)}>Edit event</button>
          <Segmented label="Event view" value={view} onChange={setView} options={[{ value: "calendar", label: "Calendar" }, { value: "costs", label: "Costs & repayments" }]} />
        </div>
      )}
      {view === "calendar" || !event ? (
        <>
          {event && (event.startDate || event.endDate) && (
            <div className="event-suggestions">
              <label>
                <input
                  type="checkbox"
                  checked={buffer}
                  onChange={(e) => setBuffer(e.target.checked)}
                />{" "}
                Include one day before and after
              </label>
              <button
                disabled={!suggestions.length}
                aria-pressed={nearby && suggestions.length > 0}
                onClick={() => {
                  if (nearby) { setNearby(false); return; }
                  const date = suggestions.map((t) => t.date).sort()[0];
                  setMonth(date.slice(0, 7));
                  setNearby(true);
                }}
              >
                {!suggestions.length ? "No nearby transactions left" : nearby ? "Back to the day" : `Show ${plural(suggestions.length, "nearby transaction", "nearby transactions")}`}
              </button>
              <small>Framed days fall within the event's dates. Dates come from your bank exports.</small>
            </div>
          )}
          <div className="event-layout">
            <div className="event-calendar-panel">
              <div className="event-month-nav">
                <button
                  className="icon"
                  aria-label="Previous month"
                  onClick={() => {
                    setMonth(moveMonth(month, -1));
                    setDay("");
                  }}
                >
                  <Icon name="chevron-left" size={18} />
                </button>
                <label>
                  <span className="visually-hidden">Month</span>
                  <input
                    type="month"
                    aria-label="Event calendar month"
                    value={month}
                    min="0001-01"
                    max="9999-11"
                    onChange={(e) => {
                      if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                        setMonth(e.target.value);
                        setDay("");
                      }
                    }}
                  />
                </label>
                <button
                  className="icon"
                  aria-label="Next month"
                  onClick={() => {
                    setMonth(moveMonth(month, 1));
                    setDay("");
                  }}
                >
                  <Icon name="chevron-right" size={18} />
                </button>
              </div>
              <div className="event-calendar-grid">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <small key={d}>{d}</small>
                ))}
                {days.map((date, i) =>
                  date ? (
                    <button
                      key={date}
                      aria-label={[weekdayLabel(date), byDay[date]?.length ? `${plural(byDay[date].length, "transaction", "transactions")}, ${dayTotal(daySum(byDay[date]), byDay[date][0].currency)} ${daySum(byDay[date]) < 0 ? "spent" : "received"}` : "no transactions", byDay[date]?.some(linked) ? "some linked to this event" : "", event && nearEvent(date, event, buffer ? 1 : 0) ? "within the event's dates" : ""].filter(Boolean).join(", ")}
                      aria-pressed={selectedDay === date}
                      className={
                        event && nearEvent(date, event, buffer ? 1 : 0)
                          ? "near-event"
                          : ""
                      }
                      onClick={() => { setDay(date); setNearby(false); }}
                    >
                      <span>{Number(date.slice(-2))}</span>
                      {!!byDay[date]?.length && (
                        <>
                          <div className="event-day-dots">
                            <strong>{dayTotal(daySum(byDay[date]), byDay[date][0].currency)}</strong>
                            {[...new Set(byDay[date].map((t) => t.color))].map(
                              (color) => (
                                <i key={color} style={{ background: color }} />
                              ),
                            )}
                            {byDay[date].some(linked) && (
                              <b><Icon name="check" size={16} /></b>
                            )}
                          </div>
                        </>
                      )}
                    </button>
                  ) : (
                    <div key={i} />
                  ),
                )}
              </div>
              <p className="form-help">
                Each day shows what was spent (or what came in, when nothing went out), a dot for each account, and a check when some are linked to this event.
              </p>
            </div>
            {nearby && suggestions.length > 0 ? (
            <aside className="event-day-panel" aria-label="Nearby transactions">
              <div className="section-title">
                <h3>Nearby, not linked yet</h3>
                <small>{plural(suggestions.length, "transaction", "transactions")}</small>
              </div>
              <button className="sm" disabled={busy} onClick={() => link(suggestions)}>{`Link all ${suggestions.length} to ${event.name}`}</button>
              {Object.entries(Object.groupBy(suggestions, (t) => t.date)).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => (
                <section className="event-nearby-day" key={date} aria-label={weekdayLabel(date)}>
                  <h4>{weekdayLabel(date)}</h4>
                  {rows.map((t) => (
                    <article key={t.id}>
                      <div>
                        <strong>{t.description}</strong>
                        <small>{t.account}</small>
                      </div>
                      <b className="tabular">{currencyMoney(t.amountCents, t.currency)}</b>
                      <div className="event-row-actions">
                        <button className="sm" disabled={busy} aria-label={`Link ${t.description}`} onClick={() => link([t])}>Link</button>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </aside>
            ) : (
            <aside className="event-day-panel" aria-label="Day transactions">
              <div className="section-title">
                <h3>{weekdayLabel(selectedDay)}</h3>
                <small>{plural(dayRows.length, "transaction", "transactions")}</small>
              </div>
              {event && dayRows.filter((t) => !linked(t)).length > 1 && (
                <button
                  className="sm"
                  disabled={busy}
                  onClick={() => link(dayRows.filter((t) => !linked(t)))}
                >
                  {`Link all ${dayRows.filter((t) => !linked(t)).length} to ${event.name}`}
                </button>
              )}
              {!dayRows.length && <p className="form-help">No transactions on this day.</p>}
              {dayRows.map((t) => (
                <article key={t.id} className={linked(t) ? "is-linked" : ""}>
                  <div>
                    <strong>{t.description}</strong>
                    <small>
                      {t.account} · {t.amountCents > 0 ? "Money in" : "Money out"}
                    </small>
                  </div>
                  <b className="tabular">{currencyMoney(t.amountCents, t.currency)}</b>
                  <div className="event-row-actions">
                    {!t.manual && (
                      <button className="sm ghost" onClick={() => onSource(t.id)}>Original record</button>
                    )}
                    <button
                      className="sm"
                      disabled={busy || !event}
                      aria-pressed={linked(t)}
                      aria-label={`${linked(t) ? "Unlink" : "Link"} ${t.description}`}
                      onClick={() => link([t])}
                    >
                      {linked(t) ? <><Icon name="check" size={16} />Linked</> : "Link"}
                    </button>
                  </div>
                  {t.review.groups.filter((id) => id !== event?.id).length >
                    0 && (
                    <small>
                      Also in{" "}
                      {t.review.groups
                        .filter((id) => id !== event?.id)
                        .map((id) => groups.find((g) => g.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </small>
                  )}
                </article>
              ))}
            </aside>
            )}
          </div>
        </>
      ) : (
        <>
          <CostBreakdown
            expenses={members}
            records={records}
            people={people}
            onPayment={(t) => onPayment(t, event.id)}
            renderSplit={act ? (r) => { const row = records.find((x) => x.id === r.id); return row ? <SplitBox row={row} records={records} people={people} event={event} busy={busy} act={act} /> : null; } : undefined}
          />
          <div className="event-incoming">
            <h3>Money in for this event</h3>
            <p className="form-help">
              Money in linked to this event. Applying it to the event's expenses (on the Organize desk) lowers what's still owed.
            </p>
            {incoming.map((t) => {
              const memberIds = new Set(members.map((m) => m.id));
              const applied = (t.review.allocations || []).filter((a) => memberIds.has(a.id)).reduce((n, a) => n + a.cents, 0);
              return (
                <div key={t.id}>
                  <span>
                    <strong>{t.description}</strong>
                    <small>
                      {dayLabel(t.date)} · {t.account}
                    </small>
                  </span>
                  <span className="event-incoming-amount">
                    <strong className="tabular">{currencyMoney(applied, t.currency)}</strong>
                    <small>applied of {currencyMoney(t.amountCents, t.currency)}</small>
                  </span>
                  <button className="sm" onClick={() => onPayment(t, event.id)}>
                    Open in Organize
                  </button>
                </div>
              );
            })}
            {!incoming.length && !paymentSuggestions.length && (
              <p className="form-help">
                Link money in from the calendar, or open it on the Organize desk. Repayments often arrive after the event.
              </p>
            )}
            {paymentSuggestions.length > 0 && (
              <section className="event-payment-suggestions" aria-label="Might be for this event">
                <h4>Might be for this event</h4>
                {paymentSuggestions.map(({ row: t, person }) => (
                  <div key={t.id}>
                    <span>
                      <strong>{person.name} sent {currencyMoney(t.amountCents, t.currency)} on {dayLabel(t.date, { year: false })}</strong>
                      <small>{t.description} · {t.account}</small>
                    </span>
                    <button className="sm" onClick={() => onPayment(t, event.id)}>Open in Organize<Icon name="arrow-right" size={16} /></button>
                  </div>
                ))}
                <p className="form-help">Nothing is applied from here. On the Organize desk, the payment can settle what {paymentSuggestions.length === 1 ? `${paymentSuggestions[0].person.name} owes` : "they owe"}.</p>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}

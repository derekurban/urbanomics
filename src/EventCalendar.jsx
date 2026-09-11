import React, { useState } from "react";
import {
  nearEvent,
  eventDateLabel,
  shiftDate,
} from "../electron/review/event-model.mjs";
import { CostBreakdown, currencyMoney } from "./CostBreakdown.jsx";
import "./event-calendar.css";

const monthLabel = (month) =>
  new Date(month + "-15T12:00:00Z").toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
function moveMonth(month, direction) {
  const date = new Date(month + "-15T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 7);
}
const Chevron = ({ right }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d={right ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
  </svg>
);

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
}) {
  const event = groups.find((e) => e.id === selectedEvent) || groups[0];
  const [month, setMonth] = useState(
    initialMonth ||
      (event?.startDate || event?.endDate)?.slice(0, 7) ||
      visible[0]?.month ||
      new Date().toISOString().slice(0, 7),
  );
  const [day, setDay] = useState("");
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
        groups: linked(t)
          ? t.review.groups.filter((id) => id !== event.id)
          : [...t.review.groups, event.id],
      })),
    );
  const suggestions = event
    ? live.filter((t) => !linked(t) && nearEvent(t.date, event, buffer ? 1 : 0))
    : [];
  const incoming = members.filter(
    (t) => !t.deleted && t.amountCents > 0 && t.review.kind !== "transfer",
  );
  return (
    <section className="event-workspace" aria-label="Event calendar">
      <div className="event-top">
        <div>
          <h2>Your events.</h2>
          <p>Choose an event, then click a day to link its transactions.</p>
        </div>
        <button disabled={busy} onClick={() => onEdit({ kind: "group" })}>
          + New event
        </button>
      </div>
      <input
        className="event-search"
        aria-label="Search events"
        placeholder="Find an event…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="event-choices">
        {groups
          .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
          .map((e) => (
            <button
              key={e.id}
              aria-pressed={event?.id === e.id}
              aria-label={`Manage event ${e.name}`}
              style={{ "--event-color": e.color }}
              onClick={() => {
                onSelectEvent(e.id);
                setDay("");
                if (e.startDate || e.endDate)
                  setMonth((e.startDate || e.endDate).slice(0, 7));
              }}
            >
              <i />
              {e.name}
            </button>
          ))}
      </div>
      {!groups.length && (
        <p className="rv-help">
          Create an event to start linking transactions from the calendar.
        </p>
      )}
      {event && (
        <div className="event-context">
          <div>
            <strong>{event.name}</strong>
            <small>
              {!event.startDate || !event.endDate
                ? "Dates required · edit event"
                : eventDateLabel(event)}{" "}
              · {members.length} linked transactions
            </small>
          </div>
          <button onClick={() => onEdit(event)}>Edit event</button>
          <div className="rv-toggle">
            <button
              aria-pressed={view === "calendar"}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>
            <button
              aria-pressed={view === "costs"}
              onClick={() => setView("costs")}
            >
              Costs & repayments
            </button>
          </div>
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
                onClick={() => {
                  const date = suggestions.map((t) => t.date).sort()[0];
                  setMonth(date.slice(0, 7));
                  setDay(date);
                }}
              >
                {suggestions.length} nearby unlinked · View
              </button>
              <small>
                Using bank-exported dates; highlighted days are suggestions.
              </small>
            </div>
          )}
          <div className="event-layout">
            <div className="event-calendar-panel">
              <div className="event-month-nav">
                <button
                  aria-label="Previous calendar month"
                  onClick={() => {
                    setMonth(moveMonth(month, -1));
                    setDay("");
                  }}
                >
                  <Chevron />
                </button>
                <label>
                  <span>{monthLabel(month)}</span>
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
                  aria-label="Next calendar month"
                  onClick={() => {
                    setMonth(moveMonth(month, 1));
                    setDay("");
                  }}
                >
                  <Chevron right />
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
                      aria-label={`Transactions on ${date}`}
                      aria-pressed={selectedDay === date}
                      className={
                        event && nearEvent(date, event, buffer ? 1 : 0)
                          ? "near-event"
                          : ""
                      }
                      onClick={() => setDay(date)}
                    >
                      <span>{Number(date.slice(-2))}</span>
                      {!!byDay[date]?.length && (
                        <>
                          <strong>
                            {byDay[date].length}
                            <small> transactions</small>
                          </strong>
                          <div className="event-day-dots">
                            {[...new Set(byDay[date].map((t) => t.color))].map(
                              (color) => (
                                <i key={color} style={{ background: color }} />
                              ),
                            )}
                            {byDay[date].some(linked) && (
                              <b aria-label="Has linked transactions">✓</b>
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
              <p className="rv-help">
                Dots show accounts. ✓ marks days with transactions linked to
                this event.
              </p>
            </div>
            <aside className="event-day-panel" aria-label="Day transactions">
              <div className="rv-section-title">
                <h3>{selectedDay}</h3>
                <small>{dayRows.length} transactions</small>
              </div>
              {event && dayRows.some((t) => !linked(t)) && (
                <button
                  disabled={busy}
                  onClick={() => link(dayRows.filter((t) => !linked(t)))}
                >
                  Link unlinked on this day
                </button>
              )}
              {!dayRows.length && (
                <p className="rv-help">
                  No transactions for this day in the current search.
                </p>
              )}
              {dayRows.map((t) => (
                <article key={t.id} className={linked(t) ? "is-linked" : ""}>
                  <div>
                    <strong>{t.description}</strong>
                    <small>
                      {t.account} ·{" "}
                      {t.review.kind === "transfer"
                        ? "Own-account transfer"
                        : t.amountCents > 0
                          ? "Money in"
                          : "Money out"}
                    </small>
                  </div>
                  <b>{currencyMoney(t.amountCents, t.currency)}</b>
                  <div className="event-row-actions">
                    {!t.manual && (
                      <button onClick={() => onSource(t.id)}>Source</button>
                    )}
                    <button
                      disabled={busy || !event}
                      aria-label={`${linked(t) ? "Unlink" : "Link"} ${t.description}`}
                      onClick={() => link([t])}
                    >
                      {linked(t) ? "✓ Linked · Remove" : "Link to event"}
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
          </div>
        </>
      ) : (
        <>
          <CostBreakdown
            expenses={members}
            records={records}
            people={people}
            onPayment={(t) => onPayment(t, event.id)}
          />
          <div className="event-incoming">
            <h3>Money in for this event</h3>
            <p className="rv-help">
              Event membership groups a payment. Allocate it to expenses to
              reduce their remaining cost.
            </p>
            {incoming.map((t) => (
              <div key={t.id}>
                <span>
                  <strong>{t.description}</strong>
                  <small>
                    {t.date} · {t.account}
                  </small>
                </span>
                <strong>{currencyMoney(t.amountCents, t.currency)}</strong>
                <button onClick={() => onPayment(t, event.id)}>
                  {t.review.kind === "repayment"
                    ? "Edit allocation"
                    : "Allocate payment"}
                </button>
              </div>
            ))}
            {!incoming.length && (
              <p className="rv-help">
                Link incoming transactions from the calendar, or choose
                Repayment from the review inbox. Payments may arrive after the
                event.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

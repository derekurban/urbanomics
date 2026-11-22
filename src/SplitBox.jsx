// The Split box for one expense, as on the Organize card, for the Events page (Costs & repayments): who
// shares it, each person's share in dollars or as a percentage, your share as what's left, and the
// event's even split to return to. Every change saves at once through the existing versioned APIs; a
// person who has paid part of it back stays in with at least what they paid (the server checks too).
import React, { useEffect, useRef, useState } from "react";
import { splitShares, repaidByPerson } from "../electron/review/share-model.mjs";
import { money } from "./format.js";

const plain = (cents) => (cents / 100).toFixed(2);
const percent = (cents, total) => (total ? Math.round((cents / total) * 1000) / 10 : 0);

/* A number box that commits on Enter or leaving it, and goes back to the saved value on Escape or bad input. */
function Field({ value, label, suffix, busy, valid, onCommit }) {
  const [text, setText] = useState(value), cancel = useRef(false);
  useEffect(() => setText(value), [value]);
  return (
    <label className="ev-split-field">
      <input inputMode="decimal" aria-label={label} value={text} disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => { cancel.current = false; e.target.select(); }}
        onBlur={() => { if (!cancel.current && valid(text) && text !== value) onCommit(Number(text)); else setText(value); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { cancel.current = true; e.target.blur(); } }} />
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </label>
  );
}

export function SplitBox({ row, records, people, event, busy, act }) {
  const total = Math.abs(row.amountCents), currency = row.currency;
  const shares = Object.fromEntries((row.review.shares || []).map((s) => [s.id, s.cents]));
  const paid = repaidByPerson(records, row.id);
  const inSplit = Object.keys(shares).filter((id) => id !== "me" && shares[id] > 0);
  const nameOf = (id) => people.find((p) => p.id === id)?.name || "Someone";
  const follows = !!event && row.review.sharesSource === "event:" + event.id;
  const canFollow = !!event && (event.participants || []).length > 0 && !follows;
  const mine = inSplit.length ? shares.me || 0 : total;
  const fail = (message) => act(async () => { throw new Error(message); }).catch(() => {});
  const save = (next) => act(() => window.urbanomics.saveFinancial(row.id, row.version, {
    kind: "expense", reviewed: true, personId: "", allocations: [], remainder: 0, transferId: "",
    shares: next ? [{ id: "me", cents: next.me }, ...Object.entries(next).filter(([id]) => id !== "me").map(([id, cents]) => ({ id, cents }))] : null,
  })).catch(() => {});
  const even = (ids) => Object.fromEntries(splitShares(total, ids, Object.fromEntries(ids.map((id) => [id, paid[id] || 0]))).map((s) => [s.id, s.cents]));
  function toggle(id) {
    const current = [...new Set([...inSplit, ...Object.keys(paid)])], removing = current.includes(id);
    if (removing && paid[id]) return fail(`${nameOf(id)} has paid back ${money(paid[id], currency)} of this. Move that repayment before taking them out.`);
    const next = removing ? current.filter((x) => x !== id) : [...current, id];
    return save(next.length ? even(next) : null);
  }
  function setShare(id, cents) {
    const others = inSplit.filter((x) => x !== id).reduce((n, x) => n + shares[x], 0);
    if (cents + others > total) return fail(`Shares can't add up to more than ${money(total, currency)}.`);
    if (cents < (paid[id] || 0)) return fail(`${nameOf(id)} has already paid back ${money(paid[id], currency)} of this.`);
    return save({ ...shares, [id]: cents, me: total - others - cents });
  }
  const dollars = (t) => /^\d+(\.\d{0,2})?$/.test(t.trim()), pct = (t) => /^\d+(\.\d+)?$/.test(t.trim()) && Number(t) <= 100;
  const others = [...(event?.participants || []), ...people.map((p) => p.id)].filter((id, i, all) => all.indexOf(id) === i && !inSplit.includes(id) && people.some((p) => p.id === id));
  return (
    <div className="ev-split" aria-label={`Split for ${row.description}`} role="group">
      <div className="ev-split-head">
        <b>Split</b>
        <small>{inSplit.length ? `Your share ${money(mine, currency)} (${percent(mine, total)}%)${follows ? ` · as ${event.name}` : canFollow ? " · your own split" : ""}` : "Just you"}</small>
      </div>
      {inSplit.length > 0 && (
        <div className="ev-split-lines">
          {inSplit.map((id) => {
            const p = people.find((x) => x.id === id), cents = shares[id], back = paid[id] || 0;
            return (
              <div key={id} className="ev-split-line" style={{ "--part": p?.color }}>
                <button type="button" className="ev-split-person" aria-pressed="true" disabled={busy} title={`Take ${nameOf(id)} out of the split`} onClick={() => toggle(id)}><i />{nameOf(id)}</button>
                <Field value={plain(cents)} label={`Share for ${nameOf(id)}`} suffix="" busy={busy} valid={dollars} onCommit={(n) => setShare(id, Math.round(n * 100))} />
                <Field value={String(percent(cents, total))} label={`Share for ${nameOf(id)} in percent`} suffix="%" busy={busy} valid={pct} onCommit={(n) => setShare(id, Math.round((total * n) / 100))} />
                <small>{back >= cents ? "settled" : back > 0 ? `owes ${money(cents - back, currency)}` : "owes"}</small>
              </div>
            );
          })}
        </div>
      )}
      {others.length > 0 && (
        <div className="ev-split-people">
          {others.map((id) => {
            const p = people.find((x) => x.id === id);
            return <button key={id} type="button" className="ev-split-person" aria-pressed="false" disabled={busy} style={{ "--part": p.color }} onClick={() => toggle(id)}><i />{p.name}</button>;
          })}
        </div>
      )}
      {(canFollow || inSplit.length > 1) && (
        <div className="ev-split-actions">
          {canFollow && <button type="button" className="link" disabled={busy} onClick={() => act(() => window.urbanomics.followEventSplit(row.id, row.version)).catch(() => {})}>Split like {event.name}</button>}
          {inSplit.length > 1 && !follows && <button type="button" className="link" disabled={busy} onClick={() => save(even(inSplit))}>Split evenly</button>}
        </div>
      )}
    </div>
  );
}

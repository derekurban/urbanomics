// Settle against expenses: money in reduces the expenses you pick. From no one it is a refund or a
// reimbursement; from a person it is their repayment, and when it covers more of an expense than their share
// their share grows out of yours. The likeliest expenses come first (same name, already shared with the person,
// same amount, before the money arrived); search reaches every other one. Saved by review:settle in one go.
import React, { useMemo, useState } from "react";
import { Icon } from "@derekurban/design-system";
import { WorkspaceModal } from "./WorkspaceModal.jsx";
import { Alert } from "./ui.jsx";
import { dayLabel } from "./format.js";
import { money, total, repayment } from "./allocation-model.js";

const words = (s) => String(s || "").toLowerCase().replace(/[^\p{L} ]+/gu, " ").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
const plain = (cents) => (cents / 100).toFixed(2);
const parseCents = (text) => { const n = Number(String(text).replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const dayGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

/** Expenses this money could reduce for `payer` ("" for no one), each with how much it can take, best first. */
export function settleCandidates(rows, receipt, payer, isLinked) {
  const here = (t) => receipt.layers.filter((l) => l.kind === "expense" && l.target === t.id).reduce((n, l) => n + l.cents, 0);
  const key = words(receipt.raw.originalDescription || receipt.name);
  return rows.filter((t) => t.amount < 0 && !isLinked(t) && t.currency === receipt.currency && ["expense", "unreviewed"].includes(t.raw.review.kind))
    .map((t) => {
      const grossLeft = total(t) - repayment(rows, t.id, null, receipt.id) - here(t);
      let cap = grossLeft, shared = false, owed = 0;
      if (payer) {
        const shares = t.shares || {}, split = Object.keys(shares).length > 0;
        const mine = split ? shares.me || 0 : total(t), theirs = shares[payer] || 0;
        const paid = repayment(rows, t.id, payer, receipt.id) + (receipt.person === payer ? here(t) : 0);
        shared = theirs > 0; owed = Math.max(0, theirs - paid);
        cap = Math.min(grossLeft, theirs - paid + mine);
      }
      const score = (t.name === receipt.name || (key && words(t.raw.originalDescription || t.name) === key) ? 8 : 0) + (owed > 0 ? 4 : 0)
        + (total(t) === total(receipt) ? 2 : 0) + (t.date <= receipt.date ? 1 : 0);
      return { row: t, cap: Math.max(0, cap), shared, owed, score, gap: dayGap(t.date, receipt.date) };
    })
    .filter((c) => c.cap > 0)
    .sort((a, b) => b.score - a.score || a.gap - b.gap || a.row.id.localeCompare(b.row.id));
}

export function SettleDialog({ receipt, rows, people, isLinked, guess = "", onSave, onClose }) {
  const settledHere = receipt.layers.some((l) => l.kind === "expense");
  const locked = settledHere ? receipt.raw.review.personId || "" : null;
  const [payer, setPayer] = useState(locked ?? guess ?? "");
  const [query, setQuery] = useState(""), [limit, setLimit] = useState(30);
  const [picked, setPicked] = useState({}), [texts, setTexts] = useState({});
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const left = total(receipt) - receipt.layers.reduce((n, l) => n + l.cents, 0);
  const candidates = useMemo(() => settleCandidates(rows, receipt, payer, isLinked), [rows, receipt, payer]);
  const byId = new Map(candidates.map((c) => [c.row.id, c]));
  const q = query.trim().toLowerCase();
  const shown = candidates.filter((c) => !q || `${c.row.name} ${c.row.raw.originalDescription || ""} ${c.row.account} ${plain(total(c.row))}`.toLowerCase().includes(q));
  const lines = Object.entries(picked).filter(([id]) => byId.has(id)).map(([id, cents]) => ({ id, cents }));
  const applied = lines.reduce((n, l) => n + (l.cents > 0 ? l.cents : 0), 0);
  const over = applied > left, tooMuch = lines.find((l) => l.cents > byId.get(l.id).cap), zero = lines.find((l) => !(l.cents > 0));
  const name = people.find((p) => p.id === payer)?.name;
  function toggle(c) {
    setError("");
    setPicked((p) => {
      if (p[c.row.id] !== undefined) { const { [c.row.id]: _, ...rest } = p; return rest; }
      const used = Object.values(p).reduce((n, v) => n + (v > 0 ? v : 0), 0), cents = Math.max(0, Math.min(c.cap, left - used));
      setTexts((t) => ({ ...t, [c.row.id]: plain(cents) }));
      return { ...p, [c.row.id]: cents };
    });
  }
  function choosePayer(id) { setPayer(id); setPicked({}); setTexts({}); setError(""); }
  async function save() {
    setBusy(true); setError("");
    const result = await onSave({ personId: payer, lines });
    setBusy(false);
    if (result?.error) setError(result.error); else onClose();
  }
  const status = over ? `That's ${money(applied - left, receipt.currency)} more than this money has unsorted.`
    : tooMuch ? `${byId.get(tooMuch.id).row.name} can take at most ${money(byId.get(tooMuch.id).cap, receipt.currency)}.`
    : `Applies ${money(applied, receipt.currency)} · ${money(left - applied, receipt.currency)} stays unsorted`;
  return (
    <WorkspaceModal size="wide" className="od-settle-dialog" title="Settle against expenses" onClose={() => !busy && onClose()}
      footer={<>
        <span className="footer-start od-settle-total" role="status"><small className={over || tooMuch ? "is-warn" : ""}>{status}</small></span>
        <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={busy || !lines.length || over || !!tooMuch || !!zero} onClick={save}>{busy ? "Settling…" : lines.length ? `Settle ${money(applied, receipt.currency)}` : "Settle"}</button>
      </>}>
      <div className="od-settle">
        <p className="od-settle-receipt"><b>{receipt.name}</b><small>{receipt.account} · {dayLabel(receipt.date)} · {money(total(receipt), receipt.currency)} in{left < total(receipt) ? ` · ${money(left, receipt.currency)} unsorted` : ""}</small></p>
        <div className="od-settle-controls">
          <label>From
            <select aria-label="Who this money is from" value={payer} disabled={locked !== null || busy} onChange={(e) => choosePayer(e.target.value)}>
              <option value="">No one: a refund or reimbursement</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} paying you back</option>)}
            </select>
          </label>
          <label className="od-settle-search"><Icon name="search" size={16} /><input type="search" aria-label="Find an expense" placeholder="Find an expense" value={query} data-autofocus="" onChange={(e) => setQuery(e.target.value)} /></label>
        </div>
        <small className="form-help">{locked !== null ? (locked ? `This money already settles for ${name}; add more expenses below.` : "This money is already a refund; add more expenses below.") : payer ? `Reduces what ${name} owes on each expense. An expense not shared with ${name} yet is shared for the amount they cover, out of your share.` : "Each expense you pick costs you that much less. Nobody's share changes."}</small>
        {error && <Alert>{error}</Alert>}
        <div className="od-settle-list" role="group" aria-label="Expenses">
          {shown.slice(0, limit).map((c) => {
            const on = picked[c.row.id] !== undefined;
            return (
              <div key={c.row.id} className={"od-settle-row" + (on ? " is-on" : "")}>
                <label className="od-settle-pick">
                  <input type="checkbox" checked={on} disabled={busy} aria-label={`Settle ${c.row.name} on ${dayLabel(c.row.date)}`} onChange={() => toggle(c)} />
                  <span><b>{c.row.name}</b><small>{dayLabel(c.row.date)} · {c.row.account} · {money(total(c.row), c.row.currency)}{payer && c.owed ? ` · ${name} owes ${money(c.owed, c.row.currency)}` : ""}{payer && on && !c.shared ? ` · adds ${name} to its split` : ""}</small></span>
                </label>
                {on ? <input className="od-settle-amount num" aria-label={`Amount for ${c.row.name}`} inputMode="decimal" value={texts[c.row.id] ?? ""} disabled={busy}
                  onChange={(e) => { const text = e.target.value; setTexts((t) => ({ ...t, [c.row.id]: text })); setPicked((p) => ({ ...p, [c.row.id]: parseCents(text) })); }} />
                  : <small className="od-settle-cap num">up to {money(c.cap, c.row.currency)}</small>}
              </div>
            );
          })}
          {!shown.length && <p className="form-help">{q ? "No expense matches that search." : "No expenses left to reduce."}</p>}
          {shown.length > limit && <button type="button" className="link" onClick={() => setLimit((n) => n + 30)}>Show {Math.min(30, shown.length - limit)} more</button>}
        </div>
      </div>
    </WorkspaceModal>
  );
}

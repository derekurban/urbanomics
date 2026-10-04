// Plain-language recognition: a sentence ("files whose name starts with …") is the rule, and the names
// it is checked against are the proof. Used by the Snapshots setup, the layout editor and account settings.
// The sentence compiles to the anchored pattern the app stores; any other stored pattern shows as custom.
import React from "react";
import { Icon } from "@derekurban/design-system";
import { compileRule, patternMatches, ruleModes } from "./import-analysis.mjs";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * rule: { mode, text }; candidates: items that should match; others: items that belong elsewhere and
 * should not. Items are { id, filename }. hint: an extra caution under the proof.
 */
export function Recognize({
  rule,
  onChange,
  candidates,
  others = [],
  lead = "Recognize files whose name",
  extraModes = [],
  patternFor = compileRule,
  what = "this account",
  label = "Text to match",
  hint = "",
  showChips = true,
  test = patternMatches,
  noun = ["file", "files"],
  emptyMessage = "",
}) {
  const matches = (f) => test(patternFor(rule), f.filename);
  const [one, many] = noun;
  const hits = candidates.filter(matches),
    strays = others.filter(matches);
  const special = extraModes.some((m) => m.id === rule.mode);
  const empty = !special && !rule.text.trim();
  const fine = !empty && hits.length && !strays.length;
  const message = empty
    ? emptyMessage || `Nothing to match yet, so you'll choose ${what} by hand each time.`
    : !hits.length
      ? candidates.length ? `Doesn't match ${candidates.length === 1 ? `the ${one}` : `any of the ${many}`} here yet.` : "Doesn't match anything here yet."
      : strays.length
        ? `Also matches ${strays.map((f) => f.filename).join(", ")}, which ${strays.length === 1 ? "belongs" : "belong"} elsewhere. Make the text more specific so each one has one match.`
        : hits.length === candidates.length
          ? `Matches ${candidates.length === 1 ? `the ${one}` : `all ${candidates.length} ${many}`} here.`
          : `Matches ${hits.length} of ${plural(candidates.length, one, many)} here.`;
  return (
    <div className="recognize">
      <div className="recognize-sentence">
        <span>{lead}</span>
        {rule.mode === "custom" ? (
          <span className="recognize-custom">matches the pattern</span>
        ) : (
          <select aria-label="How to match" value={rule.mode} onChange={(e) => onChange({ ...rule, mode: e.target.value })}>
            {extraModes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            {ruleModes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
        {!special && (
          <input
            aria-label={label}
            className={rule.mode === "custom" ? "is-pattern" : ""}
            value={rule.text}
            spellCheck={false}
            maxLength={200}
            onChange={(e) => onChange({ ...rule, text: e.target.value })}
          />
        )}
        {rule.mode === "custom" && (
          <button type="button" className="link" onClick={() => onChange({ mode: "starts", text: "" })}>Use plain words</button>
        )}
      </div>
      <div className="recognize-proof" role="status">
        <small className={fine ? "" : "is-warn"}>
          {!fine && <Icon name="circle-help" size={16} />}
          {message}
        </small>
        {hint && fine ? <small className="is-warn"><Icon name="circle-help" size={16} />{hint}</small> : null}
        {showChips && candidates.length + others.length > 0 && (
          <div className="recognize-chips">
            {[...candidates, ...others].map((f) => {
              const on = matches(f), stray = on && others.includes(f);
              return (
                <span key={f.id} className={`recognize-chip${stray ? " is-stray" : on ? " is-on" : ""}`}>
                  <Icon name={stray ? "x" : on ? "check" : "circle-dashed"} size={16} />
                  {f.filename}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { divider, equal, money, sum } from "./review-model.js";

export function SplitEditor({
  values,
  onChange,
  labels,
  colors = {},
  capacities = {},
  onEven,
}) {
  const [precision, setPrecision] = useState(100);
  const total = sum(values);
  return (
    <div className="rv-split">
      <div className="rv-split-toolbar">
        <span>Divider precision</span>
        <div className="rv-toggle">
          {[100, 1].map((step) => (
            <button
              type="button"
              key={step}
              aria-pressed={precision === step}
              onClick={() => setPrecision(step)}
            >
              {step === 100 ? "$1" : "$0.01"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onEven
              ? onEven()
              : onChange(
                  equal(
                    values.map((p) => p.id),
                    total,
                  ),
                )
          }
        >
          Split evenly
        </button>
      </div>
      <div className="rv-split-track">
        <div className="rv-split-segments">
          {values.map((p, i) => (
            <span
              key={p.id}
              style={{
                width: `${total ? (p.cents / total) * 100 : 100 / values.length}%`,
                background:
                  colors[p.id] ||
                  ["#7E9D6D", "#8FA6CB", "#C8A06D", "#AF8EB5"][i % 4],
              }}
            />
          ))}
        </div>
        {values.slice(0, -1).map((p, i) => (
          <input
            key={p.id}
            type="range"
            min="0"
            max={total}
            step={precision}
            disabled={!total}
            value={sum(values.slice(0, i + 1))}
            aria-label={`Divider after ${labels[p.id]}`}
            onChange={(e) =>
              onChange(
                divider(
                  values,
                  i,
                  Number(e.target.value),
                  precision,
                  capacities,
                ),
              )
            }
          />
        ))}
      </div>
      <div className="rv-split-labels">
        {values.map((p) => (
          <span key={p.id}>
            <strong>{labels[p.id]}</strong>
            {money(p.cents)}
          </span>
        ))}
      </div>
      <div className="rv-boundaries">
        {values.slice(0, -1).map((p, i) => (
          <label key={p.id}>
            Boundary after {labels[p.id]}
            <input
              type="number"
              min="0"
              max={total / 100}
              step={precision / 100}
              value={(sum(values.slice(0, i + 1)) / 100).toFixed(2)}
              aria-label={`Exact divider after ${labels[p.id]}`}
              onChange={(e) => {
                if (/^\d+(\.\d{0,2})?$/.test(e.target.value))
                  onChange(
                    divider(
                      values,
                      i,
                      Math.round(Number(e.target.value) * 100),
                      1,
                      capacities,
                    ),
                  );
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

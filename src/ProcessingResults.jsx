import React from "react";
import { WorkspaceModal } from "./WorkspaceModal.jsx";

export function ProcessingResults({ result, celebrate = false, onClose }) {
  const complete = result.completed > 0 && result.remaining === 0;
  return (
    <WorkspaceModal title="Processing results" onClose={onClose}>
      <section className="dr-result-popup">
        {celebrate && complete && (
          <div className="dr-confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i
                key={i}
                style={{
                  "--x": `${8 + ((i * 37) % 84)}%`,
                  "--delay": `${(i % 6) * 0.06}s`,
                  "--turn": `${i % 2 ? 220 : -170}deg`,
                  "--confetti-color": [
                    "#799D63",
                    "#C8A55C",
                    "#809CCC",
                    "#BA82A0",
                  ][i % 4],
                }}
              />
            ))}
          </div>
        )}
        <div
          className={`dr-result-emblem ${complete ? "complete" : ""}`}
          aria-hidden="true"
        >
          {complete ? "✓" : "⋯"}
        </div>
        <h3>
          {complete
            ? "All sorted. Nice work!"
            : result.remaining
              ? "A few files need a look."
              : "Nothing to process yet."}
        </h3>
        <p>
          {result.completed} of {result.attempted} files processed
          {result.remaining
            ? ` · ${result.remaining} still need attention`
            : ""}
          .
        </p>
        <div className="dr-result-numbers">
          <div>
            <strong>{result.added}</strong>
            <span>new rows</span>
          </div>
          <div>
            <strong>{result.matched}</strong>
            <span>matched</span>
          </div>
          <div>
            <strong>{result.months.length}</strong>
            <span>months updated</span>
          </div>
        </div>
        <div className="dr-result-months">
          {result.months.length ? (
            result.months.map((month) => (
              <span key={month}>
                ✓{" "}
                {new Date(`${month}-15T12:00:00`).toLocaleDateString("en-CA", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            ))
          ) : (
            <span>No snapshots changed.</span>
          )}
        </div>
        <small className="dr-result-time">
          {new Date(result.created).toLocaleString("en-CA")}
        </small>
        <button className="primary" onClick={onClose}>
          {result.remaining ? "Back to Dropbox" : "Lovely. Done."}
        </button>
      </section>
    </WorkspaceModal>
  );
}

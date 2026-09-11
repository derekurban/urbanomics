import React, { useState } from "react";
import { accountNetwork } from "./account-network.js";

export function AccountNetwork({ overview, money, onTransfer }) {
  const [selected, setSelected] = useState(null);
  const graph = accountNetwork(overview.accounts, overview.routes);
  const active = graph.nodes.some((n) => n.id === selected) ? selected : null;
  const connected = (e) => !active || e.fromId === active || e.toId === active;
  const activate = (event, callback) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      callback();
    }
  };
  return (
    <section className="dash-panel dash-network-panel">
      <div className="dash-panel-heading">
        <h2>Between your accounts</h2>
        <button disabled={!active} onClick={() => setSelected(null)}>
          Show all connections
        </button>
      </div>
      <p className="dash-caption">
        Internal transfers · outgoing date in this period. Select an account to
        highlight its connections, or an amount to inspect the linked payments.
      </p>
      <div className="dash-network-scroll">
        <svg
          className="dash-network"
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          role="group"
          aria-label="Account transfer network"
        >
          <defs>
            <marker
              id="account-transfer-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10Z" fill="#71917c" />
            </marker>
          </defs>
          {graph.edges.map((e) => (
            <g
              key={e.key}
              className={`dash-network-edge ${connected(e) ? "" : "is-muted"}`}
            >
              <path
                d={e.path}
                fill="none"
                stroke="#71917c"
                strokeWidth="2.5"
                markerEnd="url(#account-transfer-arrow)"
              />
              <path
                className="dash-network-hit"
                d={e.path}
                fill="none"
                stroke="transparent"
                strokeWidth="18"
                onClick={() => onTransfer(e)}
              />
            </g>
          ))}
          {graph.edges.map((e) => (
            <g
              key={e.key}
              className={`dash-network-label ${connected(e) ? "" : "is-muted"}`}
              role="button"
              tabIndex={connected(e) ? 0 : -1}
              aria-label={`${e.from} to ${e.to}: ${money(e.credit)} received, ${e.pairs.length} linked transfers`}
              onClick={() => onTransfer(e)}
              onKeyDown={(event) => activate(event, () => onTransfer(e))}
            >
              <title>{`${e.from} → ${e.to}\nSent ${money(e.debit)} · received ${money(e.credit)}\nFees ${money(e.fees)} · unexplained extra ${money(e.excess)}`}</title>
              <rect
                x={e.label.x - 69}
                y={e.label.y - 16}
                width="138"
                height="32"
                rx="16"
              />
              <text x={e.label.x} y={e.label.y + 5} textAnchor="middle">
                {money(e.credit)}
              </text>
            </g>
          ))}
          {graph.nodes.map((n) => (
            <foreignObject
              key={n.id}
              x={n.x - 90}
              y={n.y - 37}
              width="180"
              height="74"
            >
              <button
                className="dash-network-node"
                aria-pressed={active === n.id}
                onClick={() => setSelected(active === n.id ? null : n.id)}
              >
                <i style={{ background: n.color }} />
                <span>{n.name}</span>
                <small>
                  {
                    overview.routes.filter(
                      (r) => r.fromId === n.id || r.toId === n.id,
                    ).length
                  }{" "}
                  {overview.routes.filter(r => r.fromId === n.id || r.toId === n.id).length === 1 ? "connection" : "connections"}
                </small>
              </button>
            </foreignObject>
          ))}
        </svg>
      </div>
      {!graph.edges.length && (
        <p className="dash-caption">
          No registered transfers with an outgoing entry in this period.
        </p>
      )}
      <p className="dash-caption">
        Arrow labels show the amount received. Each directed pair is counted
        once; select it for fees, differences and dates. Category filters do not
        hide internal connections.
      </p>
    </section>
  );
}

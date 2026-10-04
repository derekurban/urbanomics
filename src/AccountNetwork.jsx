import React, { useState } from "react";
import { Icon } from "@derekurban/design-system";
import { accountNetwork } from "./account-network.js";
import { plural } from "./format.js";

// Transfers between your own accounts: neutral arrows, the selected account's routes in the accent.
// On a phone the same routes read as a list.
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
  const routesOf = (id) => overview.routes.filter((r) => r.fromId === id || r.toId === id).length;
  return (
    <section className="dash-panel dash-network-panel">
      <div className="dash-panel-heading">
        <h2>Between your accounts</h2>
        {active && <button className="sm ghost" onClick={() => setSelected(null)}>Show every account</button>}
      </div>
      <p className="dash-caption">
        Money moved between your own accounts in this period, by the date it left. Choose an account to pick out its routes, or an amount for the payments behind it. Filters don't hide these.
      </p>
      {graph.edges.length > 0 && (
        <div className="dash-network-scroll">
          <svg className="dash-network" viewBox={`0 0 ${graph.width} ${graph.height}`} role="group" aria-label="Transfers between your accounts">
            <defs>
              <marker id="account-transfer-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10Z" className="dash-network-arrowhead" />
              </marker>
              <marker id="account-transfer-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10Z" className="dash-network-arrowhead is-on" />
              </marker>
            </defs>
            {graph.edges.map((e) => {
              const on = active && connected(e);
              return (
                <g key={e.key} className={`dash-network-edge${connected(e) ? "" : " is-muted"}${on ? " is-on" : ""}`}>
                  <path d={e.path} fill="none" markerEnd={`url(#account-transfer-arrow${on ? "-on" : ""})`} />
                  <path className="dash-network-hit" d={e.path} fill="none" stroke="transparent" strokeWidth="18" onClick={() => onTransfer(e)} />
                </g>
              );
            })}
            {graph.edges.map((e) => (
              <g
                key={e.key}
                className={`dash-network-label${connected(e) ? "" : " is-muted"}`}
                role="button"
                tabIndex={connected(e) ? 0 : -1}
                aria-label={`${e.from} to ${e.to}: ${money(e.credit)} received, ${plural(e.pairs.length, "transfer", "transfers")}`}
                onClick={() => onTransfer(e)}
                onKeyDown={(event) => activate(event, () => onTransfer(e))}
              >
                <rect x={e.label.x - 60} y={e.label.y - 14} width="120" height="28" rx="14" />
                <text x={e.label.x} y={e.label.y + 4} textAnchor="middle">{money(e.credit)}</text>
              </g>
            ))}
            {graph.nodes.map((n) => (
              <foreignObject key={n.id} x={n.x - 90} y={n.y - 34} width="180" height="68">
                <button className="dash-network-node" aria-pressed={active === n.id} onClick={() => setSelected(active === n.id ? null : n.id)}>
                  <span><i style={{ background: n.color }} />{n.name}</span>
                  <small>{plural(routesOf(n.id), "route", "routes")}</small>
                </button>
              </foreignObject>
            ))}
          </svg>
        </div>
      )}
      {graph.edges.length > 0 && (
        <ul className="dash-network-list" aria-label="Transfers between your accounts">
          {graph.edges.map((e) => (
            <li key={e.key}>
              <button onClick={() => onTransfer(e)}>
                <span>{e.from}<Icon name="arrow-right" size={16} />{e.to}</span>
                <strong className="tabular">{money(e.credit)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!graph.edges.length && <p className="dash-caption">No transfers between your accounts left in this period.</p>}
    </section>
  );
}

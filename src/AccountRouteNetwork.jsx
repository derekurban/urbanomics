import React, { useEffect, useId, useRef, useState } from "react";
import "./account-route-network.css";
import { Icon } from "@derekurban/design-system";
import { InfoDot } from "./snapshots-v2-atoms.jsx";
const clamp = (n) => Math.max(0, Math.min(1, n));
const layoutKey = "urbanomics.transfer-route-layout";
function savedLayout() {
  try {
    const value = JSON.parse(localStorage.getItem(layoutKey) || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
function curve(a, b, width, height) {
  const reach = Math.max(45, Math.min(150, Math.abs(b.x - a.x) * 0.5)),
    c1 = Math.min(width - 12, a.x + reach),
    c2 = Math.max(12, b.x - reach);
  if (b.x < a.x + 30) {
    const bend =
        a.y < height / 2
          ? Math.max(12, Math.min(a.y, b.y) - 92)
          : Math.min(height - 25, Math.max(a.y, b.y) + 92),
      mid = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${c1} ${a.y}, ${c1} ${bend}, ${mid} ${bend} C ${c2} ${bend}, ${c2} ${b.y}, ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} C ${c1} ${a.y}, ${c2} ${b.y}, ${b.x} ${b.y}`;
}
// Directions only rank Organize's transfer suggestions; they never hide one.
const noDirections = "No directions yet. Organize still suggests transfers between any two of your accounts; directions put the likely ones first.";
const phone = "(max-width: 720px)";
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === "function" && matchMedia(phone).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(phone), listen = () => setNarrow(query.matches);
    query.addEventListener("change", listen);
    return () => query.removeEventListener("change", listen);
  }, []);
  return narrow;
}
/** Phones get a list of directions and two selects instead of the drawing; both save through onChange. */
export function AccountRouteNetwork(props) {
  return useNarrow() ? <RouteList {...props} /> : <RouteDrawing {...props} />;
}
function RouteList({ accounts, routes, onChange, disabled }) {
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const name = (id) => accounts.find((a) => a.id === id)?.name || "Unknown account";
  const exists = routes.some((r) => r.from === from && r.to === to);
  return (
    <section className="arn arn-list" aria-label="Account route network">
      <ul className="arn-directions" aria-label="Allowed directions">
        {routes.map((r) => (
          <li key={`${r.from}-${r.to}`}>
            <span>{name(r.from)} <Icon name="arrow-right" size={16} /> {name(r.to)}</span>
            <button type="button" className="icon ghost sm" disabled={disabled} aria-label={`Remove route ${name(r.from)} to ${name(r.to)}`}
              onClick={() => onChange(routes.filter((x) => x.from !== r.from || x.to !== r.to))}>
              <Icon name="x" size={16} />
            </button>
          </li>
        ))}
        {!routes.length && <li className="arn-none">{noDirections}</li>}
      </ul>
      {accounts.length > 1 && (
        <div className="arn-add" role="group" aria-label="Add direction">
          <label>From<select value={from} disabled={disabled} onChange={(e) => { setFrom(e.target.value); if (e.target.value === to) setTo(""); }}>
            <option value="">Choose an account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
          <label>To<select value={to} disabled={disabled} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose an account</option>
            {accounts.filter((a) => a.id !== from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
          <button type="button" disabled={disabled || !from || !to || exists} onClick={() => { onChange([...routes, { from, to }]); setFrom(""); setTo(""); }}>
            <Icon name="plus" size={16} />Add direction
          </button>
          {exists && <small>That direction is already there.</small>}
        </div>
      )}
    </section>
  );
}
function RouteDrawing({ accounts, routes, onChange, disabled }) {
  const canvas = useRef(null),
    drag = useRef(null),
    suppress = useRef(false),
    marker = useId().replace(/:/g, "");
  const [width, setWidth] = useState(800),
    [positions, setPositions] = useState(savedLayout),
    [connecting, setConnecting] = useState(""),
    [ghost, setGhost] = useState(null),
    [moving, setMoving] = useState(""),
    [selected, setSelected] = useState(null),
    [notice, setNotice] = useState("");
  const columns = Math.max(2, Math.floor((width - 48) / 210)),
    height = Math.max(340, Math.ceil(accounts.length / columns) * 145 + 60),
    nodeWidth = 148,
    nodeHeight = 76;
  const path = (a, b) => curve(a, b, width, height);
  const usableX = Math.max(1, width - nodeWidth - 64),
    usableY = height - nodeHeight - 60;
  const defaults = (i) =>
    accounts.length <= 4
      ? [
          { x: 0.03, y: 0.1 },
          { x: 0.97, y: 0.1 },
          { x: 0.97, y: 0.78 },
          { x: 0.03, y: 0.78 },
        ][i]
      : {
          x: (i % columns) / (columns - 1),
          y:
            Math.floor(i / columns) /
            Math.max(1, Math.ceil(accounts.length / columns) - 1),
        };
  const point = (id) => {
    const i = accounts.findIndex((a) => a.id === id),
      p = positions[id],
      fallback = defaults(Math.max(0, i));
    return {
      x: 32 + clamp(Number.isFinite(p?.x) ? p.x : fallback.x) * usableX,
      y: 30 + clamp(Number.isFinite(p?.y) ? p.y : fallback.y) * usableY,
    };
  };
  const input = (id) => {
      const p = point(id);
      return { x: p.x - 10, y: p.y + nodeHeight / 2 };
    },
    output = (id) => {
      const p = point(id);
      return { x: p.x + nodeWidth + 10, y: p.y + nodeHeight / 2 };
    };
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(layoutKey, JSON.stringify(positions));
    } catch {}
  }, [positions]);
  useEffect(() => {
    if (disabled) {
      drag.current = null;
      setConnecting("");
      setGhost(null);
      setMoving("");
    }
  }, [disabled]);
  function pointer(e) {
    const r = canvas.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function connect(from, to) {
    if (disabled || !from || from === to) return;
    const a = accounts.find((a) => a.id === from),
      b = accounts.find((a) => a.id === to);
    if (!a || !b) return;
    if (!routes.some((r) => r.from === from && r.to === to)) {
      onChange([...routes, { from, to }]);
      setNotice(`${a.name} → ${b.name} connected.`);
    } else setNotice("That direction is already connected.");
    setConnecting("");
    setGhost(null);
    setSelected(null);
  }
  function begin(e, id, type) {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.focus();
    suppress.current = false;
    const p = pointer(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, type, start: p, origin: point(id), moved: false };
    setSelected(null);
    if (type === "connect") {
      setConnecting(id);
      setGhost(p);
    } else setMoving(id);
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const p = pointer(e);
    d.moved ||= Math.hypot(p.x - d.start.x, p.y - d.start.y) > 4;
    if (d.type === "connect") setGhost(p);
    else
      setPositions((s) => ({
        ...s,
        [d.id]: {
          x: clamp((d.origin.x + p.x - d.start.x - 32) / usableX),
          y: clamp((d.origin.y + p.y - d.start.y - 30) / usableY),
        },
      }));
  }
  function finish(e) {
    const d = drag.current;
    if (!d) return;
    const p = pointer(e);
    drag.current = null;
    setMoving("");
    setGhost(null);
    if (d.type === "connect") {
      suppress.current = true;
      const target = accounts.find((a) => {
        const q = point(a.id);
        return (
          a.id !== d.id &&
          p.x >= q.x - 24 &&
          p.x <= q.x + nodeWidth + 24 &&
          p.y >= q.y - 8 &&
          p.y <= q.y + nodeHeight + 8
        );
      });
      if (target) connect(d.id, target.id);
      else if (d.moved) {
        setConnecting("");
        setNotice("Connection cancelled. Drop on another account to connect.");
      } else setConnecting(d.id);
    } else if (d.moved) suppress.current = true;
  }
  function cancel() {
    drag.current = null;
    setConnecting("");
    setGhost(null);
    setMoving("");
  }
  function bodyClick(e, id) {
    if (e.detail > 0 && suppress.current) {
      suppress.current = false;
      return;
    }
    if (connecting) connect(connecting, id);
  }
  function remove(r) {
    if (disabled) return;
    onChange(routes.filter((x) => x.from !== r.from || x.to !== r.to));
    setSelected(null);
    setNotice("Connection removed.");
  }
  const accountName = (id) =>
    accounts.find((a) => a.id === id)?.name || "Removed account";
  return (
    <section
      className="arn"
      aria-label="Account route network"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          cancel();
          setSelected(null);
        }
      }}
    >
      <div className="arn-tools">
        <span className="arn-how">How to draw a direction
        <InfoDot label="How to draw a direction" align="start">
          Drag from an account's plus onto another account, or click the plus and then the account. Drag the
          accounts themselves to tidy the picture. With the keyboard, arrow keys move a focused account; select an
          arrow to remove it.
        </InfoDot></span>
        <button
          type="button"
          className="sm ghost"
          disabled={disabled}
          onClick={() => {
            setPositions({});
            cancel();
          }}
        >
          Tidy layout
        </button>
      </div>
      <div
        className={`arn-canvas ${connecting ? "is-connecting" : ""}`}
        ref={canvas}
        style={{ height }}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
      >
        <svg
          className="arn-lines"
          width="100%"
          height={height}
          aria-label="Directed connections"
        >
          <defs>
            <marker
              id={`${marker}-arrow`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 1 1 L 9 5 L 1 9 Z" fill="currentColor" />
            </marker>
          </defs>
          {routes
            .filter(
              (r) =>
                accounts.some((a) => a.id === r.from) &&
                accounts.some((a) => a.id === r.to),
            )
            .map((r) => (
              <g
                key={`${r.from}-${r.to}`}
                className={
                  selected?.from === r.from && selected?.to === r.to
                    ? "is-selected"
                    : ""
                }
              >
                <path
                  className="arn-edge"
                  d={path(output(r.from), input(r.to))}
                  markerEnd={`url(#${marker}-arrow)`}
                />
                <path
                  className="arn-edge-hit"
                  d={path(output(r.from), input(r.to))}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-label={`Connection ${accountName(r.from)} to ${accountName(r.to)}`}
                  aria-disabled={disabled}
                  onClick={() => {
                    if (!disabled) setSelected(r);
                  }}
                  onKeyDown={(e) => {
                    if (disabled) return;
                    if (["Delete", "Backspace"].includes(e.key)) {
                      e.preventDefault();
                      remove(r);
                    } else if (["Enter", " "].includes(e.key)) {
                      e.preventDefault();
                      setSelected(r);
                    }
                  }}
                />
              </g>
            ))}
          {ghost && connecting && (
            <path
              className="arn-ghost"
              d={path(output(connecting), ghost)}
              markerEnd={`url(#${marker}-arrow)`}
            />
          )}
        </svg>
        {accounts.map((a) => {
          const p = point(a.id);
          return (
            <div
              className={`arn-node ${moving === a.id ? "is-moving" : ""} ${connecting && connecting !== a.id ? "is-target" : ""} ${connecting === a.id ? "is-source" : ""}`}
              key={a.id}
              style={{
                left: p.x,
                top: p.y,
                width: nodeWidth,
                height: nodeHeight,
                "--account-color": a.color,
              }}
              data-account-node={a.id}
            >
              <button
                type="button"
                className="arn-port arn-input"
                disabled={disabled}
                aria-label={`Connect to ${a.name}`}
                onClick={() => connect(connecting, a.id)}
                title="Connect here"
              >
                <Icon name="circle-dashed" size={16} />
              </button>
              <button
                type="button"
                className="arn-node-body"
                disabled={disabled}
                aria-label={`Move ${a.name}`}
                onPointerDown={(e) => begin(e, a.id, "move")}
                onClick={(e) => bodyClick(e, a.id)}
                onKeyDown={(e) => {
                  if (
                    ![
                      "ArrowUp",
                      "ArrowDown",
                      "ArrowLeft",
                      "ArrowRight",
                    ].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  setPositions((s) => ({
                    ...s,
                    [a.id]: {
                      x: clamp(
                        (p.x -
                          32 +
                          (e.key === "ArrowRight"
                            ? 12
                            : e.key === "ArrowLeft"
                              ? -12
                              : 0)) /
                          usableX,
                      ),
                      y: clamp(
                        (p.y -
                          30 +
                          (e.key === "ArrowDown"
                            ? 12
                            : e.key === "ArrowUp"
                              ? -12
                              : 0)) /
                          usableY,
                      ),
                    },
                  }));
                }}
              >
                <span className="arn-account-dot" />
                <strong>{a.name}</strong>
                <small>
                  {routes.filter((r) => r.from === a.id).length} out ·{" "}
                  {routes.filter((r) => r.to === a.id).length} in
                </small>
              </button>
              <button
                type="button"
                className="arn-port arn-output"
                disabled={disabled}
                aria-label={`Connect from ${a.name}`}
                aria-pressed={connecting === a.id}
                onPointerDown={(e) => begin(e, a.id, "connect")}
                onClick={(e) => {
                  if (e.detail > 0 && suppress.current) {
                    suppress.current = false;
                    return;
                  }
                  setConnecting((c) => (c === a.id ? "" : a.id));
                  setSelected(null);
                }}
                title="Draw a direction from here"
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          );
        })}
        {!accounts.length && (
          <p className="arn-empty">
            Your accounts appear here once you've imported from them.
          </p>
        )}
        <div className="arn-canvas-note">
          {connecting
            ? `From ${accountName(connecting)} to… (Escape cancels)`
            : "Arrows are directions money may move, not transfers that happened."}
        </div>
      </div>
      {selected && (
        <div className="arn-selection">
          <strong>
            {accountName(selected.from)} to {accountName(selected.to)}
          </strong>
          <button
            type="button"
            className="sm danger"
            disabled={disabled}
            onClick={() => remove(selected)}
          >
            Remove this direction
          </button>
          <button type="button" className="sm" onClick={() => setSelected(null)}>
            Done
          </button>
        </div>
      )}
      <div className="arn-route-list" aria-label="Allowed directions">
        {routes.map((r) => (
          <button
            type="button"
            className="sm"
            disabled={disabled}
            key={`${r.from}-${r.to}`}
            aria-label={`Remove route ${accountName(r.from)} to ${accountName(r.to)}`}
            onClick={() => remove(r)}
          >
            {accountName(r.from)} <Icon name="arrow-right" size={16} /> {accountName(r.to)} <Icon name="x" size={16} />
          </button>
        ))}
        {!routes.length && <small>{noDirections}</small>}
      </div>
      <p className="arn-notice" role="status">
        {notice}
      </p>
    </section>
  );
}

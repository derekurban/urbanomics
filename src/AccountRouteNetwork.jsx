import React, { useEffect, useId, useRef, useState } from "react";
import "./account-route-network.css";
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
export function AccountRouteNetwork({ accounts, routes, onChange, disabled }) {
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
        <p>
          Drag accounts to arrange them. Drag a <b>＋</b> connector onto another
          account to allow that direction. You can also click a connector, then
          a destination.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setPositions({});
            cancel();
          }}
        >
          Arrange nodes
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
                title="Receive connection"
              >
                ●
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
                title="Draw an outgoing connection"
              >
                ＋
              </button>
            </div>
          );
        })}
        {!accounts.length && (
          <p className="arn-empty">
            Add accounts in Organize to draw your routes.
          </p>
        )}
        <div className="arn-canvas-note">
          {connecting
            ? `Connecting from ${accountName(connecting)} · Escape cancels`
            : "Arrows show allowed directions, not recorded transfers."}
        </div>
      </div>
      {selected && (
        <div className="arn-selection">
          <strong>
            {accountName(selected.from)} → {accountName(selected.to)}
          </strong>
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(selected)}
          >
            Remove connection
          </button>
          <button type="button" onClick={() => setSelected(null)}>
            Done
          </button>
        </div>
      )}
      <div className="arn-route-list" aria-label="Allowed directions">
        {routes.map((r) => (
          <button
            type="button"
            disabled={disabled}
            key={`${r.from}-${r.to}`}
            aria-label={`Remove route ${accountName(r.from)} to ${accountName(r.to)}`}
            onClick={() => remove(r)}
          >
            {accountName(r.from)} <span aria-hidden="true">→</span>{" "}
            {accountName(r.to)} <span aria-hidden="true">×</span>
          </button>
        ))}
        {!routes.length && <small>No directions connected yet.</small>}
      </div>
      <p className="arn-notice" role="status">
        {notice ||
          "Tip: arrow keys move a focused account; select a line to remove its connection."}
      </p>
    </section>
  );
}

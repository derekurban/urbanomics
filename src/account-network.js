// Deterministic layout: stable account nodes, reciprocal arrows on separate curves.
export function accountNetwork(accounts, routes) {
  const nodes = new Map(
    accounts.map((a) => [a.id, { id: a.id, name: a.name, color: a.color }]),
  );
  for (const r of routes) {
    if (!nodes.has(r.fromId))
      nodes.set(r.fromId, { id: r.fromId, name: r.from, color: r.fromColor });
    if (!nodes.has(r.toId))
      nodes.set(r.toId, { id: r.toId, name: r.to, color: r.toColor });
  }
  const list = [...nodes.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  // The canvas grows with the number of accounts, so two accounts don't sit in a large empty well.
  const width = 760,
    height = list.length <= 2 ? 220 : list.length <= 4 ? 380 : Math.max(440, list.length * 72);
  list.forEach((n, i) => {
    if (list.length <= 2) {
      n.x = list.length === 1 ? width / 2 : i === 0 ? 120 : width - 120;
      n.y = height / 2;
      return;
    }
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / list.length;
    n.x = width / 2 + (width / 2 - 120) * Math.cos(angle);
    n.y = height / 2 + (height / 2 - 50) * Math.sin(angle);
  });
  const byId = new Map(list.map((n) => [n.id, n]));
  const labels = [];
  const edges = routes.map((r) => {
    const a = byId.get(r.fromId),
      b = byId.get(r.toId);
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy) || 1;
    const bend = routes.some((o) => o.fromId === r.toId && o.toId === r.fromId)
      ? 70
      : 30;
    const cx = (a.x + b.x) / 2 - (dy / length) * bend,
      cy = (a.y + b.y) / 2 + (dx / length) * bend;
    const anchor = (n, x, y) => {
      const vx = x - n.x,
        vy = y - n.y;
      const t = Math.min(
        94 / Math.max(0.001, Math.abs(vx)),
        42 / Math.max(0.001, Math.abs(vy)),
      );
      return { x: n.x + vx * t, y: n.y + vy * t };
    };
    const start = anchor(a, cx, cy),
      end = anchor(b, cx, cy);
    const point = (t) => ({
      x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * cx + t * t * end.x,
      y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * cy + t * t * end.y,
    });
    let label = point(0.5);
    for (const t of [0.5, 0.32, 0.68, 0.22, 0.78]) {
      const p = point(t);
      if (
        !labels.some(
          (l) => Math.abs(l.x - p.x) < 125 && Math.abs(l.y - p.y) < 38,
        )
      ) {
        label = p;
        break;
      }
    }
    labels.push(label);
    return {
      ...r,
      path: `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`,
      label,
    };
  });
  return { width, height, nodes: list, edges };
}

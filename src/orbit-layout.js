// Even spacing along an ellipse, widening first and growing vertically when
// the available window width is exhausted. Targets keep readable dimensions.
export function orbitLayout(count, width, cardHeight) {
  const targetWidth = Math.min(140, Math.max(96, (width - 260) / 2));
  const targetHeight = 102;
  const cardWidth = Math.min(226, width - 2 * targetWidth - 80);
  const rx = Math.min(
    (width - targetWidth) / 2 - 12,
    Math.max(270, cardWidth / 2 + targetWidth / 2 + 26, count * 32),
  );
  let ry = Math.max((cardHeight + targetHeight) / 2 + 30, rx * 0.85);
  function points() {
    const samples = [],
      steps = 1024;
    let length = 0,
      previous;
    for (let i = 0; i <= steps; i++) {
      const angle = -Math.PI / 2 + (i / steps) * Math.PI * 2;
      const point = { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
      if (previous)
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
      samples.push({ ...point, length });
      previous = point;
    }
    let cursor = 0;
    return Array.from({ length: count }, (_, i) => {
      const distance = (i / count) * length;
      while (samples[cursor + 1]?.length < distance) cursor++;
      const a = samples[cursor],
        b = samples[cursor + 1];
      const fraction = (distance - a.length) / (b.length - a.length);
      return {
        x: a.x + (b.x - a.x) * fraction,
        y: a.y + (b.y - a.y) * fraction,
      };
    });
  }
  let targets;
  for (let attempt = 0; attempt < 160; attempt++) {
    targets = points();
    const overlaps = targets.some(
      (p, i) =>
        (Math.abs(p.x) < (cardWidth + targetWidth) / 2 + 18 &&
          Math.abs(p.y) < (cardHeight + targetHeight) / 2 + 22) ||
        targets
          .slice(i + 1)
          .some(
            (q) =>
              Math.abs(p.x - q.x) < targetWidth + 14 &&
              Math.abs(p.y - q.y) < targetHeight + 14,
          ),
    );
    if (!overlaps) break;
    ry *= 1.08;
  }
  const height = ry * 2 + targetHeight + 28;
  return {
    height,
    rx,
    ry,
    cardWidth,
    targetWidth,
    targetHeight,
    targets: targets.map((p) => ({ x: p.x + width / 2, y: p.y + height / 2 })),
  };
}

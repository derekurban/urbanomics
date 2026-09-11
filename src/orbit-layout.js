// Space compact targets by their rectangular footprint along an ellipse.
// Horizontal arcs need label-width gaps; vertical arcs need only chip-height gaps.
export function orbitLayout(count, width, cardHeight) {
  const targetWidth = Math.min(116, Math.max(90, (width - 250) / 2));
  const targetHeight = 44;
  const cardWidth = Math.min(206, width - 2 * targetWidth - 56);
  const rx = Math.min(
    (width - targetWidth) / 2 - 8,
    Math.max(230, cardWidth / 2 + targetWidth / 2 + 20, count * 18),
  );
  let ry = Math.max((cardHeight + targetHeight) / 2 + 18, rx * 0.4);
  function points() {
    const samples = [],
      steps = 1024;
    let length = 0,
      previous;
    for (let i = 0; i <= steps; i++) {
      const angle = -Math.PI / 2 + (i / steps) * Math.PI * 2;
      const point = { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
      if (previous)
        length += Math.max(
          Math.abs(point.x - previous.x) / (targetWidth + 6),
          Math.abs(point.y - previous.y) / (targetHeight + 6),
        );
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
        (Math.abs(p.x) < (cardWidth + targetWidth) / 2 + 12 &&
          Math.abs(p.y) < (cardHeight + targetHeight) / 2 + 16) ||
        targets
          .slice(i + 1)
          .some(
            (q) =>
              Math.abs(p.x - q.x) < targetWidth + 6 &&
              Math.abs(p.y - q.y) < targetHeight + 6,
          ),
    );
    if (!overlaps) break;
    ry *= 1.04;
  }
  const height = ry * 2 + targetHeight + 16;
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

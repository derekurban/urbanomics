// One circle: grow its radius to preserve the gap between fixed-size bubbles.
export function ringSlots(count, firstRadius = 123, spacing = 90) {
  const radius = count
    ? Math.max(
        firstRadius,
        count > 1 ? spacing / (2 * Math.sin(Math.PI / count)) : 0,
      )
    : 0;
  const points = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return { points, radius };
}
export function radialSize(tags, buckets, lens = "expense") {
  const counts =
    lens === "income"
      ? [tags.length]
      : [
          ...buckets.map((b) => tags.filter((t) => t.parentId === b.id).length),
          tags.filter((t) => !t.parentId).length,
        ];
  const tagRadius = ringSlots(
    Math.max(0, ...counts),
    lens === "income" ? 205 : 123,
  ).radius;
  const bucketRadius =
    lens === "income"
      ? 0
      : ringSlots(buckets.length + (counts.at(-1) > 0 ? 1 : 0), 205, 102)
          .radius;
  const size = Math.max(560, 2 * (Math.max(tagRadius, bucketRadius) + 54));
  return { width: size, height: size };
}

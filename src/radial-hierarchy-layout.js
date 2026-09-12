// Fixed-size targets on as many rings as needed; never page or shrink them.
export function ringSlots(count, firstRadius = 123, spacing = 90) {
  const points = [];
  let radius = firstRadius;
  while (points.length < count) {
    const size = Math.min(
      count - points.length,
      Math.floor((2 * Math.PI * radius) / spacing),
    );
    for (let i = 0; i < size; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / size;
      points.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
    }
    if (points.length < count) radius += spacing;
  }
  return { points, radius: count ? radius : 0 };
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

// Shared hex interpolation keeps saved category colors and rendered tag steps aligned.
export const validColor = (color) => /^#[0-9a-f]{6}$/i.test(color || "");
export function blend(start, end, position = 0.5) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(start.slice(i, i + 2), 16) * (1 - position) +
            parseInt(end.slice(i, i + 2), 16) * position,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function endpoints(entity) {
  const base = validColor(entity?.color) ? entity.color : "#8FA6CB";
  return {
    gradientStart: entity?.gradientStart || blend(base, "#000000", 0.35),
    gradientEnd: entity?.gradientEnd || blend(base, "#ffffff", 0.55),
  };
}
export function systemPalette(entities, id) {
  const palette = entities.find((e) => e.kind === "palette" && e.id === id) || {
    id,
    kind: "palette",
    name: id === "income" ? "Income" : "Ungrouped tags",
    ...(id === "income"
      ? { gradientStart: "#3b65ac", gradientEnd: "#6cd9ba" }
      : { gradientStart: "#66736f", gradientEnd: "#c2d2c3" }),
  };
  return {
    ...palette,
    color: blend(palette.gradientStart, palette.gradientEnd),
  };
}

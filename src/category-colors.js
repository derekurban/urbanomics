import { alphabetical, tagType } from "../electron/review/tag-model.mjs";

// A display palette only. Saved custom colors survive grouping and ungrouping.
export function categoryColors(entities) {
  const shades = new Map();
  for (const bucket of entities.filter((e) => e.kind === "bucket")) {
    const tags = alphabetical(
      entities.filter(
        (e) =>
          e.kind === "category" &&
          tagType(e) === "expense" &&
          e.parentId === bucket.id,
      ),
    );
    const rgb = bucket.color
      .match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
      ?.slice(1)
      .map((v) => parseInt(v, 16));
    if (!rgb) continue;
    tags.forEach((tag, i) => {
      const mix =
        tags.length === 1 ? 0 : -0.24 + (i / (tags.length - 1)) * 0.72;
      const color =
        "#" +
        rgb
          .map((v) =>
            Math.round(mix < 0 ? v * (1 + mix) : v + (255 - v) * mix)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("");
      shades.set(tag.id, color);
    });
  }
  return entities.map((entity) => {
    const customColor = entity.customColor ?? entity.color;
    return shades.has(entity.id)
      ? {
          ...entity,
          customColor,
          color: shades.get(entity.id),
          inheritedColor: true,
        }
      : { ...entity, color: customColor, inheritedColor: false };
  });
}

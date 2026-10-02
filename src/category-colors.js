import { orderedTags as alphabetical, tagType } from "../electron/review/tag-model.mjs";
import {
  blend,
  endpoints,
  systemPalette,
} from "../electron/review/palette.mjs";

// Display-only inheritance. Financial records and legacy tag colors stay untouched.
export function categoryColors(entities) {
  const shades = new Map();
  const palettes = [
    ...entities.filter((e) => e.kind === "bucket"),
    systemPalette(entities, "income"),
    systemPalette(entities, "ungrouped"),
  ];
  for (const palette of palettes) {
    const { gradientStart, gradientEnd } = endpoints(palette);
    const tags = alphabetical(
      entities.filter(
        (e) =>
          e.kind === "category" && !e.systemRole &&
          (palette.id === "income"
            ? tagType(e) === "income"
            : tagType(e) === "expense" &&
              (palette.id === "ungrouped"
                ? !e.parentId
                : e.parentId === palette.id)),
      ),
    );
    shades.set(palette.id, {
      color: blend(gradientStart, gradientEnd),
      gradientStart,
      gradientEnd,
    });
    tags.forEach((tag, i) =>
      shades.set(tag.id, {
        color: blend(
          gradientStart,
          gradientEnd,
          tags.length === 1 ? 0.5 : i / (tags.length - 1),
        ),
        inheritedColor: true,
      }),
    );
  }
  return entities.map((entity) => ({
    ...entity,
    customColor: entity.customColor ?? entity.color,
    ...shades.get(entity.id),
  }));
}

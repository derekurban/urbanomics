const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { ImportStore } = require("../../electron/imports/store.cjs");
const {
  configurationSQL,
  seedConfiguration,
} = require("../../electron/configuration.cjs");
test("category and income endpoints persist as configuration, interpolate in alphabetical order, and never set tag colors", async (t) => {
  const { categoryColors } = await import("../../src/category-colors.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "urbanomics-palettes-"));
  let s = new ImportStore(path.join(root, "data"));
  t.after(() => {
    s.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const parent = s.review.entity("bucket", {
    name: "Food",
    color: "#888888",
    gradientStart: "#ff0000",
    gradientEnd: "#0000ff",
  });
  const ids = ["Zoo", "Apple", "Market"].map((name) =>
    s.review.entity("category", { name, color: "#123456", parentId: parent }),
  );
  const income = ["Salary", "Interest", "Gifts"].map((name) =>
    s.review.entity("category", { name, color: "#123456", flowType: "income" }),
  );
  s.review.entity("palette", {
    id: "income",
    gradientStart: "#004400",
    gradientEnd: "#44ffff",
  });
  const entities = s.review.entities(),
    paint = categoryColors(entities);
  assert.equal(entities.find((e) => e.id === parent).color, "#800080");
  assert.equal(paint.find((e) => e.id === ids[1]).color, "#ff0000");
  assert.equal(paint.find((e) => e.id === ids[2]).color, "#800080");
  assert.equal(paint.find((e) => e.id === ids[0]).color, "#0000ff");
  assert.equal(paint.find((e) => e.id === income[2]).color, "#004400");
  assert.equal(paint.find((e) => e.id === income[0]).color, "#44ffff");
  const tag = entities.find((e) => e.id === ids[0]);
  s.review.entity("category", { ...tag, color: "#ffffff" });
  assert.equal(
    s.review.entities().find((e) => e.id === tag.id).color,
    tag.color,
    "tag colors cannot be independently changed",
  );
  assert.throws(
    () =>
      s.review.entity("bucket", {
        ...entities.find((e) => e.id === parent),
        gradientStart: "bad",
      }),
    /valid gradient/,
  );
  assert.throws(
    () =>
      s.review.entity("palette", {
        id: "income",
        gradientStart: "",
        gradientEnd: "#ffffff",
      }),
    /valid gradient/,
  );
  assert.throws(() => s.review.removeEntity("income"), /cannot be deleted/);
  const sql = configurationSQL(s.db),
    file = path.join(root, "seed.sql");
  fs.writeFileSync(file, sql);
  assert.match(sql, /category_palettes/);
  assert.match(sql, /gradientStart/);
  const fresh = new ImportStore(path.join(root, "fresh"));
  try {
    seedConfiguration(fresh.db, file);
    assert.deepEqual(
      categoryColors(fresh.review.entities()).sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      paint.sort((a, b) => a.id.localeCompare(b.id)),
    );
  } finally {
    fresh.close();
  }
  s.close();
  s = new ImportStore(path.join(root, "data"));
  assert.deepEqual(s.review.entities(), entities);
});

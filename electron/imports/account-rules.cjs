const { RE2 } = require("re2-wasm");

const colors = [
  "#427A64",
  "#6883C5",
  "#B87654",
  "#9674B7",
  "#BE6684",
  "#529BA5",
  "#A38A38",
  "#687786",
];

function prefixPattern(value) {
  if (typeof value !== "string" || value.length > 256)
    throw new Error("Use a filename prefix regex of up to 256 characters.");
  if (!value.trim()) return null;
  try {
    // Anchoring the entire expression also keeps alternatives at the start.
    return new RE2(`^(?:${value.trim()})`, "iu");
  } catch {
    throw new Error(
      "Invalid prefix regex. Use RE2 syntax without / delimiters; lookarounds and backreferences are not supported.",
    );
  }
}

function appearance(name, prefixRegex, color) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
    throw new Error("Enter an account name of 1–80 characters.");
  prefixPattern(prefixRegex);
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
    throw new Error("Choose a valid account color.");
  return {
    name: name.trim(),
    prefixRegex: prefixRegex.trim(),
    color: color.toUpperCase(),
  };
}

module.exports = { colors, prefixPattern, appearance };

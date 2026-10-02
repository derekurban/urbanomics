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
// Highlight only a provable literal prefix. Arbitrary regex syntax remains pattern-colored.
function prefixPreview(pattern,filename){
 const re=prefixPattern(pattern),match=re?.exec(filename);let literal='';const p=pattern.trim().replace(/^\^/,'');
 for(let i=0;i<p.length;i++){const c=p[i];if(c==='\\'){if(i+1<p.length&&/[.\\^$*+?()[\]{}|\-/]/.test(p[i+1]))literal+=p[++i];else break;}else if(/[.^$*+?()[\]{}|]/.test(c))break;else literal+=c;}
 // A later alternation or quantifier can invalidate a plain prefix interpretation.
 if(/(^|[^\\])\|/.test(p))literal='';
 const end=match?match[0].length:0,literalEnd=match&&filename.toLowerCase().startsWith(literal.toLowerCase())?Math.min(literal.length,end):0;
 const segments=[{text:filename.slice(0,literalEnd),kind:'literal'},{text:filename.slice(literalEnd,end),kind:'pattern'},{text:filename.slice(end),kind:'unmatched'}].filter(s=>s.text);
 return {matches:!!match,matchStart:match?0:null,matchEnd:end,literalEnd,segments};
}
module.exports.prefixPreview=prefixPreview;

const FORMATS = { ymd: 'Year / Month / Day', mdy: 'Month / Day / Year', dmy: 'Day / Month / Year' };

function parseCalendarDate(value, format) {
  const s = String(value ?? '').trim();
  let year, month, day;
  const match = format === 'ymd'
    ? s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
    : s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match && FORMATS[format]) {
    if (format === 'ymd') [, year, month, day] = match;
    else { year = match[3]; month = match[format === 'mdy' ? 1 : 2]; day = match[format === 'mdy' ? 2 : 1]; }
  }
  const issue = `Invalid calendar date: ${JSON.stringify(s.slice(0, 80))} does not fit ${FORMATS[format] || 'the selected format'}.`;
  if (!year) throw Error(issue);
  const key = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(key + 'T12:00:00Z');
  if (+year < 1900 || +year > 2200 || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== key) throw Error(issue);
  return key;
}

// Use all rows and the import parser itself. No bank, locale or majority-vote assumptions.
function detectDateFormats(rows, column) {
  const candidates = Object.entries(FORMATS).map(([format, label]) => ({ format, label, validCount: 0, firstInvalid: null, example: null }));
  const cache = new Map();
  let strongest = -1;
  rows.forEach((row, index) => {
    const raw = String(row[column] ?? '').trim();
    let readings = cache.get(raw);
    if (!readings) {
      readings = candidates.map(c => { try { return parseCalendarDate(raw, c.format); } catch { return null; } });
      cache.set(raw, readings);
    }
    const score = readings.filter(Boolean).length;
    // Prefer a row that distinguishes orders, then one with visibly different interpretations.
    const evidence = score ? (3 - score) * 10 + new Set(readings.filter(Boolean)).size : -1;
    candidates.forEach((candidate, i) => {
      if (readings[i]) {
        candidate.validCount++;
        if (!candidate.example || evidence > strongest) candidate.example = { raw: raw.slice(0, 80), date: readings[i], record: index + 2 };
      } else if (!candidate.firstInvalid) candidate.firstInvalid = { raw: raw.slice(0, 80), record: index + 2 };
    });
    strongest = Math.max(strongest, evidence);
  });
  const possible = candidates.filter(c => rows.length > 0 && c.validCount === rows.length);
  return { rowCount: rows.length, status: !rows.length ? 'empty' : possible.length === 1 ? 'conclusive' : possible.length > 1 ? 'ambiguous' : 'invalid', suggested: possible.length === 1 ? possible[0].format : null, candidates };
}
module.exports = { FORMATS, parseCalendarDate, detectDateFormats };

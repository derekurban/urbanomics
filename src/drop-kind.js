// What a file drag carries, judged while it hovers. During dragenter/dragover the browser exposes each
// item's kind and MIME type but not its name, so this is a hint; the drop itself filters by filename.
// Windows often reports an empty type for .csv files, so an empty type counts as a possible CSV.
const csvTypes = new Set([
  '',
  'text/csv',
  'text/plain',
  'text/comma-separated-values',
  'text/x-csv',
  'application/csv',
  'application/vnd.ms-excel',
]);

/** 'accept' (every file may be a CSV), 'mixed' (some may be), 'reject' (none can be) or null (not a file drag). */
export function dropKind(dataTransfer) {
  if (!dataTransfer || !Array.from(dataTransfer.types || []).includes('Files')) return null;
  const files = Array.from(dataTransfer.items || []).filter((item) => item.kind === 'file');
  if (!files.length) return 'accept';
  const possible = files.filter((item) => csvTypes.has(String(item.type || '').toLowerCase())).length;
  return possible === files.length ? 'accept' : possible ? 'mixed' : 'reject';
}

export const isCsvName = (name) => /\.csv$/i.test(String(name || ''));

/** Splits dropped files into CSV exports and everything else, by filename. */
export function splitCsvFiles(list) {
  const files = Array.from(list || []);
  const csv = files.filter((file) => isCsvName(file.name));
  return { csv, skipped: files.length - csv.length };
}

export const skippedNote = (count) =>
  count === 1 ? '1 file skipped: not a CSV export.' : `${count} files skipped: not CSV exports.`;

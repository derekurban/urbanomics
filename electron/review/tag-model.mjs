export const tagType = (entity) => entity?.flowType || "expense";
export const tagLens = (row) => (row.amountCents > 0 ? "income" : "expense");
export const taggable = (row) =>
  row.amountCents !== 0 && row.review.kind !== "transfer";
export const transactionFlow = (row) => row.review.kind === "transfer" ? "transfer" : tagLens(row);
export const tagOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
  a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id);
export const orderedTags = (values) => [...values].sort(tagOrder);
export const tagFits = (row, entity) =>
  taggable(row) && tagType(entity) === tagLens(row);
export const alphabetical = (values) =>
  [...values].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "en", {
        sensitivity: "base",
        numeric: true,
      }) || a.id.localeCompare(b.id),
  );

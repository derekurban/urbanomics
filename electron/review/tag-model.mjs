export const tagType = (entity) => entity?.flowType || "expense";
export const tagLens = (row) => (row.amountCents > 0 ? "income" : "expense");
export const taggable = (row) =>
  row.amountCents !== 0 && !["transfer", "repayment"].includes(row.review.kind);
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

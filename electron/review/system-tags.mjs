// Identities, not editable labels, define each system responsibility.
export const SYSTEM_GRAY = '#929292';
export const OTHER_INCOME = 'system:other-income';
export const OTHER_EXPENSE = 'system:other-expense';
export const TRANSFER_TAG = 'system:transfer';
export const DEDUCTION_TAG = 'system:deduction';
export const systemDefinitions = [
  {id: OTHER_EXPENSE, name: 'Other', kind: 'category', flowType: 'expense', systemRole: 'other-expense', description: 'Default expense tag. Replaced when you choose a more specific tag.'},
  {id: OTHER_INCOME, name: 'Other', kind: 'category', flowType: 'income', systemRole: 'other-income', description: 'Default income tag. Replaced when you choose a more specific tag.'},
  {id: TRANSFER_TAG, name: 'Transfer', kind: 'system', flowType: 'transfer', systemRole: 'transfer', description: 'Applied to both sides of a linked account transfer.'},
  {id: DEDUCTION_TAG, name: 'Deduction', kind: 'system', flowType: 'deduction', systemRole: 'deduction', description: 'Applied to a repayment and the expenses it reduces. Original expense tags stay intact.'},
].map(t => ({...t, color: SYSTEM_GRAY, locked: true, parentId: '', tags: [], sortOrder: -1}));
export const isOther = (id, entities=[]) => id === OTHER_INCOME || id === OTHER_EXPENSE || entities.some(t => t.id === id && t.systemRole?.startsWith("other-"));
export const otherId = (row, entities=[]) => entities.find(t => t.systemRole === (row.amountCents > 0 ? "other-income" : "other-expense"))?.id || (row.amountCents > 0 ? OTHER_INCOME : OTHER_EXPENSE);
export const needsTagging = row => row.amountCents !== 0 && row.review.kind !== 'transfer' && (row.review.templateReview ? row.review.templateReview==='pending' : row.review.allocationMode==='layers' ? row.review.tags.reduce((n,p)=>n+p.cents,0)+(row.review.kind==='repayment'?row.review.allocations.reduce((n,p)=>n+p.cents,0):0)<Math.abs(row.amountCents) : (row.tagsAutomatic || !row.review.tags.length));
export const savedTags = row => row.tagsAutomatic ? [] : row.review.tags;

// Defaults and link badges are a read projection. No import, archive or original
// decision is rewritten, and unlinking/removing an allocation restores the view.
export function systemTagRecords(records, entities) {
  const byId = new Map(entities.map(t => [t.id, t]));
  const deducted = new Set(records.filter(r => r.review.kind === 'repayment')
    .flatMap(r => r.review.allocations.filter(a => a.cents > 0).map(a => a.id)));
  return records.map(row => {
    const transfer = row.review.kind === 'transfer' && !!row.review.transferId;
    const deduction = deducted.has(row.id) || (row.review.kind === 'repayment' && row.review.allocations.some(a => a.cents > 0));
    const tagsAutomatic = !transfer && row.review.allocationMode!=='layers' && row.amountCents !== 0 && !row.review.tags.length;
    return {...row, tagsAutomatic,
      review: {...row.review, tags: tagsAutomatic ? [{id: otherId(row, entities), cents: Math.abs(row.amountCents)}] : row.review.tags},
      systemTags: [transfer && TRANSFER_TAG, deduction && DEDUCTION_TAG].filter(Boolean).map(id => byId.get(id)),
    };
  });
}

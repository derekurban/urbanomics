import { accountOverview, endOfMonth } from "./dashboard-model.js";

// A card or credit line reads its flows as charged and paid off, judged from the account's own type.
export const isCardAccount=(account)=>/\b(card|credit)\b/i.test(account?.kind||"");
// The latest month of the selected year with any activity, for a card without an exported balance.
export const latestMonth=(account)=>[...(account?.months||[])].reverse().find(m=>m.count>0)||null;
// Keep the complete ledger available to resolve counterparts outside the selected period.
export function accountsModel(records, accounts, {year,currency}) {
  const activeIds=new Set(accounts.map(a=>a.id));
  const rows=records.filter(r=>!r.deleted&&!r.manual&&activeIds.has(r.accountId)&&r.currency===currency);
  const yearly=accountOverview(records,{from:year+"-01-01",through:year+"-12-31",currency});
  const months=Array.from({length:12},(_,i)=>{
    const month=`${year}-${String(i+1).padStart(2,"0")}`;
    return {month,...accountOverview(records,{from:month+"-01",through:endOfMonth(month),currency})};
  });
  return accounts.map(account=>{
    const own=rows.filter(r=>r.accountId===account.id).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
    const overview=yearly.accounts.find(a=>a.id===account.id);
    return {...account,rows:own,balance:overview?.balance||{value:null,observations:[],ambiguous:false},
      months:months.map(m=>({month:m.month,cashIn:0,cashOut:0,...m.accounts.find(a=>a.id===account.id),count:own.filter(r=>r.date.startsWith(m.month)).length})),
      cashIn:overview?.cashIn||0,cashOut:overview?.cashOut||0,
      routes:yearly.routes.filter(r=>r.fromId===account.id||r.toId===account.id),
      snapshotMonths:[...new Set(own.map(r=>r.date.slice(0,7)))]};
  });
}

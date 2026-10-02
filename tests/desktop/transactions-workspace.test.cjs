const test=require('node:test'),assert=require('node:assert/strict');
test('ledger filters retain counterparts for boundary totals and separate currencies and snapshot amounts',async()=>{
 const {ledgerView}=await import('../../src/transactions-model.js');
 const row=(id,amount,accountId='a',review={},extra={})=>({id,description:id,date:'2026-08-01',accountId,account:accountId,currency:'CAD',amountCents:amount,review:{kind:'unreviewed',tags:[],groups:[],allocations:[],...review},...extra});
 const records=[row('pay',10000),row('out',-10100,'a',{kind:'transfer',transferId:'in',transferFeeCents:100}),row('in',10000,'b',{kind:'transfer',transferId:'out'}),row('food',-2000,'a',{tags:[{id:'t',cents:2000}],groups:['e']}),row('USD',99999,'a',{}, {currency:'USD'}),row('repay',500,'a',{kind:'repayment',allocations:[{id:'food',cents:500}]})];
 const filters={query:'',currency:'CAD',sort:'date',order:'desc'};
 let m=ledgerView(records,[],filters);assert.equal(m.moneyIn,10500);assert.equal(m.moneyOut,2100);assert.equal(m.rows.length,5);
 m=ledgerView(records,[],{...filters,account:'a',flow:'transfer'});assert.equal(m.moneyOut,100);assert.equal(m.rows.length,1);
 m=ledgerView(records,[],{...filters,event:'e',status:'deductions'});assert.equal(m.rows.length,1);assert.equal(m.rows[0].deducted,500);assert.equal(m.moneyOut,2000);
 m=ledgerView(records,[],{...filters,query:'pay',sort:'amount',order:'asc'});assert.deepEqual(m.rows.map(r=>r.row.id),['repay','pay']);
 m=ledgerView(records,[],{...filters,account:'a',query:'out'},{snapshot:true});assert.equal(m.moneyOut,10100);
});

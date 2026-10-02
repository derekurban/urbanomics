const test=require('node:test'),assert=require('node:assert/strict');
test('account summaries isolate currency and preserve transfer boundary and observed balances',async()=>{
 const {accountsModel}=await import('../../src/accounts-model.js');
 const a={id:'a',name:'Everyday'},b={id:'b',name:'Savings'},c={id:'c',name:'Empty'};
 const row=(id,accountId,date,amountCents,extra={})=>({id,accountId,account:accountId,currency:'CAD',date,amountCents,review:{kind:'unreviewed',tags:[],allocations:[],...extra.review},...Object.fromEntries(Object.entries(extra).filter(([k])=>k!=='review'))});
 const records=[row('salary','a','2026-01-01',100000),row('debit','a','2026-01-31',-10100,{review:{kind:'transfer',transferId:'credit',transferFeeCents:100}}),row('credit','b','2026-02-01',10000,{review:{kind:'transfer',transferId:'debit'},balanceCents:50000}),row('cost','a','2026-02-15',-2500),row('usd','a','2026-03-01',900000,{currency:'USD',balanceCents:900000}),row('cash','a','2026-03-01',5000,{manual:true}),row('hidden','a','2026-03-01',5000,{deleted:true}),row('b1','b','2026-03-01',100,{balanceCents:50100}),row('b2','b','2026-03-01',100,{balanceCents:50200})];
 const [aa,bb,cc]=accountsModel(records,[a,b,c],{year:'2026',currency:'CAD'});
 assert.equal(aa.cashIn,100000);assert.equal(aa.cashOut,2600);assert.equal(aa.months[0].cashOut,100);assert.equal(aa.months[1].cashOut,2500);assert.equal(aa.rows.length,3);assert.equal(aa.balance.value,null);assert.equal(aa.routes[0].pairs.length,1);
 assert.equal(bb.months[1].cashIn,0);assert.equal(bb.balance.ambiguous,true);assert.equal(bb.balance.value,null);assert.equal(bb.balance.observations.length,2);assert.equal(cc.rows.length,0);assert.equal(cc.balance.value,null);
 assert.equal(accountsModel(records,[a,b,c],{year:'2026',currency:'USD'})[0].cashIn,900000);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {attentionQueues,ellipseTargets}=require('../../src/experimental-model.js');
const settings={routes:[{from:'a',to:'b'}],maxDays:1,basisPoints:200};
const row=(id,amountCents,accountId,review={})=>({id,amountCents,accountId,currency:'CAD',date:'2026-09-15',review:{kind:'unreviewed',tags:[],allocations:[],...review}});
test('possible transfers reserve both sides; dismissed suggestions release only unreserved entries',()=>{
 const rows=[row('out',-10000,'a'),row('in1',10000,'b'),row('in2',10000,'b'),row('shop',-4235,'a'),row('pay',92342,'b')];
 let q=attentionQueues(rows,settings);
 assert.equal(q.edges.length,2);assert.ok(q.edges.every(e=>!e.unique));assert.deepEqual(q.expenses.map(r=>r.id),['shop']);assert.deepEqual(q.income.map(r=>r.id),['pay']);
 q=attentionQueues(rows,settings,['in1']);assert.deepEqual(q.income.map(r=>r.id),['in1','pay']);assert.equal(q.edges[0].unique,false,'Dismissing a suggestion cannot manufacture confidence');
 q=attentionQueues(rows,settings,['in1','in2']);assert.deepEqual(q.expenses.map(r=>r.id),['out','shop']);
});
test('linked, deleted, zero and tagged rows do not become attention chores; protected purposes cannot become transfers',()=>{
 const rows=[row('linkedIn',100,'b',{kind:'transfer',transferId:'linkedOut'}),row('linkedOut',-100,'a',{kind:'transfer',transferId:'linkedIn'}),{...row('deleted',-100,'a'),deleted:true},row('zero',0,'a'),row('tagged',-100,'a',{tags:[{id:'food',cents:100}]}),row('income',100,'b',{kind:'income'}),row('shared',-100,'a',{kind:'expense',shares:[{id:'friend',cents:50}]})];
 const q=attentionQueues(rows,settings);assert.equal(q.edges.length,0);assert.deepEqual(q.income.map(r=>r.id),['income']);assert.deepEqual(q.expenses.map(r=>r.id),['shared']);
});
test('large radial collections fit without overlapping their 76px target footprint',()=>{
 for(const width of [308,338,800])for(let count=2;count<=80;count++){
  const height=Math.max(width<500?490:560,count*45),points=ellipseTargets(count,width,height);
  assert.equal(points.length,count);
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=77,`${count} targets at ${width}, ${i}/${j}`);
 }
});

const {incomingTransferCandidates,transferPairBand,withinBand}=require('../../electron/review/transfer-model.mjs');
test('incoming picker includes both inclusive date and amount boundaries and protects ineligible rows',()=>{
 const incoming={...row('in',10000,'b'),date:'2026-03-08'};
 const out=(id,amountCents,date,extra={})=>({...row(id,amountCents,'a'),date,...extra});
 const records=[out('exact',-10000,'2026-03-08'),out('lower',-9000,'2026-03-01'),out('upper',-11000,'2026-03-15'),
 out('centBeyond',-11001,'2026-03-08'),out('early',-10000,'2026-02-28'),out('late',-10000,'2026-03-16'),
 out('sameAccount',-10000,'2026-03-08',{accountId:'b'}),out('foreign',-10000,'2026-03-08',{currency:'USD'}),
 out('deleted',-10000,'2026-03-08',{deleted:true}),out('cash',-10000,'2026-03-08',{manual:true}),
 out('protected',-10000,'2026-03-08',{review:{kind:'transfer',transferId:'other'}})];
 assert.deepEqual(incomingTransferCandidates(incoming,records,0,0).map(t=>t.id),['exact']);
 assert.deepEqual(incomingTransferCandidates(incoming,records,7,1000).map(t=>t.id),['exact','lower','upper']);
 assert.deepEqual(incomingTransferCandidates(incoming,records,6,1000).map(t=>t.id),['exact']);
 assert.deepEqual(incomingTransferCandidates(incoming,records,7,999).map(t=>t.id),['exact']);
 assert.deepEqual(incomingTransferCandidates(incoming,records,8,1000),[]);
 for(const outgoing of incomingTransferCandidates(incoming,records,7,1000))assert.ok(withinBand(outgoing.amountCents,incoming.amountCents,transferPairBand(outgoing,incoming)));
});

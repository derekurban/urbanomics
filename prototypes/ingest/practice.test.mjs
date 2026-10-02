import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Practice,receipts} from './practice.mjs';
const ids=(p,flow)=>receipts.map((_,id)=>id).filter(id=>p.matches(id,{flow,account:'all',search:''}));
test('transfer decisions reserve pending pairs, exclude linked pairs, release dismissed records and undo',()=>{
  const p=new Practice();assert.deepEqual(ids(p,'transfers'),[60,62,64]);
  assert.equal(ids(p,'income').length,28);assert.equal(ids(p,'expenses').length,32);
  assert.throws(()=>p.save({id:62,type:'link',target:63}),/difference/);assert.equal(p.history.length,0);
  p.save({id:60,type:'link',target:61});assert.ok(!ids(p,'income').includes(60)&&!ids(p,'expenses').includes(61));
  assert.throws(()=>p.save({id:60,type:'link',target:61}),/resolved/);
  p.save({id:62,type:'link',target:63,acknowledged:true});
  p.save({id:64,type:'dismiss'});assert.ok(ids(p,'income').includes(64));assert.ok(ids(p,'expenses').includes(65)&&ids(p,'expenses').includes(66));
  p.undo();assert.deepEqual(ids(p,'transfers'),[64]);assert.ok(!ids(p,'income').includes(64));
});
test('only the chosen ambiguous counterpart is linked',()=>{
  const p=new Practice();p.save({id:64,type:'link',target:65});assert.ok(ids(p,'expenses').includes(66));assert.ok(!ids(p,'expenses').includes(65));
});
test('tag portions conserve cents, obey direction, preserve pending transfer protection and undo cleanly',()=>{
  const p=new Practice();
  assert.throws(()=>p.save({id:60,type:'tag',parts:[{tag:'Interest',cents:50000}]}),/no longer/);
  assert.throws(()=>p.save({id:12,type:'tag',parts:[{tag:'Paycheck',cents:8640}]}),/Allocate/);
  assert.throws(()=>p.save({id:12,type:'tag',parts:[{tag:'Groceries',cents:8639}]}),/Allocate/);
  assert.equal(p.history.length,0);
  p.save({id:12,type:'tag',parts:[{tag:'Groceries',cents:4320},{tag:'Restaurants',cents:4320}]});
  assert.ok(!ids(p,'expenses').includes(12));assert.equal(p.tags.get(12).reduce((n,v)=>n+v.cents,0),8640);
  p.undo();assert.ok(ids(p,'expenses').includes(12));
  p.save({id:0,type:'tag',parts:[{tag:'Paycheck',cents:284000}]});assert.equal(ids(p,'income').length,27);
  p.reset();assert.equal(ids(p,'income').length,28);assert.equal(p.history.length,0);
});

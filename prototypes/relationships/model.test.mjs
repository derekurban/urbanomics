import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,get,connect,allocate,assignIncome,share,transfer,unlink,stats,capacity,addBatch,batchApply,tagAmount,sum,ready} from './model.mjs';
test('mixed receipt, partial repayment, payable settlement and transfer preserve independent balances',()=>{
 const s=seed();transfer(s,'arrival','departure');
 allocate(s,'alex','cabin',20000);allocate(s,'alex','dinner',6000);allocate(s,'alex','market',1000);assignIncome(s,'alex','Gift');
 allocate(s,'maya','cabin',15000);allocate(s,'maya','dinner',5000);connect(s,'settle','tickets');assignIncome(s,'salary','Salary');
 tagAmount(s,'market','Groceries',8000);tagAmount(s,'market','Home',4000);
 assert.deepEqual(stats(s),{paid:90000,back:47000,owed:9000,payable:0,fees:200,income:280500,fronted:43000,unresolved:0});
 assert.equal(sum(get(s,'market').tags),12000);assert.equal(get(s,'tickets').amount,9000);assert.equal(get(s,'cabin').amount,-60000);
 const before=stats(s);get(s,'cabin').event='Household';assert.deepEqual(stats(s),before,'event changes never modify allocations');
 assert.equal(ready(s,get(s,'alex')),true);
});
test('over-allocation, paid share changes and double matching are blocked',()=>{
 const s=seed();connect(s,'alex','cabin');assert.equal(capacity(s,get(s,'alex'),get(s,'cabin')),20000);
 assert.throws(()=>allocate(s,'alex','cabin',20001),/agreed share/);
 allocate(s,'alex','dinner',6000);assert.throws(()=>allocate(s,'alex','market',1501),/available/);
 assert.throws(()=>share(s,'cabin','Alex',19999),/repayment/);
 transfer(s,'arrival','departure');assert.throws(()=>transfer(s,'arrival','departure'),/existing/);
 unlink(s,'arrival');assert.equal(s.links.length,0);assert.equal(get(s,'departure').done,false);
});
test('batch acts on selected suggestions only and preserves exact amounts',()=>{const s=addBatch(seed());const ids=s.rows.filter(r=>r.id.startsWith('routine')).slice(0,119).map(r=>r.id);batchApply(s,ids);assert.equal(s.rows.filter(r=>r.done).length,119);for(const r of s.rows.filter(r=>r.done))assert.equal(sum(r.tags),-r.amount);assert.equal(get(s,'routine-119').done,false);});

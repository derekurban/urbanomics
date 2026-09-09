const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../prototypes/review-flow.html'), 'utf8');
const modelSource = source.split('// MODEL START')[1].split('// MODEL END')[0];
const Model = vm.runInNewContext(modelSource + '\nModel;');
const normalized = x => JSON.parse(JSON.stringify(x));

test('equal splits preserve odd cents and all participants', () => {
  assert.deepEqual(normalized(Model.equal(10001, ['me', 'alex', 'sam'])), { me:3334, alex:3334, sam:3333 });
});
test('moving any slider conserves total and nonnegative integer shares', () => {
  for (const total of [1, 12000, 10001]) {
    for (const id of ['me','alex','sam']) {
      for (const value of [0, 1, Math.floor(total/2), total]) {
        const shares = Model.move(total, Model.equal(total,['me','alex','sam']), id, value);
        assert.equal(shares[id], value);
        assert.equal(Object.values(shares).reduce((a,b)=>a+b,0), total);
        assert.ok(Object.values(shares).every(v=>Number.isInteger(v)&&v>=0));
      }
    }
  }
});
test('group repayment applies across expenses without exceeding the sender shares', () => {
  const expenses = [{id:'dinner',total:12000,shares:{me:6000,alex:6000}}, {id:'cabin',total:36000,shares:{me:12000,alex:12000,sam:12000}}];
  const allocations = Model.allocate(18000, expenses, 'alex', [], 'p1');
  assert.deepEqual(normalized(allocations), {dinner:6000,cabin:12000});
  const p = {id:'p1',amount:18000,person:'alex',kind:'repayment',allocations};
  assert.equal(Model.settle(p,expenses,[]), 0);
  assert.equal(Model.owed(expenses[0],'alex',[p]), 0);
  assert.equal(Model.owed(expenses[1],'sam',[p]), 12000);
  assert.equal(expenses[0].shares.me, 6000);
});
test('partial allocation keeps the unassigned remainder visible', () => {
  const e={id:'dinner',total:12000,shares:{me:6000,alex:6000}};
  const p={id:'p1',amount:18000,person:'alex',kind:'repayment',allocations:{dinner:6000}};
  assert.equal(Model.settle(p,[e],[]),12000);
});
test('editing the same repayment does not count its previous allocation twice', () => {
  const e={id:'dinner',total:12000,shares:{me:6000,alex:6000}};
  const p={id:'p1',amount:3000,person:'alex',kind:'repayment',allocations:{dinner:3000}};
  assert.equal(Model.settle(p,[e],[p]),0);
  assert.equal(Model.owed(e,'alex',[p]),3000);
  assert.equal(Model.owed(e,'alex',[p],'p1'),6000);
});
test('reject overpayment, excessive total allocation, and paid-share reduction', () => {
  const e={id:'dinner',total:12000,shares:{me:6000,alex:6000}};
  const p={id:'p1',amount:3000,person:'alex',kind:'repayment',allocations:{dinner:3000}};
  assert.throws(()=>Model.settle({...p,allocations:{dinner:7000}},[e],[]));
  assert.throws(()=>Model.settle({...p,allocations:{dinner:4000}},[e],[]));
  assert.throws(()=>Model.validateSplit({...e,shares:{me:10000,alex:2000}},[p]));
});
test('an income classification restores the amount owed without changing expense shares', () => {
  const e={id:'dinner',total:12000,shares:{me:6000,alex:6000}};
  const p={id:'p1',amount:3000,person:'alex',kind:'income',allocations:{}};
  assert.equal(Model.owed(e,'alex',[p]),6000);
  assert.equal(e.shares.me,6000);
});
test('currency entry rejects fractional cents, negative and nonnumeric amounts', () => {
  assert.equal(Model.cents('12.34'),1234);
  for (const text of ['12.345','-1','abc','','Infinity']) assert.ok(Number.isNaN(Model.cents(text)));
});

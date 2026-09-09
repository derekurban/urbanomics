const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../prototypes/inbox-flow.html'),'utf8');
const Model=vm.runInNewContext(source.split('// MODEL START')[1].split('// MODEL END')[0]+'\nModel;');
const plain=x=>JSON.parse(JSON.stringify(x));
test('moving Alex/Sam divider preserves a $200 personal share',()=>{
 let shares={me:12000,alex:12000,sam:12000};
 shares=Model.divider(36000,shares,0,20000);
 assert.deepEqual(plain(shares),{me:20000,alex:4000,sam:12000});
 shares=Model.divider(36000,shares,1,28000);
 assert.deepEqual(plain(shares),{me:20000,alex:8000,sam:8000});
});
test('divider movement affects only adjacent people and cannot cross its neighbours',()=>{
 for(const value of [0,1,15000,35000,50000]){
  const before={me:10000,alex:8000,sam:6000,jordan:12000};
  const after=Model.divider(36000,before,1,value);
  assert.equal(after.me,before.me);assert.equal(after.jordan,before.jordan);
  assert.equal(Object.values(after).reduce((a,b)=>a+b,0),36000);
  assert.ok(Object.values(after).every(n=>Number.isInteger(n)&&n>=0));
 }
});
test('equal split with odd cents still totals the expense',()=>{
 const s=Model.equal(10001,['me','alex','sam']);
 assert.deepEqual(plain(s),{me:3334,alex:3334,sam:3333});
});
test('completed payments clear from the inbox; partial payments remain',()=>{
 const p={amount:18000,kind:'repayment',allocations:{dinner:6000}};
 assert.equal(Model.pending(p),true);
 assert.equal(Model.pending({...p,allocations:{dinner:6000,cabin:12000}}),false);
 assert.equal(Model.pending({amount:3000,kind:'income',allocations:{}}),false);
 assert.equal(Model.pending({amount:3000,kind:'',allocations:{}}),true);
});
test('group moves preserve uniqueness and leave the input state unchanged',()=>{
 const before=[{id:'trip',expenses:['dinner']},{id:'home',expenses:[]}];
 const after=Model.assign(before,'dinner','home');
 assert.deepEqual(plain(after),[{id:'trip',expenses:[]},{id:'home',expenses:['dinner']}]);
 assert.deepEqual(before[0].expenses,['dinner']);
 assert.deepEqual(plain(Model.assign(after,'dinner','home')),plain(after));
 assert.equal(Model.assign(after,'dinner','').flatMap(g=>g.expenses).length,0);
});
test('a reference-backed own-account pair must also match amount and currency',()=>{
 const a={account:'checking',reference:'SAMPLE-1',amount:-50000,currency:'CAD'};
 const b={account:'savings',reference:'SAMPLE-1',amount:50000,currency:'CAD'};
 assert.equal(Model.transfer(a,b),true);
 for(const patch of [{reference:''},{reference:'DIFFERENT'},{amount:49999},{currency:'USD'},{account:'checking'}])assert.equal(Model.transfer(a,{...b,...patch}),false);
});
test('group repayment respects shares and does not change personal spending',()=>{
 const expenses=[{id:'dinner',total:12000,shares:{me:6000,alex:6000}},{id:'cabin',total:36000,shares:{me:12000,alex:12000,sam:12000}}];
 const p={id:'p',kind:'repayment',person:'alex',amount:18000,allocations:Model.allocate(18000,expenses,'alex',[],'p')};
 assert.deepEqual(plain(p.allocations),{dinner:6000,cabin:12000});
 assert.equal(Model.settle(p,expenses,[]),0);
 assert.equal(Model.owed(expenses[1],'alex',[p]),0);
 assert.equal(expenses[1].shares.me,12000);
 assert.equal(Model.owed(expenses[1],'sam',[p]),12000);
});
test('reject overallocations and splits below an existing repayment',()=>{
 const e={id:'dinner',total:12000,shares:{me:6000,alex:6000}};
 const p={id:'p',kind:'repayment',person:'alex',amount:3000,allocations:{dinner:3000}};
 assert.throws(()=>Model.settle({...p,allocations:{dinner:4000}},[e],[]));
 assert.throws(()=>Model.validateSplit({...e,shares:{me:10000,alex:2000}},[p]));
});

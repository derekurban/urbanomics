const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../prototypes/staged-flow.html'),'utf8');
const Model=vm.runInNewContext(html.split('// MODEL START')[1].split('// MODEL END')[0]+'\nModel;');
const plain=x=>JSON.parse(JSON.stringify(x));
test('group and standalone selections expand to unique expense leaves, excluding incoming payments',()=>{
 const groups=[{id:'trip',members:['dinner','cabin','payment']},{id:'weekend',members:['cabin','transit']}];
 const expenses=['dinner','cabin','transit'].map(id=>({id}));
 assert.deepEqual(plain(Model.expand(['g:trip','e:dinner','g:weekend'],groups,expenses)),['dinner','cabin','transit']);
});
test('equal allocation is capped and excess becomes transfer income',()=>{
 assert.deepEqual(plain(Model.distribute(18000,{dinner:12000,cabin:36000})),{dinner:9000,cabin:9000,income:0});
 assert.deepEqual(plain(Model.distribute(18000,{dinner:6000,cabin:4000})),{dinner:6000,cabin:4000,income:8000});
 assert.deepEqual(plain(Model.distribute(18000,{})),{income:18000});
});
test('dollar snapping preserves cents in the total and cent mode is exact',()=>{
 const original={dinner:10000,cabin:8000,income:45};
 const dollars=Model.divider(original,0,10257,100);
 assert.deepEqual(plain(dollars),{dinner:10300,cabin:7700,income:45});
 const cents=Model.divider(original,0,10257,1);
 assert.deepEqual(plain(cents),{dinner:10257,cabin:7743,income:45});
 assert.equal(Object.values(dollars).reduce((a,b)=>a+b,0),18045);
 assert.equal(original.dinner,10000);
});
test('adjacent dividers preserve unrelated shares and cannot exceed expense caps',()=>{
 const original={me:20000,alex:8000,sam:8000};
 assert.equal(Model.divider(original,1,31000,100).me,20000);
 const result=Model.divider({dinner:9000,cabin:9000,income:0},0,17000,100,{dinner:12000,cabin:36000,income:18000});
 assert.deepEqual(plain(result),{dinner:12000,cabin:6000,income:0});
});
test('saving repayment does not mutate or review expenses, and retains mixed income',()=>{
 const expenses=[{id:'dinner',total:12000,shares:null,balanced:false,category:'Food',group:'trip'}];
 const before=JSON.stringify(expenses);
 const payment={id:'p1',amount:18000,balanced:false,allocations:{},income:0};
 const draft={person:'alex',kind:'repayment',targets:['e:dinner'],values:{dinner:6000,income:12000}};
 const saved=Model.savePayment(payment,draft,expenses,[]);
 assert.equal(JSON.stringify(expenses),before);
 assert.equal(saved.balanced,true);assert.equal(saved.income,12000);
 assert.deepEqual(plain(saved.allocations),{dinner:6000});
 assert.equal(payment.balanced,false);
});
test('remaining expense belongs to user when no agreed split is set',()=>{
 const e={id:'dinner',total:12000,shares:null};
 const p={id:'p1',person:'alex',balanced:true,allocations:{dinner:5000}};
 assert.equal(Model.personal(e,[p]),7000);
 assert.equal(Model.personal({...e,shares:{me:6000,alex:6000}},[p]),6000);
});
test('category and group assignment are independent for incoming and outgoing items',()=>{
 const items=[{id:'dinner',category:'Food',balanced:false},{id:'payment',category:'Other incoming',balanced:false}];
 const groups=Model.groupRows([{id:'trip',members:[]}],['dinner','payment'],'trip');
 const recategorized=Model.assignCategory(items,['payment'],'Travel');
 assert.deepEqual(plain(groups[0].members),['dinner','payment']);
 assert.equal(recategorized[1].category,'Travel');
 assert.equal(recategorized[1].balanced,false);
 assert.equal(items[1].category,'Other incoming');
});
test('existing repayments reduce capacity and editing one excludes itself',()=>{
 const e={id:'dinner',total:12000,shares:null};
 const p={id:'p1',person:'alex',balanced:true,allocations:{dinner:5000}};
 assert.equal(Model.capacity(e,[p],'p2','sam'),7000);
 assert.equal(Model.capacity(e,[p],'p1','alex'),12000);
 assert.throws(()=>Model.savePayment({id:'p2',amount:8000},{person:'sam',kind:'repayment',targets:['e:dinner'],values:{dinner:8000,income:0}},[e],[p]));
});
test('agreed shares cap repayments by person and cannot fall below received money',()=>{
 const e={id:'dinner',total:12000,shares:{me:6000,alex:6000}};
 const p={id:'p1',person:'alex',balanced:true,allocations:{dinner:5000}};
 assert.equal(Model.capacity(e,[p],'p2','alex'),1000);
 assert.equal(Model.capacity(e,[p],'p2','sam'),0);
 assert.throws(()=>Model.validateShares({...e,shares:{me:8000,alex:4000}},[p]));
});
test('partial-cent, negative and nonconserving input cannot be saved',()=>{
 for(const value of ['12.345','-1','','NaN'])assert.ok(Number.isNaN(Model.cents(value)));
 const e={id:'dinner',total:12000,shares:null};
 const p={id:'p',amount:18000};
 assert.throws(()=>Model.savePayment(p,{person:'alex',kind:'repayment',targets:['e:dinner'],values:{dinner:5000,income:12000}},[e],[]));
});

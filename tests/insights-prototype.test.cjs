const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../prototypes/insights-flow.html'),'utf8');
const Model=vm.runInNewContext(html.split('// MODEL START')[1].split('// MODEL END')[0]+'\nModel;');
const plain=x=>JSON.parse(JSON.stringify(x));
const tags=[{id:'groceries',name:'Groceries'},{id:'furniture',name:'Furniture'},{id:'household',name:'Household'},{id:'dining',name:'Dining out'}];
const walmart=()=>({id:'market',name:'Walmart',total:24000,balanced:false,tags:{}});

test('fragment stays self-contained: unique root, no document scaffolding, no network or storage',()=>{
 assert.ok(html.startsWith('<div id="urbanomics-insights"'));
 assert.ok(!/<(!doctype|html|head|body|link|script src)[\s>]/i.test(html),'document scaffolding or external resources must not appear');
 for(const banned of ['fetch(','XMLHttpRequest','localStorage','sessionStorage','indexedDB','import(','http://','https://'])assert.ok(!html.includes(banned),banned+' must not appear');
 const css=html.split('<style>')[1].split('</style>')[0];
 for(const rule of css.split('}').map(s=>s.trim()).filter(Boolean)){const selector=rule.split('{')[0].trim();if(selector.startsWith('@media')||!selector)continue;for(const part of selector.split(','))assert.ok(part.trim().startsWith('#urbanomics-insights'),'unscoped selector: '+part);}
 const script=html.split('<script>')[1].split('</script>')[0];
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.ok(script.includes('if(globalThis.Tweak)'));
});

test('Walmart defaults to an equal split and the divider can make it $140/$100 while preserving $240',()=>{
 const r=walmart();
 const start=Model.retag(r.tags,r.total,['groceries','furniture']);
 assert.deepEqual(plain(start.tags),{groceries:12000,furniture:12000});
 assert.equal(start.kept,false);
 const adjusted=Model.divider(start.tags,0,14000,100);
 const saved=Model.setTags(r,adjusted);
 assert.deepEqual(plain(saved.tags),{groceries:14000,furniture:10000});
 assert.equal(Model.sum(saved.tags),24000);
 assert.equal(saved.balanced,false);
 assert.deepEqual(r.tags,{});
});

test('equal splits assign rounding remainders deterministically and one tag takes the full amount',()=>{
 assert.deepEqual(plain(Model.equal(10000,['a','b','c'])),{a:3334,b:3333,c:3333});
 assert.deepEqual(plain(Model.equal(24001,['a','b'])),{a:12001,b:12000});
 assert.deepEqual(plain(Model.equal(500,['only'])),{only:500});
 assert.deepEqual(plain(Model.equal(500,[])),{});
 assert.ok(Model.isEqualSplit({a:3333,b:3334,c:3333},10000));
 assert.ok(!Model.isEqualSplit({a:14000,b:10000},24000));
});

test('adding or removing a tag keeps a manual split reviewable instead of silently resetting it',()=>{
 const manual={groceries:14000,furniture:10000};
 const added=Model.retag(manual,24000,['groceries','furniture','household']);
 assert.equal(added.kept,true);
 assert.deepEqual(plain(added.added),['household']);
 assert.deepEqual(plain(added.tags),{groceries:14000,furniture:10000,household:0});
 const removed=Model.retag(manual,24000,['groceries']);
 assert.equal(removed.kept,true);
 assert.deepEqual(plain(removed.removed),['furniture']);
 assert.deepEqual(plain(removed.tags),{groceries:24000});
 const swapped=Model.retag({groceries:14000,furniture:10000,household:0},24000,['groceries','household','dining']);
 assert.deepEqual(plain(swapped.tags),{groceries:14000,household:0,dining:10000});
 assert.equal(Model.sum(swapped.tags),24000);
 const even=Model.retag({groceries:12000,furniture:12000},24000,['groceries','furniture','household']);
 assert.equal(even.kept,false);
 assert.deepEqual(plain(even.tags),{groceries:8000,furniture:8000,household:8000});
 assert.deepEqual(plain(Model.retag(manual,24000,[])),{tags:{},kept:false,added:[],removed:['groceries','furniture']});
});

test('Food shows only the grocery portion and Home shows only the furniture portion',()=>{
 const rows=[Model.setTags(walmart(),{groceries:14000,furniture:10000}),{id:'dinner',name:'Dinner',total:12000,tags:{dining:12000}}];
 const food=Model.flows(rows,['groceries','dining']),home=Model.flows(rows,['furniture']);
 assert.equal(food.out,26000);assert.equal(food.count,2);
 assert.deepEqual(plain(food.byTag.groceries),{out:14000,in:0,moved:0,count:1});
 assert.equal(home.out,10000);assert.equal(home.count,1);
 const walmartInFood=Model.viewRows(rows,['groceries','dining']).find(x=>x.id==='market');
 assert.equal(walmartInFood.inView,14000);assert.equal(walmartInFood.total,24000);
 assert.deepEqual(plain(walmartInFood.portions),{groceries:14000});
 assert.equal(Model.viewRows(rows,['groceries','furniture']).filter(x=>x.id==='market').length,1);
});

test('adding Groceries to Essentials leaves Food unchanged and the overlap is counted once when combined',()=>{
 const rows=[Model.setTags(walmart(),{groceries:14000,furniture:10000}),{id:'transit',total:3200,tags:{transport:3200}}];
 let views=[{id:'food',name:'Food',tags:['groceries','dining']},{id:'essentials',name:'Essentials',tags:['household','transport']}];
 const foodBefore=plain(Model.flows(rows,views[0].tags)),rowsBefore=JSON.stringify(rows);
 views=Model.toggleViewTag(views,'essentials','groceries');
 assert.deepEqual(plain(views[1].tags),['household','transport','groceries']);
 assert.deepEqual(plain(Model.flows(rows,views[0].tags)),foodBefore);
 assert.equal(JSON.stringify(rows),rowsBefore);
 assert.equal(Model.flows(rows,views[1].tags).out,17200);
 const combined=Model.combine(rows,views);
 assert.equal(combined.out,17200);
 assert.deepEqual(plain(combined.overlap),['groceries']);
 assert.equal(Model.flows(rows,['groceries','furniture','transport']).out,27200);
 assert.equal(Model.flows(rows,['groceries','furniture']).out,24000);
 views=Model.toggleViewTag(views,'essentials','groceries');
 assert.deepEqual(plain(views[1].tags),['household','transport']);
});

test('renaming or deleting a view never touches transactions, tags, events, or repayments',()=>{
 const rows=[Model.setTags(walmart(),{groceries:14000,furniture:10000}),{id:'p1',amount:18000,kind:'repayment',balanced:true,person:'alex',allocations:{market:9000},income:9000,tags:{groceries:18000}}];
 const groups=[{id:'trip',members:['market','p1']}];
 const before=JSON.stringify({rows,groups,tags});
 let views=Model.addView([{id:'food',name:'Food',tags:['groceries']}],'Essentials',['groceries','household']);
 views=Model.renameView(views,'food','Eating');
 assert.equal(views[0].name,'Eating');
 views=Model.removeView(views,'food');
 assert.deepEqual(plain(views.map(v=>v.id)),['view-essentials']);
 assert.throws(()=>Model.addView(views,'essentials'));
 assert.throws(()=>Model.addView(views,'  '));
 assert.equal(JSON.stringify({rows,groups,tags}),before);
});

test('tags are reusable and independently manageable; removal is blocked while in use',()=>{
 let list=Model.addTag(tags,'Pets');
 assert.equal(list.at(-1).id,'tag-pets');
 assert.throws(()=>Model.addTag(list,'pets'));
 list=Model.addTag(list,'tag pets');
 assert.equal(list.at(-1).id,'tag-tag-pets');
 list=Model.renameTag(list,'tag-pets','Animals');
 assert.equal(list.find(t=>t.id==='tag-pets').name,'Animals');
 assert.throws(()=>Model.renameTag(list,'tag-pets','Groceries'));
 const rows=[Model.setTags(walmart(),{groceries:24000})];
 const views=[{id:'food',name:'Food',tags:['groceries','tag-pets']}];
 assert.throws(()=>Model.removeTag(list,views,rows,'groceries'));
 const out=Model.removeTag(list,views,rows,'tag-pets');
 assert.ok(!out.tags.some(t=>t.id==='tag-pets'));
 assert.deepEqual(plain(out.views[0].tags),['groceries']);
 assert.equal(views[0].tags.length,2);
 assert.equal(Model.tagUsage(rows,'groceries'),1);
});

test('multiple tags on money in never turn a repayment or internal transfer into earned income',()=>{
 const repayment={id:'a1',amount:18000,kind:'repayment',balanced:true,person:'alex',allocations:{dinner:6000,cabin:9000},income:3000,tags:{friends:9000,dining:9000}};
 const unreviewed={id:'a2',amount:3000,kind:'repayment',balanced:false,allocations:{},income:0,tags:{friends:1500,dining:1500}};
 const salary={id:'s',amount:300000,kind:'income',balanced:true,allocations:{},income:300000,tags:{salary:200000,friends:100000}};
 const transfer={id:'m',amount:50000,kind:'transfer',tags:{savings:25000,friends:25000}};
 assert.equal(Model.purpose(repayment).code,'mixed');assert.equal(Model.purpose(repayment).earned,false);
 assert.equal(Model.purpose(unreviewed).code,'unreviewed');
 assert.equal(Model.purpose(salary).earned,true);
 assert.equal(Model.purpose(transfer).code,'transfer');
 assert.equal(Model.purpose({...repayment,allocations:{},income:18000}).code,'unassigned');
 assert.equal(Model.purpose({...repayment,income:0}).code,'repayment');
 const f=Model.flows([repayment,unreviewed,salary,transfer],['friends','dining','savings','salary']);
 assert.equal(f.earned,300000);
 assert.equal(f.repaid,0);assert.equal(f.mixed,18000);assert.equal(f.unreviewed,3000);assert.equal(f.unassigned,0);
 assert.equal(f.in,321000);assert.equal(f.moved,50000);assert.equal(f.out,0);
 assert.equal(f.in,f.earned+f.repaid+f.mixed+f.unassigned+f.unreviewed);
 assert.equal(Model.direction(transfer),'moved');assert.equal(Model.direction(repayment),'in');assert.equal(Model.direction({total:1}),'out');
});

test('event selection expands to unique expense leaves and incoming members are never targets',()=>{
 const groups=[{id:'trip',members:['dinner','cabin','payment']},{id:'weekend',members:['cabin','transit']}];
 const expenses=['dinner','cabin','transit'].map(id=>({id}));
 assert.deepEqual(plain(Model.expand(['g:trip','e:dinner','g:weekend'],groups,expenses)),['dinner','cabin','transit']);
 let selected=Model.toggleTargets([],'g:trip',groups,expenses);
 assert.deepEqual(plain(selected),['e:dinner','e:cabin']);
 selected=Model.toggleTargets(selected,'e:dinner',groups,expenses);
 assert.equal(Model.targetState(selected,'g:trip',groups,expenses).checked,'mixed');
 selected=Model.toggleTargets(selected,'g:trip',groups,expenses);
 assert.equal(Model.targetState(selected,'g:trip',groups,expenses).checked,'true');
 assert.equal(selected.length,2);
 assert.deepEqual(plain(Model.toggleTargets(selected,'g:trip',groups,expenses)),[]);
});

test('allocation caps, cent conservation, and unassigned e-transfer income still hold',()=>{
 assert.deepEqual(plain(Model.distribute(18000,{dinner:12000,cabin:36000})),{dinner:9000,cabin:9000,income:0});
 assert.deepEqual(plain(Model.distribute(18000,{dinner:6000,cabin:4000})),{dinner:6000,cabin:4000,income:8000});
 const original={dinner:10000,cabin:8000,income:45};
 assert.deepEqual(plain(Model.divider(original,0,10257,100)),{dinner:10300,cabin:7700,income:45});
 assert.deepEqual(plain(Model.divider(original,0,10257,1)),{dinner:10257,cabin:7743,income:45});
 assert.equal(Model.divider({me:20000,alex:8000,sam:8000},1,31000,100).me,20000);
 assert.deepEqual(plain(Model.divider({dinner:9000,cabin:9000,income:0},0,17000,100,{dinner:12000,cabin:36000,income:18000})),{dinner:12000,cabin:6000,income:0});
 for(const value of ['12.345','-1','','NaN'])assert.ok(Number.isNaN(Model.cents(value)));
 assert.equal(Model.cents('140.05'),14005);
});

test('saving a repayment leaves expense review flags and tags unchanged and capacity respects shares',()=>{
 const expenses=[{id:'dinner',total:12000,shares:null,balanced:false,tags:{dining:12000}}];
 const before=JSON.stringify(expenses);
 const payment={id:'p1',amount:18000,balanced:false,allocations:{},income:0,tags:{friends:18000}};
 const saved=Model.savePayment(payment,{person:'alex',kind:'repayment',targets:['e:dinner'],values:{dinner:6000,income:12000}},expenses,[]);
 assert.equal(JSON.stringify(expenses),before);
 assert.equal(saved.balanced,true);assert.equal(saved.income,12000);
 assert.deepEqual(plain(saved.allocations),{dinner:6000});
 assert.deepEqual(plain(saved.tags),{friends:18000});
 assert.equal(payment.balanced,false);
 const e={id:'dinner',total:12000,shares:{me:6000,alex:6000}};
 const p={id:'p1',person:'alex',balanced:true,allocations:{dinner:5000}};
 assert.equal(Model.capacity(e,[p],'p2','alex'),1000);
 assert.equal(Model.capacity(e,[p],'p2','sam'),0);
 assert.equal(Model.capacity({...e,shares:null},[p],'p2','sam'),7000);
 assert.throws(()=>Model.validateShares({...e,shares:{me:8000,alex:4000}},[p]));
 assert.throws(()=>Model.savePayment({id:'p2',amount:8000},{person:'sam',kind:'repayment',targets:['e:dinner'],values:{dinner:8000,income:0}},[{...e,shares:null}],[p]));
 assert.equal(Model.personal({...e,shares:null},[p]),7000);
 assert.equal(Model.personal(e,[p]),6000);
});

test('moving one tagged portion keeps other tags and cents; grouping never alters tags',()=>{
 const r={total:24001,tags:{groceries:14000,furniture:10001}};
 const moved=Model.moveTag(r,'furniture','household');
 assert.deepEqual(plain(moved.tags),{groceries:14000,household:10001});
 assert.deepEqual(plain(Model.moveTag(moved,'household','groceries').tags),{groceries:24001});
 assert.deepEqual(plain(Model.moveTag({amount:500,tags:{}},'','savings').tags),{savings:500});
 assert.deepEqual(r.tags,{groceries:14000,furniture:10001});
 const rows=[{id:'out',total:10000,tags:{a:6000,b:4000}},{id:'in',amount:2000,kind:'income',balanced:true,income:2000,allocations:{},tags:{a:2000}}];
 const before=JSON.stringify(rows);
 assert.deepEqual(plain(Model.groupRows([{id:'g',members:[]}],['out','in'],'g')[0].members),['out','in']);
 assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(plain(Model.untagged([{tags:{}},{tags:{a:1}},{}]).length),2);
});

test('invalid tag sums, negative amounts and partial cents cannot be saved',()=>{
 const r={total:10000};for(const values of [{a:9999},{a:-1,b:10001},{a:9999.5,b:.5},{}])assert.throws(()=>Model.setTags(r,values));
 assert.deepEqual(plain(Model.setTags({amount:10000},{a:10000}).tags),{a:10000});
});

// Headless walk through the real UI script with a minimal DOM stub. Rendered HTML is inspected as text.
function boot(){
 const script=html.split('<script>')[1].split('</script>')[0];
 const handlers={},inputs={};let last='';
 const el=sel=>({textContent:'',value:inputs[sel]||'',focus(){},setSelectionRange(){},scrollIntoView(){},remove(){},requestSubmit(){},disabled:false,style:{},setAttribute(){},removeAttribute(){},innerHTML:''});
 const main={set innerHTML(v){last=v;},get innerHTML(){return last;},querySelector:el,querySelectorAll:()=>[]};
 const root={querySelector:sel=>sel==='main'?main:el(sel),querySelectorAll:()=>[],addEventListener(type,fn){handlers[type]=fn;}};
 vm.runInNewContext(script,{document:{getElementById:()=>root,activeElement:null},performance:{now:()=>0}});
 return {html:()=>last,inputs,
  click:props=>handlers.click({target:{closest:()=>({disabled:false,id:'',dataset:{},...props})}}),
  submit:(id,dataset={},elements={})=>handlers.submit({preventDefault(){},target:{id,dataset,elements}}),
  change:props=>handlers.change({target:props})};
}
const clean=h=>{assert.ok(!/undefined|NaN|\[object/.test(h),'rendered output must not leak undefined/NaN');return h;};

test('the UI renders every stage and the Walmart split flows from Organize into Insights',()=>{
 const ui=boot();
 assert.ok(clean(ui.html()).includes('Bring in your month'));
 ui.click({id:'import'});
 let h=clean(ui.html());
 assert.ok(h.includes('Needs tags')&&h.includes('Walmart')&&h.includes('Dinner at Juniper'));
 assert.ok(h.includes('data-drop="groceries"')&&h.includes('Internal transfer'));
 ui.click({dataset:{editTags:'market'}});
 ui.click({dataset:{toggleTag:'groceries'}});
 ui.click({dataset:{toggleTag:'furniture'}});
 h=clean(ui.html());
 assert.ok(h.includes('data-divider="0"')&&h.includes('Split evenly'));
 assert.ok(h.includes('data-amount="groceries">$120.00')&&h.includes('data-amount="furniture">$120.00'));
 ui.click({id:'save-tags'});
 h=clean(ui.html());
 assert.equal((h.match(/Part of \$240\.00/g)||[]).length,2,'both portions appear on the tag board');
 assert.ok(!h.includes('Split across tags'));
 ui.click({dataset:{stage:'2'}});assert.ok(clean(ui.html()).includes('Mountain weekend'));
 ui.click({dataset:{stage:'3'}});h=clean(ui.html());assert.ok(h.includes('Deduct')&&h.includes('Needs attention'));
 ui.click({dataset:{stage:'4'}});h=clean(ui.html());
 assert.ok(h.includes('Gross tagged flows')&&h.includes('Walmart')&&h.includes('of $240.00'));
 assert.ok(h.includes('Net personal cost by tag is not calculated'));
 ui.click({dataset:{openView:'essentials'}});ui.click({dataset:{viewTag:'groceries'}});
 ui.change({dataset:{compare:'food'},checked:true});ui.change({dataset:{compare:'essentials'},checked:true});
 h=clean(ui.html());
 assert.ok(h.includes('Combined: Food + Essentials')&&h.includes('Groceries appears in more than one selected view and is counted once.'));
 ui.click({id:'delete-view'});assert.ok(clean(ui.html()).includes('Delete the Essentials view?'));
 ui.click({id:'confirm-delete'});h=clean(ui.html());
 assert.ok(!h.includes('data-open-view="essentials"'));
 ui.inputs['#view-name']='Weekend fun';ui.submit('create-view');
 h=clean(ui.html());assert.ok(h.includes('Weekend fun')&&h.includes('No tags chosen.'));
 ui.click({dataset:{editTags:'market'}});
 h=clean(ui.html());
 assert.ok(h.includes('Tag portion editor')&&h.includes('data-toggle-tag="groceries" aria-pressed="true"'));
 ui.click({id:'cancel-tags'});
 ui.inputs['#tag-name']='Pets';ui.submit('create-tag');
 h=clean(ui.html());assert.ok(h.includes('data-drop="tag-pets"'));
 assert.equal((h.match(/Part of \$240\.00/g)||[]).length,2,'tags and views never rewrite transaction portions');
});

test('partial views keep mixed transfers distinct from pure repayments and unassigned income',()=>{
 const mixed={id:'mixed',amount:18000,kind:'repayment',balanced:true,allocations:{dinner:16000},income:2000,tags:{friends:9000,trip:9000}};
 const pure={id:'pure',amount:3000,kind:'repayment',balanced:true,allocations:{dinner:3000},income:0,tags:{friends:3000}};
 const extra={id:'extra',amount:1000,kind:'repayment',balanced:true,allocations:{},income:1000,tags:{friends:1000}};
 const views=[{id:'a',tags:['friends']},{id:'b',tags:['friends']}];
 const f=Model.combine([mixed,pure,extra],views);
 assert.equal(f.in,13000);
 assert.equal(f.mixed,9000);
 assert.equal(f.repaid,3000);
 assert.equal(f.unassigned,1000);
 assert.equal(f.earned,0);
 assert.equal(f.in,f.mixed+f.repaid+f.unassigned);
});

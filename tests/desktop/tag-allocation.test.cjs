const {test}=require('node:test'),assert=require('node:assert/strict');
const {allocationParts,savedAllocation,addAllocation,removeAllocation,editAllocation,equalAllocation}=require('../../src/tag-allocation.js');
const {divider,sum}=require('../../src/review-model.js');
const other='adopted-other-id';
test('remainder model preserves cents through adding, removing and editing real tag IDs',()=>{
 let parts=allocationParts([],other,12861);
 parts=addAllocation(parts,'food',other);assert.deepEqual(savedAllocation(parts,other),[{id:'food',cents:12861}]);
 parts=addAllocation(parts,'home',other);assert.deepEqual(parts.map(p=>p.cents),[6431,6430,0]);
 parts=editAllocation(parts,'food',3201,other);assert.deepEqual(parts.map(p=>p.cents),[3201,6430,3230]);
 parts=addAllocation(parts,'gifts',other);assert.deepEqual(parts.map(p=>p.cents),[3201,6430,3230,0]);
 parts=removeAllocation(parts,'home',other);assert.deepEqual(parts.map(p=>p.cents),[3201,3230,6430]);
 parts=editAllocation(parts,'food',12862,other);assert.equal(sum(parts),12861);assert.equal(parts[0].cents,12861);
 parts=removeAllocation(parts,'food',other);parts=removeAllocation(parts,'gifts',other);assert.deepEqual(parts,[{id:other,cents:12861}]);
});
test('adjacent dividers, tiny shares and many repeated operations preserve nonnegative integer money',()=>{
 let parts=allocationParts([{id:'legacy-tag',cents:98765}],other,98765);
 for(let i=0;i<8;i++)parts=addAllocation(parts,'tag-'+i,other);
 for(let i=0;i<500;i++){
  const index=i%(parts.length-1);
  parts=divider(parts,index,(i*719)%120000,i%2?1:100);
  parts=editAllocation(parts,parts[index].id,(i*127)%100000,other);
  assert.equal(sum(parts),98765);assert.ok(parts.every(p=>Number.isSafeInteger(p.cents)&&p.cents>=0));
 }
 parts=equalAllocation(parts,other);assert.equal(sum(parts),98765);assert.equal(parts.at(-1).cents,0);
 assert.equal(savedAllocation(parts,other).length,9);assert.equal(new Set(parts.map(p=>p.id)).size,parts.length);
 assert.deepEqual(editAllocation(parts,'legacy-tag',NaN,other),parts);
});

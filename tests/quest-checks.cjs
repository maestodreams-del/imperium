const assert=require('node:assert/strict');
const q=require('../game.js');
for(const [id,n] of Object.entries(q.scenes)){
 assert.ok(n.title&&n.text,id);
 assert.ok(n.ending||n.choices?.length,id);
 for(const c of n.choices||[])assert.ok(q.scenes[c.next],`${id}: ${c.next}`);
}
// Explore inventory, energy and trust states rather than merely graph edges.
const queue=[q.fresh()],seen=new Set(),reached=new Set();let cursor=0;
while(cursor<queue.length){
 const s=queue[cursor++];queue[cursor-1]=null;
 const key=JSON.stringify([s.node,s.energy,Math.min(s.trust,3),s.items.slice().sort()]);
 if(seen.has(key))continue;seen.add(key);reached.add(s.node);
 assert.ok(q.valid(s));
 const choices=(q.scenes[s.node].choices||[]).map((c,i)=>({c,i})).filter(({c})=>q.available(s,c));
 assert.ok(q.scenes[s.node].ending||choices.length,`No dead end at ${s.node}`);
 for(const {i} of choices){const next=q.advance(s,i);next.history=[];next.trust=Math.min(next.trust,3);queue.push(next);}
}
assert.deepEqual([...reached].sort(),Object.keys(q.scenes).sort());
const s=q.fresh();assert.equal(q.advance(s,99),s);assert.equal(s.node,'wake');
assert.equal(q.available(s,{requires:'tryb'}),false);
assert.equal(q.valid({...s,node:'unknown'}),false);
console.log(`${reached.size} scenes reachable; all five endings reachable; no stranded states; item gates and state validation passed.`);

const assert=require('node:assert/strict');
const q=require('../game.js'),art=require('../quest-sketch.js');
assert.equal(Object.keys(q.scenes).length,125);
assert.equal(art.motifs.length,125);
const sketches=new Set(),numbers=new Set();
for(const [id,n] of Object.entries(q.scenes)){
 assert.ok(n.title&&n.text,id);assert.equal(!!n.ending,false,id);
 assert.ok(n.chapterComplete||n.choices?.length,id);numbers.add(n.number);
 for(const lang of ['pl','ru']){
  const local=q.localized(id,lang);assert.ok(local.title&&local.text,id);
  assert.equal(local.choices.length,n.choices.length);
  for(const c of local.choices)assert.ok(c.label&&q.scenes[c.next],`${id}: ${c.next}`);
 }
 const svg=art.render(n.art,n.title,'Szkic');assert.ok(svg.includes('<svg')&&svg.includes('<title>'));assert.ok(!/NaN|undefined/.test(svg),id);sketches.add(svg);
}
assert.equal(sketches.size,125);assert.equal(numbers.size,125);
const terminal=Object.entries(q.scenes).filter(([id,n])=>n.chapterComplete);
assert.equal(terminal.length,1);assert.equal(terminal[0][1].number,125);
assert.match(q.localized(terminal[0][0],'ru').text,/Обновление скоро/);
assert.match(q.localized(terminal[0][0],'pl').text,/Aktualizacja wkrótce/);
// Exhaustively explore the state that affects gates. Narrative items are retained in
// real saves but deliberately excluded from the state-space key.
const relevant=new Set(['nóż','tryb','woda','kryształ','pryzmat','pamięć','instrukcja','przewód','regulator']);
const queue=[q.fresh()],seen=new Set(),reached=new Set();let cursor=0;
while(cursor<queue.length){
 const s=queue[cursor++];queue[cursor-1]=null;
 const key=JSON.stringify([s.node,s.energy,Math.min(s.trust,3),s.items.filter(x=>relevant.has(x)).sort()]);
 if(seen.has(key))continue;seen.add(key);reached.add(s.node);assert.ok(q.valid(s));
 const choices=(q.scenes[s.node].choices||[]).map((c,i)=>({c,i})).filter(({c})=>q.available(s,c));
 assert.ok(q.scenes[s.node].chapterComplete||choices.length,`No dead end at ${s.node}`);
 for(const {i} of choices){const next=q.advance(s,i);next.history=[];next.trust=Math.min(next.trust,3);queue.push(next);}
}
assert.deepEqual([...reached].sort(),Object.keys(q.scenes).sort());
const s=q.fresh();assert.equal(q.advance(s,99),s);assert.equal(s.node,'wake');
assert.equal(q.available(s,{requires:'tryb'}),false);assert.equal(q.valid({...s,node:'unknown'}),false);
const chosen=q.advance(s,0);assert.deepEqual(q.historyEntry(chosen.history[0],'ru'),['Пробуждение у Грани','Спросить, где ты']);
const legacy={title:q.scenes.wake.title,choice:q.scenes.wake.choices[0].label};assert.deepEqual(q.historyEntry(legacy,'ru'),q.historyEntry(chosen.history[0],'ru'));
for(const id of ['endingTogether','endingEngineer','endingSeal','endingStay','endingHome'])assert.equal(q.advance({...s,node:id},0).node,'chapter01');
let journey={...s,node:'chapter01'};while(!q.scenes[journey.node].chapterComplete)journey=q.advance(journey,0);
assert.equal(journey.history.length,80);assert.equal(journey.node,'chapter81');
assert.equal(q.advance({...s,history:Array.from({length:130},()=>legacy)},0).history.length,131);
for(const n of Object.values(q.scenes))for(const c of n.choices||[])for(const item of [c.add,c.requires,c.remove].filter(Boolean))assert.ok(q.itemsRU[item],item);
console.log(`${reached.size} bilingual scenes and unique sketches; all routes reachable; no stranded states; legacy saves, translated history and complete chapter passed (${seen.size} gate states).`);

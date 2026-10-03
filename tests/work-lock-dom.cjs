const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"></div><input id="file-input" type="file"><input id="rental-pdf-input" type="file">',{url:'https://imperium.test/',runScripts:'outside-only'}),w=dom.window;
w.Audio=class Audio{pause(){}};w.URL.revokeObjectURL=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=()=>{throw Error('Unexpected network request')};
w.localStorage.setItem('imperium_mode_v2','demo');w.localStorage.setItem('imperium_demo_session_v2',JSON.stringify({userId:'u-zenon'}));
for(const f of ['quest-chapter.js','quest-sketch.js','game.js'])w.eval(fs.readFileSync(f,'utf8'));
let app=fs.readFileSync('app.js','utf8');const marker='  init();\n})();';assert.ok(app.includes(marker));app=app.replace(marker,'  window.workLockTest={state,render,cloudFetch,loadCloudDB};\n'+marker);w.eval(app);
const {state,render}=w.workLockTest,allRoles=state.db.users.filter(u=>u.active),locked=['tasks','locations','inspections','rentals','invoices','important','activity','attendance','chat','team','profile','salary','settings'];
function assertLocked(){
 assert.equal(w.document.querySelectorAll('.reduction-notice').length,1);
 assert.equal(w.document.querySelectorAll('.reduction-notice li').length,5);
 assert.match(w.document.querySelector('.reduction-notice').textContent,/31 października 2026/);
 for(const id of locked){const b=w.document.querySelector(`.bottomnav [data-tab="${id}"]`);assert.equal(b.disabled,true,id);assert.equal(b.getAttribute('aria-disabled'),'true');b.click();assert.equal(state.tab,'notice');}
 for(const selector of ['#new-task','#profile-messenger','#salary-amount','.modal-bg','#chat-input'])assert.equal(w.document.querySelector(selector),null,selector);
 assert.ok(w.document.getElementById('logout'));
}
for(const u of allRoles){state.demoSession={userId:u.id};state.tab='tasks';state.modal='newTask';render();assert.equal(state.tab,'notice');assert.equal(state.modal,null);assertLocked();
 for(const tab of locked){state.tab=tab;state.modal='detail';render();assert.equal(state.tab,'notice',`${u.id} forced ${tab}`);assert.equal(state.modal,null);}
 w.document.querySelector('.bottomnav [data-tab="game"]').click();assert.equal(state.tab,'game');assert.ok(w.document.querySelector('[data-quest-language="ru"]'));w.document.querySelector('button[data-quest-language="ru"]').click();assert.ok(w.document.querySelector('.quest-scene'));w.document.querySelector('[data-quest-choice="0"]').click();assert.equal(JSON.parse(w.localStorage.getItem('imperium_quest_v1:demo:'+u.id)).node,'names');w.document.querySelector('[data-tab="notice"]').click();assertLocked();}
// A loaded cloud account uses the identical policy without exact audience IDs.
w.localStorage.setItem('imperium_cloud_config_v2',JSON.stringify({url:'https://example.invalid',key:'test-only-placeholder-key'}));
state.mode='cloud';state.auth={access_token:'not-a-real-token',user:{id:allRoles[0].id}};state.tab='salary';render();assertLocked();
(async()=>{
 await assert.rejects(w.workLockTest.cloudFetch('/rest/v1/tasks?select=*'),/zablokowane/);
 await assert.rejects(w.workLockTest.cloudFetch('/rest/v1/rpc/claim_task',{method:'POST',body:{p_task_id:'test'}}),/zablokowane/);
 await assert.rejects(w.workLockTest.cloudFetch('/storage/v1/object/task-files/test',{method:'POST'}),/zablokowane/);
 const paths=[];state.auth.expires_at=Math.floor(Date.now()/1000)+3600;
 w.fetch=async url=>{paths.push(url);return {ok:true,status:200,text:async()=>JSON.stringify(url.includes('/profiles?')?[{id:allRoles[0].id,full_name:'Cloud user',role:'admin',active:true}]:[])}};
 await w.workLockTest.loadCloudDB();assertLocked();assert.ok(paths.some(x=>x.includes('/profiles?')));assert.ok(paths.every(x=>x.includes('/profiles?')||x.includes('/app_updates?')));
 state.mode='demo';state.db.users=allRoles;state.demoSession={userId:'u-admin'};state.tab='notice';render();w.document.getElementById('logout').click();assert.ok(w.document.getElementById('login-admin'));
 dom.window.close();
console.log(`Universal notice and all 13 work tabs locked for ${allRoles.length} demo accounts and a cloud account; forced routes/modals blocked; game, progress and logout remain available.`);

})().catch(e=>{dom.window.close();console.error(e);process.exitCode=1;});

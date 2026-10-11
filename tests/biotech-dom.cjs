const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const make=()=>new JSDOM(html,{url:'https://imperium.test/',runScripts:'outside-only',pretendToBeVisual:true});
// Exactly ten seconds on the first launch, once only after successful completion.
{
 const d=make(),w=d.window;let now=0,next;
 Object.defineProperty(w.performance,'now',{value:()=>now});w.setTimeout=fn=>{next=fn;return 1};w.clearTimeout=()=>{};
 w.eval(fs.readFileSync('startup.js','utf8'));
 assert.equal(w.document.getElementById('app').inert,true);
 assert.equal(w.localStorage.getItem('imperium_biotech_intro_v1'),null);
 now=9999;next();assert.ok(w.document.getElementById('boot-screen'));
 now=10000;next();assert.equal(w.document.getElementById('boot-screen'),null);
 assert.equal(w.document.getElementById('app').inert,false);
 assert.equal(w.localStorage.getItem('imperium_biotech_intro_v1'),'complete');
 w.document.body.insertAdjacentHTML('afterbegin','<div id="boot-screen"></div>');
 w.eval(fs.readFileSync('startup.js','utf8'));assert.equal(w.document.getElementById('boot-screen'),null);d.window.close();
}
(async()=>{
 const d=make(),w=d.window,errors=[],requests=[];
 w.addEventListener('error',e=>errors.push(e.message));
 w.Audio=class Audio{pause(){}play(){return Promise.resolve()}};w.URL.revokeObjectURL=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.IMPERIUM_CONFIG={DEFAULT_SUPABASE_URL:'https://backend.invalid',DEFAULT_SUPABASE_ANON_KEY:'test-only-anon-placeholder',ALLOW_DEMO:false};
 let access=true;
 w.fetch=async(url,opts={})=>{requests.push({url,method:opts.method});return {ok:true,status:200,text:async()=>JSON.stringify(url.includes('imperium_access_status')?access:url.includes('imperium_comms_feed')?{active:true,owner:access,announcements:[]}:[])};};
 w.document.getElementById('boot-screen').remove();
 for(const f of ['communications.js'])w.eval(fs.readFileSync(f,'utf8'));
 let code=fs.readFileSync('app.js','utf8');const marker='  init();\n})();';assert.ok(code.includes(marker));code=code.replace(marker,'  window.biotechTest={state,render,seed,loadCloudDB,cloudFetch,hasOwnerAccess,signUpCloud};\n'+marker);w.eval(code);
 const t=w.biotechTest,{state}=t;
 assert.ok(w.document.getElementById('owner-login-form'));assert.equal(w.document.getElementById('cloud-register'),null);assert.equal(w.document.getElementById('start-demo'),null);
 state.mode='cloud';state.auth={access_token:'fixture-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-admin',email:'owner@example.test'}};
 state.db=t.seed();state.ownerAccess=true;state.verifiedOwnerId='u-admin';state.salaryManager=true;await w.ImperiumComms.connect('u-admin');
 const tabs=['announcements','browser','youtube','locations','inspections','rentals','invoices','important','activity','attendance','chat','team','profile','salary','settings'];
 for(const tab of tabs){state.tab=tab;t.render();assert.ok(w.document.querySelector('.bio-shell'),tab);assert.ok(w.document.querySelector(`.bio-sidebar [data-tab="${tab}"].active`),tab);assert.ok(w.document.querySelector('.content').textContent.trim(),tab);assert.equal(w.document.querySelector('.access-denied'),null,tab);}
 state.tab='announcements';t.render();w.document.getElementById('module-menu').click();assert.equal(w.document.querySelectorAll('.module-grid [data-tab]').length,15);w.document.querySelector('.module-grid [data-tab="rentals"]').click();assert.equal(state.tab,'rentals');assert.equal(w.document.querySelector('.module-drawer'),null);
 state.tab='announcements';t.render();w.document.querySelector('[data-compose]').click();assert.ok(w.document.getElementById('announcement-title'));assert.ok(w.document.getElementById('announcement-body'));w.ImperiumComms.state.compose=false;
 // A different administrator and a forged/stale owner flag are denied.
 state.modal=null;state.auth.user.id='u-zenon';state.tab='salary';t.render();assert.ok(w.document.querySelector('.access-denied'));assert.equal(w.document.querySelector('[data-tab]'),null);
 await assert.rejects(t.cloudFetch('/rest/v1/tasks?select=*'),/ograniczony/);
 await assert.rejects(t.cloudFetch('/rest/v1/rpc/claim_task',{method:'POST',body:{}}),/ograniczony/);
 await assert.rejects(t.cloudFetch('/storage/v1/object/task-files/private'),/ograniczony/);
 await assert.rejects(t.signUpCloud(),/zamknięta/);
 // Server revocation clears previously loaded operational data, even for an admin.
 state.auth.user.id='u-admin';state.ownerAccess=true;state.verifiedOwnerId='u-admin';access=false;requests.length=0;
 await t.loadCloudDB();assert.equal(state.db.tasks.length,0);assert.equal(state.db.users.length,1);assert.equal(state.ownerAccess,false);assert.ok(w.document.querySelector('.participant-shell'));assert.ok(requests.every(x=>x.url.includes('imperium_access_status')||x.url.includes('app_updates')||x.url.includes('imperium_comms_feed')));
 assert.deepEqual(errors,[]);d.window.close();
 console.log('PASS: ten-second first launch, repeat launch, 15 owner modules, mobile menu, announcement editor, denied non-owner/admin, stale-session guard and server revocation.');
})().catch(e=>{console.error(e);process.exitCode=1;});

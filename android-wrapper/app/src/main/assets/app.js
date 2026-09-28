(() => {
'use strict';

const BASE_CFG = window.IMPERIUM_CONFIG || {};
const app = document.getElementById('app');
const fileInput = document.getElementById('file-input');
const DB_KEY = 'imperium_db_v2';
const DEMO_SESSION_KEY = 'imperium_demo_session_v2';
const CLOUD_CFG_KEY = 'imperium_cloud_config_v2';
const AUTH_KEY = 'imperium_auth_v2';
const MODE_KEY = 'imperium_mode_v2';
const syncChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('imperium-v2-sync') : null;

let selectedFiles = [];
let pollTimer = null;
let state = {
  mode: null, // null | demo | cloud
  tab: 'tasks', filter: 'all', workerPeriod: 'all', modal: null, taskId: null, locationId: null, userId: null,
  demoSession: null, auth: null, db: null, loading: false, cloudError: '', lastEventAt: null
};

const nowISO = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const esc = (v='') => String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmtDate = iso => iso ? new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)) : '—';
const initials = name => String(name||'?').split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase();
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const bytes = n => !n ? '0 B' : n < 1024*1024 ? `${Math.ceil(n/1024)} KB` : `${(n/1024/1024).toFixed(1)} MB`;

function seed(){
  const t = Date.now();
  return {
    version:2,
    users:[
      {id:'u-admin',name:'Administrator',role:'admin',locationIds:['l1','l2','l3','l4','l5','l6'],active:true},
      {id:'u-zenon',name:'Zenon',role:'worker',locationIds:['l3','l4'],active:true},
      {id:'u-mikolaj',name:'Mikołaj',role:'worker',locationIds:['l1','l2','l5','l6'],active:true},
      {id:'u-nikolai',name:'Nikolai',role:'worker',locationIds:['l1','l2','l4'],active:true}
    ],
    locations:[
      {id:'l1',name:'Maktronik',city:'Bydgoszcz',address:'',description:'',active:true},
      {id:'l2',name:'Smolańska',city:'Bydgoszcz',address:'Smolańska, Bydgoszcz',description:'',active:true},
      {id:'l3',name:'TERIMEX',city:'Pogorzelica',address:'',description:'',active:true},
      {id:'l4',name:'MEGA',city:'',address:'',description:'',active:true},
      {id:'l5',name:'Płonia',city:'Szczecin',address:'',description:'',active:true},
      {id:'l6',name:'Hotel Tur',city:'Szczecin',address:'',description:'',active:true}
    ],
    tasks:[
      {id:'t1',title:'Sprawdzić pomieszczenie techniczne',description:'Kontrola stanu instalacji i krótki raport zdjęciowy.',notes:'Po kontroli pozostawić pomieszczenie zamknięte.',sanctionType:'warning',sanctionText:'W przypadku niewykonania w terminie — pisemne wyjaśnienie przyczyny.',disciplinaryNote:'',rewardCoins:80,penaltyCoins:40,locationId:'l3',priority:'high',status:'open',durationMin:90,createdAt:new Date(t-7200000).toISOString(),createdBy:'u-admin',claimedBy:null,claimedAt:null,deadlineAt:null,completedAt:null,reworkCount:0,report:null,comments:[],attachments:[]},
      {id:'t2',title:'Odczyt liczników',description:'Spisać wodę i energię, dodać zdjęcia liczników.',notes:'Zdjęcia muszą pokazywać cały licznik i stan.',sanctionType:'note',sanctionText:'Uwaga w zadaniu w przypadku braku dokumentacji zdjęciowej.',disciplinaryNote:'',rewardCoins:50,penaltyCoins:25,locationId:'l2',priority:'normal',status:'in_progress',durationMin:60,createdAt:new Date(t-5400000).toISOString(),createdBy:'u-admin',claimedBy:'u-mikolaj',claimedAt:new Date(t-1600000).toISOString(),deadlineAt:new Date(t+2000000).toISOString(),completedAt:null,reworkCount:0,report:null,comments:[],attachments:[]},
      {id:'t3',title:'Pokój po naprawie — odbiór',description:'Sprawdzić wykończenie i zgłosić ewentualne poprawki.',notes:'Odbiór dopiero po sprawdzeniu drzwi, gniazdek i łazienki.',sanctionType:'none',sanctionText:'',disciplinaryNote:'',rewardCoins:120,penaltyCoins:60,locationId:'l4',priority:'urgent',status:'review',durationMin:120,createdAt:new Date(t-10800000).toISOString(),createdBy:'u-admin',claimedBy:'u-zenon',claimedAt:new Date(t-9000000).toISOString(),deadlineAt:new Date(t-1800000).toISOString(),completedAt:null,reworkCount:1,report:{text:'Prace wykonane. Dołączono dokumentację.',submittedAt:new Date(t-1200000).toISOString(),attachments:[{id:'a-demo',name:'raport_pokoj_12.pdf',size:483221,type:'application/pdf',kind:'report'}]},comments:[{id:uid(),userId:'u-admin',text:'Sprawdzę na miejscu przy odbiorze.',createdAt:new Date(t-600000).toISOString()}],attachments:[]}
    ],
    disciplinaryRecords:[
      {id:'d-demo-1',userId:'u-zenon',taskId:'t3',type:'note',description:'Zadanie wróciło do poprawy po pierwszym odbiorze. Zwrócić większą uwagę na kompletność kontroli.',createdBy:'u-admin',createdAt:new Date(t-700000).toISOString()}
    ],
    coinTransactions:[
      {id:'c-demo-1',userId:'u-mikolaj',taskId:null,kind:'adjustment',amount:100,description:'Premia startowa IMPERIUM',createdBy:'u-admin',createdAt:new Date(t-4000000).toISOString()},
      {id:'c-demo-2',userId:'u-zenon',taskId:null,kind:'adjustment',amount:60,description:'Premia za wzorową pracę',createdBy:'u-admin',createdAt:new Date(t-3000000).toISOString()}
    ],
    events:[
      {id:uid(),type:'system',text:'IMPERIUM uruchomione',userId:'u-admin',taskId:null,createdAt:new Date(t-12000000).toISOString()},
      {id:uid(),type:'claim',text:'Mikołaj przejął zadanie „Odczyt liczników”',userId:'u-mikolaj',taskId:'t2',createdAt:new Date(t-1600000).toISOString()},
      {id:uid(),type:'report',text:'Zenon przesłał raport do zadania „Pokój po naprawie — odbiór”',userId:'u-zenon',taskId:'t3',createdAt:new Date(t-1200000).toISOString()}
    ]
  };
}

function loadDemoDB(){
  try {
    const x=JSON.parse(localStorage.getItem(DB_KEY));
    if(x?.version===2){
      x.disciplinaryRecords ||= [];
      x.coinTransactions ||= [];
      (x.tasks||[]).forEach(t=>{ if(t.reworkCount==null)t.reworkCount=0; if(t.completedAt===undefined)t.completedAt=null; if(t.rewardCoins==null)t.rewardCoins=0; if(t.penaltyCoins==null)t.penaltyCoins=0; });
      return x;
    }
  } catch(e){}
  const db=seed(); localStorage.setItem(DB_KEY,JSON.stringify(db)); return db;
}
function saveDemoDB(){
  localStorage.setItem(DB_KEY,JSON.stringify(state.db));
  try{syncChannel?.postMessage('changed')}catch(e){}
}
function cloudConfig(){
  const embedded = (BASE_CFG.DEFAULT_SUPABASE_URL && BASE_CFG.DEFAULT_SUPABASE_ANON_KEY) ? {url:BASE_CFG.DEFAULT_SUPABASE_URL,key:BASE_CFG.DEFAULT_SUPABASE_ANON_KEY,embedded:true} : null;
  if(embedded) return embedded;
  try { const c=JSON.parse(localStorage.getItem(CLOUD_CFG_KEY)); if(c?.url && c?.key) return c; } catch(e){}
  return null;
}
function normalizeUrl(url){ return String(url||'').trim().replace(/\/+$/,''); }
function saveCloudConfig(url,key){
  const c={url:normalizeUrl(url),key:String(key||'').trim()};
  if(!/^https:\/\//i.test(c.url) || c.key.length<20) throw new Error('Nieprawidłowy adres lub klucz Supabase.');
  localStorage.setItem(CLOUD_CFG_KEY,JSON.stringify(c));
  localStorage.setItem(MODE_KEY,'cloud');
  return c;
}
function clearCloudConfig(){ if(!(BASE_CFG.DEFAULT_SUPABASE_URL&&BASE_CFG.DEFAULT_SUPABASE_ANON_KEY)) localStorage.removeItem(CLOUD_CFG_KEY); localStorage.removeItem(AUTH_KEY); state.auth=null; }
function currentUser(){
  const id = state.mode==='cloud' ? state.auth?.user?.id : state.demoSession?.userId;
  return state.db?.users?.find(u=>u.id===id) || null;
}
function getUser(id){ return state.db?.users?.find(u=>u.id===id); }
function getLoc(id){ return state.db?.locations?.find(l=>l.id===id); }
function isAdmin(){ return currentUser()?.role==='admin'; }
function taskStatusLabel(s){ return ({open:'Nowe',in_progress:'W toku',review:'Do akceptacji',done:'Zakończone'}[s]||s); }
function priorityLabel(p){ return ({normal:'Normalne',high:'Wysoki',urgent:'Pilne'}[p]||p); }
function sanctionLabel(s){ return ({none:'Brak',note:'Uwaga',warning:'Ostrzeżenie',reprimand:'Upomnienie',other:'Inna sankcja'}[s]||s||'Brak'); }
function disciplineLabel(s){ return ({note:'Uwaga',warning:'Ostrzeżenie',reprimand:'Upomnienie',other:'Inna'}[s]||s||'Wpis'); }
function coinKindLabel(k){ return ({task_reward:'Nagroda za zadanie',task_bonus:'Bonus za wykonanie',task_penalty:'Niewykonanie zadania',adjustment:'Korekta administratora'}[k]||k||'Nikitocoiny'); }
function coinBalance(userId){ return (state.db?.coinTransactions||[]).filter(x=>x.userId===userId).reduce((n,x)=>n+Number(x.amount||0),0); }
function coinTxFor(userId,period=state.workerPeriod){ return (state.db?.coinTransactions||[]).filter(x=>x.userId===userId&&inPeriod(x.createdAt,period)); }
function fmtCoins(n){ n=Number(n||0); return `${n>0?'+':''}${n} NK`; }
function periodCutoff(period){ if(period==='30')return Date.now()-30*86400000; if(period==='90')return Date.now()-90*86400000; if(period==='365')return Date.now()-365*86400000; return 0; }
function inPeriod(iso,period){ const c=periodCutoff(period); return !c || (iso && new Date(iso).getTime()>=c); }
function taskLate(t){
  if(!t.deadlineAt)return false;
  const deadline=new Date(t.deadlineAt).getTime();
  const finished=t.report?.submittedAt||t.completedAt||null;
  if(finished)return new Date(finished).getTime()>deadline;
  return (t.status==='in_progress'||t.status==='review') && Date.now()>deadline;
}
function workerStats(userId,period=state.workerPeriod){
  const tasks=(state.db.tasks||[]).filter(t=>t.claimedBy===userId && inPeriod(t.claimedAt||t.createdAt,period));
  const records=(state.db.disciplinaryRecords||[]).filter(r=>r.userId===userId && inPeriod(r.createdAt,period));
  return {tasks,records,total:tasks.length,done:tasks.filter(t=>t.status==='done').length,active:tasks.filter(t=>t.status==='in_progress'||t.status==='review').length,late:tasks.filter(taskLate).length,reworks:tasks.reduce((n,t)=>n+(Number(t.reworkCount)||0),0),notes:records.filter(r=>r.type==='note').length,warnings:records.filter(r=>r.type==='warning').length,reprimands:records.filter(r=>r.type==='reprimand').length};
}
function duration(ms){
  const sign=ms<0?'-':''; ms=Math.abs(ms||0); const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);
  return `${sign}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function toast(text){
  document.querySelector('.notice')?.remove(); const d=document.createElement('div'); d.className='notice'; d.textContent=text; document.body.appendChild(d); setTimeout(()=>d.remove(),3500);
}
function notify(title,body){
  try { if(window.AndroidBridge?.notify) window.AndroidBridge.notify(String(title),String(body||'')); } catch(e){}
  if('Notification' in window && Notification.permission==='granted'){ try{new Notification(title,{body,icon:'icons/icon.svg'});}catch(e){} }
  toast(body||title);
}
function setLoading(on,msg='Łączenie z IMPERIUM…'){
  state.loading=on;
  if(on) app.innerHTML=`<div class="loading"><div><div class="spinner"></div><b>${esc(msg)}</b></div></div>`;
}

// ---------- Supabase REST/Auth adapter ----------
async function refreshSession(){
  const c=cloudConfig(); if(!c || !state.auth?.refresh_token) return;
  if(state.auth.expires_at && state.auth.expires_at*1000 > Date.now()+90000) return;
  const r=await fetch(`${c.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:c.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:state.auth.refresh_token})});
  if(!r.ok) throw new Error('Sesja wygasła. Zaloguj się ponownie.');
  const x=await r.json(); state.auth=x; if(!state.auth.expires_at&&x.expires_in)state.auth.expires_at=Math.floor(Date.now()/1000)+x.expires_in; localStorage.setItem(AUTH_KEY,JSON.stringify(state.auth));
}
async function cloudFetch(path,{method='GET',body=null,headers={},raw=false,auth=true}={}){
  const c=cloudConfig(); if(!c) throw new Error('Brak konfiguracji chmury.');
  if(auth) await refreshSession();
  const h={apikey:c.key,...headers};
  if(auth && state.auth?.access_token) h.Authorization=`Bearer ${state.auth.access_token}`;
  if(body!==null && !(body instanceof Blob) && !(body instanceof FormData) && !h['Content-Type']) h['Content-Type']='application/json';
  const r=await fetch(`${c.url}${path}`,{method,headers:h,body:body===null?undefined:(h['Content-Type']==='application/json'&&typeof body!=='string'?JSON.stringify(body):body)});
  if(!r.ok){ let msg='Błąd serwera'; try{const j=await r.json();msg=j.message||j.msg||j.error_description||j.error||msg;}catch(e){try{msg=await r.text()||msg}catch(_){}} throw new Error(msg); }
  if(raw) return r;
  if(r.status===204) return null;
  const txt=await r.text(); return txt?JSON.parse(txt):null;
}
async function signInCloud(email,password){
  const c=cloudConfig();
  const r=await fetch(`${c.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:c.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const x=await r.json().catch(()=>({})); if(!r.ok) throw new Error(x.error_description||x.msg||'Nie udało się zalogować.');
  state.auth=x; if(!state.auth.expires_at&&x.expires_in) state.auth.expires_at=Math.floor(Date.now()/1000)+x.expires_in; localStorage.setItem(AUTH_KEY,JSON.stringify(state.auth));
  try{await cloudFetch('/rest/v1/rpc/bootstrap_first_admin',{method:'POST',body:{}});}catch(e){}
  await loadCloudDB(); startPolling();
}
async function signUpCloud(name,email,password){
  const c=cloudConfig();
  const r=await fetch(`${c.url}/auth/v1/signup`,{method:'POST',headers:{apikey:c.key,'Content-Type':'application/json'},body:JSON.stringify({email,password,data:{full_name:name}})});
  const x=await r.json().catch(()=>({})); if(!r.ok) throw new Error(x.msg||x.error_description||'Nie udało się utworzyć konta.');
  if(x.access_token){ state.auth=x; if(!state.auth.expires_at&&x.expires_in)state.auth.expires_at=Math.floor(Date.now()/1000)+x.expires_in;localStorage.setItem(AUTH_KEY,JSON.stringify(state.auth));try{await cloudFetch('/rest/v1/rpc/bootstrap_first_admin',{method:'POST',body:{}});}catch(e){} await loadCloudDB();startPolling(); }
  else { toast('Konto utworzone. Jeśli w Supabase włączono potwierdzenie e-mail, potwierdź adres i zaloguj się.'); }
}
async function signOutCloud(){
  try{await cloudFetch('/auth/v1/logout',{method:'POST'});}catch(e){}
  localStorage.removeItem(AUTH_KEY); state.auth=null; state.db=null; stopPolling(); render();
}
async function pgGet(query){ return cloudFetch(`/rest/v1/${query}`); }
  async function checkImperiumUpdate(){
  if(state.mode!=='cloud' || !state.auth?.access_token) return;

  try{
    const updates=await pgGet(
      'app_updates?select=version,version_name,package_url&active=eq.true&order=version.desc&limit=1'
    );

    if(!updates?.length) return;

    const update=updates[0];

    if(
      window.AndroidBridge &&
      typeof AndroidBridge.checkWebUpdate==='function'
    ){
      AndroidBridge.checkWebUpdate(
        Number(update.version),
        String(update.version_name||''),
        String(update.package_url||''),
        String(state.auth.access_token||'')
      );
    }

  }catch(e){
    console.warn('IMPERIUM update check:',e);
  }
}
async function pgPost(table,body,prefer='return=minimal'){ return cloudFetch(`/rest/v1/${table}`,{method:'POST',body,headers:{Prefer:prefer}}); }
async function pgPatch(table,filter,body,prefer='return=minimal'){ return cloudFetch(`/rest/v1/${table}?${filter}`,{method:'PATCH',body,headers:{Prefer:prefer}}); }
async function pgDelete(table,filter){ return cloudFetch(`/rest/v1/${table}?${filter}`,{method:'DELETE'}); }

function mapTaskRow(t,comments,atts){
  const taskAtts=atts.filter(a=>a.task_id===t.id&&a.kind==='task').map(mapAtt);
  const reportAtts=atts.filter(a=>a.task_id===t.id&&a.kind==='report').map(mapAtt);
  return {id:t.id,title:t.title,description:t.description||'',notes:t.notes||'',sanctionType:t.sanction_type||'none',sanctionText:t.sanction_text||'',disciplinaryNote:t.disciplinary_note||'',rewardCoins:Number(t.reward_coins||0),penaltyCoins:Number(t.penalty_coins||0),locationId:t.location_id,priority:t.priority,status:t.status,durationMin:t.duration_min,createdAt:t.created_at,createdBy:t.created_by,claimedBy:t.claimed_by,claimedAt:t.claimed_at,deadlineAt:t.deadline_at,completedAt:t.completed_at,reworkCount:Number(t.rework_count||0),report:t.report_text?{text:t.report_text,submittedAt:t.report_submitted_at,attachments:reportAtts}:null,comments:comments.filter(c=>c.task_id===t.id).map(c=>({id:c.id,userId:c.author_id,text:c.body,createdAt:c.created_at})),attachments:taskAtts};
}
function mapAtt(a){return {id:a.id,name:a.file_name,size:Number(a.size_bytes||0),type:a.mime_type||'application/octet-stream',path:a.storage_path,kind:a.kind,uploadedBy:a.uploaded_by,createdAt:a.created_at};}
async function loadCloudDB({silent=false}={}){
  if(!state.auth?.access_token) return;
  if(!silent) setLoading(true,'Synchronizacja danych…');
  try{
    const [profiles,locations,pls,tasks,comments,atts,events,discipline,coins]=await Promise.all([
      pgGet('profiles?select=id,full_name,role,active,created_at&order=created_at.asc'),
      pgGet('locations?select=*&order=name.asc'),
      pgGet('profile_locations?select=profile_id,location_id'),
      pgGet('tasks?select=*&order=created_at.desc'),
      pgGet('task_comments?select=*&order=created_at.asc'),
      pgGet('task_attachments?select=*&order=created_at.asc'),
      pgGet('events?select=*&order=created_at.desc&limit=100'),
      pgGet('disciplinary_records?select=*&order=created_at.desc'),
      pgGet('coin_transactions?select=*&order=created_at.desc')
    ]);
    state.db={version:2,users:profiles.map(p=>({id:p.id,name:p.full_name,role:p.role,active:p.active,locationIds:pls.filter(x=>x.profile_id===p.id).map(x=>x.location_id)})),locations:locations.map(l=>({id:l.id,name:l.name,city:l.city||'',address:l.address||'',description:l.description||'',active:l.active})),tasks:tasks.map(t=>mapTaskRow(t,comments,atts)),disciplinaryRecords:discipline.map(r=>({id:r.id,userId:r.profile_id,taskId:r.task_id,type:r.record_type,description:r.description,createdBy:r.created_by,createdAt:r.created_at})),coinTransactions:coins.map(r=>({id:r.id,userId:r.profile_id,taskId:r.task_id,kind:r.transaction_kind,amount:Number(r.amount||0),description:r.description||'',createdBy:r.created_by,createdAt:r.created_at})),events:events.map(e=>({id:e.id,type:e.event_type,text:e.message,userId:e.actor_id,taskId:e.task_id,createdAt:e.created_at}))};
    const newest=state.db.events[0]?.createdAt||null;
    if(state.lastEventAt && newest){ const fresh=state.db.events.filter(e=>new Date(e.createdAt)>new Date(state.lastEventAt) && e.userId!==currentUser()?.id); if(fresh.length) notify('IMPERIUM',fresh[0].text); }
    state.lastEventAt=newest; state.cloudError=''; state.loading=false;
    if(!silent || (!state.modal && state.tab!=='chat')) render();
    if(isAdmin() && state.db.locations.length===0){ try{await cloudFetch('/rest/v1/rpc/seed_default_locations',{method:'POST',body:{}});await sleep(300);return loadCloudDB({silent:false});}catch(e){} }
  }catch(e){ state.loading=false; state.cloudError=e.message; if(/sesja|JWT|token|expired/i.test(e.message)){localStorage.removeItem(AUTH_KEY);state.auth=null;} render(); }
}
async function logEvent(type,text,taskId=null){
  if(state.mode==='demo'){ state.db.events.unshift({id:uid(),type,text,userId:currentUser()?.id||null,taskId,createdAt:nowISO()}); saveDemoDB(); return; }
  await pgPost('events',{event_type:type,actor_id:currentUser()?.id||null,task_id:taskId,message:text});
}
function startPolling(){ stopPolling(); if(state.mode!=='cloud'||!state.auth)return; pollTimer=setInterval(()=>{if(!state.modal && document.visibilityState!=='hidden')loadCloudDB({silent:true}).catch(()=>{});},BASE_CFG.POLL_INTERVAL_MS||10000); }
function stopPolling(){ if(pollTimer){clearInterval(pollTimer);pollTimer=null;} }

// ---------- Config/setup ----------
function configCode(){ const c=cloudConfig(); if(!c)return ''; return `IMP1:${btoa(JSON.stringify({u:c.url,k:c.key}))}`; }
function parseConfigCode(code){
  const s=String(code||'').trim(); if(!s.startsWith('IMP1:')) throw new Error('Nieprawidłowy kod konfiguracji.');
  const x=JSON.parse(atob(s.slice(5))); if(!x.u||!x.k) throw new Error('Kod jest niekompletny.'); return {url:x.u,key:x.k};
}
function renderSetup(){
  app.innerHTML=`<div class="login"><div class="login-card"><div class="login-sigil">I</div><h1>IMPERIUM</h1><div class="motto"><span>Ad gloriam Imperatoris Nikitae</span><small>Na chwałę Imperatora Nikity</small></div>
  <p style="color:#9b8f7c;font-size:13px;line-height:1.55">Połącz aplikację z jednym wspólnym serwerem, aby zadania, raporty i pliki były widoczne na wszystkich telefonach.</p>
  <div class="setup-grid"><div class="setup-card"><h3>☁ Wspólna baza</h3><p>Supabase: konta pracowników, wspólne zadania, zdjęcia, wideo i dokumenty.</p><button class="goldbtn" id="open-cloud-setup">Połącz z chmurą</button></div>
  ${BASE_CFG.ALLOW_DEMO!==false?'<div class="setup-card"><h3>⚙ Demo lokalne</h3><p>Działa od razu, ale dane zostają tylko na tym urządzeniu.</p><button class="ghost" id="start-demo">Uruchom demo</button></div>':''}</div>
  </div></div>`;
  document.getElementById('open-cloud-setup')?.addEventListener('click',()=>{state.modal='cloudSetup';render();});
  document.getElementById('start-demo')?.addEventListener('click',()=>{state.mode='demo';localStorage.setItem(MODE_KEY,'demo');state.db=loadDemoDB();try{state.demoSession=JSON.parse(localStorage.getItem(DEMO_SESSION_KEY));}catch(e){}render();});
}
function renderCloudLogin(){
  app.innerHTML=`<div class="login"><div class="login-card"><div class="login-sigil">I</div><h1>IMPERIUM</h1><div class="motto"><span>Ad gloriam Imperatoris Nikitae</span><small>Na chwałę Imperatora Nikity</small></div>
  <div class="cloud-state">● WSPÓLNA BAZA</div>${state.cloudError?`<div class="status-note danger-text">${esc(state.cloudError)}</div>`:''}
  <div class="field" style="text-align:left"><label>E-mail</label><input id="login-email" type="email" autocomplete="username" placeholder="pracownik@firma.pl"></div>
  <div class="field" style="text-align:left"><label>Hasło</label><input id="login-pass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
  <button class="goldbtn" id="cloud-login">Zaloguj się</button>
  <details class="register-box"><summary>Utwórz konto pracownika</summary><div class="field"><label>Imię i nazwisko</label><input id="reg-name" placeholder="Imię i nazwisko"></div><div class="field"><label>E-mail</label><input id="reg-email" type="email" placeholder="pracownik@firma.pl"></div><div class="field"><label>Hasło (min. 6 znaków)</label><input id="reg-pass" type="password" placeholder="Hasło"></div><button class="ghost" id="cloud-register" style="width:100%">Zarejestruj konto</button></details>
  <button class="ghost muted-btn" id="change-server" style="width:100%;margin-top:12px">Konfiguracja serwera</button>
  </div></div>`;
  document.getElementById('cloud-login').onclick=async()=>{const e=document.getElementById('login-email').value.trim(),p=document.getElementById('login-pass').value;if(!e||!p)return toast('Wpisz e-mail i hasło.');setLoading(true,'Logowanie…');try{await signInCloud(e,p);}catch(err){state.loading=false;state.cloudError=err.message;render();}};
  document.getElementById('cloud-register').onclick=async()=>{const n=document.getElementById('reg-name').value.trim(),e=document.getElementById('reg-email').value.trim(),p=document.getElementById('reg-pass').value;if(!n||!e||p.length<6)return toast('Uzupełnij dane i ustaw hasło min. 6 znaków.');setLoading(true,'Tworzenie konta…');try{await signUpCloud(n,e,p);if(!state.auth){state.loading=false;render();}}catch(err){state.loading=false;state.cloudError=err.message;render();}};
  document.getElementById('change-server').onclick=()=>{state.modal='cloudSetup';render();};
}
function renderDemoLogin(){
  const workers=state.db.users.filter(u=>u.role==='worker'&&u.active);
  app.innerHTML=`<div class="login"><div class="login-card"><div class="login-sigil">I</div><h1>IMPERIUM</h1><div class="motto"><span>Ad gloriam Imperatoris Nikitae</span><small>Na chwałę Imperatora Nikity</small></div><div class="cloud-state offline">● DEMO LOKALNE</div>
    <p style="color:#9b8f7c;font-size:13px;line-height:1.55">Tryb do testów na jednym urządzeniu.</p><button class="goldbtn" id="login-admin">👑 Administrator</button>
    <div class="login-separator"><span>lub pracownik</span></div><div class="field" style="text-align:left"><select id="worker-select">${workers.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div><button class="ghost" id="login-worker" style="width:100%">🛠️ Pracownik</button>
    <button class="ghost muted-btn" id="back-setup" style="width:100%;margin-top:12px">Połącz z chmurą</button></div></div>`;
  document.getElementById('login-admin').onclick=()=>demoLogin('u-admin');
  document.getElementById('login-worker').onclick=()=>demoLogin(document.getElementById('worker-select').value);
  document.getElementById('back-setup').onclick=()=>{state.mode=null;localStorage.removeItem(MODE_KEY);render();};
}
function demoLogin(id){ state.demoSession={userId:id}; localStorage.setItem(DEMO_SESSION_KEY,JSON.stringify(state.demoSession)); state.tab='tasks'; render(); }
function demoLogout(){ localStorage.removeItem(DEMO_SESSION_KEY);state.demoSession=null;render(); }

// ---------- UI ----------
function nav(id,icon,label){return `<button class="navitem ${state.tab===id?'active':''}" data-tab="${id}"><i>${icon}</i>${label}</button>`;}
function chip(id,label){return `<button class="chip ${state.filter===id?'active':''}" data-filter="${id}">${label}</button>`;}
function render(){
  if(state.loading)return;
  const c=cloudConfig();
  if(!state.mode){ const saved=localStorage.getItem(MODE_KEY); if(saved==='cloud'&&c)state.mode='cloud'; else if(saved==='demo')state.mode='demo'; }
  if(state.mode==='cloud'){
    if(!c){state.mode=null;localStorage.removeItem(MODE_KEY);return renderSetup();}
    if(!state.auth){try{state.auth=JSON.parse(localStorage.getItem(AUTH_KEY));}catch(e){} }
    if(!state.auth?.access_token) return state.modal==='cloudSetup'?renderOverlayOn(renderCloudLogin,renderCloudSetupModal):renderCloudLogin();
    if(!state.db){loadCloudDB();return;}
  }
  if(state.mode==='demo'){
    if(!state.db)state.db=loadDemoDB();
    if(!state.demoSession){try{state.demoSession=JSON.parse(localStorage.getItem(DEMO_SESSION_KEY));}catch(e){} }
    if(!state.demoSession)return renderDemoLogin();
  }
  if(!state.mode)return state.modal==='cloudSetup'?renderOverlayOn(renderSetup,renderCloudSetupModal):renderSetup();
  const u=currentUser(); if(!u){if(state.mode==='cloud'){localStorage.removeItem(AUTH_KEY);state.auth=null;state.db=null;return renderCloudLogin();}state.demoSession=null;return renderDemoLogin();}
  const open=state.db.tasks.filter(t=>t.status==='open').length, prog=state.db.tasks.filter(t=>t.status==='in_progress').length, rev=state.db.tasks.filter(t=>t.status==='review').length, urg=state.db.tasks.filter(t=>t.priority==='urgent'&&t.status!=='done').length;
  app.innerHTML=`<div class="app"><header class="topbar"><div class="topbar-inner"><div class="brand"><div class="sigil"><b>I</b></div><div><h1>IMPERIUM</h1><small><b class="latin-motto">Ad gloriam Imperatoris Nikitae</b><span>Na chwałę Imperatora Nikity</span></small></div></div><div class="top-actions"><span class="${state.mode==='cloud'?'cloud-state':'cloud-state offline'}">${state.mode==='cloud'?'☁ ONLINE':'DEMO'}</span><span class="coin-badge">🪙 ${coinBalance(u.id)} NK</span><span class="badge">${u.role==='admin'?'ADMIN':'PRACOWNIK'}</span>${u.role==='admin'?'<button class="goldbtn" id="new-task">+ Zadanie</button>':''}<button class="iconbtn" id="logout" title="Wyloguj">↪</button></div></div></header>
  <main class="content">${state.tab==='tasks'?renderTasksPage(open,prog,rev,urg,u):''}${state.tab==='locations'?renderLocationsPage():''}${state.tab==='activity'?renderActivityPage():''}${state.tab==='chat'?renderChatPage():''}${state.tab==='team'?renderTeamPage():''}${state.tab==='settings'?renderSettingsPage():''}</main>
  <nav class="bottomnav"><div class="bottomnav-inner">${nav('tasks','▦','Zadania')}${nav('locations','⌖','Obiekty')}${nav('activity','◴','Aktywność')}${nav('chat','💬','Czat')}${nav('team','♟','Zespół')}${nav('settings','⚙','Ustawienia')}</div></nav>${renderModal()}</div>`;
  bind();
}
function renderOverlayOn(baseFn,modalFn){ baseFn(); app.insertAdjacentHTML('beforeend',modalFn()); bindCloudSetup(); }
function renderChatPage(){
  const u=currentUser();

  return `
    <section class="chat-page">

      <div class="hero">
        <div class="hero-card">
          <div class="eyebrow">IMPERIUM COMMUNICATIONS</div>
          <h2>💬 Czat główny</h2>
          <p>Wspólny kanał komunikacji wszystkich pracowników IMPERIUM.</p>
        </div>
      </div>

      <div class="panel chat-panel">

        <div class="chat-header">
          <div>
            <div class="eyebrow">Kanał ogólny</div>
            <h3>IMPERIUM</h3>
          </div>
          <span class="cloud-state">● ONLINE</span>
        </div>

        <div id="chat-messages" class="chat-messages">
          <div class="empty">
            Ładowanie wiadomości…
          </div>
        </div>

        <div class="chat-compose">
          <textarea
            id="chat-input"
            maxlength="2000"
            rows="2"
            placeholder="Napisz wiadomość, ${esc(u.name)}…"
          ></textarea>

          <button
            class="goldbtn"
            id="chat-send"
            type="button"
          >
            Wyślij ➤
          </button>
        </div>

      </div>

    </section>
  `;
}
  async function loadChatMessages(){
  if(state.mode!=='cloud') return;

  const box=document.getElementById('chat-messages');
  if(!box)return;

  try{
    const rows=await pgGet(
      'chat_messages',
      'select=id,user_id,message,created_at&order=created_at.asc&limit=200'
    );

    box.innerHTML=rows.length
      ? rows.map(m=>{
          const author=getUser(m.user_id);
          const mine=m.user_id===currentUser()?.id;

          return `
            <div class="chat-message ${mine?'mine':''}">
              <div class="chat-message-head">
                <b>${esc(author?.name||'Pracownik')}</b>
                <span>${new Date(m.created_at).toLocaleString('pl-PL')}</span>
              </div>
              <div class="chat-message-text">${esc(m.message)}</div>
            </div>
          `;
        }).join('')
      : '<div class="empty">Brak wiadomości. Rozpocznij rozmowę 👑</div>';

    box.scrollTop=box.scrollHeight;

  }catch(e){
    box.innerHTML=`<div class="status-note danger-text">Błąd czatu: ${esc(e.message)}</div>`;
  }
}

async function sendChatMessage(){
  if(state.mode!=='cloud'){
    toast('Czat działa we wspólnej bazie.');
    return;
  }

  const input=document.getElementById('chat-input');
  if(!input)return;

  const message=input.value.trim();
  if(!message)return;

  const button=document.getElementById('chat-send');
  if(button)button.disabled=true;

  try{
    await pgPost('chat_messages',{
      user_id:currentUser().id,
      message
    });

    input.value='';
    await loadChatMessages();

  }catch(e){
    toast(`Nie udało się wysłać: ${e.message}`);

  }finally{
    if(button)button.disabled=false;
    input.focus();
  }
}
  function renderTasksPage(open,prog,rev,urg,u){
  let tasks=[...state.db.tasks];
  if(u.role!=='admin')tasks=tasks.filter(t=>u.locationIds.includes(t.locationId));
  if(state.filter!=='all')tasks=tasks.filter(t=>state.filter==='mine'?t.claimedBy===u.id&&t.status!=='done':t.status===state.filter);
  tasks.sort((a,b)=>({urgent:0,high:1,normal:2}[a.priority]-{urgent:0,high:1,normal:2}[b.priority])||(new Date(b.createdAt)-new Date(a.createdAt)));
  const noLoc=u.role!=='admin'&&u.locationIds.length===0?'<div class="status-note">Twoje konto jest aktywne, ale administrator nie przypisał jeszcze żadnego obiektu. Po przypisaniu zadania pojawią się tutaj automatycznie.</div>':'';
  return `${noLoc}<section class="hero"><div class="hero-card"><div class="eyebrow">Centrum dowodzenia</div><h2>Dzień dobry, ${esc(u.name)}</h2><p>${u.role==='admin'?'Edytuj zadania i obiekty, kontroluj czas, raporty oraz dokumentację.':'Przejmij zadanie, wykonaj je i prześlij raport ze zdjęciami, wideo lub dokumentami.'}</p></div><div class="stats"><div class="stat"><b>${open}</b><span>Nowe</span></div><div class="stat"><b>${prog}</b><span>W toku</span></div><div class="stat"><b>${rev}</b><span>Do akceptacji</span></div><div class="stat"><b>${urg}</b><span>Pilne</span></div></div></section>
  <div class="toolbar"><div><div class="eyebrow">Operacje</div><h2 class="section-title">Zadania</h2></div><div class="filters">${chip('all','Wszystkie')}${chip('open','Nowe')}${chip('in_progress','W toku')}${chip('review','Akceptacja')}${chip('mine','Moje')}${chip('done','Zakończone')}</div></div><div class="grid">${tasks.length?tasks.map(t=>taskCard(t,u)).join(''):'<div class="empty">Brak zadań w tym widoku.</div>'}</div>`;
}
function taskCard(t,u){
  const loc=getLoc(t.locationId),owner=getUser(t.claimedBy),rem=t.deadlineAt?new Date(t.deadlineAt)-Date.now():null,statusClass=t.status==='in_progress'?'progress':t.status==='review'?'review':t.status==='done'?'done':'';
  const claimable=t.status==='open'&&(u.role==='admin'||u.locationIds.includes(t.locationId));
  const fileCount=(t.attachments?.length||0)+(t.report?.attachments?.length||0);
  return `<article class="task" data-task="${t.id}"><div class="task-head"><div><div class="location">⌖ ${esc(loc?.name||'')}</div><h3>${esc(t.title)}</h3></div><span class="pill ${t.priority}">${priorityLabel(t.priority)}</span></div><p class="desc">${esc(t.description||'Brak opisu.')}</p>${t.sanctionType&&t.sanctionType!=='none'?`<div class="task-sanction">⚠ ${esc(sanctionLabel(t.sanctionType))}${t.sanctionText?`: ${esc(t.sanctionText)}`:''}</div>`:''}<div class="meta"><span class="pill ${statusClass}">${taskStatusLabel(t.status)}</span><span class="pill">⏱ ${t.durationMin} min</span>${t.rewardCoins?`<span class="pill coin-plus">🪙 +${t.rewardCoins} NK</span>`:''}${t.penaltyCoins?`<span class="pill coin-minus">−${t.penaltyCoins} NK</span>`:''}${t.notes?'<span class="pill">📝 Uwagi</span>':''}${t.sanctionType&&t.sanctionType!=='none'?'<span class="pill sanction-pill">⚠ Sankcja</span>':''}${fileCount?`<span class="pill">📎 ${fileCount}</span>`:''}</div>${t.status==='in_progress'||t.status==='review'?`<div class="timer ${rem<0?'over':''}" data-deadline="${t.deadlineAt||''}">${t.status==='review'?'RAPORT WYSŁANY':duration(rem||0)}</div>`:''}<div class="task-footer"><div class="owner">${owner?'Wykonawca':'Nieprzydzielone'}<b>${owner?esc(owner.name):'—'}</b></div><div class="task-actions">${claimable?'<button class="smallbtn gold" data-action="claim">Przejmij</button>':''}${t.status==='in_progress'&&t.claimedBy===u.id?'<button class="smallbtn gold" data-action="report">Raport</button>':''}<button class="smallbtn" data-action="detail">Szczegóły</button></div></div></article>`;
}
function renderLocationsPage(){
  const visible=isAdmin()?state.db.locations:state.db.locations.filter(l=>currentUser().locationIds.includes(l.id));
  return `<div class="toolbar"><div><div class="eyebrow">Struktura</div><h2 class="section-title">Obiekty / lokalizacje</h2></div>${isAdmin()?'<button class="goldbtn" id="add-location">+ Obiekt</button>':''}</div><div class="list">${visible.map(l=>{const count=state.db.tasks.filter(t=>t.locationId===l.id&&t.status!=='done').length;return `<div class="row"><div class="row-left"><div class="avatar">${initials(l.name)}</div><div class="row-main"><b>${esc(l.name)}</b><small>${esc([l.city,l.address].filter(Boolean).join(' • ')||'Brak adresu')}</small>${l.description?`<div class="subtle">${esc(l.description)}</div>`:''}</div></div><div class="row-actions"><span class="badge">${count} aktywne</span>${isAdmin()?`<button class="smallbtn" data-edit-location="${l.id}">Edytuj</button>`:''}</div></div>`}).join('')||'<div class="empty">Brak obiektów.</div>'}</div>`;
}
function renderActivityPage(){return `<div class="toolbar"><div><div class="eyebrow">Dziennik</div><h2 class="section-title">Aktywność</h2></div></div><div class="settings-card">${state.db.events.slice(0,100).map(e=>`<div class="activity"><p>${esc(e.text)}</p><small>${fmtDate(e.createdAt)}</small></div>`).join('')||'<div class="empty">Brak zdarzeń.</div>'}</div>`;}
function renderTeamPage(){
  return `<div class="toolbar"><div><div class="eyebrow">Ludzie</div><h2 class="section-title">Zespół</h2></div>${isAdmin()&&state.mode==='demo'?'<button class="goldbtn" id="add-user">+ Pracownik</button>':''}</div>${isAdmin()&&state.mode==='cloud'?'<div class="status-note">Nowy pracownik instaluje ten sam APK i wybiera „Utwórz konto pracownika”. Potem tutaj przypisujesz mu obiekty i możesz otworzyć jego kartę pracy.</div>':''}<div class="list">${state.db.users.map(u=>{const st=workerStats(u.id,'all');return `<div class="row"><div class="row-left"><div class="avatar">${initials(u.name)}</div><div class="row-main"><b>${esc(u.name)} ${u.active?'':'(nieaktywny)'}</b><small>${u.role==='admin'?'Administrator':'Pracownik'} • ${u.locationIds.map(id=>getLoc(id)?.name).filter(Boolean).join(', ')||'bez obiektów'}</small><div class="mini-metrics">${isAdmin()||u.id===currentUser().id?`<span class="coin-mini">🪙 ${coinBalance(u.id)} NK</span>`:''}<span>✓ ${st.done}</span><span class="${st.late?'metric-bad':''}">⏱ ${st.late} po terminie</span><span class="${st.warnings+st.reprimands?'metric-bad':''}">⚠ ${st.records.length} wpisów</span></div></div></div><div class="row-actions">${isAdmin()||u.id===currentUser().id?`<button class="smallbtn gold" data-worker-card="${u.id}">Karta</button>`:''}${isAdmin()?`<button class="smallbtn" data-edit-user="${u.id}">Edytuj</button>`:''}</div></div>`}).join('')}</div>`;
}
function renderSettingsPage(){
  const u=currentUser(),code=state.mode==='cloud'?configCode():'';
  return `<div class="toolbar"><div><div class="eyebrow">System</div><h2 class="section-title">Ustawienia</h2></div></div>
  <div class="settings-card"><h3>Tryb danych</h3><p>${state.mode==='cloud'?'☁ Wspólna baza Supabase — dane i pliki są synchronizowane między telefonami.':'⚙ Demo lokalne — dane są tylko na tym urządzeniu.'}</p>${state.cloudError?`<div class="status-note danger-text">${esc(state.cloudError)}</div>`:''}</div>
  ${state.mode==='cloud'?`<div class="settings-card"><h3>Kod konfiguracji dla zespołu</h3><p>Jeśli APK nie ma jeszcze wbudowanego adresu bazy, wyślij pracownikowi ten kod razem z APK. Po wbudowaniu konfiguracji ten krok nie będzie potrzebny.</p><div class="codebox" id="cfg-code">${esc(code)}</div><div style="margin-top:10px"><button class="smallbtn gold" id="copy-code">Kopiuj kod</button> ${!(BASE_CFG.DEFAULT_SUPABASE_URL&&BASE_CFG.DEFAULT_SUPABASE_ANON_KEY)?'<button class="smallbtn" id="server-settings">Serwer</button>':''}</div></div>`:''}
  <div class="settings-card"><h3>Powiadomienia</h3><p>Powiadomienia o zmianach są wyświetlane podczas pracy aplikacji. Android wrapper ma również natywny kanał powiadomień.</p><div style="margin-top:12px"><button class="smallbtn gold" id="enable-notifications">Włącz powiadomienia</button></div></div>
  <div class="settings-card"><h3>Konto</h3><p>${esc(u.name)} • ${u.role==='admin'?'administrator':'pracownik'}</p><div style="margin-top:12px">${state.mode==='demo'?'<button class="dangerbtn" id="reset-demo">Przywróć dane demo</button>':'<button class="dangerbtn" id="cloud-logout">Wyloguj</button>'}</div></div>`;
}

function renderWorkerCard(){
  const u=state.db.users.find(x=>x.id===state.userId); if(!u)return '';
  const st=workerStats(u.id), period=state.workerPeriod, balance=coinBalance(u.id);
  const tasks=[...st.tasks].sort((a,b)=>new Date(b.claimedAt||b.createdAt)-new Date(a.claimedAt||a.createdAt));
  const records=[...st.records].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const coins=[...coinTxFor(u.id,period)].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const completion=st.total?Math.round(st.done/st.total*100):0;
  const taskRows=tasks.map(t=>`<button class="history-row" data-history-task="${t.id}"><span><b>${esc(t.title)}</b><small>${esc(getLoc(t.locationId)?.name||'')} • ${fmtDate(t.claimedAt||t.createdAt)}</small></span><span class="history-right"><em class="${taskLate(t)?'late-text':''}">${taskLate(t)?'PO TERMINIE':taskStatusLabel(t.status)}</em>${t.rewardCoins?`<small class="coin-text">+${t.rewardCoins} NK</small>`:''}${t.reworkCount?`<small>${t.reworkCount}× poprawka</small>`:''}</span></button>`).join('')||'<div class="empty compact">Brak zadań w wybranym okresie.</div>';
  const recRows=records.map(r=>{const t=state.db.tasks.find(x=>x.id===r.taskId);return `<div class="discipline-entry ${r.type}"><div><b>${esc(disciplineLabel(r.type))}</b><small>${fmtDate(r.createdAt)}${t?` • ${esc(t.title)}`:''}</small></div><p>${esc(r.description)}</p>${isAdmin()?`<button class="smallbtn" data-delete-discipline="${r.id}">Usuń wpis</button>`:''}</div>`}).join('')||'<div class="empty compact">Brak uwag i sankcji w wybranym okresie.</div>';
  const coinRows=coins.map(c=>{const t=state.db.tasks.find(x=>x.id===c.taskId);return `<div class="coin-entry ${c.amount<0?'negative':'positive'}"><div><b>${fmtCoins(c.amount)}</b><span>${esc(coinKindLabel(c.kind))}</span></div><p>${esc(c.description||'Bez opisu')}</p><small>${fmtDate(c.createdAt)}${t?` • ${esc(t.title)}`:''}</small></div>`}).join('')||'<div class="empty compact">Brak operacji Nikitocoinów w wybranym okresie.</div>';
  return `<div class="modal-bg"><div class="modal worker-card-modal"><div class="worker-card-head"><div class="avatar big">${initials(u.name)}</div><div><h2>${esc(u.name)}</h2><div class="modal-sub">${u.role==='admin'?'Administrator':'Pracownik'} • ${u.active?'aktywny':'nieaktywny'}</div></div><div class="coin-wallet"><small>IMPERATORSKIE NIKITOCOINY</small><b>🪙 ${balance} NK</b></div></div><div class="period-tabs"><button class="chip ${period==='30'?'active':''}" data-worker-period="30">30 dni</button><button class="chip ${period==='90'?'active':''}" data-worker-period="90">90 dni</button><button class="chip ${period==='365'?'active':''}" data-worker-period="365">Rok</button><button class="chip ${period==='all'?'active':''}" data-worker-period="all">Wszystko</button></div><div class="worker-stats"><div><b>${st.done}</b><span>Wykonane</span></div><div><b>${st.active}</b><span>Aktywne</span></div><div class="${st.late?'bad-stat':''}"><b>${st.late}</b><span>Po terminie</span></div><div><b>${st.reworks}</b><span>Do poprawy</span></div><div><b>${st.notes}</b><span>Uwagi</span></div><div class="${st.warnings+st.reprimands?'bad-stat':''}"><b>${st.warnings+st.reprimands}</b><span>Ostrz./upomn.</span></div></div><div class="performance-line"><span>Realizacja zakończonych</span><b>${completion}%</b></div><div class="section-split"><div><div class="subheading">Historia zadań</div>${taskRows}</div><div><div class="subheading">Uwagi i sankcje</div>${recRows}</div></div><div class="subheading" style="margin-top:16px">Portfel Nikitocoinów</div><div class="coin-ledger">${coinRows}</div><div class="status-note">Nikitocoiny są wewnętrznymi punktami IMPERIUM i nie stanowią automatycznego potrącenia ani składnika wynagrodzenia.</div><div class="modal-actions"><button class="ghost" data-close>Zamknij</button>${isAdmin()?'<button class="ghost" id="adjust-coins">± Nikitocoiny</button><button class="goldbtn" id="add-discipline">+ Dodaj uwagę / sankcję</button>':''}</div></div></div>`;
}
function renderDisciplineModal(){
  const u=state.db.users.find(x=>x.id===state.userId); if(!u)return '';
  const taskId=state.taskId||'';
  const tasks=state.db.tasks.filter(t=>t.claimedBy===u.id).sort((a,b)=>new Date(b.claimedAt||b.createdAt)-new Date(a.claimedAt||a.createdAt));
  return `<div class="modal-bg"><div class="modal"><h2>Nowy wpis — ${esc(u.name)}</h2><div class="modal-sub">Wpis trafia do historii pracownika. Sankcja zapisana wcześniej w treści zadania nie jest liczona jako zastosowana, dopóki nie dodasz jej tutaj.</div><div class="formgrid"><div class="field"><label>Rodzaj wpisu</label><select id="f-discipline-type"><option value="note">Uwaga</option><option value="warning">Ostrzeżenie</option><option value="reprimand">Upomnienie</option><option value="other">Inna</option></select></div><div class="field"><label>Powiązane zadanie</label><select id="f-discipline-task"><option value="">Bez zadania</option>${tasks.map(t=>`<option value="${t.id}" ${t.id===taskId?'selected':''}>${esc(t.title)}</option>`).join('')}</select></div></div><div class="field"><label>Treść / powód</label><textarea id="f-discipline-desc" placeholder="Np. niewykonanie zadania w terminie, brak wymaganej dokumentacji, ustalenia z pracownikiem…"></textarea></div><div class="status-note">To jest zapis ewidencyjny. Aplikacja nie potrąca wynagrodzenia ani automatycznie nie nakłada kar finansowych.</div><div class="modal-actions"><button class="ghost" id="back-worker-card">Wróć</button><button class="goldbtn" id="save-discipline">Zapisz wpis</button></div></div></div>`;
}

function renderCoinModal(){
  const u=state.db.users.find(x=>x.id===state.userId); if(!u)return '';
  return `<div class="modal-bg"><div class="modal"><h2>Nikitocoiny — ${esc(u.name)}</h2><div class="modal-sub">Aktualny stan: 🪙 ${coinBalance(u.id)} NK. Dodatnia liczba dodaje punkty, ujemna je odejmuje.</div><div class="formgrid"><div class="field"><label>Zmiana salda</label><input id="f-coin-amount" type="number" step="1" placeholder="Np. 25 albo -15"></div><div class="field"><label>Powiązane zadanie (opcjonalnie)</label><select id="f-coin-task"><option value="">Bez zadania</option>${state.db.tasks.filter(t=>t.claimedBy===u.id).map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></div></div><div class="field"><label>Powód</label><textarea id="f-coin-desc" placeholder="Np. bonus za wyjątkowo dobre wykonanie, pomoc innemu pracownikowi, korekta salda…"></textarea></div><div class="status-note">To są punkty wewnętrzne IMPERIUM. Nie powodują automatycznej zmiany wypłaty.</div><div class="modal-actions"><button class="ghost" id="back-worker-card">Wróć</button><button class="goldbtn" id="save-coin-adjustment">Zapisz operację</button></div></div></div>`;
}

function renderModal(){
  if(!state.modal)return '';
  if(state.modal==='cloudSetup')return renderCloudSetupModal();
  if(state.modal==='workerCard')return renderWorkerCard();
  if(state.modal==='addDiscipline')return renderDisciplineModal();
  if(state.modal==='coinAdjust')return renderCoinModal();
  const close='<button class="ghost" data-close>Anuluj</button>';
  if(state.modal==='newTask'||state.modal==='editTask'){
    const edit=state.modal==='editTask',t=edit?state.db.tasks.find(x=>x.id===state.taskId):null;
    return `<div class="modal-bg"><div class="modal"><h2>${edit?'Edytuj zadanie':'Nowe zadanie'}</h2><div class="modal-sub">${edit?'Możesz zmienić treść, obiekt, priorytet, czas oraz dodać nowe pliki.':'Utwórz zadanie i opcjonalnie dołącz dokumentację.'}</div><div class="field"><label>Tytuł</label><input id="f-title" maxlength="120" value="${esc(t?.title||'')}" placeholder="Np. Sprawdzić ogrzewanie"></div><div class="field"><label>Opis</label><textarea id="f-desc" placeholder="Co dokładnie trzeba zrobić?">${esc(t?.description||'')}</textarea></div><div class="field"><label>Uwagi i wymagania</label><textarea id="f-notes" placeholder="Np. wymagane zdjęcie przed i po, kolejność prac, dodatkowe warunki…">${esc(t?.notes||'')}</textarea></div><div class="formgrid"><div class="field"><label>Obiekt</label><select id="f-loc">${state.db.locations.filter(l=>l.active||l.id===t?.locationId).map(l=>`<option value="${l.id}" ${l.id===t?.locationId?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Przypisz pracownika</label><select id="f-assignee"><option value="">Nieprzydzielone — pracownik może przejąć</option>${state.db.users.filter(u=>u.role==='worker'&&u.active!==false).map(u=>`<option value="${u.id}" ${t?.claimedBy===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div><div class="field"><label>Priorytet</label><select id="f-priority"><option value="normal" ${t?.priority==='normal'?'selected':''}>Normalne</option><option value="high" ${t?.priority==='high'?'selected':''}>Wysoki</option><option value="urgent" ${t?.priority==='urgent'?'selected':''}>Pilne</option></select></div></div><div class="field"><label>Czas na wykonanie (minuty)</label><input id="f-duration" type="number" min="5" max="10080" value="${t?.durationMin||60}"></div><div class="coin-task-box"><div class="subheading">🪙 Imperatorskie Nikitocoiny</div><div class="formgrid"><div class="field"><label>Nagroda za wykonanie</label><input id="f-reward-coins" type="number" min="0" max="100000" value="${t?.rewardCoins||0}" placeholder="Np. 50"></div><div class="field"><label>Odjęcie za niewykonanie</label><input id="f-penalty-coins" type="number" min="0" max="100000" value="${t?.penaltyCoins||0}" placeholder="Np. 25"></div></div><small class="subtle">Nagroda jest naliczana po akceptacji zadania. Odjęcie następuje dopiero po decyzji administratora „Niewykonane”.</small></div><div class="formgrid"><div class="field"><label>Rodzaj sankcji za niewykonanie / opóźnienie</label><select id="f-sanction-type"><option value="none" ${!t?.sanctionType||t?.sanctionType==='none'?'selected':''}>Brak</option><option value="note" ${t?.sanctionType==='note'?'selected':''}>Uwaga</option><option value="warning" ${t?.sanctionType==='warning'?'selected':''}>Ostrzeżenie</option><option value="reprimand" ${t?.sanctionType==='reprimand'?'selected':''}>Upomnienie</option><option value="other" ${t?.sanctionType==='other'?'selected':''}>Inna</option></select></div><div class="field"><label>Opis sankcji / konsekwencji</label><input id="f-sanction-text" maxlength="300" value="${esc(t?.sanctionText||'')}" placeholder="Np. obowiązek złożenia wyjaśnienia"></div></div><div class="field"><label>Adnotacja administratora / uwaga służbowa</label><textarea id="f-disciplinary" placeholder="Np. powód niewykonania, ustalenia po terminie, uwaga do pracownika…">${esc(t?.disciplinaryNote||'')}</textarea></div><div class="status-note">Sankcja jest informacją przypisaną do zadania. IMPERIUM nie potrąca automatycznie wynagrodzenia ani nie nakłada kar finansowych.</div><div class="field"><label>Dodaj zdjęcia, wideo lub dokumenty</label><button class="ghost" id="pick-files">+ Wybierz pliki</button><div class="attachments" id="file-list"></div><small class="subtle">Limit ${BASE_CFG.MAX_ATTACHMENT_MB||50} MB na plik.</small></div>${edit&&t?.status!=='open'?'<div class="status-note">Zmiana czasu bazowego nie zeruje bieżącego odliczania. Termin możesz przedłużyć osobno w szczegółach.</div>':''}<div class="modal-actions">${edit?'<button class="dangerbtn" id="delete-task">Usuń</button>':''}${close}<button class="goldbtn" id="save-task">${edit?'Zapisz zmiany':'Utwórz zadanie'}</button></div></div></div>`;
  }
  if(state.modal==='report'){
    const t=state.db.tasks.find(x=>x.id===state.taskId);
    return `<div class="modal-bg"><div class="modal"><h2>Raport z wykonania</h2><div class="modal-sub">${esc(t.title)} • ${esc(getLoc(t.locationId)?.name)}</div>${t.notes?`<div class="detail-block note-block"><strong>Uwagi i wymagania</strong><p>${esc(t.notes)}</p></div>`:''}${t.rewardCoins?`<div class="detail-block coin-task-reward"><strong>🪙 Nagroda za wykonanie</strong><p>+${t.rewardCoins} Nikitocoinów po akceptacji zadania.</p></div>`:''}${t.sanctionType&&t.sanctionType!=='none'?`<div class="detail-block sanction-block"><strong>Sankcja / konsekwencje</strong><p>${esc(sanctionLabel(t.sanctionType))}${t.sanctionText?` — ${esc(t.sanctionText)}`:''}</p></div>`:''}<div class="field"><label>Opis wykonanych prac</label><textarea id="f-report" placeholder="Co zostało zrobione, co wymaga uwagi..."></textarea></div><div class="field"><label>Zdjęcia, wideo i dokumenty</label><button class="ghost" id="pick-files">+ Dodaj pliki</button><div class="attachments" id="file-list"></div><small class="subtle">Pliki w trybie chmurowym trafiają do wspólnego Storage.</small></div><div class="modal-actions">${close}<button class="goldbtn" id="submit-report">Wyślij raport</button></div></div></div>`;
  }
  if(state.modal==='detail'){
    const t=state.db.tasks.find(x=>x.id===state.taskId),owner=getUser(t.claimedBy),u=currentUser(),rem=t.deadlineAt?new Date(t.deadlineAt)-Date.now():null;
    return `<div class="modal-bg"><div class="modal"><h2>${esc(t.title)}</h2><div class="modal-sub">${esc(getLoc(t.locationId)?.name)} • ${taskStatusLabel(t.status)} • ${priorityLabel(t.priority)}</div><div class="detail-block"><strong>Opis</strong><p>${esc(t.description||'Brak opisu.')}</p></div>${t.notes?`<div class="detail-block note-block"><strong>Uwagi i wymagania</strong><p>${esc(t.notes)}</p></div>`:''}${t.sanctionType&&t.sanctionType!=='none'?`<div class="detail-block sanction-block"><strong>⚠ Sankcja za niewykonanie / opóźnienie</strong><p><b>${esc(sanctionLabel(t.sanctionType))}</b>${t.sanctionText?` — ${esc(t.sanctionText)}`:''}</p></div>`:''}${t.disciplinaryNote?`<div class="detail-block disciplinary-block"><strong>Adnotacja administratora / uwaga służbowa</strong><p>${esc(t.disciplinaryNote)}</p></div>`:''}<div class="coin-summary"><div><small>NAGRODA</small><b>🪙 +${t.rewardCoins||0} NK</b></div><div><small>NIEWYKONANIE</small><b class="negative">−${t.penaltyCoins||0} NK</b></div></div><div class="formgrid"><div class="detail-block"><strong>Wykonawca</strong><p>${owner?esc(owner.name):'Nieprzydzielone'}</p></div><div class="detail-block"><strong>Czas</strong><p>${t.deadlineAt?`Pozostało: <span data-deadline="${t.deadlineAt}">${duration(rem)}</span>`:`Limit: ${t.durationMin} min`}</p></div></div>${renderFilesBlock('Pliki do zadania',t.attachments||[])}${t.report?`<div class="detail-block"><strong>Raport</strong><p>${esc(t.report.text)}</p><small class="subtle">${fmtDate(t.report.submittedAt)}</small>${renderFilesBlock('Załączniki raportu',t.report.attachments||[],true)}</div>`:''}${t.comments?.length?`<div class="comments">${t.comments.map(c=>`<div class="comment">${esc(c.text)}<small>${esc(getUser(c.userId)?.name||'')} • ${fmtDate(c.createdAt)}</small></div>`).join('')}</div>`:''}${u.role==='admin'&&t.status==='in_progress'?`<div class="field"><label>Dodaj czas</label><div class="task-actions"><button class="smallbtn gold" data-extend="15">+15 min</button><button class="smallbtn gold" data-extend="30">+30 min</button><button class="smallbtn gold" data-extend="60">+60 min</button></div></div>`:''}${u.role==='admin'&&t.status==='review'?`<div class="formgrid"><div class="field"><label>Komentarz administratora</label><textarea id="f-comment" placeholder="Komentarz do wykonania"></textarea></div><div class="field"><label>Bonus za wzorowe wykonanie (NK)</label><input id="f-bonus-coins" type="number" min="0" max="100000" value="0" placeholder="Np. 20"><small class="subtle">Do bazowej nagrody +${t.rewardCoins||0} NK</small></div></div>`:''}<div class="modal-actions">${close}${u.role==='admin'?`${owner?'<button class="ghost" id="discipline-from-task">+ Uwaga / sankcja</button>':''}<button class="ghost" id="edit-task">Edytuj</button>${t.status==='in_progress'?'<button class="ghost" id="reset-task">Zwolnij / jako nowe</button>':''}${owner&&t.penaltyCoins>0&&(t.status==='in_progress'||t.status==='review')?`<button class="dangerbtn" id="fail-task">Niewykonane −${t.penaltyCoins} NK</button>`:''}`:''}${u.role==='admin'&&t.status==='review'?'<button class="dangerbtn" id="reopen-task">Do poprawy</button><button class="goldbtn" id="accept-task">Akceptuj + NK</button>':''}</div></div></div>`;
  }
  if(state.modal==='newLocation'||state.modal==='editLocation'){
    const edit=state.modal==='editLocation',l=edit?state.db.locations.find(x=>x.id===state.locationId):null;
    return `<div class="modal-bg"><div class="modal"><h2>${edit?'Edytuj obiekt':'Nowy obiekt'}</h2><div class="field"><label>Nazwa</label><input id="f-locname" value="${esc(l?.name||'')}" placeholder="Nazwa obiektu"></div><div class="formgrid"><div class="field"><label>Miasto</label><input id="f-city" value="${esc(l?.city||'')}" placeholder="Miasto"></div><div class="field"><label>Adres</label><input id="f-address" value="${esc(l?.address||'')}" placeholder="Ulica / adres"></div></div><div class="field"><label>Opis / informacje</label><textarea id="f-locdesc" placeholder="Dodatkowe informacje o obiekcie">${esc(l?.description||'')}</textarea></div>${edit?`<label class="checkrow"><input id="f-locactive" type="checkbox" ${l?.active?'checked':''}> Obiekt aktywny</label>`:''}<div class="modal-actions">${close}<button class="goldbtn" id="save-location">${edit?'Zapisz':'Dodaj'}</button></div></div></div>`;
  }
  if(state.modal==='newUser')return `<div class="modal-bg"><div class="modal"><h2>Nowy pracownik demo</h2><div class="field"><label>Imię / nazwa</label><input id="f-username"></div><div class="field"><label>Obiekty</label><div class="checkbox-grid">${state.db.locations.map(l=>`<label class="checkrow"><input type="checkbox" name="userloc" value="${l.id}"> ${esc(l.name)}</label>`).join('')}</div></div><div class="modal-actions">${close}<button class="goldbtn" id="save-user">Dodaj</button></div></div></div>`;
  if(state.modal==='editUser'){
    const u=state.db.users.find(x=>x.id===state.userId);
    return `<div class="modal-bg"><div class="modal"><h2>Edytuj pracownika</h2><div class="field"><label>Imię / nazwa</label><input id="f-username" value="${esc(u.name)}"></div><div class="formgrid"><div class="field"><label>Rola</label><select id="f-role"><option value="worker" ${u.role==='worker'?'selected':''}>Pracownik</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrator</option></select></div><div class="field"><label>Status</label><select id="f-active"><option value="1" ${u.active?'selected':''}>Aktywny</option><option value="0" ${!u.active?'selected':''}>Nieaktywny</option></select></div></div><div class="field"><label>Przypisane obiekty</label><div class="checkbox-grid">${state.db.locations.map(l=>`<label class="checkrow"><input type="checkbox" name="userloc" value="${l.id}" ${u.locationIds.includes(l.id)?'checked':''}> ${esc(l.name)}</label>`).join('')}</div></div><div class="modal-actions">${close}<button class="goldbtn" id="save-user-edit">Zapisz</button></div></div></div>`;
  }
  return '';
}
function renderCloudSetupModal(){
  const c=cloudConfig();
  return `<div class="modal-bg"><div class="modal"><h2>Połączenie IMPERIUM</h2><div class="modal-sub">Jedna konfiguracja = jedna wspólna baza dla całego zespołu.</div><div class="field"><label>Supabase Project URL</label><input id="cloud-url" value="${esc(c?.url||'')}" placeholder="https://xxxxx.supabase.co"></div><div class="field"><label>Supabase anon / publishable key</label><textarea id="cloud-key" style="min-height:75px" placeholder="Klucz publiczny projektu">${esc(c?.key||'')}</textarea></div><div class="login-separator"><span>albo kod od administratora</span></div><div class="field"><label>Kod konfiguracji</label><textarea id="cloud-code" style="min-height:75px" placeholder="IMP1:..."></textarea></div><div class="modal-actions"><button class="ghost" data-close-cloud>Anuluj</button><button class="ghost" id="import-cloud-code">Wczytaj kod</button><button class="goldbtn" id="save-cloud">Zapisz i połącz</button></div></div></div>`;
}
function renderFilesBlock(title,files,nested=false){ if(!files?.length)return ''; const body=`<div class="filelist">${files.map(a=>`<div class="fileline"><span>📎 ${esc(a.name)} <small>${bytes(a.size)}</small></span><button class="smallbtn" data-file="${a.id}">Otwórz</button></div>`).join('')}</div>`; return nested?`<div style="margin-top:10px"><strong>${esc(title)}</strong>${body}</div>`:`<div class="detail-block"><strong>${esc(title)}</strong>${body}</div>`; }

function bindCloudSetup(){
  document.querySelector('[data-close-cloud]')?.addEventListener('click',()=>{state.modal=null;render();});
  document.getElementById('import-cloud-code')?.addEventListener('click',()=>{try{const c=parseConfigCode(document.getElementById('cloud-code').value);document.getElementById('cloud-url').value=c.url;document.getElementById('cloud-key').value=c.key;toast('Kod wczytany.');}catch(e){toast(e.message);}});
  document.getElementById('save-cloud')?.addEventListener('click',async()=>{try{saveCloudConfig(document.getElementById('cloud-url').value,document.getElementById('cloud-key').value);state.mode='cloud';state.modal=null;state.db=null;state.auth=null;localStorage.removeItem(AUTH_KEY);render();}catch(e){toast(e.message);}});
}
function bind(){if(state.tab==='chat'){
  setTimeout(()=>loadChatMessages(),0);
  if(window.imperiumChatTimer){
  clearInterval(window.imperiumChatTimer);
  window.imperiumChatTimer=null;
}
setTimeout(()=>{
  if(state.tab==='chat'){
    window.imperiumChatTimer=setInterval(()=>{
      if(state.tab==='chat' && document.visibilityState!=='hidden'){
        loadChatMessages();
      }
    },5000);
  }
},100);
  document.getElementById('chat-send')?.addEventListener('click',()=>{
    sendChatMessage();
  });

  document.getElementById('chat-input')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){
      e.preventDefault();
      sendChatMessage();
    }
  });
}
  if(state.modal==='cloudSetup'){bindCloudSetup();return;}
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;render();});
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{state.modal=null;state.taskId=null;state.locationId=null;state.userId=null;selectedFiles=[];fileInput.value='';render();});
  document.getElementById('logout')?.addEventListener('click',()=>state.mode==='cloud'?signOutCloud():demoLogout());
  document.getElementById('new-task')?.addEventListener('click',()=>{selectedFiles=[];state.modal='newTask';render();});
  document.getElementById('add-location')?.addEventListener('click',()=>{state.modal='newLocation';render();});
  document.getElementById('add-user')?.addEventListener('click',()=>{state.modal='newUser';render();});
  document.querySelectorAll('[data-edit-location]').forEach(b=>b.onclick=()=>{state.locationId=b.dataset.editLocation;state.modal='editLocation';render();});
  document.querySelectorAll('[data-edit-user]').forEach(b=>b.onclick=()=>{state.userId=b.dataset.editUser;state.modal='editUser';render();});
  document.querySelectorAll('[data-worker-card]').forEach(b=>b.onclick=()=>{state.userId=b.dataset.workerCard;state.workerPeriod='all';state.modal='workerCard';render();});
  document.querySelectorAll('[data-worker-period]').forEach(b=>b.onclick=()=>{state.workerPeriod=b.dataset.workerPeriod;render();});
  document.querySelectorAll('[data-history-task]').forEach(b=>b.onclick=()=>{state.taskId=b.dataset.historyTask;state.modal='detail';render();});
  document.querySelectorAll('[data-delete-discipline]').forEach(b=>b.onclick=()=>deleteDiscipline(b.dataset.deleteDiscipline));
  document.getElementById('add-discipline')?.addEventListener('click',()=>{state.taskId=null;state.modal='addDiscipline';render();});
  document.getElementById('adjust-coins')?.addEventListener('click',()=>{state.modal='coinAdjust';render();});
  document.getElementById('save-coin-adjustment')?.addEventListener('click',saveCoinAdjustment);
  document.getElementById('back-worker-card')?.addEventListener('click',()=>{state.taskId=null;state.modal='workerCard';render();});
  document.getElementById('save-discipline')?.addEventListener('click',saveDiscipline);
  document.getElementById('save-task')?.addEventListener('click',saveTaskFromForm);
  document.getElementById('delete-task')?.addEventListener('click',deleteTask);
  document.getElementById('save-location')?.addEventListener('click',saveLocationFromForm);
  document.getElementById('save-user')?.addEventListener('click',addDemoUser);
  document.getElementById('save-user-edit')?.addEventListener('click',saveUserEdit);
  document.getElementById('pick-files')?.addEventListener('click',()=>fileInput.click());
  document.getElementById('submit-report')?.addEventListener('click',submitReport);
  document.getElementById('accept-task')?.addEventListener('click',()=>reviewTask(true));
  document.getElementById('reopen-task')?.addEventListener('click',()=>reviewTask(false));
  document.getElementById('edit-task')?.addEventListener('click',()=>{state.modal='editTask';selectedFiles=[];render();});
  document.getElementById('discipline-from-task')?.addEventListener('click',()=>{const t=state.db.tasks.find(x=>x.id===state.taskId);if(!t?.claimedBy)return toast('Najpierw zadanie musi mieć wykonawcę.');state.userId=t.claimedBy;state.modal='addDiscipline';render();});
  document.getElementById('reset-task')?.addEventListener('click',resetTask);
  document.getElementById('fail-task')?.addEventListener('click',failTask);
  document.querySelectorAll('[data-extend]').forEach(b=>b.onclick=()=>extendTask(Number(b.dataset.extend)));
  document.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>openAttachment(b.dataset.file));
  document.querySelectorAll('.task [data-action]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=e.currentTarget.closest('.task').dataset.task,a=e.currentTarget.dataset.action;if(a==='claim')claimTask(id);if(a==='report'){state.taskId=id;state.modal='report';selectedFiles=[];render();}if(a==='detail'){state.taskId=id;state.modal='detail';render();}});
  document.querySelectorAll('.task').forEach(card=>card.onclick=e=>{if(e.target.closest('button'))return;state.taskId=card.dataset.task;state.modal='detail';render();});
  document.getElementById('enable-notifications')?.addEventListener('click',async()=>{if(window.AndroidBridge?.requestNotificationPermission){try{window.AndroidBridge.requestNotificationPermission();toast('Poproszono Androida o zgodę.');return;}catch(e){}}if(!('Notification' in window))return toast('Powiadomienia przeglądarkowe są niedostępne.');const p=await Notification.requestPermission();toast(p==='granted'?'Powiadomienia włączone.':'Brak zgody.');});
  document.getElementById('reset-demo')?.addEventListener('click',()=>{state.db=seed();saveDemoDB();toast('Dane demo przywrócone.');render();});
  document.getElementById('copy-code')?.addEventListener('click',async()=>{const code=configCode();try{await navigator.clipboard.writeText(code);toast('Kod skopiowany.');}catch(e){toast('Przytrzymaj kod i skopiuj go ręcznie.');}});
  document.getElementById('server-settings')?.addEventListener('click',()=>{state.modal='cloudSetup';render();});
  document.getElementById('cloud-logout')?.addEventListener('click',signOutCloud);
  updateTimers();
}

// ---------- Operations ----------
async function withAction(label,fn){
  try{setLoading(true,label);await fn();state.loading=false;render();}catch(e){state.loading=false;render();toast(e.message||'Wystąpił błąd.');}
}
function readTaskForm(){
  const title=document.getElementById('f-title').value.trim();if(!title)throw new Error('Wpisz tytuł zadania.');
  return {title,description:document.getElementById('f-desc').value.trim(),notes:document.getElementById('f-notes').value.trim(),sanctionType:document.getElementById('f-sanction-type').value,sanctionText:document.getElementById('f-sanction-text').value.trim(),disciplinaryNote:document.getElementById('f-disciplinary').value.trim(),rewardCoins:Math.max(0,Math.floor(Number(document.getElementById('f-reward-coins').value)||0)),penaltyCoins:Math.max(0,Math.floor(Number(document.getElementById('f-penalty-coins').value)||0)),locationId:document.getElementById('f-loc').value,priority:document.getElementById('f-priority').value,durationMin:Math.max(5,Number(document.getElementById('f-duration').value)||60),assignedTo:document.getElementById('f-assignee')?.value||null};
}
async function saveTaskFromForm(){
  let v;try{v=readTaskForm();}catch(e){return toast(e.message);} const edit=state.modal==='editTask',id=state.taskId;
  await withAction(edit?'Zapisywanie zmian…':'Tworzenie zadania…',async()=>{
    if(state.mode==='demo'){
      if(edit){const t=state.db.tasks.find(x=>x.id===id);Object.assign(t,v);if(selectedFiles.length)t.attachments.push(...selectedFiles.map(f=>({id:uid(),name:f.name,size:f.size,type:f.type,kind:'task'})));await logEvent('task_edit',`Zmieniono zadanie „${t.title}”`,t.id);}
      else{const t={id:uid(),...v,status:'open',createdAt:nowISO(),createdBy:currentUser().id,claimedBy:null,claimedAt:null,deadlineAt:null,completedAt:null,reworkCount:0,report:null,comments:[],attachments:selectedFiles.map(f=>({id:uid(),name:f.name,size:f.size,type:f.type,kind:'task'}))};state.db.tasks.unshift(t);await logEvent('task',`Utworzono zadanie „${t.title}” w ${getLoc(t.locationId)?.name}`,t.id);notify('IMPERIUM',`Nowe zadanie: ${t.title}`);} saveDemoDB();
    }else{
      if(edit){await pgPatch('tasks',`id=eq.${encodeURIComponent(id)}`,{title:v.title,description:v.description,notes:v.notes,sanction_type:v.sanctionType,sanction_text:v.sanctionText,disciplinary_note:v.disciplinaryNote,reward_coins:v.rewardCoins,penalty_coins:v.penaltyCoins,location_id:v.locationId,priority:v.priority,duration_min:v.durationMin,status:v.assignedTo?'in_progress':'open',claimed_by:v.assignedTo||null,claimed_at:v.assignedTo?nowISO():null,deadline_at:v.assignedTo?new Date(Date.now()+v.durationMin*60000).toISOString():null});if(selectedFiles.length)await uploadFiles(id,selectedFiles,'task');await logEvent('task_edit',`Zmieniono zadanie „${v.title}”`,id);}
      else{const rows=await pgPost('tasks',{title:v.title,description:v.description,notes:v.notes,sanction_type:v.sanctionType,sanction_text:v.sanctionText,disciplinary_note:v.disciplinaryNote,reward_coins:v.rewardCoins,penalty_coins:v.penaltyCoins,location_id:v.locationId,priority:v.priority,duration_min:v.durationMin,created_by:currentUser().id,status:v.assignedTo?'in_progress':'open',claimed_by:v.assignedTo||null,claimed_at:v.assignedTo?nowISO():null,deadline_at:v.assignedTo?new Date(Date.now()+v.durationMin*60000).toISOString():null},'return=representation');const t=rows[0];if(selectedFiles.length)await uploadFiles(t.id,selectedFiles,'task');await logEvent('task',`Utworzono zadanie „${v.title}” w ${getLoc(v.locationId)?.name}`,t.id);notify('IMPERIUM',`Nowe zadanie: ${v.title}`);} await loadCloudDB({silent:true});
    }
    selectedFiles=[];fileInput.value='';state.modal=null;state.taskId=null;
  });
}
async function deleteTask(){
  const t=state.db.tasks.find(x=>x.id===state.taskId); if(!t)return; if(!confirm(`Usunąć zadanie „${t.title}”?`))return;
  await withAction('Usuwanie zadania…',async()=>{if(state.mode==='demo'){state.db.tasks=state.db.tasks.filter(x=>x.id!==t.id);await logEvent('task_delete',`Usunięto zadanie „${t.title}”`,null);saveDemoDB();}else{await pgDelete('tasks',`id=eq.${encodeURIComponent(t.id)}`);await logEvent('task_delete',`Usunięto zadanie „${t.title}”`,null);await loadCloudDB({silent:true});}state.modal=null;state.taskId=null;});
}
async function claimTask(id){
  const preview=state.db.tasks.find(x=>x.id===id);if(!preview)return;
  if(preview.notes || preview.rewardCoins || preview.penaltyCoins || (preview.sanctionType&&preview.sanctionType!=='none')){const parts=[];if(preview.rewardCoins)parts.push(`NAGRODA: +${preview.rewardCoins} NK po akceptacji.`);if(preview.penaltyCoins)parts.push(`NIEWYKONANIE: −${preview.penaltyCoins} NK po decyzji administratora.`);if(preview.notes)parts.push(`UWAGI / WYMAGANIA:\n${preview.notes}`);if(preview.sanctionType&&preview.sanctionType!=='none')parts.push(`SANKCJA / KONSEKWENCJE:\n${sanctionLabel(preview.sanctionType)}${preview.sanctionText?` — ${preview.sanctionText}`:''}`);parts.push('\nCzy potwierdzasz przejęcie zadania i zapoznanie się z tymi warunkami?');if(!confirm(parts.join('\n\n')))return;}
  await withAction('Przejmowanie zadania…',async()=>{const t=state.db.tasks.find(x=>x.id===id);if(!t||t.status!=='open')throw new Error('To zadanie zostało już przejęte.');if(state.mode==='demo'){t.status='in_progress';t.claimedBy=currentUser().id;t.claimedAt=nowISO();t.deadlineAt=new Date(Date.now()+t.durationMin*60000).toISOString();await logEvent('claim',`${currentUser().name} przejął zadanie „${t.title}”`,t.id);saveDemoDB();}else{await cloudFetch('/rest/v1/rpc/claim_task',{method:'POST',body:{p_task_id:id}});await logEvent('claim',`${currentUser().name} przejął zadanie „${t.title}”`,t.id);await loadCloudDB({silent:true});}notify('Zadanie przejęte',`${currentUser().name}: ${t.title}`);});
}
async function submitReport(){
  const t=state.db.tasks.find(x=>x.id===state.taskId),text=document.getElementById('f-report').value.trim();if(!text)return toast('Dodaj opis wykonanych prac.');
  await withAction('Wysyłanie raportu i plików…',async()=>{if(state.mode==='demo'){t.report={text,submittedAt:nowISO(),attachments:selectedFiles.map(f=>({id:uid(),name:f.name,size:f.size,type:f.type,kind:'report'}))};t.status='review';await logEvent('report',`${currentUser().name} przesłał raport do zadania „${t.title}”`,t.id);saveDemoDB();}else{if(selectedFiles.length)await uploadFiles(t.id,selectedFiles,'report');await cloudFetch('/rest/v1/rpc/submit_task_report',{method:'POST',body:{p_task_id:t.id,p_report_text:text}});await logEvent('report',`${currentUser().name} przesłał raport do zadania „${t.title}”`,t.id);await loadCloudDB({silent:true});}selectedFiles=[];fileInput.value='';state.modal=null;state.taskId=null;notify('Raport wysłany',`Zadanie „${t.title}” czeka na akceptację.`);});
}
async function reviewTask(ok){
  const t=state.db.tasks.find(x=>x.id===state.taskId),comment=document.getElementById('f-comment')?.value.trim(),bonus=Math.max(0,Math.floor(Number(document.getElementById('f-bonus-coins')?.value)||0));
  await withAction(ok?'Akceptowanie zadania i naliczanie Nikitocoinów…':'Zwracanie do poprawy…',async()=>{
    if(state.mode==='demo'){
      if(comment)t.comments.push({id:uid(),userId:currentUser().id,text:comment,createdAt:nowISO()});
      if(ok){
        t.status='done';t.completedAt=nowISO();
        state.db.coinTransactions ||= [];
        if(t.claimedBy && t.rewardCoins>0 && !state.db.coinTransactions.some(x=>x.taskId===t.id&&x.kind==='task_reward'))state.db.coinTransactions.unshift({id:uid(),userId:t.claimedBy,taskId:t.id,kind:'task_reward',amount:t.rewardCoins,description:`Nagroda za wykonanie zadania „${t.title}”`,createdBy:currentUser().id,createdAt:nowISO()});
        if(t.claimedBy && bonus>0 && !state.db.coinTransactions.some(x=>x.taskId===t.id&&x.kind==='task_bonus'))state.db.coinTransactions.unshift({id:uid(),userId:t.claimedBy,taskId:t.id,kind:'task_bonus',amount:bonus,description:`Bonus za wzorowe wykonanie zadania „${t.title}”`,createdBy:currentUser().id,createdAt:nowISO()});
      }else{t.status='in_progress';t.reworkCount=(Number(t.reworkCount)||0)+1;t.deadlineAt=new Date(Date.now()+30*60000).toISOString();}
      await logEvent(ok?'accept':'reopen',ok?`Administrator zaakceptował zadanie „${t.title}”${t.rewardCoins||bonus?` — +${(t.rewardCoins||0)+bonus} NK`:''}`:`Zadanie „${t.title}” wróciło do poprawy (+30 min)`,t.id);saveDemoDB();
    }else{
      if(comment)await pgPost('task_comments',{task_id:t.id,author_id:currentUser().id,body:comment});
      if(ok)await cloudFetch('/rest/v1/rpc/complete_task_with_coins',{method:'POST',body:{p_task_id:t.id,p_bonus_coins:bonus}});
      else await pgPatch('tasks',`id=eq.${t.id}`,{status:'in_progress',rework_count:(Number(t.reworkCount)||0)+1,deadline_at:new Date(Date.now()+30*60000).toISOString()});
      await logEvent(ok?'accept':'reopen',ok?`Administrator zaakceptował zadanie „${t.title}”${t.rewardCoins||bonus?` — +${(t.rewardCoins||0)+bonus} NK`:''}`:`Zadanie „${t.title}” wróciło do poprawy (+30 min)`,t.id);await loadCloudDB({silent:true});
    }
    state.modal=null;state.taskId=null;notify(ok?'Zadanie zaakceptowane':'Zadanie do poprawy',ok&&((t.rewardCoins||0)+bonus)>0?`${t.title} • +${(t.rewardCoins||0)+bonus} NK`:t.title);
  });
}
async function extendTask(min){
  const t=state.db.tasks.find(x=>x.id===state.taskId);await withAction('Dodawanie czasu…',async()=>{const base=Math.max(Date.now(),new Date(t.deadlineAt||Date.now()).getTime()),deadline=new Date(base+min*60000).toISOString();if(state.mode==='demo'){t.deadlineAt=deadline;await logEvent('extend',`Dodano ${min} min do zadania „${t.title}”`,t.id);saveDemoDB();}else{await pgPatch('tasks',`id=eq.${t.id}`,{deadline_at:deadline});await logEvent('extend',`Dodano ${min} min do zadania „${t.title}”`,t.id);await loadCloudDB({silent:true});}state.modal='detail';});
}
async function failTask(){
  const t=state.db.tasks.find(x=>x.id===state.taskId); if(!t?.claimedBy)return toast('Zadanie nie ma wykonawcy.');
  const who=getUser(t.claimedBy), penalty=Math.max(0,Number(t.penaltyCoins||0));
  if(!penalty)return toast('Dla tego zadania nie ustawiono odjęcia Nikitocoinów.');
  const reason=prompt(`Powód niewykonania zadania „${t.title}” przez ${who?.name||'pracownika'}:`,`Niewykonanie zadania.`); if(reason===null)return;
  if(!confirm(`Potwierdzić niewykonanie?\n\n${who?.name||'Pracownik'}: −${penalty} NK\nZadanie wróci do puli jako nowe.`))return;
  await withAction('Rozliczanie niewykonanego zadania…',async()=>{
    if(state.mode==='demo'){
      state.db.coinTransactions ||= [];
      state.db.coinTransactions.unshift({id:uid(),userId:t.claimedBy,taskId:t.id,kind:'task_penalty',amount:-penalty,description:(reason||'Niewykonanie zadania.').trim(),createdBy:currentUser().id,createdAt:nowISO()});
      Object.assign(t,{status:'open',claimedBy:null,claimedAt:null,deadlineAt:null,completedAt:null,report:null});saveDemoDB();
    }else{
      await cloudFetch('/rest/v1/rpc/fail_task_with_coin_penalty',{method:'POST',body:{p_task_id:t.id,p_reason:(reason||'Niewykonanie zadania.').trim()}});await loadCloudDB({silent:true});
    }
    await logEvent('task_failed',`${who?.name||'Pracownik'} — niewykonane „${t.title}”, −${penalty} NK`,t.id);
    state.modal=null;state.taskId=null;notify('Niewykonane zadanie',`${who?.name||'Pracownik'} • −${penalty} NK`);
  });
}

async function resetTask(){
  const t=state.db.tasks.find(x=>x.id===state.taskId);if(!confirm('Zwolnić wykonawcę i ustawić zadanie jako nowe?'))return;
  await withAction('Resetowanie zadania…',async()=>{if(state.mode==='demo'){Object.assign(t,{status:'open',claimedBy:null,claimedAt:null,deadlineAt:null,completedAt:null,report:null});await logEvent('reset',`Zadanie „${t.title}” przywrócono jako nowe`,t.id);saveDemoDB();}else{await pgPatch('tasks',`id=eq.${t.id}`,{status:'open',claimed_by:null,claimed_at:null,deadline_at:null,report_text:null,report_submitted_at:null,completed_at:null});await logEvent('reset',`Zadanie „${t.title}” przywrócono jako nowe`,t.id);await loadCloudDB({silent:true});}state.modal='detail';});
}
async function saveLocationFromForm(){
  const name=document.getElementById('f-locname').value.trim();if(!name)return toast('Wpisz nazwę obiektu.');const v={name,city:document.getElementById('f-city').value.trim(),address:document.getElementById('f-address').value.trim(),description:document.getElementById('f-locdesc').value.trim()},edit=state.modal==='editLocation';if(edit)v.active=document.getElementById('f-locactive').checked;
  await withAction(edit?'Zapisywanie obiektu…':'Dodawanie obiektu…',async()=>{if(state.mode==='demo'){if(edit)Object.assign(state.db.locations.find(x=>x.id===state.locationId),v);else state.db.locations.push({id:uid(),...v,active:true});await logEvent(edit?'location_edit':'location',`${edit?'Zmieniono':'Dodano'} obiekt „${name}”`);saveDemoDB();}else{if(edit)await pgPatch('locations',`id=eq.${state.locationId}`,v);else await pgPost('locations',v);await logEvent(edit?'location_edit':'location',`${edit?'Zmieniono':'Dodano'} obiekt „${name}”`);await loadCloudDB({silent:true});}state.modal=null;state.locationId=null;});
}
function addDemoUser(){const name=document.getElementById('f-username').value.trim();if(!name)return toast('Wpisz imię pracownika.');const locs=[...document.querySelectorAll('input[name=userloc]:checked')].map(x=>x.value);state.db.users.push({id:uid(),name,role:'worker',locationIds:locs,active:true});logEvent('user',`Dodano pracownika „${name}”`);saveDemoDB();state.modal=null;render();}
async function saveUserEdit(){
  const u=state.db.users.find(x=>x.id===state.userId),name=document.getElementById('f-username').value.trim(),role=document.getElementById('f-role').value,active=document.getElementById('f-active').value==='1',locs=[...document.querySelectorAll('input[name=userloc]:checked')].map(x=>x.value);if(!name)return toast('Wpisz imię.');if(u.id===currentUser().id&&(!active||role!=='admin'))return toast('Nie możesz odebrać sobie dostępu administratora z własnego konta.');
  await withAction('Zapisywanie pracownika…',async()=>{if(state.mode==='demo'){Object.assign(u,{name,role,active,locationIds:locs});await logEvent('user_edit',`Zmieniono konto „${name}”`);saveDemoDB();}else{await pgPatch('profiles',`id=eq.${u.id}`,{full_name:name,role,active});await pgDelete('profile_locations',`profile_id=eq.${u.id}`);if(locs.length)await pgPost('profile_locations',locs.map(location_id=>({profile_id:u.id,location_id})));await logEvent('user_edit',`Zmieniono konto „${name}”`);await loadCloudDB({silent:true});}state.modal=null;state.userId=null;});
}
async function saveCoinAdjustment(){
  const u=state.db.users.find(x=>x.id===state.userId), amount=Math.trunc(Number(document.getElementById('f-coin-amount')?.value||0)), taskId=document.getElementById('f-coin-task')?.value||null, description=document.getElementById('f-coin-desc')?.value.trim();
  if(!u||!amount)return toast('Wpisz liczbę różną od zera.'); if(!description)return toast('Wpisz powód operacji.');
  await withAction('Zapisywanie Nikitocoinów…',async()=>{
    if(state.mode==='demo'){state.db.coinTransactions ||= [];state.db.coinTransactions.unshift({id:uid(),userId:u.id,taskId,kind:'adjustment',amount,description,createdBy:currentUser().id,createdAt:nowISO()});saveDemoDB();}
    else{await pgPost('coin_transactions',{profile_id:u.id,task_id:taskId,transaction_kind:'adjustment',amount,description,created_by:currentUser().id});await loadCloudDB({silent:true});}
    await logEvent('coins',`${u.name}: ${fmtCoins(amount)} — ${description}`,taskId);state.modal='workerCard';
  });
}

async function saveDiscipline(){
  const u=state.db.users.find(x=>x.id===state.userId),type=document.getElementById('f-discipline-type').value,taskId=document.getElementById('f-discipline-task').value||null,description=document.getElementById('f-discipline-desc').value.trim();
  if(!u||!description)return toast('Wpisz treść / powód.');
  await withAction('Zapisywanie wpisu…',async()=>{
    if(state.mode==='demo'){
      state.db.disciplinaryRecords ||= [];
      state.db.disciplinaryRecords.unshift({id:uid(),userId:u.id,taskId,type,description,createdBy:currentUser().id,createdAt:nowISO()});
      await logEvent('discipline',`${disciplineLabel(type)} dla ${u.name}${taskId?` — „${state.db.tasks.find(t=>t.id===taskId)?.title||'zadanie'}”`:''}`,taskId);
      saveDemoDB();
    }else{
      await pgPost('disciplinary_records',{profile_id:u.id,task_id:taskId,record_type:type,description,created_by:currentUser().id});
      await logEvent('discipline',`${disciplineLabel(type)} dla ${u.name}${taskId?` — „${state.db.tasks.find(t=>t.id===taskId)?.title||'zadanie'}”`:''}`,taskId);
      await loadCloudDB({silent:true});
    }
    state.taskId=null;state.modal='workerCard';
  });
}
async function deleteDiscipline(id){
  const r=(state.db.disciplinaryRecords||[]).find(x=>x.id===id);if(!r||!confirm('Usunąć ten wpis z historii pracownika?'))return;
  await withAction('Usuwanie wpisu…',async()=>{
    if(state.mode==='demo'){state.db.disciplinaryRecords=state.db.disciplinaryRecords.filter(x=>x.id!==id);saveDemoDB();}
    else{await pgDelete('disciplinary_records',`id=eq.${encodeURIComponent(id)}`);await loadCloudDB({silent:true});}
    state.modal='workerCard';
  });
}
function safeFileName(name){return String(name||'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120);}
function encodeStoragePath(path){return path.split('/').map(encodeURIComponent).join('/');}
async function uploadFiles(taskId,files,kind){
  const max=(BASE_CFG.MAX_ATTACHMENT_MB||50)*1024*1024;
  for(const f of files){if(f.size>max)throw new Error(`${f.name}: plik przekracza limit ${BASE_CFG.MAX_ATTACHMENT_MB||50} MB.`);const path=`${taskId}/${Date.now()}-${uid().slice(0,8)}-${safeFileName(f.name)}`;await cloudFetch(`/storage/v1/object/task-files/${encodeStoragePath(path)}`,{method:'POST',body:f,headers:{'Content-Type':f.type||'application/octet-stream','x-upsert':'false'},raw:true});await pgPost('task_attachments',{task_id:taskId,uploaded_by:currentUser().id,storage_path:path,file_name:f.name,mime_type:f.type||'application/octet-stream',size_bytes:f.size,kind});}
}
function findAttachment(id){for(const t of state.db.tasks){for(const a of (t.attachments||[]))if(a.id===id)return a;for(const a of (t.report?.attachments||[]))if(a.id===id)return a;}return null;}
async function openAttachment(id){
  const a = findAttachment(id);
  if(!a) return;

  if(state.mode === 'demo'){
    return toast('W demo zapisane są tylko informacje o pliku.');
  }

  try{
    toast('Pobieranie pliku…');

    const r = await cloudFetch(
      `/storage/v1/object/authenticated/task-files/${encodeStoragePath(a.path)}`,
      {raw:true}
    );

    const blob = await r.blob();

    // Aplikacja Android IMPERIUM
    if(window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function'){
      const reader = new FileReader();

      reader.onload = () => {
        try{
          const base64 = String(reader.result).split(',')[1];

          window.AndroidBridge.saveFile(
            a.name || 'imperium_file',
            a.type || 'application/octet-stream',
            base64
          );
        }catch(e){
          toast(`Błąd zapisu: ${e.message}`);
        }
      };

      reader.onerror = () => {
        toast('Nie udało się przygotować pliku.');
      };

      reader.readAsDataURL(blob);
      return;
    }

    // Wersja przeglądarkowa
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = a.name || 'imperium_file';

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 60000);

  }catch(e){
    toast(`Nie udało się pobrać: ${e.message}`);
  }
}
function updateTimers(){document.querySelectorAll('[data-deadline]').forEach(el=>{if(!el.dataset.deadline)return;const ms=new Date(el.dataset.deadline)-Date.now();el.textContent=duration(ms);el.classList.toggle('over',ms<0);});}

fileInput.addEventListener('change',()=>{const max=(BASE_CFG.MAX_ATTACHMENT_MB||50)*1024*1024,arr=[...fileInput.files],too=arr.find(f=>f.size>max);if(too){toast(`${too.name} przekracza limit ${BASE_CFG.MAX_ATTACHMENT_MB||50} MB.`);fileInput.value='';return;}selectedFiles=arr;const box=document.getElementById('file-list');if(box)box.innerHTML=selectedFiles.map(f=>`<span class="filetag">${esc(f.name)} • ${bytes(f.size)}</span>`).join('');});
window.addEventListener('storage',e=>{if(state.mode==='demo'&&e.key===DB_KEY){state.db=loadDemoDB();render();}});
syncChannel?.addEventListener('message',()=>{if(state.mode==='demo'){state.db=loadDemoDB();render();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.mode==='cloud'&&state.auth&&!state.modal)loadCloudDB({silent:true}).catch(()=>{});});
if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
setInterval(updateTimers,1000);

async function init(){
  const saved=localStorage.getItem(MODE_KEY),c=cloudConfig();
  if(saved==='cloud'&&c)state.mode='cloud';else if(saved==='demo')state.mode='demo';else if(c)state.mode='cloud';
  if(state.mode==='cloud'){try{state.auth=JSON.parse(localStorage.getItem(AUTH_KEY));}catch(e){}if(state.auth?.access_token){await loadCloudDB();startPolling();return;}}
  if(state.mode==='demo'){state.db=loadDemoDB();try{state.demoSession=JSON.parse(localStorage.getItem(DEMO_SESSION_KEY));}catch(e){}}
  render();
}
init();
})();

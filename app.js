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
let bottomNavScrollLeft = 0;
let salaryLoadSequence = 0;
let state = {
  mode: null, // null | demo | cloud
  tab: 'tasks', filter: 'all', workerPeriod: 'all', profileView: 'mine', teamMonth: new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'}).slice(0,7), teamWorker: 'all', teamMonthRows: [], teamMonthLoaded: null, modal: null, taskId: null, locationId: null, userId: null,
  salaryManager:false, salaryCompensations:[], salaryAdjustments:[], salaryMonth:new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'}).slice(0,7), salaryWorkerId:null, salaryPots:[], salaryAdditions:[], salaryLoadedMonth:null, salaryLoading:false, salarySaving:false, rentalExpanded:{}, pdfZoom:1,
  demoSession: null, auth: null, db: null, attendance: [], shifts: [], inspections: [], rentals: [], rentalRooms: [], rentalDocuments: [], invoiceSellers: [], invoiceDrafts: [], invoiceId: null, invoiceLines: [], vouchers: [], inspectionId: null, rentalId: null, roomId: null, rentalLocationId: null, actionId: null, attendanceId: null, rentalActions: [], importantAlerts: [], alertsLoaded: false, loading: false, cloudError: '', lastEventAt: null
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
      {id:'u-zenon',name:'Zenon',role:'worker',canManageRentals:true,canAddInspections:true,canCreateTasks:true,canViewTeamHours:true,canViewImportant:true,locationIds:['l3','l4'],active:true},
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
    vouchers:[],salaryPots:[],salaryAdditions:[],salaryCompensations:[],salaryAdjustments:[],
    attendance:[],
    shifts:[],
    inspections:[],
    rentals:[],rentalRooms:[],rentalDocuments:[],invoiceSellers:[],invoiceDrafts:[],rentalActions:[],importantAlerts:[],
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
      x.inspections ||= [];
      x.rentals ||= [];x.rentalRooms ||= [];x.rentalDocuments ||= [];x.invoiceSellers ||= [];x.invoiceDrafts ||= [];x.rentalActions ||= [];x.importantAlerts ||= [];x.importantProgress ||= {};
      x.vouchers ||= []; x.salaryPots ||= []; x.salaryAdditions ||= []; x.salaryCompensations ||= []; x.salaryAdjustments ||= [];
      seedDemoSalaryRules(x);
      x.shifts ||= [];
      (x.tasks||[]).forEach(t=>{ if(t.reworkCount==null)t.reworkCount=0; if(t.completedAt===undefined)t.completedAt=null; if(t.rewardCoins==null)t.rewardCoins=0; if(t.penaltyCoins==null)t.penaltyCoins=0; });
      return x;
    }
  } catch(e){}
  const db=seed();seedDemoSalaryRules(db); localStorage.setItem(DB_KEY,JSON.stringify(db)); return db;
}
function seedDemoSalaryRules(db){
  const presets=[[/^(zenon|zenek|зенон)(\s|$)/i,'fixed',1200000,0],[/^(nikolai|nikolay|nikolaj|mikalai|николай)(\s|$)/i,'fixed',1000000,0],[/^(nikita|mikita|никита)(\s|$)/i,'fixed',800000,0],[/^(dima|dmitry|dmitriy|dmytro|dymitr|дима|дмитрий)(\s|$)/i,'fixed',600000,0],[/^(alena|alona|aliona|alyona|aleona|olena|ал[её]на)(\s|$)/i,'hourly',0,2500]];
  for(const u of db.users){if(db.salaryCompensations.some(x=>x.profile_id===u.id))continue;const hit=presets.find(([re])=>re.test(u.name));if(hit)db.salaryCompensations.push({profile_id:u.id,pay_type:hit[1],fixed_grosz:hit[2],hourly_grosz:hit[3]});}
}
function creditDemoSalaryAttendance(attendance){
  if(!attendance.endedAt)return;
  const rule=state.db.salaryCompensations.find(x=>x.profile_id===attendance.userId&&x.pay_type==='hourly');
  if(!rule)return;
  const amount=Math.round((new Date(attendance.endedAt)-new Date(attendance.startedAt))*rule.hourly_grosz/3600000);
  const rows=state.db.salaryAdjustments,existing=rows.find(x=>x.attendance_id===attendance.id);
  if(amount<=0){if(existing)rows.splice(rows.indexOf(existing),1);return;}
  const date=new Date(attendance.endedAt).toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'});
  const values={profile_id:attendance.userId,month_start:date.slice(0,7)+'-01',amount_grosz:amount,reason:'Godziny pracy · '+date.split('-').reverse().join('.'),kind:'attendance',attendance_id:attendance.id};
  if(existing)Object.assign(existing,values);else rows.push({id:uid(),created_at:nowISO(),...values});
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
function isSalaryManager(){return state.mode==='demo'?currentUser()?.id==='u-admin':state.salaryManager;}
function salaryMonthKey(){return state.salaryMonth+'-01';}
function salaryWorker(){return isSalaryManager()?(state.db.users.find(u=>u.id===state.salaryWorkerId&&u.active)||state.db.users.find(u=>u.active&&u.id!==currentUser().id)||currentUser()):currentUser();}
const salaryMoney=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n);
function salaryData(){
  const id=salaryWorker()?.id,pot=(state.mode==='demo'?state.db.salaryPots:state.salaryPots).find(p=>p.profile_id===id&&p.month_start===salaryMonthKey());
  const additions=(state.mode==='demo'?state.db.salaryAdditions:state.salaryAdditions).filter(a=>a.pot_id===pot?.id).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const adjustments=(state.mode==='demo'?state.db.salaryAdjustments:state.salaryAdjustments).filter(a=>a.profile_id===id&&a.month_start===salaryMonthKey()).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const rule=(state.mode==='demo'?state.db.salaryCompensations:state.salaryCompensations).find(x=>x.profile_id===id)||{pay_type:'none',fixed_grosz:0,hourly_grosz:0};
  const base=rule.pay_type==='fixed'?Number(rule.fixed_grosz):0;
  return {pot,additions,adjustments,rule,base,total:(base+additions.length*2500+adjustments.reduce((sum,a)=>sum+Number(a.amount_grosz),0))/100};
}
function canManageRentals(){ return isAdmin()||!!(currentUser()?.active&&currentUser()?.canManageRentals); }
function canAddInspections(){ return isAdmin()||!!(currentUser()?.active&&currentUser()?.canAddInspections); }
function canCreateTasks(){ return isAdmin()||!!(currentUser()?.active&&currentUser()?.canCreateTasks); }
function canViewTeamHours(){ return isAdmin()||!!(currentUser()?.active&&currentUser()?.canViewTeamHours); }
function canViewImportant(){ return isAdmin()||!!(currentUser()?.active&&currentUser()?.canViewImportant); }
function allowedLocations(){ return isAdmin()?state.db.locations:state.db.locations.filter(l=>currentUser()?.locationIds.includes(l.id)); }
function taskStatusLabel(s){ return ({open:'Nowe',in_progress:'W toku',review:'Do akceptacji',done:'Zakończone'}[s]||s); }
function priorityLabel(p){ return ({normal:'Normalne',high:'Wysoki',urgent:'Pilne'}[p]||p); }
function sanctionLabel(s){ return ({none:'Brak',note:'Uwaga',warning:'Ostrzeżenie',reprimand:'Upomnienie',other:'Inna sankcja'}[s]||s||'Brak'); }
function disciplineLabel(s){ return ({note:'Uwaga',warning:'Ostrzeżenie',reprimand:'Upomnienie',other:'Inna'}[s]||s||'Wpis'); }
function coinKindLabel(k){ return ({task_reward:'Nagroda za zadanie',task_bonus:'Bonus za wykonanie',task_penalty:'Niewykonanie zadania',adjustment:'Korekta administratora',voucher_redemption:'Wymiana na voucher'}[k]||k||'Nikitocoiny'); }
function voucherLabel(k){return ({hours_2:'2 godziny wolnego',hours_4:'4 godziny wolnego',day:'Dzień wolny',bonus_500:'Premia 500 zł'}[k]||k);}
function voucherState(v){if(v.kind==='bonus_500')return v.status==='paid'?'Wypłacono':'Do wypłaty';return Date.now()<new Date(v.startsAt)?'Zaplanowany':Date.now()<new Date(v.endsAt)?'Aktywny':'Zakończony';}
function voucherRows(userId){return (state.mode==='demo'?state.db?.vouchers:state.vouchers||[]).filter(v=>!userId||v.userId===userId).sort((a,b)=>new Date(b.redeemedAt)-new Date(a.redeemedAt));}
function shiftsFor(userId){return (state.mode==='demo'?state.db?.shifts:state.shifts||[]).filter(s=>!userId||s.userId===userId).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));}
function shiftForVoucher(kind,start,end,userId){return kind==='bonus_500'||shiftsFor(userId).some(s=>kind==='day'?new Date(s.startsAt)>=start&&new Date(s.startsAt)<end:new Date(s.startsAt)<=start&&new Date(s.endsAt)>=end);}
function voucherCard(v,admin=false){const s=voucherState(v),period=v.kind==='bonus_500'?'Premia do realizacji przez administratora':`${fmtDate(v.startsAt)} – ${fmtDate(v.endsAt)}`;return `<div class="voucher-card"><div><b>${esc(voucherLabel(v.kind))}</b><span class="voucher-state" data-voucher-state="${esc(v.startsAt||'')}|${esc(v.endsAt||'')}">${s}</span></div>${admin?`<small>${esc(getUser(v.userId)?.name||'Pracownik')}</small>`:''}<small>${period}</small>${v.kind!=='bonus_500'?`<strong data-voucher-until="${esc(v.endsAt)}" data-voucher-start="${esc(v.startsAt)}"></strong>`:''}${v.kind==='bonus_500'&&s==='Do wypłaty'&&admin?`<button class="smallbtn gold" data-voucher-paid="${v.id}">Oznacz jako wypłacone</button>`:''}</div>`;}
async function redeemVoucher(){
  const kind=document.querySelector('input[name="voucher-kind"]:checked')?.value;
  const cost={hours_2:1000,hours_4:2000,day:5000,bonus_500:7500}[kind];
  if(!cost||coinBalance(currentUser().id)<cost)return toast('Brak wystarczającej liczby Nikitocoinów.');
  let start=null,end=null;
  if(kind==='day'){
    const date=document.getElementById('voucher-day')?.value;
    if(!date)return toast('Wybierz dzień wolny.');
    start=new Date(`${date}T00:00:00`);
    end=new Date(start);end.setDate(end.getDate()+1);
  }else if(kind!=='bonus_500'){
    const value=document.getElementById('voucher-start')?.value;
    if(!value)return toast('Wybierz początek wolnego.');
    start=new Date(value);end=new Date(start.getTime()+(kind==='hours_2'?2:4)*3600000);
  }
  if(start&&(!Number.isFinite(start.getTime())||start<=new Date()||start>new Date(Date.now()+90*86400000)))return toast('Wybierz przyszły termin (maksymalnie 90 dni).');
  if(!shiftForVoucher(kind,start,end,currentUser().id))return toast('Wybierz termin zgodny z zapisanym grafikiem pracy.');
  if(start&&voucherRows(currentUser().id).some(v=>v.startsAt&&new Date(v.startsAt)<end&&new Date(v.endsAt)>start))return toast('Ten termin pokrywa się z innym voucherem.');
  await withAction('Wymiana Nikitocoinów…',async()=>{
    if(state.mode==='demo'){
      const userId=currentUser().id;
      state.db.vouchers.push({id:uid(),userId,kind,cost,startsAt:start?.toISOString()||null,endsAt:end?.toISOString()||null,status:'issued',redeemedAt:nowISO()});
      state.db.coinTransactions.unshift({id:uid(),userId,kind:'voucher_redemption',amount:-cost,description:voucherLabel(kind),createdBy:userId,createdAt:nowISO()});
      saveDemoDB();
    }else{
      await cloudFetch('/rest/v1/rpc/redeem_coin_voucher',{method:'POST',body:{p_kind:kind,p_start:start?.toISOString()||null,p_end:end?.toISOString()||null}});
      await loadCloudDB({silent:true});
    }
    toast('Voucher dodany do profilu.');
    render();
  });
}
async function markVoucherPaid(id){
  if(!isAdmin())return;
  await withAction('Potwierdzanie wypłaty…',async()=>{
    if(state.mode==='demo'){const v=state.db.vouchers.find(x=>x.id===id&&x.kind==='bonus_500'&&x.status==='issued');if(!v)throw Error('Voucher nie jest oczekujący.');v.status='paid';saveDemoDB();}
    else{await cloudFetch('/rest/v1/rpc/mark_voucher_paid',{method:'POST',body:{p_id:id}});await loadCloudDB({silent:true});}
    render();
  });
}
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
let notificationAudio;
function playNotificationSound(){
  if(document.visibilityState==='hidden')return;
  try{
    notificationAudio ||= new Audio('sounds/imperium_notification.mp3');
    notificationAudio.volume=1;
    notificationAudio.currentTime=0;
    const playing=notificationAudio.play();
    playing?.catch?.(e=>console.warn('IMPERIUM sound:',e));
  }catch(e){console.warn('IMPERIUM sound:',e);}
}
function notify(title,body){
  try { if(window.AndroidBridge?.notify) window.AndroidBridge.notify(String(title),String(body||'')); } catch(e){}
  if('Notification' in window && Notification.permission==='granted'){ try{new Notification(title,{body,icon:'icons/icon.svg'});}catch(e){} }
  playNotificationSound();
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
     const cfg=cloudConfig();

AndroidBridge.checkWebUpdate(
  Number(update.version),
  String(update.version_name||''),
  String(update.package_url||''),
  String(state.auth.access_token||''),
  String(cfg?.key||'')
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
  return {id:t.id,title:t.title,description:t.description||'',notes:t.notes||'',sanctionType:t.sanction_type||'none',sanctionText:t.sanction_text||'',disciplinaryNote:t.disciplinary_note||'',rewardCoins:Number(t.reward_coins||0),penaltyCoins:Number(t.penalty_coins||0),locationId:t.location_id,priority:t.priority,scheduledStart:t.scheduled_start,scheduledEnd:t.scheduled_end,assignedTo:t.assigned_to,groupId:t.assignment_group_id,status:t.status,durationMin:t.duration_min,createdAt:t.created_at,createdBy:t.created_by,claimedBy:t.claimed_by,claimedAt:t.claimed_at,deadlineAt:t.deadline_at,completedAt:t.completed_at,reworkCount:Number(t.rework_count||0),report:t.report_text?{text:t.report_text,submittedAt:t.report_submitted_at,attachments:reportAtts}:null,comments:comments.filter(c=>c.task_id===t.id).map(c=>({id:c.id,userId:c.author_id,text:c.body,createdAt:c.created_at})),attachments:taskAtts};
}
function mapAtt(a){return {id:a.id,name:a.file_name,size:Number(a.size_bytes||0),type:a.mime_type||'application/octet-stream',path:a.storage_path,kind:a.kind,uploadedBy:a.uploaded_by,createdAt:a.created_at};}
function mapRental(r){return {id:r.id,locationId:r.location_id,roomId:r.room_id||null,contractor:r.contractor,nip:r.nip||'',contactPerson:r.contact_person||'',phone:r.phone||'',email:r.email||'',registeredAddress:r.registered_address||'',premisesAddress:r.premises_address||'',premisesNumber:r.premises_number||'',paymentStatus:r.payment_status||'',startsOn:r.starts_on,endsOn:r.ends_on,indefinite:r.indefinite,areaSqm:Number(r.area_sqm),priceSqmNet:Number(r.price_sqm_net),priceSqmGross:Number(r.price_sqm_gross),parkingNet:Number(r.parking_net),parkingGross:Number(r.parking_gross),internetNet:Number(r.internet_net),internetGross:Number(r.internet_gross),cleaningNet:Number(r.cleaning_net||0),cleaningGross:Number(r.cleaning_gross||0)};}
async function loadCloudDB({silent=false}={}){
  if(!state.auth?.access_token) return;
  if(!silent) setLoading(true,'Synchronizacja danych…');
  try{
    if(!state.alertsLoaded){state.alertsLoaded=true;await cloudFetch('/rest/v1/rpc/refresh_important_alerts',{method:'POST',body:{}}).catch(()=>{});}
    const [profiles,locations,pls,tasks,comments,atts,events,discipline,coins,attendance,inspections,rentals,vouchers,shifts,rentalActions,importantAlerts,rentalRooms,rentalDocuments,invoiceSellers,invoiceDrafts,salaryManager]=await Promise.all([
      pgGet('profiles?select=id,full_name,role,active,can_manage_rentals,can_add_inspections,can_create_tasks,can_view_team_hours,can_view_important,created_at&order=created_at.asc'),
      pgGet('locations?select=*&order=name.asc'),
      pgGet('profile_locations?select=profile_id,location_id'),
      pgGet('tasks?select=*&order=created_at.desc'),
      pgGet('task_comments?select=*&order=created_at.asc'),
      pgGet('task_attachments?select=*&order=created_at.asc'),
      pgGet('events?select=*&order=created_at.desc&limit=100'),
      pgGet('disciplinary_records?select=*&order=created_at.desc'),
      pgGet('coin_transactions?select=*&order=created_at.desc'),
      pgGet('work_attendance?select=*&order=started_at.desc&limit=500').catch(()=>[]),
      pgGet('inspections?select=*&order=valid_until.asc'),
      pgGet('rental_agreements?select=*&order=created_at.desc'),
      pgGet('coin_vouchers?select=*&order=redeemed_at.desc'),
      pgGet('work_shifts?select=*&order=starts_at.asc'),
      pgGet('rental_actions?select=*&order=due_on.asc'),
      pgGet('important_alerts?select=*&resolved_at=is.null&order=due_on.asc'),
      pgGet('rental_rooms?select=*&order=building.asc,floor.asc,room_number.asc'),
      pgGet('rental_documents?select=*&order=created_at.desc'),
      pgGet('invoice_sellers?select=*&order=name.asc'),
      pgGet('invoice_drafts?select=*&order=created_at.desc&limit=500'),
      cloudFetch('/rest/v1/rpc/salary_is_manager',{method:'POST',body:{}})
    ]);
    state.salaryManager=salaryManager===true;
    state.attendance=(attendance||[]).map(a=>({id:a.id,userId:a.profile_id,locationId:a.location_id,startedAt:a.started_at,endedAt:a.ended_at,startedBy:a.started_by,endedBy:a.ended_by}));
    state.inspections=(inspections||[]).map(i=>({id:i.id,locationId:i.location_id,name:i.name,validUntil:i.valid_until,lastInspected:i.last_inspected,notes:i.notes||''}));
    state.rentals=(rentals||[]).map(mapRental);
    state.rentalRooms=(rentalRooms||[]).map(x=>({id:x.id,locationId:x.location_id,building:x.building,floor:x.floor,number:x.room_number,areaSqm:Number(x.area_sqm),hasMeter:x.has_electric_meter,meterReading:x.meter_reading,meterReadOn:x.meter_read_on}));
    state.rentalDocuments=(rentalDocuments||[]).map(x=>({id:x.id,rentalId:x.rental_id,path:x.storage_path,name:x.file_name,size:x.size_bytes}));
    state.invoiceSellers=(invoiceSellers||[]).map(x=>({id:x.id,name:x.name,nip:x.nip,streetAddress:x.street_address,postalCity:x.postal_city,bankAccount:x.bank_account||''}));
    state.invoiceDrafts=(invoiceDrafts||[]).map(x=>({id:x.id,sellerId:x.seller_id,rentalId:x.rental_id,number:x.invoice_number,issueDate:x.issue_date,saleDate:x.sale_date,dueDate:x.due_date,buyerName:x.buyer_name,buyerNip:x.buyer_nip,buyerStreet:x.buyer_street,buyerPostalCity:x.buyer_postal_city,lines:x.lines,status:x.status,ksefNumber:x.ksef_number,ksefReference:x.ksef_reference,ksefError:x.ksef_error,issuedXml:x.issued_xml,upoXml:x.upo_xml,sellerSnapshot:x.seller_snapshot}));
    state.rentalActions=(rentalActions||[]).map(x=>({id:x.id,rentalId:x.rental_id,kind:x.kind,dueOn:x.due_on,notes:x.notes||'',completedAt:x.completed_at}));
    state.importantAlerts=(importantAlerts||[]).map(x=>({id:x.id,kind:x.kind,sourceId:x.source_id,dueOn:x.due_on,title:x.title,details:x.details,locationId:x.location_id,createdAt:x.created_at,inProgressAt:x.in_progress_at}));
    state.vouchers=(vouchers||[]).map(v=>({id:v.id,userId:v.profile_id,kind:v.kind,cost:v.cost,startsAt:v.starts_at,endsAt:v.ends_at,status:v.status,redeemedAt:v.redeemed_at}));
    state.shifts=(shifts||[]).map(s=>({id:s.id,userId:s.profile_id,locationId:s.location_id,startsAt:s.starts_at,endsAt:s.ends_at}));
    state.db={version:2,users:profiles.map(p=>({id:p.id,name:p.full_name,role:p.role,active:p.active,canManageRentals:!!p.can_manage_rentals,canAddInspections:!!p.can_add_inspections,canCreateTasks:!!p.can_create_tasks,canViewTeamHours:!!p.can_view_team_hours,canViewImportant:!!p.can_view_important,locationIds:pls.filter(x=>x.profile_id===p.id).map(x=>x.location_id)})),locations:locations.map(l=>({id:l.id,name:l.name,city:l.city||'',address:l.address||'',description:l.description||'',active:l.active})),tasks:tasks.map(t=>mapTaskRow(t,comments,atts)),disciplinaryRecords:discipline.map(r=>({id:r.id,userId:r.profile_id,taskId:r.task_id,type:r.record_type,description:r.description,createdBy:r.created_by,createdAt:r.created_at})),coinTransactions:coins.map(r=>({id:r.id,userId:r.profile_id,taskId:r.task_id,kind:r.transaction_kind,amount:Number(r.amount||0),description:r.description||'',createdBy:r.created_by,createdAt:r.created_at})),events:events.map(e=>({id:e.id,type:e.event_type,text:e.message,userId:e.actor_id,taskId:e.task_id,createdAt:e.created_at}))};
    await loadExtraMissions();
    deliverImportantAlerts();
    const newest=state.db.events[0]?.createdAt||null;
    if(state.lastEventAt && newest){ const fresh=state.db.events.filter(e=>new Date(e.createdAt)>new Date(state.lastEventAt) && e.userId!==currentUser()?.id); if(fresh.length) notify('IMPERIUM',fresh[0].text); }
    if(state.tab==='salary')await loadSalaryMonth({refresh:true});
    state.lastEventAt=newest; state.cloudError=''; state.loading=false;
    if(!silent){
  checkImperiumUpdate().catch(()=>{});
}
    if(!silent || (!state.modal && state.tab!=='chat' && state.tab!=='salary' && !(state.tab==='profile'&&(publicProfileId||state.profileView==='messages')) && !document.activeElement?.closest('.shift-admin'))) render();
    if(isAdmin() && state.db.locations.length===0){ try{await cloudFetch('/rest/v1/rpc/seed_default_locations',{method:'POST',body:{}});await sleep(300);return loadCloudDB({silent:false});}catch(e){} }
  }catch(e){ state.loading=false; state.cloudError=e.message; if(/sesja|JWT|token|expired/i.test(e.message)){localStorage.removeItem(AUTH_KEY);state.auth=null;} render(); }
}
async function logEvent(type,text,taskId=null){
  if(state.mode==='demo'){ state.db.events.unshift({id:uid(),type,text,userId:currentUser()?.id||null,taskId,createdAt:nowISO()}); saveDemoDB(); return; }
  await pgPost('events',{event_type:type,actor_id:currentUser()?.id||null,task_id:taskId,message:text});
}
function startPolling(){ stopPolling(); if(state.mode!=='cloud'||!state.auth)return; pollTimer=setInterval(()=>{if(!state.modal && document.visibilityState!=='hidden')loadCloudDB({silent:true}).catch(()=>{});},BASE_CFG.POLL_INTERVAL_MS||10000); }
function stopPolling(){if(profileMessageTimer){clearInterval(profileMessageTimer);profileMessageTimer=null;}profileMessages=[];profileUnread=0;publicProfileId=null;extraMissions=[]; if(pollTimer){clearInterval(pollTimer);pollTimer=null;} }

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
function imperialIcon(id){
  const p={
    tasks:'<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5zM8 9h8M8 12h8M8 15h5"/></svg>',
    locations:'<svg viewBox="0 0 24 24"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    inspections:'<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="1"/><path d="M8 3v4M16 3v4M8 11h8M8 15h5"/></svg>',
    rentals:'<svg viewBox="0 0 24 24"><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/><path d="M16 17h2"/></svg>',
    invoices:'<svg viewBox="0 0 24 24"><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3zM8 8h8M8 12h8M8 16h5"/></svg>',
    important:'<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3zM12 9v5M12 17v1"/></svg>',
    activity:'<svg viewBox="0 0 24 24"><path d="M4 13h4l2-6 4 11 2-5h4"/></svg>',
    attendance:'<svg viewBox="0 0 24 24"><path d="M7 4h10v16H7zM10 8h4M10 12h4M10 16h2"/></svg>',
    chat:'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h6"/></svg>',
    team:'<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M15 15c3 0 5 1.5 5 5"/></svg>',
    profile:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4.2 2.8-7 7-7s7 2.8 7 7"/></svg>',settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>'
  };return p[id]||'';
}
function nav(id,label,extra=''){return `<button class="navitem ${state.tab===id?'active':''} ${extra}" data-tab="${id}"><i>${imperialIcon(id)}</i><span>${label}</span></button>`;}
function chip(id,label){return `<button class="chip ${state.filter===id?'active':''}" data-filter="${id}">${label}</button>`;}
function render(){
  if(state.loading)return;
  const previousNav=app.querySelector('.bottomnav-inner');
  if(previousNav)bottomNavScrollLeft=previousNav.scrollLeft;
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
  if(state.mode==='demo'){state.attendance=state.db.attendance||[];state.inspections=state.db.inspections||[];state.rentals=state.db.rentals||[];state.rentalRooms=state.db.rentalRooms||[];state.rentalDocuments=state.db.rentalDocuments||[];state.invoiceSellers=state.db.invoiceSellers||[];state.invoiceDrafts=state.db.invoiceDrafts||[];state.rentalActions=state.db.rentalActions||[];state.importantAlerts=demoImportantAlerts();}
  if(!canManageRentals()&&state.tab==='rentals')state.tab='tasks';
  if(!isAdmin()&&state.tab==='invoices')state.tab='tasks';
  if(!canViewImportant()&&state.tab==='important')state.tab='tasks';
  const open=state.db.tasks.filter(t=>t.status==='open').length, prog=state.db.tasks.filter(t=>t.status==='in_progress').length, rev=state.db.tasks.filter(t=>t.status==='review').length, urg=state.db.tasks.filter(t=>t.priority==='urgent'&&t.status!=='done').length;
  app.innerHTML=`<div class="app aureus-shell">
  <header class="topbar"><div class="topbar-inner">
    <div class="brand"><div class="sigil"><b>I</b></div><div class="brand-copy"><h1>IMPERIUM</h1><small>COMMAND SYSTEM <b>// AUREUS</b></small></div></div>
    <div class="top-actions">${profileMessengerButton()}<span class="system-dot ${state.mode==='cloud'?'online':'offline'}"></span><span class="command-role">${u.role==='admin'?'ADMIN':'OPERATIVE'}</span><span class="coin-badge">${coinBalance(u.id)} <small>NK</small></span>${canCreateTasks()?'<button class="command-add" id="new-task" aria-label="Nowe zadanie">＋</button>':''}<button class="command-exit" id="logout" title="Wyloguj">↗</button></div>
  </div></header>
  <main class="content">${state.tab==='tasks'?renderTasksPage(open,prog,rev,urg,u):''}${state.tab==='locations'?renderLocationsPage():''}${state.tab==='inspections'?renderInspectionsPage():''}${state.tab==='rentals'?renderRentalsPage():''}${state.tab==='invoices'?renderInvoicesPage():''}${state.tab==='activity'?renderActivityPage():''}${state.tab==='important'?renderImportantPage():''}${state.tab==='attendance'?renderAttendancePage():''}${state.tab==='chat'?renderChatPage():''}${state.tab==='team'?renderTeamPage():''}${state.tab==='profile'?renderProfilePage():''}${state.tab==='salary'?renderSalaryPage():''}${state.tab==='settings'?renderSettingsPage():''}</main>
  <nav class="bottomnav"><div class="bottomnav-inner">${nav('tasks','Zadania')}${nav('locations','Obiekty')}${nav('inspections','Przeglądy')}${canManageRentals()?nav('rentals','Najem'):''}${isAdmin()?nav('invoices','Faktury'):''}${canViewImportant()?nav('important',`Ważne${pendingImportantCount()?' ('+pendingImportantCount()+')':''}`,`${importantIndicatorClass()} ${hasSoonMission()?'important-soon':''}`):''}${nav('activity','Aktywność')}${nav('attendance','Meldunek')}${nav('chat','Czat')}${nav('team','Zespół')}${nav('profile','Profil')}${nav('salary','Moja pensja')}${nav('settings','System')}</div></nav>
  ${renderModal()}</div>`;
  const bottomNav=app.querySelector('.bottomnav-inner');
  if(bottomNav)bottomNav.scrollLeft=bottomNavScrollLeft;
  bind();
}
async function loadSalaryMonth({refresh=false}={}){
  if(state.mode!=='cloud'||!currentUser())return;
  if(!refresh&&state.salaryLoadedMonth===state.salaryMonth)return;
  if(!refresh&&state.salaryLoading&&state.salaryRequestedMonth===state.salaryMonth)return;
  const request=++salaryLoadSequence,month=state.salaryMonth,owner=currentUser().id,wasLoaded=state.salaryLoadedMonth===month;
  state.salaryRequestedMonth=month;
  state.salaryLoading=true;
  try{
    const [pots,adjustments,compensations]=await Promise.all([pgGet(`salary_pots?select=*&month_start=eq.${month}-01`),pgGet(`salary_adjustments?select=*&month_start=eq.${month}-01&order=created_at.desc`),pgGet('salary_compensation?select=*')]);
    const ids=pots.map(p=>p.id);
    const additions=ids.length?await pgGet(`salary_additions?select=*&pot_id=in.(${ids.join(',')})&order=created_at.desc`):[];
    if(request!==salaryLoadSequence||state.mode!=='cloud'||currentUser()?.id!==owner||state.salaryMonth!==month)return;
    state.salaryPots=pots;state.salaryAdditions=additions;state.salaryAdjustments=adjustments;state.salaryCompensations=compensations;state.salaryLoadedMonth=month;
    if(state.tab==='salary'&&!state.loading)updateSalaryView({syncRuleInputs:!wasLoaded});
  }catch(e){if(request===salaryLoadSequence)toast(e.message||'Nie udało się pobrać pensji.');}
  finally{if(request===salaryLoadSequence)state.salaryLoading=false;}
}
function salaryHistoryRows({additions,adjustments}){
  const entries=[...adjustments.map(a=>({amount:Number(a.amount_grosz)/100,text:a.reason,when:a.created_at})),...additions.map(a=>({amount:25,text:'Wcześniejsza wpłata',when:a.created_at}))].sort((a,b)=>b.when.localeCompare(a.when));
  return entries.length?entries.map(a=>`<div><span>${a.amount>0?'+':''}${salaryMoney(a.amount)} · ${esc(a.text)}</span><time>${fmtDate(a.when)}</time></div>`).join(''):'<p>Brak dodatkowych wpisów w tym miesiącu.</p>';
}
function renderSalaryPage(){
  const worker=salaryWorker(),data=salaryData(),{pot,rule,base,total}=data,goal=pot?.goal_zl||0,pct=goal?Math.max(0,Math.min(100,Math.round(total/goal*100))):0;
  const month=new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(salaryMonthKey()+'T12:00:00Z'));
  const loading=state.mode==='cloud'&&state.salaryLoadedMonth!==state.salaryMonth;
  const typeLabel=rule.pay_type==='fixed'?`Stałe wynagrodzenie: ${salaryMoney(base/100)}`:rule.pay_type==='hourly'?`Godzinowo: ${salaryMoney(rule.hourly_grosz/100)} / godz. · naliczane po zakończeniu meldunku`:'Brak ustawionej stawki';
  return `<section class="salary-page"><div class="salary-veil"><div class="salary-eyebrow">IMPERIUM · AURELIA</div><h2>Moja pensja</h2><p class="salary-subtitle">Wynagrodzenie za ${esc(month)}</p>
    <div class="salary-controls"><label>Miesiąc<input id="salary-month" type="month" value="${esc(state.salaryMonth)}"></label>${isSalaryManager()?`<label>Pracownik<select id="salary-worker">${state.db.users.filter(u=>u.active).map(u=>`<option value="${esc(u.id)}" ${worker?.id===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label>`:''}</div>
    <div class="salary-card"><div class="salary-owner">${esc(worker?.name||'Pracownik')}</div><div class="salary-total"><span id="salary-total-value">${loading?'…':salaryMoney(total)}</span></div><div class="salary-target" id="salary-type">${esc(typeLabel)}</div>
    <div class="salary-target" id="salary-target">${goal?`Cel: ${salaryMoney(goal)} · ${pct}%`:'Cel miesiąca nieustawiony'}</div><div class="salary-track" role="progressbar" aria-label="Postęp wynagrodzenia" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span id="salary-progress" style="width:${pct}%"></span></div>
    <div class="salary-chest" role="img" aria-label="Łączne wynagrodzenie"><div class="salary-chest-lid"></div><div class="salary-chest-body"><span>✦ AURELIA ✦</span><b id="salary-chest-total">${salaryMoney(total)}</b></div></div>
    ${isSalaryManager()?`<fieldset id="salary-manager-controls" class="salary-manager-controls" ${loading||state.salarySaving?'disabled':''}><div class="salary-rule"><h3>Zasady wynagrodzenia</h3><div class="salary-rule-fields"><label>Rodzaj<select id="salary-pay-type"><option value="none" ${rule.pay_type==='none'?'selected':''}>Brak stawki</option><option value="fixed" ${rule.pay_type==='fixed'?'selected':''}>Stałe miesięczne</option><option value="hourly" ${rule.pay_type==='hourly'?'selected':''}>Godzinowe</option></select></label><label>Stałe zł / miesiąc<input id="salary-fixed" type="number" min="0" step="0.01" value="${(rule.fixed_grosz/100).toFixed(2)}"></label><label>zł / godz.<input id="salary-hourly" type="number" min="0" step="0.01" value="${(rule.hourly_grosz/100).toFixed(2)}"></label></div><button class="smallbtn" id="salary-save-rule">Zapisz stawkę</button></div>
    <div class="salary-adjust"><h3>Korekta wynagrodzenia</h3><div class="salary-adjust-fields"><label>Zmiana<select id="salary-sign"><option value="plus">+ Dodaj</option><option value="minus">− Odejmij</option></select></label><label>Kwota zł<input id="salary-amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="25,00"></label></div><label>Za co?<input id="salary-reason" maxlength="500" placeholder="Np. premia, zaliczka lub korekta"></label><button class="goldbtn" id="salary-add-adjustment">Zapisz korektę</button></div>
    <div class="salary-admin"><label>Cel (zł)<input id="salary-goal" type="number" min="0" max="10000000" step="25" value="${goal}"></label><button id="salary-save-goal" class="smallbtn">Zapisz cel</button></div></fieldset>`:'<p class="salary-private">Szczegóły wynagrodzenia widzisz tylko Ty i właściciel IMPERIUM.</p>'}</div>
    <div class="salary-history"><h3>Rozliczenie miesiąca</h3><p id="salary-base-row">${esc(typeLabel)}</p><div class="salary-history-rows" id="salary-history-rows">${loading?'<p>Ładowanie…</p>':salaryHistoryRows(data)}</div></div></div></section>`;
}
function updateSalaryView({syncRuleInputs=false}={}){
  if(state.tab!=='salary')return;
  const data=salaryData(),{pot,rule,base,total}=data,goal=pot?.goal_zl||0,pct=goal?Math.max(0,Math.min(100,Math.round(total/goal*100))):0;
  const typeLabel=rule.pay_type==='fixed'?`Stałe wynagrodzenie: ${salaryMoney(base/100)}`:rule.pay_type==='hourly'?`Godzinowo: ${salaryMoney(rule.hourly_grosz/100)} / godz. · naliczane po zakończeniu meldunku`:'Brak ustawionej stawki';
  const number=document.getElementById('salary-total-value');if(!number)return;
  number.textContent=salaryMoney(total);
  const chest=document.getElementById('salary-chest-total');if(chest)chest.textContent=salaryMoney(total);
  const type=document.getElementById('salary-type'),baseRow=document.getElementById('salary-base-row');if(type)type.textContent=typeLabel;if(baseRow)baseRow.textContent=typeLabel;
  const target=document.getElementById('salary-target');if(target)target.textContent=goal?`Cel: ${salaryMoney(goal)} · ${pct}%`:'Cel miesiąca nieustawiony';
  const bar=document.querySelector('.salary-track'),progress=document.getElementById('salary-progress');if(bar)bar.setAttribute('aria-valuenow',String(pct));if(progress)progress.style.width=`${pct}%`;
  const rows=document.getElementById('salary-history-rows');if(rows)rows.innerHTML=salaryHistoryRows(data);
  if(syncRuleInputs){
    const values={'salary-pay-type':rule.pay_type,'salary-fixed':(rule.fixed_grosz/100).toFixed(2),'salary-hourly':(rule.hourly_grosz/100).toFixed(2),'salary-goal':goal};
    for(const [id,value] of Object.entries(values)){const input=document.getElementById(id);if(input)input.value=value;}
  }
  updateSalaryControls();
}
function salaryReady(){return state.mode==='demo'||state.salaryLoadedMonth===state.salaryMonth;}
function updateSalaryControls(){const controls=document.getElementById('salary-manager-controls');if(controls)controls.disabled=state.salarySaving||!salaryReady();}
function salaryInputGrosz(id){const value=Number(document.getElementById(id)?.value);return Number.isFinite(value)?Math.round(value*100):NaN;}
function bindSalary(){
  document.getElementById('salary-month')?.addEventListener('change',e=>{if(!/^\d{4}-\d{2}$/.test(e.target.value))return;state.salaryMonth=e.target.value;render();loadSalaryMonth();});
  document.getElementById('salary-worker')?.addEventListener('change',e=>{if(!isSalaryManager())return;state.salaryWorkerId=e.target.value;render();});
  document.getElementById('salary-add-adjustment')?.addEventListener('click',async e=>{
    if(!isSalaryManager()||state.salarySaving||!salaryReady())return;
    const worker=salaryWorker(),month=salaryMonthKey(),raw=document.getElementById('salary-amount')?.value,amount=salaryInputGrosz('salary-amount'),reason=document.getElementById('salary-reason')?.value.trim()||'',sign=document.getElementById('salary-sign')?.value==='minus'?-1:1;
    if(!raw||!Number.isSafeInteger(amount)||amount<=0||amount>1000000000||!reason)return toast('Podaj kwotę większą od zera i powód korekty.');
    state.salarySaving=true;updateSalaryControls();
    try{
      if(state.mode==='demo'){state.db.salaryAdjustments.push({id:uid(),profile_id:worker.id,month_start:month,amount_grosz:sign*amount,reason,kind:'manual',created_at:nowISO()});saveDemoDB();}
      else{await cloudFetch('/rest/v1/rpc/salary_add_adjustment',{method:'POST',body:{p_profile:worker.id,p_month:month,p_amount_grosz:sign*amount,p_reason:reason}});await loadSalaryMonth({refresh:true});}
      if(state.tab==='salary'&&salaryWorker()?.id===worker.id&&salaryMonthKey()===month){const amountField=document.getElementById('salary-amount'),reasonField=document.getElementById('salary-reason');if(amountField)amountField.value='';if(reasonField)reasonField.value='';updateSalaryView();}
    }catch(error){toast(error.message||'Nie udało się zapisać korekty.');}
    finally{state.salarySaving=false;updateSalaryControls();}
  });
  document.getElementById('salary-save-rule')?.addEventListener('click',async e=>{
    if(!isSalaryManager()||state.salarySaving||!salaryReady())return;
    const worker=salaryWorker(),type=document.getElementById('salary-pay-type')?.value,fixed=salaryInputGrosz('salary-fixed'),hourly=salaryInputGrosz('salary-hourly');
    if(!['none','fixed','hourly'].includes(type)||!Number.isSafeInteger(fixed)||fixed<0||fixed>1000000000||!Number.isSafeInteger(hourly)||hourly<0||hourly>10000000)return toast('Sprawdź kwoty wynagrodzenia.');
    state.salarySaving=true;updateSalaryControls();
    try{
      if(state.mode==='demo'){const row=state.db.salaryCompensations.find(x=>x.profile_id===worker.id);if(row)Object.assign(row,{pay_type:type,fixed_grosz:fixed,hourly_grosz:hourly});else state.db.salaryCompensations.push({profile_id:worker.id,pay_type:type,fixed_grosz:fixed,hourly_grosz:hourly});saveDemoDB();}
      else{await cloudFetch('/rest/v1/rpc/salary_set_compensation',{method:'POST',body:{p_profile:worker.id,p_type:type,p_fixed_grosz:fixed,p_hourly_grosz:hourly}});await loadSalaryMonth({refresh:true});}
      if(state.tab==='salary'&&salaryWorker()?.id===worker.id)updateSalaryView();
    }catch(error){toast(error.message||'Nie udało się zapisać stawki.');}
    finally{state.salarySaving=false;updateSalaryControls();}
  });
  document.getElementById('salary-save-goal')?.addEventListener('click',async e=>{
    if(!isSalaryManager()||state.salarySaving||!salaryReady())return;
    const worker=salaryWorker(),month=salaryMonthKey(),goal=Number(document.getElementById('salary-goal')?.value);
    if(!Number.isInteger(goal)||goal<0||goal>10000000)return toast('Podaj cel od 0 do 10 000 000 zł.');
    state.salarySaving=true;updateSalaryControls();
    try{
      if(state.mode==='demo'){let pot=state.db.salaryPots.find(p=>p.profile_id===worker.id&&p.month_start===month);if(pot)pot.goal_zl=goal;else state.db.salaryPots.push({id:uid(),profile_id:worker.id,month_start:month,goal_zl:goal});saveDemoDB();}
      else{await cloudFetch('/rest/v1/rpc/salary_set_goal',{method:'POST',body:{p_profile:worker.id,p_month:month,p_goal:goal}});await loadSalaryMonth({refresh:true});}
      if(state.tab==='salary'&&salaryWorker()?.id===worker.id&&salaryMonthKey()===month)updateSalaryView();
    }catch(error){toast(error.message||'Nie udało się zapisać celu.');}
    finally{state.salarySaving=false;updateSalaryControls();}
  });
}
function renderOverlayOn(baseFn,modalFn){ baseFn(); app.insertAdjacentHTML('beforeend',modalFn()); bindCloudSetup(); }
let chatFiles=[], chatRows=[], chatBusy=false, chatLoading=false, chatFingerprint='';
let chatAudio=null, chatAudioIndex=-1, chatAudioUrl=null, chatPreviewCleanup=null;

function renderChatPage(){
  return `<section class="chat-page comms-page"><div class="panel chat-panel comms-panel">
    <div class="chat-header comms-header"><div class="comms-title"><div class="comms-emblem">${imperialIcon('chat')}</div><div><div class="eyebrow">SECURE COMMUNICATION CHANNEL</div><h3>IMPERIUM // GENERAL</h3></div></div></div>
    <div id="chat-player" class="chat-player" hidden></div>
    <div id="chat-messages" class="chat-messages comms-stream"><div class="empty">Synchronizacja kanału…</div></div>
    <div id="chat-preview" class="chat-preview" hidden></div><div id="chat-file-list" class="chat-file-list"></div>
    <div class="chat-compose comms-compose"><button id="chat-attach" class="smallbtn chat-attach" aria-label="Dodaj załączniki">📎</button><input id="chat-files" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.txt,.zip,.rar" multiple hidden>
      <div class="comms-input-wrap"><span class="comms-prompt">›</span><textarea id="chat-input" maxlength="2000" rows="1" placeholder="Wiadomość do kanału…"></textarea></div><button class="comms-send" id="chat-send" type="button" aria-label="Wyślij"><span>WYŚLIJ</span><b>↗</b></button></div></div></section>`;
}
function chatFileKind(a){const t=a.type||'',n=a.name.toLowerCase();return t.startsWith('image/')?'image':t.startsWith('video/')?'video':t.startsWith('audio/')?'audio':n.endsWith('.pdf')?'pdf':n.endsWith('.docx')?'word':'file';}
function chatAllFiles(){return chatRows.flatMap(m=>Array.isArray(m.attachments)?m.attachments:[]);}
async function loadChatMessages(){
  if(state.mode!=='cloud'||chatLoading)return;const box=document.getElementById('chat-messages');if(!box)return;chatLoading=true;
  try{const rows=(await pgGet('chat_messages?select=id,user_id,message,attachments,created_at&order=created_at.desc&limit=200')).reverse();
    if(!box.isConnected)return;const fingerprint=JSON.stringify(rows);chatRows=rows;
    if(fingerprint===chatFingerprint&&box.dataset.loaded)return;chatFingerprint=fingerprint;
    const near=box.scrollHeight-box.scrollTop-box.clientHeight<90,top=box.scrollTop;
    box.innerHTML=rows.length?rows.map(m=>{const author=getUser(m.user_id),mine=m.user_id===currentUser()?.id;return `<div class="chat-message ${mine?'mine':''}"><div class="chat-avatar">${initials(author?.name||'P')}</div><div class="chat-bubble"><div class="chat-message-head"><button class="profile-author" data-public-profile="${esc(m.user_id)}">${mine?'TY':esc(author?.name||'Pracownik')}</button><span>${new Date(m.created_at).toLocaleString('pl-PL')}</span>${mine?`<button class="chat-delete" data-chat-delete="${esc(m.id)}" aria-label="Usuń swoją wiadomość">✕</button>`:''}</div><div class="chat-message-text">${esc(m.message)}</div><div class="chat-attachments">${(Array.isArray(m.attachments)?m.attachments:[]).map(a=>`<button class="chat-file" data-chat-file="${esc(a.path)}">${({image:'▧',video:'▶',audio:'♫',pdf:'PDF',word:'W',file:'▤'})[chatFileKind(a)]} ${esc(a.name)} <small>${Math.ceil(a.size/1024)} KB</small></button>`).join('')}</div></div></div>`;}).join(''):'<div class="empty">Kanał jest pusty. Wyślij pierwszą wiadomość.</div>';
    box.scrollTop=near||!box.dataset.loaded?box.scrollHeight:top;box.dataset.loaded='1';bindPublicProfileLinks(box);
    box.querySelectorAll('[data-chat-delete]').forEach(b=>b.onclick=()=>deleteChatMessage(b.dataset.chatDelete));
    box.querySelectorAll('[data-chat-file]').forEach(b=>b.onclick=()=>openChatFile(b.dataset.chatFile));
  }catch(e){if(!box.dataset.loaded)box.innerHTML=`<div class="status-note danger-text">Błąd czatu: ${esc(e.message)}</div>`;}finally{chatLoading=false;}
}
function drawChatFiles(){const box=document.getElementById('chat-file-list');if(!box)return;box.innerHTML=chatFiles.map((f,i)=>`<span>${esc(f.name)} <button data-chat-remove="${i}" aria-label="Usuń załącznik">✕</button></span>`).join('');box.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(chatBusy)return;chatFiles.splice(Number(b.dataset.chatRemove),1);drawChatFiles();});}
async function sendChatMessage(){
  if(state.mode!=='cloud')return toast('Czat działa we wspólnej bazie.');if(chatBusy)return;
  const input=document.getElementById('chat-input');if(!input)return;const message=input.value.trim(),files=chatFiles.slice();if(!message&&!files.length)return;
  const max=(BASE_CFG.MAX_ATTACHMENT_MB||50)*1024*1024;if(files.length>10||files.some(f=>f.size>max))return toast('Maksymalnie 10 plików, każdy do '+(BASE_CFG.MAX_ATTACHMENT_MB||50)+' MB.');
  chatBusy=true;const button=document.getElementById('chat-send');button.disabled=true;const uploaded=[];
  try{for(const f of files){const path=`${currentUser().id}/${crypto.randomUUID()}/${safeFileName(f.name)}`;await cloudFetch(`/storage/v1/object/chat-files/${encodeStoragePath(path)}`,{method:'POST',body:f,headers:{'Content-Type':f.type||'application/octet-stream'},raw:true});uploaded.push({path,name:f.name,size:f.size,type:f.type||'application/octet-stream'});}
    await pgPost('chat_messages',{user_id:currentUser().id,message:message||'📎',attachments:uploaded});input.value='';chatFiles=[];drawChatFiles();await loadChatMessages();
  }catch(e){for(const a of uploaded)await cloudFetch(`/storage/v1/object/chat-files/${encodeStoragePath(a.path)}`,{method:'DELETE',raw:true}).catch(()=>{});toast(`Nie udało się wysłać: ${e.message}`);}finally{chatBusy=false;if(button.isConnected)button.disabled=false;}
}
async function deleteChatMessage(id){const m=chatRows.find(m=>m.id===id&&m.user_id===currentUser()?.id);if(!m||!confirm('Usunąć swoją wiadomość dla wszystkich?'))return;
  try{const deleted=await cloudFetch(`/rest/v1/rpc/delete_own_chat_message`,{method:'POST',body:{p_id:id}});for(const a of deleted||[])await cloudFetch(`/storage/v1/object/chat-files/${encodeStoragePath(a.path)}`,{method:'DELETE',raw:true}).catch(()=>{});stopChatAudio();closeChatPreview();await loadChatMessages();}catch(e){toast(e.message);}}
async function chatBlob(a){return (await cloudFetch(`/storage/v1/object/authenticated/chat-files/${encodeStoragePath(a.path)}`,{raw:true})).blob();}
function closeChatPreview(){chatPreviewCleanup?.();chatPreviewCleanup=null;const box=document.getElementById('chat-preview');if(box){box.replaceChildren();box.hidden=true;}}
async function openChatFile(path){const a=chatAllFiles().find(a=>a.path===path);if(!a)return;if(chatFileKind(a)==='audio')return playChatAudio(path);
  closeChatPreview();const box=document.getElementById('chat-preview');if(!box)return;box.hidden=false;box.innerHTML='<p>Ładowanie…</p>';let cancelled=false,url=null,pdf=null;chatPreviewCleanup=()=>{cancelled=true;if(url)URL.revokeObjectURL(url);pdf?.destroy();box.querySelector('video')?.pause();};
  try{const blob=await chatBlob(a);if(cancelled)return;url=URL.createObjectURL(blob);box.innerHTML=`<div class="chat-preview-head"><b>${esc(a.name)}</b><a href="${esc(url)}" download="${esc(a.name)}">Pobierz</a><button id="chat-preview-close">✕</button></div><div class="chat-preview-body"></div>`;box.querySelector('#chat-preview-close').onclick=closeChatPreview;const body=box.querySelector('.chat-preview-body'),kind=chatFileKind(a);
    if(kind==='image'){body.innerHTML=`<img src="${esc(url)}" alt="${esc(a.name)}">`;}
    else if(kind==='video'){body.innerHTML=`<video controls playsinline src="${esc(url)}"></video><button class="smallbtn">Pełny ekran</button>`;body.querySelector('button').onclick=()=>body.querySelector('video').requestFullscreen?.().catch(()=>toast('Pełny ekran niedostępny.'));}
    else if(kind==='pdf'){const js=await import('./pdf.min.mjs');js.GlobalWorkerOptions.workerSrc='./pdf.worker.min.mjs';pdf=await js.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
      for(let n=1;n<=pdf.numPages&&!cancelled;n++){const p=await pdf.getPage(n),base=p.getViewport({scale:1}),v=p.getViewport({scale:Math.min(2,(body.clientWidth||320)/base.width)}),canvas=document.createElement('canvas');canvas.width=v.width;canvas.height=v.height;body.appendChild(canvas);await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;}}
    else if(kind==='word'){const xml=await chatDocxXml(await blob.arrayBuffer());if(cancelled)return;const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('Nieprawidłowy dokument Word.');const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';for(const p of doc.getElementsByTagNameNS(ns,'p')){const el=document.createElement('p');el.textContent=Array.from(p.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent).join('');body.appendChild(el);}const note=document.createElement('small');note.textContent='Podgląd tekstu DOCX. Pełne formatowanie jest dostępne w pobranym pliku.';body.prepend(note);}
    else body.textContent='Ten format można pobrać i otworzyć w odpowiedniej aplikacji.';
  }catch(e){if(!cancelled){box.textContent=`Nie udało się otworzyć: ${e.message}`;const b=document.createElement('button');b.textContent='Zamknij';b.onclick=closeChatPreview;box.appendChild(b);}}
}
async function chatDocxXml(buffer){
  const v=new DataView(buffer),bytes=new Uint8Array(buffer);let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}if(end<0)throw Error('Nieprawidłowy DOCX.');
  let offset=v.getUint32(end+16,true);const count=v.getUint16(end+10,true);for(let i=0;i<count;i++){if(v.getUint32(offset,true)!==0x02014b50)break;const method=v.getUint16(offset+10,true),size=v.getUint32(offset+20,true),expanded=v.getUint32(offset+24,true),nameLen=v.getUint16(offset+28,true),extra=v.getUint16(offset+30,true),comment=v.getUint16(offset+32,true),local=v.getUint32(offset+42,true),name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLen));
    if(name==='word/document.xml'){if(expanded>16*1024*1024)throw Error('Dokument zbyt duży do podglądu.');const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true),compressed=bytes.slice(start,start+size);if(method===0)return new TextDecoder().decode(compressed);if(method!==8)throw Error('Nieobsługiwany DOCX.');const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>16*1024*1024){await reader.cancel();throw Error('Dokument zbyt duży.');}parts.push(value);}return new Blob(parts).text();}offset+=46+nameLen+extra+comment;}
  throw Error('Brak tekstu w pliku DOCX.');
}
function chatAudioFiles(){return chatAllFiles().filter(a=>chatFileKind(a)==='audio');}
async function playChatAudio(path){const list=chatAudioFiles(),i=list.findIndex(a=>a.path===path);if(i<0)return;stopChatAudio();const token={};chatAudio=token;
  try{const blob=await chatBlob(list[i]);if(chatAudio!==token)return;chatAudioUrl=URL.createObjectURL(blob);const audio=new Audio(chatAudioUrl);chatAudio=audio;chatAudioIndex=i;drawChatPlayer(list[i]);audio.onended=()=>stepChatAudio(1);await audio.play();}catch(e){toast(e.message);}}
function stopChatAudio(){if(chatAudio instanceof Audio)chatAudio.pause();chatAudio=null;if(chatAudioUrl)URL.revokeObjectURL(chatAudioUrl);chatAudioUrl=null;const box=document.getElementById('chat-player');if(box){box.replaceChildren();box.hidden=true;}}
function stepChatAudio(direction){const list=chatAudioFiles(),i=chatAudioIndex+direction;if(i>=0&&i<list.length)playChatAudio(list[i].path);else stopChatAudio();}
function drawChatPlayer(a){const box=document.getElementById('chat-player');if(!box||!(chatAudio instanceof Audio))return;box.hidden=false;box.innerHTML=`<b>♫ ${esc(a.name)}</b><div><button data-audio="prev" aria-label="Poprzedni">⏮</button><button data-audio="pause" aria-label="Odtwórz lub pauza">⏯</button><button data-audio="stop" aria-label="Stop">⏹</button><button data-audio="next" aria-label="Następny">⏭</button><input type="range" min="0" max="100" value="0" aria-label="Pozycja odtwarzania"></div>`;box.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.audio==='prev')stepChatAudio(-1);if(b.dataset.audio==='next')stepChatAudio(1);if(b.dataset.audio==='stop')stopChatAudio();if(b.dataset.audio==='pause')chatAudio.paused?chatAudio.play().catch(e=>toast(e.message)):chatAudio.pause();});box.querySelector('input').oninput=e=>{if(Number.isFinite(chatAudio.duration))chatAudio.currentTime=Number(e.target.value)*chatAudio.duration/100;};chatAudio.ontimeupdate=()=>{const input=box.querySelector('input');if(input&&Number.isFinite(chatAudio?.duration))input.value=chatAudio.currentTime/chatAudio.duration*100;};}
function bindChatMedia(){
  document.getElementById('chat-attach').onclick=()=>{if(!chatBusy)document.getElementById('chat-files').click();};document.getElementById('chat-files').onchange=e=>{if(!chatBusy){chatFiles.push(...e.target.files);drawChatFiles();}e.target.value='';};drawChatFiles();if(chatAudio instanceof Audio){const a=chatAudioFiles()[chatAudioIndex];if(a)drawChatPlayer(a);}
}
let extraMissions=[], extraMissionLoading=false, extraMissionSaving=false, extraMissionError='';
function extraMissionToday(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'});}
function extraMissionRows(){return state.mode==='demo'?(state.db.extraMissions||[]):extraMissions;}
function renderExtraMissionsSection(){return `<section class="extra-missions panel"><div class="extra-missions-head"><div><div class="eyebrow">DODATKOWA PRACA</div><h3>${isAdmin()?'Dodatkowe wykonane misje':'Dzisiaj wykonałem'}</h3></div><button class="goldbtn" data-new-extra-mission>+ Dzisiaj wykonałem</button></div><p class="subtle">Zapisz dodatkową pracę wykonaną poza przydzielonymi zadaniami.</p><div class="extra-mission-history">${renderExtraMissionHistory()}</div></section>`;}
function renderExtraMissionHistory(){const rows=extraMissionRows().slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,20);return rows.map(m=>`<article class="extra-mission-row"><div class="extra-mission-meta"><b>${esc(m.title)}</b><span>WYKONANO · ${esc(m.done_on)}</span></div><small>${esc(getUser(m.profile_id)?.name||'Pracownik')} · ${esc(getLoc(m.location_id)?.name||'Inne / bez obiektu')} · ${fmtDate(m.created_at)}</small><p>${esc(m.description)}</p>${(Array.isArray(m.attachments)?m.attachments:[]).map(a=>`<button class="smallbtn" data-extra-file="${esc(a.id)}">📎 ${esc(a.name)}</button>`).join('')}</article>`).join('')||`<div class="empty compact">${extraMissionError?esc(extraMissionError):'Brak dodatkowych misji. Dodaj pierwszą wykonaną pracę.'}</div>`;}
function renderExtraMissionModal(){return `<div class="modal-bg"><div class="modal"><h2>+ Dzisiaj wykonałem</h2><p class="modal-sub">Dodatkowa wykonana misja · ${extraMissionToday()}</p><div class="field"><label>Co wykonałeś?</label><input id="extra-mission-title" maxlength="120" placeholder="Np. Naprawiłem drzwi w pokoju 12"></div><div class="field"><label>Opis wykonanej pracy</label><textarea id="extra-mission-description" maxlength="4000" rows="4" placeholder="Co zostało zrobione i jaki jest rezultat?"></textarea></div><div class="field"><label>Obiekt</label><select id="extra-mission-location"><option value="">Inne / bez obiektu</option>${allowedLocations().filter(l=>l.active).map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Zdjęcia, wideo lub dokumenty</label><button class="ghost" id="pick-files">📎 Dodaj załączniki</button><div id="file-list" class="attachments"></div></div><div class="modal-actions"><button class="ghost" data-close>Anuluj</button><button class="goldbtn" id="save-extra-mission">Zapisz wykonaną misję</button></div><div id="extra-mission-error" role="status" class="danger-text"></div></div></div>`;}
async function loadExtraMissions(){if(state.mode!=='cloud'||extraMissionLoading||!currentUser())return;extraMissionLoading=true;const owner=currentUser().id;
  try{const rows=await pgGet('extra_missions?select=id,profile_id,location_id,title,description,done_on,created_at,attachments&order=created_at.desc&limit=100');if(currentUser()?.id!==owner)return;extraMissions=rows;extraMissionError='';document.querySelectorAll('.extra-mission-history').forEach(box=>{box.innerHTML=renderExtraMissionHistory();bindExtraFileLinks(box);});}
  catch(e){extraMissionError='Nie udało się pobrać dodatkowych misji.';}finally{extraMissionLoading=false;}}
function bindExtraFileLinks(root=document){root.querySelectorAll('[data-extra-file]').forEach(b=>b.onclick=()=>openAttachment(b.dataset.extraFile));}
function bindExtraMissions(){document.querySelectorAll('[data-new-extra-mission]').forEach(b=>b.onclick=()=>{selectedFiles=[];fileInput.value='';state.modal='extraMission';render();});document.getElementById('save-extra-mission')?.addEventListener('click',saveExtraMission);bindExtraFileLinks();}
async function saveExtraMission(){if(extraMissionSaving)return;const title=document.getElementById('extra-mission-title')?.value.trim(),description=document.getElementById('extra-mission-description')?.value.trim(),locationId=document.getElementById('extra-mission-location')?.value||null,error=document.getElementById('extra-mission-error');
  if(!title||!description){if(error)error.textContent='Wpisz nazwę i opis wykonanej pracy.';return;}if(locationId&&!allowedLocations().some(l=>l.id===locationId&&l.active)){if(error)error.textContent='Wybierz dostępny obiekt.';return;}
  const files=selectedFiles.slice(),max=(BASE_CFG.MAX_ATTACHMENT_MB||50)*1024*1024;if(files.length>10||files.some(f=>f.size>max)){if(error)error.textContent='Maksymalnie 10 załączników, każdy do '+(BASE_CFG.MAX_ATTACHMENT_MB||50)+' MB.';return;}
  extraMissionSaving=true;const button=document.getElementById('save-extra-mission');button.disabled=true;const id=crypto.randomUUID(),uploaded=[],owner=currentUser().id;
  try{if(state.mode==='demo'){state.db.extraMissions ||= [];state.db.extraMissions.unshift({id,profile_id:owner,location_id:locationId,title,description,done_on:extraMissionToday(),created_at:nowISO(),attachments:files.map(f=>({id:uid(),name:f.name,size:f.size,type:f.type,bucket:'extra-mission-files'}))});saveDemoDB();}
    else{for(const file of files){const path=`${owner}/${id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;await cloudFetch(`/storage/v1/object/extra-mission-files/${encodeStoragePath(path)}`,{method:'POST',body:file,headers:{'Content-Type':file.type||'application/octet-stream'},raw:true});uploaded.push({id:crypto.randomUUID(),path,name:file.name,size:file.size,type:file.type||'application/octet-stream',bucket:'extra-mission-files'});}await pgPost('extra_missions',{id,profile_id:owner,location_id:locationId,title,description,attachments:uploaded});await loadExtraMissions();}
    selectedFiles=[];fileInput.value='';state.modal=null;render();toast('Dodatkowa wykonana misja została zapisana.');
  }catch(e){let committed=false;if(state.mode==='cloud'){try{committed=(await pgGet(`extra_missions?id=eq.${id}&select=id`)).length>0;}catch(_){}if(committed){selectedFiles=[];fileInput.value='';state.modal=null;await loadExtraMissions();render();toast('Dodatkowa misja została zapisana.');}else{for(const a of uploaded)await cloudFetch(`/storage/v1/object/extra-mission-files/${encodeStoragePath(a.path)}`,{method:'DELETE',raw:true}).catch(()=>{});}}
    if(!committed&&error?.isConnected)error.textContent='Nie udało się zapisać: '+e.message;
  }finally{extraMissionSaving=false;if(button.isConnected)button.disabled=false;}}

  function renderTasksPage(open,prog,rev,urg,u){
  let tasks=[...state.db.tasks];
  if(u.role!=='admin')tasks=tasks.filter(t=>u.locationIds.includes(t.locationId));
  if(state.filter!=='all')tasks=tasks.filter(t=>state.filter==='mine'?t.claimedBy===u.id&&t.status!=='done':t.status===state.filter);
  tasks.sort((a,b)=>({urgent:0,high:1,normal:2}[a.priority]-{urgent:0,high:1,normal:2}[b.priority])||(new Date(b.createdAt)-new Date(a.createdAt)));
  const noLoc=u.role!=='admin'&&u.locationIds.length===0?'<div class="status-note">Twoje konto jest aktywne, ale administrator nie przypisał jeszcze żadnego obiektu. Po przypisaniu zadania pojawią się tutaj automatycznie.</div>':'';
  return `${noLoc}<section class="hero command-hero"><div class="hero-card"><div class="hero-code">AUREUS / 01</div><div class="eyebrow">Centrum dowodzenia</div><h2>${esc(u.name)}</h2><p>${u.role==='admin'?'Nadzór operacyjny • zadania • obiekty • raporty':'Panel operacyjny • zadania • raporty • meldunek'}</p><div class="hero-scan"></div></div><div class="stats"><div class="stat"><b>${open}</b><span>NOWE</span></div><div class="stat"><b>${prog}</b><span>W TOKU</span></div><div class="stat"><b>${rev}</b><span>AKCEPTACJA</span></div><div class="stat ${urg?'alert':''}"><b>${urg}</b><span>PILNE</span></div></div></section>
  ${renderExtraMissionsSection()}
  <div class="toolbar"><div><div class="eyebrow">Operacje</div><h2 class="section-title">Zadania</h2></div><div class="filters">${chip('all','Wszystkie')}${chip('open','Nowe')}${chip('in_progress','W toku')}${chip('review','Akceptacja')}${chip('mine','Moje')}${chip('done','Zakończone')}</div></div><div class="grid">${tasks.length?tasks.map(t=>taskCard(t,u)).join(''):'<div class="empty">Brak zadań w tym widoku.</div>'}</div>`;
}
function taskCard(t,u){
  const loc=getLoc(t.locationId),owner=getUser(t.claimedBy||t.assignedTo),rem=t.deadlineAt?new Date(t.deadlineAt)-Date.now():null,statusClass=t.status==='in_progress'?'progress':t.status==='review'?'review':t.status==='done'?'done':'';
  const now=Date.now(),claimable=t.status==='open'&&(u.role==='admin'||u.locationIds.includes(t.locationId))&&(!t.assignedTo||t.assignedTo===u.id)&&(!t.scheduledEnd||new Date(t.scheduledEnd).getTime()>now);
  const fileCount=(t.attachments?.length||0)+(t.report?.attachments?.length||0);
  const pcode=t.priority==='urgent'?'CRITICAL':t.priority==='high'?'HIGH':'STANDARD';
  return `<article class="task mission-card" data-task="${t.id}">
    <div class="mission-rail"></div>
    <div class="mission-top">
      <div class="mission-object"><span>SEKTOR</span><b>${esc(loc?.name||'—')}</b></div>
      <div class="mission-priority ${t.priority}"><i></i><span>${pcode}</span></div>
    </div>
    <h3 class="mission-title">${esc(t.title)}</h3>
    <p class="desc mission-desc">${esc(t.description||'Brak opisu.')}</p>
    ${t.scheduledStart?`<div class="task-schedule">📅 ${fmtDate(t.scheduledStart)} → ${fmtDate(t.scheduledEnd)}</div>`:''}${t.groupId&&state.db.tasks.filter(x=>x.groupId===t.groupId).length>1?`<div class="task-schedule">Zadanie zespołowe · ${state.db.tasks.filter(x=>x.groupId===t.groupId).length} osób</div>`:''}
    ${t.sanctionType&&t.sanctionType!=='none'?`<div class="task-sanction">⚠ ${esc(sanctionLabel(t.sanctionType))}${t.sanctionText?`: ${esc(t.sanctionText)}`:''}</div>`:''}
    <div class="mission-data">
      <div><span>STATUS</span><b class="${statusClass}">${taskStatusLabel(t.status)}</b></div>
      <div><span>CZAS</span><b>${t.durationMin} MIN</b></div>
      <div><span>WYKONAWCA</span><b>${owner?esc(owner.name):'—'}</b></div>
      ${t.rewardCoins?`<div><span>NAGRODA</span><b>+${t.rewardCoins} NK</b></div>`:''}
    </div>
    ${t.status==='in_progress'||t.status==='review'?`<div class="mission-timer"><span>${t.status==='review'?'TRANSMISJA RAPORTU':'CZAS OPERACJI'}</span><strong class="${rem<0?'over':''}" data-deadline="${t.deadlineAt||''}">${t.status==='review'?'RAPORT WYSŁANY':duration(rem||0)}</strong></div>`:''}
    <div class="mission-footer">
      <div class="mission-flags">${t.notes?'<span>NOTE</span>':''}${fileCount?`<span>FILE ${fileCount}</span>`:''}${t.penaltyCoins?`<span>−${t.penaltyCoins} NK</span>`:''}</div>
      <div class="task-actions">${claimable?`<button class="smallbtn gold" data-action="claim" ${t.scheduledStart?`data-claim-start="${t.scheduledStart}" data-claim-end="${t.scheduledEnd}" ${new Date(t.scheduledStart)>new Date()?'disabled':''}`:''}>ROZPOCZNIJ</button>`:''}${t.status==='in_progress'&&t.claimedBy===u.id?'<button class="smallbtn gold" data-action="report">RAPORT</button>':''}${canCreateTasks()?'<button class="smallbtn" data-action="copy">KOPIUJ NA DZIŚ</button>':''}<button class="smallbtn" data-action="detail">OTWÓRZ</button></div>
    </div>
  </article>`;
}
function inspectionDeadline(date){ return new Date(`${date}T23:59:59.999`).getTime(); }
function inspectionCountdown(date){
  const ms=inspectionDeadline(date)-Date.now();
  if(ms<0) return {text:`Po terminie ${Math.ceil(-ms/86400000)} dni`,status:'expired'};
  const days=Math.floor(ms/86400000),hours=Math.floor(ms%86400000/3600000);
  return {text:`${days} dni ${hours} godz.`,status:days<30?'soon':'valid'};
}
function renderInspectionsPage(){
  const u=currentUser(),visible=(state.inspections||[]).filter(i=>u.role==='admin'||u.locationIds.includes(i.locationId));
  const sorted=[...visible].sort((a,b)=>a.validUntil.localeCompare(b.validUntil));
  const expired=sorted.filter(i=>inspectionCountdown(i.validUntil).status==='expired').length;
  const soon=sorted.filter(i=>inspectionCountdown(i.validUntil).status==='soon').length;
  return `<div class="toolbar"><div><div class="eyebrow">Kontrola terminów</div><h2 class="section-title">Przeglądy techniczne</h2></div>${canAddInspections()?'<button class="goldbtn" id="add-inspection">+ Dodaj przegląd</button>':''}</div>
  <div class="inspection-summary"><div><b>${sorted.length}</b><span>Pozycji</span></div><div class="inspection-expired"><b>${expired}</b><span>Po terminie</span></div><div class="inspection-soon"><b>${soon}</b><span>Do 30 dni</span></div></div>
  <div class="inspection-list">${sorted.map(i=>{const c=inspectionCountdown(i.validUntil);return `<article class="inspection-card ${c.status}"><div class="inspection-head"><div><small>${esc(getLoc(i.locationId)?.name||'Obiekt')}</small><h3>${esc(i.name)}</h3></div><span class="inspection-badge">${c.status==='expired'?'PO TERMINIE':c.status==='soon'?'WKRÓTCE':'WAŻNY'}</span></div><div class="inspection-dates"><span>Ważny do: <b>${esc(i.validUntil)}</b></span>${i.lastInspected?`<span>Ostatni przegląd: ${esc(i.lastInspected)}</span>`:''}</div>${i.notes?`<p>${esc(i.notes)}</p>`:''}<div class="inspection-foot"><strong data-inspection-until="${esc(i.validUntil)}">${c.text}</strong>${isAdmin()?`<button class="smallbtn" data-edit-inspection="${esc(i.id)}">Edytuj</button>`:''}</div></article>`}).join('')||'<div class="empty">Brak wpisów. Dodaj np. przegląd kominiarski, gaśnic lub pięcioletni.</div>'}</div>`;
}
const rentMoney=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(Number(n)||0);
const rentalPaymentLabel=s=>({reliable:'Rzetelny płatnik',monitor:'Pod kontrolą',problematic:'Problematyczny'}[s]||'Nie oznaczono');
const rentalActionLabel=kind=>({cesja:'Cesja',aneks:'Aneks',wypowiedzenie:'Wypowiedzenie'}[kind]||kind);
function rentalTotals(r){return {net:r.areaSqm*r.priceSqmNet+r.parkingNet+r.internetNet+(r.cleaningNet||0),gross:r.areaSqm*r.priceSqmGross+r.parkingGross+r.internetGross+(r.cleaningGross||0)};}
const SALARY_SOURCES=[['tur','Tur'],['terimex','Terimex'],['bj','BJ'],['maktronik','Maktronik']];
const HOTEL_FLOORS={'Smolańska 3':['Piwnica','Parter','1 piętro','2 piętro','3 piętro','4 piętro'],'Smolańska 4':['Piwnica','Parter','1 piętro','2 piętro','3 piętro'],Parking:['Parking']};
function isHotelTur(id){return /hotel\s*tur/i.test(getLoc(id)?.name||'');}
function rentalRoomLabel(room){return room?`${room.building} / ${room.floor} / ${room.number}`:'';}
function rentalCard(r){
  const total=rentalTotals(r),room=state.rentalRooms.find(x=>x.id===r.roomId),docs=state.rentalDocuments.filter(x=>x.rentalId===r.id);
  return `<article class="rental-card"><div class="rental-head"><div><h3>${esc(r.contractor)}</h3><small>NIP: ${esc(r.nip||'—')} • ${esc(r.contactPerson||'Brak osoby kontaktowej')}</small></div><button class="smallbtn" data-edit-rental="${esc(r.id)}">Edytuj</button></div>
  <div class="rental-meta"><span>Od ${esc(r.startsOn)}</span><span>${r.indefinite?'Na czas nieokreślony':`Do ${esc(r.endsOn||'—')}`}</span><span>${esc(r.areaSqm)} m²</span></div>
  ${r.registeredAddress?`<div class="rental-registered"><small>Adres firmy: ${esc(r.registeredAddress)}</small></div>`:''}<div class="rental-premises">${room?esc(rentalRoomLabel(room)):esc(r.premisesAddress||'Adres nie wpisany')}${!room&&r.premisesNumber?` • Lokal ${esc(r.premisesNumber)}`:''}</div>
  <div class="rental-payment ${esc(r.paymentStatus||'unmarked')}">${rentalPaymentLabel(r.paymentStatus)}</div>
  <div class="rental-prices"><div><small>Czynsz za m²</small><b>${rentMoney(r.priceSqmNet)} netto</b><span>${rentMoney(r.priceSqmGross)} brutto</span></div><div><small>Parking</small><b>${rentMoney(r.parkingNet)} netto</b><span>${rentMoney(r.parkingGross)} brutto</span></div><div><small>Internet</small><b>${rentMoney(r.internetNet)} netto</b><span>${rentMoney(r.internetGross)} brutto</span></div><div><small>Sprzątanie</small><b>${rentMoney(r.cleaningNet||0)} netto</b><span>${rentMoney(r.cleaningGross||0)} brutto</span></div></div>
  <div class="rental-total"><span>Miesięcznie łącznie</span><strong>${rentMoney(total.net)} netto<br>${rentMoney(total.gross)} brutto</strong></div>
  <div class="rental-contact">${r.phone?`<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>`:''}${r.email?`<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`:''}</div>
  <div class="rental-actions"><div class="subheading">Umowa PDF</div>${docs.map(d=>`<div class="rental-action"><span>📄 ${esc(d.name)} • ${bytes(d.size)}</span><button class="smallbtn" data-view-rental-pdf="${esc(d.id)}">Otwórz</button></div>`).join('')||'<small class="subtle">Brak pliku PDF.</small>'}<button class="smallbtn" data-add-rental-pdf="${esc(r.id)}">+ Dodaj PDF</button>${isAdmin()?`<button class="smallbtn gold" data-invoice-rental="${esc(r.id)}">+ Faktura z umowy</button>`:''}</div>
  <div class="rental-actions"><div class="subheading">Planowane dokumenty</div>${state.rentalActions.filter(a=>a.rentalId===r.id).map(a=>`<div class="rental-action"><span>${esc(rentalActionLabel(a.kind))} · ${esc(a.dueOn)}${a.completedAt?' · GOTOWE':''}</span>${!a.completedAt?`<button class="smallbtn" data-edit-rental-action="${esc(a.id)}">Edytuj</button>`:''}</div>`).join('')||'<small class="subtle">Brak zaplanowanych dokumentów.</small>'}<button class="smallbtn gold" data-add-rental-action="${esc(r.id)}">+ Cesja / aneks / wypowiedzenie</button></div></article>`;
}
function rentalDisclosure(key,title,inner,klass=''){
  return `<details class="rental-tree ${klass}" data-rental-tree="${esc(key)}" ${state.rentalExpanded[key]?'open':''}><summary>${esc(title)}</summary><div class="rental-tree-content">${inner}</div></details>`;
}
function renderHotelRooms(locId,rentals){
  const rooms=state.rentalRooms.filter(x=>x.locationId===locId);
  return `<div class="hotel-register">${Object.entries(HOTEL_FLOORS).map(([building,floors])=>{
    const content=floors.map(floor=>{
      const list=rooms.filter(x=>x.building===building&&x.floor===floor),key=`floor:${locId}:${building}:${floor}`;
      const rows=list.map(room=>{
        const contracts=rentals.filter(r=>r.roomId===room.id);
        return rentalDisclosure(`room:${room.id}`,`${room.number} · ${room.areaSqm} m² · ${contracts.length} umów`,
          `<div class="hotel-room"><small>${room.hasMeter?`Licznik prądu: ${room.meterReading==null?'brak odczytu':esc(room.meterReading)} ${room.meterReadOn?`(${esc(room.meterReadOn)})`:''}`:'Bez licznika prądu'}</small><div><button class="smallbtn" data-edit-room="${esc(room.id)}">Edytuj</button> <button class="smallbtn" data-room-rental="${esc(room.id)}">+ Umowa</button></div></div>${contracts.map(rentalCard).join('')||'<small class="subtle">Brak umów.</small>'}`,'rental-room-node');
      }).join('')||'<small class="subtle">Brak pomieszczeń.</small>';
      return rentalDisclosure(key,`${floor} · ${list.length} pomieszczeń`,`${rows}<button class="smallbtn" data-add-room="${esc(building)}" data-floor="${esc(floor)}">+ Pomieszczenie</button>`,'rental-floor-node');
    }).join('');
    return rentalDisclosure(`building:${locId}:${building}`,building,content,'rental-building-node');
  }).join('')}</div>`;
}
function invoiceDraftTotals(x){try{return window.ImperiumInvoice.calculate(x.lines);}catch(e){return null;}}
function renderInvoicesPage(){
  if(!isAdmin())return '';
  return `<div class="toolbar"><div><div class="eyebrow">SPRZEDAŻ</div><h2 class="section-title">Faktury</h2></div><div class="invoice-buttons"><button class="smallbtn" id="add-invoice-seller">+ Firma wystawiająca</button><button class="goldbtn" id="add-invoice" ${state.invoiceSellers.length?'':'disabled'}>+ Faktura</button></div></div>
  <div class="status-note">Wystawianie w IMPERIUM → KSeF → dokument dla Optimy. Teraz możesz skonfigurować firmy i przygotować szkice oraz plik FA(3). Wysyłka produkcyjna pojawi się po podłączeniu bezpiecznej usługi KSeF i uprawnień firm.</div>
  <div class="settings-card"><div class="subheading">Firmy wystawiające</div><div class="invoice-sellers">${state.invoiceSellers.map(s=>`<div class="invoice-seller"><span><b>${esc(s.name)}</b><small>NIP ${esc(s.nip)} · ${esc(s.streetAddress)}, ${esc(s.postalCity)}</small></span><button class="smallbtn" data-edit-invoice-seller="${esc(s.id)}">Edytuj</button></div>`).join('')||'<div class="empty compact">Dodaj firmę, która wystawia faktury.</div>'}</div></div>
  <div class="settings-card"><div class="subheading">Faktury i szkice</div><div class="invoice-list">${state.invoiceDrafts.map(x=>{const t=invoiceDraftTotals(x),s=state.invoiceSellers.find(y=>y.id===x.sellerId);return `<div class="invoice-entry"><div><b>${esc(x.number)}</b><small>${esc(s?.name||'Firma')} → ${esc(x.buyerName)} · ${esc(x.issueDate)}</small><small>${x.ksefNumber?`KSeF: ${esc(x.ksefNumber)}`:esc(({draft:'SZKIC · nie wysłano do KSeF',sending:'WYSYŁANIE · sprawdź status',processing:'KSeF · przetwarzanie',accepted:'PRZYJĘTA W KSeF',rejected:'ODRZUCONA · '+(x.ksefError||'')})[x.status]||x.status)}</small></div><div class="invoice-actions"><strong>${t?rentMoney(t.gross/100):'—'}</strong>${x.status==='draft'?`<button class="smallbtn" data-edit-invoice="${esc(x.id)}">Edytuj</button>`:''}<button class="smallbtn gold" data-view-invoice-pdf="${esc(x.id)}">PDF</button><button class="smallbtn" data-export-invoice="${esc(x.id)}">FA(3) XML</button></div></div>`}).join('')||'<div class="empty compact">Brak szkiców.</div>'}</div></div>`;
}
function renderRentalsPage(){
  if(!canManageRentals())return '';
  const locs=isAdmin()?state.db.locations:state.db.locations.filter(l=>currentUser().locationIds.includes(l.id));
  const locId=locs.some(l=>l.id===state.rentalLocationId)?state.rentalLocationId:null;
  state.rentalLocationId=locId;
  const rentals=state.rentals.filter(r=>r.locationId===locId);
  return `<div class="toolbar"><div><div class="eyebrow">Ewidencja najmu</div><h2 class="section-title">Umowy najmu</h2></div><button class="goldbtn" id="add-rental" ${locId?'':'disabled'}>+ Umowa najmu</button></div>
  <div class="rental-location-tabs">${locs.map(l=>`<button class="chip ${l.id===locId?'active':''}" data-rental-location="${esc(l.id)}">${esc(l.name)}</button>`).join('')}</div>
  ${locId&&isHotelTur(locId)?renderHotelRooms(locId,rentals):''}
  ${locId?`<div class="subheading">${isHotelTur(locId)?'Umowy bez przypisanego pomieszczenia':'Umowy — '+esc(getLoc(locId)?.name||'wybierz obiekt')}</div>
  <div class="rental-list">${rentals.filter(r=>!isHotelTur(locId)||!r.roomId||!state.rentalRooms.some(x=>x.id===r.roomId)).map(rentalCard).join('')||'<div class="empty">Brak umów w tym widoku.</div>'}</div>`:'<div class="empty">Wybierz obiekt, aby zobaczyć piętra i umowy.</div>'}`;
}
function renderLocationsPage(){
  const visible=isAdmin()?state.db.locations:state.db.locations.filter(l=>currentUser().locationIds.includes(l.id));
  return `<div class="toolbar"><div><div class="eyebrow">Struktura</div><h2 class="section-title">Obiekty / lokalizacje</h2></div>${isAdmin()?'<button class="goldbtn" id="add-location">+ Obiekt</button>':''}</div><div class="list">${visible.map(l=>{const count=state.db.tasks.filter(t=>t.locationId===l.id&&t.status!=='done').length;return `<div class="row"><div class="row-left"><div class="avatar">${initials(l.name)}</div><div class="row-main"><b>${esc(l.name)}</b><small>${esc([l.city,l.address].filter(Boolean).join(' • ')||'Brak adresu')}</small>${l.description?`<div class="subtle">${esc(l.description)}</div>`:''}</div></div><div class="row-actions"><span class="badge">${count} aktywne</span>${isAdmin()?`<button class="smallbtn" data-edit-location="${l.id}">Edytuj</button>`:''}</div></div>`}).join('')||'<div class="empty">Brak obiektów.</div>'}</div>`;
}
function attendanceDuration(a){return duration(new Date(a.endedAt||Date.now()).getTime()-new Date(a.startedAt).getTime());}
function renderAttendancePage(){
  const u=currentUser(), rows=(state.attendance||[]), active=rows.filter(a=>!a.endedAt);
  const mineActive=active.find(a=>a.userId===u.id);
  const visibleLocs=isAdmin()?state.db.locations:state.db.locations.filter(l=>u.locationIds.includes(l.id));
  const history=(isAdmin()?rows:rows.filter(a=>a.userId===u.id)).slice(0,100);
  const upcoming=shiftsFor(isAdmin()?null:u.id).filter(s=>new Date(s.endsAt)>Date.now()-86400000).slice(0,100);
  const adminControls=isAdmin()?`<div class="settings-card shift-admin"><div class="subheading">Grafik pracowników</div><div class="formgrid"><div class="field"><label>Pracownik</label><select id="shift-worker">${state.db.users.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>Obiekt</label><select id="shift-location">${state.db.locations.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>Początek zmiany</label><input id="shift-start" type="datetime-local"></div><div class="field"><label>Koniec zmiany</label><input id="shift-end" type="datetime-local"></div></div><button class="goldbtn" id="shift-add">+ Dodaj zmianę</button></div><div class="settings-card shift-admin"><div class="subheading">Meldowanie pracownika przez administratora</div><div class="formgrid"><div class="field"><label>Pracownik</label><select id="admin-attendance-worker">${state.db.users.filter(x=>x.active&&x.id!==u.id).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>Obiekt</label><select id="admin-attendance-location">${state.db.locations.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div></div><button class="goldbtn" id="admin-attendance-start">📍 Zamelduj pracownika</button></div>`:'';
  const checkin=`<div class="settings-card attendance-checkin"><div class="subheading">Twój meldunek</div>${mineActive?`<div class="attendance-active"><div><span class="attendance-dot"></span><b>${esc(getLoc(mineActive.locationId)?.name||'Obiekt')}</b><small>Praca rozpoczęta: ${fmtDate(mineActive.startedAt)}</small>${isAdmin()?`<button class="attendance-timer-edit" data-edit-attendance-start="${esc(mineActive.id)}" title="Zmień godzinę rozpoczęcia" aria-label="Zmień godzinę rozpoczęcia mojego meldunku"><strong data-attendance-start="${mineActive.startedAt}">${attendanceDuration(mineActive)}</strong><span>✎ Zmień początek</span></button>`:`<strong data-attendance-start="${mineActive.startedAt}">${attendanceDuration(mineActive)}</strong>`}</div><button class="dangerbtn" id="attendance-stop">Zakończ pracę</button></div>`:`<div class="field"><label>Obiekt</label><select id="attendance-location">${visibleLocs.filter(l=>l.active!==false).map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></div><button class="goldbtn" id="attendance-start" ${visibleLocs.length?'':'disabled'}>📍 Zamelduj się</button>${visibleLocs.length?'':'<div class="status-note">Brak aktywnych obiektów dostępnych do meldunku.</div>'}`}</div>`;
  return `<section class="hero"><div class="hero-card"><div class="eyebrow">EWIDENCJA OBECNOŚCI</div><h2>📍 Meldunek na obiekcie</h2><p>${isAdmin()?'Zamelduj swoją obecność i sprawdź, kto aktualnie pracuje na obiektach.':'Zamelduj swoją obecność na obiekcie. IMPERIUM zapisze dokładny czas rozpoczęcia i zakończenia.'}</p></div></section>
  ${checkin}
  ${isAdmin()?`<div class="settings-card"><div class="subheading">Trwające meldunki · dotknij czasu, aby poprawić początek</div><div class="attendance-live">${active.length?active.map(a=>`<div class="attendance-live-row"><span class="attendance-dot"></span><div><b>${esc(getUser(a.userId)?.name||'Pracownik')}</b><small>${esc(getLoc(a.locationId)?.name||'Obiekt')} • od ${fmtDate(a.startedAt)}${a.startedBy?` • meldował: ${esc(getUser(a.startedBy)?.name||'Admin')}`:''}</small></div><button class="attendance-timer-edit" data-edit-attendance-start="${esc(a.id)}" title="Zmień godzinę rozpoczęcia"><strong data-attendance-start="${a.startedAt}">${attendanceDuration(a)}</strong><span>✎ Zmień początek</span></button>${a.userId!==u.id?`<button class="smallbtn" data-admin-attendance-stop="${a.userId}">Zakończ</button>`:''}</div>`).join(''):'<div class="empty compact">Nikt nie jest teraz zameldowany.</div>'}</div></div>`:''}
  ${adminControls}
  <div class="settings-card shift-list"><div class="subheading">${isAdmin()?'Grafik zespołu':'Mój grafik'}</div>${upcoming.length?upcoming.map(s=>`<div class="shift-row"><div><b>${esc(getUser(s.userId)?.name||'Pracownik')}</b><small>${esc(getLoc(s.locationId)?.name||'Obiekt')} • ${fmtDate(s.startsAt)} → ${fmtDate(s.endsAt)}</small></div>${isAdmin()?`<button class="smallbtn" data-shift-delete="${s.id}">Usuń</button>`:''}</div>`).join(''):'<div class="empty compact">Brak zaplanowanych zmian.</div>'}</div>
  <div class="toolbar"><div><div class="eyebrow">Dziennik pracy</div><h2 class="section-title">${isAdmin()?'Historia meldunków':'Moja historia'}</h2></div></div>
  <div class="settings-card attendance-history">${history.length?history.map(a=>`<div class="attendance-row"><div><b>${esc(getUser(a.userId)?.name||'Pracownik')}</b><small>⌖ ${esc(getLoc(a.locationId)?.name||'Obiekt')}</small></div><div class="attendance-times"><span>${fmtDate(a.startedAt)} → ${a.endedAt?fmtDate(a.endedAt):'TERAZ'}</span><b>${attendanceDuration(a)}</b>${isAdmin()?`<button class="smallbtn" data-edit-attendance-start="${esc(a.id)}">Zmień początek</button>`:''}</div></div>`).join(''):'<div class="empty">Brak meldunków.</div>'}</div>`;
}
async function startAttendance(){
  const locationId=document.getElementById('attendance-location')?.value;if(!locationId)return toast('Wybierz obiekt.');
  await withAction('Rozpoczynanie pracy…',async()=>{
    if(state.mode==='demo'){state.db.attendance ||= [];const a={id:uid(),userId:currentUser().id,locationId,startedAt:nowISO(),endedAt:null};state.db.attendance.unshift(a);state.attendance=state.db.attendance;await logEvent('attendance_start',`${currentUser().name} rozpoczął pracę — ${getLoc(locationId)?.name||'obiekt'}`);saveDemoDB();}
    else{await cloudFetch('/rest/v1/rpc/start_work_attendance',{method:'POST',body:{p_location_id:locationId}});await logEvent('attendance_start',`${currentUser().name} rozpoczął pracę — ${getLoc(locationId)?.name||'obiekt'}`);await loadCloudDB({silent:true});}
    notify('Meldunek IMPERIUM',`Rozpoczęto pracę: ${getLoc(locationId)?.name||'obiekt'}`);
  });
}
async function stopAttendance(){
  const a=(state.attendance||[]).find(x=>x.userId===currentUser().id&&!x.endedAt);if(!a)return;
  await withAction('Kończenie pracy…',async()=>{
    if(state.mode==='demo'){a.endedAt=nowISO();creditDemoSalaryAttendance(a);await logEvent('attendance_stop',`${currentUser().name} zakończył pracę — ${getLoc(a.locationId)?.name||'obiekt'}`);saveDemoDB();}
    else{await cloudFetch('/rest/v1/rpc/stop_work_attendance',{method:'POST',body:{}});state.salaryLoadedMonth=null;await logEvent('attendance_stop',`${currentUser().name} zakończył pracę — ${getLoc(a.locationId)?.name||'obiekt'}`);await loadCloudDB({silent:true});}
    notify('Meldunek IMPERIUM',`Zakończono pracę: ${getLoc(a.locationId)?.name||'obiekt'}`);
  });
}
async function addWorkShift(){
  if(!isAdmin())return;
  const userId=document.getElementById('shift-worker')?.value,locationId=document.getElementById('shift-location')?.value;
  const start=new Date(document.getElementById('shift-start')?.value),end=new Date(document.getElementById('shift-end')?.value);
  if(!userId||!locationId||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>86400000)return toast('Podaj pracownika, obiekt i prawidłowe godziny zmiany.');
  await withAction('Zapisywanie grafiku…',async()=>{
    if(state.mode==='demo'){
      state.db.shifts ||= [];
      if(state.db.shifts.some(s=>s.userId===userId&&new Date(s.startsAt)<end&&new Date(s.endsAt)>start))throw Error('Zmiany tego pracownika nakładają się.');
      state.db.shifts.push({id:uid(),userId,locationId,startsAt:start.toISOString(),endsAt:end.toISOString()});saveDemoDB();
    }else{
      await cloudFetch('/rest/v1/rpc/add_work_shift',{method:'POST',body:{p_profile:userId,p_location:locationId,p_start:start.toISOString(),p_end:end.toISOString()}});
      await loadCloudDB({silent:true});
    }
    toast('Zmiana zapisana.');
  });
}
async function deleteWorkShift(id){
  if(!isAdmin())return;
  await withAction('Usuwanie zmiany…',async()=>{
    if(state.mode==='demo'){
      const s=state.db.shifts.find(x=>x.id===id);
      if(s&&voucherRows(s.userId).some(v=>v.startsAt&&new Date(v.startsAt)<new Date(s.endsAt)&&new Date(v.endsAt)>new Date(s.startsAt)))throw Error('Zmiana ma już przypisany voucher.');
      state.db.shifts=state.db.shifts.filter(x=>x.id!==id);saveDemoDB();
    }else{await cloudFetch('/rest/v1/rpc/delete_work_shift',{method:'POST',body:{p_id:id}});await loadCloudDB({silent:true});}
  });
}
async function adminStartAttendance(){
  if(!isAdmin())return;
  const userId=document.getElementById('admin-attendance-worker')?.value,locationId=document.getElementById('admin-attendance-location')?.value;
  if(!userId||!locationId)return toast('Wybierz pracownika i obiekt.');
  await withAction('Meldowanie pracownika…',async()=>{
    if(state.mode==='demo'){
      if(state.db.attendance.some(a=>a.userId===userId&&!a.endedAt))throw Error('Pracownik jest już zameldowany.');
      const a={id:uid(),userId,locationId,startedAt:nowISO(),endedAt:null,startedBy:currentUser().id};state.db.attendance.unshift(a);state.attendance=state.db.attendance;saveDemoDB();
    }else{await cloudFetch('/rest/v1/rpc/admin_start_attendance',{method:'POST',body:{p_profile:userId,p_location:locationId}});await loadCloudDB({silent:true});}
    await logEvent('attendance_start',`Administrator zameldował ${getUser(userId)?.name||'pracownika'} — ${getLoc(locationId)?.name||'obiekt'}`);
  });
}
async function saveAttendanceStart(){
  if(!isAdmin())return;
  const a=state.attendance.find(x=>x.id===state.attendanceId),input=document.getElementById('f-attendance-start')?.value;
  if(!a||!input)return toast('Wybierz datę i godzinę.');
  const start=new Date(input),end=a.endedAt?new Date(a.endedAt):new Date();
  if(!Number.isFinite(start.getTime())||start>new Date()||start>=end)return toast('Początek musi być przed końcem meldunku i nie może być w przyszłości.');
  const overlaps=state.attendance.some(other=>other.id!==a.id&&other.userId===a.userId&&new Date(other.startedAt)<end&&new Date(other.endedAt||Date.now())>start);
  if(overlaps)return toast('Ten czas nakłada się na inny meldunek pracownika.');
  await withAction('Poprawianie godziny rozpoczęcia…',async()=>{
    if(state.mode==='demo'){a.startedAt=start.toISOString();creditDemoSalaryAttendance(a);saveDemoDB();}
    else{await cloudFetch('/rest/v1/rpc/admin_change_attendance_start',{method:'POST',body:{p_attendance_id:a.id,p_started_at:start.toISOString()}});state.salaryLoadedMonth=null;await loadCloudDB({silent:true});}
    await logEvent('attendance_edit',`Poprawiono początek pracy: ${getUser(a.userId)?.name||'pracownik'} · ${getLoc(a.locationId)?.name||'obiekt'}`);
    state.modal=null;state.attendanceId=null;
  });
}
async function adminStopAttendance(userId){
  if(!isAdmin())return;
  await withAction('Kończenie meldunku…',async()=>{
    if(state.mode==='demo'){
      const a=state.db.attendance.find(x=>x.userId===userId&&!x.endedAt);if(!a)throw Error('Brak aktywnego meldunku.');a.endedAt=nowISO();a.endedBy=currentUser().id;creditDemoSalaryAttendance(a);saveDemoDB();
    }else{await cloudFetch('/rest/v1/rpc/admin_stop_attendance',{method:'POST',body:{p_profile:userId}});state.salaryLoadedMonth=null;await loadCloudDB({silent:true});}
    await logEvent('attendance_stop',`Administrator zakończył meldunek: ${getUser(userId)?.name||'pracownik'}`);
  });
}
function renderActivityPage(){return `<div class="toolbar"><div><div class="eyebrow">Dziennik</div><h2 class="section-title">Aktywność</h2></div></div><div class="settings-card">${state.db.events.slice(0,100).map(e=>`<div class="activity"><p>${esc(e.text)}</p><small>${fmtDate(e.createdAt)}</small></div>`).join('')||'<div class="empty">Brak zdarzeń.</div>'}</div>`;}
function renderTeamPage(){
  return `<div class="toolbar"><div><div class="eyebrow">Ludzie</div><h2 class="section-title">Zespół</h2></div>${isAdmin()&&state.mode==='demo'?'<button class="goldbtn" id="add-user">+ Pracownik</button>':''}</div>${isAdmin()?`<div class="voucher-exchange"><div class="eyebrow">KONTROLA VOUCHERÓW</div><h3>Aktywne i do wypłaty</h3><div class="voucher-list">${voucherRows().filter(v=>voucherState(v)==='Aktywny'||voucherState(v)==='Do wypłaty').map(v=>voucherCard(v,true)).join('')||'<div class="empty compact">Brak aktywnych voucherów i premii do wypłaty.</div>'}</div></div>`:''}${isAdmin()&&state.mode==='cloud'?'<div class="status-note">Nowy pracownik instaluje ten sam APK i wybiera „Utwórz konto pracownika”. Potem tutaj przypisujesz mu obiekty i możesz otworzyć jego kartę pracy.</div>':''}<div class="list">${state.db.users.map(u=>{const st=workerStats(u.id,'all');return `<div class="row"><div class="row-left"><div class="avatar">${initials(u.name)}</div><div class="row-main"><b>${esc(u.name)} ${u.active?'':'(nieaktywny)'}</b><small>${u.role==='admin'?'Administrator':'Pracownik'} • ${u.locationIds.map(id=>getLoc(id)?.name).filter(Boolean).join(', ')||'bez obiektów'}</small><div class="mini-metrics">${isAdmin()||u.id===currentUser().id?`<span class="coin-mini">🪙 ${coinBalance(u.id)} NK</span>`:''}<span>✓ ${st.done}</span><span class="${st.late?'metric-bad':''}">⏱ ${st.late} po terminie</span><span class="${st.warnings+st.reprimands?'metric-bad':''}">⚠ ${st.records.length} wpisów</span></div></div></div><div class="row-actions"><button class="smallbtn" data-public-profile="${u.id}">Profil / wiadomość</button>${isAdmin()||u.id===currentUser().id||canViewTeamHours()&&u.locationIds.some(id=>currentUser().locationIds.includes(id))?`<button class="smallbtn gold" data-worker-card="${u.id}">Karta</button>`:''}${isAdmin()?`<button class="smallbtn" data-edit-user="${u.id}">Edytuj</button>`:''}</div></div>`}).join('')}</div>`;
}
function taskProgressStats(userId){
  const all=state.db.tasks||[], mine=all.filter(t=>t.claimedBy===userId||t.assignedTo===userId);
  const done=mine.filter(t=>t.status==='done').length, active=mine.filter(t=>t.status!=='done').length;
  return {mine,done,active,total:mine.length,pct:mine.length?Math.round(done/mine.length*100):0};
}
function renderProgressBar(label,done,total,pct,extra=''){
  return `<div class="progress-module"><div class="progress-head"><div><span>${label}</span><b>${done} / ${total}</b></div><strong>${pct}%</strong></div><div class="progress-track"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div>${extra?`<small>${extra}</small>`:''}</div>`;
}
let publicProfileId=null, profileMessages=[], profileUnread=0, profileMessageTimer=null, profileMessageBusy=false, profileSendBusy=false;
function profileMessengerButton(){return `<button id="profile-messenger" class="messenger-round ${profileUnread?'has-unread':''}" aria-label="Wiadomości w moim profilu${profileUnread?': '+profileUnread+' nieprzeczytanych':''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4zM8 8h8M8 12h6"/></svg><span class="messenger-count" ${profileUnread?'':'hidden'}>${profileUnread>99?'99+':profileUnread}</span></button>`;}
function profileMessageNavigation(){return `<div class="profile-tabs"><button class="smallbtn" data-profile-home>Mój profil</button><button class="smallbtn" data-profile-inbox>Moje wiadomości${profileUnread?' ('+profileUnread+')':''}</button><button class="smallbtn" data-profile-members>Uczestnicy</button></div>`;}
function openPublicProfile(id){const u=getUser(id);if(!u)return;state.modal=null;state.tab='profile';publicProfileId=id===currentUser().id?null:id;state.profileView=publicProfileId?'visitor':'mine';profileMessages=[];render();}
function openProfileInbox(){state.modal=null;state.tab='profile';state.profileView='messages';publicProfileId=null;profileMessages=[];render();}
function renderPublicProfile(){const u=getUser(publicProfileId);if(!u){publicProfileId=null;return renderProfilePage();}return `<section class="profile-page">${profileMessageNavigation()}<div class="profile-command"><div class="profile-ident"><div class="profile-monogram">${initials(u.name)}</div><div><div class="eyebrow">PROFIL UCZESTNIKA</div><h2>${esc(u.name)}</h2><p>${u.role==='admin'?'Administrator':'Pracownik'}${u.active?'':' · nieaktywny'}</p></div></div></div>${renderProfileMessages(u)}</section>`;}
function renderProfileMessages(u=currentUser()){const own=u.id===currentUser().id;return `<section class="profile-messages panel" data-profile-target="${esc(u.id)}"><h3>${own?'Moje wiadomości':'Wiadomości do: '+esc(u.name)}</h3><p class="subtle">${own?'Odebrane i wysłane wiadomości. Wybierz nadawcę, aby odpowiedzieć.':'Korespondencję widzisz tylko Ty i '+esc(u.name)+'.'}</p><div id="profile-message-list" class="profile-message-list"><div class="empty compact">Ładowanie wiadomości…</div></div>${own?'':u.active?`<div class="profile-message-compose"><textarea id="profile-message-input" rows="3" maxlength="2000" placeholder="Napisz wiadomość…" aria-label="Wiadomość do uczestnika"></textarea><button id="profile-message-send" class="goldbtn">Wyślij wiadomość</button></div>`:'<p class="subtle">Konto nieaktywne — wysyłanie wyłączone.</p>'}<div id="profile-message-error" class="danger-text" role="status"></div></section>`;}
function profileVisibleMessages(target){const me=currentUser().id;return profileMessages.filter(m=>target===me?(m.receiver_id===me||m.sender_id===me):(m.receiver_id===target&&m.sender_id===me||m.sender_id===target&&m.receiver_id===me));}
function updateProfileMessenger(){const old=document.getElementById('profile-messenger');if(old){old.outerHTML=profileMessengerButton();document.getElementById('profile-messenger').onclick=openProfileInbox;}}
function ensureProfileMessagePolling(){if(!currentUser())return;if(!profileMessageTimer)profileMessageTimer=setInterval(()=>{if(document.visibilityState!=='hidden')loadProfileMessages();},5000);loadProfileMessages();}
async function loadProfileMessages(){
  const me=currentUser()?.id;if(!me||profileMessageBusy)return;profileMessageBusy=true;const target=publicProfileId||me,show=state.tab==='profile'&&(!!publicProfileId||state.profileView==='messages');
  try{
    if(state.mode==='demo'){profileMessages=state.db.profileMessages||[];profileUnread=profileMessages.filter(m=>m.receiver_id===me&&!m.read_at).length;}
    else{profileUnread=Number(await cloudFetch('/rest/v1/rpc/profile_message_unread_count',{method:'POST',body:{}}))||0;if(show)profileMessages=await pgGet(`profile_messages?select=id,sender_id,receiver_id,body,created_at,read_at&${target===me?'or=(sender_id.eq.'+me+',receiver_id.eq.'+me+')':'or=(and(sender_id.eq.'+me+',receiver_id.eq.'+target+'),and(sender_id.eq.'+target+',receiver_id.eq.'+me+'))'}&order=created_at.desc&limit=200`);}
    if(currentUser()?.id!==me)return;updateProfileMessenger();
    const box=document.getElementById('profile-message-list');if(!show||state.tab!=='profile'||(publicProfileId||me)!==target||!box)return;
    const rows=profileVisibleMessages(target),fingerprint=JSON.stringify(rows),scroll=box.scrollTop;
    if(box.dataset.fingerprint!==fingerprint){box.innerHTML=rows.map(m=>{const mine=m.sender_id===me,other=mine?m.receiver_id:m.sender_id;return `<article class="profile-message ${mine?'sent':'received'}"><div><button class="profile-author" data-public-profile="${esc(other)}">${mine?'Do: ':'Od: '}${esc(getUser(other)?.name||'Uczestnik')}</button><small>${fmtDate(m.created_at)}${!mine&&!m.read_at?' · NOWA':''}</small></div><p>${esc(m.body)}</p>${!mine?`<button class="smallbtn" data-public-profile="${esc(other)}">Odpowiedz</button>`:''}</article>`;}).join('')||'<div class="empty compact">Brak wiadomości. Rozpocznij rozmowę.</div>';box.dataset.fingerprint=fingerprint;box.scrollTop=scroll;bindPublicProfileLinks(box);}
    const ids=rows.filter(m=>m.receiver_id===me&&!m.read_at).map(m=>m.id);
    if(ids.length&&document.visibilityState!=='hidden'){
      if(state.mode==='demo'){for(const m of profileMessages)if(ids.includes(m.id))m.read_at=nowISO();saveDemoDB();}
      else await cloudFetch('/rest/v1/rpc/mark_profile_messages_read',{method:'POST',body:{p_ids:ids}});
      if(currentUser()?.id!==me)return;profileUnread=Math.max(0,profileUnread-ids.length);updateProfileMessenger();
    }
  }catch(e){const box=document.getElementById('profile-message-error');if(box)box.textContent='Nie udało się pobrać wiadomości: '+e.message;}finally{profileMessageBusy=false;}
}
async function sendProfileMessage(){if(profileSendBusy)return;const target=publicProfileId,u=getUser(target),input=document.getElementById('profile-message-input'),body=input?.value.trim();if(!u?.active||!body)return;profileSendBusy=true;const button=document.getElementById('profile-message-send');button.disabled=true;
  try{if(state.mode==='demo'){state.db.profileMessages ||= [];state.db.profileMessages.unshift({id:uid(),sender_id:currentUser().id,receiver_id:target,body,created_at:nowISO(),read_at:null});saveDemoDB();}
    else await pgPost('profile_messages',{sender_id:currentUser().id,receiver_id:target,body});if(input.isConnected)input.value='';await loadProfileMessages();toast('Wiadomość wysłana.');
  }catch(e){toast('Nie udało się wysłać: '+e.message);}finally{profileSendBusy=false;if(button.isConnected)button.disabled=false;}}
function bindPublicProfileLinks(root=document){root.querySelectorAll('[data-public-profile]').forEach(b=>b.onclick=()=>openPublicProfile(b.dataset.publicProfile));}
function bindProfileMessaging(){bindPublicProfileLinks();document.getElementById('profile-messenger')?.addEventListener('click',openProfileInbox);document.querySelectorAll('[data-profile-inbox]').forEach(b=>b.onclick=openProfileInbox);document.querySelectorAll('[data-profile-home]').forEach(b=>b.onclick=()=>{publicProfileId=null;state.profileView='mine';state.tab='profile';render();});document.querySelectorAll('[data-profile-members]').forEach(b=>b.onclick=()=>{state.tab='team';render();});document.getElementById('profile-message-send')?.addEventListener('click',sendProfileMessage);document.getElementById('profile-message-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();sendProfileMessage();}});ensureProfileMessagePolling();}

function renderProfilePage(){
  if(publicProfileId)return renderPublicProfile();
  if(state.profileView==='messages')return `<section class="profile-page">${profileMessageNavigation()}${renderProfileMessages()}</section>`;
  const u=currentUser(), ps=taskProgressStats(u.id), all=state.db.tasks||[], allDone=all.filter(t=>t.status==='done').length, allPct=all.length?Math.round(allDone/all.length*100):0;
  const active=ps.mine.filter(t=>t.status!=='done'&&!(t.status==='open'&&t.scheduledStart&&new Date(t.scheduledStart)>new Date()&&t.assignedTo===u.id)).sort((a,b)=>new Date(a.deadlineAt||a.createdAt)-new Date(b.deadlineAt||b.createdAt));
  const planned=ps.mine.filter(t=>t.status==='open'&&t.scheduledStart&&new Date(t.scheduledStart)>new Date()&&t.assignedTo===u.id).sort((a,b)=>new Date(a.scheduledStart)-new Date(b.scheduledStart));
  const completed=ps.mine.filter(t=>t.status==='done').slice().sort((a,b)=>new Date(b.completedAt||b.createdAt)-new Date(a.completedAt||a.createdAt)).slice(0,5);
  return `<section class="profile-page">
    ${profileMessageNavigation()}
    ${canViewTeamHours()?`<div class="profile-tabs"><button class="smallbtn ${state.profileView==='mine'?'gold':''}" data-profile-view="mine">Mój profil</button><button class="smallbtn ${state.profileView==='team'?'gold':''}" data-profile-view="team">Obiekty i zespół</button></div>`:''}
    ${state.profileView==='team'&&canViewTeamHours()?renderTeamHoursPage():`<div class="profile-command"><div class="profile-ident"><div class="profile-monogram">${initials(u.name)}</div><div><div class="eyebrow">PERSONAL COMMAND FILE</div><h2>${esc(u.name)}</h2><p>${u.role==='admin'?'ADMINISTRATOR':'PRACOWNIK'} • ${u.locationIds.map(id=>getLoc(id)?.name).filter(Boolean).join(' / ')||'CENTRALA'}</p></div></div><div class="profile-balance"><span>SALDO</span><b>${coinBalance(u.id)} NK</b></div></div>
    ${renderExtraMissionsSection()}
    <div class="profile-progress-grid">${renderProgressBar('MOJA REALIZACJA',ps.done,ps.total,ps.pct,ps.active+' aktywnych')}${renderProgressBar('REALIZACJA IMPERIUM',allDone,all.length,allPct,'wszystkie zadania systemu')}</div>
    <div class="settings-card shift-list"><div class="subheading">Mój grafik pracy</div>${shiftsFor(u.id).filter(s=>new Date(s.endsAt)>Date.now()-86400000).slice(0,20).map(s=>`<div class="shift-row"><div><b>${esc(getLoc(s.locationId)?.name||'Obiekt')}</b><small>${fmtDate(s.startsAt)} → ${fmtDate(s.endsAt)}</small></div></div>`).join('')||'<div class="empty compact">Administrator nie dodał jeszcze zmian.</div>'}</div>
    <div class="voucher-exchange"><div class="eyebrow">WYMIANA NK</div><h3>Imperatorski wymiennik</h3><div class="voucher-options"><label><input type="radio" name="voucher-kind" value="hours_2" checked> 1000 NK · 2 godziny</label><label><input type="radio" name="voucher-kind" value="hours_4"> 2000 NK · 4 godziny</label><label><input type="radio" name="voucher-kind" value="day"> 5000 NK · dzień wolny</label><label><input type="radio" name="voucher-kind" value="bonus_500"> 7500 NK · premia 500 zł</label></div><div class="field" id="voucher-time-field"><label>Początek wolnego (data i godzina)</label><input type="datetime-local" id="voucher-start"></div><div class="field" id="voucher-day-field" hidden><label>Dzień wolny</label><input type="date" id="voucher-day"></div><p class="subtle">Godziny wolnego muszą mieścić się w zapisanej zmianie, a dzień wolny wymaga zmiany w tym dniu. Punkty są pobierane przy wymianie. Premia tworzy wniosek widoczny dla administratora; wypłata jest potwierdzana osobno.</p><button class="goldbtn" id="redeem-voucher">Wymień Nikitocoiny</button></div>
    <div class="profile-section-head compact"><div><div class="eyebrow">MOJE KORZYŚCI</div><h3>Vouchery</h3></div></div><div class="voucher-list">${voucherRows(u.id).map(v=>voucherCard(v)).join('')||'<div class="empty compact">Nie masz jeszcze voucherów.</div>'}</div>
    <div class="profile-section-head"><div><div class="eyebrow">PLAN</div><h3>Zaplanowane zadania</h3></div><span>${planned.length} ZAPLANOWANE</span></div><div class="profile-missions">${planned.map(t=>taskCard(t,u)).join('')||'<div class="empty compact">Brak zaplanowanych zadań.</div>'}</div>
    <div class="profile-section-head"><div><div class="eyebrow">PRZYDZIAŁ</div><h3>Moje zadania</h3></div><span>${active.length} AKTYWNE</span></div>
    <div class="profile-missions">${active.length?active.map(t=>taskCard(t,u)).join(''):'<div class="empty">Brak aktywnych zadań.</div>'}</div>
    <div class="profile-section-head compact"><div><div class="eyebrow">ARCHIWUM</div><h3>Ostatnio wykonane</h3></div></div>
    <div class="profile-history">${completed.length?completed.map(t=>`<button class="history-row" data-history-task="${t.id}"><span><b>${esc(t.title)}</b><small>${esc(getLoc(t.locationId)?.name||'')} • ${fmtDate(t.completedAt||t.createdAt)}</small></span><em>WYKONANE</em></button>`).join(''):'<div class="empty compact">Brak wykonanych zadań.</div>'}</div>
  `}
  </section>`;
}

const teamDayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'});
const teamDay=iso=>teamDayFormat.format(new Date(iso));
const teamHours=ms=>(Math.max(0,ms)/3600000).toLocaleString('pl-PL',{minimumFractionDigits:1,maximumFractionDigits:1});
function teamDailyHours(rows,month){
  const totals={};
  for(const a of rows){
    const start=new Date(a.startedAt).getTime(),end=new Date(a.endedAt||Date.now()).getTime();
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
    let cursor=start,guard=0;
    while(cursor<end&&guard++<370){
      const day=teamDay(cursor),max=Math.min(end,cursor+36*3600000);
      let next=max;
      if(teamDay(max-1)!==day){let lo=cursor+1,hi=max;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(teamDay(mid)===day)lo=mid+1;else hi=mid;}next=lo;}
      if(day.startsWith(month))totals[day]=(totals[day]||0)+(next-cursor);
      cursor=next;
    }
  }
  return totals;
}
async function loadTeamMonth(){
  if(!canViewTeamHours())return;
  const month=state.teamMonth;
  if(state.mode==='demo'){state.teamMonthRows=(state.db.attendance||[]);state.teamMonthLoaded=month;state.teamMonthOwner=currentUser().id;render();return;}
  state.teamMonthLoaded=null;render();
  try{
    const [year,m]=month.split('-').map(Number),start=new Date(Date.UTC(year,m-1,1)).toISOString(),end=new Date(Date.UTC(year,m,1)).toISOString();
    const rows=await pgGet(`work_attendance?select=*&started_at=lt.${encodeURIComponent(end)}&or=(ended_at.gte.${encodeURIComponent(start)},ended_at.is.null)&order=started_at.asc&limit=5000`);
    if(state.teamMonth!==month)return;
    state.teamMonthRows=rows.map(a=>({id:a.id,userId:a.profile_id,locationId:a.location_id,startedAt:a.started_at,endedAt:a.ended_at,startedBy:a.started_by,endedBy:a.ended_by}));state.teamMonthLoaded=month;state.teamMonthOwner=currentUser().id;render();
  }catch(e){state.teamMonthLoaded='error';render();toast(e.message||'Nie udało się pobrać ewidencji.');}
}
function renderTeamHoursPage(){
  const u=currentUser(),locationIds=new Set(isAdmin()?state.db.locations.map(l=>l.id):u.locationIds);
  const month=state.teamMonth,loaded=state.teamMonthLoaded===month&&state.teamMonthOwner===u.id,rows=(loaded?state.teamMonthRows:[]).filter(a=>locationIds.has(a.locationId));
  const related=state.db.users.filter(x=>x.role==='worker'&&x.locationIds.some(id=>locationIds.has(id)));
  const selected=state.teamWorker==='all'?related:related.filter(x=>x.id===state.teamWorker);
  const tasks=state.db.tasks.filter(t=>t.status==='done'&&locationIds.has(t.locationId)&&t.claimedBy&&(state.teamWorker==='all'||t.claimedBy===state.teamWorker)).sort((a,b)=>new Date(b.completedAt||0)-new Date(a.completedAt||0));
  const today=teamDay(new Date()),[year,m]=month.split('-').map(Number),days=new Date(Date.UTC(year,m,0)).getUTCDate(),first=new Date(Date.UTC(year,m-1,1)).getUTCDay();
  const monthLabel=new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,m-1,1)));
  return `<div class="team-hours"><div class="profile-section-head"><div><div class="eyebrow">NADZÓR OBIEKTÓW</div><h3>Obiekty i zespół</h3></div></div><p class="subtle">${isAdmin()?'Wszystkie obiekty':'Tylko przypisane obiekty'} • godziny według meldunków w czasie polskim</p>
  <div class="settings-card"><div class="subheading">Wykonane zadania</div>${tasks.map(t=>`<div class="team-log-row"><b>${esc(getUser(t.claimedBy)?.name||'Pracownik')} · ${esc(t.title)}</b><small>${esc(getLoc(t.locationId)?.name||'Obiekt')} · ${fmtDate(t.completedAt)}</small></div>`).join('')||'<div class="empty compact">Brak wykonanych zadań.</div>'}</div>
  <div class="settings-card"><div class="subheading">Rozpoczęcie i zakończenie pracy</div><div class="team-month-controls"><button class="smallbtn" data-team-month="-1">‹</button><strong>${esc(monthLabel)}</strong><button class="smallbtn" data-team-month="1">›</button></div><div class="field"><label>Pracownik</label><select id="team-worker"><option value="all">Wszyscy pracownicy</option>${related.map(x=>`<option value="${esc(x.id)}" ${x.id===state.teamWorker?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>${!loaded?`<div class="empty compact">${state.teamMonthLoaded==='error'?'Nie udało się pobrać meldunków. Zmień miesiąc, aby spróbować ponownie.':'Wczytywanie meldunków…'}</div>`:rows.filter(a=>state.teamWorker==='all'||a.userId===state.teamWorker).sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt)).slice(0,100).map(a=>`<div class="team-log-row"><b>${esc(getUser(a.userId)?.name||'Pracownik')} · ${esc(getLoc(a.locationId)?.name||'Obiekt')}</b><small>${fmtDate(a.startedAt)} → ${a.endedAt?fmtDate(a.endedAt):'W pracy'} · ${attendanceDuration(a)}</small></div>`).join('')||'<div class="empty compact">Brak meldunków w tym miesiącu.</div>'}</div>
  ${loaded?selected.map(worker=>{const own=rows.filter(a=>a.userId===worker.id),totals=teamDailyHours(own,month),planned=teamDailyHours(shiftsFor(worker.id).filter(x=>locationIds.has(x.locationId)).map(x=>({startedAt:x.startsAt,endedAt:x.endsAt})),month),sum=Object.values(totals).reduce((a,b)=>a+b,0);return `<div class="settings-card team-calendar-card"><div class="subheading">${esc(worker.name)} · ${teamHours(sum)} godz.</div><div class="team-calendar">${['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(x=>`<span class="team-weekday">${x}</span>`).join('')}${Array.from({length:(first+6)%7},()=>'<span></span>').join('')}${Array.from({length:days},(_,n)=>{const day=String(n+1).padStart(2,'0'),key=`${month}-${day}`,hours=totals[key]||0;return `<div class="team-day ${key===today?'today':''} ${hours?'worked':''}"><b>${n+1}</b><small>${hours?teamHours(hours)+' h':'—'}${planned[key]?`<span>plan ${teamHours(planned[key])} h</span>`:''}</small></div>`;}).join('')}</div></div>`;}).join(''):''}</div>`;
}

function renderWorkerPlans(u){
  const locations=new Set(isAdmin()?state.db.locations.map(l=>l.id):currentUser().locationIds);
  const tasks=state.db.tasks.filter(t=>t.assignedTo===u.id&&t.scheduledStart&&t.status!=='done'&&locations.has(t.locationId))
    .sort((a,b)=>new Date(a.scheduledStart)-new Date(b.scheduledStart));
  return `<div class="settings-card worker-plans"><div class="subheading">Planowane zadania · ${esc(u.name)}</div>${tasks.map(t=>`<button class="history-row" data-history-task="${esc(t.id)}"><span><b>${esc(t.title)}</b><small>${esc(getLoc(t.locationId)?.name||'Obiekt')} · ${fmtDate(t.scheduledStart)} → ${fmtDate(t.scheduledEnd)}</small></span><em>${taskStatusLabel(t.status)}</em></button>`).join('')||'<div class="empty compact">Brak planowanych zadań.</div>'}</div>`;
}
function pendingImportantCount(){return (state.importantAlerts||[]).filter(a=>!a.inProgressAt).length;}
function importantIndicatorClass(){const n=pendingImportantCount();return n>=4?'important-level-red':n>=2?'important-level-yellow':n===1?'important-level-blue':'';}
function hasSoonMission(){const now=Date.now();return importantPlannedMissions().some(({task})=>{const left=new Date(task.scheduledStart).getTime()-now;return left>0&&left<7*86400000;});}
function importantPlannedMissions(){
  if(!canViewImportant())return [];
  const visible=isAdmin()?null:new Set(currentUser().locationIds),groups=new Map(),now=Date.now();
  for(const task of state.db.tasks){
    if(task.status!=='open'||!task.scheduledStart||new Date(task.scheduledStart).getTime()<=now||!task.assignedTo||visible&&!visible.has(task.locationId))continue;
    const key=[task.groupId||task.id,task.locationId,task.scheduledStart,task.scheduledEnd,task.title].join('|');
    if(!groups.has(key))groups.set(key,{task,workers:[]});
    const name=getUser(task.assignedTo)?.name;
    if(name&&!groups.get(key).workers.includes(name))groups.get(key).workers.push(name);
  }
  return [...groups.values()].sort((a,b)=>new Date(a.task.scheduledStart)-new Date(b.task.scheduledStart));
}
function renderImportantPage(){
  if(!canViewImportant())return '';
  const alerts=state.importantAlerts||[],missions=importantPlannedMissions();
  return `<div class="toolbar"><div><div class="eyebrow">PILNE TERMINY</div><h2 class="section-title">Ważne</h2></div><span class="badge">${alerts.length} przypomnień · ${missions.length} misji</span></div><div class="status-note">Przypomnienia pozostają tutaj do oznaczenia jako wykonane. Daty dotyczą obiektów, do których masz dostęp.</div><div class="subheading important-section-title">Planowane misje pracowników</div><div class="important-list">${missions.map(({task,workers})=>`<button class="settings-card important-mission" data-history-task="${esc(task.id)}"><span><small>${esc(getLoc(task.locationId)?.name||'Obiekt')} · ${fmtDate(task.scheduledStart)} → ${fmtDate(task.scheduledEnd)}</small><b>${esc(task.title)}</b><small>Wykonawcy: ${esc(workers.join(', '))}</small></span><em>OTWÓRZ</em></button>`).join('')||'<div class="empty compact">Brak zaplanowanych misji.</div>'}</div><div class="subheading important-section-title">Przypomnienia o terminach</div><div class="important-list">${alerts.map(a=>`<article class="settings-card important-card"><div><small>${esc(getLoc(a.locationId)?.name||'Obiekt')} · termin ${esc(a.dueOn)}</small><h3>${esc(a.title)}</h3>${a.details?`<p>${esc(a.details)}</p>`:''}<small class="important-status">${a.inProgressAt?'W TRAKCIE':'OCZEKUJE'}</small></div><div class="important-actions"><button class="smallbtn" data-progress-alert="${esc(a.id)}" data-progress-value="${a.inProgressAt?'0':'1'}">${a.inProgressAt?'Cofnij status':'W trakcie'}</button><button class="smallbtn gold" data-complete-alert="${esc(a.id)}">Wykonane</button></div></article>`).join('')||'<div class="empty">Nie ma aktywnych przypomnień.</div>'}</div>`;
}
function deliverImportantAlerts(){
  const id=state.auth?.user?.id;if(!id||!state.importantAlerts.length)return;
  const key=`imperium_important_delivered_${id}`;
  let seen=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}
  const fresh=state.importantAlerts.filter(a=>!seen.includes(a.id));
  if(!fresh.length)return;
  localStorage.setItem(key,JSON.stringify([...new Set([...seen,...fresh.map(a=>a.id)])].slice(-500)));
  notify('IMPERIUM · Ważne',fresh.length===1?fresh[0].title:`${fresh.length} ważnych terminów. Otwórz zakładkę Ważne.`);
}
function demoImportantAlerts(){
  if(!canViewImportant())return [];
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'});
  const days=(date)=>Math.floor((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
  const resolved=new Set(state.db.importantAlerts||[]),out=[];
  const add=(kind,sourceId,dueOn,title,details,locationId,limit)=>{if(!dueOn||days(dueOn)>limit||days(dueOn)<-30)return;const id=`${kind}:${sourceId}:${dueOn}`;if(!resolved.has(id))out.push({id,kind,sourceId,dueOn,title,details,locationId});};
  const visible=id=>isAdmin()||currentUser().locationIds.includes(id);
  (state.rentals||[]).filter(r=>visible(r.locationId)&&!r.indefinite).forEach(r=>add('rental_expiry',r.id,r.endsOn,`Koniec umowy najmu: ${r.contractor}`,'',r.locationId,31));
  (state.inspections||[]).filter(i=>visible(i.locationId)).forEach(i=>add('inspection_expiry',i.id,i.validUntil,`Koniec przeglądu: ${i.name}`,'',i.locationId,31));
  (state.rentalActions||[]).filter(a=>!a.completedAt).forEach(a=>{const r=state.rentals.find(x=>x.id===a.rentalId);if(!r||!visible(r.locationId))return;add('action_14',a.id,a.dueOn,`Przygotuj ${rentalActionLabel(a.kind)}: ${r.contractor}`,a.notes,r.locationId,14);if(a.kind==='wypowiedzenie')add('notice_30',a.id,a.dueOn,`Wypowiedzenie za miesiąc: ${r.contractor}`,a.notes,r.locationId,31);});
  out.forEach(a=>a.inProgressAt=state.db.importantProgress?.[a.id]||null);
  return out.sort((a,b)=>a.dueOn.localeCompare(b.dueOn));
}
async function refreshImportantCloud(){
  await cloudFetch('/rest/v1/rpc/refresh_important_alerts',{method:'POST',body:{}});
  await loadCloudDB({silent:true});
}
async function saveRentalAction(){
  if(!canManageRentals())return;
  const rental=state.rentals.find(r=>r.id===state.rentalId);
  if(!rental||!isAdmin()&&!currentUser().locationIds.includes(rental.locationId))return toast('Brak dostępu do umowy.');
  const kind=document.getElementById('f-action-kind').value,dueOn=document.getElementById('f-action-date').value,notes=document.getElementById('f-action-notes').value.trim();
  if(!['cesja','aneks','wypowiedzenie'].includes(kind)||!dueOn)return toast('Wybierz dokument i datę.');
  await withAction('Zapisywanie planu…',async()=>{
    if(state.mode==='demo'){state.db.rentalActions ||= [];const a=state.db.rentalActions.find(x=>x.id===state.actionId);if(a)Object.assign(a,{kind,dueOn,notes});else state.db.rentalActions.push({id:uid(),rentalId:rental.id,kind,dueOn,notes,completedAt:null});state.rentalActions=state.db.rentalActions;saveDemoDB();}
    else{const row={kind,due_on:dueOn,notes};if(state.actionId)await pgPatch('rental_actions',`id=eq.${encodeURIComponent(state.actionId)}`,row);else await pgPost('rental_actions',{...row,rental_id:rental.id,created_by:currentUser().id});await refreshImportantCloud();}
    state.modal=null;state.actionId=null;state.rentalId=null;
  });
}
async function completeRentalAction(){
  if(!canManageRentals()||!state.actionId)return;
  await withAction('Oznaczanie wykonania…',async()=>{
    if(state.mode==='demo'){const a=state.db.rentalActions.find(x=>x.id===state.actionId);if(a)a.completedAt=nowISO();saveDemoDB();}
    else{await pgPatch('rental_actions',`id=eq.${encodeURIComponent(state.actionId)}`,{completed_at:nowISO()});await refreshImportantCloud();}
    state.modal=null;state.actionId=null;state.rentalId=null;
  });
}
async function setImportantProgress(id,inProgress){
  if(!canViewImportant())return;
  await withAction('Zmiana statusu przypomnienia…',async()=>{
    if(state.mode==='demo'){state.db.importantProgress ||= {};state.db.importantProgress[id]=inProgress?nowISO():null;saveDemoDB();}
    else{await cloudFetch('/rest/v1/rpc/set_important_alert_progress',{method:'POST',body:{p_id:id,p_in_progress:inProgress}});await loadCloudDB({silent:true});}
  });
}
async function completeImportantAlert(id){
  if(!canViewImportant())return;
  await withAction('Zamykanie przypomnienia…',async()=>{
    if(state.mode==='demo'){state.db.importantAlerts ||= [];state.db.importantAlerts.push(id);saveDemoDB();}
    else{await cloudFetch('/rest/v1/rpc/complete_important_alert',{method:'POST',body:{p_id:id}});await loadCloudDB({silent:true});}
  });
}

function renderSettingsPage(){
  const u=currentUser(),code=state.mode==='cloud'?configCode():'';
  return `<div class="toolbar"><div><div class="eyebrow">System</div><h2 class="section-title">Ustawienia</h2></div></div>
  <div class="settings-card"><h3>Tryb danych</h3><p>${state.mode==='cloud'?'☁ Wspólna baza Supabase — dane i pliki są synchronizowane między telefonami.':'⚙ Demo lokalne — dane są tylko na tym urządzeniu.'}</p>${state.cloudError?`<div class="status-note danger-text">${esc(state.cloudError)}</div>`:''}</div>
  ${state.mode==='cloud'?`<div class="settings-card"><h3>Kod konfiguracji dla zespołu</h3><p>Jeśli APK nie ma jeszcze wbudowanego adresu bazy, wyślij pracownikowi ten kod razem z APK. Po wbudowaniu konfiguracji ten krok nie będzie potrzebny.</p><div class="codebox" id="cfg-code">${esc(code)}</div><div style="margin-top:10px"><button class="smallbtn gold" id="copy-code">Kopiuj kod</button> ${!(BASE_CFG.DEFAULT_SUPABASE_URL&&BASE_CFG.DEFAULT_SUPABASE_ANON_KEY)?'<button class="smallbtn" id="server-settings">Serwer</button>':''}</div></div>`:''}
  <div class="settings-card"><h3>Powiadomienia</h3><p>Dźwięk odtwarza się, gdy IMPERIUM jest otwarte. Powiadomienia po zamknięciu aplikacji wymagają osobnej usługi działającej w tle.</p><div style="margin-top:12px"><button class="smallbtn gold" id="enable-notifications">Włącz powiadomienia</button> <button class="smallbtn" id="notification-sound-test">🔊 Sprawdź dźwięk</button></div></div>
  <div class="settings-card"><h3>Konto</h3><p>${esc(u.name)} • ${u.role==='admin'?'administrator':'pracownik'}</p><div style="margin-top:12px">${state.mode==='demo'?'<button class="dangerbtn" id="reset-demo">Przywróć dane demo</button>':'<button class="dangerbtn" id="cloud-logout">Wyloguj</button>'}</div></div>`;
}

function renderWorkerCard(){
  const u=state.db.users.find(x=>x.id===state.userId); if(!u)return '';
  if(!isAdmin()&&u.id!==currentUser().id)return `<div class="modal-bg"><div class="modal worker-card-modal"><h2>Plan pracy · ${esc(u.name)}</h2>${renderWorkerPlans(u)}<div class="modal-actions"><button class="ghost" data-close>Zamknij</button></div></div></div>`;
  const st=workerStats(u.id), period=state.workerPeriod, balance=coinBalance(u.id);
  const tasks=[...st.tasks].sort((a,b)=>new Date(b.claimedAt||b.createdAt)-new Date(a.claimedAt||a.createdAt));
  const records=[...st.records].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const coins=[...coinTxFor(u.id,period)].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const completion=st.total?Math.round(st.done/st.total*100):0;
  const taskRows=tasks.map(t=>`<button class="history-row" data-history-task="${t.id}"><span><b>${esc(t.title)}</b><small>${esc(getLoc(t.locationId)?.name||'')} • ${fmtDate(t.claimedAt||t.createdAt)}</small></span><span class="history-right"><em class="${taskLate(t)?'late-text':''}">${taskLate(t)?'PO TERMINIE':taskStatusLabel(t.status)}</em>${t.rewardCoins?`<small class="coin-text">+${t.rewardCoins} NK</small>`:''}${t.reworkCount?`<small>${t.reworkCount}× poprawka</small>`:''}</span></button>`).join('')||'<div class="empty compact">Brak zadań w wybranym okresie.</div>';
  const recRows=records.map(r=>{const t=state.db.tasks.find(x=>x.id===r.taskId);return `<div class="discipline-entry ${r.type}"><div><b>${esc(disciplineLabel(r.type))}</b><small>${fmtDate(r.createdAt)}${t?` • ${esc(t.title)}`:''}</small></div><p>${esc(r.description)}</p>${isAdmin()?`<button class="smallbtn" data-delete-discipline="${r.id}">Usuń wpis</button>`:''}</div>`}).join('')||'<div class="empty compact">Brak uwag i sankcji w wybranym okresie.</div>';
  const coinRows=coins.map(c=>{const t=state.db.tasks.find(x=>x.id===c.taskId);return `<div class="coin-entry ${c.amount<0?'negative':'positive'}"><div><b>${fmtCoins(c.amount)}</b><span>${esc(coinKindLabel(c.kind))}</span></div><p>${esc(c.description||'Bez opisu')}</p><small>${fmtDate(c.createdAt)}${t?` • ${esc(t.title)}`:''}</small></div>`}).join('')||'<div class="empty compact">Brak operacji Nikitocoinów w wybranym okresie.</div>';
  return `<div class="modal-bg"><div class="modal worker-card-modal"><div class="worker-card-head"><div class="avatar big">${initials(u.name)}</div><div><h2>${esc(u.name)}</h2><div class="modal-sub">${u.role==='admin'?'Administrator':'Pracownik'} • ${u.active?'aktywny':'nieaktywny'}</div></div><div class="coin-wallet"><small>IMPERATORSKIE NIKITOCOINY</small><b>🪙 ${balance} NK</b></div></div><div class="period-tabs"><button class="chip ${period==='30'?'active':''}" data-worker-period="30">30 dni</button><button class="chip ${period==='90'?'active':''}" data-worker-period="90">90 dni</button><button class="chip ${period==='365'?'active':''}" data-worker-period="365">Rok</button><button class="chip ${period==='all'?'active':''}" data-worker-period="all">Wszystko</button></div><div class="worker-stats"><div><b>${st.done}</b><span>Wykonane</span></div><div><b>${st.active}</b><span>Aktywne</span></div><div class="${st.late?'bad-stat':''}"><b>${st.late}</b><span>Po terminie</span></div><div><b>${st.reworks}</b><span>Do poprawy</span></div><div><b>${st.notes}</b><span>Uwagi</span></div><div class="${st.warnings+st.reprimands?'bad-stat':''}"><b>${st.warnings+st.reprimands}</b><span>Ostrz./upomn.</span></div></div><div class="performance-line"><span>Realizacja zakończonych</span><b>${completion}%</b></div>${renderWorkerPlans(u)}<div class="section-split"><div><div class="subheading">Historia zadań</div>${taskRows}</div><div><div class="subheading">Uwagi i sankcje</div>${recRows}</div></div><div class="subheading" style="margin-top:16px">Vouchery</div><div class="voucher-list">${voucherRows(u.id).map(v=>voucherCard(v,isAdmin())).join('')||'<div class="empty compact">Brak voucherów.</div>'}</div><div class="subheading" style="margin-top:16px">Portfel Nikitocoinów</div><div class="coin-ledger">${coinRows}</div><div class="status-note">Nikitocoiny są wewnętrznymi punktami IMPERIUM i nie stanowią automatycznego potrącenia ani składnika wynagrodzenia.</div><div class="modal-actions"><button class="ghost" data-close>Zamknij</button>${isAdmin()?'<button class="ghost" id="adjust-coins">± Nikitocoiny</button><button class="goldbtn" id="add-discipline">+ Dodaj uwagę / sankcję</button>':''}</div></div></div>`;
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

let taskCopyDraft=null;
function makeTaskCopyDraft(source,clock=new Date()){
  const start=new Date(clock);start.setSeconds(0,0);
  const oldStart=source.scheduledStart?new Date(source.scheduledStart):null;
  const oldEnd=source.scheduledEnd?new Date(source.scheduledEnd):null;
  const minutes=oldStart&&oldEnd?Math.ceil((oldEnd-oldStart)/60000):(source.durationMin||60);
  if(oldStart&&Number.isFinite(oldStart.getTime()))start.setHours(oldStart.getHours(),oldStart.getMinutes(),0,0);
  let end=new Date(start.getTime()+minutes*60000);
  if(end<=clock){start.setTime(clock.getTime());start.setSeconds(0,0);end=new Date(start.getTime()+minutes*60000);}
  return {title:source.title,description:source.description,notes:source.notes,locationId:source.locationId,priority:source.priority,durationMin:minutes,assignedTo:source.assignedTo||source.claimedBy||null,scheduledStart:start.toISOString(),scheduledEnd:end.toISOString(),rewardCoins:source.rewardCoins||0,penaltyCoins:source.penaltyCoins||0,sanctionType:source.sanctionType||'none',sanctionText:source.sanctionText||'',disciplinaryNote:''};
}
function copyTaskToday(id){
  if(!canCreateTasks())return;
  const source=state.db.tasks.find(t=>t.id===id);
  if(!source||!allowedLocations().some(l=>l.id===source.locationId&&l.active))return toast('Obiekt jest nieaktywny lub niedostępny. Wybierz inne zadanie.');
  taskCopyDraft=makeTaskCopyDraft(source);selectedFiles=[];fileInput.value='';state.taskId=null;state.modal='newTask';render();
}
function fillTaskCopyForm(){
  if(state.modal!=='newTask'||!taskCopyDraft)return;
  const t=taskCopyDraft;
  for(const [id,value] of Object.entries({'f-title':t.title,'f-desc':t.description,'f-notes':t.notes,'f-loc':t.locationId,'f-priority':t.priority,'f-duration':t.durationMin})){
    const el=document.getElementById(id);if(el)el.value=value||'';
  }
  const local=iso=>new Date(new Date(iso).getTime()-new Date(iso).getTimezoneOffset()*60000).toISOString().slice(0,16);
  document.getElementById('f-task-start').value=local(t.scheduledStart);
  document.getElementById('f-task-end').value=local(t.scheduledEnd);
  document.querySelectorAll('input[name="task-assignee"]').forEach(el=>el.checked=el.value===t.assignedTo);
  const heading=document.querySelector('.modal h2');if(heading)heading.textContent='Kopiuj zadanie na dziś';
  const files=document.getElementById('file-list');if(files)files.insertAdjacentHTML('beforebegin','<small class="subtle">Sprawdź godziny i wykonawcę. Dokumentację do nowego zadania dodaj poniżej.</small>');
}

function taskScheduleFields(t){
  const local=iso=>iso?new Date(new Date(iso).getTime()-new Date(iso).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  return `<div class="formgrid"><div class="field"><label>Rozpoczęcie zadania (opcjonalnie)</label><input id="f-task-start" type="datetime-local" value="${local(t?.scheduledStart)}"></div><div class="field"><label>Zakończenie zadania</label><input id="f-task-end" type="datetime-local" value="${local(t?.scheduledEnd)}"></div></div>`;
}
function taskAssigneeFields(t){
  const selected=t?.assignedTo||t?.claimedBy;
  return `<div class="field"><label>Pracownicy (można wybrać kilku)</label><div class="checkbox-grid task-assignees">${state.db.users.filter(u=>u.role==='worker'&&u.active!==false).map(u=>`<label class="checkrow" data-task-user="${esc(u.id)}"><input type="checkbox" name="task-assignee" value="${esc(u.id)}" ${selected===u.id?'checked':''}> ${esc(u.name)}</label>`).join('')}</div><small class="subtle">Każdy pracownik otrzyma osobne rozliczenie i raport tego samego zadania.</small></div>`;
}
function nipLookupControl(kind){return `<button type="button" class="smallbtn nip-lookup" data-nip-lookup="${kind}">Pobierz dane po NIP</button><small class="subtle nip-lookup-result" data-nip-result="${kind}">Źródło: wykaz podatników VAT Ministerstwa Finansów.</small>`;}
function registeredAddressParts(address){
  const clean=String(address||'').trim(),matches=[...clean.matchAll(/\b\d{2}-\d{3}\b/g)],last=matches.at(-1);
  if(!last)return {street:clean,postalCity:''};
  return {street:clean.slice(0,last.index).replace(/[,\s]+$/,'').trim(),postalCity:clean.slice(last.index).trim()};
}
async function lookupCompanyNip(button){
  const kind=button.dataset.nipLookup,fields={rental:['f-rental-nip','f-rental-contractor'],seller:['f-seller-nip','f-seller-name'],invoice:['f-invoice-nip','f-invoice-buyer']}[kind];
  if(!fields)return;
  const input=document.getElementById(fields[0]),nip=(input?.value||'').replace(/[\s-]/g,'');
  if(!window.ImperiumInvoice.validNip(nip))return toast('Wpisz poprawny polski NIP (10 cyfr).');
  const result=document.querySelector(`[data-nip-result="${kind}"]`);
  button.disabled=true;button.textContent='Sprawdzanie…';if(result)result.textContent='Łączenie z wykazem Ministerstwa Finansów…';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'});
    const response=await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`,{signal:controller.signal,credentials:'omit'});
    let data;try{data=await response.json();}catch{throw Error('Rejestr nie zwrócił danych. Spróbuj później.');}
    if(!response.ok||!data?.result?.subject)throw Error(response.status===404?'Nie znaleziono firmy o tym NIP w wykazie VAT.':data?.message||`Błąd rejestru MF (${response.status}).`);
    if(!button.isConnected||document.getElementById(fields[0])?.value.replace(/[\s-]/g,'')!==nip)return;
    const company=data.result.subject,address=company.residenceAddress||company.workingAddress||'',parts=registeredAddressParts(address);
    document.getElementById(fields[0]).value=nip;
    document.getElementById(fields[1]).value=company.name||'';
    if(kind==='rental')document.getElementById('f-rental-registered').value=address.slice(0,300);
    else{
      const street=document.getElementById(kind==='seller'?'f-seller-street':'f-invoice-street');
      const city=document.getElementById(kind==='seller'?'f-seller-city':'f-invoice-city');
      if(address){street.value=parts.street.slice(0,250);city.value=parts.postalCity.slice(0,150);}
    }
    if(result)result.textContent=`MF · ${date} · VAT: ${company.statusVat||'brak danych'}${data.result.requestId?' · ID '+data.result.requestId:''}${address&&!parts.postalCity&&kind!=='rental'?' · Sprawdź podział adresu.':''}`;
    toast('Dane firmy pobrane. Sprawdź adres przed zapisaniem.');
  }catch(error){
    if(result&&button.isConnected)result.textContent=error.name==='AbortError'?'Przekroczono czas odpowiedzi rejestru.':error.message;
    toast(error.name==='AbortError'?'Rejestr nie odpowiada. Spróbuj później.':error.message);
  }finally{clearTimeout(timeout);if(button.isConnected){button.disabled=false;button.textContent='Pobierz dane po NIP';}}
}
function invoiceLineFields(l,i){return `<div class="invoice-line" data-invoice-line="${i}"><div class="field"><label>Usługa / towar</label><input data-il="description" maxlength="250" value="${esc(l.description||'')}"></div><div class="invoice-line-numbers"><div class="field"><label>Ilość</label><input data-il="quantity" type="number" min="0.001" step="0.001" value="${esc(l.quantity??'1')}"></div><div class="field"><label>Jednostka</label><input data-il="unit" maxlength="20" value="${esc(l.unit||'usł.')}"></div><div class="field"><label>Cena netto</label><input data-il="unit_net" type="number" min="0" step="0.01" value="${esc(l.unit_net??'')}"></div><div class="field"><label>VAT</label><select data-il="vat_rate"><option value="">Wybierz</option>${['23','8','5'].map(v=>`<option value="${v}" ${String(l.vat_rate)===v?'selected':''}>${v}%</option>`).join('')}</select></div></div><button class="smallbtn" data-remove-invoice-line="${i}">Usuń pozycję</button></div>`;}
function renderModal(){
  if(!state.modal)return '';
  if(state.modal==='extraMission')return renderExtraMissionModal();
  if(state.modal==='cloudSetup')return renderCloudSetupModal();
  if(state.modal==='workerCard')return renderWorkerCard();
  if(state.modal==='addDiscipline')return renderDisciplineModal();
  if(state.modal==='coinAdjust')return renderCoinModal();
  const close='<button class="ghost" data-close>Anuluj</button>';
  if(state.modal==='invoiceSeller'){
    const s=state.invoiceSellers.find(x=>x.id===state.invoiceId);
    return `<div class="modal-bg"><div class="modal"><h2>${s?'Dane sprzedawcy':'Nowa firma wystawiająca'}</h2><div class="formgrid"><div class="field"><label>Nazwa firmy</label><input id="f-seller-name" maxlength="200" value="${esc(s?.name||'')}"></div><div class="field"><label>NIP</label><input id="f-seller-nip" inputmode="numeric" maxlength="10" value="${esc(s?.nip||'')}">${nipLookupControl('seller')}</div><div class="field"><label>Ulica i numer</label><input id="f-seller-street" maxlength="250" value="${esc(s?.streetAddress||'')}"></div><div class="field"><label>Kod pocztowy i miejscowość</label><input id="f-seller-city" maxlength="150" value="${esc(s?.postalCity||'')}"></div><div class="field"><label>Rachunek bankowy (opcjonalnie)</label><input id="f-seller-bank" maxlength="64" value="${esc(s?.bankAccount||'')}"></div></div><div class="modal-actions">${close}<button class="goldbtn" id="save-invoice-seller">Zapisz firmę</button></div></div></div>`;
  }
  if(state.modal==='invoiceDraft'){
    const x=state.invoiceDrafts.find(y=>y.id===state.invoiceId),today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'}),r=state.rentals.find(y=>y.id===(x?.rentalId||state.invoiceRentalId));
    const sellers=state.invoiceSellers,lines=state.invoiceLines.length?state.invoiceLines:(x?.lines||[{description:'',unit:'usł.',quantity:'1',unit_net:'',vat_rate:''}]);
    return `<div class="modal-bg"><div class="modal invoice-modal"><h2>${x?'Edytuj szkic faktury':'Nowy szkic faktury'}</h2><div class="modal-sub">Faktura będzie wystawiona w IMPERIUM. Stawkę VAT dla każdej pozycji wybierz po sprawdzeniu umowy.</div><div class="formgrid"><div class="field"><label>Firma wystawiająca</label><select id="f-invoice-seller">${sellers.map(s=>`<option value="${esc(s.id)}" ${s.id===x?.sellerId?'selected':''}>${esc(s.name)} · ${esc(s.nip)}</option>`).join('')}</select></div><div class="field"><label>Umowa najmu (opcjonalnie)</label><select id="f-invoice-rental"><option value="">Bez umowy</option>${state.rentals.map(y=>`<option value="${esc(y.id)}" ${y.id===r?.id?'selected':''}>${esc(y.contractor)} · ${esc(getLoc(y.locationId)?.name||'')}</option>`).join('')}</select></div><div class="field"><label>Numer faktury</label><input id="f-invoice-number" maxlength="80" value="${esc(x?.number||'')}"></div><div class="field"><label>Data wystawienia</label><input id="f-invoice-issued" type="date" value="${esc(x?.issueDate||today)}"></div><div class="field"><label>Data sprzedaży</label><input id="f-invoice-sale" type="date" value="${esc(x?.saleDate||today)}"></div><div class="field"><label>Termin płatności</label><input id="f-invoice-due" type="date" value="${esc(x?.dueDate||today)}"></div></div>
    <div class="rental-form-section">Nabywca</div><div class="formgrid"><div class="field"><label>Nazwa</label><input id="f-invoice-buyer" maxlength="200" value="${esc(x?.buyerName||r?.contractor||'')}"></div><div class="field"><label>NIP</label><input id="f-invoice-nip" inputmode="numeric" maxlength="10" value="${esc(x?.buyerNip||r?.nip||'')}">${nipLookupControl('invoice')}</div><div class="field"><label>Adres rejestrowy: ulica i numer</label><input id="f-invoice-street" maxlength="250" value="${esc(x?.buyerStreet||'')}"></div><div class="field"><label>Kod pocztowy i miejscowość</label><input id="f-invoice-city" maxlength="150" value="${esc(x?.buyerPostalCity||'')}"></div></div>
    <div class="rental-form-section">Pozycje · PLN netto</div><div id="invoice-lines">${lines.map((l,i)=>invoiceLineFields(l,i)).join('')}</div><button class="smallbtn" id="add-invoice-line">+ Pozycja</button><div class="rental-live-total" id="invoice-live-total"></div><div class="modal-actions">${x?'<button class="dangerbtn" id="delete-invoice">Usuń szkic</button>':''}${close}<button class="goldbtn" id="save-invoice">Zapisz szkic</button></div></div></div>`;
  }
  if(state.modal==='room'){
    const room=state.rentalRooms.find(x=>x.id===state.roomId),building=room?.building||state.roomBuilding||'Smolańska 3',floor=room?.floor||state.roomFloor||'Parter';
    return `<div class="modal-bg"><div class="modal"><h2>${room?'Edytuj pomieszczenie':'Nowe pomieszczenie'}</h2><div class="modal-sub">${esc(building)} / ${esc(floor)}</div><div class="formgrid"><div class="field"><label>Numer / nazwa pomieszczenia</label><input id="f-room-number" maxlength="80" value="${esc(room?.number||'')}"></div><div class="field"><label>Powierzchnia (m²)</label><input id="f-room-area" type="number" min="0.01" step="0.01" value="${room?.areaSqm??''}"></div></div><label class="checkrow"><input id="f-room-meter" type="checkbox" ${room?.hasMeter?'checked':''}> Licznik energii elektrycznej</label><div class="formgrid" id="room-meter-fields"><div class="field"><label>Stan licznika</label><input id="f-room-reading" type="number" min="0" step="0.001" value="${room?.meterReading??''}"></div><div class="field"><label>Data odczytu</label><input id="f-room-read-on" type="date" value="${esc(room?.meterReadOn||'')}"></div></div><div class="modal-actions">${room&&isAdmin()?'<button class="dangerbtn" id="delete-room">Usuń pomieszczenie</button>':''}${close}<button class="goldbtn" id="save-room">Zapisz</button></div></div></div>`;
  }
  if(state.modal==='invoicePdf')return `<div class="modal-bg"><div class="modal pdf-modal"><h2>Faktura ${esc(state.pdfName||'')}</h2><div id="invoice-pdf-content" class="pdf-content">Przygotowywanie PDF…</div><div class="modal-actions"><button class="ghost" data-close>Zamknij</button></div></div></div>`;
  if(state.modal==='rentalPdf')return `<div class="modal-bg"><div class="modal pdf-modal"><h2>${esc(state.pdfName||'Umowa PDF')}</h2><div id="rental-pdf-content" class="pdf-content">Otwieranie dokumentu…</div><div class="modal-actions"><button class="ghost" data-close>Zamknij</button></div></div></div>`;
  if(state.modal==='editAttendanceStart'){const a=state.attendance.find(x=>x.id===state.attendanceId);if(!a)return '';const d=new Date(a.startedAt),local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);return `<div class="modal-bg"><div class="modal"><h2>Korekta początku pracy</h2><div class="modal-sub">${esc(getUser(a.userId)?.name||'Pracownik')} · ${esc(getLoc(a.locationId)?.name||'Obiekt')}</div><div class="field"><label>Rzeczywisty początek (data i godzina)</label><input id="f-attendance-start" type="datetime-local" value="${local}"></div>${a.endedAt?`<div class="status-note">Koniec meldunku: ${fmtDate(a.endedAt)}</div>`:''}<div class="modal-actions">${close}<button class="goldbtn" id="save-attendance-start">Zapisz korektę</button></div></div></div>`;}
  if(state.modal==='rentalAction'){const a=state.rentalActions.find(x=>x.id===state.actionId);return `<div class="modal-bg"><div class="modal"><h2>${a?'Edytuj plan':'Zaplanuj dokument'}</h2><div class="field"><label>Dokument</label><select id="f-action-kind"><option value="cesja" ${a?.kind==='cesja'?'selected':''}>Cesja</option><option value="aneks" ${a?.kind==='aneks'?'selected':''}>Aneks</option><option value="wypowiedzenie" ${a?.kind==='wypowiedzenie'?'selected':''}>Wypowiedzenie</option></select></div><div class="field"><label>Termin przygotowania</label><input id="f-action-date" type="date" value="${esc(a?.dueOn||'')}"></div><div class="field"><label>Uwagi</label><textarea id="f-action-notes" maxlength="1000">${esc(a?.notes||'')}</textarea></div><div class="modal-actions">${a&&!a.completedAt?'<button class="ghost" id="complete-rental-action">Wykonane</button>':''}${close}<button class="goldbtn" id="save-rental-action">Zapisz</button></div></div></div>`;}
  if(state.modal==='newRental'||state.modal==='editRental'){
    const edit=state.modal==='editRental',r=edit?state.rentals.find(x=>x.id===state.rentalId):null;
    if(edit&&!r)return '';
    return `<div class="modal-bg"><div class="modal rental-modal"><h2>${edit?'Edytuj umowę najmu':'Nowa umowa najmu'}</h2>
    <div class="formgrid"><div class="field"><label>Obiekt</label><select id="f-rental-location">${(isAdmin()?state.db.locations:state.db.locations.filter(l=>currentUser().locationIds.includes(l.id))).map(l=>`<option value="${esc(l.id)}" ${l.id===(r?.locationId||state.rentalLocationId)?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Nazwa kontrahenta / najemcy</label><input id="f-rental-contractor" maxlength="160" value="${esc(r?.contractor||'')}" required></div><div class="field"><label>NIP</label><input id="f-rental-nip" inputmode="numeric" maxlength="24" value="${esc(r?.nip||'')}">${nipLookupControl('rental')}</div><div class="field"><label>Adres rejestrowy firmy</label><input id="f-rental-registered" maxlength="300" value="${esc(r?.registeredAddress||'')}" placeholder="Adres siedziby z rejestru MF"></div><div class="field"><label>Osoba kontaktowa</label><input id="f-rental-contact" maxlength="120" value="${esc(r?.contactPerson||'')}"></div><div class="field"><label>Telefon</label><input id="f-rental-phone" type="tel" maxlength="50" value="${esc(r?.phone||'')}"></div><div class="field"><label>E-mail</label><input id="f-rental-email" type="email" maxlength="254" value="${esc(r?.email||'')}"></div><div class="field"><label>Początek umowy</label><input id="f-rental-start" type="date" value="${esc(r?.startsOn||'')}"></div><div class="field"><label>Koniec umowy</label><input id="f-rental-end" type="date" value="${esc(r?.endsOn||'')}" ${r?.indefinite?'disabled':''}></div></div>
    <div class="rental-form-section">Wynajmowany lokal</div><div class="field" id="rental-room-field"><label>Pomieszczenie Hotel Tur (opcjonalnie)</label><select id="f-rental-room-id"><option value="">Bez przypisanego pomieszczenia</option>${state.rentalRooms.filter(x=>x.locationId===(r?.locationId||state.rentalLocationId)).map(x=>`<option value="${esc(x.id)}" ${x.id===(r?.roomId||state.roomId)?'selected':''}>${esc(rentalRoomLabel(x))} · ${esc(x.areaSqm)} m²</option>`).join('')}</select></div><div class="formgrid"><div class="field"><label>Adres lokalu</label><input id="f-rental-address" maxlength="300" value="${esc(r?.premisesAddress||'')}" placeholder="Ulica, numer budynku, miejscowość"></div><div class="field"><label>Numer lokalu / pomieszczenia</label><input id="f-rental-room" maxlength="80" value="${esc(r?.premisesNumber||'')}" placeholder="Np. 12A"></div><div class="field"><label>Status płatnika</label><select id="f-rental-status"><option value="" ${!r?.paymentStatus?'selected':''}>Wybierz status</option><option value="reliable" ${r?.paymentStatus==='reliable'?'selected':''}>Rzetelny płatnik</option><option value="monitor" ${r?.paymentStatus==='monitor'?'selected':''}>Pod kontrolą</option><option value="problematic" ${r?.paymentStatus==='problematic'?'selected':''}>Problematyczny</option></select></div></div>
    <label class="checkrow"><input id="f-rental-indefinite" type="checkbox" ${r?.indefinite?'checked':''}> Umowa na czas nieokreślony</label>
    <div class="rental-form-section">Powierzchnia i czynsz miesięczny</div><div class="formgrid"><div class="field"><label>Powierzchnia (m²)</label><input id="f-rental-area" type="number" min="0.01" step="0.01" value="${r?.areaSqm||''}"></div><div class="field"><label>Cena za m² netto (zł)</label><input id="f-rental-sqm-net" type="number" min="0" step="0.01" value="${r?.priceSqmNet??''}"></div><div class="field"><label>Cena za m² brutto (zł)</label><input id="f-rental-sqm-gross" type="number" min="0" step="0.01" value="${r?.priceSqmGross??''}"></div></div>
    <div class="rental-form-section">Dodatki miesięczne</div><div class="formgrid"><div class="field"><label>Parking netto (zł)</label><input id="f-rental-parking-net" type="number" min="0" step="0.01" value="${r?.parkingNet??0}"></div><div class="field"><label>Parking brutto (zł)</label><input id="f-rental-parking-gross" type="number" min="0" step="0.01" value="${r?.parkingGross??0}"></div><div class="field"><label>Internet netto (zł)</label><input id="f-rental-internet-net" type="number" min="0" step="0.01" value="${r?.internetNet??0}"></div><div class="field"><label>Internet brutto (zł)</label><input id="f-rental-internet-gross" type="number" min="0" step="0.01" value="${r?.internetGross??0}"></div><div class="field"><label>Sprzątanie netto (zł)</label><input id="f-rental-cleaning-net" type="number" min="0" step="0.01" value="${r?.cleaningNet??0}"></div><div class="field"><label>Sprzątanie brutto (zł)</label><input id="f-rental-cleaning-gross" type="number" min="0" step="0.01" value="${r?.cleaningGross??0}"></div></div>
    <div class="rental-live-total" id="rental-live-total"></div><div class="modal-actions">${edit&&isAdmin()?'<button class="dangerbtn" id="delete-rental">Usuń umowę</button>':''}${close}<button class="goldbtn" id="save-rental">Zapisz</button></div></div></div>`;
  }
  if(state.modal==='newInspection'||state.modal==='editInspection'){
    const edit=state.modal==='editInspection',i=edit?(state.inspections||[]).find(x=>x.id===state.inspectionId):null;
    if(edit&&!i)return '';
    return `<div class="modal-bg"><div class="modal"><h2>${edit?'Edytuj przegląd':'Nowy przegląd'}</h2><div class="field"><label>Nazwa przeglądu</label><input id="f-inspection-name" maxlength="120" value="${esc(i?.name||'')}" placeholder="Np. przegląd kominiarski, gaśnic, pięcioletni"></div><div class="formgrid"><div class="field"><label>Obiekt</label><select id="f-inspection-location">${allowedLocations().map(l=>`<option value="${esc(l.id)}" ${l.id===i?.locationId?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Ważny do</label><input id="f-inspection-until" type="date" value="${esc(i?.validUntil||'')}"></div><div class="field"><label>Data ostatniego przeglądu (opcjonalnie)</label><input id="f-inspection-last" type="date" value="${esc(i?.lastInspected||'')}"></div></div><div class="field"><label>Uwagi (opcjonalnie)</label><textarea id="f-inspection-notes" maxlength="1000" placeholder="Np. numer protokołu, zakres kontroli">${esc(i?.notes||'')}</textarea></div><div class="modal-actions">${edit&&isAdmin()?'<button class="dangerbtn" id="delete-inspection">Usuń</button>':''}${close}<button class="goldbtn" id="save-inspection">${edit?'Zapisz':'Dodaj'}</button></div></div></div>`;
  }
  if(state.modal==='newTask'&&!isAdmin()){
    return `<div class="modal-bg"><div class="modal"><h2>Nowe zadanie</h2><div class="field"><label>Tytuł</label><input id="f-title" maxlength="120"></div><div class="field"><label>Opis</label><textarea id="f-desc"></textarea></div><div class="field"><label>Uwagi i wymagania</label><textarea id="f-notes"></textarea></div><div class="formgrid"><div class="field"><label>Obiekt</label><select id="f-loc">${allowedLocations().filter(l=>l.active).map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Priorytet</label><select id="f-priority"><option value="normal">Normalne</option><option value="high">Wysoki</option><option value="urgent">Pilne</option></select></div></div>${taskAssigneeFields(null)}${taskScheduleFields(null)}<div class="field"><label>Czas na wykonanie (minuty, jeśli bez dat)</label><input id="f-duration" type="number" min="5" max="10080" value="60"></div><div class="field"><label>Dodaj zdjęcia lub dokumenty</label><button class="ghost" id="pick-files">+ Wybierz pliki</button><div class="attachments" id="file-list"></div></div><div class="modal-actions">${close}<button class="goldbtn" id="save-task">Utwórz zadanie</button></div></div></div>`;
  }
  if(state.modal==='newTask'||state.modal==='editTask'){
    const edit=state.modal==='editTask',t=edit?state.db.tasks.find(x=>x.id===state.taskId):taskCopyDraft;
    return `<div class="modal-bg"><div class="modal"><h2>${edit?'Edytuj zadanie':'Nowe zadanie'}</h2><div class="modal-sub">${edit?'Możesz zmienić treść, obiekt, priorytet, czas oraz dodać nowe pliki.':'Utwórz zadanie i opcjonalnie dołącz dokumentację.'}</div><div class="field"><label>Tytuł</label><input id="f-title" maxlength="120" value="${esc(t?.title||'')}" placeholder="Np. Sprawdzić ogrzewanie"></div><div class="field"><label>Opis</label><textarea id="f-desc" placeholder="Co dokładnie trzeba zrobić?">${esc(t?.description||'')}</textarea></div><div class="field"><label>Uwagi i wymagania</label><textarea id="f-notes" placeholder="Np. wymagane zdjęcie przed i po, kolejność prac, dodatkowe warunki…">${esc(t?.notes||'')}</textarea></div><div class="formgrid"><div class="field"><label>Obiekt</label><select id="f-loc">${state.db.locations.filter(l=>l.active||l.id===t?.locationId).map(l=>`<option value="${l.id}" ${l.id===t?.locationId?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Priorytet</label><select id="f-priority"><option value="normal" ${t?.priority==='normal'?'selected':''}>Normalne</option><option value="high" ${t?.priority==='high'?'selected':''}>Wysoki</option><option value="urgent" ${t?.priority==='urgent'?'selected':''}>Pilne</option></select></div></div>${taskAssigneeFields(t)}${taskScheduleFields(t)}<div class="field"><label>Czas na wykonanie (minuty, jeśli bez dat)</label><input id="f-duration" type="number" min="5" max="10080" value="${t?.durationMin||60}"></div><div class="coin-task-box"><div class="subheading">🪙 Imperatorskie Nikitocoiny</div><div class="formgrid"><div class="field"><label>Nagroda za wykonanie</label><input id="f-reward-coins" type="number" min="0" max="100000" value="${t?.rewardCoins||0}" placeholder="Np. 50"></div><div class="field"><label>Odjęcie za niewykonanie</label><input id="f-penalty-coins" type="number" min="0" max="100000" value="${t?.penaltyCoins||0}" placeholder="Np. 25"></div></div><small class="subtle">Nagroda jest naliczana po akceptacji zadania. Odjęcie następuje dopiero po decyzji administratora „Niewykonane”.</small></div><div class="formgrid"><div class="field"><label>Rodzaj sankcji za niewykonanie / opóźnienie</label><select id="f-sanction-type"><option value="none" ${!t?.sanctionType||t?.sanctionType==='none'?'selected':''}>Brak</option><option value="note" ${t?.sanctionType==='note'?'selected':''}>Uwaga</option><option value="warning" ${t?.sanctionType==='warning'?'selected':''}>Ostrzeżenie</option><option value="reprimand" ${t?.sanctionType==='reprimand'?'selected':''}>Upomnienie</option><option value="other" ${t?.sanctionType==='other'?'selected':''}>Inna</option></select></div><div class="field"><label>Opis sankcji / konsekwencji</label><input id="f-sanction-text" maxlength="300" value="${esc(t?.sanctionText||'')}" placeholder="Np. obowiązek złożenia wyjaśnienia"></div></div><div class="field"><label>Adnotacja administratora / uwaga służbowa</label><textarea id="f-disciplinary" placeholder="Np. powód niewykonania, ustalenia po terminie, uwaga do pracownika…">${esc(t?.disciplinaryNote||'')}</textarea></div><div class="status-note">Sankcja jest informacją przypisaną do zadania. IMPERIUM nie potrąca automatycznie wynagrodzenia ani nie nakłada kar finansowych.</div><div class="field"><label>Dodaj zdjęcia, wideo lub dokumenty</label><button class="ghost" id="pick-files">+ Wybierz pliki</button><div class="attachments" id="file-list"></div><small class="subtle">Limit ${BASE_CFG.MAX_ATTACHMENT_MB||50} MB na plik.</small></div>${edit&&t?.status!=='open'?'<div class="status-note">Zmiana czasu bazowego nie zeruje bieżącego odliczania. Termin możesz przedłużyć osobno w szczegółach.</div>':''}<div class="modal-actions">${edit?'<button class="dangerbtn" id="delete-task">Usuń</button>':''}${close}<button class="goldbtn" id="save-task">${edit?'Zapisz zmiany':'Utwórz zadanie'}</button></div></div></div>`;
  }
  if(state.modal==='report'){
    const t=state.db.tasks.find(x=>x.id===state.taskId);
    return `<div class="modal-bg"><div class="modal"><h2>Raport z wykonania</h2><div class="modal-sub">${esc(t.title)} • ${esc(getLoc(t.locationId)?.name)}</div>${t.notes?`<div class="detail-block note-block"><strong>Uwagi i wymagania</strong><p>${esc(t.notes)}</p></div>`:''}${t.rewardCoins?`<div class="detail-block coin-task-reward"><strong>🪙 Nagroda za wykonanie</strong><p>+${t.rewardCoins} Nikitocoinów po akceptacji zadania.</p></div>`:''}${t.sanctionType&&t.sanctionType!=='none'?`<div class="detail-block sanction-block"><strong>Sankcja / konsekwencje</strong><p>${esc(sanctionLabel(t.sanctionType))}${t.sanctionText?` — ${esc(t.sanctionText)}`:''}</p></div>`:''}<div class="field"><label>Opis wykonanych prac</label><textarea id="f-report" placeholder="Co zostało zrobione, co wymaga uwagi..."></textarea></div><div class="field"><label>Zdjęcia, wideo i dokumenty</label><button class="ghost" id="pick-files">+ Dodaj pliki</button><div class="attachments" id="file-list"></div><small class="subtle">Pliki w trybie chmurowym trafiają do wspólnego Storage.</small></div><div class="modal-actions">${close}<button class="goldbtn" id="submit-report">Wyślij raport</button></div></div></div>`;
  }
  if(state.modal==='detail'){
    const t=state.db.tasks.find(x=>x.id===state.taskId),owner=getUser(t.claimedBy),u=currentUser(),rem=t.deadlineAt?new Date(t.deadlineAt)-Date.now():null;
    return `<div class="modal-bg"><div class="modal"><h2>${esc(t.title)}</h2><div class="modal-sub">${esc(getLoc(t.locationId)?.name)} • ${taskStatusLabel(t.status)} • ${priorityLabel(t.priority)}</div><div class="detail-block"><strong>Opis</strong><p>${esc(t.description||'Brak opisu.')}</p></div>${t.notes?`<div class="detail-block note-block"><strong>Uwagi i wymagania</strong><p>${esc(t.notes)}</p></div>`:''}${t.sanctionType&&t.sanctionType!=='none'?`<div class="detail-block sanction-block"><strong>⚠ Sankcja za niewykonanie / opóźnienie</strong><p><b>${esc(sanctionLabel(t.sanctionType))}</b>${t.sanctionText?` — ${esc(t.sanctionText)}`:''}</p></div>`:''}${t.disciplinaryNote?`<div class="detail-block disciplinary-block"><strong>Adnotacja administratora / uwaga służbowa</strong><p>${esc(t.disciplinaryNote)}</p></div>`:''}<div class="coin-summary"><div><small>NAGRODA</small><b>🪙 +${t.rewardCoins||0} NK</b></div><div><small>NIEWYKONANIE</small><b class="negative">−${t.penaltyCoins||0} NK</b></div></div><div class="formgrid"><div class="detail-block"><strong>Wykonawca</strong><p>${owner?esc(owner.name):'Nieprzydzielone'}</p>${t.groupId&&state.db.tasks.filter(x=>x.groupId===t.groupId).length>1?`<small>Zespół: ${state.db.tasks.filter(x=>x.groupId===t.groupId).map(x=>getUser(x.assignedTo||x.claimedBy)?.name).filter(Boolean).map(esc).join(', ')}</small>`:''}</div><div class="detail-block"><strong>Czas</strong>${t.scheduledStart?`<small>${fmtDate(t.scheduledStart)} → ${fmtDate(t.scheduledEnd)}</small>`:''}<p>${t.deadlineAt?`Pozostało: <span data-deadline="${t.deadlineAt}">${duration(rem)}</span>`:`Limit: ${t.durationMin} min`}</p></div></div>${renderFilesBlock('Pliki do zadania',t.attachments||[])}${t.report?`<div class="detail-block"><strong>Raport</strong><p>${esc(t.report.text)}</p><small class="subtle">${fmtDate(t.report.submittedAt)}</small>${renderFilesBlock('Załączniki raportu',t.report.attachments||[],true)}</div>`:''}${t.comments?.length?`<div class="comments">${t.comments.map(c=>`<div class="comment">${esc(c.text)}<small>${esc(getUser(c.userId)?.name||'')} • ${fmtDate(c.createdAt)}</small></div>`).join('')}</div>`:''}${u.role==='admin'&&t.status==='in_progress'?`<div class="field"><label>Dodaj czas</label><div class="task-actions"><button class="smallbtn gold" data-extend="15">+15 min</button><button class="smallbtn gold" data-extend="30">+30 min</button><button class="smallbtn gold" data-extend="60">+60 min</button></div></div>`:''}${u.role==='admin'&&t.status==='review'?`<div class="formgrid"><div class="field"><label>Komentarz administratora</label><textarea id="f-comment" placeholder="Komentarz do wykonania"></textarea></div><div class="field"><label>Bonus za wzorowe wykonanie (NK)</label><input id="f-bonus-coins" type="number" min="0" max="100000" value="0" placeholder="Np. 20"><small class="subtle">Do bazowej nagrody +${t.rewardCoins||0} NK</small></div></div>`:''}<div class="modal-actions">${close}${canCreateTasks()?'<button class="ghost" id="copy-task-today">Kopiuj na dziś</button>':''}${u.role==='admin'?`${owner?'<button class="ghost" id="discipline-from-task">+ Uwaga / sankcja</button>':''}<button class="ghost" id="edit-task">Edytuj</button>${t.status==='in_progress'?'<button class="ghost" id="reset-task">Zwolnij / jako nowe</button>':''}${owner&&t.penaltyCoins>0&&(t.status==='in_progress'||t.status==='review')?`<button class="dangerbtn" id="fail-task">Niewykonane −${t.penaltyCoins} NK</button>`:''}`:''}${u.role==='admin'&&t.status==='review'?'<button class="dangerbtn" id="reopen-task">Do poprawy</button><button class="goldbtn" id="accept-task">Akceptuj + NK</button>':''}</div></div></div>`;
  }
  if(state.modal==='newLocation'||state.modal==='editLocation'){
    const edit=state.modal==='editLocation',l=edit?state.db.locations.find(x=>x.id===state.locationId):null;
    return `<div class="modal-bg"><div class="modal"><h2>${edit?'Edytuj obiekt':'Nowy obiekt'}</h2><div class="field"><label>Nazwa</label><input id="f-locname" value="${esc(l?.name||'')}" placeholder="Nazwa obiektu"></div><div class="formgrid"><div class="field"><label>Miasto</label><input id="f-city" value="${esc(l?.city||'')}" placeholder="Miasto"></div><div class="field"><label>Adres</label><input id="f-address" value="${esc(l?.address||'')}" placeholder="Ulica / adres"></div></div><div class="field"><label>Opis / informacje</label><textarea id="f-locdesc" placeholder="Dodatkowe informacje o obiekcie">${esc(l?.description||'')}</textarea></div>${edit?`<label class="checkrow"><input id="f-locactive" type="checkbox" ${l?.active?'checked':''}> Obiekt aktywny</label>`:''}<div class="modal-actions">${close}<button class="goldbtn" id="save-location">${edit?'Zapisz':'Dodaj'}</button></div></div></div>`;
  }
  if(state.modal==='newUser')return `<div class="modal-bg"><div class="modal"><h2>Nowy pracownik demo</h2><div class="field"><label>Imię / nazwa</label><input id="f-username"></div><div class="field"><label>Obiekty</label><div class="checkbox-grid">${state.db.locations.map(l=>`<label class="checkrow"><input type="checkbox" name="userloc" value="${l.id}"> ${esc(l.name)}</label>`).join('')}</div></div><div class="modal-actions">${close}<button class="goldbtn" id="save-user">Dodaj</button></div></div></div>`;
  if(state.modal==='editUser'){
    const u=state.db.users.find(x=>x.id===state.userId);
    return `<div class="modal-bg"><div class="modal"><h2>Edytuj pracownika</h2><div class="field"><label>Imię / nazwa</label><input id="f-username" value="${esc(u.name)}"></div><div class="formgrid"><div class="field"><label>Rola</label><select id="f-role"><option value="worker" ${u.role==='worker'?'selected':''}>Pracownik</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrator</option></select></div><div class="field"><label>Status</label><select id="f-active"><option value="1" ${u.active?'selected':''}>Aktywny</option><option value="0" ${!u.active?'selected':''}>Nieaktywny</option></select></div></div><label class="checkrow"><input id="f-manage-rentals" type="checkbox" ${u.canManageRentals?'checked':''}> Może dodawać i edytować umowy najmu w przypisanych obiektach</label><label class="checkrow"><input id="f-add-inspections" type="checkbox" ${u.canAddInspections?'checked':''}> Może dodawać przeglądy w przypisanych obiektach</label><label class="checkrow"><input id="f-create-tasks" type="checkbox" ${u.canCreateTasks?'checked':''}> Może dodawać zadania w przypisanych obiektach</label><label class="checkrow"><input id="f-view-team-hours" type="checkbox" ${u.canViewTeamHours?'checked':''}> Może widzieć czas pracy i wykonane zadania w przypisanych obiektach</label><label class="checkrow"><input id="f-view-important" type="checkbox" ${u.canViewImportant?'checked':''}> Widzi ważne terminy swoich obiektów</label><div class="field"><label>Przypisane obiekty</label><div class="checkbox-grid">${state.db.locations.map(l=>`<label class="checkrow"><input type="checkbox" name="userloc" value="${l.id}" ${u.locationIds.includes(l.id)?'checked':''}> ${esc(l.name)}</label>`).join('')}</div></div><div class="modal-actions">${close}<button class="goldbtn" id="save-user-edit">Zapisz</button></div></div></div>`;
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
function bind(){bindExtraMissions();bindProfileMessaging();if(state.tab!=='chat'){stopChatAudio();closeChatPreview();clearInterval(window.imperiumChatTimer);}if(state.tab==='chat'){
  bindChatMedia();
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
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;if(state.tab==='profile'){publicProfileId=null;state.profileView='mine';}if(state.tab==='profile'&&state.profileView==='team'&&canViewTeamHours())loadTeamMonth();else if(state.tab==='salary'){render();loadSalaryMonth();}else render();});
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;render();});
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(state.pdfUrl){URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=null;}state.invoicePdfBlob=null;state.modal=null;state.taskId=null;state.locationId=null;state.userId=null;state.roomId=null;selectedFiles=[];fileInput.value='';render();});
  bindSalary();
  document.getElementById('logout')?.addEventListener('click',()=>state.mode==='cloud'?signOutCloud():demoLogout());
  document.getElementById('new-task')?.addEventListener('click',()=>{taskCopyDraft=null;selectedFiles=[];state.modal='newTask';render();});
  document.getElementById('add-location')?.addEventListener('click',()=>{state.modal='newLocation';render();});
  document.getElementById('add-inspection')?.addEventListener('click',()=>{state.inspectionId=null;state.modal='newInspection';render();});
  document.querySelectorAll('[data-rental-location]').forEach(b=>b.onclick=()=>{state.rentalLocationId=b.dataset.rentalLocation;render();});
  document.querySelectorAll('[data-rental-tree]').forEach(el=>el.addEventListener('toggle',()=>{state.rentalExpanded[el.dataset.rentalTree]=el.open;}));
  document.getElementById('add-rental')?.addEventListener('click',()=>{state.rentalId=null;state.roomId=null;state.modal='newRental';render();});
  document.getElementById('add-invoice-seller')?.addEventListener('click',()=>{state.invoiceId=null;state.modal='invoiceSeller';render();});
  document.querySelectorAll('[data-edit-invoice-seller]').forEach(b=>b.onclick=()=>{state.invoiceId=b.dataset.editInvoiceSeller;state.modal='invoiceSeller';render();});
  document.getElementById('save-invoice-seller')?.addEventListener('click',saveInvoiceSeller);
  document.querySelectorAll('[data-nip-lookup]').forEach(b=>b.addEventListener('click',()=>lookupCompanyNip(b)));
  document.getElementById('add-invoice')?.addEventListener('click',()=>{state.invoiceId=null;state.invoiceRentalId=null;state.invoiceLines=[{description:'',unit:'usł.',quantity:'1',unit_net:'',vat_rate:''}];state.modal='invoiceDraft';render();});
  document.querySelectorAll('[data-edit-invoice]').forEach(b=>b.onclick=()=>{state.invoiceId=b.dataset.editInvoice;state.invoiceLines=[];state.modal='invoiceDraft';render();});
  document.querySelectorAll('[data-invoice-rental]').forEach(b=>b.onclick=()=>{const r=state.rentals.find(x=>x.id===b.dataset.invoiceRental);if(!r)return;state.invoiceId=null;state.invoiceRentalId=r.id;state.invoiceLines=invoiceLineDefaults(r);state.tab='invoices';state.modal=state.invoiceSellers.length?'invoiceDraft':null;render();if(!state.invoiceSellers.length)toast('Najpierw dodaj firmę wystawiającą faktury.');});
  document.querySelectorAll('[data-export-invoice]').forEach(b=>b.onclick=()=>exportInvoiceXml(b.dataset.exportInvoice));
  document.querySelectorAll('[data-view-invoice-pdf]').forEach(b=>b.onclick=()=>viewInvoicePdf(b.dataset.viewInvoicePdf));
  document.getElementById('save-invoice')?.addEventListener('click',saveInvoiceDraft);
  document.getElementById('delete-invoice')?.addEventListener('click',deleteInvoiceDraft);
  document.getElementById('add-invoice-line')?.addEventListener('click',()=>{state.invoiceLines=readInvoiceLines();state.invoiceLines.push({description:'',unit:'usł.',quantity:'1',unit_net:'',vat_rate:''});render();});
  document.querySelectorAll('[data-remove-invoice-line]').forEach(b=>b.onclick=()=>{state.invoiceLines=readInvoiceLines().filter((_,i)=>i!==Number(b.dataset.removeInvoiceLine));if(!state.invoiceLines.length)state.invoiceLines=[{description:'',unit:'usł.',quantity:'1',unit_net:'',vat_rate:''}];render();});
  document.getElementById('f-invoice-rental')?.addEventListener('change',e=>fillInvoiceRental(e.target.value));
  document.getElementById('invoice-lines')?.addEventListener('input',updateInvoiceTotal);
  document.getElementById('invoice-lines')?.addEventListener('change',updateInvoiceTotal);
  updateInvoiceTotal();
  document.querySelectorAll('[data-add-room]').forEach(b=>b.onclick=()=>{state.roomId=null;state.roomBuilding=b.dataset.addRoom;state.roomFloor=b.dataset.floor;state.modal='room';render();});
  document.querySelectorAll('[data-edit-room]').forEach(b=>b.onclick=()=>{state.roomId=b.dataset.editRoom;state.modal='room';render();});
  document.querySelectorAll('[data-room-rental]').forEach(b=>b.onclick=()=>{state.roomId=b.dataset.roomRental;state.rentalId=null;state.modal='newRental';render();});
  document.getElementById('save-room')?.addEventListener('click',saveRentalRoom);
  document.getElementById('delete-room')?.addEventListener('click',deleteRentalRoom);
  document.getElementById('f-room-meter')?.addEventListener('change',updateRoomMeterFields);
  updateRoomMeterFields();
  document.querySelectorAll('[data-add-rental-pdf]').forEach(b=>b.onclick=()=>{state.rentalId=b.dataset.addRentalPdf;document.getElementById('rental-pdf-input').click();});
  document.querySelectorAll('[data-view-rental-pdf]').forEach(b=>b.onclick=()=>viewRentalPdf(b.dataset.viewRentalPdf));
  document.querySelectorAll('[data-edit-rental]').forEach(b=>b.onclick=()=>{state.rentalId=b.dataset.editRental;state.modal='editRental';render();});
  document.querySelectorAll('[data-add-rental-action]').forEach(b=>b.onclick=()=>{state.rentalId=b.dataset.addRentalAction;state.actionId=null;state.modal='rentalAction';render();});
  document.querySelectorAll('[data-edit-rental-action]').forEach(b=>b.onclick=()=>{const a=state.rentalActions.find(x=>x.id===b.dataset.editRentalAction);state.rentalId=a?.rentalId;state.actionId=a?.id;state.modal='rentalAction';render();});
  document.getElementById('save-rental-action')?.addEventListener('click',saveRentalAction);
  document.getElementById('complete-rental-action')?.addEventListener('click',completeRentalAction);
  document.querySelectorAll('[data-progress-alert]').forEach(b=>b.onclick=()=>setImportantProgress(b.dataset.progressAlert,b.dataset.progressValue==='1'));
  document.querySelectorAll('[data-complete-alert]').forEach(b=>b.onclick=()=>completeImportantAlert(b.dataset.completeAlert));
  document.getElementById('save-rental')?.addEventListener('click',saveRental);
  document.getElementById('delete-rental')?.addEventListener('click',deleteRental);
  document.getElementById('f-rental-indefinite')?.addEventListener('change',e=>{document.getElementById('f-rental-end').disabled=e.target.checked;if(e.target.checked)document.getElementById('f-rental-end').value='';});
  document.getElementById('f-rental-location')?.addEventListener('change',e=>{const field=document.getElementById('rental-room-field'),select=document.getElementById('f-rental-room-id');if(!field||!select)return;field.hidden=!isHotelTur(e.target.value);select.innerHTML='<option value="">Bez przypisanego pomieszczenia</option>'+state.rentalRooms.filter(x=>x.locationId===e.target.value).map(x=>`<option value="${esc(x.id)}">${esc(rentalRoomLabel(x))} · ${esc(x.areaSqm)} m²</option>`).join('');});
  const roomField=document.getElementById('rental-room-field');if(roomField)roomField.hidden=!isHotelTur(document.getElementById('f-rental-location').value);
  document.getElementById('f-rental-room-id')?.addEventListener('change',e=>{const room=state.rentalRooms.find(x=>x.id===e.target.value);if(room&&!state.rentalId){document.getElementById('f-rental-area').value=room.areaSqm;updateRentalFormTotal();}});
  document.querySelectorAll('.rental-modal input').forEach(el=>el.addEventListener('input',updateRentalFormTotal));
  updateRentalFormTotal();
  if(state.modal==='rentalPdf')loadRentalPdfPreview();
  if(state.modal==='invoicePdf')loadInvoicePdfPreview();
  document.querySelectorAll('[data-edit-inspection]').forEach(b=>b.onclick=()=>{state.inspectionId=b.dataset.editInspection;state.modal='editInspection';render();});
  document.getElementById('save-inspection')?.addEventListener('click',saveInspection);
  document.getElementById('delete-inspection')?.addEventListener('click',deleteInspection);
  document.getElementById('add-user')?.addEventListener('click',()=>{state.modal='newUser';render();});
  document.querySelectorAll('[data-edit-location]').forEach(b=>b.onclick=()=>{state.locationId=b.dataset.editLocation;state.modal='editLocation';render();});
  document.querySelectorAll('[data-edit-user]').forEach(b=>b.onclick=()=>{state.userId=b.dataset.editUser;state.modal='editUser';render();});
  document.querySelectorAll('[data-profile-view]').forEach(b=>b.onclick=()=>{state.profileView=b.dataset.profileView;if(state.profileView==='team')loadTeamMonth();else render();});
  document.querySelectorAll('[data-team-month]').forEach(b=>b.onclick=()=>{const [y,m]=state.teamMonth.split('-').map(Number);state.teamMonth=new Date(Date.UTC(y,m-1+Number(b.dataset.teamMonth),1)).toISOString().slice(0,7);loadTeamMonth();});
  document.getElementById('team-worker')?.addEventListener('change',e=>{state.teamWorker=e.target.value;render();});
  document.querySelectorAll('[data-worker-card]').forEach(b=>b.onclick=()=>{state.userId=b.dataset.workerCard;state.workerPeriod='all';state.modal='workerCard';render();});
  document.querySelectorAll('input[name="voucher-kind"]').forEach(b=>b.onchange=()=>{
    const kind=document.querySelector('input[name="voucher-kind"]:checked')?.value;
    document.getElementById('voucher-time-field').hidden=kind==='day'||kind==='bonus_500';
    document.getElementById('voucher-day-field').hidden=kind!=='day';
  });
  document.getElementById('redeem-voucher')?.addEventListener('click',redeemVoucher);
  document.querySelectorAll('[data-voucher-paid]').forEach(b=>b.onclick=()=>markVoucherPaid(b.dataset.voucherPaid));
  document.querySelectorAll('[data-worker-period]').forEach(b=>b.onclick=()=>{state.workerPeriod=b.dataset.workerPeriod;render();});
  document.querySelectorAll('[data-history-task]').forEach(b=>b.onclick=()=>{state.taskId=b.dataset.historyTask;state.modal='detail';render();});
  document.querySelectorAll('[data-delete-discipline]').forEach(b=>b.onclick=()=>deleteDiscipline(b.dataset.deleteDiscipline));
  document.getElementById('add-discipline')?.addEventListener('click',()=>{state.taskId=null;state.modal='addDiscipline';render();});
  document.getElementById('adjust-coins')?.addEventListener('click',()=>{state.modal='coinAdjust';render();});
  document.getElementById('save-coin-adjustment')?.addEventListener('click',saveCoinAdjustment);
  document.getElementById('back-worker-card')?.addEventListener('click',()=>{state.taskId=null;state.modal='workerCard';render();});
  document.getElementById('save-discipline')?.addEventListener('click',saveDiscipline);
  document.getElementById('f-loc')?.addEventListener('change',updateTaskAssignees);
  fillTaskCopyForm();
  if(state.modal==='newTask'||state.modal==='editTask')updateTaskAssignees();
  document.getElementById('save-task')?.addEventListener('click',saveTaskFromForm);
  document.getElementById('delete-task')?.addEventListener('click',deleteTask);
  document.getElementById('save-location')?.addEventListener('click',saveLocationFromForm);
  document.getElementById('save-user')?.addEventListener('click',addDemoUser);
  document.getElementById('save-user-edit')?.addEventListener('click',saveUserEdit);
  document.getElementById('pick-files')?.addEventListener('click',()=>fileInput.click());
  document.getElementById('submit-report')?.addEventListener('click',submitReport);
  document.getElementById('accept-task')?.addEventListener('click',()=>reviewTask(true));
  document.getElementById('reopen-task')?.addEventListener('click',()=>reviewTask(false));
  document.getElementById('copy-task-today')?.addEventListener('click',()=>copyTaskToday(state.taskId));
  document.getElementById('edit-task')?.addEventListener('click',()=>{state.modal='editTask';selectedFiles=[];render();});
  document.getElementById('discipline-from-task')?.addEventListener('click',()=>{const t=state.db.tasks.find(x=>x.id===state.taskId);if(!t?.claimedBy)return toast('Najpierw zadanie musi mieć wykonawcę.');state.userId=t.claimedBy;state.modal='addDiscipline';render();});
  document.getElementById('reset-task')?.addEventListener('click',resetTask);
  document.getElementById('fail-task')?.addEventListener('click',failTask);
  document.querySelectorAll('[data-extend]').forEach(b=>b.onclick=()=>extendTask(Number(b.dataset.extend)));
  document.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>openAttachment(b.dataset.file));
  document.querySelectorAll('.task [data-action]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=e.currentTarget.closest('.task').dataset.task,a=e.currentTarget.dataset.action;if(a==='copy')copyTaskToday(id);if(a==='claim')claimTask(id);if(a==='report'){state.taskId=id;state.modal='report';selectedFiles=[];render();}if(a==='detail'){state.taskId=id;state.modal='detail';render();}});
  document.querySelectorAll('.task').forEach(card=>card.onclick=e=>{if(e.target.closest('button'))return;state.taskId=card.dataset.task;state.modal='detail';render();});
  document.getElementById('enable-notifications')?.addEventListener('click',async()=>{if(window.AndroidBridge?.requestNotificationPermission){try{window.AndroidBridge.requestNotificationPermission();toast('Poproszono Androida o zgodę.');return;}catch(e){}}if(!('Notification' in window))return toast('Powiadomienia przeglądarkowe są niedostępne.');const p=await Notification.requestPermission();toast(p==='granted'?'Powiadomienia włączone.':'Brak zgody.');});
  document.getElementById('notification-sound-test')?.addEventListener('click',playNotificationSound);
  document.getElementById('reset-demo')?.addEventListener('click',()=>{state.db=seed();saveDemoDB();toast('Dane demo przywrócone.');render();});
  document.getElementById('copy-code')?.addEventListener('click',async()=>{const code=configCode();try{await navigator.clipboard.writeText(code);toast('Kod skopiowany.');}catch(e){toast('Przytrzymaj kod i skopiuj go ręcznie.');}});
  document.getElementById('server-settings')?.addEventListener('click',()=>{state.modal='cloudSetup';render();});
  document.getElementById('cloud-logout')?.addEventListener('click',signOutCloud);
  document.getElementById('attendance-start')?.addEventListener('click',startAttendance);
  document.getElementById('attendance-stop')?.addEventListener('click',stopAttendance);
  document.getElementById('shift-add')?.addEventListener('click',addWorkShift);
  document.querySelectorAll('[data-shift-delete]').forEach(b=>b.onclick=()=>deleteWorkShift(b.dataset.shiftDelete));
  document.getElementById('admin-attendance-start')?.addEventListener('click',adminStartAttendance);
  document.querySelectorAll('[data-admin-attendance-stop]').forEach(b=>b.onclick=()=>adminStopAttendance(b.dataset.adminAttendanceStop));
  document.querySelectorAll('[data-edit-attendance-start]').forEach(b=>b.onclick=()=>{if(!isAdmin())return;state.attendanceId=b.dataset.editAttendanceStart;state.modal='editAttendanceStart';render();});
  document.getElementById('save-attendance-start')?.addEventListener('click',saveAttendanceStart);
  updateTimers();
}

// ---------- Operations ----------
async function withAction(label,fn){
  try{setLoading(true,label);await fn();state.loading=false;render();}catch(e){state.loading=false;render();toast(e.message||'Wystąpił błąd.');}
}
function updateTaskAssignees(){
  const locationId=document.getElementById('f-loc')?.value;
  document.querySelectorAll('[data-task-user]').forEach(label=>{
    const worker=state.db.users.find(u=>u.id===label.dataset.taskUser),allowed=worker?.locationIds.includes(locationId);
    label.hidden=!allowed;if(!allowed)label.querySelector('input').checked=false;
  });
}
function readTaskForm(){
  const title=document.getElementById('f-title').value.trim();if(!title)throw new Error('Wpisz tytuł zadania.');
  const startInput=document.getElementById('f-task-start')?.value||'',endInput=document.getElementById('f-task-end')?.value||'';
  if(!!startInput!==!!endInput)throw new Error('Podaj zarówno początek, jak i koniec zadania.');
  const start=startInput?new Date(startInput):null,end=endInput?new Date(endInput):null;
  if(start&&(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start))throw new Error('Koniec musi być później niż początek.');
  if(end&&end.getTime()<=Date.now()&&state.modal==='newTask')throw new Error('Koniec zadania musi być w przyszłości.');
  const assignedIds=[...document.querySelectorAll('input[name="task-assignee"]:checked')].map(x=>x.value);
  const durationMin=start?Math.ceil((end-start)/60000):Math.max(5,Number(document.getElementById('f-duration').value)||60);
  if(durationMin<5||durationMin>10080)throw new Error('Czas zadania musi wynosić od 5 minut do 7 dni.');
  return {title,description:document.getElementById('f-desc').value.trim(),notes:document.getElementById('f-notes').value.trim(),sanctionType:document.getElementById('f-sanction-type')?.value||'none',sanctionText:(document.getElementById('f-sanction-text')?.value||'').trim(),disciplinaryNote:(document.getElementById('f-disciplinary')?.value||'').trim(),rewardCoins:Math.max(0,Math.floor(Number(document.getElementById('f-reward-coins')?.value)||0)),penaltyCoins:Math.max(0,Math.floor(Number(document.getElementById('f-penalty-coins')?.value)||0)),locationId:document.getElementById('f-loc').value,priority:document.getElementById('f-priority').value,durationMin,assignedIds,scheduledStart:start?.toISOString()||null,scheduledEnd:end?.toISOString()||null};
}
async function saveTaskFromForm(){
  let v;try{v=readTaskForm();}catch(e){return toast(e.message);}
  const edit=state.modal==='editTask',id=state.taskId,existing=edit?state.db.tasks.find(t=>t.id===id):null;
  if(edit&&!isAdmin()||!edit&&!canCreateTasks())return;
  if(!isAdmin()&&!currentUser().locationIds.includes(v.locationId))return toast('Brak dostępu do obiektu.');
  if(v.assignedIds.some(id=>!state.db.users.some(u=>u.id===id&&u.active!==false&&u.role==='worker'&&u.locationIds.includes(v.locationId))))return toast('Wybierz pracowników przypisanych do tego obiektu.');
  if(edit&&existing?.claimedBy&&!getUser(existing.claimedBy)?.locationIds.includes(v.locationId))return toast('Wykonawca rozpoczętego zadania nie ma dostępu do tego obiektu.');
  if(!isAdmin())Object.assign(v,{sanctionType:'none',sanctionText:'',disciplinaryNote:'',rewardCoins:0,penaltyCoins:0});
  const existingOwner=existing?.assignedTo||existing?.claimedBy;
  const primary=edit&&existing?.status!=='open'?existingOwner:(v.assignedIds[0]||null);
  if(edit&&existing?.status!=='open'&&primary&&!v.assignedIds.includes(primary))v.assignedIds.unshift(primary);
  const groupId=existing?.groupId||uid();
  const fields={title:v.title,description:v.description,notes:v.notes,sanction_type:v.sanctionType,sanction_text:v.sanctionText,disciplinary_note:v.disciplinaryNote,reward_coins:v.rewardCoins,penalty_coins:v.penaltyCoins,location_id:v.locationId,priority:v.priority,duration_min:v.durationMin,scheduled_start:v.scheduledStart,scheduled_end:v.scheduledEnd,assignment_group_id:groupId};
  const newIds=edit?v.assignedIds.filter(x=>x!==primary&&!state.db.tasks.some(t=>t.groupId===groupId&&(t.assignedTo||t.claimedBy)===x)):v.assignedIds.slice(1);
  const newAssignees=edit?newIds:[primary,...newIds];
  const fileSnapshot=[...selectedFiles];
  await withAction(edit?'Zapisywanie zmian…':'Tworzenie zadania…',async()=>{
    if(state.mode==='demo'){
      if(edit){Object.assign(existing,{...v,assignedTo:primary,groupId});if(fileSnapshot.length)existing.attachments.push(...fileSnapshot.map(f=>({id:uid(),name:f.name,size:f.size,type:f.type,kind:'task'})));await logEvent('task_edit',`Zmieniono zadanie „${v.title}”`,id);}
      const list=edit?newIds:newAssignees;
      for(const assignee of list){const t={id:uid(),...v,assignedTo:assignee,groupId,status:'open',createdAt:nowISO(),createdBy:currentUser().id,claimedBy:null,claimedAt:null,deadlineAt:null,completedAt:null,reworkCount:0,report:null,comments:[],attachments:fileSnapshot.map(f=>({id:uid(),name:f.name,size:f.size,type:f.type,kind:'task'}))};state.db.tasks.unshift(t);}
      if(!edit)await logEvent('task',`Utworzono zadanie „${v.title}” w ${getLoc(v.locationId)?.name}`);
      saveDemoDB();
    }else{
      if(edit){await pgPatch('tasks',`id=eq.${encodeURIComponent(id)}`,{...fields,assigned_to:primary});if(fileSnapshot.length)await uploadFiles(id,fileSnapshot,'task');await logEvent('task_edit',`Zmieniono zadanie „${v.title}”`,id);}
      const list=edit?newIds:newAssignees;
      if(list.length){const rows=await pgPost('tasks',list.map(assignee=>({...fields,assigned_to:assignee,created_by:currentUser().id,status:'open',claimed_by:null,claimed_at:null,deadline_at:null})),'return=representation');for(const t of rows){if(fileSnapshot.length)await uploadFiles(t.id,fileSnapshot,'task');}if(!edit)await logEvent('task',`Utworzono zadanie „${v.title}” w ${getLoc(v.locationId)?.name}`,rows[0]?.id);}
      await loadCloudDB({silent:true});
    }
    taskCopyDraft=null;selectedFiles=[];fileInput.value='';state.modal=null;state.taskId=null;
    notify('IMPERIUM',`Nowe zadanie: ${v.title}`);
  });
}
async function deleteTask(){
  const t=state.db.tasks.find(x=>x.id===state.taskId); if(!t)return; if(!confirm(`Usunąć zadanie „${t.title}”?`))return;
  await withAction('Usuwanie zadania…',async()=>{if(state.mode==='demo'){state.db.tasks=state.db.tasks.filter(x=>x.id!==t.id);await logEvent('task_delete',`Usunięto zadanie „${t.title}”`,null);saveDemoDB();}else{await pgDelete('tasks',`id=eq.${encodeURIComponent(t.id)}`);await logEvent('task_delete',`Usunięto zadanie „${t.title}”`,null);await loadCloudDB({silent:true});}state.modal=null;state.taskId=null;});
}
async function claimTask(id){
  const preview=state.db.tasks.find(x=>x.id===id);if(!preview)return;
  if(preview.notes || preview.rewardCoins || preview.penaltyCoins || (preview.sanctionType&&preview.sanctionType!=='none')){const parts=[];if(preview.rewardCoins)parts.push(`NAGRODA: +${preview.rewardCoins} NK po akceptacji.`);if(preview.penaltyCoins)parts.push(`NIEWYKONANIE: −${preview.penaltyCoins} NK po decyzji administratora.`);if(preview.notes)parts.push(`UWAGI / WYMAGANIA:\n${preview.notes}`);if(preview.sanctionType&&preview.sanctionType!=='none')parts.push(`SANKCJA / KONSEKWENCJE:\n${sanctionLabel(preview.sanctionType)}${preview.sanctionText?` — ${preview.sanctionText}`:''}`);parts.push('\nCzy potwierdzasz przejęcie zadania i zapoznanie się z tymi warunkami?');if(!confirm(parts.join('\n\n')))return;}
  await withAction('Przejmowanie zadania…',async()=>{const t=state.db.tasks.find(x=>x.id===id);if(!t||t.status!=='open'||t.assignedTo&&t.assignedTo!==currentUser().id||t.scheduledStart&&new Date(t.scheduledStart)>new Date()||t.scheduledEnd&&new Date(t.scheduledEnd)<=new Date())throw new Error('Zadanie nie jest teraz dostępne dla tego pracownika.');if(state.mode==='demo'){t.status='in_progress';t.claimedBy=currentUser().id;t.claimedAt=nowISO();t.deadlineAt=t.scheduledEnd||new Date(Date.now()+t.durationMin*60000).toISOString();await logEvent('claim',`${currentUser().name} przejął zadanie „${t.title}”`,t.id);saveDemoDB();}else{await cloudFetch('/rest/v1/rpc/claim_task',{method:'POST',body:{p_task_id:id}});await logEvent('claim',`${currentUser().name} przejął zadanie „${t.title}”`,t.id);await loadCloudDB({silent:true});}notify('Zadanie przejęte',`${currentUser().name}: ${t.title}`);});
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
function invoiceLineDefaults(r){return [
  {description:`Czynsz najmu${r.premisesNumber?' · lokal '+r.premisesNumber:''}`,unit:'m²',quantity:String(r.areaSqm),unit_net:String(r.priceSqmNet),vat_rate:''},
  ...(r.parkingNet?[{description:'Parking',unit:'usł.',quantity:'1',unit_net:String(r.parkingNet),vat_rate:''}]:[]),
  ...(r.internetNet?[{description:'Internet',unit:'usł.',quantity:'1',unit_net:String(r.internetNet),vat_rate:''}]:[]),
  ...(r.cleaningNet?[{description:'Sprzątanie',unit:'usł.',quantity:'1',unit_net:String(r.cleaningNet),vat_rate:''}]:[])
];}
function readInvoiceLines(){return [...document.querySelectorAll('[data-invoice-line]')].map(row=>Object.fromEntries(['description','quantity','unit','unit_net','vat_rate'].map(k=>[k,row.querySelector(`[data-il="${k}"]`)?.value.trim()||''])));}
function updateInvoiceTotal(){const el=document.getElementById('invoice-live-total');if(!el)return;try{const t=window.ImperiumInvoice.calculate(readInvoiceLines());el.innerHTML=`Suma: <b>${rentMoney(t.net/100)} netto</b> + VAT ${rentMoney(t.vat/100)} = <b>${rentMoney(t.gross/100)} brutto</b>`;}catch(e){el.textContent='Uzupełnij pozycje i wybierz stawki VAT.';}}
function fillInvoiceRental(id){
  const r=state.rentals.find(x=>x.id===id);if(!r)return;
  document.getElementById('f-invoice-buyer').value=r.contractor;
  document.getElementById('f-invoice-nip').value=r.nip||'';
  state.invoiceLines=invoiceLineDefaults(r);
  document.getElementById('invoice-lines').innerHTML=state.invoiceLines.map(invoiceLineFields).join('');
  updateInvoiceTotal();
}
async function saveInvoiceSeller(){
  if(!isAdmin())return;
  const old=state.invoiceSellers.find(x=>x.id===state.invoiceId),value={name:document.getElementById('f-seller-name').value.trim(),nip:document.getElementById('f-seller-nip').value.trim(),streetAddress:document.getElementById('f-seller-street').value.trim(),postalCity:document.getElementById('f-seller-city').value.trim(),bankAccount:document.getElementById('f-seller-bank').value.trim()};
  if(!value.name||!value.streetAddress||!value.postalCity||!window.ImperiumInvoice.validNip(value.nip))return toast('Wpisz nazwę, poprawny NIP i pełny adres firmy.');
  await withAction('Zapisywanie firmy…',async()=>{
    if(state.mode==='demo'){if(old)Object.assign(old,value);else state.db.invoiceSellers.push({id:uid(),...value});saveDemoDB();}
    else{const row={name:value.name,nip:value.nip,street_address:value.streetAddress,postal_city:value.postalCity,bank_account:value.bankAccount};if(old)await pgPatch('invoice_sellers',`id=eq.${encodeURIComponent(old.id)}`,row);else await pgPost('invoice_sellers',row);await loadCloudDB({silent:true});}
    state.modal=null;state.invoiceId=null;
  });
}
async function saveInvoiceDraft(){
  if(!isAdmin())return;
  const old=state.invoiceDrafts.find(x=>x.id===state.invoiceId),v={sellerId:document.getElementById('f-invoice-seller').value,rentalId:document.getElementById('f-invoice-rental').value||null,number:document.getElementById('f-invoice-number').value.trim(),issueDate:document.getElementById('f-invoice-issued').value,saleDate:document.getElementById('f-invoice-sale').value,dueDate:document.getElementById('f-invoice-due').value,buyerName:document.getElementById('f-invoice-buyer').value.trim(),buyerNip:document.getElementById('f-invoice-nip').value.trim(),buyerStreet:document.getElementById('f-invoice-street').value.trim(),buyerPostalCity:document.getElementById('f-invoice-city').value.trim(),lines:readInvoiceLines()};
  if(!v.number||!v.issueDate||!v.saleDate||!v.dueDate||v.dueDate<v.issueDate||!v.buyerName||!v.buyerStreet||!v.buyerPostalCity||!window.ImperiumInvoice.validNip(v.buyerNip))return toast('Uzupełnij numer, daty i pełne dane nabywcy z poprawnym NIP.');
  if(state.invoiceDrafts.some(x=>x.id!==old?.id&&x.sellerId===v.sellerId&&x.number===v.number))return toast('Ta firma ma już fakturę o takim numerze.');
  try{window.ImperiumInvoice.generate(v,state.invoiceSellers.find(x=>x.id===v.sellerId));}catch(e){return toast(e.message);}
  const seller=state.invoiceSellers.find(x=>x.id===v.sellerId),sellerSnapshot={name:seller.name,nip:seller.nip,streetAddress:seller.streetAddress,postalCity:seller.postalCity,bankAccount:seller.bankAccount||''};
  await withAction('Zapisywanie szkicu…',async()=>{
    if(state.mode==='demo'){if(old)Object.assign(old,v,{sellerSnapshot});else state.db.invoiceDrafts.unshift({id:uid(),status:'draft',...v,sellerSnapshot});saveDemoDB();}
    else{const row={seller_id:v.sellerId,rental_id:v.rentalId,invoice_number:v.number,issue_date:v.issueDate,sale_date:v.saleDate,due_date:v.dueDate,buyer_name:v.buyerName,buyer_nip:v.buyerNip,buyer_street:v.buyerStreet,buyer_postal_city:v.buyerPostalCity,lines:v.lines,seller_snapshot:sellerSnapshot};if(old)await pgPatch('invoice_drafts',`id=eq.${encodeURIComponent(old.id)}`,row);else await pgPost('invoice_drafts',{...row,created_by:currentUser().id});await loadCloudDB({silent:true});}
    state.invoiceId=null;state.invoiceLines=[];state.modal=null;
  });
}
async function deleteInvoiceDraft(){const x=state.invoiceDrafts.find(y=>y.id===state.invoiceId);if(!isAdmin()||!x||!confirm('Usunąć szkic faktury?'))return;await withAction('Usuwanie szkicu…',async()=>{if(state.mode==='demo'){state.db.invoiceDrafts=state.db.invoiceDrafts.filter(y=>y.id!==x.id);saveDemoDB();}else{await pgDelete('invoice_drafts',`id=eq.${encodeURIComponent(x.id)}`);await loadCloudDB({silent:true});}state.modal=null;state.invoiceId=null;});}
function invoicePdfFileName(invoice){return `Faktura-${invoice.number.replace(/[^a-zA-Z0-9._-]+/g,'_')}.pdf`;}
function viewInvoicePdf(id){const invoice=state.invoiceDrafts.find(x=>x.id===id);if(!invoice)return;if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=null;state.invoicePdfBlob=null;state.invoiceId=id;state.pdfName=invoice.number;state.modal='invoicePdf';render();}
async function loadInvoicePdfPreview(){
  const id=state.invoiceId,invoice=state.invoiceDrafts.find(x=>x.id===id),seller=invoice?.sellerSnapshot||state.invoiceSellers.find(x=>x.id===invoice?.sellerId),box=document.getElementById('invoice-pdf-content');
  if(!invoice||!seller||!box)return;
  try{
    const bytes=await window.ImperiumInvoicePdf.generate(invoice,seller);
    if(state.modal!=='invoicePdf'||state.invoiceId!==id)return;
    const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob);
    if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl=url;state.invoicePdfBlob=blob;
    box.innerHTML='<div class="pdf-pages">Ładowanie stron…</div>';
    const pdfjs=await import('./pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='./pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument(url).promise,pages=box.querySelector('.pdf-pages');
    if(state.modal!=='invoicePdf'||state.invoiceId!==id)return;
    pages.textContent='';
    for(let n=1;n<=pdf.numPages;n++){
      if(state.modal!=='invoicePdf'||state.invoiceId!==id)break;
      const page=await pdf.getPage(n),base=page.getViewport({scale:1}),scale=Math.min(2,Math.max(.5,(pages.clientWidth-12)/base.width)),view=page.getViewport({scale});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.setAttribute('aria-label',`Strona ${n} z ${pdf.numPages}`);pages.appendChild(canvas);
      await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
    }
  }catch(e){if(state.modal==='invoicePdf')box.textContent=`Nie udało się przygotować PDF: ${e.message}`;}
  if(state.modal==='invoicePdf'&&state.invoiceId===id&&state.invoicePdfBlob){
    const save=document.createElement('button');save.className='smallbtn gold';save.textContent='Pobierz PDF';save.onclick=saveInvoicePdf;
    const footer=document.createElement('div');footer.className='modal-actions';footer.appendChild(save);box.appendChild(footer);
  }
}
async function saveInvoicePdf(){
  const invoice=state.invoiceDrafts.find(x=>x.id===state.invoiceId),blob=state.invoicePdfBlob;
  if(!invoice||!blob)return toast('Otwórz najpierw podgląd PDF.');
  const name=invoicePdfFileName(invoice);
  if(window.AndroidBridge?.saveFile){const reader=new FileReader();reader.onload=()=>window.AndroidBridge.saveFile(name,'application/pdf',String(reader.result).split(',')[1]);reader.onerror=()=>toast('Nie udało się przygotować pliku.');reader.readAsDataURL(blob);return;}
  const link=document.createElement('a');link.href=state.pdfUrl;link.download=name;document.body.appendChild(link);link.click();link.remove();
}
function exportInvoiceXml(id){
  const invoice=state.invoiceDrafts.find(x=>x.id===id),seller=invoice?.sellerSnapshot||state.invoiceSellers.find(x=>x.id===invoice?.sellerId);if(!invoice||!seller)return;
  try{const xml=invoice.issuedXml||window.ImperiumInvoice.generate(invoice,seller),blob=new Blob([xml],{type:'application/xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`FA3-${invoice.number.replace(/[^a-zA-Z0-9._-]+/g,'_')}.xml`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){toast(e.message);}
}
function rentalNumber(id){return Number(document.getElementById(id)?.value||0);}
function updateRoomMeterFields(){const box=document.getElementById('room-meter-fields');if(box)box.hidden=!document.getElementById('f-room-meter').checked;}
async function saveRentalRoom(){
  if(!canManageRentals()||!isHotelTur(state.rentalLocationId))return;
  const old=state.rentalRooms.find(x=>x.id===state.roomId),number=document.getElementById('f-room-number').value.trim(),area=Number(document.getElementById('f-room-area').value),hasMeter=document.getElementById('f-room-meter').checked,raw=document.getElementById('f-room-reading').value,readOn=document.getElementById('f-room-read-on').value||null,reading=hasMeter&&raw!==''?Number(raw):null;
  if(!number||!Number.isFinite(area)||area<=0)return toast('Wpisz numer i powierzchnię pomieszczenia.');
  if(hasMeter&&((reading!==null&&(!Number.isFinite(reading)||reading<0))||!!readOn!==(reading!==null)))return toast('Wpisz stan licznika oraz datę odczytu albo pozostaw oba pola puste.');
  const value={id:old?.id||uid(),locationId:state.rentalLocationId,building:old?.building||state.roomBuilding,floor:old?.floor||state.roomFloor,number,areaSqm:area,hasMeter,meterReading:reading,meterReadOn:hasMeter?readOn:null};
  if(state.rentalRooms.some(x=>x.id!==value.id&&x.locationId===value.locationId&&x.building===value.building&&x.floor===value.floor&&x.number.toLowerCase()===number.toLowerCase()))return toast('To pomieszczenie już istnieje.');
  await withAction('Zapisywanie pomieszczenia…',async()=>{
    if(state.mode==='demo'){state.db.rentalRooms ||= [];if(old)Object.assign(old,value);else state.db.rentalRooms.push(value);state.rentalRooms=state.db.rentalRooms;saveDemoDB();}
    else{const row={location_id:value.locationId,building:value.building,floor:value.floor,room_number:number,area_sqm:area,has_electric_meter:hasMeter,meter_reading:reading,meter_read_on:value.meterReadOn};if(old)await pgPatch('rental_rooms',`id=eq.${encodeURIComponent(old.id)}`,row);else await pgPost('rental_rooms',row);await loadCloudDB({silent:true});}
    state.modal=null;state.roomId=null;
  });
}
async function deleteRentalRoom(){
  const id=state.roomId;if(!isAdmin()||!id)return;
  if(state.rentals.some(r=>r.roomId===id))return toast('Najpierw odłącz umowy od pomieszczenia.');
  if(!confirm('Usunąć pomieszczenie?'))return;
  await withAction('Usuwanie pomieszczenia…',async()=>{if(state.mode==='demo'){state.db.rentalRooms=state.db.rentalRooms.filter(x=>x.id!==id);state.rentalRooms=state.db.rentalRooms;saveDemoDB();}else{await pgDelete('rental_rooms',`id=eq.${encodeURIComponent(id)}`);await loadCloudDB({silent:true});}state.modal=null;state.roomId=null;});
}
async function uploadRentalPdf(file){
  const rental=state.rentals.find(x=>x.id===state.rentalId);
  if(!canManageRentals()||!rental)return toast('Nie znaleziono umowy.');
  if(!file||file.size<1||file.size>50*1024*1024||!(/\.pdf$/i.test(file.name))||file.type&&file.type!=='application/pdf')return toast('Wybierz plik PDF do 50 MB.');
  if(state.mode==='demo'&&file.size>2*1024*1024)return toast('W trybie demo plik PDF może mieć najwyżej 2 MB.');
  await withAction('Wysyłanie PDF…',async()=>{
    if(state.mode==='demo'){state.db.rentalDocuments ||= [];state.db.rentalDocuments.unshift({id:uid(),rentalId:rental.id,name:file.name,size:file.size,preview:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);})});state.rentalDocuments=state.db.rentalDocuments;try{saveDemoDB();}catch(e){state.db.rentalDocuments.shift();throw new Error('Brak miejsca na plik w pamięci demo.');}}
    else{const path=`${rental.id}/${Date.now()}-${uid().slice(0,8)}-${safeFileName(file.name)}`;await cloudFetch(`/storage/v1/object/rental-documents/${encodeStoragePath(path)}`,{method:'POST',body:file,headers:{'Content-Type':'application/pdf','x-upsert':'false'},raw:true});try{await pgPost('rental_documents',{rental_id:rental.id,storage_path:path,file_name:file.name,size_bytes:file.size,uploaded_by:currentUser().id});}catch(e){await cloudFetch(`/storage/v1/object/rental-documents/${encodeStoragePath(path)}`,{method:'DELETE',raw:true}).catch(()=>{});throw e;}await loadCloudDB({silent:true});}
  });
}
function viewRentalPdf(id){const doc=state.rentalDocuments.find(x=>x.id===id);if(!doc)return;state.pdfId=id;state.pdfName=doc.name;state.modal='rentalPdf';render();}
async function loadRentalPdfPreview(){
  const doc=state.rentalDocuments.find(x=>x.id===state.pdfId),box=document.getElementById('rental-pdf-content');if(!doc||!box)return;
  try{
    let url;
    if(state.mode==='demo'){if(!doc.preview)throw new Error('Plik niedostępny w trybie demo.');url=doc.preview;}
    else{const response=await cloudFetch(`/storage/v1/object/authenticated/rental-documents/${encodeStoragePath(doc.path)}`,{raw:true});url=URL.createObjectURL(await response.blob());state.pdfUrl=url;}
    if(state.modal!=='rentalPdf'||state.pdfId!==doc.id){if(state.mode!=='demo')URL.revokeObjectURL(url);return;}
    box.innerHTML=`<div class="rental-pdf-toolbar"><button class="smallbtn" id="rental-pdf-minus" aria-label="Pomniejsz">−</button><span id="rental-pdf-zoom">100%</span><button class="smallbtn" id="rental-pdf-plus" aria-label="Powiększ">+</button><a class="smallbtn" href="${esc(url)}" target="_blank" rel="noopener">Otwórz PDF</a><a class="smallbtn" href="${esc(url)}" download="${esc(doc.name)}">Pobierz</a></div><div class="pdf-pages rental-pdf-pages">Ładowanie stron…</div>`;
    const pdfjs=await import('./pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='./pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument(url).promise,pages=box.querySelector('.pdf-pages');
    if(state.modal!=='rentalPdf'||!pages)return;
    state.pdfZoom=1;let generation=0;
    async function draw(){
      const token=++generation,zoom=state.pdfZoom;
      document.getElementById('rental-pdf-zoom').textContent=`${Math.round(zoom*100)}%`;
      pages.replaceChildren();
      const ratio=Math.min(2,window.devicePixelRatio||1);
      for(let n=1;n<=pdf.numPages;n++){
        if(token!==generation||state.modal!=='rentalPdf'||state.pdfId!==doc.id)return;
        const page=await pdf.getPage(n),base=page.getViewport({scale:1});
        const fit=Math.max(.4,(pages.clientWidth-22)/base.width),view=page.getViewport({scale:fit*zoom});
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width*ratio);canvas.height=Math.ceil(view.height*ratio);
        canvas.style.width=`${Math.ceil(view.width)}px`;canvas.style.height=`${Math.ceil(view.height)}px`;
        canvas.setAttribute('aria-label',`Strona ${n} z ${pdf.numPages}`);pages.appendChild(canvas);
        await page.render({canvasContext:canvas.getContext('2d'),viewport:page.getViewport({scale:fit*zoom*ratio})}).promise;
      }
    }
    box.querySelector('#rental-pdf-minus').onclick=()=>{state.pdfZoom=Math.max(.75,Math.round((state.pdfZoom-.25)*100)/100);draw().catch(e=>toast(e.message));};
    box.querySelector('#rental-pdf-plus').onclick=()=>{state.pdfZoom=Math.min(4,Math.round((state.pdfZoom+.25)*100)/100);draw().catch(e=>toast(e.message));};
    await draw();
  }catch(e){
    if(state.modal==='rentalPdf'&&state.pdfUrl){box.innerHTML=`<div class="status-note">Podgląd stron jest niedostępny. Otwórz lub pobierz dokument.</div><div class="modal-actions"><a class="smallbtn" href="${esc(state.pdfUrl)}" target="_blank" rel="noopener">Otwórz PDF</a><a class="smallbtn" href="${esc(state.pdfUrl)}" download="${esc(doc.name)}">Pobierz PDF</a></div>`;}
    else if(box)box.textContent=`Nie udało się otworzyć PDF: ${e.message}`;
  }
}
function updateRentalFormTotal(){
  const box=document.getElementById('rental-live-total');if(!box)return;
  const area=rentalNumber('f-rental-area');
  const net=area*rentalNumber('f-rental-sqm-net')+rentalNumber('f-rental-parking-net')+rentalNumber('f-rental-internet-net')+rentalNumber('f-rental-cleaning-net');
  const gross=area*rentalNumber('f-rental-sqm-gross')+rentalNumber('f-rental-parking-gross')+rentalNumber('f-rental-internet-gross')+rentalNumber('f-rental-cleaning-gross');
  box.innerHTML=`Suma miesięczna: <b>${rentMoney(net)} netto</b> / <b>${rentMoney(gross)} brutto</b>`;
}
async function saveRental(){
  if(!canManageRentals())return;
  const value={locationId:document.getElementById('f-rental-location').value,roomId:document.getElementById('f-rental-room-id').value||null,contractor:document.getElementById('f-rental-contractor').value.trim(),nip:document.getElementById('f-rental-nip').value.trim(),contactPerson:document.getElementById('f-rental-contact').value.trim(),phone:document.getElementById('f-rental-phone').value.trim(),email:document.getElementById('f-rental-email').value.trim(),registeredAddress:document.getElementById('f-rental-registered').value.trim(),premisesAddress:document.getElementById('f-rental-address').value.trim(),premisesNumber:document.getElementById('f-rental-room').value.trim(),paymentStatus:document.getElementById('f-rental-status').value||null,startsOn:document.getElementById('f-rental-start').value,indefinite:document.getElementById('f-rental-indefinite').checked,endsOn:document.getElementById('f-rental-end').value||null,areaSqm:rentalNumber('f-rental-area'),priceSqmNet:rentalNumber('f-rental-sqm-net'),priceSqmGross:rentalNumber('f-rental-sqm-gross'),parkingNet:rentalNumber('f-rental-parking-net'),parkingGross:rentalNumber('f-rental-parking-gross'),internetNet:rentalNumber('f-rental-internet-net'),internetGross:rentalNumber('f-rental-internet-gross'),cleaningNet:rentalNumber('f-rental-cleaning-net'),cleaningGross:rentalNumber('f-rental-cleaning-gross')};
  if(value.roomId&&!state.rentalRooms.some(x=>x.id===value.roomId&&x.locationId===value.locationId))return toast('Pomieszczenie nie należy do wybranego obiektu.');
  if(!value.contractor||!value.locationId||!value.startsOn||value.areaSqm<=0)return toast('Wpisz kontrahenta, obiekt, początek umowy i powierzchnię.');
  if(!value.indefinite&&!value.endsOn)return toast('Wybierz koniec umowy albo czas nieokreślony.');
  if(value.indefinite)value.endsOn=null;
  if(value.endsOn&&value.endsOn<value.startsOn)return toast('Koniec umowy nie może poprzedzać początku.');
  if(value.email&&!document.getElementById('f-rental-email').checkValidity())return toast('Sprawdź adres e-mail.');
  if(value.paymentStatus&&!['reliable','monitor','problematic'].includes(value.paymentStatus))return toast('Nieprawidłowy status płatnika.');
  const required=['f-rental-sqm-net','f-rental-sqm-gross'];if(required.some(id=>document.getElementById(id).value===''))return toast('Wpisz cenę netto i brutto za m².');
  const nums=[value.areaSqm,value.priceSqmNet,value.priceSqmGross,value.parkingNet,value.parkingGross,value.internetNet,value.internetGross,value.cleaningNet,value.cleaningGross];
  if(nums.some(n=>!Number.isFinite(n)||n<0))return toast('Ceny i powierzchnia muszą być poprawnymi liczbami.');
  const edit=state.modal==='editRental',id=state.rentalId;
  await withAction('Zapisywanie umowy…',async()=>{
    if(state.mode==='demo'){
      state.db.rentals ||= [];
      if(edit)Object.assign(state.db.rentals.find(r=>r.id===id),value);else state.db.rentals.push({id:uid(),...value});
      saveDemoDB();state.rentals=state.db.rentals;
    }else{
      const row={location_id:value.locationId,room_id:value.roomId,contractor:value.contractor,nip:value.nip,contact_person:value.contactPerson,phone:value.phone,email:value.email,registered_address:value.registeredAddress,premises_address:value.premisesAddress,premises_number:value.premisesNumber,payment_status:value.paymentStatus,starts_on:value.startsOn,ends_on:value.endsOn,indefinite:value.indefinite,area_sqm:value.areaSqm,price_sqm_net:value.priceSqmNet,price_sqm_gross:value.priceSqmGross,parking_net:value.parkingNet,parking_gross:value.parkingGross,internet_net:value.internetNet,internet_gross:value.internetGross,cleaning_net:value.cleaningNet,cleaning_gross:value.cleaningGross};
      if(edit)await pgPatch('rental_agreements',`id=eq.${encodeURIComponent(id)}`,row);else await pgPost('rental_agreements',row);
      await refreshImportantCloud();
    }
    state.rentalLocationId=value.locationId;state.rentalId=null;state.modal=null;
  });
}
async function deleteRental(){
  if(!isAdmin()||!state.rentalId||!confirm('Usunąć umowę najmu?'))return;
  const id=state.rentalId;
  await withAction('Usuwanie umowy…',async()=>{
    if(state.mode==='demo'){state.db.rentals=state.db.rentals.filter(r=>r.id!==id);saveDemoDB();state.rentals=state.db.rentals;}
    else{await pgDelete('rental_agreements',`id=eq.${encodeURIComponent(id)}`);await refreshImportantCloud();}
    state.rentalId=null;state.modal=null;
  });
}
async function saveInspection(){
  if(!canAddInspections()||state.modal==='editInspection'&&!isAdmin())return;
  const name=document.getElementById('f-inspection-name').value.trim(),locationId=document.getElementById('f-inspection-location').value,validUntil=document.getElementById('f-inspection-until').value,lastInspected=document.getElementById('f-inspection-last').value||null,notes=document.getElementById('f-inspection-notes').value.trim();
  if(!name||!locationId||!validUntil)return toast('Wpisz nazwę, obiekt i datę ważności.');
  if(!isAdmin()&&!currentUser().locationIds.includes(locationId))return toast('Brak dostępu do obiektu.');
  if(lastInspected&&lastInspected>validUntil)return toast('Data ostatniego przeglądu nie może być późniejsza niż data ważności.');
  const edit=state.modal==='editInspection',id=state.inspectionId;
  await withAction('Zapisywanie przeglądu…',async()=>{
    if(state.mode==='demo'){
      state.db.inspections ||= [];
      const value={name,locationId,validUntil,lastInspected,notes};
      if(edit)Object.assign(state.db.inspections.find(x=>x.id===id),value);
      else state.db.inspections.push({id:uid(),...value});
      saveDemoDB();state.inspections=state.db.inspections;
    }else{
      const value={name,location_id:locationId,valid_until:validUntil,last_inspected:lastInspected,notes};
      if(edit)await pgPatch('inspections',`id=eq.${encodeURIComponent(id)}`,value);
      else await pgPost('inspections',{...value,created_by:currentUser().id});
      await refreshImportantCloud();
    }
    state.modal=null;state.inspectionId=null;
  });
}
async function deleteInspection(){
  if(!isAdmin()||!state.inspectionId||!confirm('Usunąć ten przegląd?'))return;
  const id=state.inspectionId;
  await withAction('Usuwanie przeglądu…',async()=>{
    if(state.mode==='demo'){state.db.inspections=state.db.inspections.filter(x=>x.id!==id);saveDemoDB();state.inspections=state.db.inspections;}
    else{await pgDelete('inspections',`id=eq.${encodeURIComponent(id)}`);await refreshImportantCloud();}
    state.modal=null;state.inspectionId=null;
  });
}
async function saveLocationFromForm(){
  const name=document.getElementById('f-locname').value.trim();if(!name)return toast('Wpisz nazwę obiektu.');const v={name,city:document.getElementById('f-city').value.trim(),address:document.getElementById('f-address').value.trim(),description:document.getElementById('f-locdesc').value.trim()},edit=state.modal==='editLocation';if(edit)v.active=document.getElementById('f-locactive').checked;
  await withAction(edit?'Zapisywanie obiektu…':'Dodawanie obiektu…',async()=>{if(state.mode==='demo'){if(edit)Object.assign(state.db.locations.find(x=>x.id===state.locationId),v);else state.db.locations.push({id:uid(),...v,active:true});await logEvent(edit?'location_edit':'location',`${edit?'Zmieniono':'Dodano'} obiekt „${name}”`);saveDemoDB();}else{if(edit)await pgPatch('locations',`id=eq.${state.locationId}`,v);else await pgPost('locations',v);await logEvent(edit?'location_edit':'location',`${edit?'Zmieniono':'Dodano'} obiekt „${name}”`);await loadCloudDB({silent:true});}state.modal=null;state.locationId=null;});
}
function addDemoUser(){const name=document.getElementById('f-username').value.trim();if(!name)return toast('Wpisz imię pracownika.');const locs=[...document.querySelectorAll('input[name=userloc]:checked')].map(x=>x.value);state.db.users.push({id:uid(),name,role:'worker',locationIds:locs,active:true});logEvent('user',`Dodano pracownika „${name}”`);saveDemoDB();state.modal=null;render();}
async function saveUserEdit(){
  const u=state.db.users.find(x=>x.id===state.userId),name=document.getElementById('f-username').value.trim(),role=document.getElementById('f-role').value,active=document.getElementById('f-active').value==='1',canManageRentals=document.getElementById('f-manage-rentals').checked,canAddInspections=document.getElementById('f-add-inspections').checked,canCreateTasks=document.getElementById('f-create-tasks').checked,canViewTeamHours=document.getElementById('f-view-team-hours').checked,canViewImportant=document.getElementById('f-view-important').checked,locs=[...document.querySelectorAll('input[name=userloc]:checked')].map(x=>x.value);if(!name)return toast('Wpisz imię.');if(u.id===currentUser().id&&(!active||role!=='admin'))return toast('Nie możesz odebrać sobie dostępu administratora z własnego konta.');
  await withAction('Zapisywanie pracownika…',async()=>{if(state.mode==='demo'){Object.assign(u,{name,role,active,canManageRentals,canAddInspections,canCreateTasks,canViewTeamHours,canViewImportant,locationIds:locs});await logEvent('user_edit',`Zmieniono konto „${name}”`);saveDemoDB();}else{await pgPatch('profiles',`id=eq.${u.id}`,{full_name:name,role,active,can_manage_rentals:canManageRentals,can_add_inspections:canAddInspections,can_create_tasks:canCreateTasks,can_view_team_hours:canViewTeamHours,can_view_important:canViewImportant});await pgDelete('profile_locations',`profile_id=eq.${u.id}`);if(locs.length)await pgPost('profile_locations',locs.map(location_id=>({profile_id:u.id,location_id})));await logEvent('user_edit',`Zmieniono konto „${name}”`);await loadCloudDB({silent:true});}state.modal=null;state.userId=null;});
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
function findAttachment(id){for(const m of extraMissionRows()){const a=(m.attachments||[]).find(a=>a.id===id);if(a)return a;}for(const t of state.db.tasks){for(const a of (t.attachments||[]))if(a.id===id)return a;for(const a of (t.report?.attachments||[]))if(a.id===id)return a;}return null;}
async function openAttachment(id){
  const a = findAttachment(id);
  if(!a) return;

  if(state.mode === 'demo'){
    return toast('W demo zapisane są tylko informacje o pliku.');
  }

  try{
    toast('Pobieranie pliku…');

    const r = await cloudFetch(
      `/storage/v1/object/authenticated/${a.bucket==='extra-mission-files'?'extra-mission-files':'task-files'}/${encodeStoragePath(a.path)}`,
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
function updateTimers(){
  document.querySelectorAll('[data-voucher-until]').forEach(el=>{const start=new Date(el.dataset.voucherStart)-Date.now(),left=new Date(el.dataset.voucherUntil)-Date.now();el.textContent=start>0?'Rozpocznie się za: '+duration(start):left>0?'Pozostało: '+duration(left):'Zakończony';const badge=el.parentElement.querySelector('.voucher-state');if(badge)badge.textContent=start>0?'Zaplanowany':left>0?'Aktywny':'Zakończony';});
  document.querySelectorAll('[data-inspection-until]').forEach(el=>{
    const c=inspectionCountdown(el.dataset.inspectionUntil);
    el.textContent=c.text;el.closest('.inspection-card')?.classList.toggle('expired',c.status==='expired');
  });
  document.querySelectorAll('[data-attendance-start]').forEach(el=>{const tick=()=>{el.textContent=duration(Date.now()-new Date(el.dataset.attendanceStart).getTime());};tick();});document.querySelectorAll('[data-deadline]').forEach(el=>{if(!el.dataset.deadline)return;const ms=new Date(el.dataset.deadline)-Date.now();el.textContent=duration(ms);el.classList.toggle('over',ms<0);});document.querySelectorAll('[data-claim-start]').forEach(el=>{const now=Date.now();el.disabled=now<new Date(el.dataset.claimStart).getTime()||now>=new Date(el.dataset.claimEnd).getTime();});}

fileInput.addEventListener('change',()=>{const max=(BASE_CFG.MAX_ATTACHMENT_MB||50)*1024*1024,arr=[...fileInput.files],too=arr.find(f=>f.size>max);if(too){toast(`${too.name} przekracza limit ${BASE_CFG.MAX_ATTACHMENT_MB||50} MB.`);fileInput.value='';return;}selectedFiles=arr;const box=document.getElementById('file-list');if(box)box.innerHTML=selectedFiles.map(f=>`<span class="filetag">${esc(f.name)} • ${bytes(f.size)}</span>`).join('');});
document.getElementById('rental-pdf-input').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await uploadRentalPdf(file);});
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
function initSeason(){
  const m=new Date().getMonth()+1;
  let icons;

  if(m>=3 && m<=5) icons=['🌸','🌺','🌿'];
  else if(m>=6 && m<=8) icons=['☀️','✨'];
  else if(m>=9 && m<=11) icons=['🍂','🍁','🍃'];
  else icons=['❄️','❄','✦'];

  const box=document.createElement('div');
  box.className='season';

  for(let i=0;i<18;i++){
    const x=document.createElement('span');
    x.innerText=icons[Math.floor(Math.random()*icons.length)];
    x.style.left=Math.random()*100+'%';
    x.style.animationDelay=Math.random()*10+'s';
    box.appendChild(x);
  }

  document.body.appendChild(box);
}

initSeason();
  init();
})();


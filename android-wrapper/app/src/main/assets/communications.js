/* IMPERIUM / Communications. Server is the authority for recipients and receipts. */
(() => {
 'use strict';
 let api,session='',generation=0,timer,loading=false,registering=false,deviceReady=false,vibrationTimer;
 const state={active:false,owner:false,items:[],error:'',compose:false,archive:false,receiptId:null,draft:{title:'',body:''},busy:false};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=s=>s?new Intl.DateTimeFormat('pl-PL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s)):'—';
 const unread=()=>state.items.filter(a=>!a.archived_at&&a.is_recipient&&!a.read_at).length;
 function vibrate(){
  const n=unread();
  if(window.AndroidBridge?.setAnnouncementUnread){window.AndroidBridge.setAnnouncementUnread(n);return;}
  clearInterval(vibrationTimer);vibrationTimer=null;
  if(!n){navigator.vibrate?.(0);return;}
  const pulse=()=>{if(document.visibilityState!=='hidden')navigator.vibrate?.([180,120,180]);};pulse();vibrationTimer=setInterval(pulse,8000);
 }
 async function registerDevice(){
  if(!window.AndroidBridge?.configureAnnouncements||deviceReady||registering||!session)return;
  registering=true;const user=session,epoch=generation;
  try{
   const key='imperium_notice_device_'+user;let token=localStorage.getItem(key);
   if(!/^[a-f0-9]{64}$/.test(token||'')){const bytes=crypto.getRandomValues(new Uint8Array(32));token=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(key,token);}
   await api.rpc('imperium_register_notice_device',{p_token:token});
   if(session!==user||generation!==epoch)return;
   const c=api.config();window.AndroidBridge.configureAnnouncements(c.url,c.key,token);deviceReady=true;
  }catch(_){/* Foreground receipts remain available; the next sync retries registration. */}
  finally{registering=false;}
 }
 async function refresh({redraw=true}={}){
  if(!session||loading)return;loading=true;const epoch=generation;
  try{
   const data=await api.rpc('imperium_comms_feed',{});if(epoch!==generation)return;
   if(data?.active!==true||!Array.isArray(data.announcements))throw Error('Nie udało się potwierdzić dostępu do ogłoszeń.');
   const changed=JSON.stringify(state.items)!==JSON.stringify(data.announcements)||state.owner!==data.owner||state.error;
   state.active=true;state.owner=data.owner===true;state.items=data.announcements;state.error='';vibrate();registerDevice();
   if(changed&&redraw&&!state.compose&&!document.activeElement?.matches('input,textarea,select'))api.render();
  }catch(e){if(epoch===generation){state.error=e.message||'Nie udało się odświeżyć ogłoszeń.';if(/nieaktywne|JWT|expired|token/i.test(state.error)){state.active=false;state.owner=false;state.items=[];vibrate();}if(redraw&&!state.compose)api.render();}}
  finally{if(epoch===generation)loading=false;}
 }
 async function connect(id){
  if(session!==id){disconnect();session=id;generation++;}
  await refresh({redraw:false});
  if(!timer)timer=setInterval(()=>{if(document.visibilityState!=='hidden')refresh();},8000);
 }
 function disconnect(){
  generation++;session='';clearInterval(timer);timer=null;clearInterval(vibrationTimer);vibrationTimer=null;loading=false;deviceReady=false;
  Object.assign(state,{active:false,owner:false,items:[],error:'',compose:false,archive:false,receiptId:null,draft:{title:'',body:''},busy:false});
  navigator.vibrate?.(0);window.AndroidBridge?.clearAnnouncements?.();
 }
 async function logout(){
  const token=localStorage.getItem('imperium_notice_device_'+session);
  if(token){try{await api.rpc('imperium_revoke_notice_device',{p_token:token});}catch(_){}localStorage.removeItem('imperium_notice_device_'+session);}
  disconnect();
 }
 function receiptPanel(a){
  const rows=a.receipts||[],read=rows.filter(r=>r.read_at).length;
  return `<section class="receipt-panel" aria-label="Potwierdzenia przeczytania"><div class="receipt-heading"><h3>Potwierdzenia</h3><span>${read} / ${rows.length}</span></div><div class="receipt-progress"><span style="width:${rows.length?Math.round(read/rows.length*100):0}%"></span></div>${rows.map(r=>`<div class="receipt-row"><span class="receipt-avatar">${esc(r.name.slice(0,1).toUpperCase())}</span><div><b>${esc(r.name)}</b><small>${r.read_at?date(r.read_at):'Oczekuje na przeczytanie'}${r.active?'':' · konto nieaktywne'}</small></div><span class="receipt-state ${r.read_at?'done':''}">${r.read_at?'✓':'•'}</span></div>`).join('')}</section>`;
 }
 function card(a){
  const waiting=a.is_recipient&&!a.read_at&&!a.archived_at,rows=a.receipts||[],n=rows.filter(r=>r.read_at).length;
  return `<article class="bulletin-card ${waiting?'unread':''}" data-announcement="${esc(a.id)}"><div class="bulletin-meta"><span class="bulletin-type">${a.system_notice?'SYSTEM UPDATE':'KOMUNIKAT'}</span><time datetime="${esc(a.created_at)}">${date(a.created_at)}</time></div><h2>${esc(a.title)}</h2><div class="bulletin-body">${esc(a.body)}</div><div class="bulletin-author">${a.system_notice?'IMPERIUM / System':esc(a.author)}</div><footer>${a.archived_at?'<span class="bulletin-read">W archiwum</span>':a.is_recipient?`<label class="read-check ${a.read_at?'confirmed':''}"><input type="checkbox" data-ack="${esc(a.id)}" ${a.read_at?'checked disabled':''}><span>${a.read_at?'Przeczytano':'Przeczytałem / Прочитано'}<small>${a.read_at?date(a.read_at):'Zaznacz, aby potwierdzić i wyłączyć przypomnienie.'}</small></span></label>`:'<span class="bulletin-read">Nie jesteś odbiorcą tego ogłoszenia</span>'}${state.owner?`<button class="ghost receipt-toggle" data-receipts="${esc(a.id)}">${n}/${rows.length} przeczytało <span>↗</span></button><button class="ghost archive-button" data-archive="${esc(a.id)}" data-archived="${a.archived_at?'false':'true'}">${a.archived_at?'Przywróć':'Archiwizuj'}</button>`:''}</footer>${state.owner&&state.receiptId===a.id?receiptPanel(a):''}</article>`;
 }
 function render(){
  const items=state.items.filter(a=>state.archive?!!a.archived_at:!a.archived_at),n=unread();
  return `<div class="comms-hub"><section class="bulletin-hero"><div class="bulletin-hero-grid"></div><div class="bulletin-hero-copy"><div class="eyebrow"><i class="bio-status-dot"></i>UMBRELLA / COMMUNICATIONS</div><h1>Wiadomość.<br>Potwierdzenie.<br><em>Pełna kontrola.</em></h1><p>${state.owner?'Publikuj ogłoszenia dla zespołu. Zobacz, kto przeczytał.':'Ważne informacje w jednym miejscu. Przeczytaj i potwierdź każde nowe ogłoszenie.'}</p>${state.owner?'<button class="goldbtn" data-compose>+ Nowe ogłoszenie <span>↗</span></button>':''}</div><div class="bulletin-seal"><img src="icons/icon.svg" alt="Umbrella"><span>INTERNAL<br>COMMUNICATIONS</span></div><div class="bulletin-hero-foot"><span>KANAŁ WEWNĘTRZNY</span><span>${n?'● WYMAGA POTWIERDZENIA':'● ZSYNCHRONIZOWANO'}</span></div></section>
  ${!window.AndroidBridge?.configureAnnouncements?'<div class="apk-upgrade"><div><b>IMPERIUM 6.0 / Android</b><p>Zainstaluj nowy APK, aby włączyć powtarzaną wibrację i powiadomienia w tle. Otwórz pobrany plik i wybierz „Aktualizuj”.</p></div><button class="goldbtn" data-download-apk>Pobierz APK 6.0 ↧</button><span id="apk-download-status" role="status"></span></div>':''}
  <div class="bulletin-metrics"><div><b>${state.items.filter(a=>!a.archived_at).length}</b><span>Aktywne ogłoszenia</span></div><div class="${n?'attention':''}"><b>${n.toString().padStart(2,'0')}</b><span>Do przeczytania</span></div><div><b>✓</b><span>Potwierdzenia na serwerze</span></div></div>
  ${n?`<div class="bulletin-alert" role="status"><span class="alert-beacon"></span><div><b>Nowe ogłoszenie wymaga potwierdzenia</b><p>Przypomnienie wraca, dopóki nie zaznaczysz „Przeczytano” przy wszystkich nowych ogłoszeniach.</p></div></div>`:''}
  ${window.AndroidBridge?.configureAnnouncements?'<button class="ghost notice-permission" data-notice-permission>Włącz powiadomienia o ogłoszeniach</button>':''}
  <div class="bulletin-list-head"><h2>${state.archive?'Archiwum':'Tablica ogłoszeń'}</h2><div>${state.owner?`<button class="ghost" data-show-archive>${state.archive?'Aktywne':'Archiwum'}</button>`:''}<button class="ghost" data-refresh-notices aria-label="Odśwież ogłoszenia">↻</button></div></div>
  ${state.error?`<p class="bulletin-error" role="alert">${esc(state.error)} Potwierdzenie wymaga połączenia z internetem.</p>`:''}
  <div class="bulletin-list">${items.map(card).join('')||`<div class="empty">${state.active?'Nie ma tu jeszcze ogłoszeń.':'Ładowanie ogłoszeń…'}</div>`}</div>
  ${state.compose&&state.owner?`<div class="modal-bg"><section class="modal announcement-editor" role="dialog" aria-modal="true" aria-labelledby="announcement-editor-title"><div class="eyebrow">NOWA TRANSMISJA</div><h2 id="announcement-editor-title">Ogłoszenie dla zespołu</h2><p class="modal-sub">Każdy aktywny uczestnik otrzyma własne pole „Przeczytano”.</p><form id="announcement-form"><div class="field"><label for="announcement-title">Tytuł</label><input id="announcement-title" maxlength="160" required value="${esc(state.draft.title)}" placeholder="Czego dotyczy ogłoszenie?"></div><div class="field"><label for="announcement-body">Treść — możesz wkleić gotowy tekst</label><textarea id="announcement-body" maxlength="20000" rows="8" required placeholder="Wpisz lub wklej ogłoszenie…">${esc(state.draft.body)}</textarea></div>${state.error?`<p class="bulletin-error" role="alert">${esc(state.error)}</p>`:''}<div class="modal-actions"><button type="button" class="ghost" data-close-compose ${state.busy?'disabled':''}>Wróć</button><button type="submit" class="goldbtn" ${state.busy?'disabled':''}>${state.busy?'Publikowanie…':'Opublikuj dla wszystkich ↗'}</button></div></form></section></div>`:''}</div>`;
 }
 async function action(fn){if(state.busy)return;state.busy=true;state.error='';try{await fn();await refresh({redraw:false});}catch(e){state.error=e.message||'Operacja nie powiodła się.';}finally{state.busy=false;api.render();}}
 function bind(root=document){
  root.querySelector('[data-download-apk]')?.addEventListener('click',async e=>{e.target.disabled=true;const note=document.getElementById('apk-download-status');try{note.textContent='Pobieranie pakietu…';await api.downloadApk();note.textContent='Otwórz IMPERIUM-6.0.0.apk w folderze Pobrane / IMPERIUM i wybierz Aktualizuj.';}catch(_){note.textContent='Nie udało się pobrać pakietu. Sprawdź połączenie i spróbuj ponownie.';}finally{e.target.disabled=false;}});
  root.querySelectorAll('[data-compose]').forEach(b=>b.onclick=()=>{if(!state.owner)return;state.compose=true;state.error='';api.render();document.getElementById('announcement-title')?.focus();});
  root.querySelector('[data-close-compose]')?.addEventListener('click',()=>{state.compose=false;api.render();});
  root.querySelector('#announcement-title')?.addEventListener('input',e=>state.draft.title=e.target.value);
  root.querySelector('#announcement-body')?.addEventListener('input',e=>state.draft.body=e.target.value);
  root.querySelector('#announcement-form')?.addEventListener('submit',e=>{e.preventDefault();action(async()=>{await api.rpc('imperium_publish_announcement',{p_title:state.draft.title,p_body:state.draft.body});state.compose=false;state.draft={title:'',body:''};});});
  root.querySelectorAll('[data-ack]').forEach(b=>b.onchange=()=>{if(!b.checked)return;b.disabled=true;action(async()=>{const stamp=await api.rpc('imperium_ack_announcement',{p_id:b.dataset.ack});const item=state.items.find(a=>a.id===b.dataset.ack);if(item)item.read_at=stamp;vibrate();});});
  root.querySelectorAll('[data-receipts]').forEach(b=>b.onclick=()=>{state.receiptId=state.receiptId===b.dataset.receipts?null:b.dataset.receipts;api.render();});
  root.querySelectorAll('[data-archive]').forEach(b=>b.onclick=()=>action(()=>api.rpc('imperium_archive_announcement',{p_id:b.dataset.archive,p_archived:b.dataset.archived==='true'})));
  root.querySelector('[data-show-archive]')?.addEventListener('click',()=>{state.archive=!state.archive;api.render();});
  root.querySelector('[data-refresh-notices]')?.addEventListener('click',()=>refresh());
  root.querySelector('[data-notice-permission]')?.addEventListener('click',()=>window.AndroidBridge?.requestNotificationPermission?.());
 }
 function browserPage(youtube=false){const native=!!window.AndroidBridge?.openBrowser;return `<section class="web-terminal ${youtube?'youtube-terminal':''}"><div class="eyebrow">UMBRELLA / ${youtube?'MEDIA CHANNEL':'WEB TERMINAL'}</div><div class="web-terminal-glyph">${youtube?'▶':'◎'}</div><h1>${youtube?'YouTube':'Cała sieć.<br>Jeden terminal.'}</h1><p>${youtube?'Filmy, muzyka i kanały w osobnej przestrzeni IMPERIUM.':'Szukaj informacji, otwieraj strony i zapisuj ulubione adresy.'}</p><form id="web-launch"><label class="sr-only" for="web-address">${youtube?'Szukaj na YouTube':'Adres lub wyszukiwanie'}</label><input id="web-address" placeholder="${youtube?'Czego chcesz posłuchać?':'Wpisz adres strony lub wyszukaj…'}"><button class="goldbtn">${youtube?'Otwórz YouTube':'Otwórz przeglądarkę'} ↗</button></form><div class="terminal-features"><span>◎ Osobna przestrzeń</span><span>◇ Filtr reklam</span><span>☆ Zakładki</span></div><small>${native?'Filtr ogranicza reklamy i śledzenie. Reklamy w filmach YouTube mogą nadal się pojawiać.':'Wbudowana przeglądarka i filtr reklam wymagają IMPERIUM 6.0 na Androidzie. Tutaj strona otworzy się w przeglądarce systemowej.'}</small><div id="web-launch-status" role="status"></div></section>`;}
 function bindBrowser(youtube){document.getElementById('web-launch')?.addEventListener('submit',e=>{e.preventDefault();const q=document.getElementById('web-address').value.trim();let url=youtube?(q?'https://m.youtube.com/results?search_query='+encodeURIComponent(q):'https://m.youtube.com/'):(q?/^https:\/\//i.test(q)?q:!q.includes(' ')&&q.includes('.')?'https://'+q:'https://duckduckgo.com/?q='+encodeURIComponent(q):'https://duckduckgo.com/');try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Podaj poprawny adres HTTPS.');if(window.AndroidBridge?.openBrowser)window.AndroidBridge.openBrowser(url);else window.open(url,'_blank','noopener,noreferrer');}catch(e){document.getElementById('web-launch-status').textContent=e.message;}});}
 document.addEventListener('visibilitychange',()=>{if(session&&document.visibilityState==='visible'){refresh();vibrate();}});
 window.ImperiumComms={state,userId:()=>session,configure:x=>api=x,connect,refresh,disconnect,logout,render,bind,browserPage,bindBrowser,unread};
})();

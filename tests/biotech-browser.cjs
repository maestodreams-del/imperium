const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const out=process.env.QA_OUTPUT||'/tmp/imperium-comms-qa';fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.webmanifest':'application/manifest+json','.mjs':'text/javascript'};
(async()=>{const browser=await chromium.launch({headless:true});try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];let owner=true,failAck=false;
  const items=[{id:'11111111-1111-4111-8111-111111111111',title:'Nowy rozdział IMPERIUM',body:'Wszystkie ważne informacje od teraz w jednym miejscu.\n\nPrzeczytaj ogłoszenie i zaznacz potwierdzenie poniżej. <img src=x onerror=alert(1)>',author:'Andrzej',created_at:'2026-10-11T16:00:00Z',archived_at:null,system_notice:false,is_recipient:true,read_at:null,receipts:[{profile_id:'u-admin',name:'Andrzej',active:true,read_at:null},{profile_id:'u-zenon',name:'Zenon',active:true,read_at:null}]}];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.nativeCalls=[];window.AndroidBridge={setAnnouncementUnread:n=>window.nativeCalls.push(['unread',n]),clearAnnouncements:()=>window.nativeCalls.push(['clear']),openBrowser:u=>window.nativeCalls.push(['browser',u]),requestNotificationPermission:()=>{}};});
  await page.route('https://backend.invalid/**',async r=>{
   const name=new URL(r.request().url()).pathname.split('/').at(-1);let data=[];
   if(name==='imperium_access_status')data=owner;
   if(name==='imperium_comms_feed')data={active:true,owner,announcements:items.filter(a=>!a.archived_at||owner).map(a=>({...a,receipts:owner?a.receipts:[]}))};
   if(name==='imperium_publish_announcement'){const b=r.request().postDataJSON();const a={...items[0],id:'22222222-2222-4222-8222-222222222222',title:b.p_title,body:b.p_body,read_at:'2026-10-11T16:30:00Z'};items.unshift(a);data=a.id;}
   if(name==='imperium_ack_announcement'){if(failAck)return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Test: brak połączenia'})});const a=items.find(x=>x.id===r.request().postDataJSON().p_id);data='2026-10-11T16:33:00Z';a.read_at=data;a.receipts[1].read_at=data;}
   return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.route('https://imperium.test/**',r=>{const name=new URL(r.request().url()).pathname.slice(1)||'index.html';if(name.includes('..'))return r.abort();if(name==='config.js')return r.fulfill({contentType:'text/javascript',body:"window.IMPERIUM_CONFIG={DEFAULT_SUPABASE_URL:'https://backend.invalid',DEFAULT_SUPABASE_ANON_KEY:'test-placeholder-key',ALLOW_DEMO:false};"});if(!fs.existsSync(name))return r.fulfill({status:404,body:''});let body=fs.readFileSync(name);if(name==='app.js')body=Buffer.from(body.toString().replace('  init();\n})();','  window.biotechTest={state,render,seed};\n  init();\n})();'));return r.fulfill({contentType:types[path.extname(name)]||'application/octet-stream',body});});
  await page.clock.install({time:new Date('2026-10-11T16:30:00Z')});await page.clock.pauseAt(new Date('2026-10-11T16:30:01Z'));await page.goto('https://imperium.test/');await page.clock.runFor(9999);assert.equal(await page.locator('#boot-screen').count(),1);await page.clock.runFor(1);assert.equal(await page.locator('#boot-screen').count(),0);
  await page.evaluate(async()=>{const t=window.biotechTest,s=t.state;s.mode='cloud';s.auth={access_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-admin',email:'owner@example.test'}};s.db=t.seed();s.db.users[0].name='Andrzej';s.ownerAccess=true;s.verifiedOwnerId='u-admin';s.salaryManager=true;s.tab='announcements';await window.ImperiumComms.connect('u-admin');t.render()});
  await page.screenshot({path:`${out}/${width}-announcements.png`,fullPage:true});assert.equal(await page.locator('.bulletin-body img').count(),0,'Announcement HTML is text, never executable');
  assert.equal(await page.locator('[data-tab="tasks"],[data-tab="game"],[data-new-extra-mission]').count(),0);
  const tabs=['announcements','browser','youtube','locations','inspections','rentals','invoices','important','activity','attendance','chat','team','profile','salary','settings'];
  async function open(tab){if(width<861){await page.locator('#module-menu').click();await page.locator(`.module-grid [data-tab="${tab}"]`).click();}else await page.locator(`.bio-sidebar [data-tab="${tab}"]`).click();}
  for(const tab of tabs){await open(tab);const check=await page.evaluate(()=>({tab:window.biotechTest.state.tab,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.equal(check.tab,tab);assert.equal(check.overflow,false,`${width} ${tab} fits`);
   if(['browser','youtube'].includes(tab)){await page.locator('#web-address').fill(tab==='youtube'?'Umbrella music':'example.org');await page.locator('#web-launch button').click();const calls=await page.evaluate(()=>window.nativeCalls.filter(x=>x[0]==='browser'));assert.ok(calls.at(-1)[1].startsWith(tab==='youtube'?'https://m.youtube.com/results':'https://example.org'));}
   if(tab==='chat'){const compose=await page.locator('.comms-compose').boundingBox(),dock=width<861?await page.locator('.bio-mobile-nav').boundingBox():{y:900};assert.ok(compose.y+compose.height<=dock.y);}
   if(['browser','youtube','profile','team','salary'].includes(tab))await page.screenshot({path:`${out}/${width}-${tab}.png`,fullPage:true});
  }
  await open('announcements');await page.locator('[data-compose]').last().click();await page.locator('#announcement-title').fill('Plan na jutro');await page.locator('#announcement-body').fill('Spotkanie o 09:00.\nProszę potwierdzić przeczytanie.');await page.screenshot({path:`${out}/${width}-editor.png`,fullPage:true});await page.locator('#announcement-form [type="submit"]').click();await page.waitForFunction(()=>!window.ImperiumComms.state.compose);assert.equal(await page.locator('.bulletin-card').count(),2);
  await page.locator('[data-receipts]').last().click();await page.screenshot({path:`${out}/${width}-receipts.png`,fullPage:true});assert.equal(await page.locator('.receipt-row').count(),2);
  owner=false;await page.evaluate(async()=>{const t=window.biotechTest;t.state.auth.user.id='u-zenon';t.state.ownerAccess=false;t.state.verifiedOwnerId=null;await window.ImperiumComms.connect('u-zenon');t.render()});
  assert.equal(await page.locator('.participant-shell').count(),1);assert.equal(await page.locator('[data-receipts],[data-compose],[data-tab]').count(),0);
  failAck=true;await page.locator('[data-ack]:not(:checked)').first().check();await page.waitForFunction(()=>window.ImperiumComms.state.error.includes('brak połączenia'));assert.equal(await page.locator('[data-ack]:not(:checked)').count(),1,'Failed receipt remains unread');
  failAck=false;await page.locator('[data-ack]:not(:checked)').first().check();await page.waitForFunction(()=>window.ImperiumComms.unread()===0);assert.equal(await page.evaluate(()=>window.nativeCalls.filter(x=>x[0]==='unread').at(-1)[1]),0,'Successful server receipt stops alert');
  await page.screenshot({path:`${out}/${width}-participant-read.png`,fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close()}console.log('PASS: 10-second splash; 15 owner modules; notices, publication, receipts, failed/successful acknowledgement and vibration stop; browser/YouTube bridge; removed tasks; participant isolation; mobile/desktop layouts.');})().catch(e=>{console.error(e);process.exitCode=1});

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const out=process.env.QA_OUTPUT||'/tmp/imperium-biotech-qa';fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.webmanifest':'application/manifest+json','.mjs':'text/javascript'};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://backend.invalid/**',r=>r.fulfill({contentType:'application/json',body:r.request().url().includes('imperium_access_status')?'true':'[]'}));
  await page.route('https://imperium.test/**',r=>{
   const name=new URL(r.request().url()).pathname.slice(1)||'index.html';
   if(name.includes('..'))return r.abort();
   if(name==='config.js')return r.fulfill({contentType:'text/javascript',body:"window.IMPERIUM_CONFIG={DEFAULT_SUPABASE_URL:'https://backend.invalid',DEFAULT_SUPABASE_ANON_KEY:'test-placeholder-key',ALLOW_DEMO:false};"});
   if(!fs.existsSync(name))return r.fulfill({status:404,body:''});
   let body=fs.readFileSync(name);
   if(name==='app.js')body=Buffer.from(body.toString().replace('  init();\n})();','  window.biotechTest={state,render,seed};\n  init();\n})();'));
   return r.fulfill({contentType:types[path.extname(name)]||'application/octet-stream',body});
  });
  await page.clock.install({time:new Date('2026-10-11T15:30:00Z')});await page.clock.pauseAt(new Date('2026-10-11T15:30:01Z'));await page.goto('https://imperium.test/');
  await page.clock.runFor(5000);await page.screenshot({path:`${out}/${width}-startup.png`});
  await page.clock.runFor(4999);assert.equal(await page.locator('#boot-screen').count(),1);
  await page.clock.runFor(1);assert.equal(await page.locator('#boot-screen').count(),0);
  await page.screenshot({path:`${out}/${width}-login.png`});
  assert.equal(await page.locator('#cloud-register').count(),0);
  await page.evaluate(()=>{const t=window.biotechTest,s=t.state;s.mode='cloud';s.auth={access_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-admin',email:'owner@example.test'}};s.db=t.seed();s.db.users[0].name='Andrzej';s.ownerAccess=true;s.verifiedOwnerId='u-admin';s.salaryManager=true;s.tab='tasks';t.render()});
  await page.screenshot({path:`${out}/${width}-dashboard.png`,fullPage:true});
  const tabs=['tasks','locations','inspections','rentals','invoices','important','activity','attendance','chat','team','profile','salary','game','settings'];
  for(const tab of tabs){
   if(width<861){await page.locator('#module-menu').click();await page.locator(`.module-grid [data-tab="${tab}"]`).click();}
   else await page.locator(`.bio-sidebar [data-tab="${tab}"]`).click();
   const check=await page.evaluate(()=>({tab:window.biotechTest.state.tab,overflow:document.documentElement.scrollWidth>innerWidth+1,body:getComputedStyle(document.body).backgroundColor}));
   assert.equal(check.tab,tab);assert.equal(check.overflow,false,`${width} ${tab} fits`);assert.equal(check.body,'rgb(8, 12, 16)');
   if(['salary','chat','invoices','settings'].includes(tab))await page.screenshot({path:`${out}/${width}-${tab}.png`,fullPage:true});
  }
  if(width<861){await page.locator('#module-menu').click();await page.screenshot({path:`${out}/${width}-modules.png`});await page.locator('.module-grid [data-tab="tasks"]').click();}
  else await page.locator('.bio-sidebar [data-tab="tasks"]').click();
  await page.locator('[data-bio-new-task]').click();await page.locator('#f-title').fill('Kontrola instalacji');
  assert.equal(await page.locator('#f-title').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(11, 17, 23)');
  await page.screenshot({path:`${out}/${width}-task-editor.png`,fullPage:true});
  await page.evaluate(()=>{const t=window.biotechTest;t.state.auth.user.id='other-admin';t.state.db.users.push({id:'other-admin',name:'Other administrator',role:'admin',active:true,locationIds:[]});t.render()});
  assert.equal(await page.locator('.access-denied').count(),1);assert.equal(await page.locator('[data-tab]').count(),0);
  await page.screenshot({path:`${out}/${width}-restricted.png`});assert.deepEqual(errors,[]);
  await context.close();
 }
 }finally{await browser.close()}
 console.log('PASS: desktop/mobile layouts, first launch, 14 tabs, menu, task editor and non-owner lock.');
})().catch(e=>{console.error(e);process.exitCode=1});

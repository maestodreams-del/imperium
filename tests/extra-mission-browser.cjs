const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('https://imperium.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="app"></div><input type="file" id="file-input" hidden>'}));await page.goto('https://imperium.test/');await page.addStyleTag({content:fs.readFileSync('styles.css','utf8')});
 const source=fs.readFileSync('app.js','utf8'),module=source.slice(source.indexOf('let extraMissions='),source.indexOf('  function renderTasksPage'));
 await page.addScriptTag({content:`
 const state={mode:'demo',db:{tasks:[{id:'planned',status:'open'}],extraMissions:[]},modal:null},esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),BASE_CFG={};let selectedFiles=[];
 const fileInput=document.getElementById('file-input'),currentUser=()=>({id:'worker',name:'Worker',role:'worker'}),isAdmin=()=>false,allowedLocations=()=>[{id:'location',name:'Object',active:true}],getLoc=id=>id?{name:'Object'}:null,getUser=()=>({name:'Worker'}),fmtDate=x=>x,nowISO=()=>new Date().toISOString(),saveDemoDB=()=>{},toast=()=>{},uid=()=>crypto.randomUUID(),safeFileName=x=>x,encodeStoragePath=x=>x,openAttachment=()=>{};
 ${module}
 function render(){document.getElementById('app').innerHTML=renderExtraMissionsSection()+(state.modal==='extraMission'?renderExtraMissionModal():'');bindExtraMissions();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{state.modal=null;render();});}
 window.test={state,render};render();
 `});
 await page.locator('[data-new-extra-mission]').click();
 await page.locator('#save-extra-mission').click();
 assert.match(await page.locator('#extra-mission-error').innerText(),/Wpisz/,'Empty reports cannot be saved');
 await page.locator('#extra-mission-title').fill('Repaired door');await page.locator('#extra-mission-description').fill('Extra work <script>not executable</script>');await page.locator('#extra-mission-location').selectOption('location');await page.locator('#save-extra-mission').click();
 assert.equal(await page.locator('.extra-mission-row').count(),1,'Completed extra mission appears in history');
 const rows=await page.evaluate(()=>test.state.db.extraMissions);assert.equal(rows[0].profile_id,'worker');assert.equal(rows[0].location_id,'location');assert.equal(rows[0].title,'Repaired door');assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(rows[0].done_on));
 assert.deepEqual(await page.evaluate(()=>test.state.db.tasks),[{id:'planned',status:'open'}],'Assigned work is unaffected');
 assert.equal(await page.locator('.extra-mission-row script').count(),0,'Report text is safely rendered');
 await page.screenshot({path:'/tmp/imperium-extra-mission.png',fullPage:true});await browser.close();console.log('Extra mission mobile checks passed');
})().catch(e=>{console.error(e);process.exit(1);});

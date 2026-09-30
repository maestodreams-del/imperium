const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('https://imperium.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="app"></div>'}));await page.goto('https://imperium.test/');
 await page.addStyleTag({content:fs.readFileSync('styles.css','utf8')});
 const source=fs.readFileSync('app.js','utf8'),module=source.slice(source.indexOf('let publicProfileId='),source.indexOf('function renderProfilePage(){'));
 await page.addScriptTag({content:`
 const state={mode:'cloud',tab:'tasks',profileView:'mine',db:{users:[{id:'me',name:'My profile',active:true,role:'worker'},{id:'other',name:'Other participant',active:true,role:'worker'}]}},esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const currentUser=()=>state.db.users[0],getUser=id=>state.db.users.find(u=>u.id===id),initials=()=> 'P',fmtDate=x=>x,nowISO=()=>new Date().toISOString(),toast=()=>{},saveDemoDB=()=>{},uid=()=>crypto.randomUUID();
 window.messages=[{id:'incoming',sender_id:'other',receiver_id:'me',body:'Hello <script>danger</script>',created_at:'2026-09-30T00:00:00Z',read_at:null}];window.posts=[];
 const cloudFetch=async(p,o)=>{if(p.includes('unread_count'))return window.messages.filter(m=>m.receiver_id==='me'&&!m.read_at).length;if(p.includes('mark_profile'))window.messages.forEach(m=>{if(o.body.p_ids.includes(m.id)&&m.receiver_id==='me')m.read_at=nowISO();});};
 const pgGet=async()=>structuredClone(window.messages);
 const pgPost=async(t,b)=>{window.posts.push(b);window.messages.unshift({...b,id:'outgoing',created_at:nowISO(),read_at:null});};
 ${module}
 function render(){document.getElementById('app').innerHTML=profileMessengerButton()+(state.tab==='profile'?(publicProfileId?renderPublicProfile():profileMessageNavigation()+renderProfileMessages()):'<button data-public-profile="other">Open participant</button>');bindProfileMessaging();}
 window.test={render,loadProfileMessages,state};render();
 `});
 await page.waitForSelector('.messenger-round.has-unread');
 assert.equal(await page.locator('.messenger-count').innerText(),'1','Unread message triggers circle badge');
 await page.locator('#profile-messenger').click();
 await page.waitForSelector('.profile-message');
 assert.equal(await page.locator('.profile-message p').innerText(),'Hello <script>danger</script>','Message body is escaped');
 assert.equal(await page.locator('.profile-message script').count(),0,'No executable message markup');
 await page.waitForFunction(()=>!document.querySelector('.messenger-round.has-unread'));
 assert.equal(await page.evaluate(()=>test.state.profileView),'messages','Circle opens own profile messages');
 await page.locator('[data-public-profile="other"]').first().click();
 await page.waitForSelector('#profile-message-input');
 assert.equal(await page.locator('h2').innerText(),'Other participant','Any participant profile opens');
 await page.locator('#profile-message-input').fill('Reply');
 await page.locator('#profile-message-send').click();
 await page.waitForFunction(()=>window.posts.length===1);
 assert.deepEqual(await page.evaluate(()=>window.posts[0]),{sender_id:'me',receiver_id:'other',body:'Reply'},'Reply targets visited participant');
 await page.screenshot({path:'/tmp/imperium-profile-messages.png',fullPage:true});
 await browser.close();console.log('Profile messaging mobile checks passed');
})().catch(e=>{console.error(e);process.exit(1);});

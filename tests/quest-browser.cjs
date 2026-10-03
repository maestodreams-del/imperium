const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://imperium.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><input id="file-input" type="file" hidden><input id="rental-pdf-input" type="file" hidden></body></html>'}));
  await page.goto('https://imperium.test/');
  await page.evaluate(()=>{localStorage.setItem('imperium_mode_v2','demo');localStorage.setItem('imperium_demo_session_v2',JSON.stringify({userId:'u-zenon'}));});
  await page.addStyleTag({content:fs.readFileSync('styles.css','utf8')});
  await page.addScriptTag({content:fs.readFileSync('game.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('app.js','utf8')});
  await page.locator('.light-shell').waitFor();
  assert.equal(await page.locator('.bottomnav button:disabled').count(),0);
  for(const tab of ['locations','inspections','rentals','activity','attendance','team','profile','salary','settings','tasks']){
   await page.locator(`[data-tab="${tab}"]`).click();
   assert.equal(await page.locator(`[data-tab="${tab}"].active`).count(),1,tab);
  }
  await page.locator('[data-tab="game"]').click();
  assert.equal(await page.locator('.quest-scene h3').innerText(),'Przebudzenie przy Granicy');
  await page.locator('[data-quest-choice="0"]').click();
  assert.equal(await page.locator('.quest-scene h3').innerText(),'Imię bez wspomnienia');
  await page.locator('[data-tab="tasks"]').click();await page.locator('[data-tab="game"]').click();
  assert.equal(await page.locator('.quest-scene h3').innerText(),'Imię bez wspomnienia');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const reached=await page.evaluate(()=>JSON.parse(localStorage.getItem('imperium_quest_v1:demo:u-zenon')).node);assert.equal(reached,'names');
  await page.screenshot({path:`/tmp/imperium-quest-${width}.png`,fullPage:true});
  await page.locator('#logout').click();await page.locator('#login-admin').click();await page.locator('[data-tab="game"]').click();
  assert.equal(await page.locator('.quest-scene h3').innerText(),'Przebudzenie przy Granicy','Different account has its own game');
  assert.deepEqual(errors,[]);await page.close();
 }
 await browser.close();console.log('Mobile/desktop: Zenon navigation unlocked; quest choices and return-to-tab persistence; per-account separation; no runtime errors.');
})().catch(e=>{console.error(e);process.exit(1)});

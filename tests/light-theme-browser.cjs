const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://imperium.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><input id="file-input" type="file" hidden><input id="rental-pdf-input" type="file" hidden></body></html>'}));
  await page.goto('https://imperium.test/');await page.evaluate(()=>{localStorage.setItem('imperium_mode_v2','demo');localStorage.setItem('imperium_demo_session_v2',JSON.stringify({userId:'u-admin'}));});
  await page.addStyleTag({content:fs.readFileSync('styles.css','utf8')});await page.addScriptTag({content:fs.readFileSync('app.js','utf8')});
  await page.locator('.light-shell').waitFor();
  const tabs=['tasks','locations','inspections','rentals','invoices','activity','attendance','chat','team','profile','salary','settings'];
  for(const tab of tabs){
   await page.locator(`[data-tab="${tab}"]`).click();
   assert.equal(await page.locator(`[data-tab="${tab}"].active`).count(),1,tab);
   const info=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,body:getComputedStyle(document.body).backgroundColor,nav:getComputedStyle(document.querySelector('.bottomnav')).backgroundColor,svg:document.querySelector('.navitem.active svg')?.getBoundingClientRect().width}));
   assert.equal(info.overflow,false,`${tab} fits ${width}px viewport`);assert.equal(info.body,'rgb(243, 246, 251)');assert.ok(info.svg>15,`${tab} has an icon`);
   if(['tasks','chat','rentals','salary'].includes(tab))await page.screenshot({path:`/tmp/imperium-light-${width}-${tab}.png`,fullPage:true});
  }
  await page.locator('[data-tab="tasks"]').click();await page.locator('#new-task').click();
  await page.locator('#f-title').fill('Test czytelności');assert.equal(await page.locator('#f-title').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('[data-close]').click();
  await page.locator('[data-action="copy"]').first().click();assert.equal(await page.locator('.modal h2').innerText(),'Kopiuj zadanie na dziś');assert.ok(await page.locator('#f-title').inputValue());await page.locator('[data-close]').click();
  assert.deepEqual(errors,[],`No runtime errors at ${width}px`);await page.close();
 }
 await browser.close();console.log('Light theme: 12 screens, mobile/desktop fit, navigation icons, task form and copying passed');
})().catch(e=>{console.error(e);process.exit(1)});

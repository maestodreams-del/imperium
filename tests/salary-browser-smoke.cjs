const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const url = process.env.IMPERIUM_TEST_URL || 'http://127.0.0.1:8769';

(async () => {
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route => new URL(route.request().url()).origin===url ? route.continue() : route.abort());
  await context.addInitScript(() => {
    localStorage.setItem('imperium_mode_v2','demo');
    localStorage.setItem('imperium_demo_session_v2',JSON.stringify({userId:'u-admin'}));
  });
  await page.goto(url);
  await page.locator('[data-tab="salary"]').click();
  await page.locator('#salary-worker').selectOption('u-zenon');
  assert.match(await page.locator('#salary-total-value').innerText(),/12\s*000,00/);
  assert.equal(await page.locator('.salary-bag,.salary-bags,.salary-fall').count(),0);
  await page.locator('#salary-amount').fill('150.25');
  await page.locator('#salary-reason').fill('Premia testowa');
  await page.locator('#salary-add-adjustment').click();
  assert.match(await page.locator('#salary-total-value').innerText(),/12\s*150,25/);
  await page.locator('#salary-sign').selectOption('minus');
  await page.locator('#salary-amount').fill('200.50');
  await page.locator('#salary-reason').fill('Zaliczka testowa');
  await page.locator('#salary-add-adjustment').click();
  assert.match(await page.locator('#salary-total-value').innerText(),/11\s*949,75/);
  assert.equal(await page.locator('#salary-history-rows>div').count(),2);
  await page.locator('#salary-amount').fill('20');
  await page.locator('#salary-reason').fill(' ');
  await page.locator('#salary-add-adjustment').click();
  assert.equal(await page.locator('#salary-history-rows>div').count(),2);
  for(const tab of ['tasks','attendance','team','profile','rentals','important','salary']){
    await page.locator(`[data-tab="${tab}"]`).click();
    assert.equal(await page.locator('.bottomnav').count(),1,`${tab} renders`);
  }
  await page.evaluate(() => {
    const db=JSON.parse(localStorage.getItem('imperium_db_v2'));
    db.users.push({id:'u-olena',name:'Olena',role:'worker',active:true,locationIds:['l3']});
    db.attendance=[{id:'attendance-test',userId:'u-olena',locationId:'l3',startedAt:new Date(Date.now()-8.5*3600000).toISOString(),endedAt:null}];
    localStorage.setItem('imperium_db_v2',JSON.stringify(db));
  });
  await page.reload();
  await page.locator('[data-tab="attendance"]').click();
  await page.locator('[data-admin-attendance-stop="u-olena"]').click();
  await page.locator('[data-tab="salary"]').click();
  await page.locator('#salary-worker').selectOption('u-olena');
  assert.match(await page.locator('#salary-type').innerText(),/25,00/);
  const first=await page.evaluate(() => JSON.parse(localStorage.getItem('imperium_db_v2')).salaryAdjustments.filter(x=>x.attendance_id==='attendance-test'));
  assert.equal(first.length,1);
  assert.ok(Math.abs(first[0].amount_grosz-21250)<=2,'8.5 hours at 25 zł');
  await page.locator('[data-tab="attendance"]').click();
  await page.locator('[data-edit-attendance-start="attendance-test"]').click();
  await page.locator('#f-attendance-start').evaluate(el => {const d=new Date(new Date(el.value).getTime()+3600000);el.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);});
  await page.locator('#save-attendance-start').click();
  const revised=await page.evaluate(() => JSON.parse(localStorage.getItem('imperium_db_v2')).salaryAdjustments.filter(x=>x.attendance_id==='attendance-test'));
  assert.equal(revised.length,1,'A correction updates the same attendance entry');
  assert.ok(revised[0].amount_grosz<first[0].amount_grosz-2450);
  await page.reload();
  await page.locator('[data-tab="salary"]').click();
  await page.locator('#salary-worker').selectOption('u-zenon');
  assert.match(await page.locator('#salary-total-value').innerText(),/11\s*949,75/);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:process.env.IMPERIUM_TEST_SCREENSHOT || '/tmp/imperium-payroll-smoke.png',fullPage:true});
  const cloud=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const cp=await cloud.newPage();
  cp.on('pageerror',e=>errors.push(e.message));
  const rules=[{profile_id:'zenon',pay_type:'fixed',fixed_grosz:1200000,hourly_grosz:0}];
  const adjustments=[];
  let race=false;
  const pending=[];
  await cloud.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url());
    if(u.origin===url){
      if(u.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.IMPERIUM_CONFIG={DEFAULT_SUPABASE_URL:"https://payroll-test.invalid",DEFAULT_SUPABASE_ANON_KEY:"nonproduction-fixture"}'});
      return route.continue();
    }
    if(u.hostname!=='payroll-test.invalid')return route.abort();
    const table=u.pathname.split('/').at(-1);
    let result=[];
    if(table==='salary_is_manager')result=true;
    else if(table==='profiles')result=[{id:'owner',full_name:'Owner',role:'admin',active:true},{id:'zenon',full_name:'Zenon',role:'worker',active:true}];
    else if(table==='salary_compensation')result=rules;
    else if(table==='salary_adjustments'){
      const month=u.searchParams.get('month_start').replace('eq.','');
      result=adjustments.filter(x=>x.month_start===month);
      if(race){
        result=[{id:month,profile_id:'zenon',month_start:month,amount_grosz:month==='2026-09-01'?100:200,reason:'Month fixture',kind:'manual',created_at:month+'T12:00:00Z'}];
        const delay=new Promise(r=>setTimeout(r,month==='2026-09-01'?700:40));pending.push(delay);await delay;
      }else await new Promise(r=>setTimeout(r,50));
    }else if(table==='salary_add_adjustment'){
      const d=request.postDataJSON();
      adjustments.push({id:String(adjustments.length),profile_id:d.p_profile,month_start:d.p_month,amount_grosz:d.p_amount_grosz,reason:d.p_reason,kind:'manual',created_at:new Date().toISOString()});
      result=null;
    }else if(table==='salary_set_compensation'){
      const d=request.postDataJSON();Object.assign(rules[0],{pay_type:d.p_type,fixed_grosz:d.p_fixed_grosz,hourly_grosz:d.p_hourly_grosz});result=null;
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await cloud.addInitScript(()=>{
    localStorage.setItem('imperium_mode_v2','cloud');
    localStorage.setItem('imperium_auth_v2',JSON.stringify({access_token:'nonproduction-fixture',user:{id:'owner'}}));
  });
  await cp.goto(url);
  await cp.locator('[data-tab="salary"]').click();
  await cp.waitForFunction(()=>!document.getElementById('salary-manager-controls')?.disabled);
  assert.equal(await cp.locator('#salary-fixed').inputValue(),'12000.00','Initial fetch hydrates rate editor');
  await cp.locator('#salary-amount').fill('150.25');
  await cp.locator('#salary-reason').fill('Cloud fixture');
  await cp.locator('#salary-add-adjustment').click();
  await cp.waitForFunction(()=>document.getElementById('salary-amount')?.value==='');
  await cp.waitForFunction(()=>!document.getElementById('salary-manager-controls').disabled);
  assert.match(await cp.locator('#salary-total-value').innerText(),/12\s*150,25/);
  await cp.locator('#salary-fixed').fill('13000');
  const savedRule=cp.waitForResponse(r=>r.url().endsWith('/rpc/salary_set_compensation'));
  await cp.locator('#salary-save-rule').click();
  await savedRule;
  console.log('Cloud rate fixture',rules[0]);
  await cp.waitForFunction(()=>document.getElementById('salary-total-value').textContent.replace(/\s/g,'').startsWith('13150,25'));
  await cp.waitForFunction(()=>!document.getElementById('salary-manager-controls').disabled);
  assert.match(await cp.locator('#salary-total-value').innerText(),/13\s*150,25/);
  race=true;
  await cp.locator('#salary-month').fill('2026-08');
  await cp.locator('#salary-month').dispatchEvent('change');
  await cp.waitForFunction(()=>!document.getElementById('salary-manager-controls').disabled);
  await cp.locator('#salary-month').fill('2026-09');
  await cp.locator('#salary-month').dispatchEvent('change');
  await cp.locator('#salary-month').fill('2026-10');
  await cp.locator('#salary-month').dispatchEvent('change');
  await cp.waitForFunction(()=>!document.getElementById('salary-manager-controls').disabled);
  await Promise.all(pending);
  assert.equal(await cp.locator('#salary-month').inputValue(),'2026-10');
  assert.match(await cp.locator('#salary-total-value').innerText(),/13\s*002,00/,'Outdated month response cannot replace the current month');
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: navigation, fixed salary, signed adjustments, required reason, attendance credit/correction, persistence, no bags, cloud save controls, initial rate loading and month races.');
})().catch(error=>{console.error(error);process.exit(1);});

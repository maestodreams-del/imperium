// Run with jsdom available through NODE_PATH; no backend or real accounts involved.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="quest"></div>',{url:'https://imperium.test/',runScripts:'outside-only'}),w=dom.window,c=w.document.getElementById('quest');
w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};
for(const file of ['quest-chapter.js','quest-sketch.js','game.js'])w.eval(fs.readFileSync(file,'utf8'));
const q=w.ImperiumQuest;
q.mount(c,'test:zenon');assert.ok(c.querySelector('button[data-quest-language="ru"]'));assert.equal(c.querySelectorAll('.quest-scene').length,0);
c.querySelector('button[data-quest-language="ru"]').click();assert.equal(c.getAttribute('lang'),'ru');assert.match(c.querySelector('h3').textContent,/Пробуждение/);
assert.equal(c.querySelectorAll('svg[role=img]').length,1);
c.querySelector('[data-quest-choice="0"]').click();assert.equal(JSON.parse(w.localStorage.getItem('imperium_quest_v1:test:zenon')).node,'names');
const before=w.localStorage.getItem('imperium_quest_v1:test:zenon');
const select=c.querySelector('select');select.value='pl';select.dispatchEvent(new w.Event('change'));
assert.equal(c.querySelector('h3').textContent,'Imię bez wspomnienia');assert.equal(w.localStorage.getItem('imperium_quest_v1:test:zenon'),before);
q.mount(c,'test:zenon');assert.equal(c.getAttribute('lang'),'pl');assert.equal(c.querySelector('h3').textContent,'Imię bez wspomnienia');
q.mount(c,'test:owner');assert.ok(c.querySelector('button[data-quest-language="ru"]'));c.querySelector('button[data-quest-language="pl"]').click();assert.equal(c.querySelector('h3').textContent,'Przebudzenie przy Granicy');
// Original version-1 checkpoint save migrates without resetting inventory or stats.
w.localStorage.setItem('imperium_quest_v1:test:legacy',JSON.stringify({...q.fresh(),node:'endingHome',items:['tryb'],trust:2}));q.mount(c,'test:legacy');c.querySelector('button[data-quest-language="ru"]').click();assert.match(c.querySelector('h3').textContent,/Возвращение/);c.querySelector('[data-quest-choice="0"]').click();assert.equal(JSON.parse(w.localStorage.getItem('imperium_quest_v1:test:legacy')).node,'chapter01');assert.match(c.textContent,/шестерня/);
// Both localized final scenes retain their save and have no fake ending/replay.
for(const lang of ['ru','pl']){w.localStorage.setItem('imperium_quest_v1:test:final',JSON.stringify({...q.fresh(),node:'chapter81'}));w.localStorage.setItem('imperium_quest_v1:test:final:language',lang);q.mount(c,'test:final');assert.match(c.querySelector('.quest-soon').textContent,lang==='ru'?/Обновление скоро/:/Aktualizacja wkrótce/);assert.equal(c.querySelectorAll('[data-quest-choice]').length,0);}
// Local storage failure leaves a usable language selector and visible save warning.
Object.defineProperty(w,'localStorage',{value:{getItem(){throw Error('disabled')},setItem(){throw Error('disabled')}}});q.mount(c,'test:blocked');c.querySelector('button[data-quest-language="ru"]').click();assert.match(c.querySelector('.quest-save').textContent,/Не удалось/);c.querySelector('[data-quest-choice="0"]').click();assert.match(c.querySelector('h3').textContent,/Имя/);
console.log('DOM: initial RU/PL selection, live language switch, preserved progress, account isolation, legacy checkpoint migration, illustrations, localized cliffhanger and blocked storage passed.');

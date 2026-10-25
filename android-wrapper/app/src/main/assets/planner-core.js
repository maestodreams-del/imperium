/* Shared pure planner logic. All calendar dates use Europe/Warsaw. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PlannerCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TZ='Europe/Warsaw';
const day=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
function addDays(value,count){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
function localEpoch(date,time='09:00'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}(:\d{2})?$/.test(time))return NaN;
 const desired=Date.parse(date+'T'+time.slice(0,5)+':00Z');let result=desired;const candidates=[];
 for(let i=0;i<5;i++){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(result));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));const observed=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);const next=result+desired-observed;if(next===result)return result;if(candidates.includes(next))return Math.max(result,next);candidates.push(next);result=next;}
 return result;
}
function reminderAt(t){return t.due_date&&t.reminder_minutes!==null&&t.reminder_minutes!==undefined?localEpoch(t.due_date,t.due_time||'09:00')-Number(t.reminder_minutes)*60000:NaN;}
function matches(t,q){return [t.title,t.notes,...(t.tags||[])].join(' ').toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());}
function sortTasks(items){const p={urgent:0,high:1,normal:2,low:3};return [...items].sort((a,b)=>(a.status==='done')-(b.status==='done')||Number(b.starred)-Number(a.starred)||(a.due_date||'9999').localeCompare(b.due_date||'9999')||(a.due_time||'99').localeCompare(b.due_time||'99')||p[a.priority]-p[b.priority]||a.created_at.localeCompare(b.created_at));}
function nextDate(value,rule){let next=addDays(value,rule==='weekly'?7:1);if(rule==='monthly'){const d=new Date(value+'T12:00:00Z');const dom=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(dom,last));next=d.toISOString().slice(0,10);}if(rule==='weekdays'){while([0,6].includes(new Date(next+'T12:00:00Z').getUTCDay()))next=addDays(next,1);}return next;}
function validateTask(t){if(!String(t.title||'').trim()||t.title.length>300)throw Error('Укажи название задачи (до 300 символов).');if((t.due_time||t.repeat_rule&&t.repeat_rule!=='none'||t.reminder_minutes!==null)&&!t.due_date)throw Error('Для времени, повтора и напоминания нужна дата.');if(t.duration_minutes<5||t.duration_minutes>1440)throw Error('Длительность: от 5 до 1440 минут.');if(!['low','normal','high','urgent'].includes(t.priority))throw Error('Некорректный приоритет.');if((t.checklist||[]).length>100)throw Error('Не больше 100 подзадач.');return t;}
function icsEscape(v){return String(v).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
return {TZ,day,addDays,localEpoch,reminderAt,matches,sortTasks,nextDate,validateTask,icsEscape};
});

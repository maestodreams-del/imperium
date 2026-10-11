/* IMPERIUM route calculations. HERE amounts remain estimates, not invoices. */
(function(root){
 'use strict';
 const finite=n=>Number.isFinite(Number(n));
 function decodePolyline(encoded){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let i=0;
  function unsigned(){let n=0,shift=0,v;do{if(i>=encoded.length||shift>50)throw Error('Nieprawidłowa geometria trasy.');v=alphabet.indexOf(encoded[i++]);if(v<0)throw Error('Nieprawidłowa geometria trasy.');n+=(v&31)*2**shift;shift+=5;}while(v&32);return n;}
  function signed(){const n=unsigned();return n%2?-(n+1)/2:n/2;}
  if(unsigned()!==1)throw Error('Nieobsługiwany format trasy.');const h=unsigned(),precision=10**(h&15),third=(h>>4)&7;
  let lat=0,lng=0;const points=[];while(i<encoded.length){lat+=signed();lng+=signed();if(third)signed();points.push([lat/precision,lng/precision]);}return points;
 }
 function distance(a,b){const r=Math.PI/180,p=(b[0]-a[0])*r,q=(b[1]-a[1])*r,x=Math.sin(p/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(q/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
 function closest(points,p){let best={distance:Infinity,index:0,fraction:0};const scale=Math.cos(p[0]*Math.PI/180),unit=111195;for(let i=0;i<points.length-1;i++){const a=[(points[i][1]-p[1])*scale,(points[i][0]-p[0])],b=[(points[i+1][1]-p[1])*scale,(points[i+1][0]-p[0])],x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,-(a[0]*x+a[1]*y)/(x*x+y*y||1))),d=Math.hypot(a[0]+x*t,a[1]+y*t)*unit;if(d<best.distance)best={distance:d,index:i,fraction:t};}return best;}
 function tolls(route,currency){
  const seen=new Set(),rows=[];let low=0,high=0,unknown=false,paid=false;
  const notices=[...(route.notices||[]),...(route.sections||[]).flatMap(s=>s.notices||[])];
  if(notices.some(n=>/tollsDataUnavailable|currencyUnsupported|toll.*(unavailable|notfound|unsupported)/i.test(n.code||'')))unknown=true;
  for(const section of route.sections||[]){
   if((section.spans||[]).some(s=>(s.tollSystems||[]).length||(s.attributes||[]).includes('tollRoad')))paid=true;
   for(const [index,toll] of (section.tolls||[]).entries()){
    paid=true;const fares=toll.fares||[];const ids=fares.map(f=>f.id).filter(Boolean);
    if(ids.length&&ids.every(id=>seen.has(id)))continue;
    if(ids.some(id=>seen.has(id)))unknown=true; // Ambiguous partial group overlap must never inflate a total silently.
    ids.forEach(id=>seen.add(id));const options=fares.map(f=>{const p=f.convertedPrice?.currency===currency?f.convertedPrice:f.price?.currency===currency?f.price:null;return {name:f.name||toll.tollSystem||'Opłata drogowa',methods:f.paymentMethods||[],reason:f.reason,price:p&&p.type==='value'&&typeof p.value==='number'&&finite(p.value)&&Number(p.value)>=0?Number(p.value):null};});
    const values=options.map(f=>f.price).filter(n=>n!==null);const complete=values.length>0&&values.length===options.length;
    if(!complete)unknown=true;const min=values.length?Math.min(...values):null,max=values.length?Math.max(...values):null;
    if(min!==null){low+=min;high+=max;}
    rows.push({country:toll.countryCode||'',name:options[0]?.name||toll.tollSystem||`Opłata ${index+1}`,min,max,options,complete});
   }
  }
  if(paid&&!rows.length)unknown=true;
  return {low,high,unknown,paid,rows,currency,notices};
 }
 function parseRoute(route,currency,mode){
  const sections=route.sections||[];let points=[],actions=[],length=0,duration=0;
  for(const s of sections){const decoded=s.polyline?decodePolyline(s.polyline):[],offset=points.length;points.push(...decoded);length+=Number(s.summary?.length)||0;duration+=Number(s.summary?.duration)||0;actions.push(...(s.actions||[]).map(a=>({...a,offset:offset+(a.offset||0)})));}
  if(points.length<2||length<=0)throw Error('Serwis nie zwrócił kompletnej trasy.');
  const costs=tolls(route,currency),critical=costs.notices.filter(n=>n.severity==='critical');
  const avoidViolation=costs.notices.some(n=>/violatedAvoid.*Toll|violatedAvoid.*Vignette/i.test(n.code||''));
  const freeConfirmed=!costs.paid&&!costs.unknown&&!avoidViolation;
  const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+distance(points[i-1],points[i]));
  return {id:route.id,points,cumulative,actions,length,duration,costs,mode,critical,freeConfirmed,blocked:critical.length>0||(mode==='free'&&!freeConfirmed),arrival:sections.at(-1)?.arrival?.time||null};
 }
 function tripCost(route,budget){
  const km=route.length/1000;const fuel=Number(budget.consumption)>0&&Number(budget.fuelPrice)>0?km*Number(budget.consumption)/100*Number(budget.fuelPrice):0;
  const running=Number(budget.rate)>0?km*Number(budget.rate):0;
  return {fuel,running,low:route.costs.low+fuel+running,high:route.costs.high+fuel+running,unknown:route.costs.unknown,perKm:(route.costs.low+fuel+running)/km};
 }
 const core={decodePolyline,distance,closest,tolls,parseRoute,tripCost};if(typeof module==='object'&&module.exports)module.exports=core;root.ImperiumNavigationCore=core;
})(typeof window==='object'?window:globalThis);

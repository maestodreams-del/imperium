/* A local, printable rendering of a saved invoice. KSeF acceptance remains authoritative. */
(function(root){
'use strict';
const cash=n=>new Intl.NumberFormat('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100)+' zł';
const str=x=>String(x??'');
async function generate(invoice,seller,options={}){
  const lib=root.PDFLib,kit=root.fontkit,calc=root.ImperiumInvoice;
  if(!lib||!kit||!calc)throw Error('Moduł PDF jest niedostępny.');
  const totals=calc.calculate(invoice.lines);
  if(!seller?.name||!invoice?.number||!invoice?.buyerName)throw Error('Brak danych faktury.');
  const pdf=await lib.PDFDocument.create();pdf.registerFontkit(kit);
  const bytes=options.fontBytes||Uint8Array.from(atob(root.ImperiumInvoiceFontBase64||''),c=>c.charCodeAt(0));
  if(!bytes.length)throw Error('Brak czcionki faktury.');
  const font=await pdf.embedFont(bytes,{subset:true});
  pdf.setTitle(`Faktura ${invoice.number}${invoice.status==='accepted'?'':' - szkic'}`);
  pdf.setCreator('IMPERIUM');
  const dark=lib.rgb(.10,.16,.24),muted=lib.rgb(.38,.44,.52),blue=lib.rgb(.07,.37,.68),line=lib.rgb(.83,.87,.91);
  const W=595.28,H=841.89,M=38,RIGHT=W-M;
  let page,y;
  function draw(text,x,at,size=9,color=dark){page.drawText(str(text),{x,y:at,size,font,color});}
  function hline(at){page.drawLine({start:{x:M,y:at},end:{x:RIGHT,y:at},color:line,thickness:.7});}
  function fit(text,size,max){let t=str(text);while(t&&font.widthOfTextAtSize(t,size)>max)t=t.slice(0,-2).trimEnd();return t===str(text)?t:t+'…';}
  function wrap(text,size,max){const words=str(text).split(/\s+/),out=[];let current='';for(const word of words){const next=current?current+' '+word:word;if(font.widthOfTextAtSize(next,size)<=max)current=next;else{if(current)out.push(current);current=fit(word,size,max);}}if(current)out.push(current);return out.length?out:[''];}
  function newPage(){page=pdf.addPage([W,H]);y=H-39;draw('IMPERIUM  /  FAKTURY',M,y,8,blue);draw('PLN',RIGHT-20,y,8,muted);y-=19;hline(y);y-=23;}
  function ensure(height){if(y-height<52)newPage();}
  function block(label,items,x,width,start){draw(label,x,start,8,blue);let at=start-17;for(const value of items){for(const part of wrap(value,9,width)){draw(part,x,at,9);at-=14;}}return at;}
  const accepted=invoice.status==='accepted'&&!!invoice.ksefNumber;
  const statusText=accepted?'':invoice.status==='rejected'?'ODRZUCONA PRZEZ KSeF — NIE WYSTAWIONA':invoice.status==='sending'||invoice.status==='processing'?'OCZEKUJE NA POTWIERDZENIE KSeF':'SZKIC — NIE WYSŁANO DO KSeF';
  newPage();draw('FAKTURA VAT',M,y,21,dark);y-=20;draw(`Nr ${invoice.number}`,M,y,11);y-=19;
  if(!accepted){draw(statusText,M,y,9,lib.rgb(.68,.23,.13));y-=18;}
  else{draw(`Numer KSeF: ${invoice.ksefNumber}`,M,y,8,blue);y-=17;}
  hline(y);y-=22;
  const sellerAddr=[seller.streetAddress,seller.postalCity].filter(Boolean);
  const buyerAddr=[invoice.buyerStreet,invoice.buyerPostalCity].filter(Boolean);
  const left=block('SPRZEDAWCA',[seller.name,`NIP: ${seller.nip}`,...sellerAddr],M,242,y);
  const right=block('NABYWCA',[invoice.buyerName,`NIP: ${invoice.buyerNip}`,...buyerAddr],M+264,250,y);
  y=Math.min(left,right)-14;hline(y);y-=20;
  draw(`Data wystawienia: ${invoice.issueDate}`,M,y,9);draw(`Data sprzedaży: ${invoice.saleDate}`,M+264,y,9);y-=18;
  draw(`Termin płatności: ${invoice.dueDate||'—'}`,M,y,9);
  if(seller.bankAccount)draw(fit(`Rachunek: ${seller.bankAccount}`,8,250),M+264,y,8,muted);
  y-=27;
  const cols=[M,M+25,M+212,M+272,M+326,M+411,M+457];
  function tableHead(){ensure(40);page.drawRectangle({x:M,y:y-7,width:RIGHT-M,height:24,color:lib.rgb(.92,.95,.98)});['Lp.','Nazwa','Ilość','Jm.','Cena netto','VAT','Brutto'].forEach((v,i)=>draw(v,cols[i]+3,y,7,blue));y-=30;}
  tableHead();
  for(let i=0;i<totals.rows.length;i++){
    const r=totals.rows[i],name=wrap(r.description,8,168),height=Math.max(28,name.length*12+10);
    if(y-height<95){newPage();tableHead();}
    const start=y;draw(i+1,cols[0]+3,start,8);name.forEach((part,j)=>draw(part,cols[1]+3,start-j*12,8));
    draw(r.quantity,cols[2]+3,start,8);draw(fit(r.unit,8,44),cols[3]+3,start,8);
    draw(cash(r.unitNet),cols[4]+3,start,8);draw(`${r.rate}%`,cols[5]+3,start,8);draw(cash(r.net+r.vat),cols[6]+3,start,8);
    y-=height;hline(y+5);y-=5;
  }
  ensure(180);y-=10;
  for(const rate of ['23','8','5']){const g=totals.groups[rate];if(!g.net&&!g.vat)continue;draw(`VAT ${rate}%: netto ${cash(g.net)}  |  podatek ${cash(g.vat)}`,M,y,9);y-=17;}
  y-=4;hline(y);y-=25;
  draw(`Razem netto: ${cash(totals.net)}`,M,y,11);y-=20;
  draw(`VAT: ${cash(totals.vat)}`,M,y,11);y-=24;
  draw(`DO ZAPŁATY: ${cash(totals.gross)}`,M,y,15,blue);
  if(!accepted){y-=31;draw('Podgląd dokumentu. Brak potwierdzenia przyjęcia w KSeF.',M,y,8,muted);}
  const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:RIGHT-30,y:26,size:8,font,color:muted}));
  return pdf.save();
}
const api={generate};if(typeof module==='object'&&module.exports)module.exports=api;root.ImperiumInvoicePdf=api;
})(typeof window!=='undefined'?window:globalThis);

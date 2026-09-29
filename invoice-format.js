/* FA(3) invoice export used for review and import from KSeF. No credentials live here. */
(function(root){
  'use strict';
  const xml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const amount=cents=>(cents/100).toFixed(2);
  function cents(value){
    const s=String(value).trim();
    if(!/^\d{1,10}(\.\d{1,2})?$/.test(s))throw Error('Nieprawidłowa cena netto.');
    const [a,b='']=s.split('.');return Number(a)*100+Number((b+'00').slice(0,2));
  }
  function quantity(value){const s=String(value).trim();if(!/^\d{1,8}(\.\d{1,3})?$/.test(s)||Number(s)<=0)throw Error('Nieprawidłowa ilość.');return Number(s);}
  function validNip(value){const s=String(value||'');if(!/^[1-9]\d{9}$/.test(s))return false;const weights=[6,5,7,2,3,4,5,6,7];return weights.reduce((sum,w,i)=>sum+w*Number(s[i]),0)%11===Number(s[9]);}
  function calculate(lines){
    if(!Array.isArray(lines)||!lines.length||lines.length>100)throw Error('Dodaj pozycje faktury.');
    const groups={'23':{net:0,vat:0},'8':{net:0,vat:0},'5':{net:0,vat:0}};
    const rows=lines.map((l,i)=>{
      if(!String(l.description||'').trim()||!String(l.unit||'').trim()||!groups[l.vat_rate])throw Error('Sprawdź opis, jednostkę i stawkę VAT pozycji '+(i+1)+'.');
      const qty=quantity(l.quantity),price=cents(l.unit_net),net=Math.round(qty*price),vat=Math.round(net*Number(l.vat_rate)/100);
      groups[l.vat_rate].net+=net;groups[l.vat_rate].vat+=vat;
      return {description:l.description.trim(),unit:l.unit.trim(),quantity:qty,unitNet:price,rate:l.vat_rate,net,vat};
    });
    const net=Object.values(groups).reduce((a,b)=>a+b.net,0),vat=Object.values(groups).reduce((a,b)=>a+b.vat,0);
    return {rows,groups,net,vat,gross:net+vat};
  }
  function generate(invoice,seller){
    if(!seller||!validNip(seller.nip)||!validNip(invoice.buyerNip))throw Error('Sprawdź NIP sprzedawcy i nabywcy (10 cyfr i suma kontrolna).');
    if(!invoice.number||!invoice.issueDate||!invoice.saleDate||!invoice.buyerName||!invoice.buyerStreet||!invoice.buyerPostalCity||!seller.name||!seller.streetAddress||!seller.postalCity)throw Error('Uzupełnij dane stron oraz daty faktury.');
    const t=calculate(invoice.lines),tag=(name,v)=>`<${name}>${xml(v)}</${name}>`;
    const party=(p,buyer)=>`<${buyer?'Podmiot2':'Podmiot1'}><DaneIdentyfikacyjne>${tag('NIP',p.nip)}${tag('Nazwa',p.name)}</DaneIdentyfikacyjne><Adres><KodKraju>PL</KodKraju>${tag('AdresL1',p.streetAddress||p.street)}${tag('AdresL2',p.postalCity)}</Adres>${buyer?'<JST>2</JST><GV>2</GV>':''}</${buyer?'Podmiot2':'Podmiot1'}>`;
    const amountTags=[['23','1'],['8','2'],['5','3']].map(([rate,n])=>t.groups[rate].net?tag(`P_13_${n}`,amount(t.groups[rate].net))+tag(`P_14_${n}`,amount(t.groups[rate].vat)):'').join('');
    const rows=t.rows.map((r,i)=>`<FaWiersz>${tag('NrWierszaFa',i+1)}${tag('P_7',r.description)}${tag('P_8A',r.unit)}${tag('P_8B',r.quantity)}${tag('P_9A',amount(r.unitNet))}${tag('P_11',amount(r.net))}${tag('P_12',r.rate)}</FaWiersz>`).join('');
    const annotations='<Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><Zwolnienie><P_19N>1</P_19N></Zwolnienie><NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu><P_23>2</P_23><PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy></Adnotacje>';
    return `<?xml version="1.0" encoding="UTF-8"?><Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza>${tag('DataWytworzeniaFa',new Date().toISOString())}<SystemInfo>IMPERIUM</SystemInfo></Naglowek>${party(seller,false)}${party({nip:invoice.buyerNip,name:invoice.buyerName,street:invoice.buyerStreet,postalCity:invoice.buyerPostalCity},true)}<Fa><KodWaluty>PLN</KodWaluty>${tag('P_1',invoice.issueDate)}${tag('P_2',invoice.number)}${tag('P_6',invoice.saleDate)}${amountTags}${tag('P_15',amount(t.gross))}${annotations}<RodzajFaktury>VAT</RodzajFaktury>${rows}${invoice.dueDate?`<Platnosc><TerminPlatnosci>${tag('Termin',invoice.dueDate)}</TerminPlatnosci></Platnosc>`:''}</Fa></Faktura>`;
  }
  const api={calculate,generate,validNip};if(typeof module==='object'&&module.exports)module.exports=api;root.ImperiumInvoice=api;
})(typeof window!=='undefined'?window:globalThis);

/* Original pen-and-wash SVG scene sketches. No network or image fonts required. */
(function(root){
'use strict';
const old=[
'forest fox giant lamp','forest lamp hand','forest fox bag','forest giant bag','hand portal','forest bag map','bag knife map','tree giant','map tower bridge','water fox face','city cart child','cart giant gear','market crystal knife','lamp crystal crowd','bed window bread','tower statue','archive bottles','archive portal face','book gear lamp','lamp prism','bridge guardian river','guardian fox lamp','tunnel gear pipe','bridge giant crack','valley portal fox','camp fire fox','portal bed clock','workshop rick ron','workshop gear portal','iara severus bed','wesker hand','homelander elias city','thomas map tower','ari indigo council','machine gear portal','machine hand crystal','machine giant gear','portal knife pipe','portal bed fox','portal giant sun','machine bridge sun','city portal sun','indigo hand city','rick portal bed'
];
const next=`
ship rick ron
ship child crowd
ship cloud portal
city garden sun
ship iara crowd
book card hand
bed window garden
hand map moon
workshop rick ron
toaster robot cup
radio map lamp
workshop apprentice ron
workshop tools gear
rick portal tools
screen portal clock
radio hand map
council book lamp
council chair circle
ari book council
indigo orb garden
thomas map staff
severus flask bottles
wesker hand glasses
iara bed heart
ron machine gear
rick portal clock
homelander city shield
elias shield portal
council book gear
bag tools flask
portal radio lamp
city clock shadow
lira city lamp
shelter child bed
child clock shadow
hand circle wall
market cart lamp
tower clock cloud
archive city book
book lock shelf
book machine gear
book tear lamp
workshop apprentice stair
book radio circle
guardian bed water
iara shelter bottles
map gear gear
tower gear staff
tower plank rope
tower lamp sun
tunnel stair pipe
tunnel river pipe
river shadow lamp
machine gear radio
machine coil lightning
machine lamp water
city window clock
guardian lira gate
operator machine book
operator hand book
machine gear portal
apprentice tools hand
crack elias shield
hand portal circle
machine lamp lamp
city clock shadow
elias shield lightning
machine gear circle
shelter bed lamp
crowd city garden
lira portal lamp
ship portal city
council book ari
city garden sun
workshop apprentice ron
bed window moon
screen book shadow
indigo circle book
radio portal stars
bag book portal
portal stars hand
`.trim().split('\n');
const motifs=old.concat(next);
const line=(d)=>`<path d="${d}"/>`;
const shapes={
 forest:line('M-40 72L-68 140h20l-32 45h33v65m-4-177 33 67h-20l31 45h-32m-90-103-29 73h20l-30 48h31v55m125-160 35 68h-19l29 46h-28v43'),
 tree:line('M-7 250v-115m13 115V130m-10 37-40-27m45 1 32-23')+'<ellipse cx="0" cy="92" rx="65" ry="61"/>',
 fox:line('M-50 218l11-43 17 25 19-10 22 9 22-30 13 42-21 22-58-3zM-47 212l-31 3 9 28 41-12M-11 231v20m27-20v20M-17 207l4 2m24-2 4-1M-4 215l9 2-5 5z'),
 giant:line('M-38 250l-7-48 9-42 16-8h40l16 10 8 44-12 44M-38 195l-24 30m103-28 22 27M-14 211l-9 39m37-39 9 39')+'<rect x="-20" y="116" width="40" height="38" rx="7"/>'+line('M-9 134h5m10 0h5'),
 lamp:line('M-20 250h40M0 250v-45m-20 0h40l-5-53h-30zM-21 152h42l-9-13h-24zM-10 139q10-25 20 0M0 168v24'),
 hand:line('M-28 250l-14-57q-4-14 7-11l17 20-14-57q-3-11 7-8l17 48-9-64q0-13 9-4l10 65 2-67q3-12 9-1l1 70 12-48q6-9 10 0l-9 65-20 40M-9 206q14-13 25 2'),
 bag:line('M-39 250l-5-73 13-14h59l16 14-5 73zM-26 164v-26h52v26m-68 25h82m-76 30h69m-34-27v42'),
 map:line('M-62 237l3-85 39 10 40-16 41 9-3 83-38-9-38 17zM-20 162l-1 84m41-100-1 83m-67-18q25-60 58-15t37-28M-41 199l10 8m15-12 10 8m19-3 10 7'),
 water:line('M-75 213q22-20 45 0t45 0t45 0M-67 233q22-18 45 0t45 0t45 0M-45 251q22-14 45 0t45 0'),
 face:'<ellipse cx="0" cy="170" rx="29" ry="37"/>'+line('M-17 165h7m20 0h7m-17 0-3 17h9m-14 13q9 7 18 0'),
 city:line('M-74 250V158h40v92m-40-92 20-23 20 23m-24 20h9m-9 20h9m-9 20h9M-26 250V126h48v124m-48-124 24-25 24 25m-31 32h14m-14 23h14m-14 23h14M33 250v-78h39v78m-39-78 20-17 19 17m-28 26h13m-13 22h13'),
 cart:line('M-55 177h110l-10 48h-84zM-55 177l-15-13m25 38h77m-80-25 11 47m58-47-8 47')+'<circle cx="-30" cy="241" r="10"/><circle cx="31" cy="241" r="10"/>',
 child:'<circle cx="0" cy="166" r="16"/>'+line('M-11 183l-10 37h42l-10-37M-8 220l-6 30m22-30 6 30m-31-48-20 10m53-10 18 10'),
 gear:'<circle cx="0" cy="197" r="35"/><circle cx="0" cy="197" r="13"/>'+line('M-10 162v-14h20v14m25 24h14v21H35m-25 25v14h-20v-14m-25-24h-14v-21h14M-30 167l-10-9-11 11 10 10m71-12 10-9 11 11-10 10m-11 47 10 9 11-11-10-10m-71 12-10 9-11-11 10-10'),
 crystal:line('M0 129l31 30 9 47-40 39-40-39 10-47zM0 129l-10 58 10 58 14-58zM-40 206l30-19 24 0 26 19'),
 knife:line('M-18 243l56-89q-50 15-64 49l8 9-24 26 13 8zM-26 203l16 7'),
 bed:line('M-62 250v-49h124v49M-62 202v-53h19v52m-5-26h95v26M-62 228H62')+'<ellipse cx="-24" cy="190" rx="24" ry="10"/>',
 window:line('M-50 102H50v116H-50zM0 102v116m-50-61H50m-56 68H56'),
 bread:line('M-39 213q-5-55 42-53t41 53zM-13 168l-11 23m29-23-12 23m30-20-10 23'),
 tower:line('M-39 250V103h78v147M-48 103v-29h17v15h19V74h24v15h19V74h17v29zM-12 250v-37q12-22 24 0v37m-23-123h22v25h-22zM-29 177h58'),
 statue:line('M-35 250h70v-18h-70zM-21 232l8-74h26l8 74m-38-56-22 26m58-26 22 26')+'<circle cx="0" cy="140" r="18"/>',
 archive:line('M-64 250V115H64v135M-64 157H64m-128 47H64m-128 36H64m-97-124v34m20-31v31m19-35v35m19-31v31m19-25v25m19-32v32m-94 49 11-36m15-1v37m16-37v37m20-37v37m20-37v37'),
 bottles:line('M-37 245v-42l14-12v-34h15v34l14 12v42zM21 245v-38l12-12v-48h15v48l13 12v38zM-34 226H3m21-8h34m-82-53h17m14 27h17'),
 book:line('M0 246q-30-23-62-10v-80q31-16 62 4 31-20 62-4v80q-30-12-62 10zM0 161v84m-49-70q18-5 34 4m-34 16q18-5 34 4m-34 16q18-5 34 4m30-40q18-8 34-4m-34 24q18-8 34-4m-34 24q18-8 34-4'),
 bridge:line('M-76 224q76-88 152 0M-76 213q76-88 152 0M-55 198v51m32-70v34m43-34v34m34-15v51m-130 4q24-16 48 0t48 0t48 0'),
 guardian:line('M-33 250l11-78h42l15 78M-13 128h26l9 27-22 14-21-14zM-34 187l-22 32m90-32 22 32M45 251v-93'),
 river:line('M-52 103q-55 42 0 77t0 80M27 100q-44 53 5 77t15 85M-20 132q-15 21 8 33m3 37 14 19'),
 tunnel:line('M-75 250V156q75-110 150 0v94m-124 0v-84q49-75 98 0v84M-75 195h26m97 0h27m-40-78 19-17m-56 11v-24m-34 33-17-17'),
 pipe:line('M-57 250V155h94v-46M-42 250v-80h94v-61M-62 209h25m-7-36v-23m56-1v26'),
 crack:line('M-70 250l25-22-9-18 32-25-11-20 35-22m-30 42 32 14 17-9 48 29'),
 valley:line('M-80 178l43-62 39 53 34-53 45 65M-80 245q42-97 80-44t80 44'),
 camp:line('M-61 241l32-77 40 76zM-39 238l11-48 14 50M17 248h61m-7-11-48 16m-2-17 46 15'),
 fire:line('M-23 233q-30-29 0-48 3 26 13 27-9-46 16-74-4 40 20 57 16 37-13 43z'),
 portal:'<ellipse cx="0" cy="168" rx="56" ry="82"/><ellipse cx="0" cy="168" rx="43" ry="70"/>'+line('M-32 131q55-30 60 20t-55 19 55 28m-80-81-13-7m110 87 15 8m-22-99 12-12'),
 clock:'<circle cx="0" cy="177" r="49"/><circle cx="0" cy="177" r="40"/>'+line('M0 147v30l22 17M0 135v8m0 69v8m-42-43h8m67 0h9'),
 workshop:line('M-72 211H72v13H-72zm8 13v27m126-27v27M-70 146H70m-120-23v22m26-33v33m28-22v22m29-36v36m27-22v22'),
 machine:line('M-58 250v-75h116v75zM-42 194h26v26h-26zm57-1h27v27H15zM-21 177v-28h42v28m-40-28v-20h38v20M-40 236h80m-69-73-17-20m92 20 17-20'),
 council:'<ellipse cx="0" cy="210" rx="74" ry="33"/>'+line('M-60 208q60-44 120 0M-42 226v24m84-24v24')+[-60,-30,0,30,60].map(x=>`<circle cx="${x}" cy="156" r="10"/><path d="M${x-10} 171v20m20-20v20"/>`).join(''),
 shield:line('M0 144l44 15v35q0 35-44 55-44-20-44-55v-35zM0 157v74m-27-48h54'),
 staff:line('M0 251V137l-16-16 16-27 16 27-16 16M-10 118h20'),
 flask:line('M-12 150h24v42l30 43q4 11-9 11h-66q-13 0-9-11l30-43zM-10 160h20m-40 62h60'),
 heart:line('M0 221l-40-39q-17-30 10-39 20-6 30 15 10-21 30-15 27 9 10 39z'),
 ron:'<circle cx="0" cy="150" r="24"/>'+line('M-27 150h54m-18-25v-7H-9v7M-40 250l10-66 24-10 12 0 24 10 10 66m-58-61v60m36-60v60m-16-22 16-21m-16 10 7 7m-37-31-14 42'),
 rick:line('M-22 150l-12-20 17 4-7-22 18 12 6-25 8 25 19-12-9 22 17-1-13 19M-25 149q0 42 25 42t25-42M-15 155h11m8 0h11m-23 19h16M-10 191l-16 10-14 49h80l-13-49-17-10M-12 193l12 28 12-28m-12 28v27'),
 ari:line('M-23 140q23-28 46 0v25q-23 42-46 0zM-26 145h52M-12 182l-23 16-10 52h90l-11-52-22-16M-12 186l12 24 12-24M-25 214h50m-32 12v18m15-18v18'),
 indigo:line('M-33 196q-21-73 33-75 54 2 33 75M-23 151q23-15 46 0v19q-23 36-46 0M-14 184l-18 17-15 49h94l-15-49-18-17m-33 32 19 16 19-16')+'<circle cx="0" cy="218" r="11"/>',
 thomas:line('M-40 151l40-63 40 63zM-20 152q20 57 40 0m-40 5 20 37 20-37M-15 181l-22 25-10 44h94l-10-44-22-25m-12 26v43'),
 severus:line('M-29 179q-13-67 29-57 42-10 29 57M-22 146v22q22 33 44 0v-22m-32 7h6m12 0h6M-10 185l-23 15-15 50h96l-15-50-23-15M0 191v59m-30-40 30 16 30-16'),
 wesker:line('M-25 140l9-17h37l7 17v28q-28 35-53 0zM-24 151h19v10h-19zm29 0h19v10H5zm-10 5H5M-13 185l-22 13-12 52h94l-12-52-22-13M-13 185l13 36 13-36m-13 36v29'),
 iara:line('M-33 183q-20-70 33-65 53-5 33 65M-21 143q21-12 42 0v27q-21 29-42 0M-12 184l-22 17-13 49h94l-13-49-22-17M-30 229q30-16 60 0m-41-31h22m-11-10v20'),
 homelander:line('M-25 141q25-36 50 0v25q-25 34-50 0M-24 149h16m16 0h16M-12 184l-29 14-15 52h112l-15-52-29-14M-12 190l12 20 12-20m-39 20h54m-45 15h36M-41 199l-30 51m112-51 30 51'),
 elias:line('M-25 142l25-22 25 22v27l-25 22-25-22zM-24 151h16m16 0h16M-10 190l-24 11-19 49h106l-19-49-24-11M-24 212l24-13 24 13-24 29z'),
 apprentice:line('M-22 146l5-18h34l5 18v24q-22 29-44 0M-14 153h8m12 0h8M-12 184l-20 15-9 51h82l-9-51-20-15M-17 197v53m34-53v53m-34-32h34'),
 lira:line('M-30 178q-12-62 30-61 42-1 30 61M-20 142v28q20 32 40 0v-28M-12 181l-24 20-10 49h92l-10-49-24-20M-12 191l12 30 12-30m-37 45h50'),
 ship:line('M-75 209l24-47h91l35 47-22 29H-48zM-49 182h87l15 21h-110zM-34 187v12m29-12v12m29-12v12M-61 212h121m-108 33-15 9m101-9 15 9'),
 garden:line('M-66 249q66-65 132 0M-43 237v-37m86 37v-37M-42 213q-28-10-19-28 19 0 19 16 0-16 19-16 9 18-19 28m85 0q-28-10-19-28 19 0 19 16 0-16 19-16 9 18-19 28'),
 sun:'<circle cx="0" cy="139" r="25"/>'+line('M0 97V83m0 113v-14m-43-43h-14m114 0H43m-74-31-10-10m82 82-10-10m-62 0-10 10m82-82-10 10'),
 moon:line('M13 97q-68 48 10 96-72 19-70-41 1-58 60-55z'),
 cloud:line('M-66 155q-20-27 8-42 7-33 35-16 29-36 55-8 37-8 37 29 29 9 15 32z'),
 radio:line('M-43 244v-69h86v69zM-35 172l-15-68m19 83h60v23h-60zm1 34h37')+'<circle cx="24" cy="230" r="7"/>',
 screen:line('M-63 219V128H63v91zM-56 134H56v74H-56zM-10 220v22m20-22v22m-35 4h50M-40 187l15-15 20 6 18-23 28 29'),
 tools:line('M-35 244l44-71q-16-39 17-50l-7 26 18 9 18-20q8 34-21 41l-46 73zM-45 127l20 19 14 68-14 4-14-68-17-20z'),
 toaster:line('M-49 237v-58q0-14 14-14h70q14 0 14 14v58zM-36 160v-10h71v10m-61 26h45m-57 17h46M53 191h9v26m-105 25v8m78-8v8'),
 robot:'<rect x="-27" y="141" width="54" height="39" rx="9"/>'+line('M0 141v-15m-14 35h7m14 0h7M-21 182v39h42v-39m-50 8-15 24m74-24 15 24m-58 7v29m25-29v29'),
 cup:line('M-24 209h48l-5 36h-37zM25 215q27 0 11 20H21M-14 196q-7-15 2-23m14 23q-7-15 2-23'),
 card:line('M-46 177h92v57h-92zM-29 192h17v21h-17zm34 1h28m-28 14h28m-61 14h61'),
 circle:'<circle cx="0" cy="186" r="38"/>'+line('M-23 157l9 15m28 22 10 20M-24 212l16-21m17-34 9 16M-43 229l86-86'),
 lock:line('M-29 248v-52h58v52zM-20 196v-30q20-38 40 0v30M0 216v14')+'<circle cx="0" cy="215" r="6"/>',
 tear:line('M-20 139l16 23-18 25 24 20-12 27m18-95 13 21-14 24 25 24-12 28'),
 stair:line('M-62 250h24v-26h25v-26h25v-26h25v-26h25'),
 shelter:line('M-75 244v-69l75-58 75 58v69M-80 177l80-66 80 66M-12 244v-44h24v44m-62-53h22v24h-22zm78 0h22v24H28z'),
 plank:line('M-69 213l138-40 7 25-138 39zM-51 219l7 13m15-20 7 13m15-20 7 13m15-20 7 13m15-20 7 13'),
 rope:line('M-39 124q-38 46 0 70t6 63M23 126q-23 57 8 78t-8 49'),
 wall:line('M-69 248V126H69v122M-69 160H69m-138 36H69m-138 36H69m-94-106v34m47-34v34m-70 0v36m47-36v36m-23 0v36m46-36v36'),
 shadow:line('M-27 246q-37-38-15-78t51-29q39 13 32 50t-30 60M-14 172h7m15 0h7m-16 21h10'),
 operator:line('M-23 145q23-32 46 0v25q-23 29-46 0M-22 151h15m14 0h15M-12 187l-21 13-12 50h90l-12-50-21-13M-26 221l26 13 26-13'),
 coil:line('M-50 242v-70q10-20 20 0v70q10 19 20 0v-70q10-20 20 0v70q10 19 20 0v-70q10-20 20 0v70'),
 lightning:line('M16 106l-55 90h35l-14 55 58-94H4z'),
 stars:line('M-37 121v22m-11-11h22M34 164v26m-13-13h26M-20 214v18m-9-9h18'),
 chair:line('M-31 206v-70h62v70M-31 200h62v16h-62zm5 16v34m52-34v34m-68-46h13m64 0H31'),
 orb:'<circle cx="0" cy="181" r="41"/>'+line('M-39 177q39-22 78 0m-78 17q39 22 78 0M0 140q-25 41 0 82 25-41 0-82'),
 glasses:line('M-47 173h36v22h-36zm58 0h36v22H11zm-22 9h22m-62-9-13-12m115 12 13-12'),
 crowd:[-36,0,36].map((x,i)=>`<g transform="translate(${x},${i===1?-15:0}) scale(.65)"><circle cy="176" r="19"/><path d="M-14 197l-15 52h58l-15-52m-14 9v38"/></g>`).join(''),
 shelf:line('M-66 250V142H66v108m-132-63H66m-132 43H66m-109-88v43m23-43v43m23-43v43m24-43v43m22-43v43')
};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
shapes.prism=line('M-40 243L0 140l43 103zM0 140v103m-30-29h58M-65 190l33 10m62-1 37-17');
shapes.market=line('M-65 250v-72h130v72M-72 177l17-35H55l17 35zM-55 177v-35m28 35v-35m28 35v-35m28 35v-35m28 35v-35M-62 224H62m-103-34h20v21h-20zm48 0h23v21H7z');
shapes.gate=line('M-58 250V112h20v138m76 0V112h20v138M-57 129H57m-94 28H37m-74 0v93m74-93v93M-20 157v93m20-93v93m20-93v93');
function render(index,title,label){
 const tokens=motifs[index].split(' '),seed=index+1;
 const ink=['#384d62','#444f69','#55534c','#3b5b59','#4e455c'][index%5];
 const paths=tokens.map((token,i)=>{
  const x=(tokens.length>3?[178,360,470,568]:[185,387,515])[i],scale=(tokens.length>3?[.96,.72,.58,.42]:[1,.75,.6])[i];
  return `<g transform="translate(${x+(seed%7)*2},${290-250*scale}) scale(${scale}) rotate(${((seed+i)%5)-2} 0 180)">${shapes[token]||shapes.stars}</g>`;
 }).join('');
 const hatch=Array.from({length:18},(_,i)=>{const x=35+i*32;const y=305+(seed+i)%7;return `<path d="M${x} ${y}l${9+seed%8} -7"/>`}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350" role="img" aria-label="${escape(label+': '+title)}"><title>${escape(title)}</title><defs><radialGradient id="wash-${index}"><stop stop-color="#d9e4e4" stop-opacity=".8"/><stop offset="1" stop-color="#eee5d5" stop-opacity="0"/></radialGradient></defs><rect width="640" height="350" rx="16" fill="#f6f1e6"/><ellipse cx="${240+seed%9*15}" cy="170" rx="250" ry="146" fill="url(#wash-${index})"/><g fill="none" stroke="${ink}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path opacity=".4" d="M25 302q145-8 280 0t306-3M31 309q180-7 354 0t210-4"/><path opacity=".23" d="M21 21h45m-44 0v30m599-31h-39m39 0v28M20 325h29m-29 0v-28m599 28h-28m28 0v-28"/>${paths}<g opacity=".34" stroke-width="1">${hatch}</g></g></svg>`;
}
const api={render,motifs};if(typeof module==='object'&&module.exports)module.exports=api;else root.ImperiumSketch=api;
})(typeof window==='object'?window:globalThis);

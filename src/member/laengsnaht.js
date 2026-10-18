/* cuttingforce.app – Längsnahtfräsen (nur für angemeldete Benutzer). Wird vom Worker nur mit gültiger Sitzung ausgeliefert. */
'use strict';
/* Längsnaht-Profil (Achsschnitt): V mit Öffnungswinkel αV und Spitzenradius rR.
   y = Höhe über der Profilspitze (0 … ap), x = axiale Lage (0 = Profilmitte).
   Radiusplatten: links und rechts je eine Hälfte des Spitzenradius bis zum Tangentenpunkt.
   Flankenplatten: entlang jeder Flanke vom Tangentenpunkt bis zur Profilhöhe ap, gleichmäßig verteilt mit Überlappung ≥ ü. */
function lnGeom(f){
 const r=num(f.rR),ap=lnApOf(f),be=rad(num(f.alphaN)/2),lK=num(f.lK),uF=Math.max(0,num(f.uF)||0),dU=Math.max(0,num(f.dU)||0);
 const bad={A:NaN,b:NaN,t:ap,LF:NaN,nF:NaN,segs:[],ok:false};
 if(!(r>0&&ap>0&&be>=0&&be<Math.PI/2))return bad;
 const yt=r*(1-Math.sin(be)),xt=r*Math.cos(be),cb=Math.cos(be);
 const w=y=>y<=yt?Math.sqrt(Math.max(0,r*r-(r-y)*(r-y))):xt+(y-yt)*Math.tan(be);  // halbe Breite
 let A=0;const N=400;for(let k=0;k<N;k++)A+=2*w(ap*(k+.5)/N)*ap/N;               // abgetragener Querschnitt bis ap
 const tW=num(f.tW),hProc=ap+dU,hErf=Math.max(hProc,tW>0?tW:0),lF=lK-2*uF;
 let nF=0,segs=[],err='',LF=0,hP=Math.max(hErf,yt);
 if(!(lF>0))err='Die Schneidkantenlänge lK muss größer als 2 · Überlappung ü sein.';
 else if(hErf>yt){nF=Math.ceil((hErf-yt)/(lF*cb)-1e-9);LF=nF*lF;hP=yt+LF*cb;
  for(let i=0;i<nF;i++)segs.push([i*lF,(i+1)*lF]);}                         // Schneidlänge im Einsatz, lückenlos aneinander
 /* Inkremente (rechte Profilhälfte, links spiegelbildlich): Radiusschneide in nR, jede Flankenschneide in nF,i Abschnitte.
    κ = lokaler Einstellwinkel der Schneide (90° an der Spitze, β = αV/2 an der Flanke), y = Höhe über der Spitze, ds = Schneidenlänge. */
 const nR=Math.max(1,Math.round(num(f.nIR))||1),nI=Math.max(1,Math.round(num(f.nIF))||1),inc=[];
 const tE=Math.PI/2-be,arcL=r*tE;
 for(let k=0;k<nR;k++){const t0=tE*k/nR,t1=tE*(k+1)/nR,tm=(t0+t1)/2;
  inc.push({pl:'R',k:k+1,y0:r*(1-Math.cos(t0)),y1:r*(1-Math.cos(t1)),x:r*Math.sin(tm),y:r*(1-Math.cos(tm)),ds:arcL/nR,kap:90-tm*180/Math.PI});}
 segs.forEach(([a,b],i)=>{for(let k=0;k<nI;k++){const s0=a+(b-a)*k/nI,s1=a+(b-a)*(k+1)/nI,sm=(s0+s1)/2;
  inc.push({pl:'F'+(i+1),k:k+1,y0:yt+s0*cb,y1:yt+s1*cb,x:xt+sm*Math.sin(be),y:yt+sm*cb,ds:(b-a)/nI,kap:be*180/Math.PI});}});
 inc.forEach(q=>{q.inCut=q.y0<ap-1e-9;q.dsCut=q.inCut?q.ds*Math.min(1,(ap-q.y0)/Math.max(1e-12,q.y1-q.y0)):0;});
 return {A,b:2*w(ap),t:ap,yt,xt,r,be,ap,tW,hProc,hErf,hP,lF,lK,uF,LF,nF,segs,w,err,ok:!err,tipOnly:hErf<=yt,inc,nR,nI,arcL,dsR:arcL/nR,dsF:lF/nI,nInc:2*inc.length,nIncCut:2*inc.filter(q=>q.inCut).length};}
/* Längsnaht: Schnittaufteilung – Anzahl der Schnitte, Schnitttiefen t_k (von der Blechoberfläche) und Zahnvorschub je Schnitt */
function lnCuts(f){const n=Math.max(1,Math.min(10,Math.round(num(f.nCuts))||1)),T=String(f.cutT||'').split(';'),F=String(f.cutVf||'').split(';'),zc=num(f.z),nn=num(f.vc)*1000/(Math.PI*num(f.Dc)),list=[];let ok=true,prev=0;
 for(let k=0;k<n;k++){const t=num(T[k]),vf=num(F[k]),fz=vf/(zc*nn);if(!(t>prev))ok=false;list.push({k,t,tp:k?list[k-1].t:0,d:t-(k?list[k-1].t:0),vf,fz,tRaw:T[k]??'',vfRaw:F[k]??''});if(t>0)prev=t;}
 const tMax=Math.max(0,...list.map(c=>c.t>0?c.t:0));return {n,list,ok,tMax};}
const lnApOf=f=>{const C=lnCuts(f);return C.tMax>0?C.tMax:num(f.ap);};
const lnSel=f=>Math.max(0,Math.min(lnCuts(f).n-1,Math.round(num(f.lnCut))||0));
function lnArea(G,t){if(!(t>0)||!G.w)return 0;let A=0;const N=300;for(let k=0;k<N;k++)A+=2*G.w(t*(k+.5)/N)*t/N;return A;}
/* Radiale Eingriffstiefe einer Schneidenstelle in Höhe y über der Profilspitze beim Schnitt k:
   das Profil des Vorschnitts ist dasselbe Profil um Δ = t_k − t_(k−1) höher → a_e = min(Δ, t_k − y) */
const lnAe=(c,y)=>c&&c.t>y?Math.min(c.d,c.t-y):0;
/* Abgeleitete Werte der Schnitttabelle aktualisieren, ohne die Eingabefelder neu zu zeichnen (Fokus bleibt) */
function lnCutsCells(f){const C=lnCuts(f),G=lnGeom(f),st=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
 C.list.forEach(c=>{st('ln-cd-'+c.k,c.d>0?fmt(c.d,1):'–');st('ln-cf-'+c.k,c.fz>0?fmt(c.fz,3):'–');st('ln-ca-'+c.k,c.t>0&&G.ok?fmt(lnArea(G,c.t)-lnArea(G,c.tp),1):'–');});
 const w=document.getElementById('ln-cwarn');if(w)w.hidden=C.ok;st('ln-ctmax',fmt(C.tMax,1));}
function lnCutsHTML(f){const C=lnCuts(f),G=lnGeom(f),z=num(f.z),vc=num(f.vc),D=num(f.Dc),n=vc*1000/(Math.PI*D),sel=lnSel(f);
 const ip=(k,ck,val,lab)=>`<input data-lncut="${k}" data-ck="${ck}" value="${val}" inputmode="decimal" autocomplete="off" style="width:5.5em;padding:5px 6px;border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--fg);font:inherit" aria-label="${lab}">`;
 return `<div class="lbl" style="margin:6px 0 4px">Schnittaufteilung</div>
 <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:6px">Anzahl der Schnitte <select data-lnncut="1" style="padding:6px 8px;border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--fg);font:inherit">${[1,2,3,4,5,6,7,8,9,10].map(v=>`<option ${v===C.n?'selected':''}>${v}</option>`).join('')}</select></label>
 <div class="tbl-wrap"><table class="lnzt"><thead><tr><th>Schnitt</th><th>Tiefe t<sub>k</sub> (mm)</th><th>Zustellung Δ (mm)</th><th>v<sub>f,k</sub> Fräser (mm/min)</th><th>f<sub>z,k</sub> (mm/Z)</th><th>A<sub>k</sub> (mm²)</th></tr></thead><tbody>
 ${C.list.map(c=>`<tr${c.k===sel?' style="background:var(--surface-2)"':''}><td>${c.k+1}</td><td>${ip(c.k,'t',c.tRaw,'Schnitttiefe '+(c.k+1))}</td><td id="ln-cd-${c.k}">${c.d>0?fmt(c.d,1):'–'}</td><td>${ip(c.k,'vf',c.vfRaw,'Vorschubgeschwindigkeit Schnitt '+(c.k+1))}</td><td id="ln-cf-${c.k}">${c.fz>0?fmt(c.fz,3):'–'}</td><td id="ln-ca-${c.k}">${c.t>0&&G.ok?fmt(lnArea(G,c.t)-lnArea(G,c.tp),1):'–'}</td></tr>`).join('')}
 </tbody></table></div>
 <p class="warn" id="ln-cwarn" style="margin:4px 0 0"${C.ok?' hidden':''}>Die Schnitttiefen müssen von Schnitt zu Schnitt zunehmen.</p>
 <p class="note" style="margin:4px 0 0">Tiefen von der Blechoberfläche gemessen. Das Profil ist für den tiefsten Schnitt (<span id="ln-ctmax">${fmt(C.tMax,1)}</span> mm) + Δü ausgelegt. A<sub>k</sub> = abgetragener Querschnitt des Schnitts (Nut bei t<sub>k</sub> minus Nut des Vorschnitts). Vorschub als Vorschubgeschwindigkeit des Fräsers v<sub>f,k</sub>; daraus f<sub>z,k</sub> = v<sub>f,k</sub> / (z · n) und je Plattenreihe f<sub>z,i</sub> = v<sub>f,k</sub> / (n · z<sub>i</sub>).</p>`;}
/* Längsnaht: Zähnezahl je Plattenreihe. Reihe 1 = Radiusplatten, Reihe 2 … = Flankenplatten F1, F2, …
   Regel: von der Spitze nach außen nicht steigend – keine Reihe hat mehr Zähne als die Reihe darunter, und keine mehr als der Fräser (z). */
function lnRows(f){const G=lnGeom(f);return G.ok&&!G.tipOnly?['Radius'].concat(G.segs.map((_,i)=>'F'+(i+1))):['Radius'];}
/* Zähnezahl je Reihe und Seite (L = links, R = rechts), gespeichert in zRows (links) und zRowsR (rechts) */
const LN_ZK={L:'zRows',R:'zRowsR'},LN_PK={L:'phRows',R:'phRowsR'};
const lnMid=f=>String(f.lnMid??'1')==='1';   // linke Platten genau mittig zwischen den rechten
function lnZ(f,side='L'){if(side==='R'&&lnMid(f))side='L';const names=lnRows(f),zc=Math.round(num(f.z)),saved=String(f[LN_ZK[side]]||'').split(';').map(v=>Math.round(num(v)));
 const out=[];names.forEach((nm,i)=>{let v=Number.isFinite(saved[i])&&saved[i]>0?saved[i]:(i?out[i-1]:zc);
  if(zc>0&&v>zc)v=zc;if(i&&Number.isFinite(out[i-1])&&v>out[i-1])v=out[i-1];out.push(Number.isFinite(v)&&v>0?v:NaN);});
 return names.map((nm,i)=>({nm,z:out[i]}));}
function lnSetZ(f,side,idx,val){const rows=lnZ(f,side),zc=Math.round(num(f.z)),sn=side==='L'?'links':'rechts';let v=Math.round(num(val)),msg='';
 if(!(v>0)){v=idx?rows[idx-1].z:(zc>0?zc:NaN);msg='Ungültige Zähnezahl – Wert der Reihe darunter übernommen';}
 if(zc>0&&v>zc){v=zc;msg=`Höchstens ${zc} Zähne (Zähnezahl des Fräsers)`;}
 if(idx&&rows[idx-1].z>0&&v>rows[idx-1].z){v=rows[idx-1].z;msg=`${rows[idx].nm} ${sn} darf nicht mehr Zähne haben als ${rows[idx-1].nm} ${sn} (${v})`;}
 rows[idx].z=v;let cut=0;for(let j=idx+1;j<rows.length;j++)if(rows[j].z>v){rows[j].z=v;cut++;}
 if(cut&&!msg)msg=`${cut} äußere Reihe${cut>1?'n':''} ${sn} auf ${v} Zähne begrenzt`;
 f[LN_ZK[side]]=rows.map(r=>Number.isFinite(r.z)?r.z:'').join(';');return msg;}
function lnZHTML(f){const A=lnAng(f),zc=Math.round(num(f.z)),fz=(lnCuts(f).list[lnSel(f)]||{}).fz,kS=lnSel(f)+1;
 const inp=(attr,i,side,val,lab,mode)=>`<input ${attr}="${i}" data-side="${side}" value="${val}" inputmode="${mode}" autocomplete="off" style="width:4.2em;padding:5px 6px;border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--fg);font:inherit" aria-label="${lab}">`;
 const pv=z=>z>0?fmt(360/z,2):'–',fv=z=>z>0&&zc>0&&fz>0?fmt(fz*zc/z,3):'–';
 return `<div class="lbl" style="margin-top:4px">Zähnezahl und Teilung je Plattenreihe – L = links, R = rechts</div>
 <p class="note" style="margin:2px 0 6px">Reihe 1 sind die Radiusplatten, danach die Flankenplatten von innen nach außen. Links und rechts haben eigene Zähnezahlen und damit eigene Teilungen. Je Seite gilt: eine äußere Reihe kann nie mehr Zähne haben als die Reihe darunter – wird eine Reihe verringert, werden alle äußeren Reihen dieser Seite mitbegrenzt.${zc>0?'':' Zähnezahl z des Fräsers eintragen, dann werden die Reihen vorbelegt.'}</p>
 <div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px"><button type="button" class="btn" data-lnmid="1" aria-pressed="${lnMid(f)}">${lnMid(f)?'✓ ':''}Links mittig zwischen rechts</button>${lnMid(f)?'':'<button type="button" class="btn" data-lneq="1">Zähnezahl links = rechts</button>'}<button type="button" class="btn" data-lnspread="1">Gleichmäßig aufteilen</button></div>
 <style>.lnzt th,.lnzt td{padding:6px 5px!important;font-size:13px;white-space:nowrap}</style>${lnMid(f)?`<div class="tbl-wrap"><table class="lnzt"><thead><tr><th>Reihe</th><th>z<sub>i</sub> (L = R)</th><th>Teilung (°)</th><th>f<sub>z,i</sub> S${kS} (mm)</th><th>φ<sub>0,i</sub> L (°)</th><th>φ<sub>0,i</sub> R (°)</th></tr></thead><tbody>
 ${A.rows.map((r,i)=>`<tr><td>${i+1} ${r.nm}</td><td>${inp('data-zrow',i,'L',Number.isFinite(r.zL)?r.zL:'','Zähnezahl '+r.nm,'numeric')}</td><td>${pv(r.zL)}</td><td>${fv(r.zL)}</td><td>${lnLockBtn(f,i,'L')}${inp('data-phrow',i,'L',dec(r.phL,3),'Winkelversatz '+r.nm+' links','decimal')}</td><td>${fmt(((r.phR%360)+360)%360,3)}</td></tr>`).join('')}
 </tbody></table></div>`:`<div class="tbl-wrap"><table class="lnzt"><thead><tr><th>Reihe</th><th>z<sub>i</sub> L</th><th>z<sub>i</sub> R</th><th>Teilung L / R (°)</th><th>f<sub>z,i</sub> L / R S${kS} (mm)</th><th>φ<sub>0,i</sub> L (°)</th><th>φ<sub>0,i</sub> R (°)</th></tr></thead><tbody>
 ${A.rows.map((r,i)=>`<tr><td>${i+1} ${r.nm}</td><td>${inp('data-zrow',i,'L',Number.isFinite(r.zL)?r.zL:'','Zähnezahl '+r.nm+' links','numeric')}</td><td>${inp('data-zrow',i,'R',Number.isFinite(r.zR)?r.zR:'','Zähnezahl '+r.nm+' rechts','numeric')}</td><td>${pv(r.zL)} / ${pv(r.zR)}</td><td>${fv(r.zL)} / ${fv(r.zR)}</td><td>${lnLockBtn(f,i,'L')}${inp('data-phrow',i,'L',dec(r.phL,3),'Winkelversatz '+r.nm+' links','decimal')}</td><td>${lnLockBtn(f,i,'R')}${inp('data-phrow',i,'R',dec(r.phR,3),'Winkelversatz '+r.nm+' rechts','decimal')}</td></tr>`).join('')}
 </tbody></table></div>`}
 <p class="note" style="margin:4px 0 0">f<sub>z,i</sub> = v<sub>f</sub> / (n · z<sub>i</sub>) mit v<sub>f</sub> des gewählten Schnitts: Die Vorschubgeschwindigkeit ist für alle Reihen gleich, eine Reihe mit weniger Zähnen bekommt je Platte einen größeren Vorschub. Winkellage der Platte j: θ = φ<sub>0,i</sub> + (j−1)·360°/z<sub>i</sub>, je Seite mit eigener Teilung. ${lnMid(f)?'„Links mittig zwischen rechts“: rechts hat dieselbe Zähnezahl wie links und liegt genau eine halbe Teilung weiter (φ<sub>0,R</sub> = φ<sub>0,L</sub> + Teilung/2).':'Vorgabe φ<sub>0</sub> rechts = φ<sub>0</sub> links + halbe Teilung rechts.'} „Gleichmäßig aufteilen“ wählt Reihe für Reihe den Winkelversatz mit dem größten Mindestabstand zu allen übrigen Platten (alle Reihen, links und rechts) – so ist am Beginn alles gut verteilt. 0° = Bezugsmarke, gezählt in Drehrichtung.</p>`;}
/* Winkellage aller Platten: Reihe i, Seite L/R, Platte j */
/* Gleichmäßige Aufteilung: Reihe für Reihe den Winkelversatz wählen, der den kleinsten Winkelabstand
   zu allen bereits gesetzten Platten (alle Reihen, links und rechts) möglichst groß macht. Ergebnis wird zwischengespeichert. */
const LN_SPC={};
function lnSpreadCalc(zL,zR,mid){const key=zL.join(',')+'|'+zR.join(',')+'|'+mid;if(LN_SPC[key])return LN_SPC[key];
 const placed=[],L=[],Rr=[],N=x=>((x%360)+360)%360,dist=(a,b)=>{const d=Math.abs(N(a-b));return Math.min(d,360-d);};
 const score=pos=>{let m=360;for(const a of pos)for(const b of placed){const d=dist(a,b);if(d<m)m=d;}return m;};
 const best=(z,extra)=>{if(!(z>0))return 0;const p=360/z,steps=240;let bv=-1,bp=0;
  for(let k=0;k<steps;k++){const ph=p*k/steps,pos=[];for(let j=0;j<z;j++)pos.push(ph+j*p);if(extra)extra(ph).forEach(x=>pos.push(x));
   const sc=placed.length?score(pos):0;if(sc>bv+1e-9){bv=sc;bp=ph;}if(!placed.length)break;}
  return bp;};
 zL.forEach((z,i)=>{
  if(mid){const p=z>0?360/z:0,ph=best(z,x=>Array.from({length:z},(_,j)=>x+p/2+j*p));L.push(ph);Rr.push(ph+p/2);
   for(let j=0;j<z;j++){placed.push(ph+j*p);placed.push(ph+p/2+j*p);}}
  else{const ph=best(z);L.push(ph);for(let j=0;j<z;j++)placed.push(ph+j*360/z);
   const zr=zR[i],pr=best(zr);Rr.push(pr);for(let j=0;j<zr;j++)placed.push(pr+j*360/zr);}});
 return LN_SPC[key]={L,R:Rr};}
function lnAng(f){const ZL=lnZ(f,'L'),ZR=lnZ(f,'R'),pL=String(f.phRows||'').split(';'),pR=String(f.phRowsR||'').split(';');
 /* Vorgabe „gleichmäßig aufgeteilt“: Reihe i um i/(2n) einer Teilung versetzt, rechts eine halbe Teilung weiter –
    so liegen alle Platten (alle Reihen, links und rechts) gleichmäßig verteilt */
 const mid=lnMid(f),SP=lnSpreadCalc(ZL.map(r=>r.z),ZR.map(r=>r.z),mid);
 const rows=ZL.map((r,i)=>{const zL=r.z,zR=ZR[i].z,pLv=zL>0?360/zL:0,a=num(pL[i]),b=num(pR[i]);
  const phL=Number.isFinite(a)?a:SP.L[i],phR=mid?phL+pLv/2:(Number.isFinite(b)?b:SP.R[i]);
  return {nm:r.nm,zL,zR,phL,phR};});
 const ins=[],N=x=>((x%360)+360)%360;
 rows.forEach((r,i)=>{if(r.zL>0)for(let j=0;j<r.zL;j++)ins.push({i,nm:r.nm,side:'L',j:j+1,ang:N(r.phL+j*360/r.zL)});
  if(r.zR>0)for(let j=0;j<r.zR;j++)ins.push({i,nm:r.nm,side:'R',j:j+1,ang:N(r.phR+j*360/r.zR)});});
 return {rows,ins};}
function lnSetAng(f,key,idx,val){const n=lnRows(f).length,a=String(f[key]||'').split(';');while(a.length<n)a.push('');a[idx]=String(val).trim();f[key]=a.slice(0,n).join(';');}
let LN_DEPTH=null,LN_ROT=0,LN_VIEW='beide',LN_PLAY=false,LN_MAT=false,LN_T=0;
function lnSimHTML(){return `<div class="lbl" style="margin-top:4px">Rotationssimulation – Eingriffsbereich des Fräsers</div>
 <div class="toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 8px">
  
  <button type="button" class="btn" data-lnplay="1">${LN_PLAY?'❚❚ Pause':'▶ Drehen'}</button>
  <label style="display:flex;align-items:center;gap:6px;flex:1;min-width:180px;font-size:13px">Drehwinkel <input type="range" min="0" max="360" step="0.5" value="${LN_ROT}" data-lnrot="1" style="flex:1"><span id="ln-rotv">${fmt(LN_ROT,1)}°</span></label>
  <div id="ln-cutsel" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:1 1 100%;font-size:13px"></div>
  <button type="button" class="btn" data-lnmat="1">${LN_MAT?'Positionsmatrix ausblenden':'Positionsmatrix anzeigen'}</button>
 </div><div id="ln-powctl">${LN_CTL}</div><div id="ln-simsvg"></div>`;}
function lnDrawSim(){const f=S.forms.laengsnaht,el=document.getElementById('ln-simsvg');if(!el)return;
 const G=lnGeom(f),A=lnAng(f),DS=num(f.Dc),ap=lnApOf(f),C=lnCuts(f),ks=lnSel(f),cu=C.list[ks];
 {const cs=document.getElementById('ln-cutsel');if(cs)cs.innerHTML='Angezeigter Schnitt: '+C.list.map(c=>`<button type="button" class="chip-btn" data-lnsel="${c.k}" aria-pressed="${c.k===ks}">Schnitt ${c.k+1}${c.t>0?' · '+fmt(c.t,0)+' mm':''}</button>`).join('');}
 if(!(DS>0&&ap>0&&G.ok&&cu&&cu.t>0&&cu.d>0)){el.innerHTML='<p class="note">Fräserdurchmesser Dc, Profil und die Schnitttiefen (zunehmend) eintragen.</p>';return;}
 /* Alles maßstäblich: Koordinaten in mm um die Fräserachse, X = Lage quer, Y nach unten; Winkel θ von oben in Drehrichtung */
 const RS=DS/2,cb=Math.cos(G.be);let mir=1,near='L';
 const COL=['#b3261e','#2e7d32','#7a5a00','#1d5fc4','#6a1b9a','#00838f','#ad1457','#5d4037'];
 const t=cu.t,tp=cu.tp;
 const yLow=i=>i===0?0:G.yt+G.segs[i-1][0]*cb, yHigh=i=>i===0?G.yt:G.yt+G.segs[i-1][1]*cb, yMid=i=>(yLow(i)+yHigh(i))/2;
 /* Eingriffswinkel einer Schneidenstelle (Höhe y) aus der radialen Eingriffstiefe a_e gegenüber dem vorgeschnittenen Profil */
 const phY=y=>{const ae=lnAe(cu,y);if(!(ae>0))return 0;return Math.acos(Math.max(-1,Math.min(1,1-ae/(RS-y))))*180/Math.PI;};
 const phRow=i=>{let m=0;const a=yLow(i),b=Math.min(yHigh(i),t);for(let q=0;q<=20;q++){const v=phY(a+(b-a)*q/20);if(v>m)m=v;}return m;};
 const PT=(r,deg)=>{const q=deg*Math.PI/180;return [mir*r*Math.sin(q),-r*Math.cos(q)];};
 const ENG=new Set();let eng=0;
 const INS=A.ins.map(q=>{const a=(((q.ang+LN_ROT)%360)+360)%360,ph=phRow(q.i),on=ph>0&&a>=180-ph&&a<=180;if(on){eng++;ENG.add(q.i+q.side+q.j);}return {...q,a,on};});
 /* eine Ansicht: Maßstab k (px/mm), Ursprung (ox, oy) in px */
 const view=(W,H,k,ox,oy,detail)=>{const S=([x,y])=>[ox+x*k,oy+y*k],f1=v=>v.toFixed(1);let g='';
  const ys=oy+(RS-t)*k;
  g+=`<rect x="0" y="${f1(ys)}" width="${W}" height="${f1(Math.max(0,H-ys))}" fill="var(--surface-2)"/><line x1="0" y1="${f1(ys)}" x2="${W}" y2="${f1(ys)}" stroke="var(--fg)" stroke-width="1"/>`;
  if(tp>0){const yp=oy+(RS-t+tp)*k;g+=`<rect x="0" y="${f1(ys)}" width="${W}" height="${f1(yp-ys)}" fill="var(--surface)" fill-opacity=".55"/><line x1="0" y1="${f1(yp)}" x2="${W}" y2="${f1(yp)}" stroke="var(--fg)" stroke-width="1" stroke-dasharray="6 3"/>`;
   if(detail)g+=`<text x="${mir>0?8:W-8}" y="${f1(yp-5)}" font-size="11" text-anchor="${mir>0?'start':'end'}" fill="var(--fg)" style="paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round">Nutgrund Vorschnitt (Schnitt ${ks}, t = ${fmt(tp,1)} mm)</text>`;}
  g+=`<circle cx="${f1(ox)}" cy="${f1(oy)}" r="${f1((RS-G.hP)*k)}" fill="var(--surface)" stroke="var(--fg)" stroke-width="1"/>`;
  A.rows.forEach((r,i)=>{g+=`<circle cx="${f1(ox)}" cy="${f1(oy)}" r="${f1((RS-yMid(i))*k)}" fill="none" stroke="${COL[i%COL.length]}" stroke-opacity=".35" stroke-width=".8"/>`;
   const ph=phRow(i);if(ph>0){const rr=(RS-yMid(i))*k,p1=S(PT(RS-yMid(i),180)),p2=S(PT(RS-yMid(i),180-ph));
    g+=`<path d="M${f1(p1[0])} ${f1(p1[1])} A${f1(rr)} ${f1(rr)} 0 0 ${mir>0?0:1} ${f1(p2[0])} ${f1(p2[1])}" fill="none" stroke="${COL[i%COL.length]}" stroke-opacity=".3" stroke-width="${detail?14:8}"/>`;}});
  const sw=detail?5:3;
  INS.forEach(q=>{const i=q.i,p1=S(PT(RS-yLow(i),q.a)),p2=S(PT(RS-yHigh(i),q.a)),col=COL[i%COL.length],isN=q.side===near;
   if(q.on)g+=`<line x1="${f1(p1[0])}" y1="${f1(p1[1])}" x2="${f1(p2[0])}" y2="${f1(p2[1])}" stroke="var(--fg)" stroke-width="${sw+3}"/>`;
   if(near==='*'){/* alle Platten voll: links gefüllt, rechts umrandet */
    g+=`<line x1="${f1(p1[0])}" y1="${f1(p1[1])}" x2="${f1(p2[0])}" y2="${f1(p2[1])}" stroke="${col}" stroke-width="${sw+1}"/>`;
    if(q.side==='R')g+=`<line x1="${f1(p1[0])}" y1="${f1(p1[1])}" x2="${f1(p2[0])}" y2="${f1(p2[1])}" stroke="var(--surface)" stroke-width="${Math.max(1,sw-2)}"/>`;}
   else g+=`<line x1="${f1(p1[0])}" y1="${f1(p1[1])}" x2="${f1(p2[0])}" y2="${f1(p2[1])}" stroke="${col}" stroke-width="${sw}" stroke-opacity="${isN?1:.55}" ${isN?'':'stroke-dasharray="2 1.5"'}/>`;});
  /* Reihenbeschriftung am Bildrand auf dem Flugkreis der Reihe: Name und Zähnezahl links/rechts */
  if(detail){const xe=mir>0?W-5:5,top=12,bot=H-36,lab=[];
   A.rows.forEach((r,i)=>{const rr=(RS-yMid(i))*k,dx=xe-ox;let x=xe,y=NaN;
    if(rr>Math.abs(dx))y=oy+Math.sqrt(rr*rr-dx*dx);
    if(!(y<=bot)||!Number.isFinite(y)){return;}
    if(y<top){const dy=top-oy;if(rr>Math.abs(dy)){x=ox+mir*Math.sqrt(rr*rr-dy*dy)-mir*4;y=top;}else return;}if(x!==xe)y=top;
    const zt=(Number.isFinite(r.zL)?r.zL:'–')+'/'+(Number.isFinite(r.zR)?r.zR:'–');lab.push({y,x,t:`${r.nm} ${zt}`,c:COL[i%COL.length]});});
   /* oben austretende Kreise: Beschriftungen am oberen Rand nebeneinander ohne Überlappung */
   {const tp=lab.filter(l=>l.x!==xe).sort((a,b)=>mir*(b.x-a.x));let lim=mir>0?xe:-1e9;const W1=l=>l.t.length*5.9+6;
    tp.forEach(l=>{if(mir>0){if(l.x>lim)l.x=lim;lim=l.x-W1(l)-4;}});}
   lab.forEach(l=>{if(l.x===xe&&l.y<top+12)l.y=top+12;});
   lab.sort((a,b)=>a.y-b.y);for(let q=1;q<lab.length;q++)if(lab[q].x===lab[q-1].x&&lab[q].y-lab[q-1].y<11)lab[q].y=lab[q-1].y+11;
   lab.forEach(l=>{if(l.y>bot+6)return;const w=l.t.length*5.9+6,bx=mir>0?l.x-w+3:l.x-3;g+=`<rect x="${f1(bx)}" y="${f1(l.y-5.5)}" width="${f1(w)}" height="12" rx="2" fill="var(--surface)" fill-opacity=".85"/><text x="${f1(l.x)}" y="${f1(l.y+3.5)}" font-size="10" font-weight="600" text-anchor="${mir>0?'end':'start'}" fill="${l.c}" style="paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round">${l.t}</text>`;});}
  return g;};
 const Wz=560,Hz=360;
 const mk=VIEW=>{mir=VIEW==='rechts'?-1:1;near=VIEW==='beide'?'*':VIEW==='links'?'L':'R';if(near!=='*')INS.sort((x,y)=>(x.side===near)-(y.side===near));
 // Nur der Eingriffsbereich – gleicher Maßstab in beiden Richtungen, Durchmesserverhältnisse stimmen
 const phM=Math.max(phRow(0),3),sM=Math.sin(phM*Math.PI/180),xr=RS*sM,hy=Math.max(G.hP,t)+RS*(1-Math.cos(phM*Math.PI/180));
 const k2=Math.min((Wz-40)/(xr*1.25+G.hP*1.5),(Hz-70)/(hy*1.35));
 const zx0=mir*xr*0.42,zy0=RS-hy*0.45,ox2=Wz/2-zx0*k2,oy2=(Hz-30)/2-zy0*k2;
 let g2=view(Wz,Hz,k2,ox2,oy2,true);
 const yS=oy2+(RS-t)*k2;
 g2+=`<text x="${mir>0?8:Wz-8}" y="${(yS-6).toFixed(1)}" font-size="11" text-anchor="${mir>0?'start':'end'}" fill="var(--fg)" style="paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round">Blechoberfläche · Schnitt ${ks+1}: t = ${fmt(t,1)} mm, Δ = ${fmt(cu.d,1)} mm</text>`;
 // Drehrichtung (Pfeil entlang des Flugkreises) und Vorschub
 const rA=RS+6/k2,d1=PT(rA,180+mir*0+ -phM*0.15),d2=PT(rA,180-phM*0.55),S2=([x,y])=>[ox2+x*k2,oy2+y*k2];
 const a1=S2(PT(rA,180-phM*0.95)),a2=S2(PT(rA,180-phM*0.6));
 g2+=`<path d="M${a1[0].toFixed(1)} ${a1[1].toFixed(1)} A${(rA*k2).toFixed(1)} ${(rA*k2).toFixed(1)} 0 0 ${mir>0?1:0} ${a2[0].toFixed(1)} ${a2[1].toFixed(1)}" fill="none" stroke="var(--fg)" stroke-width="1.2" marker-end="url(#lnar2)"/>`;
 const fx=mir>0?Wz-90:90,fy=Hz-46;g2+=`<line x1="${fx-36*mir}" y1="${fy}" x2="${fx+36*mir}" y2="${fy}" stroke="var(--fg)" stroke-width="1.2" marker-end="url(#lnar2)"/><text x="${fx}" y="${fy-7}" font-size="11" text-anchor="middle" fill="var(--fg)">Vorschub v<tspan font-size="8" dy="2">f</tspan></text>`;
 g2+=`<rect x="0" y="${Hz-30}" width="${Wz}" height="30" fill="var(--surface)"/><text x="8" y="${Hz-17}" font-size="12" fill="var(--fg)">${VIEW==='beide'?'Eingriffsbereich, Ansicht von links mit allen Platten · gefüllt: linke, umrandet: rechte Platten':`Eingriffsbereich, Ansicht von ${VIEW} · voll: ${VIEW==='links'?'linke':'rechte'}, gestrichelt: ${VIEW==='links'?'rechte':'linke'} Platten`}</text><text x="8" y="${Hz-4}" font-size="11" fill="var(--muted)">maßstäblich (Ø ${fmt(DS,0)} mm, Profilhöhe ${fmt(G.hP,1)} mm, beide Achsen gleicher Maßstab) · im Eingriff: ${eng} Platten</text>`;
 return g2;};
 const SV=(w,h,body)=>`<svg viewBox="0 0 ${w} ${h}" style="touch-action:pan-y;cursor:grab;width:100%;max-width:560px;height:auto;display:block;margin:0 auto 8px;background:var(--surface);border:1px solid var(--line);border-radius:6px" role="img"><defs><marker id="lnar2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--fg)"/></marker></defs><g>${body}</g></svg>`;
 el.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--muted);margin:0 0 4px"><span>Am rechten Rand: Reihe und Zähnezahl links/rechts auf ihrem Flugkreis · Platten als radiale Striche über ihre Schneidenhöhe · schwarz umrandet: im Eingriff · getönter Bogen: Eingriffsbogen je Reihe</span></div>`+SV(Wz,Hz,mk(LN_VIEW));
 const tabHTML=`<div class="lbl" style="margin:14px 0 4px">Eingriff je Reihe – Schnitt ${ks+1}, Drehwinkel ${fmt(LN_ROT,1)}°</div><div class="tbl-wrap" style="margin-top:4px"><table><thead><tr><th>Reihe</th><th>schneidet ab Tiefe (mm)</th><th>a<sub>e,max</sub> (mm)</th><th>Eingriffsbogen φ<sub>i</sub> (°)</th><th>Eingriffslänge l<sub>e,max</sub> (mm)</th><th>Platten im Eingriff (links / rechts)</th></tr></thead><tbody>${A.rows.map((r,i)=>{const L=A.ins.filter(q=>q.i===i&&q.side==='L'&&ENG.has(i+'L'+q.j)).map(q=>q.j),Rr=A.ins.filter(q=>q.i===i&&q.side==='R'&&ENG.has(i+'R'+q.j)).map(q=>q.j);
  return `<tr${phRow(i)>0?'':' style="opacity:.5"'}><td>${r.nm}</td><td>${fmt(yLow(i),1)}</td><td>${phRow(i)>0?fmt(lnAe(cu,yLow(i)),1):'–'}</td><td>${phRow(i)>0?fmt(phRow(i),2):'–'}</td><td>${phRow(i)>0?fmt((RS-yLow(i))*phRow(i)*Math.PI/180,1):'–'}</td><td>${L.length+Rr.length?`${L.length} (${L.join(', ')||'–'}) / ${Rr.length} (${Rr.join(', ')||'–'})`:'0'}</td></tr>`;}).join('')}</tbody></table></div>
 <details style="margin-top:6px"><summary style="cursor:pointer;font-size:13px">Eingriff je Inkrement – Schnitt ${ks+1} (rechte Profilhälfte, links spiegelbildlich)</summary><div class="tbl-wrap"><table class="lnzt"><thead><tr><th>Platte</th><th>Inkr.</th><th>y (mm)</th><th>κ (°)</th><th>a<sub>e</sub> (mm)</th><th>φ (°)</th><th>l<sub>e</sub> (mm)</th></tr></thead><tbody>${G.inc.map(q=>{const ph=phY(q.y),ae=lnAe(cu,q.y);return `<tr${ph>0?'':' style="opacity:.45"'}><td>${q.pl==='R'?'Radius':q.pl}</td><td>${q.k}</td><td>${fmt(q.y,2)}</td><td>${fmt(q.kap,1)}</td><td>${ae>0?fmt(ae,2):'–'}</td><td>${ph>0?fmt(ph,2):'–'}</td><td>${ph>0?fmt((RS-q.y)*ph*Math.PI/180,1):'–'}</td></tr>`;}).join('')}</tbody></table></div>
 <p class="note">a<sub>e</sub> = min(Δ, t<sub>k</sub> − y): Im Bereich der vorgeschnittenen Nut schneidet jede Stelle nur die Zustellung Δ, darüber bis zur Blechoberfläche. l<sub>e</sub> = (R − y)·arccos(1 − a<sub>e</sub>/(R − y)).</p></details>`;
 {const tb=document.getElementById('ln-simtab');if(tb)tb.innerHTML=tabHTML;}
 lnMark();
 const mt=document.getElementById('ln-mat');
 if(mt){if(!LN_MAT){mt.innerHTML='';}else{const zmax=Math.max(1,...A.rows.map(r=>Math.max(r.zL>0?r.zL:0,r.zR>0?r.zR:0)));
  const line=(r,i,side)=>{const list=A.ins.filter(q=>q.i===i&&q.side===side);return `<tr><td>${r.nm}</td><td>${side==='L'?'links':'rechts'}</td>${Array.from({length:zmax},(_,j)=>{const q=list[j];return q?(ENG.has(i+side+q.j)?`<td style="font-weight:700;background:var(--surface-2)">${fmt(q.ang,2)}</td>`:`<td>${fmt(q.ang,2)}</td>`):'<td></td>';}).join('')}</tr>`;};
  mt.innerHTML=`<div class="lbl" style="margin-top:10px">Positionsmatrix – Winkellage θ (°) jeder Platte, 0° = Bezugsmarke, in Drehrichtung</div><div class="tbl-wrap"><table><thead><tr><th>Reihe</th><th>Seite</th>${Array.from({length:zmax},(_,j)=>`<th>${j+1}</th>`).join('')}</tr></thead><tbody>${A.rows.map((r,i)=>line(r,i,'L')+line(r,i,'R')).join('')}</tbody></table></div><p class="note">${A.ins.length} Platten im Fräser. Fett hinterlegt: im Eingriff bei Drehwinkel ${fmt(LN_ROT,1)}° und Tiefe ${fmt(t,1)} mm.</p>`;}}
}
function lnLoop(t){if(!LN_PLAY)return;const dt=LN_T?Math.min(.1,(t-LN_T)/1000):0;LN_T=t;LN_ROT=(LN_ROT+dt*30)%360;
 const r=document.querySelector('[data-lnrot]');if(r)r.value=LN_ROT;const v=document.getElementById('ln-rotv');if(v)v.textContent=fmt(LN_ROT,1)+'°';lnDrawSim();requestAnimationFrame(lnLoop);}
document.addEventListener('click',e=>{const b=e.target.closest('[data-lnview],[data-lnplay],[data-lnmat],[data-lnap],[data-lnsel],[data-lncalc],[data-lnlock],[data-lnopt],[data-lnapply],[data-lnpq],[data-lnfit],[data-lnzoom],[data-lnsrc],[data-lnsplit],[data-lnedge],[data-lnmid],[data-lnspread],[data-lneq]');if(!b)return;
 if(b.dataset.lnmid||b.dataset.lnspread||b.dataset.lneq){const f=S.forms.laengsnaht;
  if(b.dataset.lneq){f.zRowsR=lnZ(f,'L').map(r=>Number.isFinite(r.z)?r.z:'').join(';');toast('Zähnezahl rechts = links übernommen');}else
  if(b.dataset.lnmid){if(lnMid(f)){const A=lnAng(f);f.zRowsR=A.rows.map(r=>Number.isFinite(r.zL)?r.zL:'').join(';');f.phRowsR=A.rows.map(r=>dec(((r.phR%360)+360)%360,3)).join(';');f.lnMid='0';}else f.lnMid='1';}
  else{f.phRows='';f.phRowsR='';toast('Platten gleichmäßig aufgeteilt');}
  const z=document.getElementById('ln-z');if(z)z.innerHTML=lnZHTML(f);renderOut('laengsnaht');lnDrawSim();save();return;}
 if(b.dataset.lnap)LN_DEPTH=null;
 if(b.dataset.lnlock){const f=S.forms.laengsnaht,k=b.dataset.lnlock,a=String(f.phLock||'').split(',').filter(Boolean),ix=a.indexOf(k);if(ix>=0)a.splice(ix,1);else a.push(k);f.phLock=a.join(',');const z=document.getElementById('ln-z');if(z)z.innerHTML=lnZHTML(f);save();return;}
 if(b.dataset.lnopt){const f=S.forms.laengsnaht,kind=b.dataset.lnopt,lbl=b.textContent;b.disabled=true;b.textContent='Optimiere …';setTimeout(()=>{const t0=performance.now();
  if(kind==='tool'){LN_OPTT=lnToolOpt(f);if(!LN_OPTT.err){lnPowerAll(f);lnRefresh(f);}}else{LN_OPTP=lnProcOpt(f);}
  lnOptRender();b.disabled=false;b.textContent=lbl;toast(`Optimiert in ${Math.round(performance.now()-t0)} ms`);},20);return;}
 if(b.dataset.lnapply){const f=S.forms.laengsnaht,o=LN_OPTP&&LN_OPTP.list.find(x=>x.n===+b.dataset.lnapply);if(!o)return;lnApplyProc(f,o);LN_OPTP.cur=o.n;const cc=document.getElementById('ln-cuts');if(cc)cc.innerHTML=lnCutsHTML(f);lnPowerAll(f);lnRefresh(f);lnOptRender();toast(`${o.n} Schnitte übernommen`);return;}
 if(b.dataset.lncalc){const f=S.forms.laengsnaht;b.disabled=true;b.textContent='Berechne …';setTimeout(()=>{const t0=performance.now();lnPowerAll(f);lnPowRender();renderOut('laengsnaht');b.disabled=false;b.textContent='Berechnen';toast(`Berechnet in ${Math.round(performance.now()-t0)} ms`);},20);return;}
 if(b.dataset.lnpq){LN_PQ=b.dataset.lnpq;lnPowRender();return;}
 if(b.dataset.lnfit){LN_FIT=!LN_FIT;lnPowRender();return;}
 if(b.dataset.lnzoom){LN_ZOOM=+b.dataset.lnzoom;lnPowRender();return;}
 if(b.dataset.lnsrc){LN_SRC=b.dataset.lnsrc;lnPowRender();return;}
 if(b.dataset.lnsplit){LN_SPLIT=!LN_SPLIT;lnPowRender();return;}
 if(b.dataset.lnedge!=null){LN_EDGE=+b.dataset.lnedge;lnPowRender();return;}
 if(b.dataset.lnsel!=null){const f=S.forms.laengsnaht;f.lnCut=b.dataset.lnsel;lnRefresh(f);return;}
 if(b.dataset.lnview){LN_VIEW=b.dataset.lnview;document.querySelectorAll('[data-lnview]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.lnview===LN_VIEW));}
 if(b.dataset.lnplay){LN_PLAY=!LN_PLAY;b.textContent=LN_PLAY?'❚❚ Pause':'▶ Drehen';if(LN_PLAY){LN_T=0;requestAnimationFrame(lnLoop);}}
 if(b.dataset.lnmat){LN_MAT=!LN_MAT;b.textContent=LN_MAT?'Positionsmatrix ausblenden':'Positionsmatrix anzeigen';}
 lnDrawSim();});
/* ===== Leistungsberechnung über eine Umdrehung (Rechenkern) =====
   Je Schneide (Reihe × Seite) wird eine Platte über ihren Winkel a (0…360°, N_φ Schritte) gerechnet:
   je Kanteninkrement: a_e aus dem Vorschnitt, Eingriffsbogen φ_e = arccos(1 − a_e/r), β = 180° − a ∈ [0, φ_e],
   h = f_z,i · sin β · sin κ, F_c = b · k_c1.1 · h^(1−m_c) · (1 − γ₀/100) · K_Vf · K_v(v_c·r/R) · K_ver, M = Σ F_c · r, P = M · ω.
   Die Gesamtkurve entsteht durch Überlagerung aller Platten mit ihrer Winkellage θ (Positionsmatrix).
   Ergebnisobjekt LN_CALC enthält alle Zwischengrößen (je Schneide, je Inkrement, Kurven), damit weitere Größen angezeigt werden können. */
let LN_SPLIT=false,LN_CALC=null,LN_PQ='P',LN_EDGE=0,LN_FIT=true,LN_ZOOM=360,LN_SRC='tot',LN_TRK='';
const lnCalcKey=f=>JSON.stringify(['Dc','rR','dU','alphaN','lK','uF','nIR','nIF','z','zRows','zRowsR','phRows','phRowsR','lnMid','vc','nCuts','cutT','cutVf','g','kc','mc','nPhi'].map(k=>f[k]));
function lnPowerCut(f,k){
 const G=lnGeom(f),A=lnAng(f),C=lnCuts(f),cu=C.list[k],D=num(f.Dc),Rr=D/2,vc=num(f.vc),z=num(f.z),kc11=num(f.kc),mc=num(f.mc),gk=(1-(num(f.g)||0)/100)*kvfOf(f)*kverOf(f);
 const N=Math.max(36,Math.min(7200,Math.round(num(f.nPhi))||720)),da=360/N,n=vc*1000/(Math.PI*D),om=2*Math.PI*n/60;
 const err=!(D>0&&vc>0&&z>0)?'Fräserdurchmesser, Zähnezahl und vc eintragen.':!(kc11>0&&mc>0)?'Werkstoff (kc1.1, mc) wählen.':!(cu&&cu.t>0&&cu.d>0)?'Schnitttiefen (zunehmend) eintragen.':!(cu.vf>0)?`Vorschubgeschwindigkeit v<sub>f</sub> für Schnitt ${k+1} eintragen.`:!G.ok?'Profil prüfen.':'';
 if(err)return {k,err};
 const vf=cu.vf,edges=[];
 A.rows.forEach((row,i)=>{['L','R'].forEach(side=>{const zi=side==='L'?row.zL:row.zR;if(!(zi>0))return;
  const feff=cu.fz*z/zi,pl=i===0?'R':'F'+i,incs=[];
  G.inc.filter(q=>q.pl===pl).forEach(q=>{const top=Math.min(q.y1,cu.t);if(!(top>q.y0))return;const frac=(top-q.y0)/(q.y1-q.y0),b=q.ds*frac,ym=(q.y0+top)/2,ae=lnAe(cu,ym);if(!(ae>0))return;
   const r=Rr-ym,phi=Math.acos(Math.max(-1,Math.min(1,1-ae/r))),sk=Math.sin(q.kap*Math.PI/180);
   const vcl=vc*r/Rr;incs.push({pl:q.pl,k:q.k,y:ym,b,ae,phi:phi*180/Math.PI,r,vcl,kv:kvOf(f,vcl),kap:q.kap,le:r*phi,hmax:feff*Math.sin(Math.min(phi,Math.PI/2))*sk,Fmax:0,Fsum:0});});
  const P=new Float64Array(N),M=new Float64Array(N),F=new Float64Array(N),H=new Float64Array(N);
  for(let j=0;j<N;j++){const be=(180-j*da)*Math.PI/180;if(be<0||be>Math.PI)continue;let m=0,fs=0,hm=0;
   for(const q of incs){if(be>q.phi*Math.PI/180)continue;const h=feff*Math.sin(be)*Math.sin(q.kap*Math.PI/180);if(!(h>0))continue;
    const Fc=q.b*kc11*Math.pow(h,1-mc)*gk*q.kv;m+=Fc*q.r/1000;fs+=Fc;if(Fc>q.Fmax)q.Fmax=Fc;q.Fsum+=Fc;if(h>hm)hm=h;}
   M[j]=m;F[j]=fs;P[j]=m*om/1000;H[j]=hm;}
  let Ps=0,Ms=0,Pmx=0,Mmx=0;for(let j=0;j<N;j++){Ps+=P[j];Ms+=M[j];if(P[j]>Pmx)Pmx=P[j];if(M[j]>Mmx)Mmx=M[j];}
  incs.forEach(q=>{q.Fmean=q.Fsum/N;delete q.Fsum;});
  edges.push({i,side,nm:row.nm,z:zi,feff,incs,P,M,F,H,hmax:Math.max(0,...incs.map(q=>q.hmax)),aemax:Math.max(0,...incs.map(q=>q.ae)),phimax:Math.max(0,...incs.map(q=>q.phi)),
   Pm:Ps/N,Pmax:Pmx,Mm:Ms/N,Mmax:Mmx,Prow:Ps/N*zi});});});
 // Überlagerung aller Platten über den Fräserdrehwinkel ψ
 const Pt=new Float64Array(N),Mt=new Float64Array(N),Ne=new Float64Array(N),Ht=new Float64Array(N);
 const byKey={};edges.forEach(e=>byKey[e.i+e.side]=e);
 A.ins.forEach(q=>{const e=byKey[q.i+q.side];if(!e)return;const o=Math.round(q.ang/da);
  for(let j=0;j<N;j++){const idx=(j+o)%N,pv=e.P[idx];if(pv){Pt[j]+=pv;Mt[j]+=e.M[idx];Ne[j]++;if(e.H[idx]>Ht[j])Ht[j]=e.H[idx];}}});
 let Ps=0,Ms=0,Pmx=0,Mmx=0,Nmx=0,Nsum=0,Pmn=1e18,Mmn=1e18,Nmn=1e9;for(let j=0;j<N;j++){Ps+=Pt[j];Ms+=Mt[j];Nsum+=Ne[j];if(Pt[j]>Pmx)Pmx=Pt[j];if(Mt[j]>Mmx)Mmx=Mt[j];if(Ne[j]>Nmx)Nmx=Ne[j];if(Pt[j]<Pmn)Pmn=Pt[j];if(Mt[j]<Mmn)Mmn=Mt[j];if(Ne[j]<Nmn)Nmn=Ne[j];}
 return {k,t:cu.t,d:cu.d,fz:cu.fz,N,da,n,vf,om,edges,Ht,ins:A.ins.map(q=>({i:q.i,side:q.side,j:q.j,ang:q.ang})),Pt,Mt,Ne,Pm:Ps/N,Pmax:Pmx,Pmin:Pmn,Mm:Ms/N,Mmax:Mmx,Mmin:Mmn,Nm:Nsum/N,Nmax:Nmx,Nmin:Nmn,hmax:Math.max(0,...edges.map(e=>e.hmax)),eta:num(f.eta)||1};}
function lnPowerAll(f){const C=lnCuts(f);LN_CALC={key:lnCalcKey(f),at:new Date(),cuts:C.list.map(c=>lnPowerCut(f,c.k))};}
/* Liniendiagramm (eine Reihe, eine y-Achse) mit Mittelwertlinie, Fadenkreuz und Tooltip */
const LN_CH={};
function lnChart(id,xs,ys,o){const W=560,H=230,L=52,Rm=12,T=14,B=34,xmin=o.xmin??xs[0],xmax=o.xmax??xs[xs.length-1];let ymax=0,ymn=1e18;for(const v of ys){if(v>ymax)ymax=v;if(v<ymn)ymn=v;}(o.extra||[]).forEach(ex=>{for(const v of ex.ys){if(v>ymax)ymax=v;if(v<ymn)ymn=v;}});
 const nice=v=>{const e=Math.pow(10,Math.floor(Math.log10(v))),m=v/e;return (m<=1?1:m<=2?2:m<=5?5:10)*e;};
 let y0=0;if(o.fit&&ymax>0){const span=Math.max(ymax-ymn,ymax*0.02),st0=nice(span/4);y0=Math.max(0,Math.floor((ymn-span*0.15)/st0)*st0);ymax=Math.ceil((ymax+span*0.15)/st0)*st0;}else ymax=ymax>0?ymax*1.1:1;
 const X=x=>L+(x-xmin)/(xmax-xmin)*(W-L-Rm),Y=y=>T+(1-(y-y0)/(ymax-y0))*(H-T-B),f1=v=>v.toFixed(1);
 const st=nice((ymax-y0)/4);let g='';
 for(let v=y0;v<=ymax+1e-9;v+=st){g+=`<line x1="${L}" x2="${W-Rm}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${f1(Y(v)+4)}" font-size="11" text-anchor="end" fill="var(--muted)">${fmt(v,st<1?(st<.1?2:1):0)}</text>`;}
 (o.xticks||[]).forEach(x=>{g+=`<text x="${f1(X(x))}" y="${H-B+16}" font-size="11" text-anchor="middle" fill="var(--muted)">${o.xfmt?o.xfmt(x):fmt(x,0)}</text>`;});
 g+=`<line x1="${L}" x2="${W-Rm}" y1="${f1(Y(y0))}" y2="${f1(Y(y0))}" stroke="var(--muted)" stroke-width="1"/>`;
 let d='';xs.forEach((x,j)=>{if(x<xmin||x>xmax)return;d+=(d?'L':'M')+f1(X(x))+' '+f1(Y(ys[j]));});
 g+=`<path d="${d}" fill="none" stroke="#1d5fc4" stroke-width="2" stroke-linejoin="round"/>`;
 (o.extra||[]).forEach(ex=>{let d2='';xs.forEach((x,j)=>{if(x<xmin||x>xmax)return;d2+=(d2?'L':'M')+f1(X(x))+' '+f1(Y(ex.ys[j]));});g+=`<path d="${d2}" fill="none" stroke="${ex.color}" stroke-width="2" stroke-linejoin="round"/>`;});
 if(o.mean!=null){g+=`<line x1="${L}" x2="${W-Rm}" y1="${f1(Y(o.mean))}" y2="${f1(Y(o.mean))}" stroke="var(--fg)" stroke-width="1" stroke-dasharray="5 4"/><text x="${W-Rm-4}" y="${f1(Y(o.mean)-5)}" font-size="11" text-anchor="end" fill="var(--fg)" style="paint-order:stroke;stroke:var(--surface);stroke-width:3px">${o.meanLab||'Mittelwert'} ${fmt(o.mean,o.dec)} ${o.unit}</text>`;}
 g+=`<text x="${L}" y="${H-4}" font-size="11" fill="var(--muted)">${o.xlabel}</text><text x="6" y="11" font-size="11" fill="var(--muted)">${o.ylabel}${y0>0?' – Achse beginnt bei '+fmt(y0,o.dec)+' '+o.unit:''}</text>`;
 if(o.mark)g+=`<g class="ln-mark" style="display:none"><line y1="${T}" y2="${H-B}" stroke="#b3261e" stroke-width="1.5" stroke-dasharray="4 3"/><circle r="5.5" fill="#b3261e" stroke="var(--surface)" stroke-width="2"/><text y="${T+10}" font-size="11" fill="#b3261e" style="paint-order:stroke;stroke:var(--surface);stroke-width:3px"></text></g>`;
 g+=`<g class="ln-hov" style="display:none"><line y1="${T}" y2="${H-B}" stroke="var(--fg)" stroke-width="1"/><circle r="4" fill="#1d5fc4" stroke="var(--surface)" stroke-width="2"/></g>`;
 LN_CH[id]={xs,ys,X,Y,L,W,Rm,o,xmin,xmax};
 const lg=o.extra&&o.extra.length?`<div style="display:flex;gap:14px;justify-content:center;font-size:12.5px;margin-top:4px"><span><i style="display:inline-block;width:14px;height:3px;background:#1d5fc4;vertical-align:middle"></i> ${o.mainLab}</span>${o.extra.map(ex=>`<span><i style="display:inline-block;width:14px;height:3px;background:${ex.color};vertical-align:middle"></i> ${ex.label}</span>`).join('')}</div>`:'';
 return lg+`<div style="position:relative"><svg data-lnchart="${id}" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;background:var(--surface);border:1px solid var(--line);border-radius:6px;touch-action:pan-y" role="img" aria-label="${o.ylabel} über ${o.xlabel}">${g}<rect x="${L}" y="${T}" width="${W-L-Rm}" height="${H-T-B}" fill="transparent"/></svg><div class="ln-tip" style="position:absolute;display:none;pointer-events:none;background:var(--surface);border:1px solid var(--line);border-radius:5px;padding:4px 8px;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.15)"></div></div>`;}
/* Winkellage des Fräsers aus der Simulation als Punkt im Gesamtgraphen */
function lnMark(){const sv=document.querySelector('svg[data-lnchart="tot"]'),c=LN_CH.tot;if(!sv||!c)return;const g=sv.querySelector('.ln-mark');if(!g)return;
 const x=((LN_ROT%360)+360)%360;if(x<c.xmin-1e-9||x>c.xmax+1e-9){g.style.display='none';return;}
 const st=c.xs.length>1?c.xs[1]-c.xs[0]:1,j=((Math.round((x-c.xs[0])/st))%c.xs.length+c.xs.length)%c.xs.length,px=c.X(x),py=c.Y(c.ys[j]);
 g.style.display='';const ln=g.querySelector('line'),ci=g.querySelector('circle'),tx=g.querySelector('text');ln.setAttribute('x1',px);ln.setAttribute('x2',px);ci.setAttribute('cx',px);ci.setAttribute('cy',py);
 tx.setAttribute('x',px+(px>c.W-120?-6:6));tx.setAttribute('text-anchor',px>c.W-120?'end':'start');tx.textContent=`ψ = ${fmt(x,1)}° · ${fmt(c.ys[j],c.o.dec)} ${c.o.unit}`;}
/* Simulation durch waagrechtes Wischen drehen (Finger oder gedrückte Maustaste); senkrecht bleibt Scrollen */
let LN_DRAG=null;
document.addEventListener('pointerdown',e=>{const sv=e.target.closest&&e.target.closest('#ln-simsvg svg');if(!sv)return;LN_DRAG={x:e.clientX,y:e.clientY,rot:LN_ROT,on:false,id:e.pointerId,el:document.getElementById('ln-simsvg')};});
document.addEventListener('pointermove',e=>{const d=LN_DRAG;if(!d||e.pointerId!==d.id)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;
 if(!d.on){if(Math.abs(dx)>6&&Math.abs(dx)>Math.abs(dy)){d.on=true;try{d.el.setPointerCapture(e.pointerId);}catch(x){}LN_PLAY=false;const pb=document.querySelector('[data-lnplay]');if(pb)pb.textContent='▶ Drehen';}else return;}
 e.preventDefault();LN_ROT=(((d.rot-dx*0.1)%360)+360)%360;const r=document.querySelector('[data-lnrot]');if(r)r.value=LN_ROT;const v=document.getElementById('ln-rotv');if(v)v.textContent=fmt(LN_ROT,1)+'°';lnDrawSim();},{passive:false});
['pointerup','pointercancel'].forEach(t=>document.addEventListener(t,e=>{if(LN_DRAG&&e.pointerId===LN_DRAG.id)LN_DRAG=null;}));
function lnChartHover(e){const sv=e.target.closest&&e.target.closest('svg[data-lnchart]');if(!sv)return;const c=LN_CH[sv.dataset.lnchart];if(!c)return;
 const rc=sv.getBoundingClientRect(),sx=(e.clientX-rc.left)*sv.viewBox.baseVal.width/rc.width,x=c.xmin+(sx-c.L)/(c.W-c.L-c.Rm)*(c.xmax-c.xmin);
 let bj=0,bd=1e9;c.xs.forEach((v,j)=>{const d=Math.abs(v-x);if(d<bd){bd=d;bj=j;}});
 const hv=sv.querySelector('.ln-hov'),tip=sv.parentNode.querySelector('.ln-tip'),px=c.X(c.xs[bj]),py=c.Y(c.ys[bj]);
 hv.style.display='';hv.querySelector('line').setAttribute('x1',px);hv.querySelector('line').setAttribute('x2',px);hv.querySelector('circle').setAttribute('cx',px);hv.querySelector('circle').setAttribute('cy',py);
 tip.style.display='';tip.innerHTML=`${c.o.xfmt?c.o.xfmt(c.xs[bj]):fmt(c.xs[bj],1)} · ${c.o.extra&&c.o.extra.length?(c.o.mainLab||'')+' ':''}<b>${fmt(c.ys[bj],c.o.dec)} ${c.o.unit}</b>${(c.o.extra||[]).map(ex=>` · ${ex.label} <b>${fmt(ex.ys[bj],c.o.dec)} ${c.o.unit}</b>`).join('')}`;
 const k=rc.width/sv.viewBox.baseVal.width;tip.style.left=Math.min(rc.width-140,Math.max(0,px*k+10))+'px';tip.style.top=Math.max(0,py*k-34)+'px';}
document.addEventListener('pointermove',lnChartHover);
document.addEventListener('pointerleave',e=>{},true);
document.addEventListener('pointerout',e=>{const sv=e.target.closest&&e.target.closest('svg[data-lnchart]');if(!sv||sv.contains(e.relatedTarget))return;const hv=sv.querySelector('.ln-hov');if(hv)hv.style.display='none';const tp=sv.parentNode.querySelector('.ln-tip');if(tp)tp.style.display='none';});
function lnPowHTML(f){const res=lnPowResHTML(f);return `<p class="note" style="margin:0 0 8px">Die Schnitte werden über eine Fräserumdrehung in N<sub>φ</sub> Winkelschritte aufgeteilt. Gerechnet wird erst mit „Berechnen“.</p>
 <div class="fields">${field('laengsnaht','nPhi','Winkelinkremente je Umdrehung Nφ',{num:1})}</div>
 <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" class="btn primary" data-lncalc="1">Berechnen</button></div>
 <div id="ln-sim" style="margin-bottom:2px">${lnSimHTML()}</div>
 <div id="ln-powres">${res}</div><div id="ln-simtab"></div><div id="ln-mat"></div>`;}
let LN_CTL='';
function lnPowResHTML(f){
 LN_CTL='';
 if(!LN_CALC)return '<p class="note">Noch nicht berechnet.</p>';
 const stale=LN_CALC.key!==lnCalcKey(f),sel=lnSel(f),r=LN_CALC.cuts[sel];
 let h=`${stale?'<p class="warn" style="margin:0 0 6px">Eingaben wurden geändert – Ergebnis gilt für den letzten Stand. Neu berechnen.</p>':''}`;
 if(!r||r.err)return h+`<p class="warn" style="font-weight:600">Für den Graphen fehlt noch: ${r?r.err:'Kein Ergebnis.'}</p>`;
 const kv=(k,v,u,hl)=>`<div style="border:${hl?2:1}px solid ${hl?'var(--fg)':'var(--line)'};border-radius:6px;padding:8px 10px"><div style="font-size:12px;color:var(--muted)">${k}</div><div style="font:600 19px var(--f-disp)">${v} <small style="font:400 11px var(--f-body);color:var(--muted)">${u}</small></div></div>`;
 const xs=Array.from({length:r.N},(_,j)=>j*r.da),isP=LN_PQ==='P',isH=LN_PQ==='H';
 /* Spuren: je Reihe links, rechts und beide Seiten – nur Reihen, die im Schnitt schneiden */
 const tracks=[];r.edges.forEach(e=>{if(!e.incs.length)return;tracks.push({key:e.i+e.side,nm:`${e.nm} ${e.side==='L'?'links':'rechts'}`,i:e.i,sides:[e.side]});});
 [...new Set(r.edges.filter(e=>e.incs.length).map(e=>e.i))].forEach(i=>{const ss=r.edges.filter(e=>e.i===i&&e.incs.length).map(e=>e.side);if(ss.length===2)tracks.push({key:i+'LR',nm:`${r.edges.find(e=>e.i===i).nm} links + rechts`,i,sides:['L','R']});});
 tracks.sort((x,y)=>x.i-y.i||x.sides.length-y.sides.length||(x.sides[0]>y.sides[0]?1:-1));
 if(!tracks.some(t=>t.key===LN_TRK)&&tracks.length)LN_TRK=tracks[0].key;
 const tr=LN_SRC==='trk'?tracks.find(t=>t.key===LN_TRK):null;
 let ysel,meanSel,lab,nOn=null,extra=null;const split=!!(tr&&tr.sides.length===2&&LN_SPLIT);
 const trackSum=(i,sides)=>{const y=new Float64Array(r.N);sides.forEach(sd=>{const e=r.edges.find(x=>x.i===i&&x.side===sd);if(!e)return;r.ins.filter(q=>q.i===i&&q.side===sd).forEach(q=>{const o=Math.round(q.ang/r.da),src=isH?e.H:isP?e.P:e.M;for(let j=0;j<r.N;j++){const v=src[(j+o)%r.N];if(isH){if(v>y[j])y[j]=v;}else y[j]+=v;}});});return y;};
 if(tr){ysel=new Float64Array(r.N);nOn=new Float64Array(r.N);let zs=0;
  tr.sides.forEach(sd=>{const e=r.edges.find(x=>x.i===tr.i&&x.side===sd);if(!e)return;zs+=e.z;
   r.ins.filter(q=>q.i===tr.i&&q.side===sd).forEach(q=>{const o=Math.round(q.ang/r.da),src=isH?e.H:isP?e.P:e.M;
    for(let j=0;j<r.N;j++){const v=src[(j+o)%r.N];if(isH){if(v>ysel[j])ysel[j]=v;}else ysel[j]+=v;if(e.P[(j+o)%r.N]>0)nOn[j]++;}});});
  let sm=0,mx=0;for(let j=0;j<r.N;j++){sm+=ysel[j];if(ysel[j]>mx)mx=ysel[j];}meanSel=isH?mx:sm/r.N;lab=`Spur ${tr.nm} (${zs} Platten)`;
  if(split){ysel=trackSum(tr.i,['L']);extra=[{ys:trackSum(tr.i,['R']),color:'#c2560c',label:'rechts'}];lab=`Spur ${r.edges.find(e=>e.i===tr.i).nm} – links und rechts getrennt`;}}
 else{ysel=isH?r.Ht:isP?r.Pt:r.Mt;meanSel=isH?r.hmax:isP?r.Pm:r.Mm;lab='Fräser gesamt';}
 const unitS=isH?'mm':isP?'kW':'Nm';
LN_CTL=`<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin:4px 0 6px">Anzeige: <button type="button" class="chip-btn" data-lnsrc="tot" aria-pressed="${!tr}">Fräser gesamt</button><button type="button" class="chip-btn" data-lnsrc="trk" aria-pressed="${!!tr}">Wendeplattenreihe (Spur)</button>
  ${LN_SRC==='trk'?`<select data-lntrk="1" style="padding:5px 6px;border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--fg);font:inherit">${tracks.map(t=>`<option value="${t.key}" ${t.key===LN_TRK?'selected':''}>${t.nm}</option>`).join('')}</select>${tr&&tr.sides.length===2?`<button type="button" class="chip-btn" data-lnsplit="1" aria-pressed="${LN_SPLIT}">beide Seiten getrennt</button>`:''}`:''}</div>`;
 LN_CTL+=`<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin:4px 0 6px">Verlauf über 0 … 2π: <button type="button" class="chip-btn" data-lnpq="P" aria-pressed="${isP&&!isH}">Leistung</button><button type="button" class="chip-btn" data-lnpq="M" aria-pressed="${LN_PQ==='M'}">Drehmoment</button><button type="button" class="chip-btn" data-lnpq="H" aria-pressed="${isH}">Max. aktuelle Spanungsdicke</button><span style="flex:1"></span>Bereich: ${[[360,'2π'],[90,'90°'],[30,'30°'],[10,'10°']].map(([v,l])=>`<button type="button" class="chip-btn" data-lnzoom="${v}" aria-pressed="${LN_ZOOM===v}">${l}</button>`).join('')}<button type="button" class="chip-btn" data-lnfit="1" aria-pressed="${!LN_FIT}">Achse ab 0</button></div>`;
 h+=lnChart('tot',xs,Array.from(ysel),{mark:true,xlabel:'Fräserdrehwinkel ψ',ylabel:(isH?'max. aktuelle Spanungsdicke h(ψ) (mm)':isP?'Schnittleistung P (kW)':'Drehmoment M (Nm)')+' – '+lab,unit:unitS,dec:isH?3:isP?2:0,mean:split?null:meanSel,meanLab:isH?'h_max':'Mittelwert',extra,mainLab:'links',fit:LN_FIT&&!isH,xmin:0,xmax:LN_ZOOM,xticks:LN_ZOOM===360?[0,90,180,270,360]:[0,LN_ZOOM/4,LN_ZOOM/2,3*LN_ZOOM/4,LN_ZOOM],xfmt:LN_ZOOM===360?(x=>x===0?'0':x===90?'π/2':x===180?'π':x===270?'3π/2':x===360?'2π':fmt(x,1)+'°'):(x=>fmt(x,Number.isInteger(x)?0:1)+'°')});
 if(isH&&!tr)h+=`<p class="note" style="margin:4px 0 10px">Je Drehwinkel ψ die größte aktuelle Spanungsdicke aller Platten im Eingriff (h = f<sub>z,i</sub> · sin β · sin κ). Höchstwert h<sub>max</sub> = ${fmt(r.hmax,3)} mm.</p>`;
 if(tr&&!split){let mn=1e18,mx=0,nm=0,nx=0,nn=1e9;for(let j=0;j<r.N;j++){if(ysel[j]<mn)mn=ysel[j];if(ysel[j]>mx)mx=ysel[j];nm+=nOn[j];if(nOn[j]>nx)nx=nOn[j];if(nOn[j]<nn)nn=nOn[j];}
  h+=`<p class="note" style="margin:4px 0 10px">${lab}: ${isH?`h<sub>max</sub> = ${fmt(mx,3)} mm, min. ${fmt(mn,3)} mm`:`Mittelwert ${fmt(meanSel,isP?2:0)} ${unitS}, max. ${fmt(mx,isP?2:0)} ${unitS}, min. ${fmt(mn,isP?2:0)} ${unitS}, Schwankung ${fmt(mx-mn,isP?2:0)} ${unitS}${meanSel>0?' ('+fmt((mx-mn)/meanSel*100,1)+' %)':''}`} · Platten der Spur im Eingriff min / Ø / max: ${fmt(nn,0)} / ${fmt(nm/r.N,1)} / ${fmt(nx,0)}.</p>`;}
 h+=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:10px">
  ${kv('Mittlere Schnittleistung P̄',fmt(r.Pm,2),'kW',1)}${kv('Max. / min. Schnittleistung',fmt(r.Pmax,2)+' / '+fmt(r.Pmin,2),'kW')}${kv('Schwankung ΔP (ΔP/P̄)',fmt(r.Pmax-r.Pmin,2)+' kW ('+fmt((r.Pmax-r.Pmin)/r.Pm*100,1)+' %)','')}${kv('Antriebsleistung P̄ / η',fmt(r.Pm/r.eta,2),'kW')}
  ${kv('Mittleres Drehmoment M̄',fmt(r.Mm,0),'Nm',1)}${kv('Max. / min. Drehmoment',fmt(r.Mmax,0)+' / '+fmt(r.Mmin,0),'Nm')}${kv('Schwankung ΔM',fmt(r.Mmax-r.Mmin,0),'Nm')}${kv('Max. Spanungsdicke',fmt(r.hmax,3),'mm',1)}
  ${kv('Platten im Eingriff min / Ø / max',fmt(r.Nmin,0)+' / '+fmt(r.Nm,1)+' / '+fmt(r.Nmax,0),'')}${kv('Drehzahl n',fmt(r.n,1),'1/min')}${kv('Vorschubgeschw. vf',fmt(r.vf,0),'mm/min')}</div>`;
 // je Schneide
 const E=r.edges,es=Math.min(LN_EDGE,E.length-1);
 h+=`<div class="lbl" style="margin:14px 0 4px">Je Schneide (alle Platten einer Reihe und Seite sind gleich belastet) – Zeile anklicken für Leistungsgraph und Eingriff je Inkrement</div>
 <div class="tbl-wrap"><table class="lnzt"><thead><tr><th>Schneide</th><th>z<sub>i</sub></th><th>f<sub>z,i</sub> (mm)</th><th>a<sub>e,max</sub> (mm)</th><th>φ<sub>e,max</sub> (°)</th><th>h<sub>max</sub> (mm)</th><th>P̄ je Platte (W)</th><th>P<sub>max</sub> je Platte (kW)</th><th>M<sub>max</sub> je Platte (Nm)</th><th>P̄ Reihe (kW)</th></tr></thead><tbody>
 ${E.map((e,j)=>`<tr data-lnedge="${j}" style="cursor:pointer${j===es?';background:var(--surface-2);font-weight:600':''}${e.incs.length?'':';opacity:.45'}"><td>${e.nm} ${e.side==='L'?'links':'rechts'}</td><td>${e.z}</td><td>${fmt(e.feff,3)}</td><td>${fmt(e.aemax,1)}</td><td>${fmt(e.phimax,1)}</td><td>${fmt(e.hmax,3)}</td><td>${fmt(e.Pm*1000,1)}</td><td>${fmt(e.Pmax,3)}</td><td>${fmt(e.Mmax,1)}</td><td>${fmt(e.Prow,2)}</td></tr>`).join('')}
 </tbody></table></div>`;
 const e=E[es];
 if(e){const a0=Math.max(0,180-e.phimax-3),idx=xs.map((x,j)=>j).filter(j=>xs[j]>=a0&&xs[j]<=180.0001);
  h+=`<div class="lbl" style="margin:12px 0 4px">Leistungsgraph ${e.nm} ${e.side==='L'?'links':'rechts'} – eine Platte während ihres Eingriffs</div>`;
  h+=lnChart('edge',idx.map(j=>180-xs[j]),idx.map(j=>e.P[j]*1000),{xlabel:'Winkel ab Nutgrund β (°), Eintritt bei β = φmax',ylabel:'Leistung je Platte (W)',unit:'W',dec:1,mean:null,xmin:0,xmax:Math.max(1,e.phimax+3),xticks:[0,Math.round(e.phimax/2),Math.round(e.phimax)],xfmt:x=>fmt(x,0)+'°'});
  h+=`<p class="note" style="margin:4px 0 0">h<sub>max</sub> = ${fmt(e.hmax,3)} mm am Eintritt · P̄ je Platte über eine Umdrehung = ${fmt(e.Pm*1000,1)} W · M̄ je Platte = ${fmt(e.Mm,2)} Nm · ${e.incs.length} Inkremente im Schnitt.</p>
  <div class="lbl" style="margin:10px 0 4px">Eingriff je Inkrement – ${e.nm} ${e.side==='L'?'links':'rechts'}, Schnitt ${r.k+1}</div>
  <div class="tbl-wrap"><table class="lnzt"><thead><tr><th>Inkr.</th><th>y (mm)</th><th>b (mm)</th><th>κ (°)</th><th>r (mm)</th><th>v<sub>c</sub> (m/min)</th><th>K<sub>v</sub></th><th>a<sub>e</sub> (mm)</th><th>φ<sub>e</sub> (°)</th><th>l<sub>e</sub> (mm)</th><th>h<sub>max</sub> (mm)</th><th>F<sub>c,max</sub> (N)</th><th>F̄<sub>c</sub> (N)</th></tr></thead><tbody>
  ${e.incs.map(q=>`<tr><td>${q.k}</td><td>${fmt(q.y,2)}</td><td>${fmt(q.b,2)}</td><td>${fmt(q.kap,1)}</td><td>${fmt(q.r,1)}</td><td>${fmt(q.vcl,1)}</td><td>${fmt(q.kv,3)}</td><td>${fmt(q.ae,2)}</td><td>${fmt(q.phi,2)}</td><td>${fmt(q.le,1)}</td><td>${fmt(q.hmax,4)}</td><td>${fmt(q.Fmax,0)}</td><td>${fmt(q.Fmean,1)}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="note" style="margin:4px 0 0">Jedes Inkrement hat seine eigene Eingriffstiefe a<sub>e</sub> = min(Δ, t − y), seinen Radius r = D/2 − y und damit seinen eigenen Eingriffsbogen φ<sub>e</sub> = arccos(1 − a<sub>e</sub>/r) und seine Eingriffslänge l<sub>e</sub> = r · φ<sub>e</sub>. In jedem Winkelschritt schneidet ein Inkrement nur, solange β ≤ φ<sub>e</sub>.</p>`;}
 h+=`<p class="note" style="margin:8px 0 0">Rechenweg: je Kanteninkrement h = f<sub>z,i</sub> · sin β · sin κ, F<sub>c</sub> = b · k<sub>c1.1</sub> · h<sup>1−m<sub>c</sub></sup> · (1 − γ₀/100) · K<sub>Vf</sub> · K<sub>v</sub>(v<sub>c</sub>·r/R) · K<sub>ver</sub>, M = Σ F<sub>c</sub> · r, P = M · ω. Leistung und Drehmoment des Fräsers sind die Summe der momentanen Werte aller Platten: P(ψ) = Σ<sub>q</sub> P<sub>q</sub>(ψ), M(ψ) = Σ<sub>q</sub> M<sub>q</sub>(ψ) über ${r.ins.length} Platten mit ihrer Winkellage. Mittlere Leistung = arithmetisches Mittel des Leistungssignals: P̄ = (1/N<sub>φ</sub>) · Σ<sub>j</sub> P(ψ<sub>j</sub>), ebenso M̄; N<sub>φ</sub> = ${r.N} (Δψ = ${fmt(r.da,2)}°). Diese Mittelwerte werden auch im Schnittkraftrechner rechts angezeigt.</p>`;
 return h;}
/* ===== Optimierer ===== */
const lnLocked=(f,i,sd)=>String(f.phLock||'').split(',').includes(i+sd);
/* Schloss-Symbol (schwarz): geschlossen = Bügel im Körper, offen = Bügel um das linke Bein aufgedreht */
function lnLockSvg(lk){return `<svg width="20" height="20" viewBox="-4 -2 20 20" aria-hidden="true" style="display:block"><g fill="none" stroke="var(--fg)" stroke-width="2" stroke-linecap="round">${lk?'<path d="M4.5 8.5V5.5a3.5 3.5 0 0 1 7 0v3"/>':'<path d="M4.5 8.5V5.5a3.5 3.5 0 0 1 7 0v1" transform="rotate(-38 4.5 8.5)"/>'}</g><rect x="2" y="8.5" width="12" height="8.5" rx="1.6" fill="${lk?'var(--fg)':'var(--surface)'}" stroke="var(--fg)" stroke-width="1.6"/><rect x="7.2" y="11.2" width="1.6" height="3" rx=".8" fill="${lk?'var(--surface)':'var(--fg)'}"/></svg>`;}
function lnLockBtn(f,i,sd){const lk=lnLocked(f,i,sd);return `<button type="button" data-lnlock="${i}${sd}" aria-pressed="${lk}" title="${lk?'Gesperrt – wird nicht optimiert':'Offen – wird optimiert'}" aria-label="${lk?'Winkellage gesperrt':'Winkellage offen'}" style="border:0;background:none;cursor:pointer;padding:2px 5px 2px 0;vertical-align:middle;display:inline-flex">${lnLockSvg(lk)}</button>`;}
let LN_OPTT=null,LN_OPTP=null;
/* Werkzeugoptimierer: Schnitt für Schnitt die Winkellage der dort erstmals eingreifenden, offenen Reihen so verschieben,
   dass P_max − P_min des Summensignals minimal wird (P̄ hängt nicht von der Winkellage ab). */
function lnToolOpt(f){
 const C=lnCuts(f),A=lnAng(f),mid=lnMid(f),res=C.list.map(c=>lnPowerCut(f,c.k));
 const bad=res.find(r=>r.err);if(bad)return {err:`Schnitt ${bad.k+1}: ${bad.err}`};
 const N=res[0].N,da=res[0].da,vars=[];
 A.rows.forEach((row,i)=>{
  const mk=(sides,z,ph,key,nm)=>{if(!(z>0))return;const p=360/z;vars.push({key,i,sides,z,p,S:Math.max(1,Math.round(p/da)),s:Math.round((((ph%p)+p)%p)/da),lock:mid?lnLocked(f,i,'L'):sides.every(sd=>lnLocked(f,i,sd)),nm});};
  if(mid)mk(['L','R'],row.zL,row.phL,i+'M',row.nm);
  else{mk(['L'],row.zL,row.phL,i+'L',row.nm+' links');mk(['R'],row.zR,row.phR,i+'R',row.nm+' rechts');}});
 /* Beitrag einer Reihe als periodische Kurve: C[y] = Σ_j P_Platte[(y + o_j) mod N], Verschiebung s = φ0/Δψ */
 /* je Reihe: Gesamtkurve c, Seitendifferenz d = P_links − P_rechts, Anzahl Platten im Eingriff je Seite */
 const curve=(v,r)=>{const c=new Float64Array(N),d=new Float64Array(N),nL=new Float64Array(N),nR=new Float64Array(N);let any=false;
  v.sides.forEach(sd=>{const e=r.edges.find(x=>x.i===v.i&&x.side===sd);if(!e||!e.incs.length)return;any=true;const sg=sd==='L'?1:-1,cnt=sd==='L'?nL:nR;
   for(let j=0;j<v.z;j++){const o=Math.round((j*v.p+(mid&&sd==='R'?v.p/2:0))/da);for(let y=0;y<N;y++){const pv=e.P[(y+o)%N];if(pv){c[y]+=pv;d[y]+=sg*pv;cnt[y]++;}}}});
  return any?{c,d,nL,nR}:null;};
 const wS=Math.max(0,num(f.wSide)>=0?num(f.wSide):1);
 const stats=(curves)=>{let mx=-1e18,mn=1e18,dm=0,lm=0,rm=0;const T=new Float64Array(N),D=new Float64Array(N),L=new Float64Array(N),Rn=new Float64Array(N);
  curves.forEach(({c,s})=>{for(let y=0;y<N;y++){const q=(y+s)%N;T[y]+=c.c[q];D[y]+=c.d[q];L[y]+=c.nL[q];Rn[y]+=c.nR[q];}});
  for(let y=0;y<N;y++){if(T[y]>mx)mx=T[y];if(T[y]<mn)mn=T[y];const a=Math.abs(D[y]);if(a>dm)dm=a;if(L[y]>lm)lm=L[y];if(Rn[y]>rm)rm=Rn[y];}return {mx,mn,dm,lm,rm};};
 const seen=new Set(),report=[],changed=new Set();
 res.forEach((r,k)=>{
  const act=vars.map(v=>({v,c:curve(v,r)})).filter(x=>x.c);
  const free=act.filter(x=>!seen.has(x.v.key)&&!x.v.lock);
  const before=stats(act.map(x=>({c:x.c,s:x.v.s})));
  if(free.length){
   const fixed=new Float64Array(N),fixD=new Float64Array(N);act.filter(x=>!free.includes(x)).forEach(x=>{for(let y=0;y<N;y++){const q=(y+x.v.s)%N;fixed[y]+=x.c.c[q];fixD[y]+=x.c.d[q];}});
   /* Ziel: kleine Schwankung der Gesamtleistung + Gewicht · größte Differenz zwischen linker und rechter Seite */
   const J=(sv)=>{const T=Float64Array.from(fixed),D=Float64Array.from(fixD);free.forEach((x,q)=>{const s=sv[q],cc=x.c.c,dd=x.c.d;for(let y=0;y<N;y++){const i2=(y+s)%N;T[y]+=cc[i2];D[y]+=dd[i2];}});
    let mx=-1e18,mn=1e18,dm=0;for(let y=0;y<N;y++){if(T[y]>mx)mx=T[y];if(T[y]<mn)mn=T[y];const a=D[y]<0?-D[y]:D[y];if(a>dm)dm=a;}return mx-mn+wS*dm+1e-6*mx;};
   let best=free.map(x=>x.v.s),bJ=J(best);const starts=Math.min(24,4+8*free.length);
   for(let st=0;st<starts;st++){let sv=st===0?best.slice():free.map(x=>Math.floor(Math.random()*x.v.S)),cur=J(sv);
    for(let pass=0;pass<10;pass++){let imp=false;
     for(let q=0;q<free.length;q++){const x=free[q];let bs=sv[q],bv=cur;for(let t=0;t<x.v.S;t++){if(t===sv[q])continue;sv[q]=t;const v=J(sv);if(v<bv-1e-12){bv=v;bs=t;}}sv[q]=bs;if(bv<cur-1e-12){cur=bv;imp=true;}}
     if(!imp)break;}
    if(cur<bJ-1e-12){bJ=cur;best=sv.slice();}}
   free.forEach((x,q)=>{x.v.s=best[q];changed.add(x.v.key);});}
  const after=stats(act.map(x=>({c:x.c,s:x.v.s})));
  act.forEach(x=>seen.add(x.v.key));
  report.push({k,t:r.t,Pm:r.Pm,before,after,free:free.map(x=>x.v.nm),locked:act.filter(x=>x.v.lock&&!free.includes(x)).map(x=>x.v.nm)});});
 // Ergebnis zurückschreiben
 const n=A.rows.length,pL=String(f.phRows||'').split(';'),pR=String(f.phRowsR||'').split(';');while(pL.length<n)pL.push('');while(pR.length<n)pR.push('');
 A.rows.forEach((row,i)=>{pL[i]=dec(row.phL,3);pR[i]=dec(row.phR,3);});
 vars.filter(v=>changed.has(v.key)).forEach(v=>{const ph=dec(v.s*da%v.p,3);if(v.sides.includes('L'))pL[v.i]=ph;if(!mid&&v.sides[0]==='R')pR[v.i]=ph;});
 f.phRows=pL.slice(0,n).join(';');if(!mid)f.phRowsR=pR.slice(0,n).join(';');
 return {report,at:new Date()};}
/* Mittlere Schnittleistung eines Schnitts (tp → t) bei Vorschubgeschwindigkeit vf – analytisch gemittelt, unabhängig von der Winkellage */
function lnMeanPow(f,tp,t,vf){const G=lnGeom(f),A=lnAng(f),D=num(f.Dc),Rr=D/2,vc=num(f.vc),n=vc*1000/(Math.PI*D),om=2*Math.PI*n/60,kc11=num(f.kc),mc=num(f.mc),gk=(1-(num(f.g)||0)/100)*kvfOf(f)*kverOf(f),c={t,tp,d:t-tp};
 let M=0;const NB=48;
 A.rows.forEach((row,i)=>{const pl=i===0?'R':'F'+i;['L','R'].forEach(sd=>{const zi=sd==='L'?row.zL:row.zR;if(!(zi>0))return;const feff=vf/(n*zi);
  G.inc.filter(q=>q.pl===pl).forEach(q=>{const top=Math.min(q.y1,t);if(!(top>q.y0))return;const b=q.ds*(top-q.y0)/(q.y1-q.y0),ym=(q.y0+top)/2,ae=lnAe(c,ym);if(!(ae>0))return;
   const r=Rr-ym,phi=Math.acos(Math.max(-1,Math.min(1,1-ae/r))),sk=Math.sin(q.kap*Math.PI/180);let I=0;for(let m=0;m<NB;m++){const be=phi*(m+.5)/NB;I+=Math.pow(Math.sin(be)*sk*feff,1-mc)*phi/NB;}
   M+=zi*b*kc11*gk*kvOf(f,vc*r/Rr)*I*r/1000/(2*Math.PI);});});});
 return M*om/1000;}
/* Größte Spanungsdicke eines Schnitts bei vf = 1 mm/min (h skaliert linear mit vf): max über Reihen, Seiten, Inkremente von f_z,i · sin(min(φ,90°)) · sin κ */
function lnHUnit(f,tp,t){const G=lnGeom(f),A=lnAng(f),D=num(f.Dc),Rr=D/2,n=num(f.vc)*1000/(Math.PI*D),c={t,tp,d:t-tp};let h=0;
 A.rows.forEach((row,i)=>{const pl=i===0?'R':'F'+i;['L','R'].forEach(sd=>{const zi=sd==='L'?row.zL:row.zR;if(!(zi>0))return;
  G.inc.filter(q=>q.pl===pl).forEach(q=>{const top=Math.min(q.y1,t);if(!(top>q.y0))return;const ym=(q.y0+top)/2,ae=lnAe(c,ym);if(!(ae>0))return;const r=Rr-ym,phi=Math.acos(Math.max(-1,Math.min(1,1-ae/r)));
   const v=1/(n*zi)*Math.sin(Math.min(phi,Math.PI/2))*Math.sin(q.kap*Math.PI/180);if(v>h)h=v;});});});return h;}
/* Prozessoptimierer: Zwischentiefen auf Reihengrenzen (Reihe voll im Einsatz, nächste noch nicht), Zieltiefe bleibt;
   vf je Schnitt so, dass P̄/η = Maschinenleistung; gewählt wird die Kombination mit dem gleichmäßigsten vf. */
function lnProcOpt(f){const C=lnCuts(f),G=lnGeom(f),T=C.tMax,mc=num(f.mc),eta=num(f.eta)||1,PM=num(f.pMach),cb=Math.cos(G.be);
 if(!(PM>0))return {err:'Maschinenleistung eintragen.'};if(!(T>0)||!G.ok)return {err:'Profil und Zieltiefe (tiefster Schnitt) prüfen.'};if(!(num(f.kc)>0&&mc>0&&num(f.vc)>0))return {err:'Werkstoff und vc eintragen.'};
 const B=[];if(G.yt<T-1e-6)B.push({y:G.yt,nm:'Radius'});G.segs.forEach(([a,b],i)=>{const y=G.yt+b*cb;if(y<T-1e-6)B.push({y,nm:'F'+(i+1)});});
 const pts=[{y:0,nm:''}].concat(B,[{y:T,nm:'Ziel'}]),L=pts.length,Pav=PM*eta,ref=100,V=[],HU=[],hMin=Math.max(0,num(f.hMin)||0);
 for(let a=0;a<L;a++){V.push([]);HU.push([]);for(let b=0;b<L;b++){if(b<=a){V[a].push(NaN);HU[a].push(NaN);continue;}const P=lnMeanPow(f,pts[a].y,pts[b].y,ref);V[a].push(P>0?ref*Math.pow(Pav/P,1/(1-mc)):NaN);HU[a].push(lnHUnit(f,pts[a].y,pts[b].y));}}
 const infeas={};
 const best={};const inner=L-2,tol=Math.max(0,(num(f.vfTol)>=0?num(f.vfTol):20))/100;
 /* Vorschub je Schnitt: aus der Maschinenleistung (vf_P), höchstens (1 + tol) · kleinster Vorschub → Vorschübe liegen max. tol auseinander.
    Gewählt wird je Schnittanzahl die Aufteilung mit der kürzesten Hauptzeit Σ 1/vf. */
 const rec=(idx,chosen)=>{ // chosen: Indizes der Zwischenpunkte (1..L-2)
  const seq=[0,...chosen,L-1],vP=[],vH=[],hu=[];for(let q=1;q<seq.length;q++){vP.push(V[seq[q-1]][seq[q]]);hu.push(HU[seq[q-1]][seq[q]]);vH.push(hMin>0?hMin/HU[seq[q-1]][seq[q]]:0);}
  const n0=vP.length,mnP=Math.min(...vP);
  /* zulässig: jeder Schnitt erreicht h_min ohne die Maschinenleistung zu überschreiten, und alle Vorschübe passen in das Toleranzband */
  const ok=vH.every((v,q)=>v<=vP[q]*(1+1e-9))&&Math.max(...vH)<=mnP*(1+tol)*(1+1e-9);
  if(!ok){infeas[n0]=(infeas[n0]||0)+1;}
  const n=ok?n0:99,vf=vP.map(v=>Math.min(v,mnP*(1+tol))),hm=vf.map((v,q)=>v*hu[q]),mn=Math.min(...vf),mx=Math.max(...vf),mean=vf.reduce((x,y)=>x+y,0)/n,spread=(mx-mn)/mn,tsum=vf.reduce((a,v)=>a+1/v,0),use=vf.map((v,q)=>Math.pow(v/vP[q],1-mc));
  if(n<=10&&(!best[n]||tsum<best[n].tsum-1e-12))best[n]={n,spread,mn,mx,mean,seq:seq.slice(),vf,vP,use,tsum,hm};
  for(let j=(chosen.length?chosen[chosen.length-1]+1:1);j<=inner;j++){if(chosen.length>=9)break;chosen.push(j);rec(idx+1,chosen);chosen.pop();}};
 rec(0,[]);
 const list=Object.values(best).sort((a,b)=>a.n-b.n).map(o=>({...o,cuts:o.seq.slice(1).map((pi,q)=>({t:pts[pi].y,nm:pts[pi].nm,tp:pts[o.seq[q]].y,vf:o.vf[q],use:o.use[q],hm:o.hm[q],full:pts[pi].nm&&pts[pi].nm!=='Ziel'?pts[pi].nm:''}))}));
 const rec1=list.reduce((a,o)=>!a||o.tsum<a.tsum?o:a,null);
 const nMax=Math.min(10,L-1),miss=[];for(let k=1;k<=nMax;k++)if(!best[k])miss.push(k);
 return {list,Pav,PM,eta,T,bound:B,cur:C.n,tol,rec:rec1?rec1.n:0,l:num(f.l),hMin,miss};}
function lnApplyProc(f,o){f.nCuts=String(o.n);f.cutT=o.cuts.map(c=>dec(c.t,2)).join(';');f.cutVf=o.cuts.map(c=>dec(Math.floor(c.vf/5)*5,0)).join(';');f.lnCut='0';const C=lnCuts(f);if(C.tMax>0)f.ap=dec(C.tMax,2);}
function lnOptHTML(f){return `<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:14px">
 <div style="border:1px solid var(--line);border-radius:8px;padding:12px"><div style="font:600 15px var(--f-disp);margin-bottom:4px">1 · Werkzeugoptimierer – Winkellage der Wendeplatten</div>
  <p class="note" style="margin:0 0 8px">Geht Schnitt für Schnitt durch den Prozess und verschiebt die Winkellage φ<sub>0</sub> der Reihen, die in diesem Schnitt das erste Mal im Eingriff sind, so dass die maximale Schnittleistung des Werkzeugs minimiert und die minimale maximiert wird (kleinste Schwankung P<sub>max</sub> − P<sub>min</sub>) und linke und rechte Seite möglichst gleich viel schneiden (kleinste Seitendifferenz |P<sub>links</sub> − P<sub>rechts</sub>|, gewichtet mit dem Seitenausgleich). Bereits optimierte Reihen bleiben in den folgenden Schnitten fest. Reihen mit geschlossenem Schloss <span style="display:inline-flex;vertical-align:-3px">${lnLockSvg(true)}</span> in der Zähnezahl-Tabelle werden nicht verändert, offenes Schloss <span style="display:inline-flex;vertical-align:-3px">${lnLockSvg(false)}</span> = wird optimiert.</p>
  <div class="fields">${field('laengsnaht','wSide','Gewichtung Seitenausgleich (0 = aus)',{num:1})}</div><button type="button" class="btn primary" data-lnopt="tool" style="margin-top:8px">Winkellagen optimieren</button><div id="ln-optt" style="margin-top:8px">${lnOptTHTML()}</div></div>
 <div style="border:1px solid var(--line);border-radius:8px;padding:12px"><div style="font:600 15px var(--f-disp);margin-bottom:4px">2 · Prozessoptimierer – Schnitttiefen und Vorschub</div>
  <p class="note" style="margin:0 0 8px">Legt die Zwischentiefen auf die Grenzen der Wendeplattenreihen, so dass eine Reihe mit ihrer vollen Schneidlänge im Einsatz ist und die nächste noch nicht eingreift. Die tiefste Schnitttiefe (Zieltiefe) bleibt. Je Schnitt wird die Vorschubgeschwindigkeit so bestimmt, dass die Maschinenleistung ausgenutzt wird (P̄/η = P<sub>M</sub>), wobei die Vorschübe aller Schnitte höchstens um die eingestellte Abweichung auseinanderliegen und die größte Spanungsdicke jedes Schnitts mindestens h<sub>min</sub> erreicht; gewählt wird die Aufteilung mit der kürzesten Hauptzeit.</p>
  <div class="fields">${field('laengsnaht','pMach','Maschinenleistung P_M',{num:1,u:'kW'})}${field('laengsnaht','vfTol','Max. Abweichung der Vorschübe',{num:1,u:'%'})}${field('laengsnaht','hMin','Mindest-Spanungsdicke h_min (größte Spanungsdicke je Schnitt)',{num:1,u:'mm'})}</div>
  <button type="button" class="btn primary" data-lnopt="proc" style="margin-top:8px">Schnitte optimieren</button><div id="ln-optp" style="margin-top:8px">${lnOptPHTML(f)}</div></div></div>`;}
function lnOptTHTML(){const o=LN_OPTT;if(!o)return '';if(o.err)return `<p class="warn">${o.err}</p>`;
 return `<div class="tbl-wrap"><table class="lnzt"><thead><tr><th>Schnitt</th><th>Tiefe (mm)</th><th>optimierte Reihen</th><th>P<sub>max</sub> vorher → nachher (kW)</th><th>P<sub>min</sub> vorher → nachher (kW)</th><th>ΔP vorher → nachher</th><th>max. |P<sub>L</sub> − P<sub>R</sub>| vorher → nachher (kW)</th><th>max. Platten gleichzeitig L / R vorher → nachher</th></tr></thead><tbody>
 ${o.report.map(r=>`<tr><td>${r.k+1}</td><td>${fmt(r.t,1)}</td><td>${r.free.length?r.free.join(', '):'–'}${r.locked.length?`<br><span class="note">gesperrt: ${r.locked.join(', ')}</span>`:''}</td><td>${fmt(r.before.mx,2)} → <b>${fmt(r.after.mx,2)}</b></td><td>${fmt(r.before.mn,2)} → <b>${fmt(r.after.mn,2)}</b></td><td>${fmt(r.before.mx-r.before.mn,2)} → <b>${fmt(r.after.mx-r.after.mn,2)}</b> kW (${fmt((r.after.mx-r.after.mn)/r.Pm*100,1)} %)</td><td>${fmt(r.before.dm,2)} → <b>${fmt(r.after.dm,2)}</b></td><td>${r.before.lm} / ${r.before.rm} → <b>${r.after.lm} / ${r.after.rm}</b></td></tr>`).join('')}
 </tbody></table></div><p class="note" style="margin:4px 0 0">Die neuen Winkellagen sind in die Zähnezahl-Tabelle übernommen; Leistung und Simulation wurden neu berechnet.</p>`;}
function lnOptPHTML(f){const o=LN_OPTP;if(!o)return '';if(o.err)return `<p class="warn">${o.err}</p>`;
 const row=x=>`<tr${x.n===o.cur?' style="background:var(--surface-2)"':''}><td>${x.n}${x.n===o.rec?' <b>empfohlen</b>':''}</td><td>${o.l>0?fmt(o.l*x.tsum,1)+' min':fmt(x.tsum*1000,2)+' ‰'}</td><td>${fmt(x.spread*100,1)} %</td><td><button type="button" class="chip-btn" data-lnapply="${x.n}">übernehmen</button></td><td>${x.cuts.map(c=>fmt(c.t,1)).join(' / ')}</td><td>${x.cuts.map(c=>fmt(c.vf,0)).join(' / ')}</td><td>${x.cuts.map(c=>fmt(c.use*100,0)).join(' / ')}</td><td>${x.cuts.map(c=>fmt(c.hm,3)).join(' / ')}</td></tr>`;
 return `<p class="note" style="margin:0 0 6px">Verfügbare Schnittleistung P<sub>M</sub> · η = ${fmt(o.Pav,1)} kW · Zieltiefe ${fmt(o.T,1)} mm · Reihengrenzen: ${o.bound.map(b=>b.nm+' '+fmt(b.y,1)).join(', ')||'–'} mm</p>
 <div class="tbl-wrap"><table class="lnzt"><thead><tr><th>Schnitte</th><th>Hauptzeit${o.l>0?'':' (rel.)'}</th><th>v<sub>f,max</sub>/v<sub>f,min</sub> − 1</th><th></th><th>Tiefen t<sub>k</sub> (mm)</th><th>v<sub>f,k</sub> (mm/min)</th><th>Leistungsausnutzung (%)</th><th>h<sub>max</sub> je Schnitt (mm)</th></tr></thead><tbody>${o.list.map(row).join('')}</tbody></table></div>${o.miss.length?`<p class="warn" style="margin:4px 0 0">Keine zulässige Aufteilung für ${o.miss.join(', ')} Schnitt${o.miss.length>1?'e':''}: Mindest-Spanungsdicke ${fmt(o.hMin,3)} mm, Maschinenleistung und Vorschubtoleranz lassen sich dort nicht gleichzeitig einhalten.</p>`:''}${!o.list.length?'<p class="warn">Keine Aufteilung erfüllt alle Bedingungen – Mindest-Spanungsdicke senken, Toleranz erhöhen oder Maschinenleistung anpassen.</p>':''}
 <p class="note" style="margin:4px 0 0">Die Vorschübe liegen höchstens ${fmt(o.tol*100,0)} % auseinander (v<sub>f,max</sub> ≤ ${fmt(1+o.tol,2)} · v<sub>f,min</sub>); ein Schnitt, der schneller fahren könnte, wird begrenzt und nutzt die Maschinenleistung dann nicht ganz (Ausnutzung &lt; 100 %). Je Schnittanzahl ist die Aufteilung mit der kürzesten Hauptzeit gezeigt${o.l>0?' (Nahtlänge '+fmt(o.l,0)+' mm)':' (ohne Nahtlänge relativ)'}; „empfohlen“ = kürzeste Hauptzeit insgesamt. Hervorgehoben: aktuelle Anzahl der Schnitte (${o.cur}). „Übernehmen“ setzt Anzahl, Tiefen und Vorschübe (auf 5 mm/min abgerundet) und rechnet neu.</p>`;}
function lnOptRender(){const f=S.forms.laengsnaht,a=document.getElementById('ln-optt'),b=document.getElementById('ln-optp');if(a)a.innerHTML=lnOptTHTML();if(b)b.innerHTML=lnOptPHTML(f);}
function lnPowRender(){const e=document.getElementById('ln-powres');if(e)e.innerHTML=lnPowResHTML(S.forms.laengsnaht);const c=document.getElementById('ln-powctl');if(c)c.innerHTML=LN_CTL;lnMark();}
function lnRefresh(f){const set=(id,h)=>{const e=document.getElementById(id);if(e&&!e.contains(document.activeElement))e.innerHTML=h;};
 set('ln-prof',lnProfHTML(f));set('ln-z',lnZHTML(f));set('ln-cuts',lnCutsHTML(f));renderOut('laengsnaht');lnDrawSim();lnPowRender();save();}
function lnRenderZ(){const e=document.getElementById('ln-z');if(e&&!e.contains(document.activeElement))e.innerHTML=lnZHTML(S.forms.laengsnaht);}
/* Längsnaht: Profilzeichnung mit Radius- und Flankenplatten */
function lnProfHTML(f){
 const G=lnGeom(f);
 if(!G.ok&&!G.err)return `<p class="note">Profil: Radius rR, Schnitttiefe ap und Öffnungswinkel αV eintragen.</p>`;
 if(G.err)return `<p class="warn">${G.err}</p>`;
 const W=560,H=400,pad=34,ap=G.ap,hP=G.hP,bw=G.w(hP)+Math.max(4,hP*0.15),k=Math.min((W/2-pad)/bw,(H-2*pad)/(hP*1.1));
 const cx=W/2,y0=pad+hP*0.06*k,X=x=>cx+x*k,Y=y=>y0+(hP-y)*k;   // Profiloberkante oben (y = hP), Werkstückoberfläche bei y = ap, Spitze unten (y = 0)
 const pts=[];for(let i=0;i<=80;i++){const y=ap*i/80;pts.push([G.w(y),y]);}
 const ptsP=[];for(let i=0;i<=80;i++){const y=hP*i/80;ptsP.push([G.w(y),y]);}
 const profP=ptsP.slice().reverse().map(([x,y])=>[-x,y]).concat(ptsP.slice(1));
 const prof=pts.slice().reverse().map(([x,y])=>[-x,y]).concat(pts.slice(1));
 const P=a=>a.map((q,i)=>(i?'L':'M')+X(q[0]).toFixed(1)+' '+Y(q[1]).toFixed(1)).join(' ');
 let g='';
 // Werkstück mit Nut
 g+=`<path d="M${pad/2} ${Y(ap)} ${P(prof).replace('M','L')} L${W-pad/2} ${Y(ap)} L${W-pad/2} ${H-6} L${pad/2} ${H-6}Z" fill="var(--surface-2)" stroke="none"/>`;
 g+=`<line x1="${X(-G.w(hP))-4}" y1="${Y(hP)}" x2="${X(G.w(hP))+4}" y2="${Y(hP)}" stroke="var(--fg)" stroke-width=".6" stroke-dasharray="4 3"/>`;
 g+=`<line x1="${pad/2}" y1="${Y(ap)}" x2="${W-pad/2}" y2="${Y(ap)}" stroke="var(--fg)" stroke-width="1"/>`;
 // Gesamtprofil: Radiusplatten (je eine Hälfte) und Flankenplatten liegen direkt auf der Profilkontur und ergeben zusammen das Profil
 const cb=Math.cos(G.be),sb=Math.sin(G.be),SW=5;
 const arc=sg=>{const a=[];for(let i=0;i<=30;i++){const t=(Math.PI/2-G.be)*i/30;a.push([X(sg*G.r*Math.sin(t)),Y(G.r*(1-Math.cos(t)))]);}return a.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' ');};
 const fp=(sg,sv)=>[X(sg*(G.xt+sv*sb)),Y(G.yt+sv*cb)];
 const tick=(sg,sv,len)=>{const [x,y]=sv==null?[X(0),Y(0)]:fp(sg,sv),nx=sv==null?0:sg*cb,ny=sv==null?1:sb;return `<line x1="${(x-nx*len).toFixed(1)}" y1="${(y-ny*len).toFixed(1)}" x2="${(x+nx*len).toFixed(1)}" y2="${(y+ny*len).toFixed(1)}" stroke="var(--fg)" stroke-width="1.2"/>`;};
 if(!G.tipOnly){g+=`<path d="${arc(-1)}" fill="none" stroke="#b3261e" stroke-width="${SW}" stroke-linecap="butt"/><path d="${arc(1)}" fill="none" stroke="#1d5fc4" stroke-width="${SW}" stroke-linecap="butt"/>`;
  g+=tick(1,null,6);}
 G.segs.forEach(([a,b],i)=>{[-1,1].forEach(sg=>{const col=i%2?'#7a5a00':'#2e7d32',p1=fp(sg,a),p2=fp(sg,b);
  g+=`<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${col}" stroke-width="${SW}" stroke-linecap="butt"/>`;
  g+=tick(sg,a,6);if(i===G.segs.length-1)g+=tick(sg,b,6);
  if(sg>0)g+=`<text x="${((p1[0]+p2[0])/2+cb*12).toFixed(1)}" y="${((p1[1]+p2[1])/2+4).toFixed(1)}" font-size="11" fill="var(--fg)">F${i+1}</text>`;});});
 // Inkrementgrenzen (feine Striche quer zur Schneide)
 const itick=(x,y,nx,ny)=>`<line x1="${(x-nx*3.5).toFixed(1)}" y1="${(y-ny*3.5).toFixed(1)}" x2="${(x+nx*3.5).toFixed(1)}" y2="${(y+ny*3.5).toFixed(1)}" stroke="var(--surface)" stroke-width="1"/>`;
 [-1,1].forEach(sg=>{
  if(!G.tipOnly)for(let k=1;k<G.nR;k++){const t=(Math.PI/2-G.be)*k/G.nR;g+=itick(X(sg*G.r*Math.sin(t)),Y(G.r*(1-Math.cos(t))),sg*Math.sin(t),Math.cos(t));}
  G.segs.forEach(([a,b])=>{for(let k=1;k<G.nI;k++){const sv=a+(b-a)*k/G.nI,[x,y]=fp(sg,sv);g+=itick(x,y,sg*cb,sb);}});});
 // Bemaßung
 const dim=(x1,y1,x2,y2,t,dx,dy,anc)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1d5fc4" stroke-width=".9" marker-start="url(#lnar)" marker-end="url(#lnar)"/><text x="${(x1+x2)/2+dx}" y="${(y1+y2)/2+dy}" font-size="12" fill="#1d5fc4" text-anchor="${anc||'middle'}">${t}</text>`;
 const xr=X(G.w(hP))+26;g+=dim(xr+78,Y(hP),xr+78,Y(0),`h<tspan font-size="9" dy="3">P</tspan><tspan dy="-3"> = ${fmt(hP,1)}</tspan>`,6,4,'start');g+=`<line x1="${X(G.b/2)}" y1="${Y(0)}" x2="${xr+6}" y2="${Y(0)}" stroke="#1d5fc4" stroke-width=".6" stroke-dasharray="3 2"/>`+dim(xr,Y(ap),xr,Y(0),`a<tspan font-size="9" dy="3">p</tspan><tspan dy="-3"> = ${fmt(ap,1)}</tspan>`,6,4,'start');
 g+=dim(X(-G.b/2),Y(ap)-14,X(G.b/2),Y(ap)-14,'b = '+fmt(G.b,1),0,-5);
 g+=`<text x="${X(0)}" y="${Y(0)+18}" font-size="12" fill="var(--fg)" text-anchor="middle">r<tspan font-size="9" dy="3">R</tspan><tspan dy="-3"> = ${fmt(G.r,1)} (je ½ links/rechts)</tspan></text>`;
 g+=`<text x="${X(0)}" y="${Y(ap*0.55)}" font-size="12" fill="var(--fg)" text-anchor="middle">α<tspan font-size="9" dy="3">V</tspan><tspan dy="-3"> = ${fmt(num(f.alphaN),1)}°</tspan></text>`;
 const leg=`<div class="ps-leg" style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;margin-top:6px"><span><i style="display:inline-block;width:14px;height:5px;background:#b3261e;vertical-align:middle"></i> Radiusplatte links</span><span><i style="display:inline-block;width:14px;height:5px;background:#1d5fc4;vertical-align:middle"></i> Radiusplatte rechts</span><span><i style="display:inline-block;width:14px;height:5px;background:#2e7d32;vertical-align:middle"></i>/<i style="display:inline-block;width:14px;height:5px;background:#7a5a00;vertical-align:middle"></i> Flankenplatten (Schneidlänge im Einsatz)</span><span>Querstriche: Plattenstöße, dort überlappen die Schneidkanten um je ü</span><span>helle Striche: Inkrementgrenzen</span></div>`;
 const incInfo=`<p class="note" style="margin:6px 0 4px">Inkremente: Radiusschneide ${G.nR} × ${fmt(G.dsR,2)} mm (Bogen je ½: ${fmt(G.arcL,2)} mm), Flankenschneide ${G.nI} × ${fmt(G.dsF,2)} mm. Im Gesamtprofil ${G.nInc} Inkremente, davon ${G.nIncCut} im Schnitt (unter a<sub>p</sub>).</p>
  <details style="margin:4px 0 8px"><summary style="cursor:pointer;font-size:13px">Inkrementtabelle (rechte Profilhälfte, links spiegelbildlich)</summary><div class="tbl-wrap"><table><thead><tr><th>Platte</th><th>Inkr.</th><th>Höhe über Spitze (mm)</th><th>x (mm)</th><th>Länge ds (mm)</th><th>κ lokal (°)</th><th>im Schnitt (mm)</th></tr></thead><tbody>${G.inc.map(q=>`<tr${q.inCut?'':' style="opacity:.5"'}><td>${q.pl==='R'?'Radius':q.pl}</td><td>${q.k}</td><td>${fmt(q.y0,2)} – ${fmt(q.y1,2)}</td><td>${fmt(q.x,2)}</td><td>${fmt(q.ds,2)}</td><td>${fmt(q.kap,1)}</td><td>${fmt(q.dsCut,2)}</td></tr>`).join('')}</tbody></table></div></details>`;
 const rows=G.segs.map(([a,b],i)=>`<tr><td>F${i+1}</td><td>${fmt(a-G.uF,1)} – ${fmt(b+G.uF,1)}</td><td>${fmt(a,1)} – ${fmt(b,1)}</td><td>${fmt(G.yt+a*cb,1)} – ${fmt(G.yt+b*cb,1)}</td></tr>`).join('');
 const info=G.tipOnly?`<p class="note">Die erforderliche Profilhöhe liegt im Bereich des Spitzenradius – es schneiden nur die Radiusplatten.</p>`:
  `<p class="note" style="margin:6px 0 4px">Erforderliche Profilhöhe h<sub>erf</sub> = max(t<sub>W</sub>, a<sub>p</sub> + Δü) = max(${G.tW>0?fmt(G.tW,1):'–'}, ${fmt(G.hProc,1)}) = ${fmt(G.hErf,1)} mm – ${G.tW>0&&G.tW>=G.hProc?'bestimmt durch die Mindest-Schnitttiefe des Werkzeugs':'bestimmt durch den tiefsten Schnitt + Δü'}. Schneidlänge im Einsatz l<sub>F</sub> = l<sub>K</sub> − 2·ü = ${fmt(G.lF,1)} mm. Tangentenpunkt y<sub>t</sub> = ${fmt(G.yt,2)} mm → <b>${G.nF} Flankenplatte${G.nF===1?'':'n'} je Seite</b>, alle mit voller Schneidlänge im Einsatz. Profilhöhe h<sub>P</sub> = ${fmt(G.hP,1)} mm (${fmt(G.hP-G.ap,1)} mm über der Schnitttiefe). Platten im Profil gesamt: ${2+2*G.nF}.</p>
  <div class="tbl-wrap"><table><thead><tr><th>Platte</th><th>Schneidkante entlang der Flanke (mm)</th><th>davon im Einsatz (mm)</th><th>Höhe über Spitze (mm)</th></tr></thead><tbody><tr><td>Radius links / rechts</td><td colspan="2">Bogen je ½</td><td>0 – ${fmt(G.yt,1)}</td></tr>${rows}</tbody></table></div>`;
 return `<div class="lbl">Profil (Achsschnitt, maßstäblich)</div><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;background:var(--surface);border:1px solid var(--line);border-radius:6px" role="img" aria-label="Profil des Längsnahtfräsers"><defs><marker id="lnar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1d5fc4"/></marker></defs>${g}</svg>${leg}${info}${G.tipOnly?'':incInfo}`;
}
PROC.laengsnaht.formula='Profil: V mit Öffnungswinkel αV, Spitzenradius rR · Tangentenpunkt yt = rR·(1−sin(αV/2)) · erforderliche Profilhöhe herf = ap + Δü · Schneidlänge im Einsatz lF = lK − 2ü · Flankenplatten je Seite nF = ⌈(herf−yt)/(lF·cos(αV/2))⌉ · Profilhöhe hP = yt + nF·lF·cos(αV/2) · A = ∫ b(y) dy · cos φs = 1 − 2·ap/Dc · vorläufig: Pc = A·vf·kc / 60·10⁶';
PROC.laengsnaht.calc=function(f){const DS=num(f.Dc),z=num(f.z),vc=num(f.vc),eta=num(f.eta)||1,l=num(f.l),C=lnCuts(f),cu=C.list[lnSel(f)]||{},fz=cu.fz;
   const G=lnGeom(f),n=vc*1000/(Math.PI*DS),vf=fz*z*n,E=engage(posForm('laengsnaht',f)),Acut=lnArea(G,cu.t)-lnArea(G,cu.tp);
   const thAll=C.list.reduce((a,c)=>a+l/c.vf,0);
   const h=E.ok?fz*(Math.cos(E.a)-Math.cos(E.e))/(E.e-E.a):NaN,kc=kcOf(f,h);
   const phs=E.ok?(E.e-E.a)*180/Math.PI:NaN,le=E.ok?DS/2*(E.e-E.a):NaN,lsp=le/num(f.lam);
   /* Liegt eine aktuelle Leistungsberechnung vor, gelten deren Werte: P̄ und M̄ = arithmetisches Mittel des Summensignals aller Platten.
      Sonst vorläufige Abschätzung über A·vf·kc. */
   let LC=null;try{LC=LN_CALC;}catch(e){}
   const rC=LC&&LC.key===lnCalcKey(f)?LC.cuts[lnSel(f)]:null,okC=rC&&!rC.err;
   const Q=Acut*vf/1000,Pc=okC?rC.Pm:Acut*vf*kc/6e7,Mc=okC?rC.Mm:Pc*30000/(Math.PI*n),Fc=Mc*2000/DS,kcE=okC&&Q>0?Pc*60000/Q:kc;
   return {tCut:cu.t,dCut:cu.d,thAll,n,vf,vfm:vf/1000,bn:G.b,A:Acut,LF:G.LF,hP:G.hP,lFe:G.lF,nF:G.nF,nInc:G.nInc,nIncCut:G.nIncCut,nFg:G.nF*2+2,phs,le,h,lsp,kc:kcE,Fc,Mc,Q,Pc,Pm:Pc/eta,th:l/vf};};
window.LN_READY=true;
if(typeof render==='function'){try{renderHeader();render();}catch(e){}}

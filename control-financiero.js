// ══════════════════════════════════════════════════════════════════════
// ─────────────────── CONTROL FINANCIERO ──────────────────────────────
// ══════════════════════════════════════════════════════════════════════
const _CF_DEF={
  limites:{cancelacion:25,devolucion:25,margenNeto:15,comisionBancaria:1,entregaEsperada:75},
  costosAdmin:{shopify:238106,tarjetas:25000,dominio:0,impuesto4x1000:83694,openai:264333,nomina:2230844,otros:0},
  moneda:{codigo:'COP',simbolo:'$'}
};
let _cfMes='',_cfCfg={},_cfMD={},_cfPrevMD={},_cfSaveT={},_cfOrdRows=[],_cfCurTab='dash';

// _gdKey/_gdKeyFallback/toast/esc/norm/_fselHtml viven en shared/app-shared.js
// _cfTK() es la clave de ESCRITURA (empresaId único). _cfBase/_cfCfgBase aceptan
// una clave arbitraria para que _leerTienda pueda probar también la vieja (slug
// del nombre) y migrar el nodo si hace falta — ver comentario en app-shared.js.
function _cfTK(){return (typeof _gdTK==='function'?_gdTK():(window.getLoginTienda?_gdKey(window.getLoginTienda()):'_'));}
function _cfBase(m,tk){return 'control_financiero/'+(tk||_cfTK())+'/'+(m||_cfMes);}
function _cfBasePath(m){return _cfBase(m);}
function _cfCfgBase(tk){return 'control_financiero/'+(tk||_cfTK())+'/config';}
function _cfCfgPath(){return _cfCfgBase();}
function _cfPad(n){return String(n).padStart(2,'0');}
// Símbolo de moneda configurado para esta tienda (cada tienda puede tener el suyo — no se consolida entre monedas)
function _cfSim(){return(_cfCfg.moneda&&_cfCfg.moneda.simbolo)||'$';}
function _cf$(n){const a=Math.abs(n||0),s=(n||0)<0?'-':'';return s+_cfSim()+' '+Math.round(a).toLocaleString('es-CO');}
// El número solo, sin símbolo: para los campos donde se escribe el importe.
// _cf$ no sirve ahí porque el símbolo cambia según el país de la tienda.
function _cfNumFmt(n){return Math.round(Math.abs(n||0)).toLocaleString('es-CO');}
function _cfM$(n){const a=Math.abs(n||0),s=(n||0)<0?'-':'';const sim=_cfSim();if(a>=1e6)return s+sim+(a/1e6).toFixed(1)+'M';if(a>=1e3)return s+sim+(a/1e3).toFixed(0)+'K';return s+sim+' '+Math.round(a).toLocaleString('es-CO');}
// Parsea número en formato colombiano "1.234.567" o "1.234.567,89" → número JS
function _cfPN(s){return parseFloat(String(s||0).replace(/\./g,'').replace(',','.'))||0;}
function _cfP(n){return((n||0).toFixed(1))+'%';}
function _cfNum(s){if(typeof s==='number')return s;const t=String(s||'0').replace(/\$/g,'').trim();return parseFloat(t.replace(/\./g,'').replace(',','.'))||0;}
// _cfMesLabel vive en shared/app-shared.js (la usa también Gestiones Diarias)
function _cfDiasEnMes(m){if(!m)return 30;const [y,mo]=m.split('-');return new Date(+y,+mo,0).getDate();}

function _cfInit(){
  const nd=new Date();
  _cfMes=nd.getFullYear()+'-'+_cfPad(nd.getMonth()+1);
  const pm=new Date(nd.getFullYear(),nd.getMonth()-1,1);
  const prevM=pm.getFullYear()+'-'+_cfPad(pm.getMonth()+1);
  const lbl=document.getElementById('cf-mes-lbl');
  if(lbl)lbl.textContent=_cfMesLabel(_cfMes);
  if(typeof _db==='undefined'){
    _cfCfg=JSON.parse(JSON.stringify(_CF_DEF));_cfMD={};_cfPrevMD={};_cfTab('dash');return;
  }
  Promise.all([
    _leerTienda(_cfCfgBase),
    _leerTienda(tk=>_cfBase(null,tk)),
    _leerTienda(tk=>_cfBase(prevM,tk))
  ]).then(([cs,ms,ps])=>{
    _cfCfg=Object.assign(JSON.parse(JSON.stringify(_CF_DEF)),cs.val()||{});
    _cfMD=ms.val()||{};_cfPrevMD=ps.val()||{};
    _cfTab('dash');
  }).catch(()=>{_cfCfg=JSON.parse(JSON.stringify(_CF_DEF));_cfMD={};_cfPrevMD={};_cfTab('dash');});
}

function _cfVolver(){
  const a=window.getLoginAsesor?window.getLoginAsesor():'';
  window._gdMostrarModeSelect(a);
}

function _cfTab(tab){
  _cfCurTab=tab;
  ['dash','mes','er','config','ordenes','analiticas'].forEach(t=>{
    const c=document.getElementById('cf-tab-'+t);
    const b=document.getElementById('cf-tab-btn-'+t);
    if(c)c.style.display=t===tab?'block':'none';
    if(b)b.classList.toggle('active',t===tab);
  });
  if(tab==='dash')_cfRenderDash();
  else if(tab==='mes')_cfRenderMes();
  else if(tab==='er')_cfRenderER();
  else if(tab==='config')_cfRenderConfig();
  else if(tab==='ordenes')_cfRenderOrdenes();
  else if(tab==='analiticas')_cfRenderAnaliticas();
}

// Carga el mes activo Y SU MES ANTERIOR (las columnas "MES ANT." siempre
// deben reflejar el mes inmediatamente anterior al que se está viendo)
function _cfCargarMes(){
  const lbl=document.getElementById('cf-mes-lbl');
  if(lbl)lbl.textContent=_cfMesLabel(_cfMes);
  _cfMD={};_cfPrevMD={};_cfXlsOrdenes=null;_cfXlsProductos=null;_cfExtracted=null;
  const [y,m]=_cfMes.split('-').map(Number);
  const pd=new Date(y,m-2,1);
  const prevM=pd.getFullYear()+'-'+_cfPad(pd.getMonth()+1);
  if(typeof _db!=='undefined'){
    document.getElementById('cf-tab-'+_cfCurTab).innerHTML='<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.8rem;">Cargando...</div>';
    Promise.all([
      _leerTienda(tk=>_cfBase(null,tk)),
      _leerTienda(tk=>_cfBase(prevM,tk))
    ]).then(([s,p])=>{
      _cfMD=s.val()||{};
      _cfPrevMD=p.val()||{};
      _cfTab(_cfCurTab);
    });
  } else _cfTab(_cfCurTab);
}
function _cfPrevMes(){
  const [y,m]=_cfMes.split('-').map(Number);
  const d=new Date(y,m-2,1);
  _cfMes=d.getFullYear()+'-'+_cfPad(d.getMonth()+1);
  _cfCargarMes();
}
function _cfNextMes(){
  const [y,m]=_cfMes.split('-').map(Number);
  const d=new Date(y,m,1);
  _cfMes=d.getFullYear()+'-'+_cfPad(d.getMonth()+1);
  _cfCargarMes();
}

// ── INFORME PDF CON CHECKLIST ────────────────────────────────────────
// Meses disponibles para elegir en el comparativo: el mes que se está viendo
// en el panel + los 24 anteriores (más reciente primero)
function _cfPdfMesesDisponibles(){
  const [y,m]=_cfMes.split('-').map(Number);
  const arr=[];
  for(let i=0;i<=24;i++){
    const d=new Date(y,m-1-i,1);
    arr.push(d.getFullYear()+'-'+_cfPad(d.getMonth()+1));
  }
  return arr;
}
function _cfMesShortLabel(m){const [y,mo]=m.split('-');return new Date(+y,+mo-1,1).toLocaleDateString('es-CO',{month:'short'}).toUpperCase().replace('.','');}
function _cfPdfCompRenderMeses(seleccionados){
  const box=document.getElementById('cfpdf-comp-meses');
  if(!box)return;
  box.innerHTML=_cfPdfMesesDisponibles().map(m=>{
    const chk=seleccionados.includes(m)?'checked':'';
    return `<label style="display:flex;align-items:center;gap:4px;font-size:.65rem;color:var(--text-2);cursor:pointer;font-weight:600;"><input type="checkbox" value="${m}" ${chk} onchange="_cfPdfCompPreview()" style="width:12px;height:12px;accent-color:var(--accent);cursor:pointer;"> ${_cfMesShortLabel(m)} ${m.split('-')[0]}</label>`;
  }).join('');
}
// Meses seleccionados, en orden cronológico ascendente (el orden en que se
// forman los pares 1ºvs2º, 2ºvs3º... no depende del orden de clic)
function _cfPdfCompSeleccion(){
  return Array.from(document.querySelectorAll('#cfpdf-comp-meses input:checked')).map(i=>i.value).sort();
}
function _cfPdfCompQuick(total){
  const [y,m]=_cfMes.split('-').map(Number);
  const sel=[];
  for(let i=total-1;i>=0;i--){
    const d=new Date(y,m-1-i,1);
    sel.push(d.getFullYear()+'-'+_cfPad(d.getMonth()+1));
  }
  _cfPdfCompRenderMeses(sel);
  _cfPdfCompPreview();
}
function _cfPdfCompPreview(){
  const sel=_cfPdfCompSeleccion();
  const prev=document.getElementById('cfpdf-comp-preview');
  if(!prev)return;
  if(sel.length<2){prev.textContent='⚠️ Selecciona al menos 2 meses para comparar.';return;}
  const pares=[];
  for(let i=0;i<sel.length-1;i++)pares.push(_cfMesShortLabel(sel[i])+' vs '+_cfMesShortLabel(sel[i+1]));
  prev.textContent=sel.length+' meses → '+pares.length+' comparaci'+(pares.length>1?'ones':'ón')+': '+pares.join(' · ');
}
function _cfPdfToggleComp(){
  const c=document.getElementById('cfpdf-comparativo').checked;
  const box=document.getElementById('cfpdf-comp-box');
  if(box)box.style.display=c?'block':'none';
}
function _cfPdfAbrir(){
  const lbl=document.getElementById('cf-pdf-mes-lbl');
  if(lbl)lbl.textContent=_cfMesLabel(_cfMes);
  const ua=_cfMD.ultimoAnalisis||_cfExtracted||null;
  const hayAnal=!!(ua&&(ua.byCiudad||ua.byTrans||ua.byProdAnal));
  document.getElementById('cf-pdf-warn').style.display=hayAnal?'none':'block';
  document.getElementById('cfpdf-comparativo').checked=true;
  _cfPdfToggleComp();
  // Preselección: mes anterior + mes actual del panel (comportamiento clásico)
  _cfPdfCompQuick(2);
  document.getElementById('cf-pdf-modal').style.display='flex';
}

async function _cfPdfGenerar(){
  const btn=document.getElementById('cf-pdf-btn-gen');
  btn.disabled=true;btn.textContent='Generando...';
  try{
  const sel={
    resumen:document.getElementById('cfpdf-resumen').checked,
    er:document.getElementById('cfpdf-er').checked,
    ciudades:document.getElementById('cfpdf-ciudades').checked,
    trans:document.getElementById('cfpdf-trans').checked,
    productos:document.getElementById('cfpdf-productos').checked,
    comparativo:document.getElementById('cfpdf-comparativo').checked&&_cfPdfCompSeleccion().length>=2
  };
  const r=_cfCalc();
  const ua=_cfMD.ultimoAnalisis||_cfExtracted||{};
  const tienda=(window.getLoginTienda?window.getLoginTienda():'')||'—';

  // ── Documento SIEMPRE claro (independiente del tema) ──
  const C={t1:'#0D1117',t2:'#4A5568',t3:'#8B949E',ok:'#1DA855',bad:'#D42E3C',warn:'#C2951E',info:'#2456C4',brd:'#e2e8f0'};
  const secT=t=>`<div style="font-size:13px;font-weight:800;color:${C.t1};border-bottom:2px solid ${C.t1};padding-bottom:5px;margin:22px 0 10px;">${t}</div>`;
  const kv=(l,v,c)=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid ${C.brd};font-size:11px;"><span style="color:${C.t2};">${l}</span><span style="font-weight:800;color:${c||C.t1};font-family:'Courier New',monospace;">${v}</span></div>`;
  const ef=(ent,proc,dev)=>{const d=ent+proc+dev;return d>0?(ent/d*100).toFixed(1)+'%':'—';};
  const efC=v=>{const n=parseFloat(v);return isNaN(n)?C.t3:n>=70?C.ok:n>=50?C.warn:C.bad;};
  const tbl=(cols,rows)=>`<table style="width:100%;border-collapse:collapse;margin-top:4px;">
    <thead><tr>${cols.map(c=>`<th style="background:#0D1117;color:white;padding:6px 8px;font-size:9px;text-align:${c.a||'center'};white-space:nowrap;">${c.l}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table>`;
  const td=(v,a,c,b)=>`<td style="padding:4px 8px;font-size:10px;text-align:${a||'center'};border-bottom:1px solid ${C.brd};color:${c||C.t1};${b?'font-weight:800;':''}">${v}</td>`;

  let html=`<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #0D1117;padding-bottom:10px;">
    <div><div style="font-size:19px;font-weight:900;color:${C.t1};">💹 CONTROL FINANCIERO</div>
    <div style="font-size:11px;color:${C.t2};margin-top:2px;">🏪 ${tienda} · ${_cfMesLabel(_cfMes)}</div></div>
    <div style="font-size:9px;color:${C.t3};">Generado: ${new Date().toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'})}</div>
  </div>`;

  if(sel.resumen){
    html+=secT('📊 RESUMEN CONTROL MES');
    html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 30px;">
      <div>${kv('Facturación total',_cf$(r.shopM))}
      ${kv('Pedidos WPP',r.wppN)}${kv('Pedidos Shopify',r.shopN)}${kv('Total pedidos del mes',r.totalN,C.info)}
      ${kv('Entregados',r.entN+' · '+_cf$(r.entM),C.ok)}${kv('En proceso',r.procN+' · '+_cf$(r.procM),C.info)}
      ${kv('Devueltos',r.devN+' · '+_cf$(r.devM),C.bad)}${kv('Cancelados (mes − ent − proc − dev)',r.cancN,C.warn)}</div>
      <div>${kv('Ads Facebook',_cf$(r.adsFB))}${kv('Ads TikTok',_cf$(r.adsTT))}
      ${kv('Fee bancaria ('+(r.lim.comisionBancaria||1)+'%)',_cf$(r.fee))}${kv('Total Ads + Fee',_cf$(r.adsFee),C.info)}
      ${kv('CPA (Ads / total pedidos)',_cf$(r.cpaBM))}${kv('CPA entregado',_cf$(r.cpaEnt))}
      ${kv('% Entrega',_cfP(r.entRate),r.entRate>=(r.lim.entregaEsperada||75)?C.ok:C.warn)}
      ${kv('% Devolución',_cfP(r.devRate),r.devRate<=r.lim.devolucion?C.ok:C.bad)}
      ${kv('% Cancelación',_cfP(r.cancRate),r.cancRate<=r.lim.cancelacion?C.ok:C.bad)}
      ${kv('AOV entregado',_cf$(r.aov))}</div>
    </div>`;
  }

  if(sel.comparativo){
    const mesesSel=_cfPdfCompSeleccion(); // orden cronológico ascendente
    const nd0=new Date();
    const mesRealActual=nd0.getFullYear()+'-'+_cfPad(nd0.getMonth()+1);
    const [cy0,cm0]=_cfMes.split('-').map(Number);
    const pd0=new Date(cy0,cm0-2,1);
    const prevM0=pd0.getFullYear()+'-'+_cfPad(pd0.getMonth()+1);
    // Reutiliza lo que ya está en memoria (mes visible + su mes anterior) y
    // trae de Firebase sólo los meses del combo que falten
    const docsCache={};
    docsCache[_cfMes]=_cfMD;
    if(_cfPrevMD&&Object.keys(_cfPrevMD).length)docsCache[prevM0]=_cfPrevMD;
    const faltantes=mesesSel.filter(m=>!docsCache[m]);
    if(faltantes.length){
      const traidos=await _cfFetchMesesDoc(faltantes);
      faltantes.forEach((m,i)=>{docsCache[m]=traidos[i];});
    }
    const fmtV=v=>v===null?'—':(v>=0?'+':'')+v.toFixed(1)+'%';
    const vc=(v,inv)=>v===null?C.t3:(inv?(v>=0?C.bad:C.ok):(v>=0?C.ok:C.bad));
    const varPct2=(a,b)=>b>0?((a-b)/b*100):null;
    const item=t=>`<div style="font-size:10.5px;color:${C.t1};line-height:1.6;margin:8px 0;">${t}</div>`;
    for(let i=0;i<mesesSel.length-1;i++){
      const mA=mesesSel[i], mB=mesesSel[i+1];
      const docA=docsCache[mA]||{}, docB=docsCache[mB]||{};
      const esEnCurso=mB===mesRealActual;
      const cd=_cfComparativoPar(docA,docB,mA,mB,esEnCurso);
      const rMB=_cfCalcResumenMes(docB);
      const rMA=_cfCalcResumenMes(docA);
      // Veredicto general: facturación + pedidos mandan
      let vTxt='➡ MIXTO — señales encontradas frente a '+cd.mesAntLbl, vCol=C.warn;
      if(cd.vFact!==null&&cd.vPed!==null){
        if(cd.vFact>=0&&cd.vPed>=0){vTxt='📈 CRECIMIENTO — vamos por encima de '+cd.mesAntLbl;vCol=C.ok;}
        else if(cd.vFact<0&&cd.vPed<0){vTxt='📉 DISMINUCIÓN — vamos por debajo de '+cd.mesAntLbl;vCol=C.bad;}
      }
      html+=secT('📈 '+cd.mesActLbl+' vs '+cd.mesAntLbl+(cd.esMesActual?' — CORTE AL DÍA '+cd.corte:''));
      html+=`<div style="background:${vCol}18;border:2px solid ${vCol};border-radius:8px;padding:9px 14px;font-size:13px;font-weight:900;color:${vCol};margin-bottom:10px;">${vTxt}</div>`;
      // Encabezado del mes estilo informe operativo
      const pProc2=rMB.desp>0?(rMB.procN/rMB.desp*100).toFixed(2):'0';
      html+=`<div style="font-size:12px;font-weight:900;color:${C.t1};margin:6px 0 4px;">🗓️ ${cd.mesActLbl}</div>
      <div style="font-size:10.5px;color:${C.t1};line-height:1.7;margin-bottom:8px;">
        ● Despachados: <b style="color:${C.t1}">${rMB.desp}</b> pedidos (Ent+Proc+Dev)<br>
        ● Entregas: <b style="color:${C.ok}">${_cfP(rMB.entRate)}</b> — ${_cf$(rMB.entM)}<br>
        ● Devoluciones: <b style="color:${C.bad}">${_cfP(rMB.devRate)}</b> — ${_cf$(rMB.devM)}<br>
        ● Cancelaciones: <b style="color:${C.warn}">${_cfP(rMB.cancRate)}</b> — ${rMB.cancN} pedidos<br>
        ● En procesamiento: <b style="color:${C.info}">${pProc2}%</b> — ${_cf$(rMB.procM)}
      </div>`;
      // Tabla compacta de variaciones — CPA, Volumen, Gasto Ads, Cancelaciones y Despachados
      const vDesp=varPct2(rMB.desp,rMA.desp);
      const vCancPts=rMB.cancRate-rMA.cancRate;
      const fmtPtos=v=>(v>=0?'+':'')+v.toFixed(1)+' pts';
      html+=tbl(
        [{l:'MÉTRICA',a:'left'},{l:cd.mesAntLbl+(cd.esMesActual?' (día 1-'+cd.corte+')':'')},{l:cd.mesActLbl},{l:'VARIACIÓN'}],
        [
          `<tr>${td('💰 Facturación','left',C.t1,true)}${td(_cf$(cd.ant.fact),'center',C.t3)}${td(_cf$(cd.act.fact),'center',C.t1,true)}${td(fmtV(cd.vFact),'center',vc(cd.vFact),true)}</tr>`,
          `<tr style="background:#f6f8fa;">${td('🛒 Volumen (pedidos)','left',C.t1,true)}${td(cd.ant.ped,'center',C.t3)}${td(cd.act.ped,'center',C.t1,true)}${td(fmtV(cd.vPed),'center',vc(cd.vPed),true)}</tr>`,
          `<tr>${td('📦 Despachados (Ent+Proc+Dev)','left',C.t1,true)}${td(rMA.desp,'center',C.t3)}${td(rMB.desp,'center',C.t1,true)}${td(fmtV(vDesp),'center',vc(vDesp),true)}</tr>`,
          `<tr style="background:#f6f8fa;">${td('📣 Gasto Ads (Ads+Fee)','left',C.t1,true)}${td(_cf$(cd.ant.adsFee),'center',C.t3)}${td(_cf$(cd.act.adsFee),'center',C.t1,true)}${td(fmtV(cd.vAds),'center',C.info,true)}</tr>`,
          `<tr>${td('🎯 CPA (Ads+Fee ÷ pedidos)','left',C.t1,true)}${td(_cf$(cd.ant.cpa),'center',C.t3)}${td(_cf$(cd.act.cpa),'center',C.t1,true)}${td(fmtV(cd.vCpa),'center',vc(cd.vCpa,true),true)}</tr>`,
          `<tr style="background:#f6f8fa;">${td('❌ % Cancelación','left',C.t1,true)}${td(_cfP(rMA.cancRate),'center',C.t3)}${td(_cfP(rMB.cancRate),'center',C.t1,true)}${td(fmtPtos(vCancPts),'center',vCancPts>=0?C.bad:C.ok,true)}</tr>`
        ]
      );
      // Items narrativos con lectura automática
      const cpaMejora=cd.vCpa!==null&&cd.vCpa<0;
      html+='<div style="margin-top:10px;">';
      if(cd.ant.fact===0&&cd.ant.ped===0&&cd.ant.adsFee===0)html+=item(`⚠️ <b>${cd.mesAntLbl}</b> no tiene datos registrados en Control Mes (facturación, pedidos y Ads en $0) — por eso el CPA y el gasto publicitario no se pueden comparar (variación indefinida); sólo se muestra el volumen absoluto de ${cd.mesActLbl}.`);
      if(cd.vCpa!==null)html+=item(`✅ El CPA lo llevamos en <b>${_cf$(cd.act.cpa)}</b>. ${cpaMejora
        ?`Hemos <b style="color:${C.ok}">mejorado</b> este costo respecto al CPA de ${cd.mesAntLbl} (${_cf$(cd.ant.cpa)}, ${fmtV(cd.vCpa)}). El objetivo es mantenerlo en el costo actual; para esto es clave continuar la gestión de recuperación de carritos.`
        :`Hemos <b style="color:${C.bad}">empeorado</b> respecto al CPA de ${cd.mesAntLbl} (${_cf$(cd.ant.cpa)}, ${fmtV(cd.vCpa)}). Hay que revisar la eficiencia de las campañas y reforzar la recuperación de carritos para bajarlo.`}`);
      const difPed=cd.act.ped-cd.ant.ped, difFact=cd.act.fact-cd.ant.fact;
      html+=item(`✅ El volumen de pedidos de ${cd.mesActLbl} respecto de ${cd.mesAntLbl}${cd.esMesActual?' a esta misma fecha':''} (${cd.ant.ped} pedidos) vamos en <b style="color:${difPed>=0?C.ok:C.bad}">${difPed>=0?'+':''}${difPed} pedidos</b> y en dinero vamos en <b style="color:${difFact>=0?C.ok:C.bad}">${difFact>=0?'+':''}${_cf$(difFact)}</b>. ${difPed>=0&&difFact>=0
        ?'Hay que continuar de este modo para un crecimiento operativo.'
        :'Hay que ajustar la operación y la inversión publicitaria para recuperar el ritmo.'}`);
      if(cd.vAds!==null){
        let lecturaAds='';
        if(cd.vAds>0&&cpaMejora)lecturaAds='Se está invirtiendo más con mejor costo por pedido — escalado sano.';
        else if(cd.vAds>0&&!cpaMejora)lecturaAds='Se invierte más pero el CPA también subió — revisar campañas antes de seguir escalando.';
        else if(cd.vAds<=0&&cpaMejora)lecturaAds='Se invierte menos y el CPA mejoró — eficiencia ganada.';
        else lecturaAds='Se invierte menos pero el CPA subió — el problema no es el presupuesto sino la conversión.';
        html+=item(`✅ El gasto publicitario (Ads + fee) va en <b>${_cf$(cd.act.adsFee)}</b> frente a ${_cf$(cd.ant.adsFee)} de ${cd.mesAntLbl} (${fmtV(cd.vAds)}). ${lecturaAds}`);
      }
      if(rMB.cancRate>(rMB.lim.cancelacion||25))html+=item(`⚠️ <b style="color:${C.bad}">OJO con las órdenes canceladas</b> en ${cd.mesActLbl}: van en <b>${_cfP(rMB.cancRate)}</b>, por encima del objetivo del ${_cfP(rMB.lim.cancelacion||25)}. Hay que presionar la gestión de confirmaciones para no repetir el mes pasado.`);
      else if(rMB.cancRate>(rMB.lim.cancelacion||25)*0.7)html+=item(`⚠️ Atención a las cancelaciones en ${cd.mesActLbl}: van en <b>${_cfP(rMB.cancRate)}</b>, acercándose al límite del ${_cfP(rMB.lim.cancelacion||25)}. Mantener presión en la gestión de confirmaciones.`);
      html+='</div>';
      if(cd.esMesActual)html+=`<div style="font-size:8px;color:${C.t3};margin-top:4px;">Comparación al mismo corte de día (1-${cd.corte}) para no distorsionar. ${cd.mesAntLbl} completo: ${_cf$(cd.antFull.fact)} · ${cd.antFull.ped} pedidos · ${_cf$(cd.antFull.adsFee)} en Ads.</div>`;
    }
  }

  if(sel.er){
    html+=secT('📈 ESTADO DE RESULTADOS');
    html+=kv('Ingresos entregados ('+r.entN+' pedidos)',_cf$(r.entM),C.ok);
    html+=kv('(−) Costo productos entregados','-'+_cf$(r.cogs),C.bad);
    html+=kv('UTILIDAD BRUTA',_cf$(r.utilBruta),r.utilBruta>=0?C.ok:C.bad);
    html+=kv('(−) Costos administrativos','-'+_cf$(r.totalAdmin),C.bad);
    html+=kv('(−) Costos de venta (fletes + ChateaPro + otros)','-'+_cf$(r.totalVentas),C.bad);
    html+=kv('UTILIDAD ANTES DE ADS',_cf$(r.utilAntesAds),r.utilAntesAds>=0?C.ok:C.bad);
    html+=kv('(−) Publicidad Ads + Fee','-'+_cf$(r.adsFee),C.bad);
    html+=`<div style="display:flex;justify-content:space-between;background:${r.utilNeta>=0?'#e8f7ee':'#fdeaea'};border:2px solid ${r.utilNeta>=0?C.ok:C.bad};border-radius:8px;padding:10px 14px;margin-top:10px;">
      <span style="font-size:13px;font-weight:900;color:${C.t1};">💰 UTILIDAD NETA</span>
      <span style="font-size:15px;font-weight:900;font-family:'Courier New',monospace;color:${r.utilNeta>=0?C.ok:C.bad};">${_cf$(r.utilNeta)}</span></div>`;
    html+=kv('Margen neto',_cfP(r.margen),r.margen>=(r.lim.margenNeto||15)?C.ok:C.warn);
    html+=kv('CPA break-even',_cf$(r.cpaBreak),C.info);
  }

  const analSec=(titulo,data,nameKey)=>{
    const items=(nameKey==='prod'?Object.values(data):Object.entries(data).map(([n,d])=>({n,...d})))
      .map(x=>({...x,_nom:nameKey==='prod'?x.prod:x.n,_desp:(x.ent||0)+(x.proc||0)+(x.dev||0)}))
      .sort((a,b)=>(b.num||0)-(a.num||0)).slice(0,15);
    if(!items.length)return '';
    // % Devolución = devueltos ÷ despachados · semáforo rojo ≥25%, ámbar ≥15%
    const pdC=v=>{const n=parseFloat(v);return isNaN(n)?C.t3:n>=25?C.bad:n>=15?C.warn:C.t2;};
    const conFlete=nameKey==='n'; // ciudades/transportadoras tienen flete; productos no
    const esProd=nameKey==='prod';
    return secT(titulo)+tbl(
      [{l:'#'},{l:esProd?'Producto':'Nombre',a:'left'},{l:esProd?'Unidades':'Total'},{l:'Entregados'},{l:'En proceso'},{l:'Devueltos'},{l:'% Devolución'},{l:'Efectividad'},...(conFlete?[{l:'Flete Prom.'}]:[])],
      items.map((x,i)=>{
        const e=ef(x.ent||0,x.proc||0,x.dev||0);
        const pd=x._desp>0?((x.dev||0)/x._desp*100).toFixed(1)+'%':'—';
        const fp=conFlete?(x._desp>0&&(x.flete||0)>0?_cf$((x.flete||0)/x._desp):'—'):'';
        return `<tr style="${i%2?'background:#f6f8fa;':''}">${td(i+1,'center',C.t3)}${td(x._nom,'left',C.t1,true)}${td(x.num||0,'center',C.t1,true)}${td(x.ent||0,'center',C.ok)}${td(x.proc||0,'center',C.info)}${td(x.dev||0,'center',C.bad)}${td(pd,'center',pdC(pd),true)}${td(e,'center',efC(e),true)}${conFlete?td(fp,'center',C.warn,true):''}</tr>`;})
    )+`<div style="font-size:8px;color:${C.t3};margin-top:3px;">${esProd?'Unidades, Entregados, En proceso, Devueltos y Cancelados son cantidad de unidades (no de pedidos). ':''}Efectividad = Entregados ÷ Despachados · % Devolución = Devueltos ÷ Despachados (excluyen cancelados/pendientes)${conFlete?' · Flete Prom. = flete acumulado ÷ Despachados':''}</div>`;
  };
  if(sel.ciudades&&ua.byCiudad)html+=analSec('🏙️ ANALÍTICA DE CIUDADES — TOP 15',ua.byCiudad,'n');
  if(sel.trans&&ua.byTrans)html+=analSec('🚛 ANALÍTICA DE TRANSPORTADORAS',ua.byTrans,'n');
  if(sel.productos&&ua.byProdAnal)html+=analSec('📦 ANALÍTICA DE PRODUCTOS — TOP 15',ua.byProdAnal,'prod');

  // Render offscreen → canvas → PDF multipágina
  const cont=document.createElement('div');
  cont.style.cssText='position:fixed;left:-10000px;top:0;width:900px;background:#ffffff;color:#0D1117;padding:34px 38px;font-family:Segoe UI,Arial,sans-serif;z-index:-1;';
  cont.innerHTML=html;
  document.body.appendChild(cont);
  html2canvas(cont,{scale:1.6,backgroundColor:'#ffffff'}).then(canvas=>{
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF('p','mm','a4');
    const imgW=190, pageH=277, mx=10, my=10;
    const imgH=canvas.height*imgW/canvas.width;
    // JPEG comprimido: un informe en PNG scale 2 pesaba ~16MB
    const img=canvas.toDataURL('image/jpeg',0.85);
    let restante=imgH, pos=my;
    pdf.addImage(img,'JPEG',mx,pos,imgW,imgH);
    restante-=pageH;
    while(restante>0){
      pos=my-(imgH-restante);
      pdf.addPage();
      pdf.addImage(img,'JPEG',mx,pos,imgW,imgH);
      restante-=pageH;
    }
    pdf.save('Informe_CF_'+tienda.replace(/\s+/g,'_')+'_'+_cfMes+'.pdf');
    cont.remove();
    btn.disabled=false;btn.textContent='⬇ Descargar PDF';
    document.getElementById('cf-pdf-modal').style.display='none';
    toast('📄 Informe PDF descargado');
  }).catch(e=>{
    cont.remove();
    btn.disabled=false;btn.textContent='⬇ Descargar PDF';
    toast('⚠️ Error generando PDF: '+e.message);
  });
  }catch(e){
    btn.disabled=false;btn.textContent='⬇ Descargar PDF';
    toast('⚠️ Error generando el informe: '+e.message);
  }
}

// ── Save helpers ────────────────────────────────────────────────────
function _cfSave(sub,val,delay){
  delay=delay||800;
  if(_cfSaveT[sub])clearTimeout(_cfSaveT[sub]);
  _cfSaveT[sub]=setTimeout(()=>{
    if(typeof _db==='undefined')return;
    if(!_tiendaLista('control financiero'))return;
    _db.ref(_cfBasePath()+'/'+sub).set(val);
  },delay);
}
function _cfSaveCfg(){
  if(typeof _db==='undefined')return;
  clearTimeout(_cfSaveT['cfg']);
  _cfSaveT['cfg']=setTimeout(()=>{
    if(!_tiendaLista('configuración financiera'))return;
    _db.ref(_cfCfgPath()).set(_cfCfg);
  },600);
}

// ── Compute ─────────────────────────────────────────────────────────
function _cfCalc(){
  const cod=_cfMD.cod||{};
  const costos=_cfMD.costos||{};
  const dias=_cfMD.dias||{};
  const metas=_cfMD.metas||{};
  const lim=(_cfCfg.limites||_CF_DEF.limites);
  const ca=(_cfCfg.costosAdmin||_CF_DEF.costosAdmin);

  const entM=(cod.entregados||{}).monto||0, entN=(cod.entregados||{}).num||0;
  const procM=(cod.enProceso||{}).monto||0, procN=(cod.enProceso||{}).num||0;
  const devM=(cod.devueltos||{}).monto||0, devN=(cod.devueltos||{}).num||0;
  const desp=entN+procN+devN;

  // Diarios: shopifyMonto=facturación, wppNum=ChateaPro, shopifyNum=Shopify
  let shopM=0, wppN=0, shopN=0, adsFB=0, adsTT=0;
  Object.values(dias).forEach(d=>{
    shopM+=(d.shopifyMonto||0)+(d.wppMonto||0);
    wppN+=d.wppNum||0;
    shopN+=d.shopifyNum||0;
    adsFB+=d.adsFB||0;
    adsTT+=d.adsTiktok||0;
  });
  const totalN=wppN+shopN; // total pedidos facturados (WPP + Shopify)
  // Cancelados: derivado de los pedidos del mes (registro diario) menos
  // los que salieron: total − entregados − en proceso − devueltos.
  // Solo aplica si hay datos COD cargados (desp>0); si no, quedaría todo el mes como "cancelado".
  const cancN=desp>0?Math.max(0,totalN-entN-procN-devN):0;
  const adsT=adsFB+adsTT, fee=adsT*(lim.comisionBancaria||1)/100, adsFee=adsT+fee;

  // Publicidad del Estado de Resultados: se puede escribir a mano, porque lo
  // que finalmente se le paga a Facebook y a TikTok no siempre coincide con lo
  // que se fue cargando día a día. Si no se escribió nada, se usa el diario;
  // un 0 escrito a mano SÍ vale 0, por eso se distingue vacío de cero.
  // El Control Mes sigue con los diarios: acá solo cambia el ER.
  const _manual = v => (v===null||v===undefined||v==='') ? null : _cfNum(v);
  const adsFBm = _manual(costos.adsFBER), adsTTm = _manual(costos.adsTTER);
  const adsFBER = adsFBm!==null ? adsFBm : adsFB;
  const adsTTER = adsTTm!==null ? adsTTm : adsTT;
  const adsTER = adsFBER+adsTTER;
  const feeER = adsTER*(lim.comisionBancaria||1)/100;
  const adsFeeER = adsTER+feeER;

  const totalAdmin=(ca.shopify||0)+(ca.tarjetas||0)+(ca.dominio||0)+(ca.impuesto4x1000||0)+(ca.openai||0)+(ca.nomina||0)+(ca.otros||0);
  const flEnt=costos.fleteEntregados||0, flProc=costos.fleteEnProceso||0, flDev=costos.fleteDevueltos||0;
  const totalVentas=flEnt+flProc+flDev+(costos.chatepro||0)+(costos.otrosVentas||0);
  const cogs=costos.cogsEntregados||0;

  const utilBruta=entM-cogs;
  const utilAntesAds=utilBruta-totalAdmin-totalVentas;
  // La utilidad se calcula con la publicidad del ER: es la que refleja lo que
  // de verdad se pagó. Los CPA de más abajo siguen con el diario, porque son
  // los del Control Mes.
  const utilNeta=utilAntesAds-adsFeeER;
  const margen=entM>0?(utilNeta/entM*100):0;
  const aov=entN>0?entM/entN:0;
  const aovShop=shopM>0&&totalN>0?shopM/totalN:0; // AOV de Shopify (facturación diaria)

  const cpaBreak=entN>0?utilAntesAds/entN:0;
  const cpaObj=entN>0?entM*(lim.margenNeto/100)/entN:0;
  const cpaEnt=entN>0?adsFee/entN:0;
  const cpaDesp=desp>0?adsFee/desp:0;
  // CPA sobre pedidos totales facturados (WPP + Shopify)
  const cpaBM=totalN>0?adsFee/totalN:0;

  // % cancelación sobre pedidos facturados totales
  const cancRate=totalN>0?cancN/totalN*100:0;
  const devRate=desp>0?devN/desp*100:0;
  const entRate=desp>0?entN/desp*100:0;

  // Metas: shopifyNum = meta de pedidos totales (WPP + Shopify)
  const pShopM=metas.shopifyMonto>0?shopM/metas.shopifyMonto*100:0;
  const pShopN=metas.shopifyNum>0?totalN/metas.shopifyNum*100:0;
  const pWppN=metas.wppNum>0?wppN/metas.wppNum*100:0;
  const pShopOnly=metas.shopifyNumSolo>0?shopN/metas.shopifyNumSolo*100:0;
  const pEntM=metas.entregadoMonto>0?entM/metas.entregadoMonto*100:0;
  const pEntN=metas.entregadoNum>0?entN/metas.entregadoNum*100:0;

  let estado='🛑 NO ESCALAR',estadoC='bad';
  if(utilNeta>0&&margen>=(lim.margenNeto||15)){estado='✅ ESCALAR';estadoC='ok';}
  else if(utilAntesAds>0&&margen>0){estado='⚠️ CAUTELOSO';estadoC='warn';}

  return {entM,entN,aov,aovShop,procM,procN,devM,devN,cancN,desp,
    shopM,wppN,shopN,totalN,adsFB,adsTT,adsT,fee,adsFee,
    adsFBER,adsTTER,adsTER,feeER,adsFeeER,
    adsFBEsManual:adsFBm!==null, adsTTEsManual:adsTTm!==null,
    totalAdmin,flEnt,flProc,flDev,totalVentas,cogs,
    utilBruta,utilAntesAds,utilNeta,margen,
    cpaBreak,cpaObj,cpaEnt,cpaDesp,cpaBM,
    cancRate,devRate,entRate,
    pShopM,pShopN,pWppN,pShopOnly,pEntM,pEntN,
    estado,estadoC,lim,metas,costos,ca};
}

// ── DASH ─────────────────────────────────────────────────────────────
function _cfRenderDash(){
  const el=document.getElementById('cf-tab-dash');
  const r=_cfCalc();
  const kpis=[
    {lbl:'Facturación total',val:_cfM$(r.shopM),c:'#1e293b',sub:'WPP '+r.wppN+' · Shop '+r.shopN+' · Total '+r.totalN+' pdos.'},
    {lbl:'💬 Pedidos WPP',val:r.wppN,c:'#92400e',sub:r.metas.wppNum?Math.round(r.pWppN)+'% de meta '+r.metas.wppNum:'ChateaPro'},
    {lbl:'🛍️ Pedidos Shopify',val:r.shopN,c:'#1d4ed8',sub:r.metas.shopifyNumSolo?Math.round(r.pShopOnly)+'% de meta '+r.metas.shopifyNumSolo:'Shopify'},
    {lbl:'Ingresos Entregados',val:_cfM$(r.entM),c:'#16a34a',sub:r.entN+' pedidos · AOV '+_cf$(r.aov)},
    {lbl:'Utilidad Neta',val:_cfM$(r.utilNeta),c:r.utilNeta<0?'#dc2626':'#16a34a',sub:'Antes Ads: '+_cfM$(r.utilAntesAds)},
    {lbl:'Margen Neto',val:_cfP(r.margen),c:r.margen>=(r.lim.margenNeto||15)?'#16a34a':r.margen>0?'#d97706':'#dc2626',sub:'Objetivo: '+_cfP(r.lim.margenNeto)},
    {lbl:'Ads FB + TikTok + Fee',val:_cfM$(r.adsFee),c:'#7c3aed',sub:'FB: '+_cfM$(r.adsFB)+' · TikTok: '+_cfM$(r.adsTT)},
    {lbl:'CPA BM (Ads/Total#)',val:_cf$(r.cpaBM),c:'#0891b2',sub:'Break-even: '+_cf$(r.cpaBreak)},
    {lbl:'CPA Entregado',val:_cf$(r.cpaEnt),c:'#0284c7',sub:'CPA objetivo: '+_cf$(r.cpaObj)},
    {lbl:'% Cancelación',val:_cfP(r.cancRate),c:r.cancRate<=r.lim.cancelacion?'#16a34a':'#dc2626',sub:'Límite: '+_cfP(r.lim.cancelacion)},
    {lbl:'% Devolución',val:_cfP(r.devRate),c:r.devRate<=r.lim.devolucion?'#16a34a':'#dc2626',sub:'Límite: '+_cfP(r.lim.devolucion)},
    {lbl:'% Entrega',val:_cfP(r.entRate),c:r.entRate>=(r.lim.entregaEsperada||75)?'#16a34a':'#d97706',sub:'Esperado: '+_cfP(r.lim.entregaEsperada)},
  ];
  const kCard=k=>`<div class="cf-kpi" style="border-left-color:${k.c}"><div class="cf-kpi-val" style="color:${k.c}">${k.val}</div><div class="cf-kpi-lbl">${k.lbl}</div>${k.sub?'<div class="cf-kpi-sub">'+k.sub+'</div>':''}</div>`;
  const alerts=[
    {m:'Cancelación',v:r.cancRate,lim:r.lim.cancelacion,ok:r.cancRate<=r.lim.cancelacion,ineq:'≤'},
    {m:'Devolución',v:r.devRate,lim:r.lim.devolucion,ok:r.devRate<=r.lim.devolucion,ineq:'≤'},
    {m:'Margen neto',v:r.margen,lim:r.lim.margenNeto,ok:r.margen>=r.lim.margenNeto,ineq:'≥'},
    {m:'% Entrega esperada',v:r.entRate,lim:r.lim.entregaEsperada,ok:r.entRate>=r.lim.entregaEsperada,ineq:'≥'},
  ];
  const aHtml=alerts.map(a=>`<div class="cf-alert ${a.ok?'ok':'bad'}">
    <span>${a.ok?'✅':'⚠️'}</span>
    <div><b>${a.m}</b>: ${_cfP(a.v)} <span style="color:var(--text-3)">(meta ${a.ineq}${_cfP(a.lim)})</span></div>
  </div>`).join('');
  const prog=(lbl,pct,val,meta,c2)=>{const w=Math.min(100,pct||0);const c=c2||(w>=100?'#16a34a':w>=60?'#d97706':'#dc2626');return `<div class="cf-prog-row"><div class="cf-prog-lbl">${lbl}</div><div class="cf-prog-bar-w"><div class="cf-prog-bar" style="width:${w}%;background:${c};"></div></div><div class="cf-prog-pct" style="color:${c}">${Math.round(w)}%</div></div><div style="font-size:.61rem;color:var(--text-3);margin-top:-4px;margin-bottom:6px;padding-left:128px;">${val} / ${meta}</div>`;};
  const codCards=[
    {lbl:'ENTREGADOS',val:r.entN+' · '+_cfM$(r.entM),c:'#16a34a'},
    {lbl:'EN PROCESO',val:r.procN+' · '+_cfM$(r.procM),c:'#0891b2'},
    {lbl:'DEVUELTOS',val:r.devN+' · '+_cfM$(r.devM),c:'#dc2626'},
    {lbl:'CANCELADOS',val:r.cancN+' pedidos',c:'#d97706'},
    {lbl:'DESPACHADOS',val:r.desp+' pedidos',c:'#6366f1'},
    {lbl:'CANCELADOS/PEND.',val:r.cancN+' pedidos',c:'#d97706'},
  ].map(x=>`<div style="background:var(--bg-hover);border-radius:8px;padding:10px 12px;border-left:3px solid ${x.c}"><div style="font-size:.6rem;color:var(--text-2);font-weight:700;text-transform:uppercase;">${x.lbl}</div><div style="font-size:.76rem;font-weight:800;color:${x.c};margin-top:3px;">${x.val}</div></div>`).join('');

  // Mix de canales (barras apiladas)
  const mixWpp=r.totalN>0?Math.round(r.wppN/r.totalN*100):0;
  const mixShop=r.totalN>0?Math.round(r.shopN/r.totalN*100):0;
  const mixSection=r.totalN>0?`<div class="cf-sec"><div class="cf-sec-hdr">📊 Mix de canales — ${r.totalN} pedidos totales MTD</div><div class="cf-sec-body">
    <div style="display:flex;height:22px;border-radius:8px;overflow:hidden;margin-bottom:8px;">
      <div style="width:${mixWpp}%;background:#d97706;"></div>
      <div style="width:${mixShop}%;background:#2563eb;"></div>
    </div>
    <div style="display:flex;gap:14px;font-size:.68rem;">
      <span style="color:var(--warning);">💬 WPP: <b>${r.wppN}</b> (${mixWpp}%)</span>
      <span style="color:var(--accent);">🛍️ Shopify: <b>${r.shopN}</b> (${mixShop}%)</span>
      <span style="color:var(--text-3);margin-left:auto;">Facturación: ${_cfM$(r.shopM)}</span>
    </div>
  </div></div>`:'';

  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
      <div><div style="font-size:.9rem;font-weight:900;color:var(--text-1);">${_cfMesLabel(_cfMes)}</div>
        <div style="font-size:.6rem;color:var(--text-3);">Control Financiero · MATRIX ER</div></div>
      <div class="cf-alert ${r.estadoC}" style="padding:6px 16px;border-radius:20px;margin:0;font-weight:800;font-size:.76rem;">${r.estado}</div>
    </div>
    <div class="cf-kpi-grid">${kpis.map(kCard).join('')}</div>
    ${_cfComparativoHTML()}
    ${mixSection}
    <div class="cf-sec"><div class="cf-sec-hdr">⚠️ Alertas operativas</div><div class="cf-sec-body">${aHtml}</div></div>
    ${(r.metas.shopifyMonto||r.metas.shopifyNum||r.metas.wppNum)?`<div class="cf-sec"><div class="cf-sec-hdr">🎯 Progreso de metas</div><div class="cf-sec-body">
      ${r.metas.shopifyMonto?prog('Facturación '+_cfSim(),r.pShopM,_cfM$(r.shopM),_cfM$(r.metas.shopifyMonto)):''}
      ${r.metas.shopifyNum?prog('Pedidos total #',r.pShopN,r.totalN+' pdos.',r.metas.shopifyNum+' pdos.'):''}
      ${r.metas.wppNum?prog('WPP #',r.pWppN,r.wppN+' pdos.',r.metas.wppNum+' pdos.','#d97706'):''}
      ${r.metas.shopifyNumSolo?prog('Shopify #',r.pShopOnly,r.shopN+' pdos.',r.metas.shopifyNumSolo+' pdos.','#2563eb'):''}
      ${r.metas.entregadoMonto?prog('Entregado '+_cfSim(),r.pEntM,_cfM$(r.entM),_cfM$(r.metas.entregadoMonto)):''}
      ${r.metas.entregadoNum?prog('Entregado #',r.pEntN,r.entN+' pdos.',r.metas.entregadoNum+' pdos.'):''}
    </div></div>`:''}
    <div class="cf-sec"><div class="cf-sec-hdr">📦 COD resumen</div><div class="cf-sec-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;">${codCards}</div>
    </div></div>`;
}

// ── CONTROL MES ───────────────────────────────────────────────────────
// ── ANÁLISIS COMPARATIVO VS MES ANTERIOR ─────────────────────────────
// Crecimiento en facturación, ventas (pedidos), gasto publicitario y CPA.
// Si el mes está en curso, compara al MISMO corte de día del mes anterior.
// Datos compartidos entre el Dashboard y el Informe PDF.
function _cfComparativoData(){
  const dias=_cfMD.dias||{}, prevDias=(_cfPrevMD||{}).dias||{};
  if(!Object.keys(prevDias).length)return null;
  const feePct=(_cfCfg.limites||_CF_DEF.limites).comisionBancaria||1;
  const nd=new Date();
  const esMesActual=_cfMes===(nd.getFullYear()+'-'+_cfPad(nd.getMonth()+1));
  const corte=esMesActual?nd.getDate():31;
  const suma=(ds,hasta)=>{
    let fact=0,ped=0,ads=0;
    Object.entries(ds).forEach(([dd,d])=>{
      if(parseInt(dd,10)>hasta)return;
      fact+=(d.wppMonto||0)+(d.shopifyMonto||0);
      ped+=(d.wppNum||0)+(d.shopifyNum||0);
      ads+=(d.adsFB||0)+(d.adsTiktok||0);
    });
    const adsFee=ads*(1+feePct/100);
    return{fact,ped,adsFee,cpa:ped>0?adsFee/ped:0};
  };
  const act=suma(dias,corte), ant=suma(prevDias,corte), antFull=suma(prevDias,31);
  const [py,pm]=_cfMes.split('-').map(Number);
  const mesAntLbl=new Date(py,pm-2,1).toLocaleDateString('es-CO',{month:'long'}).toUpperCase();
  const mesActLbl=new Date(py,pm-1,1).toLocaleDateString('es-CO',{month:'long'}).toUpperCase();
  const varPct=(a,b)=>b>0?((a-b)/b*100):null;
  return{corte,esMesActual,act,ant,antFull,mesAntLbl,mesActLbl,
    vFact:varPct(act.fact,ant.fact),vPed:varPct(act.ped,ant.ped),
    vAds:varPct(act.adsFee,ant.adsFee),vCpa:varPct(act.cpa,ant.cpa)};
}

// ── ANÁLISIS COMPARATIVO ENTRE MESES ELEGIDOS (Informe PDF) ──────────
// Se comparan de forma consecutiva: el informe arma un par por cada dos
// meses seguidos de la selección (1ºvs2º, 2ºvs3º...). Trae de Firebase
// los meses que no estén ya cargados en memoria (_cfMD / _cfPrevMD).
// Trae sólo /cod y /dias de cada mes (liviano) en vez del documento completo
// (que puede incluir blobs grandes de analíticas) — evita lecturas lentas
async function _cfFetchMesesDoc(meses){
  if(typeof _db==='undefined')return meses.map(()=>({}));
  return Promise.all(meses.map(async m=>{
    // Migrar el mes entero si todavía vive en la clave vieja; leer directo
    // /cod y /dias habría copiado esos dos subnodos y dejado el resto atrás.
    await _leerTienda(tk=>_cfBase(m,tk));
    const [codS,diasS]=await Promise.all([
      _db.ref(_cfBasePath(m)+'/cod').once('value'),
      _db.ref(_cfBasePath(m)+'/dias').once('value')
    ]);
    return {cod:codS.val()||{},dias:diasS.val()||{}};
  }));
}
// Facturación/pedidos/Ads a partir del registro diario, con corte opcional
// (para comparar el mes en curso contra el mismo día del mes anterior)
function _cfComparativoPar(docA,docB,mA,mB,esEnCurso){
  const diasA=docA.dias||{}, diasB=docB.dias||{};
  const feePct=(_cfCfg.limites||_CF_DEF.limites).comisionBancaria||1;
  const corte=esEnCurso?new Date().getDate():31;
  const suma=(ds,hasta)=>{
    let fact=0,ped=0,ads=0;
    Object.entries(ds).forEach(([dd,d])=>{
      if(parseInt(dd,10)>hasta)return;
      fact+=(d.wppMonto||0)+(d.shopifyMonto||0);
      ped+=(d.wppNum||0)+(d.shopifyNum||0);
      ads+=(d.adsFB||0)+(d.adsTiktok||0);
    });
    const adsFee=ads*(1+feePct/100);
    return{fact,ped,adsFee,cpa:ped>0?adsFee/ped:0};
  };
  const act=suma(diasB,corte), ant=suma(diasA,corte), antFull=suma(diasA,31);
  const mesAntLbl=_cfMesLabel(mA), mesActLbl=_cfMesLabel(mB);
  const varPct=(a,b)=>b>0?((a-b)/b*100):null;
  return{corte,esMesActual:esEnCurso,act,ant,antFull,mesAntLbl,mesActLbl,
    vFact:varPct(act.fact,ant.fact),vPed:varPct(act.ped,ant.ped),
    vAds:varPct(act.adsFee,ant.adsFee),vCpa:varPct(act.cpa,ant.cpa)};
}
// Entregas/devoluciones/cancelaciones de un mes (para la lectura narrativa),
// a partir del documento completo del mes (cod + dias)
function _cfCalcResumenMes(mesDoc){
  const cod=mesDoc.cod||{}, dias=mesDoc.dias||{};
  const lim=(_cfCfg.limites||_CF_DEF.limites);
  const entM=(cod.entregados||{}).monto||0, entN=(cod.entregados||{}).num||0;
  const procM=(cod.enProceso||{}).monto||0, procN=(cod.enProceso||{}).num||0;
  const devM=(cod.devueltos||{}).monto||0, devN=(cod.devueltos||{}).num||0;
  let wppN=0,shopN=0;
  Object.values(dias).forEach(d=>{wppN+=d.wppNum||0;shopN+=d.shopifyNum||0;});
  const totalN=wppN+shopN, desp=entN+procN+devN;
  const cancN=desp>0?Math.max(0,totalN-entN-procN-devN):0;
  return{entM,entN,procM,procN,devM,devN,cancN,totalN,desp,lim,
    cancRate:totalN>0?cancN/totalN*100:0,
    devRate:desp>0?devN/desp*100:0,
    entRate:desp>0?entN/desp*100:0};
}

function _cfComparativoHTML(){
  const cd=_cfComparativoData();
  if(!cd)return '';
  const {corte,esMesActual,act,ant,antFull,mesAntLbl,mesActLbl}=cd;
  // inv: para CPA subir es MALO (rojo) y bajar es BUENO (verde). neutral: solo informativo
  const badge=(p,inv,neutral)=>{
    if(p===null)return '<span style="color:var(--text-3);font-size:.7rem;">—</span>';
    const up=p>=0;
    const c=neutral?'var(--accent)':(inv?(up?'var(--danger)':'var(--success)'):(up?'var(--success)':'var(--danger)'));
    return `<span style="color:${c};font-weight:900;font-family:var(--f-mono);">${up?'▲':'▼'} ${(up?'+':'')+p.toFixed(1)}%</span>`;
  };
  const fila=(ico,lbl,vAnt,vAct,p,inv,neutral)=>`<tr>
    <td style="padding:8px 12px;font-size:.74rem;font-weight:700;color:var(--text-1);border-bottom:1px solid var(--border);">${ico} ${lbl}</td>
    <td style="padding:8px 12px;text-align:right;font-family:var(--f-mono);color:var(--text-3);border-bottom:1px solid var(--border);">${vAnt}</td>
    <td style="padding:8px 12px;text-align:right;font-family:var(--f-mono);font-weight:800;color:var(--text-1);border-bottom:1px solid var(--border);">${vAct}</td>
    <td style="padding:8px 12px;text-align:right;border-bottom:1px solid var(--border);">${badge(p,inv,neutral)}</td>
  </tr>`;
  return `<div class="cf-sec"><div class="cf-sec-hdr">📊 Comparativo vs mes anterior${esMesActual?` — corte al día ${corte}`:''}</div>
    <div class="cf-sec-body" style="padding:0;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="background:#131920;color:white;padding:7px 12px;font-size:.58rem;font-weight:700;text-align:left;">MÉTRICA</th>
          <th style="background:#131920;color:rgba(255,255,255,.6);padding:7px 12px;font-size:.58rem;font-weight:700;text-align:right;">${mesAntLbl}${esMesActual?' (día 1-'+corte+')':''}</th>
          <th style="background:#131920;color:white;padding:7px 12px;font-size:.58rem;font-weight:700;text-align:right;">${mesActLbl}</th>
          <th style="background:#131920;color:white;padding:7px 12px;font-size:.58rem;font-weight:700;text-align:right;">VARIACIÓN</th>
        </tr></thead>
        <tbody>
          ${fila('💰','Facturación',_cf$(ant.fact),_cf$(act.fact),cd.vFact,false)}
          ${fila('🛒','Ventas (pedidos)',ant.ped,act.ped,cd.vPed,false)}
          ${fila('📣','Gasto publicitario (Ads+Fee)',_cf$(ant.adsFee),_cf$(act.adsFee),cd.vAds,false,true)}
          ${fila('🎯','CPA (Ads+Fee ÷ pedidos)',_cf$(ant.cpa),_cf$(act.cpa),cd.vCpa,true)}
        </tbody>
      </table>
      ${esMesActual?`<div style="padding:8px 12px;font-size:.62rem;color:var(--text-3);">Comparación al mismo corte de día para no distorsionar (mes en curso). ${mesAntLbl} completo: ${_cf$(antFull.fact)} · ${antFull.ped} pedidos · ${_cf$(antFull.adsFee)} en Ads.</div>`:''}
      <div style="padding:0 12px 10px;font-size:.62rem;color:var(--text-3);">▲ verde = mejora · En CPA la lógica se invierte: <span style="color:var(--success);font-weight:700;">▼ bajar es bueno</span>. El gasto publicitario es informativo (azul).</div>
    </div></div>`;
}

// Fila TOT del registro diario — usada por el render y por la actualización
// en vivo (_cfSetDia) para que las sumas nunca queden desactualizadas
function _cfTotRowHTML(){
  const dias=_cfMD.dias||{};
  const prevDias=_cfPrevMD.dias||{};
  const feePct=(_cfCfg.limites||_CF_DEF.limites).comisionBancaria||1;
  let prevMesTotalShopM=0, prevMesTotalN=0;
  Object.values(prevDias).forEach(pd=>{
    prevMesTotalShopM+=(pd.shopifyMonto||0)+(pd.wppMonto||0);
    prevMesTotalN+=(pd.wppNum||0)+(pd.shopifyNum||0);
  });
  let totShopM=0,totWppM=0,totWppN=0,totShopN=0,totAdsFB=0,totAdsTT=0;
  Object.values(dias).forEach(d=>{
    totWppM+=d.wppMonto||0; totShopM+=d.shopifyMonto||0;
    totWppN+=d.wppNum||0; totShopN+=d.shopifyNum||0;
    totAdsFB+=d.adsFB||0; totAdsTT+=d.adsTiktok||0;
  });
  const crFmt=v=>v===null?'':(v>=0?'+':'')+v.toFixed(1)+'%';
  const pct=(n,d)=>d>0?(n/d*100).toFixed(1)+'%':'—';
  const totTotal=totWppN+totShopN, totAdsT=totAdsFB+totAdsTT;
  const totFee=totAdsT*feePct/100, totAdsFee=totAdsT+totFee;
  const totCpa=totTotal>0?_cf$(totAdsFee/totTotal):'';
  const totTotalM=totWppM+totShopM;
  const totRoas=totAdsT>0?(totTotalM/totAdsT):0;
  const crMTot=prevMesTotalShopM>0?((totTotalM-prevMesTotalShopM)/prevMesTotalShopM*100):null;
  const crNTot=prevMesTotalN>0?((totTotal-prevMesTotalN)/prevMesTotalN*100):null;
  const crCls=v=>v===null?'':v>=0?'color:var(--success);font-weight:800;':'color:var(--danger);font-weight:800;';
  return `<tr class="xls-totrow">
    <td class="xls-sep" style="text-align:center;font-size:.55rem;letter-spacing:.3px;">TOT</td>
    <td style="text-align:right;padding:0 4px;font-size:.6rem;">${prevMesTotalShopM?_cf$(prevMesTotalShopM):''}</td>
    <td class="xls-sep" style="text-align:center;font-size:.6rem;">${prevMesTotalN||''}</td>
    <td style="text-align:right;padding:0 4px;">
      <div style="color:var(--warning);">${totWppM?_cf$(totWppM):''}</div>
      <div style="font-size:.5rem;color:var(--warning);">${totTotalM>0?pct(totWppM,totTotalM):''}</div>
    </td>
    <td style="text-align:right;padding:0 4px;">
      <div style="color:var(--info);">${totShopM?_cf$(totShopM):''}</div>
      <div style="font-size:.5rem;color:var(--info);">${totTotalM>0?pct(totShopM,totTotalM):''}</div>
    </td>
    <td style="text-align:center;">${totWppN||''}</td>
    <td style="text-align:center;">${totShopN||''}</td>
    <td class="xls-sep" style="text-align:center;font-size:.65rem;">${totTotal}</td>
    <td style="text-align:center;${crCls(crMTot)}">${crFmt(crMTot)}</td>
    <td class="xls-sep" style="text-align:center;${crCls(crNTot)}">${crFmt(crNTot)}</td>
    <td style="text-align:right;padding:0 4px;">${_cf$(totAdsFB)}</td>
    <td style="text-align:right;padding:0 4px;">${_cf$(totAdsTT)}</td>
    <td style="text-align:right;padding:0 4px;">${_cf$(totAdsT)}</td>
    <td style="text-align:right;padding:0 4px;color:var(--text-3);">${_cf$(totFee)}</td>
    <td style="text-align:right;padding:0 4px;">${_cf$(totAdsFee)}</td>
    <td style="text-align:right;padding:0 4px;color:#67e8f9;">${totCpa}</td>
    <td class="xls-sep" style="text-align:right;padding:0 4px;color:#34d399;">${totRoas?totRoas.toFixed(2)+'x':''}</td>
    <td></td>
  </tr>`;
}

function _cfRenderMes(){
  _cfPegarInstalar();
  const el=document.getElementById('cf-tab-mes');
  const dias=_cfMD.dias||{};
  const cod=_cfMD.cod||{};
  const costos=_cfMD.costos||{};
  const metas=_cfMD.metas||{};
  const prevDias=_cfPrevMD.dias||{};
  const nd=new Date();
  const todayMes=nd.getFullYear()+'-'+_cfPad(nd.getMonth()+1);
  const todayDia=_cfPad(nd.getDate());
  const totalDias=_cfDiasEnMes(_cfMes);
  const feePct=(_cfCfg.limites||_CF_DEF.limites).comisionBancaria||1;

  // Totales del mes anterior (referencia fija para todas las filas)
  let prevMesTotalShopM=0, prevMesTotalN=0;
  Object.values(prevDias).forEach(pd=>{
    prevMesTotalShopM+=(pd.shopifyMonto||0)+(pd.wppMonto||0);
    prevMesTotalN+=(pd.wppNum||0)+(pd.shopifyNum||0);
  });

  const crFmt=v=>v===null?'':(v>=0?'+':'')+v.toFixed(1)+'%';
  const pct=(n,d)=>d>0?(n/d*100).toFixed(1)+'%':'—';
  const sub=(v,s)=>`<div style="font-size:.48rem;font-weight:600;color:var(--text-3);line-height:1.1;">${s}</div>`;

  let totShopM=0,totWppM=0,totWppN=0,totShopN=0,totAdsFB=0,totAdsTT=0;
  let dRows='';

  for(let i=1;i<=totalDias;i++){
    const dd=_cfPad(i);
    const d=dias[dd]||{};
    const isToday=_cfMes===todayMes&&dd===todayDia;

    const shopM=d.shopifyMonto||0, wppM=d.wppMonto||0, totalM=shopM+wppM;
    const wppN=d.wppNum||0, shopNSolo=d.shopifyNum||0, totN=wppN+shopNSolo;
    const adsFB=d.adsFB||0, adsTT=d.adsTiktok||0, adsT=adsFB+adsTT;
    const fee=adsT*feePct/100, adsFee=adsT+fee;
    const cpa=totN>0?(adsFee/totN):0;
    const roas=adsT>0?(totalM/adsT):0;

    // Crecimiento: día actual vs mismo día del mes anterior
    const pd=prevDias[dd]||{};
    const prevTotalM=(pd.shopifyMonto||0)+(pd.wppMonto||0);
    const prevTotN=(pd.wppNum||0)+(pd.shopifyNum||0);
    const crM=prevTotalM>0?((totalM-prevTotalM)/prevTotalM*100):null;
    const crN=prevTotN>0?((totN-prevTotN)/prevTotN*100):null;

    totShopM+=shopM;totWppM+=wppM;totWppN+=wppN;totShopN+=shopNSolo;totAdsFB+=adsFB;totAdsTT+=adsTT;

    // Fecha LOCAL (new Date('YYYY-MM-DD') parsea UTC y corre el día en Colombia)
    const [_cy,_cm]=_cfMes.split('-').map(Number);
    const dow=new Date(_cy,_cm-1,i).getDay();
    const esSab=dow===6,esDom=dow===0;

    dRows+=`<tr class="${isToday?'xls-today':''}">
      <td class="xls-n xls-sep" style="${isToday?'color:var(--accent);':(esDom||esSab)?'color:var(--text-3);opacity:.65;':''}">${dd}${(esDom||esSab)&&!isToday?'<span style="font-size:.42rem;opacity:.8;display:block;line-height:.5;margin-top:-2px;">'+(esDom?'DOM':'SÁB')+'</span>':''}</td>
      <td class="xls-ant" style="text-align:right;padding:0 4px;">${prevTotalM?_cf$(prevTotalM):''}</td>
      <td class="xls-ant xls-sep" style="text-align:center;">${prevTotN||''}</td>
      <td class="xls-wpp"><input class="xls-inp" data-dia="${dd}" data-campo="wppMonto" type="text" inputmode="numeric" value="${wppM?_cf$(wppM):''}" placeholder="" style="color:var(--warning);font-weight:700;" onfocus="this.value=this.value.replace(/[^0-9]/g,'');this.select()" oninput="_cfSetDia('${dd}','wppMonto',this.value)" onblur="const _r=_cfNum(this.value);this.value=_r>0?_cf$(_r):''"></td>
      <td class="xls-shopn"><input class="xls-inp" data-dia="${dd}" data-campo="shopifyMonto" type="text" inputmode="numeric" value="${shopM?_cf$(shopM):''}" placeholder="" style="color:var(--info);font-weight:700;" onfocus="this.value=this.value.replace(/[^0-9]/g,'');this.select()" oninput="_cfSetDia('${dd}','shopifyMonto',this.value)" onblur="const _r=_cfNum(this.value);this.value=_r>0?_cf$(_r):''"></td>
      <td class="xls-wpp"><input class="xls-inp" data-dia="${dd}" data-campo="wppNum" type="number" min="0" value="${wppN||''}" placeholder="" style="color:var(--warning);font-weight:700;text-align:center;" oninput="_cfSetDia('${dd}','wppNum',this.value)"></td>
      <td class="xls-shopn"><input class="xls-inp" data-dia="${dd}" data-campo="shopifyNum" type="number" min="0" value="${shopNSolo||''}" placeholder="" style="color:var(--info);font-weight:700;text-align:center;" oninput="_cfSetDia('${dd}','shopifyNum',this.value)"></td>
      <td class="xls-tot xls-sep">${totN||''}</td>
      <td class="${crM===null?'xls-auto':crM>=0?'xls-pos':'xls-neg'}" style="text-align:center;">${crFmt(crM)}</td>
      <td class="${crN===null?'xls-auto xls-sep':crN>=0?'xls-pos xls-sep':'xls-neg xls-sep'}" style="text-align:center;">${crFmt(crN)}</td>
      <td class="xls-ads"><input class="xls-inp" data-dia="${dd}" data-campo="adsFB" type="text" inputmode="numeric" value="${adsFB?_cf$(adsFB):''}" placeholder="" style="color:#9B59E6;font-weight:700;" onfocus="this.value=this.value.replace(/[^0-9]/g,'');this.select()" oninput="_cfSetDia('${dd}','adsFB',this.value)" onblur="const _r=_cfNum(this.value);this.value=_r>0?_cf$(_r):''"></td>
      <td class="xls-ads"><input class="xls-inp" data-dia="${dd}" data-campo="adsTiktok" type="text" inputmode="numeric" value="${adsTT?_cf$(adsTT):''}" placeholder="" style="color:#9B59E6;font-weight:700;" onfocus="this.value=this.value.replace(/[^0-9]/g,'');this.select()" oninput="_cfSetDia('${dd}','adsTiktok',this.value)" onblur="const _r=_cfNum(this.value);this.value=_r>0?_cf$(_r):''"></td>
      <td class="xls-ads" style="text-align:right;padding:0 4px;">${adsT?_cf$(adsT):''}</td>
      <td class="xls-ads" style="text-align:right;padding:0 4px;color:#6b7280;">${fee?_cf$(fee):''}</td>
      <td class="xls-ads" style="text-align:right;padding:0 4px;font-weight:700;">${adsFee?_cf$(adsFee):''}</td>
      <td class="xls-cpa" style="text-align:right;padding:0 4px;">${cpa?_cf$(cpa):''}</td>
      <td class="xls-roas xls-sep" style="text-align:right;padding:0 4px;">${roas?roas.toFixed(2)+'x':''}</td>
      <td class="xls-nota" style="min-width:90px;"><input class="xls-inp xls-inp-l" data-dia="${dd}" data-campo="nota" type="text" value="${d.nota||''}" placeholder="" oninput="_cfSetDia('${dd}','nota',this.value)"></td>
    </tr>`;
  }

  // Fila totales + porcentajes (función compartida con la actualización en vivo)
  dRows+=_cfTotRowHTML();

  // ── Porcentajes COD ──────────────────────────────────────────────────
  const entN=(cod.entregados||{}).num||0;
  const procN=(cod.enProceso||{}).num||0;
  const devN=(cod.devueltos||{}).num||0;
  const despachados=entN+procN+devN; // total pedidos que salieron (sin pendientes/cancelados)
  const pEnt=despachados>0?(entN/despachados*100).toFixed(2):0;
  const pProc=despachados>0?(procN/despachados*100).toFixed(2):0;
  const pDev=despachados>0?(devN/despachados*100).toFixed(2):0;
  // Total ventas del registro diario (formulario)
  const totalDiarioN=Object.values(dias).reduce((s,d)=>(s+(d.wppNum||0)+(d.shopifyNum||0)),0);
  // Cancelados: pedidos del mes − entregados − en proceso − devueltos
  const cancN=despachados>0?Math.max(0,totalDiarioN-entN-procN-devN):0;
  const pCanc=totalDiarioN>0?(cancN/totalDiarioN*100).toFixed(2):0;


  // Tarjeta editable de dinero — estilo visual igual al COD del mes
  // Tarjetas estilo REDKING: superficie oscura, acento en borde izquierdo y label
  const mkCardM=(k,v,lbl,bg,bc,tc)=>{
    const rv=Math.round(v||0);const fv=rv>0?_cf$(rv):'';
    const kb=k.replace(/this\.value/g,'_r');
    return `<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;background:var(--bg-elevated);border:1px solid var(--border);border-left:3px solid ${bc};border-radius:8px;padding:7px 10px;">
      <div style="font-size:.55rem;font-weight:800;color:${bc};text-transform:uppercase;letter-spacing:.3px;">${lbl}</div>
      <input style="border:1px solid var(--border-strong);border-radius:6px;padding:5px 9px;font-size:.82rem;font-weight:900;color:${bc};background:transparent;outline:none;text-align:right;width:130px;font-family:var(--f-mono);" type="text" value="${fv}" placeholder="${_cfSim()} 0" onfocus="this.value=this.value.replace(/[^0-9]/g,'');this.select();this.style.borderColor='${bc}'" onblur="const _r=_cfPN(this.value);${kb};this.value=_r>0?_cf$(_r):'';this.style.borderColor=''" oninput="${k}">
    </div>`;
  };
  // Tarjeta editable de conteo (número entero)
  const mkCardN=(k,v,lbl,bg,bc,tc)=>`<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;background:var(--bg-elevated);border:1px solid var(--border);border-left:3px solid ${bc};border-radius:8px;padding:7px 10px;">
    <div style="font-size:.55rem;font-weight:800;color:${bc};text-transform:uppercase;letter-spacing:.3px;">${lbl}</div>
    <input style="border:1px solid var(--border-strong);border-radius:6px;padding:5px 9px;font-size:.9rem;font-weight:900;color:${bc};background:transparent;outline:none;text-align:right;width:70px;font-family:var(--f-mono);" type="number" value="${v||''}" placeholder="0" onfocus="this.style.borderColor='${bc}'" onblur="this.style.borderColor=''" oninput="${k}">
  </div>`;

  el.innerHTML=`
    <!-- ZONA SUPERIOR: 3 paneles en una fila -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
      <!-- METAS -->
      <div class="cf-sec" style="margin:0;"><div class="cf-sec-hdr">🎯 Metas del mes</div><div class="cf-sec-body" style="padding:8px 10px;">
        <div style="display:flex;flex-direction:column;gap:5px;">
          ${mkCardM("_cfSetMeta('shopifyMonto',this.value)",metas.shopifyMonto,'💰 Facturación meta '+_cfSim(),'#f0fdf4','#16a34a','#15803d')}
          ${mkCardM("_cfSetMeta('entregadoMonto',this.value)",metas.entregadoMonto,'✅ Entregado meta '+_cfSim(),'#ecfdf5','#059669','#047857')}
          ${mkCardN("_cfSetMeta('shopifyNum',this.value)",metas.shopifyNum,'📦 Total pedidos meta #','#eff6ff','#0891b2','#0369a1')}
          ${mkCardN("_cfSetMeta('entregadoNum',this.value)",metas.entregadoNum,'✅ Entregado meta #','#e0f2fe','#0284c7','#075985')}
          ${mkCardN("_cfSetMeta('wppNum',this.value)",metas.wppNum,'💬 WhatsApp pedidos meta #','#f0fdfa','#0d9488','#0f766e')}
          ${mkCardN("_cfSetMeta('shopifyNumSolo',this.value)",metas.shopifyNumSolo,'🛍️ Shopify pedidos meta #','#faf5ff','#7c3aed','#6d28d9')}
        </div>
      </div></div>
      <!-- COD -->
      <div class="cf-sec" style="margin:0;"><div class="cf-sec-hdr">📊 COD del mes</div><div class="cf-sec-body" style="padding:8px 10px;">
        ${despachados===0&&entN===0&&procN===0&&devN===0?
          `<div style="text-align:center;color:var(--text-3);font-size:.68rem;padding:12px 0;">Sin datos — sube el archivo de órdenes en la pestaña Órdenes</div>`
          :`<div style="display:flex;flex-direction:column;gap:5px;">
            <!-- Entregados -->
            <div style="display:grid;grid-template-columns:1fr auto;align-items:center;background:var(--success-soft);border-radius:7px;padding:6px 10px;border-left:3px solid #16a34a;">
              <div>
                <div style="font-size:.55rem;font-weight:800;color:var(--success);text-transform:uppercase;letter-spacing:.3px;">✅ Entregados</div>
                <div style="font-size:.88rem;font-weight:900;color:var(--text-1);font-family:var(--f-mono);">${_cf$((cod.entregados||{}).monto||0)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:.55rem;color:var(--text-2);">pedidos</div>
                <div style="font-size:1rem;font-weight:900;color:var(--success);">${entN}</div>
                <div style="font-size:.6rem;font-weight:800;color:var(--success);background:var(--success-soft);border-radius:3px;padding:0 4px;">${pEnt}%</div>
              </div>
            </div>
            <!-- En proceso -->
            <div style="display:grid;grid-template-columns:1fr auto;align-items:center;background:var(--info-soft);border-radius:7px;padding:6px 10px;border-left:3px solid #0891b2;">
              <div>
                <div style="font-size:.55rem;font-weight:800;color:var(--info);text-transform:uppercase;letter-spacing:.3px;">🔵 En proceso</div>
                <div style="font-size:.88rem;font-weight:900;color:var(--text-1);font-family:var(--f-mono);">${_cf$((cod.enProceso||{}).monto||0)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:.55rem;color:var(--text-2);">pedidos</div>
                <div style="font-size:1rem;font-weight:900;color:var(--info);">${procN}</div>
                <div style="font-size:.6rem;font-weight:800;color:var(--info);background:var(--info-soft);border-radius:3px;padding:0 4px;">${pProc}%</div>
              </div>
            </div>
            <!-- Devueltos -->
            <div style="display:grid;grid-template-columns:1fr auto;align-items:center;background:var(--danger-soft);border-radius:7px;padding:6px 10px;border-left:3px solid #dc2626;">
              <div>
                <div style="font-size:.55rem;font-weight:800;color:var(--danger);text-transform:uppercase;letter-spacing:.3px;">🔴 Devueltos</div>
                <div style="font-size:.88rem;font-weight:900;color:var(--text-1);font-family:var(--f-mono);">${_cf$((cod.devueltos||{}).monto||0)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:.55rem;color:var(--text-2);">pedidos</div>
                <div style="font-size:1rem;font-weight:900;color:var(--danger);">${devN}</div>
                <div style="font-size:.6rem;font-weight:800;color:var(--danger);background:var(--danger-soft);border-radius:3px;padding:0 4px;">${pDev}%</div>
              </div>
            </div>
            <!-- Cancelados -->
            <div style="display:grid;grid-template-columns:1fr auto;align-items:center;background:var(--warning-soft);border-radius:7px;padding:6px 10px;border-left:3px solid #d97706;">
              <div>
                <div style="font-size:.55rem;font-weight:800;color:var(--warning);text-transform:uppercase;letter-spacing:.3px;">⚠️ Cancelados</div>
                <div style="font-size:.58rem;color:var(--warning);">% sobre ventas totales del mes</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:.55rem;color:var(--text-2);">pedidos</div>
                <div style="font-size:1rem;font-weight:900;color:var(--warning);">${cancN}</div>
                <div style="font-size:.6rem;font-weight:800;color:var(--warning);background:var(--warning-soft);border-radius:3px;padding:0 4px;">${pCanc}%</div>
              </div>
              <div style="grid-column:1/-1;font-size:.56rem;color:var(--warning);opacity:.8;margin-top:3px;">Incluye pendientes confirmaciones, y cancelados</div>
            </div>
            <!-- Despacho (lo contrario a Cancelados: entregados + en proceso + devueltos) -->
            <div style="display:grid;grid-template-columns:1fr auto;align-items:center;background:rgba(99,102,241,.1);border-radius:7px;padding:6px 10px;border-left:3px solid #6366f1;">
              <div>
                <div style="font-size:.55rem;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:.3px;">📤 Despacho</div>
                <div style="font-size:.58rem;color:#6366f1;">% sobre ventas totales del mes</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:.55rem;color:var(--text-2);">pedidos</div>
                <div style="font-size:1rem;font-weight:900;color:#6366f1;">${despachados}</div>
                <div style="font-size:.6rem;font-weight:800;color:#6366f1;background:rgba(99,102,241,.1);border-radius:3px;padding:0 4px;">${totalDiarioN>0?(despachados/totalDiarioN*100).toFixed(2):0}%</div>
              </div>
            </div>
          </div>`}
      </div></div>
      <!-- COSTOS -->
      <div class="cf-sec" style="margin:0;"><div class="cf-sec-hdr">💸 Costos del mes</div><div class="cf-sec-body" style="padding:8px 10px;">
        <div style="display:flex;flex-direction:column;gap:5px;">
          ${mkCardM("_cfSetCosto('fleteEntregados',this.value)",costos.fleteEntregados,'🚚 Flete entregados '+_cfSim(),'#fffbeb','#d97706','#92400e')}
          ${mkCardM("_cfSetCosto('fleteEnProceso',this.value)",costos.fleteEnProceso,'🚚 Flete en proceso '+_cfSim(),'#fff7ed','#ea580c','#9a3412')}
          ${mkCardM("_cfSetCosto('fleteDevueltos',this.value)",costos.fleteDevueltos,'🚚 Flete devueltos '+_cfSim(),'#fef2f2','#dc2626','#991b1b')}
          ${mkCardM("_cfSetCosto('cogsEntregados',this.value)",costos.cogsEntregados,'💜 Costo proveedores '+_cfSim(),'#f5f3ff','#7c3aed','#4c1d95')}
          ${mkCardM("_cfSetCosto('chatepro',this.value)",costos.chatepro,'💬 ChateaPro '+_cfSim(),'#faf5ff','#9333ea','#6b21a8')}
          <div style="background:var(--bg-hover);border-radius:7px;padding:7px 10px;border-left:3px solid #475569;">
            <div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;">
              <div style="font-size:.55rem;font-weight:800;color:var(--text-1);text-transform:uppercase;letter-spacing:.3px;">📦 Otros costos ventas ${_cfSim()}</div>
              <input style="border:1px solid var(--border-strong);border-radius:6px;padding:5px 9px;font-size:.82rem;font-weight:900;color:var(--text-1);background:var(--bg-card);outline:none;text-align:right;width:130px;font-family:inherit;" type="text" value="${(()=>{const rv=Math.round(costos.otrosVentas||0);return rv>0?_cf$(rv):''})()}" placeholder="${_cfSim()} 0" onfocus="this.value=this.value.replace(/[^0-9]/g,'');this.select()" oninput="_cfSetCosto('otrosVentas',this.value)" onblur="const _r=_cfPN(this.value);_cfSetCosto('otrosVentas',_r);this.value=_r>0?_cf$(_r):''">
            </div>
            <input type="text" value="${costos.otrosVentasMotivo||''}" placeholder="¿Qué gasto es este? Ej: dominio, empaque, plataforma…" style="margin-top:5px;width:100%;border:1px solid var(--border-strong);border-radius:5px;padding:4px 8px;font-size:.63rem;color:var(--text-1);background:var(--bg-card);outline:none;font-family:inherit;box-sizing:border-box;" oninput="_cfSetCosto('otrosVentasMotivo',this.value)">
          </div>
        </div>
      </div></div>
    </div>

    <!-- TABLA DIARIA -->
    <div class="cf-sec" style="margin:0;"><div class="cf-sec-hdr">📅 Registro diario — ${_cfMesLabel(_cfMes)}</div>
    <div class="xls-wrap">
      <table class="xls">
        <thead>
          <tr>
            <th class="xls-sep" rowspan="2">DÍA</th>
            <th class="xls-ant" colspan="2">← MES ANT.</th>
            <th class="xls-sep" colspan="7">VENTAS DEL DÍA</th>
            <th class="xls-ads xls-sep" colspan="5">ADS</th>
            <th class="xls-cpa" rowspan="2">CPA día</th>
            <th class="xls-roas xls-sep" rowspan="2" title="ROAS = Facturación total ÷ Total invertido en Ads">ROAS</th>
            <th rowspan="2" style="min-width:90px;">Nota</th>
          </tr>
          <tr>
            <th class="xls-ant">Fact.$</th>
            <th class="xls-ant xls-sep">#</th>
            <th class="xls-wpp">WPP $</th>
            <th class="xls-shopn">Shop $</th>
            <th class="xls-wpp">WPP#</th>
            <th class="xls-shop">Shop#</th>
            <th style="font-weight:900;">Tot#</th>
            <th title="% crecimiento facturación vs mismo día del mes anterior">Crec$</th>
            <th class="xls-sep" title="% crecimiento pedidos vs mismo día del mes anterior">Crec#</th>
            <th class="xls-ads">FB $</th>
            <th class="xls-ads">TikTok $</th>
            <th class="xls-ads">Total $</th>
            <th class="xls-ads">Fee${feePct}%</th>
            <th class="xls-ads xls-sep">Ads+Fee</th>
          </tr>
        </thead>
        <tbody>${dRows}</tbody>
      </table>
    </div></div>`;
}

function _cfSetMeta(k,v){
  if(!_cfMD.metas)_cfMD.metas={};
  _cfMD.metas[k]=_cfNum(v);
  _cfSave('metas',_cfMD.metas);
}
function _cfSetCod(grupo,campo,v){
  if(!_cfMD.cod)_cfMD.cod={};
  if(!_cfMD.cod[grupo])_cfMD.cod[grupo]={};
  _cfMD.cod[grupo][campo]=_cfNum(v);
  _cfSave('cod',_cfMD.cod);
}
function _cfSetCosto(k,v){
  if(!_cfMD.costos)_cfMD.costos={};
  _cfMD.costos[k]=k.endsWith('Motivo')?String(v||''):_cfNum(v);
  _cfSave('costos/'+k,_cfMD.costos[k]);
}
// Publicidad manual del ER. A diferencia de _cfSetCosto, acá el campo vacío NO
// es cero: significa "usá la suma de los diarios", así que se borra la clave.
// Un 0 escrito a propósito sí se guarda como 0.
function _cfSetAdsER(k,v){
  if(!_cfMD.costos)_cfMD.costos={};
  const txt=String(v==null?'':v).trim();
  if(txt===''){
    delete _cfMD.costos[k];
    _cfSave('costos/'+k,null);
  } else {
    _cfMD.costos[k]=_cfNum(txt);
    _cfSave('costos/'+k,_cfMD.costos[k]);
  }
  // Se repinta el ER para que la utilidad y el fee reflejen el valor nuevo al
  // instante, sin esperar a cambiar de pestaña.
  _cfRenderER();
}
// ── PEGAR DESDE EXCEL ───────────────────────────────────────────────
// El Control Mes se llevaba en un Excel aparte. Al pegar un rango (A1:A5)
// parado en una celda, se reparte hacia abajo y hacia la derecha como en Excel,
// en vez de meter las 5 líneas dentro de un solo input.

// Excel copia los números ya formateados: "$ 1.234.567", "1,234,567", "45.000,00".
// _cfNum solo entiende el formato colombiano y con "1,234,567" devuelve 1.234.
// Acá se decide qué es el último separador mirando cuántos dígitos lo siguen:
// 3 → miles, 1 o 2 → decimales. Los valores son pesos y conteos, así que el
// resultado se redondea a entero.
function _cfNumPeg(txt){
  let t=String(txt==null?'':txt).replace(/[^\d.,-]/g,'').trim();
  if(!t) return 0;
  const neg=/^-/.test(t);
  t=t.replace(/-/g,'');
  const ult=Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
  let n;
  if(ult<0){
    n=parseFloat(t)||0;
  }else{
    const decimales=t.length-ult-1;
    const entero=t.slice(0,ult).replace(/[.,]/g,'');
    n = (decimales===1||decimales===2)
      ? parseFloat(entero+'.'+t.slice(ult+1))||0
      : parseFloat(entero+t.slice(ult+1))||0;
  }
  return Math.round(neg?-n:n);
}

// El orden de las columnas se lee del DOM y no de una lista fija: si mañana se
// agrega o se mueve una columna de captura, el pegado sigue cuadrando solo.
function _cfPegCampos(){
  const uno=document.querySelector('#cf-tab-mes .xls tbody input[data-dia]');
  if(!uno) return [];
  return [...uno.closest('tr').querySelectorAll('input[data-dia]')].map(i=>i.dataset.campo);
}

function _cfPegar(e){
  const inp=e.target;
  if(!inp||!inp.dataset||!inp.dataset.dia) return;
  if(!inp.closest||!inp.closest('#cf-tab-mes')) return;
  if(typeof _esSoloLectura==='function'&&_esSoloLectura()){
    e.preventDefault();
    toast('👁️ Solo lectura: no se puede pegar');
    return;
  }
  const cb=e.clipboardData||window.clipboardData;
  const txt=cb?cb.getData('text'):'';
  if(!txt) return;

  const filas=txt.replace(/\r\n?/g,'\n').replace(/\n+$/,'').split('\n').map(f=>f.split('\t'));
  const campos=_cfPegCampos();
  const c0=campos.indexOf(inp.dataset.campo);
  if(c0<0) return;
  e.preventDefault();

  const d0=parseInt(inp.dataset.dia,10);
  const totalDias=_cfDiasEnMes(_cfMes);
  let escritas=0, sobran=0;

  filas.forEach((cols,i)=>{
    // Pegar 20 días parado en el 25 no debe desbordar al mes siguiente:
    // lo que no cabe se descarta y se avisa.
    if(d0+i>totalDias){ sobran+=cols.length; return; }
    const dd=_cfPad(d0+i);
    cols.forEach((celda,j)=>{
      const campo=campos[c0+j];
      if(!campo){ sobran++; return; }
      _cfSetDia(dd, campo, campo==='nota'?celda.trim():String(_cfNumPeg(celda)));
      escritas++;
    });
  });

  // Repintar: los totales, el CPA y el ROAS de cada fila tocada hay que
  // recalcularlos, y las columnas de dinero se muestran formateadas.
  _cfRenderMes();
  const vuelta=document.querySelector('#cf-tab-mes input[data-dia="'+_cfPad(d0)+'"][data-campo="'+inp.dataset.campo+'"]');
  if(vuelta) vuelta.focus();

  const plural=(n,uno,varios)=>n+' '+(n===1?uno:varios);
  toast(escritas
    ? '📋 '+plural(escritas,'celda pegada','celdas pegadas')+
      (sobran?' · '+plural(sobran,'quedó fuera del mes','quedaron fuera del mes'):'')
    : '📋 No se pegó nada: el rango cae fuera de la tabla');
}

// Un solo listener en el documento: la tabla se vuelve a dibujar entera en cada
// cambio de mes y uno pegado a ella se perdería.
function _cfPegarInstalar(){
  if(window._cfPegInstalado) return;
  window._cfPegInstalado=true;
  document.addEventListener('paste', _cfPegar, true);
}

function _cfSetDia(dd,k,v){
  if(!_cfMD.dias)_cfMD.dias={};
  if(!_cfMD.dias[dd])_cfMD.dias[dd]={};
  _cfMD.dias[dd][k]=k==='nota'?v:_cfNum(v);
  _cfSave('dias/'+dd,_cfMD.dias[dd]);
  // Actualizar total# y CPA en tiempo real en la fila
  const d=_cfMD.dias[dd];
  const totalDia=(d.wppNum||0)+(d.shopifyNum||0);
  const adsT=(d.adsFB||0)+(d.adsTiktok||0);
  const fee=adsT*((_cfCfg.limites||_CF_DEF.limites).comisionBancaria||1)/100;
  const adsFee=adsT+fee;
  const cpa=totalDia>0?adsFee/totalDia:0;
  // Actualizar celdas auto de la fila en tiempo real (formato COMPLETO, nunca abreviado)
  const tbody=document.querySelector('#cf-tab-mes .xls tbody');
  if(tbody){
    const filas=tbody.querySelectorAll('tr');
    // Crecimiento del día vs mismo día del mes anterior
    const pd=(_cfPrevMD.dias||{})[dd]||{};
    const prevTotalM=(pd.shopifyMonto||0)+(pd.wppMonto||0);
    const prevTotN=(pd.wppNum||0)+(pd.shopifyNum||0);
    const totalM=(d.shopifyMonto||0)+(d.wppMonto||0);
    const roas=adsT>0?totalM/adsT:0;
    const crM=prevTotalM>0?((totalM-prevTotalM)/prevTotalM*100):null;
    const crN=prevTotN>0?((totalDia-prevTotN)/prevTotN*100):null;
    const crTxt=v=>v===null?'':(v>=0?'+':'')+v.toFixed(1)+'%';
    filas.forEach(tr=>{
      if(tr.classList.contains('xls-totrow'))return;
      const fc=tr.querySelector('td');
      if(!fc||parseInt(fc.textContent.trim(),10)!==parseInt(dd,10))return;
      const tds=tr.querySelectorAll('td');
      // [7]=Tot#, [8]=Crec$, [9]=Crec#, [12]=AdsTotal, [13]=Fee, [14]=AdsFee, [15]=CPA, [16]=ROAS
      if(tds[7])tds[7].textContent=totalDia||'';
      if(tds[8]){tds[8].textContent=crTxt(crM);tds[8].className=crM===null?'xls-auto':crM>=0?'xls-pos':'xls-neg';}
      if(tds[9]){tds[9].textContent=crTxt(crN);tds[9].className=(crN===null?'xls-auto':crN>=0?'xls-pos':'xls-neg')+' xls-sep';}
      if(tds[12])tds[12].textContent=adsT?_cf$(adsT):'';
      if(tds[13])tds[13].textContent=fee?_cf$(fee):'';
      if(tds[14])tds[14].textContent=adsFee?_cf$(adsFee):'';
      if(tds[15])tds[15].textContent=cpa?_cf$(cpa):'';
      if(tds[16])tds[16].textContent=roas?roas.toFixed(2)+'x':'';
    });
    // Refrescar la fila TOT con las sumas actualizadas
    const totRow=tbody.querySelector('tr.xls-totrow');
    if(totRow) totRow.outerHTML=_cfTotRowHTML();
  }
}

// ── ESTADO DE RESULTADOS ─────────────────────────────────────────────
function _cfRenderER(){
  const el=document.getElementById('cf-tab-er');
  const r=_cfCalc();
  const row=(lbl,val,cls,sub)=>`<div class="cf-er-row"><span class="cf-er-lbl">${lbl}${sub?'<span class="cf-er-sub">'+sub+'</span>':''}</span><span class="cf-er-val ${cls||''}">${val}</span></div>`;
  const sec=(lbl)=>`<div class="cf-er-section">${lbl}</div>`;
  const tot=(lbl,val,cls)=>`<div class="cf-er-row cf-er-total"><span>${lbl}</span><span class="${cls||''}">${val}</span></div>`;
  // Fila de publicidad editable: lo que se le paga realmente a la plataforma
  // puede no coincidir con lo cargado día a día. Vacío = se usa el diario, y se
  // avisa cuál es ese valor para que se note de dónde sale.
  const rowAds=(lbl,campo,valor,esManual,valorDiario)=>{
    const nota = esManual
      ? (valor!==valorDiario ? 'Manual · en los diarios: '+_cf$(valorDiario) : 'Manual')
      : 'Suma de los registros diarios';
    return `<div class="cf-er-row">
      <span>${lbl}
        <span style="display:block;font-size:.62rem;color:${esManual?'var(--info-strong)':'var(--text-3)'};font-weight:600;">${nota}</span>
      </span>
      <span style="display:flex;align-items:center;gap:6px;">
        <span class="cf-er-neg" style="font-size:.72rem;">-${_cfSim()}</span>
        <input type="text" value="${esManual?_cfNumFmt(valor):''}"
          placeholder="${_cfNumFmt(valorDiario)}"
          onchange="_cfSetAdsER('${campo}',this.value)"
          title="Dejalo vacío para usar la suma de los registros diarios"
          style="width:110px;text-align:right;padding:4px 8px;border-radius:6px;
                 border:1px solid ${esManual?'var(--info-strong)':'var(--border)'};
                 background:var(--bg-hover);color:var(--text-1);
                 font-family:var(--f-mono);font-size:.8rem;font-weight:800;">
      </span>
    </div>`;
  };
  const colorVal=(v,positiveGood)=>{
    const c=positiveGood?(v>=0?'#16a34a':'#dc2626'):(v<=0?'#16a34a':'#dc2626');
    return `<span style="color:${c};font-weight:800;">${_cf$(v)}</span>`;
  };
  const entN=r.entN, procN=r.procN, devN=r.devN;
  el.innerHTML=`
    <div class="cf-sec"><div class="cf-sec-hdr">📈 Estado de Resultados — ${_cfMesLabel(_cfMes)}</div><div class="cf-sec-body">
      ${sec('🟢 INGRESOS')}
      ${row('Ingresos entregados',_cf$(r.entM),'',r.entN+' pedidos · AOV '+_cf$(r.aov))}
      ${sec('📦 COSTO DE VENTAS (COGS)')}
      ${row('Costo productos entregados',r.cogs?'-'+_cf$(r.cogs):'$0',r.cogs?'cf-er-neg':'',r.entN>0?'Prom: '+_cf$(r.cogs/r.entN)+'/pdo':'')}
      ${tot('UTILIDAD BRUTA',_cf$(r.utilBruta),r.utilBruta>=0?'cf-er-pos':'cf-er-neg')}
      ${sec('🏢 COSTOS ADMINISTRATIVOS')}
      ${row('Shopify + Apps','-'+_cf$(r.ca.shopify||0),'cf-er-neg')}
      ${row('Mantenimiento tarjetas','-'+_cf$(r.ca.tarjetas||0),'cf-er-neg')}
      ${row('OpenAI / IA','-'+_cf$(r.ca.openai||0),'cf-er-neg')}
      ${row('Nómina','-'+_cf$(r.ca.nomina||0),'cf-er-neg')}
      ${row('4×1000','-'+_cf$(r.ca.impuesto4x1000||0),'cf-er-neg')}
      ${r.ca.dominio?row('Dominio','-'+_cf$(r.ca.dominio),'cf-er-neg'):''}
      ${r.ca.otros?row('Otros admin','-'+_cf$(r.ca.otros),'cf-er-neg'):''}
      ${tot('Total Admin','-'+_cf$(r.totalAdmin),'cf-er-neg')}
      ${sec('🚚 COSTOS DE VENTA')}
      ${row('Fletes entregados ('+entN+')','-'+_cf$(r.flEnt),'cf-er-neg',entN?'Prom: '+_cf$(r.flEnt/entN):'')}
      ${row('Fletes en proceso ('+procN+')','-'+_cf$(r.flProc),'cf-er-neg',procN?'Prom: '+_cf$(r.flProc/procN):'')}
      ${row('Fletes devueltos ('+devN+')','-'+_cf$(r.flDev),'cf-er-neg',devN?'Prom: '+_cf$(r.flDev/devN):'')}
      ${row('ChateaPro','-'+_cf$(r.costos.chatepro||0),'cf-er-neg')}
      ${r.costos.otrosVentas?row('Otros ventas','-'+_cf$(r.costos.otrosVentas),'cf-er-neg'):''}
      ${tot('Total Ventas','-'+_cf$(r.totalVentas),'cf-er-neg')}
      ${tot('UTILIDAD ANTES DE ADS',_cf$(r.utilAntesAds),r.utilAntesAds>=0?'cf-er-pos':'cf-er-neg')}
      ${sec('📣 PUBLICIDAD')}
      ${rowAds('Ads Facebook','adsFBER',r.adsFBER,r.adsFBEsManual,r.adsFB)}
      ${rowAds('Ads TikTok','adsTTER',r.adsTTER,r.adsTTEsManual,r.adsTT)}
      ${row('Fee bancaria ('+(r.lim.comisionBancaria||1)+'%)','-'+_cf$(r.feeER),'cf-er-neg',
            'Sobre '+_cf$(r.adsTER)+' de publicidad')}
      ${tot('Total Ads + Fee','-'+_cf$(r.adsFeeER),'cf-er-neg')}
      <div style="height:10px;"></div>
      <div style="background:${r.utilNeta>=0?'var(--success-soft)':'var(--danger-soft)'};border-radius:10px;padding:14px 16px;border:2px solid ${r.utilNeta>=0?'rgba(57,230,122,.35)':'rgba(230,57,70,.35)'};display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:.85rem;font-weight:900;color:var(--text-1);">💰 UTILIDAD NETA</span>
        <span style="font-size:1.3rem;font-weight:900;font-family:var(--f-mono);color:${r.utilNeta>=0?'var(--success)':'var(--danger)'};">${_cf$(r.utilNeta)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 4px;">
        <span style="font-size:.75rem;color:var(--text-2);font-weight:600;">Margen Neto</span>
        <span style="font-size:.85rem;font-weight:800;color:${r.margen>=(r.lim.margenNeto||15)?'#16a34a':r.margen>0?'#d97706':'#dc2626'}">${_cfP(r.margen)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
        <span style="font-size:.75rem;color:var(--text-2);font-weight:600;">CPA Break-even</span>
        <span style="font-size:.78rem;font-weight:700;color:var(--info);">${_cf$(r.cpaBreak)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
        <span style="font-size:.75rem;color:var(--text-2);font-weight:600;">CPA Entregado</span>
        <span style="font-size:.78rem;font-weight:700;color:var(--info);">${_cf$(r.cpaEnt)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
        <span style="font-size:.75rem;color:var(--text-2);font-weight:600;">Estado</span>
        <div class="cf-alert ${r.estadoC}" style="padding:4px 12px;border-radius:12px;margin:0;font-weight:800;font-size:.72rem;">${r.estado}</div>
      </div>
    </div></div>`;
}

// ── CONFIG ────────────────────────────────────────────────────────────
function _cfRenderAnaliticas(){
  const el=document.getElementById('cf-tab-analiticas');
  if(!el)return;
  const ua=_cfMD.ultimoAnalisis||(_cfExtracted?_cfExtracted:null);
  if(!ua||(!ua.byCiudad&&!ua.byTrans&&!ua.byProdAnal)){
    el.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.8rem;">
      <div style="font-size:2rem;margin-bottom:12px;">🔍</div>
      <div style="font-weight:700;color:var(--text-2);margin-bottom:6px;">Sin datos de analíticas</div>
      <div>Sube el archivo de Órdenes en la pestaña <b>Órdenes</b> y haz clic en <b>Aplicar</b> para generar las analíticas.</div>
    </div>`;return;
  }

  // ── Helpers ──────────────────────────────────────────────────────
  const ef=(ent,proc,dev)=>{const d=ent+proc+dev;return d>0?(ent/d*100).toFixed(1):'—';};
  const efCls=v=>{if(v==='—')return '#94a3b8';const n=parseFloat(v);return n>=70?'#16a34a':n>=50?'#d97706':'#dc2626';};
  const bar=(pct,color)=>`<div style="background:var(--bg-inset);border-radius:3px;height:5px;margin-top:3px;"><div style="background:${color};width:${Math.min(100,parseFloat(pct)||0)}%;height:5px;border-radius:3px;transition:width .3s;"></div></div>`;
  const thS=`background:#131920;color:white;padding:7px 10px;font-size:.58rem;font-weight:700;white-space:nowrap;text-align:center;`;
  const thL=`background:#131920;color:white;padding:7px 10px;font-size:.58rem;font-weight:700;white-space:nowrap;text-align:left;`;
  const tdS=(v,c)=>`<td style="padding:5px 8px;font-size:.65rem;text-align:center;border-bottom:1px solid var(--border);${c?'color:'+c+';font-weight:700;':''}white-space:nowrap;">${v}</td>`;
  const tdL=(v,c)=>`<td style="padding:5px 8px;font-size:.65rem;text-align:left;border-bottom:1px solid var(--border);${c?'color:'+c+';font-weight:700;':''}white-space:nowrap;">${v}</td>`;

  // ── CIUDADES ─────────────────────────────────────────────────────
  let ciudadesHTML='<div style="color:var(--text-3);font-size:.7rem;padding:12px;">Sin datos de ciudad — sube el archivo de Órdenes.</div>';
  const byCiudad=ua.byCiudad||{};
  const ciudades=Object.entries(byCiudad)
    .map(([n,d])=>({n,despachados:d.ent+d.proc+d.dev,...d}))
    .sort((a,b)=>b.num-a.num);
  if(ciudades.length){
    const maxNum=ciudades[0].num||1;
    ciudadesHTML=`<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${thS}width:32px">#</th>
        <th style="${thL}">Ciudad</th>
        <th style="${thS}">Total</th>
        <th style="${thS}color:var(--success);">Entregados</th>
        <th style="${thS}color:#67e8f9;">En proceso</th>
        <th style="${thS}color:#f87171;">Devueltos</th>
        <th style="${thS}color:#fbbf24;">Cancelados</th>
        <th style="${thS}">Efectividad</th>
        <th style="${thS}color:#f59e0b;" title="Flete total ÷ despachados (entregados+proceso+devueltos)">Flete Promedio</th>
        <th style="${thL}min-width:90px;">Volumen</th>
      </tr></thead><tbody>
      ${ciudades.slice(0,50).map((c,i)=>{
        const efv=ef(c.ent,c.proc,c.dev);
        const pEnt=c.despachados>0?(c.ent/c.despachados*100).toFixed(1):0;
        const pDev=c.despachados>0?(c.dev/c.despachados*100).toFixed(1):0;
        const pProc=c.despachados>0?(c.proc/c.despachados*100).toFixed(1):0;
        const fleteProm=c.despachados>0?(c.flete||0)/c.despachados:0;
        const volPct=(c.num/maxNum*100).toFixed(0);
        const rowBg=i%2===0?'':'background:var(--bg-hover);';
        return `<tr style="${rowBg}">
          ${tdS(i+1,'#94a3b8')}
          ${tdL(`<div style="font-weight:700;color:var(--text-1);">${c.n}</div>`)}
          ${tdS(c.num,'#374151')}
          ${tdS(`<div>${c.ent}</div><div style="font-size:.5rem;color:var(--success);">${pEnt}%</div>`,'#16a34a')}
          ${tdS(`<div>${c.proc}</div><div style="font-size:.5rem;color:var(--info);">${pProc}%</div>`,'#0891b2')}
          ${tdS(`<div>${c.dev}</div><div style="font-size:.5rem;color:var(--danger);">${pDev}%</div>`,'#dc2626')}
          ${tdS(c.canc||0,'#d97706')}
          ${tdS(`<span style="font-size:.75rem;font-weight:900;color:${efCls(efv)};">${efv}%</span>`)}
          ${tdS(fleteProm>0?_cf$(fleteProm):'—','#f59e0b')}
          ${tdL(`${bar(volPct,'#6366f1')}`)}
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  // ── TRANSPORTADORAS ───────────────────────────────────────────────
  const byTrans=ua.byTrans||{};
  const trans=Object.entries(byTrans)
    .map(([n,d])=>({n,despachados:d.ent+d.proc+d.dev,...d}))
    .sort((a,b)=>b.num-a.num);
  let transHTML='<div style="color:var(--text-3);font-size:.7rem;padding:12px;">Sin datos.</div>';
  if(trans.length){
    transHTML=`<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${thS}width:32px">#</th>
        <th style="${thL}">Transportadora</th>
        <th style="${thS}">Total</th>
        <th style="${thS}color:var(--success);">Entregados</th>
        <th style="${thS}color:#67e8f9;">En proceso</th>
        <th style="${thS}color:#f87171;">Devueltos</th>
        <th style="${thS}color:#fbbf24;">Cancelados</th>
        <th style="${thS}">Efectividad</th>
        <th style="${thS}">% Dev</th>
        <th style="${thS}color:#f59e0b;" title="Flete total ÷ despachados (entregados+proceso+devueltos)">Flete Promedio</th>
      </tr></thead><tbody>
      ${trans.map((t,i)=>{
        const efv=ef(t.ent,t.proc,t.dev);
        const pEnt=t.despachados>0?(t.ent/t.despachados*100).toFixed(1):0;
        const pDev=t.despachados>0?(t.dev/t.despachados*100).toFixed(1):0;
        const pProc=t.despachados>0?(t.proc/t.despachados*100).toFixed(1):0;
        const fleteProm=t.despachados>0?(t.flete||0)/t.despachados:0;
        const rowBg=i%2===0?'':'background:var(--bg-hover);';
        return `<tr style="${rowBg}">
          ${tdS(i+1,'#94a3b8')}
          ${tdL(`<div style="font-weight:700;color:var(--text-1);">${t.n}</div>`)}
          ${tdS(t.num,'#374151')}
          ${tdS(`<div>${t.ent}</div><div style="font-size:.5rem;color:var(--success);">${pEnt}%</div>`,'#16a34a')}
          ${tdS(`<div>${t.proc}</div><div style="font-size:.5rem;color:var(--info);">${pProc}%</div>`,'#0891b2')}
          ${tdS(`<div>${t.dev}</div><div style="font-size:.5rem;color:var(--danger);">${pDev}%</div>`,'#dc2626')}
          ${tdS(t.canc||0,'#d97706')}
          ${tdS(`<span style="font-size:.75rem;font-weight:900;color:${efCls(efv)};">${efv}%</span>`)}
          ${tdS(`<span style="color:${parseFloat(pDev)>20?'#dc2626':'#374151'};font-weight:700;">${pDev}%</span>`)}
          ${tdS(fleteProm>0?_cf$(fleteProm):'—','#f59e0b')}
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  // ── PRODUCTOS ─────────────────────────────────────────────────────
  const byProdAnal=ua.byProdAnal||{};
  const prods=Object.values(byProdAnal).sort((a,b)=>b.num-a.num);
  let colsWarnHTML='';
  if(ua._colsDetProd&&ua._colsDetProd.venta==='⚠️ NO ENCONTRADA'){
    colsWarnHTML=`<div style="margin:0 0 10px;padding:8px 12px;background:var(--danger-soft);border-radius:8px;font-size:.62rem;color:var(--danger);">
      ⚠️ No se encontró la columna de venta en el Excel de Órdenes por Producto — las columnas de utilidad salen vacías.
      Columnas del archivo: <b>${ua._colsDetProd.headers.join(' · ')}</b>. Vuelve a subir el archivo y aplica de nuevo para refrescar este diagnóstico.
    </div>`;
  }
  let prodHTML='<div style="color:var(--text-3);font-size:.7rem;padding:12px;">Sin datos — sube el archivo de Órdenes por Producto.</div>';
  if(prods.length){
    prodHTML=`<div style="margin-bottom:6px;padding:6px 10px;background:var(--info-soft);border-radius:6px;font-size:.6rem;color:var(--info);">
      ℹ️ Esta tabla cuenta <b>unidades vendidas</b> (columna CANTIDAD del archivo de Órdenes por Producto), no número de pedidos distintos. Un mismo pedido con 3 unidades de un producto suma 3, no 1.
    </div>
    <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${thS}width:32px">#</th>
        <th style="${thL}">Producto</th>
        <th style="${thS}" title="Suma de la columna CANTIDAD, no cantidad de pedidos">Unidades</th>
        <th style="${thS}color:var(--success);">Entregados</th>
        <th style="${thS}color:#67e8f9;">En proceso</th>
        <th style="${thS}color:#f87171;">Devueltos</th>
        <th style="${thS}color:#fbbf24;">Cancelados</th>
        <th style="${thS}">Efectividad</th>
        <th style="${thS}color:#a78bfa;" title="(Venta - Precio proveedor) ÷ Venta">% Ut. Bruta</th>
        <th style="${thS}color:#34d399;" title="Venta promedio por unidad - Precio proveedor promedio por unidad">Recaudo promedio</th>
      </tr></thead><tbody>
      ${prods.slice(0,40).map((p,i)=>{
        const efv=ef(p.ent,p.proc,p.dev);
        const pEnt=p.ent+p.proc+p.dev>0?(p.ent/(p.ent+p.proc+p.dev)*100).toFixed(1):0;
        const pDev=p.ent+p.proc+p.dev>0?(p.dev/(p.ent+p.proc+p.dev)*100).toFixed(1):0;
        const pProc=p.ent+p.proc+p.dev>0?(p.proc/(p.ent+p.proc+p.dev)*100).toFixed(1):0;
        const rowBg=i%2===0?'':'background:var(--bg-hover);';
        const venta=p.venta||0, cogs=p.cogs||0, cant=p.cant||0;
        const utilBrutaPct=venta>0?((venta-cogs)/venta*100):null;
        const utilProm=cant>0?((venta/cant)-(cogs/cant)):null;
        const pctColor=v=>v===null?'#94a3b8':v>=30?'#16a34a':v>=10?'#d97706':'#dc2626';
        const pctTxt=v=>v===null?'—':v.toFixed(1)+'%';
        return `<tr style="${rowBg}">
          ${tdS(i+1,'#94a3b8')}
          ${tdL(`<div style="font-weight:700;color:var(--text-1);max-width:180px;white-space:normal;line-height:1.2;">${p.prod}</div>`)}
          ${tdS(p.num,'#374151')}
          ${tdS(`<div>${p.ent}</div><div style="font-size:.5rem;color:var(--success);">${pEnt}%</div>`,'#16a34a')}
          ${tdS(`<div>${p.proc}</div><div style="font-size:.5rem;color:var(--info);">${pProc}%</div>`,'#0891b2')}
          ${tdS(`<div>${p.dev}</div><div style="font-size:.5rem;color:var(--danger);">${pDev}%</div>`,'#dc2626')}
          ${tdS(p.canc||0,'#d97706')}
          ${tdS(`<span style="font-size:.75rem;font-weight:900;color:${efCls(efv)};">${efv}%</span>`)}
          ${tdS(`<span style="font-weight:800;color:${pctColor(utilBrutaPct)};">${pctTxt(utilBrutaPct)}</span>`)}
          ${tdS(utilProm===null?'—':`<span style="font-weight:800;color:${utilProm>=0?'#16a34a':'#dc2626'};">${_cf$(utilProm)}</span>`)}
        </tr>`;
      }).join('')}
      </tbody></table>
      <div style="padding:8px 12px;font-size:.6rem;color:var(--text-3);">Todas las columnas de esta tabla (Unidades, Entregados, En proceso, Devueltos, Cancelados) son cantidad de unidades, no cantidad de pedidos. % Ut. Bruta = (Venta − Precio proveedor) ÷ Venta · Recaudo promedio = venta promedio por unidad − costo proveedor promedio por unidad. Requiere que el Excel de Órdenes por Producto tenga la columna TOTAL DE LA ORDEN (o VALOR DE COMPRA EN PRODUCTOS).</div>
    </div>`;
  }

  // ── TOP PRODUCTOS CON MÁS DEVOLUCIONES ────────────────────────────
  let devolHTML='<div style="color:var(--text-3);font-size:.7rem;padding:12px;">Sin devoluciones registradas — o sube el archivo de Órdenes por Producto.</div>';
  const prodsDevol=prods
    .filter(p=>(p.dev||0)>0)
    .sort((a,b)=>(b.dev-a.dev)||((b.dev/Math.max(1,b.ent+b.proc+b.dev))-(a.dev/Math.max(1,a.ent+a.proc+a.dev))))
    .slice(0,15);
  if(prodsDevol.length){
    const maxDev=prodsDevol[0].dev||1;
    devolHTML=`<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${thS}width:32px">#</th>
        <th style="${thL}">Producto</th>
        <th style="${thS}color:#f87171;">Devueltos</th>
        <th style="${thS}">% Devolución</th>
        <th style="${thS}">Despachados</th>
        <th style="${thS}color:var(--success);">Entregados</th>
        <th style="${thL}min-width:110px;">Impacto</th>
      </tr></thead><tbody>
      ${prodsDevol.map((p,i)=>{
        const desp=(p.ent||0)+(p.proc||0)+(p.dev||0);
        const pDev=desp>0?(p.dev/desp*100):0;
        const pDevTxt=pDev.toFixed(1)+'%';
        const devColor=pDev>=25?'#f87171':pDev>=15?'#fbbf24':'var(--text-2)';
        const volPct=(p.dev/maxDev*100).toFixed(0);
        const rowBg=i%2===0?'':'background:var(--bg-hover);';
        return `<tr style="${rowBg}">
          ${tdS(i+1,'#94a3b8')}
          ${tdL(`<div style="font-weight:700;color:var(--text-1);max-width:200px;white-space:normal;line-height:1.2;">${p.prod}</div>`)}
          ${tdS(`<span style="font-size:.78rem;font-weight:900;color:#f87171;">${p.dev}</span>`)}
          ${tdS(`<span style="font-weight:800;color:${devColor};">${pDevTxt}</span>`)}
          ${tdS(desp,'var(--text-2)')}
          ${tdS(p.ent||0,'var(--success)')}
          ${tdL(bar(volPct,'#E63946'))}
        </tr>`;
      }).join('')}
      </tbody></table>
      <div style="padding:8px 12px;font-size:.6rem;color:var(--text-3);">Devueltos, Despachados y Entregados son cantidad de unidades, no de pedidos. % Devolución = Devueltos ÷ Despachados. <span style="color:#f87171;font-weight:700;">Rojo ≥25%</span> · <span style="color:#fbbf24;font-weight:700;">Ámbar ≥15%</span> — candidatos a revisar calidad, expectativa del cliente o transportadora.</div>
    </div>`;
  }

  const fechaLbl=ua.fechaAplicado?`<span style="font-size:.58rem;color:var(--text-3);"> — datos del ${new Date(ua.fechaAplicado).toLocaleDateString('es-CO')}</span>`:'';

  el.innerHTML=`
    <div style="padding:4px 0 8px;font-size:.62rem;color:var(--text-3);padding:8px 12px;">
      Datos extraídos del Excel de Órdenes${fechaLbl}. La <b>efectividad</b> = Entregados ÷ Despachados (excluye cancelados/pendientes).
      <span style="display:inline-block;margin-left:8px;background:var(--success-soft);color:var(--success);border-radius:4px;padding:1px 6px;font-weight:700;">≥70% buena</span>
      <span style="display:inline-block;margin-left:4px;background:var(--warning-soft);color:var(--warning);border-radius:4px;padding:1px 6px;font-weight:700;">50-70% media</span>
      <span style="display:inline-block;margin-left:4px;background:var(--danger-soft);color:var(--danger);border-radius:4px;padding:1px 6px;font-weight:700;">&lt;50% baja</span>
    </div>

    <div class="cf-sec"><div class="cf-sec-hdr">🏙️ Ranking por ciudades — Top 50</div>
      <div class="cf-sec-body" style="padding:0;">${ciudadesHTML}</div></div>

    <div class="cf-sec"><div class="cf-sec-hdr">🚚 Efectividad por transportadora</div>
      <div class="cf-sec-body" style="padding:0;">${transHTML}</div></div>

    <div class="cf-sec"><div class="cf-sec-hdr" style="color:#f87171;">🔄 Top productos con más devoluciones — Top 15</div>
      <div class="cf-sec-body" style="padding:0;">${devolHTML}</div></div>

    <div class="cf-sec"><div class="cf-sec-hdr">📦 Ranking por producto — Top 40</div>
      <div class="cf-sec-body" style="padding:8px 0 0;">${colsWarnHTML}<div style="padding:0 0 8px;">${prodHTML}</div></div></div>
  `;
}

// Presets de país/moneda — cada tienda guarda los suyos, sin conversión ni consolidado entre ellas
const _CF_MONEDAS=[
  {codigo:'COP',simbolo:'$',pais:'Colombia',label:'🇨🇴 Colombia — Peso colombiano ($)'},
  {codigo:'GTQ',simbolo:'Q',pais:'Guatemala',label:'🇬🇹 Guatemala — Quetzal (Q)'},
  {codigo:'MXN',simbolo:'$',pais:'México',label:'🇲🇽 México — Peso mexicano ($)'},
  {codigo:'USD',simbolo:'US$',pais:'Estados Unidos',label:'🇺🇸 Estados Unidos — Dólar (US$)'},
  {codigo:'PEN',simbolo:'S/',pais:'Perú',label:'🇵🇪 Perú — Sol (S/)'},
  {codigo:'CLP',simbolo:'$',pais:'Chile',label:'🇨🇱 Chile — Peso chileno ($)'},
  {codigo:'ARS',simbolo:'$',pais:'Argentina',label:'🇦🇷 Argentina — Peso argentino ($)'},
  {codigo:'HNL',simbolo:'L',pais:'Honduras',label:'🇭🇳 Honduras — Lempira (L)'},
];

function _cfRenderConfig(){
  const el=document.getElementById('cf-tab-config');
  const lim=_cfCfg.limites||_CF_DEF.limites;
  const ca=_cfCfg.costosAdmin||_CF_DEF.costosAdmin;
  const mon=_cfCfg.moneda||_CF_DEF.moneda;
  const presetMatch=_CF_MONEDAS.find(m=>m.codigo===mon.codigo&&m.simbolo===mon.simbolo);
  el.innerHTML=`
    <div class="cf-sec"><div class="cf-sec-hdr">💱 Moneda de esta tienda</div><div class="cf-sec-body">
      <div style="font-size:.72rem;color:var(--text-2);margin-bottom:10px;">Cada tienda tiene su propia moneda — los montos no se convierten ni se consolidan entre tiendas.</div>
      <div class="cf-cfg-grid">
        <div class="cf-cfg-item"><div class="cf-cfg-lbl">País / moneda</div>
          <select class="cf-cfg-inp" id="cf-cfg-moneda-preset" onchange="_cfSetMonedaPreset(this.value)">
            ${_CF_MONEDAS.map(m=>`<option value="${m.codigo}|${m.simbolo}" ${presetMatch&&presetMatch.codigo===m.codigo?'selected':''}>${m.label}</option>`).join('')}
            <option value="custom" ${presetMatch?'':'selected'}>Personalizado…</option>
          </select>
        </div>
        <div class="cf-cfg-item"><div class="cf-cfg-lbl">Símbolo a mostrar</div>
          <input class="cf-cfg-inp" type="text" id="cf-cfg-moneda-simbolo" maxlength="5" value="${mon.simbolo||'$'}" oninput="_cfSetMoneda('simbolo',this.value)"></div>
        <div class="cf-cfg-item"><div class="cf-cfg-lbl">Código (referencia)</div>
          <input class="cf-cfg-inp" type="text" maxlength="4" value="${mon.codigo||'COP'}" oninput="_cfSetMoneda('codigo',this.value.toUpperCase())"></div>
      </div>
    </div></div>
    <div class="cf-sec"><div class="cf-sec-hdr">⚠️ Límites operativos (%)</div><div class="cf-sec-body">
      <div class="cf-cfg-grid">
        ${[['cancelacion','% Máx. Cancelación'],['devolucion','% Máx. Devolución'],['margenNeto','% Margen neto objetivo'],['comisionBancaria','% Fee bancaria Ads'],['entregaEsperada','% Entrega esperada']].map(([k,lbl])=>`
        <div class="cf-cfg-item"><div class="cf-cfg-lbl">${lbl}</div>
          <input class="cf-cfg-inp" type="number" step="0.1" min="0" value="${lim[k]||''}" placeholder="0" oninput="_cfSetLim('${k}',this.value)"></div>`).join('')}
      </div>
    </div></div>
    <div class="cf-sec"><div class="cf-sec-hdr">🏢 Costos administrativos fijos / mes ${_cfSim()}</div><div class="cf-sec-body">
      <div class="cf-cfg-grid">
        ${[['shopify','Shopify + Apps'],['tarjetas','Mantenimiento tarjetas'],['dominio','Dominio'],['impuesto4x1000','4×1000'],['openai','OpenAI / IA'],['nomina','Nómina'],['otros','Otros']].map(([k,lbl])=>{
          const rv=Math.round(ca[k]||0);const fv=rv>0?_cf$(rv):'';
          return `<div class="cf-cfg-item"><div class="cf-cfg-lbl">${lbl}</div>
            <input class="cf-cfg-inp" type="text" value="${fv}" placeholder="${_cfSim()} 0" style="text-align:right;font-weight:700;"
              onfocus="this.value=this.value.replace(/[^0-9]/g,'');this.select()"
              oninput="_cfSetAdmin('${k}',this.value)"
              onblur="const _r=_cfPN(this.value);_cfSetAdmin('${k}',_r);this.value=_r>0?_cf$(_r):''">
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:10px;padding:10px 12px;background:var(--bg-hover);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:.72rem;font-weight:700;color:var(--text-1);">TOTAL COSTOS ADMIN / MES</span>
        <span style="font-size:.85rem;font-weight:900;color:#7c3aed;" id="cf-cfg-total-admin">${_cf$(Object.values(ca).reduce((a,b)=>a+(b||0),0))}</span>
      </div>
    </div></div>`;
}
function _cfSetLim(k,v){if(!_cfCfg.limites)_cfCfg.limites={};_cfCfg.limites[k]=parseFloat(v)||0;_cfSaveCfg();}
function _cfSetAdmin(k,v){
  if(!_cfCfg.costosAdmin)_cfCfg.costosAdmin={};
  _cfCfg.costosAdmin[k]=_cfNum(v);
  const total=Object.values(_cfCfg.costosAdmin).reduce((a,b)=>a+(b||0),0);
  const el=document.getElementById('cf-cfg-total-admin');
  if(el)el.textContent=_cf$(total);
  _cfSaveCfg();
}
function _cfSetMonedaPreset(v){
  if(v==='custom')return; // deja el símbolo/código actuales para edición manual
  const [codigo,simbolo]=v.split('|');
  if(!_cfCfg.moneda)_cfCfg.moneda={};
  _cfCfg.moneda.codigo=codigo; _cfCfg.moneda.simbolo=simbolo;
  _cfSaveCfg();
  _cfRenderConfig();
  toast('💱 Moneda actualizada — se aplica a todos los montos de esta tienda');
}
function _cfSetMoneda(k,v){
  if(!_cfCfg.moneda)_cfCfg.moneda={};
  _cfCfg.moneda[k]=(v||'').trim();
  if(k==='simbolo'){
    const sel=document.getElementById('cf-cfg-moneda-preset');
    if(sel){
      const match=_CF_MONEDAS.find(m=>m.simbolo===_cfCfg.moneda.simbolo&&m.codigo===_cfCfg.moneda.codigo);
      sel.value=match?match.codigo+'|'+match.simbolo:'custom';
    }
  }
  _cfSaveCfg();
}

// ── ÓRDENES ──────────────────────────────────────────────────────────
// Estado de archivos cargados
let _cfXlsOrdenes=null, _cfXlsProductos=null, _cfExtracted=null;

function _cfRenderOrdenes(){
  const el=document.getElementById('cf-tab-ordenes');
  const stOrd=_cfXlsOrdenes
    ?`<span style="color:var(--success);font-weight:700;">✅ ${_cfXlsOrdenes.nombre} (${_cfXlsOrdenes.filas.toLocaleString()} filas)</span>`
    :'<span style="color:var(--text-3);">Sin cargar</span>';
  const stProd=_cfXlsProductos
    ?`<span style="color:var(--success);font-weight:700;">✅ ${_cfXlsProductos.nombre} (${_cfXlsProductos.filas.toLocaleString()} filas)</span>`
    :'<span style="color:var(--text-3);">Sin cargar</span>';
  const tieneAlguno=!!(_cfXlsOrdenes||_cfXlsProductos);
  el.innerHTML=`
    <div class="cf-sec"><div class="cf-sec-hdr">📂 Archivos de Dropi</div><div class="cf-sec-body">
      <div style="font-size:.68rem;color:var(--text-2);margin-bottom:12px;">Al subir un archivo se extraen automáticamente los datos financieros (COD, fletes, COGS) y se previsualiza lo que se guardará en el mes <b>${_cfMesLabel(_cfMes)}</b>.</div>
      <!-- Slot 1 -->
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-hover);border-radius:10px;border:1.5px solid ${_cfXlsOrdenes?'#bbf7d0':'#e2e8f0'};margin-bottom:9px;flex-wrap:wrap;">
        <div style="font-size:1.5rem;">📄</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.74rem;font-weight:800;color:var(--text-1);">ÓRDENES <span style="font-weight:400;color:var(--text-2);">(por pedido)</span></div>
          <div style="font-size:.62rem;color:var(--text-3);margin-top:2px;">ESTATUS · VALOR FACTURADO · PRECIO FLETE · COSTO DEV FLETE · VALOR COMPRA EN PRODUCTOS…</div>
          <div style="margin-top:5px;">${stOrd}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <label style="background:#6366f1;color:white;padding:8px 15px;border-radius:8px;cursor:pointer;font-size:.72rem;font-weight:700;display:inline-block;">
            📁 Subir .xlsx<input type="file" accept=".xlsx,.xls" style="display:none" onchange="_cfCargarXls(this,'ord')">
          </label>
          ${_cfXlsOrdenes?`<button onclick="_cfQuitarXls('ord')" style="background:var(--danger-soft);color:var(--danger);border:none;padding:8px 11px;border-radius:8px;cursor:pointer;font-size:.78rem;font-weight:700;">✕</button>`:''}
        </div>
      </div>
      <!-- Slot 2 -->
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-hover);border-radius:10px;border:1.5px solid ${_cfXlsProductos?'#ddd6fe':'#e2e8f0'};margin-bottom:12px;flex-wrap:wrap;">
        <div style="font-size:1.5rem;">📦</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.74rem;font-weight:800;color:var(--text-1);">ÓRDENES POR PRODUCTOS <span style="font-weight:400;color:var(--text-2);">(detalle)</span></div>
          <div style="font-size:.62rem;color:var(--text-3);margin-top:2px;">PRODUCTO · SKU · VARIACIÓN · CANTIDAD · PRECIO PROVEEDOR X CANTIDAD…</div>
          <div style="margin-top:5px;">${stProd}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <label style="background:#7c3aed;color:white;padding:8px 15px;border-radius:8px;cursor:pointer;font-size:.72rem;font-weight:700;display:inline-block;">
            📁 Subir .xlsx<input type="file" accept=".xlsx,.xls" style="display:none" onchange="_cfCargarXls(this,'prod')">
          </label>
          ${_cfXlsProductos?`<button onclick="_cfQuitarXls('prod')" style="background:var(--danger-soft);color:var(--danger);border:none;padding:8px 11px;border-radius:8px;cursor:pointer;font-size:.78rem;font-weight:700;">✕</button>`:''}
        </div>
      </div>
      ${tieneAlguno?`<div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="_cfAnalizarXls()" style="background:#131920;color:white;border:none;padding:10px 22px;border-radius:9px;cursor:pointer;font-size:.75rem;font-weight:800;">🔄 Re-analizar</button>
        <button onclick="_cfQuitarXls('ambos')" style="background:var(--bg-inset);color:var(--text-2);border:1px solid var(--border);padding:10px 16px;border-radius:9px;cursor:pointer;font-size:.72rem;">✕ Limpiar archivos</button>
      </div>`:''}
      <div style="margin-top:8px;">
        <button onclick="_cfResetCodCostos()" style="background:var(--warning-soft);color:#c2410c;border:1px solid #fed7aa;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:.65rem;font-weight:700;">🗑️ Limpiar COD y Costos guardados (resetear Firebase)</button>
      </div>
    </div></div>
    <div id="cf-ord-result"></div>`;
  // Auto-analiza si hay archivos en memoria; si no, muestra el último análisis guardado
  if(tieneAlguno) setTimeout(_cfAnalizarXls, 0);
  else if(_cfMD.ultimoAnalisis) _cfRenderAnalisis(_cfMD.ultimoAnalisis, true);
}

function _cfCargarXls(input, tipo){
  const file=input.files[0];
  if(!file)return;
  // Indicador de carga
  const resEl=document.getElementById('cf-ord-result');
  if(resEl)resEl.innerHTML=`<div style="padding:20px;text-align:center;color:var(--accent);font-size:.78rem;font-weight:700;">⏳ Leyendo ${file.name}…</div>`;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const wsName=wb.SheetNames[0];
      const ws=wb.Sheets[wsName];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});
      if(tipo==='ord') _cfXlsOrdenes={nombre:file.name,filas:rows.length,rows};
      else             _cfXlsProductos={nombre:file.name,filas:rows.length,rows};
      _cfExtracted=null;
      _cfRenderOrdenes(); // re-renderiza y auto-analiza
    }catch(err){
      if(resEl)resEl.innerHTML=`<div style="padding:14px;color:var(--danger);font-size:.75rem;">Error leyendo el archivo: ${err.message}</div>`;
    }
    input.value='';
  };
  reader.readAsArrayBuffer(file);
}

function _cfQuitarXls(tipo){
  if(tipo==='ord'||tipo==='ambos')_cfXlsOrdenes=null;
  if(tipo==='prod'||tipo==='ambos')_cfXlsProductos=null;
  _cfExtracted=null;
  if(tipo==='ambos'){const r=document.getElementById('cf-ord-result');if(r)r.innerHTML='';}
  _cfRenderOrdenes();
}

function _cfAnalizarXls(){
  const resEl=document.getElementById('cf-ord-result');
  if(!resEl)return;
  if(!_cfXlsOrdenes&&!_cfXlsProductos){resEl.innerHTML='';return;}

  // ── Helpers ──────────────────────────────────────────────────────────
  const norm=s=>String(s||'').trim().toUpperCase()
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U').replace(/Ñ/g,'N');
  const findCol=(hdrs,tests)=>{
    for(const h of hdrs){const hn=norm(h);if(tests.some(t=>hn===t))return h;}
    for(const h of hdrs){const hn=norm(h);if(tests.some(t=>hn.includes(t)))return h;}
    return null;
  };
  // Si ya es número JS (raw:true en XLSX), úsalo directo — no quitar puntos decimales
  const parseN=v=>{if(typeof v==='number')return isNaN(v)?0:v;const s=String(v||0).replace(/\$/g,'').trim();return parseFloat(s.replace(/\./g,'').replace(',','.'))||0;};
  const isEnt =e=>{const n=norm(String(e||''));return n.includes('ENTREGAD');};
  const isDev =e=>{const n=norm(String(e||''));return n.includes('DEVUELT')||n.includes('DEVOLUCION');};
  // "No gestionado" = pendiente / pendiente confirmacion / cancelado / rechazado / rechazada
  const isNoGest=e=>{const n=norm(String(e||''));
    return n.includes('PENDIENTE')||n.includes('PENDIENT')||n.includes('CANCELAD')||n.includes('RECHAZAD');};
  // En proceso = todo lo que NO es entregado, devuelto ni "no gestionado"
  const isProc=e=>!isEnt(e)&&!isDev(e)&&!isNoGest(e);
  // Alias para compatibilidad con tabla de detalle
  const isCanc=isNoGest;
  const isPend=isNoGest;
  const th=s=>`<th style="background:#1A2230;color:white;padding:6px 9px;font-size:.6rem;font-weight:700;white-space:nowrap;">${s}</th>`;
  const td=(s,c,r)=>`<td style="padding:5px 8px;font-size:.7rem;${c?'color:'+c+';font-weight:700;':''}${r?'text-align:right;':''}border-bottom:1px solid var(--border);">${s}</td>`;

  // Función para convertir número serial de Excel a fecha YYYY-MM-DD
  const xlsDateToStr=serial=>{
    if(!serial||isNaN(serial))return null;
    // Excel epoch: 1 Jan 1900 = serial 1 (con bug del año bisiesto 1900)
    const d=new Date(Math.round((serial-25569)*86400*1000));
    const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
    return y+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  };
  // También parsea fechas string "DD/MM/YYYY" o "YYYY-MM-DD"
  const parseDate=v=>{
    if(!v)return null;
    if(typeof v==='number')return xlsDateToStr(v);
    const s=String(v).trim();
    // DD/MM/YYYY
    const m1=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if(m1)return m1[3]+'-'+m1[2].padStart(2,'0')+'-'+m1[1].padStart(2,'0');
    // YYYY-MM-DD
    const m2=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if(m2)return m2[1]+'-'+m2[2].padStart(2,'0')+'-'+m2[3].padStart(2,'0');
    return null;
  };

  // Objeto que acumulará todos los datos extraídos
  const X={
    cod:{
      entregados:{num:0,monto:0}, enProceso:{num:0,monto:0},
      devueltos:{num:0,monto:0}, cancelados:{num:0}, pendientes:{num:0}
    },
    costos:{
      fleteEntregados:0,fleteEnProceso:0,fleteDevueltos:0,
      cogsOrden:0,
      cogsProd:0,
    },
    // Pedidos diarios por canal: {dd: {wpp:0, shop:0, monto:0}}
    diasCanal:{},
    fuenteCogs:'',
    byTrans:{}, byEstAll:{}, novStats:{}, topProd:[],
    byCiudad:{}, byProdAnal:{},
    totalFilasOrd:0, totalFilasProd:0
  };

  // ── Procesar ORDENES ─────────────────────────────────────────────────
  if(_cfXlsOrdenes){
    const rows=_cfXlsOrdenes.rows.filter(r=>Object.keys(r).length>2);
    X.totalFilasOrd=rows.length;
    const hdrs=Object.keys(rows[0]||{});
    // Busca columna por nombre exacto primero, luego parcial
    const col=(names)=>findCol(hdrs,names);
    const C={
      est:        col(['ESTATUS','STATUS']),
      fecha:      col(['FECHA DE REPORTE','FECHA REPORTE','FECHA']),
      monto:      col(['VALOR DE COMPRA EN PRODUCTOS']),
      cogs:       col(['TOTAL EN PRECIOS DE PROVEEDOR']),
      flete:      col(['PRECIO FLETE']),
      flDev:      col(['COSTO DEVOLUCION FLETE','COSTO DEV FLETE']),
      trans:      col(['TRANSPORTADORA']),
      tipoTienda: col(['TIPO DE TIENDA','TIPO TIENDA']),
      novedad:    col(['NOVEDAD']),
      ciudad:     col(['CIUDAD DESTINO','CIUDAD']),
      depto:      col(['DEPARTAMENTO DESTINO','DEPARTAMENTO']),
    };
    rows.forEach(r=>{
      const est=r[C.est]||'';if(!norm(est))return;
      const monto=parseN(r[C.monto]);
      const cog=parseN(r[C.cogs]);
      const flete=parseN(r[C.flete]);
      const flDev=parseN(r[C.flDev]);
      const trans=norm(r[C.trans]||'SIN TRANS');
      const estN=norm(est);
      // Canal: TIPO DE TIENDA = "SHOPIFY" | "CHATEA PRO" (WPP)
      const tienda=norm(r[C.tipoTienda]||'');
      const esWpp=tienda.includes('CHATEA')||tienda.includes('WPP')||tienda.includes('WHATSAPP');
      const esShop=tienda.includes('SHOPIFY');
      // Fecha del pedido
      const fechaStr=parseDate(r[C.fecha]);
      const dia=fechaStr?fechaStr.slice(8,10):null; // "DD"

      // Acumular por día y canal (solo si tiene fecha válida del mes actual)
      if(dia){
        const mesDoc=fechaStr?fechaStr.slice(0,7):null;
        // Solo guardar si la fecha corresponde al mes activo
        if(!_cfMD.dias||mesDoc===_cfMes||!_cfMD||true){
          if(!X.diasCanal[dia])X.diasCanal[dia]={wpp:0,shop:0,monto:0,montoWpp:0};
          if(esWpp){X.diasCanal[dia].wpp++;X.diasCanal[dia].montoWpp+=monto;}
          else if(esShop){X.diasCanal[dia].shop++;X.diasCanal[dia].monto+=monto;}
          else{X.diasCanal[dia].shop++;X.diasCanal[dia].monto+=monto;} // sin canal → Shopify
        }
      }

      // Clasificar en COD según reglas del usuario:
      // Entregado / Devuelto / En Proceso (todo gestionado no ent/dev) / Cancelados (residual = no gestionados)
      X.cod._total=(X.cod._total||0)+1;
      if(isEnt(est)){
        X.cod.entregados.num++;X.cod.entregados.monto+=monto;
        X.costos.fleteEntregados+=flete;X.costos.cogsOrden+=cog;
      } else if(isDev(est)){
        X.cod.devueltos.num++;X.cod.devueltos.monto+=monto;
        X.costos.fleteDevueltos+=flDev||flete;
      } else if(isProc(est)){
        // gestionado pero no entregado ni devuelto
        X.cod.enProceso.num++;X.cod.enProceso.monto+=monto;
        X.costos.fleteEnProceso+=flete;
      }
      // los no-gestionados (pendiente/cancelado/rechazado) se calculan al final como residual

      // Por estatus (todos)
      if(!X.byEstAll[estN])X.byEstAll[estN]={num:0,monto:0,cogs:0,flete:0,flDev:0};
      const be=X.byEstAll[estN];
      be.num++;be.monto+=monto;be.cogs+=cog;be.flete+=flete;be.flDev+=flDev;

      // Por transportadora
      if(!X.byTrans[trans])X.byTrans[trans]={num:0,ent:0,dev:0,canc:0,proc:0,flete:0};
      const bt=X.byTrans[trans];bt.num++;
      // Flete sólo se acumula sobre gestionados (ent/proc/dev) — igual que costos.fleteXXX
      if(isEnt(est)){bt.ent++;bt.flete+=flete;}
      else if(isDev(est)){bt.dev++;bt.flete+=(flDev||flete);}
      else if(isCanc(est))bt.canc++;
      else if(isProc(est)){bt.proc++;bt.flete+=flete;}

      // Novedades
      if(C.novedad){const nv=norm(r[C.novedad]||'');if(nv)X.novStats[nv]=(X.novStats[nv]||0)+1;}
      // Ciudad
      if(C.ciudad){
        const ciu=String(r[C.ciudad]||'').trim().toUpperCase()||'SIN CIUDAD';
        if(!X.byCiudad[ciu])X.byCiudad[ciu]={num:0,ent:0,proc:0,dev:0,canc:0,monto:0,flete:0};
        const bc=X.byCiudad[ciu];bc.num++;bc.monto+=monto;
        if(isEnt(est)){bc.ent++;bc.flete+=flete;}
        else if(isDev(est)){bc.dev++;bc.flete+=(flDev||flete);}
        else if(isProc(est)){bc.proc++;bc.flete+=flete;}
        else bc.canc++;
      }
    });
    // Cancelados = total − gestionados (entregados + en proceso + devueltos)
    const gestionados=X.cod.entregados.num+X.cod.enProceso.num+X.cod.devueltos.num;
    X.cod.cancelados.num=Math.max(0,(X.cod._total||0)-gestionados);
    delete X.cod._total;
    if(X.costos.cogsOrden>0)X.fuenteCogs=X.fuenteCogs?'ambos':'orden';
    // Diagnóstico: qué columnas se detectaron + primer entregado
    const primerEnt=rows.find(r=>norm(String(r[C.est]||'')).includes('ENTREGAD'));
    X._colsDet={
      monto:   C.monto   ||'⚠️ NO ENCONTRADA',
      cogs:    C.cogs    ||'⚠️ NO ENCONTRADA',
      flete:   C.flete   ||'⚠️ NO ENCONTRADA',
      flDev:   C.flDev   ||'⚠️ NO ENCONTRADA',
      tipoTienda: C.tipoTienda||'⚠️ NO ENCONTRADA',
      fecha:   C.fecha   ||'⚠️ NO ENCONTRADA',
      _debug: primerEnt?{
        monto_raw: primerEnt[C.monto],
        monto_tipo: typeof primerEnt[C.monto],
        monto_parseN: parseN(primerEnt[C.monto]),
        flete_raw: primerEnt[C.flete],
        flete_tipo: typeof primerEnt[C.flete],
        flete_parseN: parseN(primerEnt[C.flete]),
        est: primerEnt[C.est],
        totalFilas: rows.length,
      }:'sin entregados',
    };
  }

  // ── Procesar ORDENES_PRODUCTOS ────────────────────────────────────────
  if(_cfXlsProductos){
    const rows=_cfXlsProductos.rows.filter(r=>Object.keys(r).length>2);
    X.totalFilasProd=rows.length;
    const hdrs=Object.keys(rows[0]||{});
    // "PRECIO PROVEEDOR X CANTIDAD" es el costo total; "PRECIO PROVEEDOR" es unit price
    const C={
      est:      findCol(hdrs,['ESTATUS','STATUS']),
      prod:     findCol(hdrs,['PRODUCTO']),
      sku:      findCol(hdrs,['SKU']),
      cant:     findCol(hdrs,['CANTIDAD']),
      cogXcant: findCol(hdrs,['PRECIO PROVEEDOR X CANTIDAD']),
      cogUnit:  findCol(hdrs,['PRECIO PROVEEDOR']),
      venta:    findCol(hdrs,['TOTAL DE LA ORDEN','TOTAL ORDEN','VALOR DE COMPRA EN PRODUCTOS','VALOR DE COMPRA','VALOR COMPRA PRODUCTOS','PRECIO X CANTIDAD','PRECIO DE VENTA X CANTIDAD','VALOR VENTA','PRECIO DE VENTA','PRECIO VENTA','TOTAL VENTA','PRECIO']),
    };
    // Si cogXcant y cogUnit apuntan a la misma col, buscar la unitaria sola
    if(C.cogXcant&&C.cogUnit&&C.cogXcant===C.cogUnit){
      const altUnit=hdrs.find(h=>norm(h)==='PRECIO PROVEEDOR');
      C.cogUnit=altUnit||null;
    }
    // Diagnóstico: qué columnas se detectaron en el archivo de productos (para depurar si vienen vacías)
    X._colsDetProd={
      headers: hdrs,
      prod: C.prod||'⚠️ NO ENCONTRADA', sku: C.sku||'⚠️ NO ENCONTRADA',
      cant: C.cant||'⚠️ NO ENCONTRADA', cogXcant: C.cogXcant||'⚠️ NO ENCONTRADA',
      cogUnit: C.cogUnit||'⚠️ NO ENCONTRADA', venta: C.venta||'⚠️ NO ENCONTRADA',
    };
    const byProd={};
    rows.forEach(r=>{
      const est=r[C.est]||'';if(!norm(est))return;
      const cant=parseN(r[C.cant])||1;
      const cogXcant=parseN(r[C.cogXcant]);
      const cogUnit=parseN(r[C.cogUnit]);
      const cog=cogXcant>0?cogXcant:(cogUnit*cant);
      const venta=parseN(r[C.venta]);
      const prod=String(r[C.prod]||'—').trim();
      const sku=String(r[C.sku]||'—').trim();
      const k=sku!=='—'?sku:prod;
      // Analíticas por producto agrupadas por nombre (no por SKU)
      const kProd=prod;
      if(!X.byProdAnal[kProd])X.byProdAnal[kProd]={prod,sku,num:0,ent:0,proc:0,dev:0,canc:0,cant:0,cogs:0,venta:0};
      const bp=X.byProdAnal[kProd];bp.num+=cant;
      if(isEnt(est)){bp.ent+=cant;bp.cant+=cant;bp.cogs+=cog;bp.venta+=venta;X.costos.cogsProd+=cog;byProd[k]=byProd[k]||{prod,sku,cant:0,cogs:0};byProd[k].cant+=cant;byProd[k].cogs+=cog;}
      else if(isDev(est))bp.dev+=cant;
      else if(isProc(est))bp.proc+=cant;
      else bp.canc+=cant;
    });
    X.topProd=Object.values(byProd).sort((a,b)=>b.cogs-a.cogs).slice(0,20);
    if(X.costos.cogsProd>0)X.fuenteCogs=X.fuenteCogs?'ambos':'prod';
  }

  _cfExtracted=X;
  _cfRenderAnalisis(X, false);
}

function _cfRenderAnalisis(X, isGuardado){
  const resEl=document.getElementById('cf-ord-result');
  if(!resEl)return;

  const norm=s=>String(s||'').trim().toUpperCase()
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U').replace(/Ñ/g,'N');
  const isEnt =e=>{const n=norm(String(e||''));return n.includes('ENTREGAD');};
  const isDev =e=>{const n=norm(String(e||''));return n.includes('DEVUELT')||n.includes('DEVOLUCION');};
  const isNoGest=e=>{const n=norm(String(e||''));return n.includes('PENDIENTE')||n.includes('PENDIENT')||n.includes('CANCELAD')||n.includes('RECHAZAD');};
  const isProc=e=>!isEnt(e)&&!isDev(e)&&!isNoGest(e);
  const isCanc=isNoGest;
  const th=s=>`<th style="background:#1A2230;color:white;padding:6px 9px;font-size:.6rem;font-weight:700;white-space:nowrap;">${s}</th>`;
  const td=(s,c,r)=>`<td style="padding:5px 8px;font-size:.7rem;${c?'color:'+c+';font-weight:700;':''}${r?'text-align:right;':''}border-bottom:1px solid var(--border);">${s}</td>`;

  const cogsUsar=X.costos.cogsOrden>0?X.costos.cogsOrden:X.costos.cogsProd;
  const cod=X.cod;
  const co=X.costos;
  const gestionadosTotal=cod.entregados.num+cod.enProceso.num+cod.devueltos.num;
  const totalFilas=X.totalFilasOrd||0;

  const prevHTML=`
    <div style="font-size:.6rem;color:var(--text-2);margin-bottom:8px;">
      Total pedidos en el archivo: <b>${totalFilas}</b> · Gestionados: <b>${gestionadosTotal}</b> · No gestionados (cancelados/pendientes): <b>${cod.cancelados.num}</b>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.7rem;">
      <thead><tr style="background:var(--bg-inset);">
        <th style="padding:5px 8px;text-align:left;font-weight:700;color:var(--text-1);">Categoría</th>
        <th style="padding:5px 8px;text-align:right;font-weight:700;color:var(--text-1);"># Pedidos</th>
        <th style="padding:5px 8px;text-align:right;font-weight:700;color:var(--text-1);">Monto $</th>
        <th style="padding:5px 8px;text-align:right;font-weight:700;color:var(--text-1);">Flete $</th>
      </tr></thead>
      <tbody>
        <tr style="border-bottom:1px solid var(--border);background:var(--success-soft);">
          <td style="padding:5px 8px;color:var(--success);font-weight:700;">✅ ENTREGADOS</td>
          <td style="padding:5px 8px;text-align:right;font-weight:800;color:var(--success);">${cod.entregados.num}</td>
          <td style="padding:5px 8px;text-align:right;color:var(--success);">${_cf$(cod.entregados.monto)}</td>
          <td style="padding:5px 8px;text-align:right;color:var(--text-2);">${_cf$(co.fleteEntregados)}</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);background:var(--info-soft);">
          <td style="padding:5px 8px;color:var(--info);font-weight:700;">🔵 EN PROCESO <span style="font-weight:400;color:var(--text-2);font-size:.6rem;">(gestionados no ent/dev)</span></td>
          <td style="padding:5px 8px;text-align:right;font-weight:800;color:var(--info);">${cod.enProceso.num}</td>
          <td style="padding:5px 8px;text-align:right;color:var(--info);">${_cf$(cod.enProceso.monto)}</td>
          <td style="padding:5px 8px;text-align:right;color:var(--text-2);">${_cf$(co.fleteEnProceso)}</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);background:var(--danger-soft);">
          <td style="padding:5px 8px;color:var(--danger);font-weight:700;">🔴 DEVUELTOS</td>
          <td style="padding:5px 8px;text-align:right;font-weight:800;color:var(--danger);">${cod.devueltos.num}</td>
          <td style="padding:5px 8px;text-align:right;color:var(--danger);">${_cf$(cod.devueltos.monto)}</td>
          <td style="padding:5px 8px;text-align:right;color:var(--text-2);">${_cf$(co.fleteDevueltos)}</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);background:var(--warning-soft);">
          <td style="padding:5px 8px;color:var(--warning);font-weight:700;">⚠️ CANCELADOS <span style="font-weight:400;color:var(--text-2);font-size:.6rem;">(total − gestionados)</span></td>
          <td style="padding:5px 8px;text-align:right;font-weight:800;color:var(--warning);">${cod.cancelados.num}</td>
          <td style="padding:5px 8px;text-align:right;color:var(--text-3);">—</td>
          <td style="padding:5px 8px;text-align:right;color:var(--text-3);">—</td>
        </tr>
        <tr style="border-top:2px solid var(--border);background:var(--bg-hover);">
          <td style="padding:5px 8px;color:#7c3aed;font-weight:700;">💜 COGS entregados <span style="font-weight:400;color:var(--text-2);font-size:.6rem;">${X.fuenteCogs==='ambos'?'(ORDENES seleccionado)':X.fuenteCogs==='prod'?'(desde PRODUCTOS)':'(desde ORDENES)'}</span></td>
          <td style="padding:5px 8px;text-align:right;"></td>
          <td style="padding:5px 8px;text-align:right;font-weight:800;color:#7c3aed;" colspan="2">${_cf$(cogsUsar)}</td>
        </tr>
      </tbody>
    </table>`;

  let byEstHTML='';
  Object.keys(X.byEstAll||{}).sort().forEach(e=>{
    const s=X.byEstAll[e];const ent=isEnt(e);const dev=isDev(e);const canc=isCanc(e);const proc=isProc(e);
    const c=ent?'#16a34a':proc?'#0891b2':dev?'#dc2626':canc?'#d97706':'#64748b';
    byEstHTML+=`<tr>${td(e,c)}${td(s.num,'','1')}${td(_cfM$(s.monto),'','1')}${td(_cfM$(s.flete),'','1')}${td(_cfM$(s.flDev),'','1')}${td(_cfM$(s.cogs),ent?'#7c3aed':'','1')}</tr>`;
  });

  let transHTML='';
  Object.keys(X.byTrans||{}).sort().forEach(t=>{
    const b=X.byTrans[t];const pEnt=b.num>0?Math.round(b.ent/b.num*100):0;
    transHTML+=`<tr>${td(t)}${td(b.num,'','1')}${td(b.ent,'#16a34a','1')}${td(b.proc,'#0891b2','1')}${td(b.dev,'#dc2626','1')}${td(b.canc,'#d97706','1')}${td(pEnt+'%',pEnt>=70?'#16a34a':pEnt>=50?'#d97706':'#dc2626','1')}</tr>`;
  });

  let novHTML='';
  Object.entries(X.novStats||{}).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([n,c])=>{
    novHTML+=`<tr>${td(n)}${td(c,'','1')}</tr>`;
  });

  let prodHTML=(X.topProd||[]).map(p=>
    `<tr>${td(p.prod)}${td(p.sku,'#64748b')}${td(p.cant,'','1')}${td(_cfM$(p.cogs/p.cant),'','1')}${td(_cfM$(p.cogs),'#7c3aed','1')}</tr>`
  ).join('');

  let cogsDualHTML='';
  if(!isGuardado && X.fuenteCogs==='ambos'){
    cogsDualHTML=`<div style="margin-top:8px;padding:10px 12px;background:var(--warning-soft);border-radius:8px;border:1px solid rgba(230,181,57,.4);font-size:.68rem;color:var(--warning);">
      ⚠️ Hay dos fuentes de COGS:<br>
      📄 ORDENES (VALOR COMPRA): <b>${_cf$(co.cogsOrden)}</b><br>
      📦 PRODUCTOS (PRECIO PROVEEDOR×CANT): <b>${_cf$(co.cogsProd)}</b><br>
      Se aplicará el de <b>ORDENES</b>. Puedes cambiarlo antes de aplicar.
      <div style="margin-top:7px;display:flex;gap:7px;">
        <button onclick="_cfSetCogsUsar('orden')" id="cf-cogs-btn-ord" style="background:#6366f1;color:white;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:.68rem;font-weight:700;">Usar ORDENES</button>
        <button onclick="_cfSetCogsUsar('prod')" id="cf-cogs-btn-prod" style="background:var(--bg-inset);color:var(--text-1);border:1px solid var(--border);padding:5px 12px;border-radius:6px;cursor:pointer;font-size:.68rem;">Usar PRODUCTOS</button>
      </div>
    </div>`;
  }

  // Encabezado según si es nuevo análisis o datos guardados
  const archGuardado=X.archivos||{};
  const fechaStr=X.fechaAplicado?new Date(X.fechaAplicado).toLocaleString('es-CO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  const hdrColor=isGuardado?'#0f766e':'#4338ca';
  const hdrBg=isGuardado?'#f0fdfa':'#eef2ff';
  const hdrIcono=isGuardado?'💾':'✅';
  const hdrTitulo=isGuardado
    ?`Último análisis guardado — aplicado el ${fechaStr}`
    :`Datos extraídos — listos para aplicar al mes ${_cfMesLabel(_cfMes)}`;

  let archivosInfo='';
  if(isGuardado){
    const oa=archGuardado.ord,pa=archGuardado.prod;
    archivosInfo=`<div style="font-size:.62rem;color:#0f766e;margin-bottom:8px;background:#ccfbf1;border-radius:6px;padding:5px 9px;">
      📄 ${oa?oa.nombre+' ('+oa.filas.toLocaleString()+' filas)':'—'}&nbsp;&nbsp;
      📦 ${pa?pa.nombre+' ('+pa.filas.toLocaleString()+' filas)':'—'}
    </div>`;
  }

  const totalFilasTotal=(X.totalFilasOrd||0)+(X.totalFilasProd||0);
  const botonAccion=isGuardado
    ?`<div style="font-size:.68rem;color:var(--text-2);text-align:center;padding:8px;background:var(--bg-inset);border-radius:8px;">
        Sube un nuevo archivo Excel arriba para actualizar este análisis
      </div>`
    :`<button id="cf-aplicar-btn" onclick="_cfAplicarTodo(this)" style="width:100%;margin-top:14px;background:#6366f1;color:white;border:none;padding:13px;border-radius:10px;cursor:pointer;font-size:.8rem;font-weight:800;letter-spacing:.3px;transition:background .2s,opacity .2s;">💾 Aplicar todos los datos al mes</button>`;

  resEl.innerHTML=`
    <div class="cf-sec" style="border-color:${hdrColor};">
      <div class="cf-sec-hdr" style="background:${hdrBg};color:${hdrColor};">${hdrIcono} ${hdrTitulo}</div>
      <div class="cf-sec-body">
        ${archivosInfo}
        <div style="font-size:.68rem;color:var(--text-2);margin-bottom:10px;">${totalFilasTotal.toLocaleString()} filas procesadas${X.totalFilasOrd?' · '+X.totalFilasOrd.toLocaleString()+' órdenes':''}${X.totalFilasProd?' · '+X.totalFilasProd.toLocaleString()+' productos':''}.</div>
        ${prevHTML}
        ${cogsDualHTML}
        ${X._colsDet?`<details style="margin-top:8px;" open><summary style="font-size:.6rem;color:var(--accent);cursor:pointer;font-weight:700;">🔍 Columnas detectadas — verificar antes de aplicar</summary>
          <div style="background:var(--bg-hover);border-radius:6px;padding:6px 8px;margin-top:4px;font-size:.58rem;font-family:monospace;line-height:1.7;color:var(--text-1);">
            Facturación (monto): <b>${X._colsDet.monto}</b><br>
            COGS proveedor: <b>${X._colsDet.cogs}</b><br>
            Flete envío: <b>${X._colsDet.flete}</b><br>
            Flete devolución: <b>${X._colsDet.flDev}</b><br>
            Tipo tienda (canal): <b>${X._colsDet.tipoTienda}</b><br>
            Fecha reporte: <b>${X._colsDet.fecha}</b>
            ${X._colsDet._debug&&typeof X._colsDet._debug==='object'?`<br>─── Primer ENTREGADO: ───<br>
            Monto raw: <b>${X._colsDet._debug.monto_raw}</b> (${X._colsDet._debug.monto_tipo}) → parseN: <b>${X._colsDet._debug.monto_parseN}</b><br>
            Flete raw: <b>${X._colsDet._debug.flete_raw}</b> (${X._colsDet._debug.flete_tipo}) → parseN: <b>${X._colsDet._debug.flete_parseN}</b><br>
            Total filas: <b>${X._colsDet._debug.totalFilas}</b>`:''}
          </div></details>`:''}
        ${X._colsDetProd?`<details style="margin-top:8px;" open><summary style="font-size:.6rem;color:var(--accent);cursor:pointer;font-weight:700;">🔍 Columnas detectadas — archivo de Órdenes por Producto</summary>
          <div style="background:var(--bg-hover);border-radius:6px;padding:6px 8px;margin-top:4px;font-size:.58rem;font-family:monospace;line-height:1.7;color:var(--text-1);">
            Producto: <b>${X._colsDetProd.prod}</b><br>
            SKU: <b>${X._colsDetProd.sku}</b><br>
            Cantidad: <b>${X._colsDetProd.cant}</b><br>
            Precio proveedor × cant.: <b>${X._colsDetProd.cogXcant}</b><br>
            Precio proveedor (unit.): <b>${X._colsDetProd.cogUnit}</b><br>
            Venta (para % utilidad): <b>${X._colsDetProd.venta}</b>
            ${X._colsDetProd.venta==='⚠️ NO ENCONTRADA'?`<br><span style="color:var(--danger);">⚠️ No se encontró columna de venta — por eso % utilidad sale vacío. Columnas del archivo: ${X._colsDetProd.headers.join(' · ')}</span>`:''}
          </div></details>`:''}
        ${botonAccion}
      </div>
    </div>
    ${byEstHTML?`<div class="cf-sec"><div class="cf-sec-hdr">📊 Detalle por estatus</div><div class="cf-sec-body" style="overflow-x:auto;">
      <table class="cf-ord-tbl" style="min-width:500px;"><thead><tr>
        ${th('ESTATUS')}${th('#')}${th('Monto '+_cfSim())}${th('Flete '+_cfSim())}${th('Flete Dev '+_cfSim())}${th('COGS '+_cfSim())}
      </tr></thead><tbody>${byEstHTML}</tbody></table>
    </div></div>`:''}
    `;
}

let _cfCogsUsar='orden';
function _cfSetCogsUsar(fuente){
  _cfCogsUsar=fuente;
  const bo=document.getElementById('cf-cogs-btn-ord');
  const bp=document.getElementById('cf-cogs-btn-prod');
  if(bo)bo.style.background=fuente==='orden'?'#6366f1':'#f1f5f9';
  if(bo)bo.style.color=fuente==='orden'?'white':'#374151';
  if(bp)bp.style.background=fuente==='prod'?'#7c3aed':'#f1f5f9';
  if(bp)bp.style.color=fuente==='prod'?'white':'#374151';
}

function _cfAplicarTodo(btn){
  if(!_cfExtracted){_mAlert('Falta analizar','Primero analizá los archivos para poder aplicar los datos.');return;}
  if(!btn)btn=document.getElementById('cf-aplicar-btn');
  const btnHTMLOrig=btn?btn.innerHTML:'';
  if(btn){
    btn.disabled=true;
    btn.style.opacity='.85';
    btn.style.cursor='wait';
    btn.innerHTML='<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:8px;"></span>Aplicando...';
  }
  setTimeout(()=>_cfAplicarTodoRun(btn,btnHTMLOrig),30);
}

function _cfAplicarTodoRun(btn,btnHTMLOrig){
  const X=_cfExtracted;
  const co=X.costos;

  // COD
  _cfMD.cod=JSON.parse(JSON.stringify(X.cod));

  // COGS: elegir fuente
  const cogsOrden=co.cogsOrden;const cogsProd=co.cogsProd;
  let cogsAplicar=cogsOrden>0?cogsOrden:cogsProd;
  if(cogsOrden>0&&cogsProd>0)cogsAplicar=_cfCogsUsar==='prod'?cogsProd:cogsOrden;

  // Costos — solo los 4 campos del Excel; chatepro/otrosVentas se guardan por separado y no se tocan
  if(!_cfMD.costos)_cfMD.costos={};
  _cfMD.costos.fleteEntregados=co.fleteEntregados;
  _cfMD.costos.fleteEnProceso=co.fleteEnProceso;
  _cfMD.costos.fleteDevueltos=co.fleteDevueltos;
  _cfMD.costos.cogsEntregados=cogsAplicar;

  // Guardar COD y solo los costos del Excel (no sobreescribir costos manuales)
  _cfSave('cod',_cfMD.cod,0);
  _cfSave('costos/fleteEntregados',_cfMD.costos.fleteEntregados,0);
  _cfSave('costos/fleteEnProceso',_cfMD.costos.fleteEnProceso,0);
  _cfSave('costos/fleteDevueltos',_cfMD.costos.fleteDevueltos,0);
  _cfSave('costos/cogsEntregados',cogsAplicar,0);

  // Guardar snapshot del análisis (persiste entre sesiones, solo se sobreescribe al subir nuevo Excel)
  _cfMD.ultimoAnalisis=JSON.parse(JSON.stringify({
    cod:X.cod, costos:X.costos, diasCanal:X.diasCanal,
    fuenteCogs:X.fuenteCogs, byTrans:X.byTrans, byEstAll:X.byEstAll,
    novStats:X.novStats, topProd:X.topProd,
    byCiudad:X.byCiudad, byProdAnal:X.byProdAnal,
    _colsDet:X._colsDet, _colsDetProd:X._colsDetProd,
    totalFilasOrd:X.totalFilasOrd, totalFilasProd:X.totalFilasProd,
    archivos:{
      ord:_cfXlsOrdenes?{nombre:_cfXlsOrdenes.nombre,filas:_cfXlsOrdenes.filas}:null,
      prod:_cfXlsProductos?{nombre:_cfXlsProductos.nombre,filas:_cfXlsProductos.filas}:null
    },
    fechaAplicado:new Date().toISOString()
  }));
  _cfSave('ultimoAnalisis',_cfMD.ultimoAnalisis,0);

  // Confirmación visual
  const resEl=document.getElementById('cf-ord-result');
  const sumario=`<div style="background:var(--success-soft);border-radius:12px;border:2px solid #86efac;padding:16px 18px;margin-bottom:14px;">
    <div style="font-size:.82rem;font-weight:900;color:var(--success);margin-bottom:10px;">✅ Datos aplicados al mes ${_cfMesLabel(_cfMes)}</div>
    <div style="font-size:.7rem;color:var(--text-1);line-height:1.9;">
      📦 Entregados: <b>${X.cod.entregados.num}</b> pedidos · <b>${_cf$(X.cod.entregados.monto)}</b><br>
      🔵 En proceso: <b>${X.cod.enProceso.num}</b> · <b>${_cf$(X.cod.enProceso.monto)}</b><br>
      🔴 Devueltos: <b>${X.cod.devueltos.num}</b> · <b>${_cf$(X.cod.devueltos.monto)}</b><br>
      ⚠️ No gestionados (cancelados/pendientes): <b>${X.cod.cancelados.num}</b><br>
      🚚 Fletes: Ent. <b>${_cf$(co.fleteEntregados)}</b> · Proc. <b>${_cf$(co.fleteEnProceso)}</b> · Dev. <b>${_cf$(co.fleteDevueltos)}</b><br>
      💜 COGS aplicado: <b>${_cf$(cogsAplicar)}</b>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button onclick="_cfTab('dash')" style="background:#16a34a;color:white;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:.73rem;font-weight:700;">📊 Ver Dashboard</button>
      <button onclick="_cfTab('mes')" style="background:#6366f1;color:white;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:.73rem;font-weight:700;">📅 Ver tabla diaria</button>
      <button onclick="_cfTab('er')" style="background:#1A2230;color:white;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:.73rem;font-weight:700;">📈 Ver Estado ER</button>
    </div>
  </div>`;
  if(resEl){
    resEl.insertAdjacentHTML('afterbegin',sumario);
    const nuevoEl=resEl.firstElementChild;
    if(nuevoEl){
      nuevoEl.style.animation='fadeInUp .45s ease';
      nuevoEl.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }

  if(btn){
    btn.innerHTML='✅ Datos aplicados';
    btn.style.background='#16a34a';
    btn.style.cursor='default';
    setTimeout(()=>{
      btn.disabled=false;
      btn.style.opacity='';
      btn.style.cursor='pointer';
      btn.style.background='#6366f1';
      btn.innerHTML=btnHTMLOrig;
    },1800);
  }
}

function _cfAplicarCogs(){} // Mantenida para compatibilidad — ahora usa _cfAplicarTodo

function _cfLimpiarOrd(){
  _cfXlsOrdenes=null;_cfXlsProductos=null;_cfOrdRows=[];_cfExtracted=null;_cfCogsUsar='orden';
  const r=document.getElementById('cf-ord-result');if(r)r.innerHTML='';
  _cfRenderOrdenes();
}
async function _cfResetCodCostos(){
  if(!await _mConfirmP('¿Limpiar COD y Fletes/COGS del Excel?','Solo se borran esos valores. ChateaPro y Otros Costos se conservan.','danger'))return;
  _cfMD.cod={entregados:{num:0,monto:0},enProceso:{num:0,monto:0},devueltos:{num:0,monto:0},cancelados:{num:0}};
  if(!_cfMD.costos)_cfMD.costos={};
  _cfMD.costos.fleteEntregados=0;_cfMD.costos.fleteEnProceso=0;
  _cfMD.costos.fleteDevueltos=0;_cfMD.costos.cogsEntregados=0;
  _cfMD.ultimoAnalisis=null;
  _cfSave('cod',_cfMD.cod,0);
  _cfSave('costos/fleteEntregados',0,0);
  _cfSave('costos/fleteEnProceso',0,0);
  _cfSave('costos/fleteDevueltos',0,0);
  _cfSave('costos/cogsEntregados',0,0);
  _cfSave('ultimoAnalisis',null,0);
  toast('✅ COD y Fletes/COGS limpiados. ChateaPro y Otros Costos intactos.');
  _cfRenderOrdenes();
}
// ── FIN CONTROL FINANCIERO ────────────────────────────────────────────

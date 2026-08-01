// ===== GESTIONES DIARIAS =====
let _gdMes='', _gdData={}, _gdSaveTimer=null, _gdActiveTab='gestion', _gdNotas={}, _gdNotaEditando=null;

function _gdInit(){
  const now=new Date();
  _gdMes=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const nombre=(window.getLoginAsesor?window.getLoginAsesor():'')||window._currentUsername||'—';
  document.getElementById('gd-nombre').textContent=nombre.toUpperCase();
  document.getElementById('gd-panel').style.display='flex';
  document.getElementById('gd-title').textContent='REMISIÓN MENSUAL · ['+nombre.split(' ')[0].toUpperCase()+']';
  _gdCargar();
}

// _gdKey/_gdTK/_gdAK/_leerTienda viven en shared/app-shared.js.
// _gdBase(tk) permite construir la ruta con cualquier clave de tienda: la nueva
// (por empresaId) para escribir, la vieja (por nombre) para el fallback de
// lectura. _gdBasePath() es siempre la de escritura.
function _gdBase(tk){ return 'gestiones_diarias/'+(tk||_gdTK())+'/'+_gdMes+'/'+_gdAK(); }
function _gdBasePath(){ return _gdBase(); }

function _gdCargar(){
  const [y,m]=_gdMes.split('-').map(Number);
  const label=new Date(y,m-1,1).toLocaleDateString('es-CO',{month:'long',year:'numeric'});
  document.getElementById('gd-mes-label').textContent=label.charAt(0).toUpperCase()+label.slice(1);
  document.getElementById('gd-save-st').textContent='';
  if(typeof _db==='undefined'||!window._currentUsername){_gdData={};_gdRenderTabla();_gdRenderResumen();return;}
  _leerTienda(_gdBase).then(snap=>{
    const d=snap.val()||{};
    _gdData=d.dias||{};
    _gdNotas=Object.assign({},d.notasHist||{});
    _gdNotaEditando=null; // cambiar de mes cancela cualquier edición en curso
    // La nota única del esquema anterior (/notas, un string) se muestra como la
    // entrada más antigua para no perderla. Sin ts, queda al final de la lista.
    if(d.notas&&String(d.notas).trim()&&!_gdNotas._legacy){
      _gdNotas._legacy={texto:String(d.notas).trim(),ts:0,autor:'',fechaLabel:'Nota anterior (sin fecha)'};
    }
    _gdRenderTabla();
    _gdRenderResumen();
    _gdRenderNotas();
  });
  _gdCargarCF();
}

// Panel "Cómo va la tienda" — mismo COD del mes del Control Financiero + ventas totales,
// visible para el asesor (que no tiene acceso al panel de Control Financiero).
function _gdCargarCF(){
  const el=document.getElementById('gd-tienda-resumen');
  if(!el)return;
  if(typeof _db==='undefined'){el.innerHTML='';return;}
  _leerTienda(tk=>'control_financiero/'+tk+'/'+_gdMes).then(ms=>{
    const d=ms.val()||{};
    _gdRenderTiendaResumen(d.cod||{},d.dias||{});
  }).catch(()=>{el.innerHTML='';});
}

function _gdRenderTiendaResumen(cod,dias){
  const el=document.getElementById('gd-tienda-resumen');
  if(!el)return;
  const entN=(cod.entregados||{}).num||0;
  const procN=(cod.enProceso||{}).num||0;
  const devN=(cod.devueltos||{}).num||0;
  const despachados=entN+procN+devN;
  const pEnt=despachados>0?(entN/despachados*100).toFixed(2):0;
  const pProc=despachados>0?(procN/despachados*100).toFixed(2):0;
  const pDev=despachados>0?(devN/despachados*100).toFixed(2):0;
  let totalN=0;
  Object.values(dias||{}).forEach(d=>{totalN+=(d.wppNum||0)+(d.shopifyNum||0);});
  const cancN=despachados>0?Math.max(0,totalN-entN-procN-devN):0;
  const pCanc=totalN>0?(cancN/totalN*100).toFixed(2):0;
  const pDesp=totalN>0?(despachados/totalN*100).toFixed(2):0;

  if(totalN===0&&despachados===0){
    el.innerHTML=`<div style="font-size:.58rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">🏪 Cómo va la tienda</div>
      <div style="color:var(--text-3);font-size:.68rem;">Sin datos cargados para este mes todavía.</div>`;
    return;
  }
  const countCard=(icon,lbl,sub,num,pct,color,bg)=>`
    <div style="display:grid;grid-template-columns:1fr auto;align-items:center;background:${bg};border-radius:7px;padding:6px 10px;border-left:3px solid ${color};min-width:150px;">
      <div>
        <div style="font-size:.55rem;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:.3px;">${icon} ${lbl}</div>
        <div style="font-size:.58rem;color:${color};">${sub}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:.55rem;color:var(--text-2);">pedidos</div>
        <div style="font-size:1rem;font-weight:900;color:${color};">${num}</div>
        ${pct!==null?`<div style="font-size:.6rem;font-weight:800;color:${color};background:${bg};border-radius:3px;padding:0 4px;">${pct}%</div>`:''}
      </div>
    </div>`;
  el.innerHTML=`
    <div style="font-size:.58rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">🏪 Cómo va la tienda — ${typeof _cfMesLabel==='function'?_cfMesLabel(_gdMes):_gdMes}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${countCard('💰','Ventas totales','total del mes',totalN,null,'#6366f1','rgba(99,102,241,.1)')}
      ${countCard('✅','Entregados','% sobre despachados',entN,pEnt,'#16a34a','var(--success-soft)')}
      ${countCard('🔵','En proceso','% sobre despachados',procN,pProc,'#0891b2','var(--info-soft)')}
      ${countCard('🔴','Devueltos','% sobre despachados',devN,pDev,'#dc2626','var(--danger-soft)')}
      ${countCard('⚠️','Cancelados','% sobre ventas totales',cancN,pCanc,'#d97706','var(--warning-soft)')}
      ${countCard('📤','Despacho','% sobre ventas totales',despachados,pDesp,'#6366f1','rgba(99,102,241,.1)')}
    </div>`;
}

function _gdDiasEnMes(ym){
  const [y,m]=ym.split('-').map(Number);
  return new Date(y,m,0).getDate();
}

// Las novedades son binarias: solucionada o devuelta. El bucket intermedio
// ("gestionadas") se eliminó — el campo d.gestion puede seguir existiendo en
// registros viejos de Firebase, pero ya no se lee ni se suma en ningún lado.
function _gdCalc(){
  let conf=0,cancel=0,soluc=0,devuelt=0,contNoRecup=0,recupCarri=0,ventasWpp=0;
  Object.values(_gdData).forEach(d=>{
    conf+=d.conf||0; cancel+=d.cancel||0; soluc+=d.soluc||0; devuelt+=d.devuelt||0;
    contNoRecup+=d.contNoRecup||0; recupCarri+=d.recupCarri||0; ventasWpp+=d.ventasWpp||0;
  });
  const totalConf=conf+cancel;
  // El total cuenta todo el trabajo del día, con resultado positivo o no:
  // las devueltas y los no recuperados también son gestiones hechas.
  const gral=totalConf+soluc+devuelt+recupCarri+contNoRecup+ventasWpp;
  return{conf,cancel,totalConf,soluc,devuelt,contNoRecup,recupCarri,ventasWpp,gral};
}

function _gdRenderResumen(){
  const t=_gdCalc();
  const dias=_gdDiasEnMes(_gdMes);
  const avg=dias>0?(t.gral/dias).toFixed(1):'0';
  // Tarjetas estilo REDKING: superficie oscura con acento de color en borde superior
  const card=(titulo,vals,color)=>`
    <div style="background:var(--bg-elevated);border:1px solid var(--border);border-top:2px solid ${color};border-radius:9px;padding:8px 12px;flex-shrink:0;">
      <div style="font-size:.52rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">${titulo}</div>
      <div style="display:flex;gap:8px;align-items:baseline;font-weight:800;font-size:.9rem;font-family:var(--f-mono);">${vals}</div>
    </div>`;
  document.getElementById('gd-resumen').innerHTML=`
    <div style="font-size:.58rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">📊 Resumen del mes (auto-calculado)</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${card('Confirmaciones',`<span style="color:#39E67A">${t.conf}</span><span style="font-size:.65rem;font-weight:400;color:var(--text-3)">+</span><span style="color:#E63946">${t.cancel}</span><span style="font-size:.65rem;font-weight:400;color:var(--text-3)">=</span><span style="color:#39E67A;font-size:1rem">${t.totalConf}</span>`,'#39E67A')}
      ${card('Novedades',`<span style="color:#3971E6" title="Solucionadas">${t.soluc}</span><span style="font-size:.55rem;color:var(--text-3);margin:0 2px">sol</span><span style="color:#E63946" title="Devoluciones">${t.devuelt}</span><span style="font-size:.55rem;color:var(--text-3);margin-left:2px">dev</span>`,'#3971E6')}
      ${card('Carritos',`<span style="color:#9B59E6">${t.recupCarri}</span><span style="font-size:.65rem;font-weight:400;color:var(--text-3)">|</span><span style="color:var(--text-2)">${t.contNoRecup}</span>`,'#9B59E6')}
      ${card('Ventas WPP',`<span style="color:#E6823A;font-size:1rem">${t.ventasWpp}</span>`,'#E6823A')}
      ${card('General',`<span style="color:#E6B539;font-size:1rem">${t.gral}</span><span style="font-size:.68rem;color:#E6B539;font-weight:600">${avg}/día</span>`,'#E6B539')}
    </div>`;
}

function _gdRenderTabla(){
  const total=_gdDiasEnMes(_gdMes);
  // Colores de grupo (acentos REDKING): verde conf · azul novedades · púrpura carritos · naranja wpp · amarillo total
  const C={conf:'#39E67A',nov:'#3971E6',carr:'#9B59E6',wpp:'#E6823A',tot:'#E6B539',obs:'#8B9DB5',cancel:'#E63946'};
  const gh=(label,color,colspan,extra)=>
    `<th colspan="${colspan||1}" class="gdx-g" style="border-bottom:2px solid ${color};color:${color};${extra||''}">${label}</th>`;
  const sh=(label,extra)=>`<th class="gdx-s" style="${extra||''}">${label}</th>`;

  const hoyD=new Date();
  const mesActual=hoyD.getFullYear()+'-'+String(hoyD.getMonth()+1).padStart(2,'0');
  const diaHoy=_gdMes===mesActual?hoyD.getDate():-1;

  let html=`<div class="gdx-wrap"><table id="gd-table">
  <thead>
    <tr>
      <th rowspan="2" class="gdx-g gdx-day-h" style="border-bottom:2px solid var(--border-strong);">DÍA</th>
      ${gh('CONFIRMACIONES',C.conf,3)}
      ${gh('NOVEDADES',C.nov,2)}
      ${gh('CARRITOS',C.carr,2)}
      <th rowspan="2" class="gdx-g" style="border-bottom:2px solid ${C.wpp};color:${C.wpp};">VENTAS<br>WPP</th>
      <th rowspan="2" class="gdx-g" style="border-bottom:2px solid ${C.tot};color:${C.tot};">TOTAL</th>
      <th rowspan="2" class="gdx-g" style="border-bottom:2px solid var(--border-strong);color:var(--text-2);text-align:left;min-width:160px;">OBSERVACIONES ASESOR</th>
    </tr>
    <tr>
      ${sh('CONF.')}${sh('CANCEL.')}${sh('TOTAL')}
      ${sh('SOLUC. 🔒')}${sh('DEVUELTO 🔒')}
      ${sh('RECUP.')}${sh('NO REC.')}
    </tr>
  </thead>
  <tbody>`;

  for(let d=1;d<=total;d++){
    const r=_gdData[d]||{};
    const tc=(r.conf||0)+(r.cancel||0);
    const tg=tc+(r.soluc||0)+(r.devuelt||0)+(r.recupCarri||0)+(r.contNoRecup||0)+(r.ventasWpp||0);
    const vacio=!r.conf&&!r.cancel&&!r.soluc&&!r.devuelt&&!r.contNoRecup&&!r.recupCarri&&!r.ventasWpp&&!r.obs;
    const esHoy=d===diaHoy;
    const n=(key,val,color)=>`<input type="number" min="0" value="${val||''}" placeholder="·" oninput="_gdCambio(${d},'${key}',this.value)" style="color:${color};">`;
    html+=`<tr data-gd="${d}" class="gdx-row${vacio?' gdx-vacio':''}${esHoy?' gdx-hoy':''}">
      <td class="gdx-day">${esHoy?'<span class="gdx-hoy-dot"></span>':''}${d}</td>
      <td>${n('conf',r.conf,C.conf)}</td>
      <td>${n('cancel',r.cancel,C.cancel)}</td>
      <td class="gdx-auto" style="color:${C.conf};" id="gd-tc-${d}">${tc||''}</td>
      <td class="gdx-auto" style="color:${C.nov};" title="Auto-calculado desde Novedades" id="gd-soluc-${d}">${r.soluc||''}</td>
      <td class="gdx-auto" style="color:${C.cancel};" title="Auto-calculado desde Novedades" id="gd-devuelt-${d}">${r.devuelt||''}</td>
      <td>${n('recupCarri',r.recupCarri,C.carr)}</td>
      <td>${n('contNoRecup',r.contNoRecup,'#8B9DB5')}</td>
      <td>${n('ventasWpp',r.ventasWpp,C.wpp)}</td>
      <td class="gdx-auto gdx-total-dia" style="color:${C.tot};" id="gd-tg-${d}">${tg||''}</td>
      <td class="gdx-obs"><input type="text" value="${(r.obs||'').replace(/"/g,'&quot;')}" placeholder="—" oninput="_gdCambio(${d},'obs',this.value)"></td>
    </tr>`;
  }

  const t=_gdCalc();
  html+=`<tr class="gdx-totales">
    <td class="gdx-day" style="font-size:.6rem;letter-spacing:.5px;">TOTAL</td>
    <td style="color:${C.conf};" id="gdt-conf">${t.conf}</td>
    <td style="color:${C.cancel};" id="gdt-cancel">${t.cancel}</td>
    <td style="color:${C.conf};" id="gdt-tc">${t.totalConf}</td>
    <td style="color:${C.nov};" id="gdt-soluc">${t.soluc}</td>
    <td style="color:${C.cancel};" id="gdt-devuelt">${t.devuelt}</td>
    <td style="color:${C.carr};" id="gdt-recupCarri">${t.recupCarri}</td>
    <td style="color:#8B9DB5;" id="gdt-contNoRecup">${t.contNoRecup}</td>
    <td style="color:${C.wpp};" id="gdt-ventasWpp">${t.ventasWpp}</td>
    <td style="color:${C.tot};font-size:.8rem;" id="gdt-gral">${t.gral}</td>
    <td></td>
  </tr></tbody></table></div>`;
  document.getElementById('gd-table-wrap').innerHTML=html;
}

function _gdCambio(dia,campo,valor){
  if(!_gdData[dia])_gdData[dia]={};
  _gdData[dia][campo]=campo==='obs'?valor:(parseInt(valor)||0);
  // Actualizar celdas auto de esa fila
  const r=_gdData[dia];
  const tc=(r.conf||0)+(r.cancel||0);
  const tg=tc+(r.soluc||0)+(r.devuelt||0)+(r.recupCarri||0)+(r.contNoRecup||0)+(r.ventasWpp||0);
  const tcEl=document.getElementById('gd-tc-'+dia);
  const tgEl=document.getElementById('gd-tg-'+dia);
  if(tcEl)tcEl.textContent=tc||'';
  if(tgEl)tgEl.textContent=tg||'';
  // Actualizar totales columna
  const t=_gdCalc();
  ['conf','cancel','soluc','devuelt','recupCarri','contNoRecup','ventasWpp'].forEach(k=>{
    const el=document.getElementById('gdt-'+k); if(el)el.textContent=t[k];
  });
  const tc2=document.getElementById('gdt-tc'); if(tc2)tc2.textContent=t.totalConf;
  const tg2=document.getElementById('gdt-gral'); if(tg2)tg2.textContent=t.gral;
  _gdResumenDebounce();
  // Guardar
  if(_gdSaveTimer)clearTimeout(_gdSaveTimer);
  _gdSaveTimer=setTimeout(()=>{
    _gdGuardar();
  },900);
}

let _gdResumenTimer=null;
function _gdResumenDebounce(){
  if(_gdResumenTimer)clearTimeout(_gdResumenTimer);
  _gdResumenTimer=setTimeout(_gdRenderResumen,300);
}

function _gdGuardar(){
  if(typeof _db==='undefined'||!window._currentUsername)return;
  if(!_tiendaLista('gestiones diarias')){document.getElementById('gd-save-st').textContent='';return;}
  document.getElementById('gd-save-st').textContent='Guardando...';
  const nombre=window.getLoginAsesor?window.getLoginAsesor():'';
  _db.ref(_gdBasePath()).update({dias:_gdData,_nombre:nombre}).then(()=>{
    document.getElementById('gd-save-st').textContent='✓ Guardado';
    setTimeout(()=>{ const el=document.getElementById('gd-save-st'); if(el)el.textContent=''; },2000);
  });
}

// ── NOTAS DEL COORDINADOR ───────────────────────────────────────────────
// Historial: cada nota queda con su fecha y quién la escribió, y no se pisa.
// Escribe solo el dueño de la tienda; el asesor ve el registro en modo lectura.
// Antes era un único textarea guardado en /notas (un string que se
// sobrescribía). Ese valor se sigue leyendo y se muestra como la entrada más
// antigua, para no perder lo que ya estaba escrito.
function _gdEsDueno(){
  return (window._currentRol||localStorage.getItem('lgs_rol')||'dueno')!=='asesor';
}

function _gdRenderNotas(){
  const form=document.getElementById('gd-notas-form');
  if(form) form.style.display=_gdEsDueno()?'block':'none';
  const cont=document.getElementById('gd-notas-lista');
  if(!cont)return;
  const items=Object.entries(_gdNotas||{})
    .map(([k,n])=>Object.assign({_key:k},n))
    .sort((a,b)=>(b.ts||0)-(a.ts||0)); // más reciente arriba
  if(!items.length){
    cont.innerHTML='<div style="font-size:.72rem;color:var(--text-3);padding:10px 0;">'
      +(_gdEsDueno()?'Todavía no hay notas este mes.':'El coordinador no ha dejado notas este mes.')+'</div>';
    return;
  }
  const dueno=_gdEsDueno();
  cont.innerHTML=items.map(n=>{
    const fecha=n.ts
      ? new Date(n.ts).toLocaleString('es-CO',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : (n.fechaLabel||'—');
    const autor=n.autor?' · '+esc(n.autor):'';
    // Marcar las editadas: el historial deja de ser fiel si una nota cambia
    // sin avisar, así que la fecha original se conserva y se anota la edición.
    const editada=n.editadoTs
      ? ' · <span style="font-style:italic;">editada el '+esc(new Date(n.editadoTs).toLocaleString('es-CO',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}))+'</span>'
      : '';
    const cab='<div style="font-size:.6rem;color:var(--text-3);font-weight:700;margin-bottom:3px;">'+esc(fecha)+autor+editada+'</div>';

    if(_gdNotaEditando===n._key){
      return '<div style="background:var(--bg-card);border:1px solid #3971E6;border-left:3px solid #3971E6;border-radius:8px;padding:9px 12px;margin-bottom:7px;">'
        +cab
        +'<textarea id="gd-nota-edit" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;font-size:.78rem;resize:vertical;min-height:56px;font-family:inherit;color:var(--text-1);outline:none;box-sizing:border-box;">'+esc(n.texto||'')+'</textarea>'
        +'<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px;">'
          +'<button onclick="_gdCancelarEdicion()" style="background:transparent;color:var(--text-2);border:1.5px solid var(--border);border-radius:7px;padding:5px 12px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit;">Cancelar</button>'
          +'<button onclick="_gdGuardarEdicion(\''+n._key+'\')" style="background:#131920;color:white;border:none;border-radius:7px;padding:5px 14px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit;">Guardar</button>'
        +'</div></div>';
    }

    const acciones=dueno
      ? '<div style="display:flex;gap:10px;margin-top:6px;">'
        +'<button onclick="_gdEditarNota(\''+n._key+'\')" style="background:none;border:none;padding:0;color:var(--text-3);font-size:.63rem;font-weight:700;cursor:pointer;font-family:inherit;">✏️ Editar</button>'
        +'<button onclick="_gdBorrarNota(\''+n._key+'\')" style="background:none;border:none;padding:0;color:var(--text-3);font-size:.63rem;font-weight:700;cursor:pointer;font-family:inherit;">🗑️ Borrar</button>'
        +'</div>'
      : '';
    return '<div style="background:var(--bg-card);border:1px solid var(--border);border-left:3px solid #3971E6;border-radius:8px;padding:9px 12px;margin-bottom:7px;">'
      +cab
      +'<div style="font-size:.78rem;color:var(--text-1);white-space:pre-wrap;">'+esc(n.texto||'')+'</div>'
      +acciones
      +'</div>';
  }).join('');
}

function _gdEditarNota(key){
  if(!_gdEsDueno())return;
  _gdNotaEditando=key;
  _gdRenderNotas();
  const ta=document.getElementById('gd-nota-edit');
  if(ta){ ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); }
}
function _gdCancelarEdicion(){ _gdNotaEditando=null; _gdRenderNotas(); }

function _gdGuardarEdicion(key){
  if(!_gdEsDueno())return;
  const ta=document.getElementById('gd-nota-edit');
  const texto=(ta?ta.value:'').trim();
  if(!texto){toast('⚠️ La nota no puede quedar vacía');return;}
  const prev=_gdNotas[key]||{};
  const editadoTs=Date.now();
  // La nota del esquema viejo vive en /notas (un string suelto): al editarla se
  // pasa a /notasHist como una nota normal y se limpia el campo antiguo.
  if(key==='_legacy'){
    const nota={texto, ts:prev.ts||editadoTs, autor:prev.autor||'', editadoTs};
    _db.ref(_gdBasePath()+'/notasHist').push(nota).then(ref=>{
      delete _gdNotas._legacy;
      _gdNotas[ref.key]=nota;
      return _db.ref(_gdBasePath()+'/notas').remove();
    }).then(()=>{ _gdNotaEditando=null; _gdRenderNotas(); toast('✏️ Nota actualizada'); })
      .catch(e=>toast('⚠️ No se pudo guardar: '+(e&&e.message||e)));
    return;
  }
  _db.ref(_gdBasePath()+'/notasHist/'+key).update({texto, editadoTs}).then(()=>{
    _gdNotas[key]=Object.assign({},prev,{texto, editadoTs});
    _gdNotaEditando=null;
    _gdRenderNotas();
    toast('✏️ Nota actualizada');
  }).catch(e=>toast('⚠️ No se pudo guardar: '+(e&&e.message||e)));
}

function _gdBorrarNota(key){
  if(!_gdEsDueno())return;
  const n=_gdNotas[key]||{};
  const resumen=(n.texto||'').slice(0,60)+((n.texto||'').length>60?'…':'');
  _mConfirm('¿Borrar esta nota?','Se eliminará del historial y no se puede deshacer:\n\n"'+resumen+'"',()=>{
    const ref=key==='_legacy'
      ? _db.ref(_gdBasePath()+'/notas')
      : _db.ref(_gdBasePath()+'/notasHist/'+key);
    ref.remove().then(()=>{
      delete _gdNotas[key];
      if(_gdNotaEditando===key) _gdNotaEditando=null;
      _gdRenderNotas();
      toast('🗑️ Nota eliminada');
    }).catch(e=>toast('⚠️ No se pudo borrar: '+(e&&e.message||e)));
  });
}

function _gdAgregarNota(){
  if(!_gdEsDueno()){toast('Solo el dueño de la tienda puede escribir notas');return;}
  if(typeof _db==='undefined'||!window._currentUsername)return;
  const ta=document.getElementById('gd-notas-coord');
  const texto=(ta.value||'').trim();
  if(!texto){toast('⚠️ Escribe la nota antes de agregarla');return;}
  const btn=document.getElementById('gd-notas-btn');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  const nota={texto, ts:Date.now(), autor:(window.getLoginAsesor?window.getLoginAsesor():'')||''};
  _db.ref(_gdBasePath()+'/notasHist').push(nota).then(ref=>{
    _gdNotas[ref.key]=nota;
    ta.value='';
    _gdRenderNotas();
    toast('📝 Nota agregada');
  }).catch(e=>toast('⚠️ No se pudo guardar la nota: '+(e&&e.message||e)))
    .then(()=>{ if(btn){btn.disabled=false;btn.textContent='Agregar nota';} });
}

function _gdPrevMes(){
  const [y,m]=_gdMes.split('-').map(Number);
  const dt=new Date(y,m-2,1);
  _gdMes=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  _gdData={};_gdCargar();
  _gdRefreshActiveTab();
}
function _gdNextMes(){
  const [y,m]=_gdMes.split('-').map(Number);
  const dt=new Date(y,m,1);
  _gdMes=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  _gdData={};_gdCargar();
  _gdRefreshActiveTab();
}
function _gdRefreshActiveTab(){
  if(_gdActiveTab==='consolidado') _consoInit();
  if(_gdActiveTab==='novedades') _novInit();
  if(_gdActiveTab==='anticipos') _antInit();
  if(_gdActiveTab==='ro') _roInit();
}
function _gdVolver(){
  document.getElementById('gd-panel').style.display='none';
  const a=window.getLoginAsesor?window.getLoginAsesor():'';
  window._gdMostrarModeSelect(a);
}

// ── TABS GD ────────────────────────────────────────────────────────────
function _gdTab(tab){
  _gdActiveTab=tab;
  ['gestion','consolidado','novedades','anticipos','ro'].forEach(t=>{
    const c=document.getElementById('gd-tab-'+t);
    const b=document.getElementById('gd-tab-btn-'+t);
    if(c) c.style.display=t===tab?(t==='gestion'?'flex':'block'):'none';
    if(b) b.classList.toggle('active',t===tab);
  });
  if(tab==='consolidado') _consoInit();
  if(tab==='novedades') _novInit();
  if(tab==='anticipos') _antInit();
  if(tab==='ro') _roInit();
}

// ── CONSOLIDADO ─────────────────────────────────────────────────────────
let _consoData={}, _consoDia=1, _consoSaveTimer=null;

const _CS={
  confDropi:{
    label:'CONF. DROPI',color:'#991b1b',
    fields:[['pendConfirmacion','PEND. CONFIRMACIÓN']],
    total:d=>d.pendConfirmacion||0
  },
  confChateapro:{
    label:'CONF. CHATEAPRO',color:'#1f2937',
    fields:[['noConfirmados','NO CONFIRMADOS'],['confirmados','CONFIRMADOS'],['sincronizadoDropi','SINCRONIZADO DROPI'],['errorSincronizar','ERROR SINCRONIZAR'],['asesorTodos','ASESOR (TODOS)'],['pendAnticipo','PEND. ANTICIPO']],
    total:d=>(d.noConfirmados||0)+(d.confirmados||0)+(d.sincronizadoDropi||0)+(d.errorSincronizar||0)+(d.asesorTodos||0)+(d.pendAnticipo||0)
  },
  novedades:{
    label:'NOVEDADES',color:'#1f2937',
    fields:[['novedadesPend','NOVEDADES PEND.'],['pendCriticas','PEND. CRÍTICAS']],
    total:d=>(d.novedadesPend||0)+(d.pendCriticas||0)
  },
  novedades5pm:{
    label:'NOVEDADES',color:'#1f2937',
    fields:[['novedadesPend','NOVEDADES PEND.'],['solucionadas','SOLUCIONADAS'],['pendCriticas','PEND. CRÍTICAS']],
    total:d=>(d.novedadesPend||0)+(d.solucionadas||0)+(d.pendCriticas||0)
  },
  ventasWpp:{
    label:'VENTAS WPP',color:'#166534',
    fields:[['clientePotencial','CLIENTE POTENCIAL'],['datosCompletados','DATOS COMPLETADOS'],['subidosDropi','SUBIDOS DROPI'],['subidosManual','SUBIDOS MANUAL']],
    total:d=>(d.clientePotencial||0)+(d.datosCompletados||0)+(d.subidosDropi||0)+(d.subidosManual||0)
  },
  carritos:{
    label:'CARRITOS',color:'#374151',
    fields:[['contactoInicial','CONTACTO INICIAL'],['recordatorio1','RECORDATORIO 1'],['interaccionIA','INTERACCIÓN IA'],['datosEnRecolec','DATOS EN RECOLEC.'],['recupSinSubir','RECUP. SIN SUBIR'],['subidoManualDropi','SUBIDO MANUAL A DROPI'],['cancelados','CANCELADOS']],
    total:d=>(d.contactoInicial||0)+(d.recordatorio1||0)+(d.interaccionIA||0)+(d.datosEnRecolec||0)+(d.recupSinSubir||0)+(d.subidoManualDropi||0)+(d.cancelados||0)
  },
  cierre:{
    label:'CIERRE',color:'#374151',
    // CIERRE es solo cantidades, nunca importes.
    // 'carritosRecup' y 'ventasWpp' llevan {desde:...}: no se escriben acá, se
    // leen de las columnas RECUP. y VENTAS WPP de ese día en la tabla de
    // Gestión. Antes el mismo dato se cargaba dos veces y podía discrepar.
    fields:[['guiasGeneradas','GUÍAS GENERADAS'],['guiasDespachadas','GUÍAS DESPACHADAS'],['guiasPasadasPendiente','GUÍAS PASADAS A PENDIENTE'],['carritosRecup','CARRITOS RECUP.',{desde:'recupCarri'}],['ventasWpp','VENTAS WPP',{desde:'ventasWpp'}]],
    noTotal:true
  }
};

const _CORTES=[
  {id:'8am', label:'8 AM',  secs:['confDropi','confChateapro','novedades','ventasWpp','carritos']},
  {id:'12pm',label:'12 PM', secs:['confDropi','confChateapro','novedades']},
  {id:'5pm', label:'5 PM',  secs:['confDropi','confChateapro','novedades5pm','ventasWpp','carritos','cierre']}
];

function _consoInit(){
  const diasTotal=_gdDiasEnMes(_gdMes);
  const hoy=new Date().getDate();
  const tienda=(window.getLoginTienda?window.getLoginTienda():'') || 'REDKING';
  document.getElementById('conso-tienda-lbl').textContent=tienda.toUpperCase();
  // Selector de días
  let sel='';
  for(let d=1;d<=diasTotal;d++){
    sel+=`<button class="conso-dia-btn${d===(_consoDia||hoy)?' active':''}" id="conso-db-${d}" onclick="_consoSetDia(${d})">${d}</button>`;
  }
  document.getElementById('conso-day-sel').innerHTML=sel;
  _consoDia=Math.min(_consoDia||hoy,diasTotal);
  _consoCargar();
}

function _consoSetDia(dia){
  const prev=document.getElementById('conso-db-'+_consoDia);
  if(prev) prev.classList.remove('active');
  _consoDia=dia;
  const next=document.getElementById('conso-db-'+dia);
  if(next) next.classList.add('active');
  _consoCargar();
}

function _consoCargar(){
  if(typeof _db==='undefined'||!window._currentUsername){_consoData={};_consoRender();return;}
  _leerTienda(tk=>_gdBase(tk)+'/consolidado/'+_consoDia).then(snap=>{
    _consoData=snap.val()||{};
    _consoRender();
  });
}

// "Viernes, 31 de Julio" para el día del mes que se está viendo. Cae a "DÍA n"
// si _gdMes todavía no está cargado.
function _consoFechaLabel(dia){
  const [y,m]=String(_gdMes||'').split('-').map(Number);
  if(!y||!m) return 'DÍA '+dia;
  const txt=new Date(y,m-1,dia).toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
  // es-CO devuelve todo en minúscula ("viernes, 31 de julio"): se capitaliza
  // la primera palabra y el mes, que es lo que va después de " de ".
  return txt.replace(/(^|\sde\s)([a-záéíóúñ])/g,(_,pre,letra)=>pre+letra.toUpperCase());
}

function _consoRender(){
  const nombre=(window.getLoginAsesor?window.getLoginAsesor():'').toUpperCase()||'—';
  let html=`<div style="background:#131920;color:white;padding:10px 16px;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
    <div style="font-size:.82rem;font-weight:800;">${_consoFechaLabel(_consoDia)}</div>
    <div style="font-size:.62rem;opacity:.6;">CAPTURADO POR: <strong style="opacity:1;">${nombre}</strong></div>
  </div>`;
  const tienda=((window.getLoginTienda?window.getLoginTienda():'')||'REDKING').toUpperCase();
  _CORTES.forEach(corte=>{
    const cd=_consoData[corte.id]||{};
    // Cada corte va en su propio contenedor para poder capturarlo suelto.
    // La cabecera de captura está oculta en pantalla (la fecha ya se ve arriba)
    // y solo aparece en la imagen, para que quien la reciba por WhatsApp sepa
    // de qué tienda, día, corte y asesor es.
    html+=`<div class="conso-corte" id="conso-corte-${corte.id}">
      <div class="conso-cap-hdr" id="conso-cap-hdr-${corte.id}" style="display:none;background:#131920;color:white;padding:9px 14px;border-radius:9px 9px 0 0;">
        <div style="font-size:.78rem;font-weight:800;">${esc(tienda)} — ${corte.label}</div>
        <div style="font-size:.62rem;opacity:.7;margin-top:2px;">${esc(_consoFechaLabel(_consoDia))} · ${esc(nombre)}</div>
      </div>
      <div class="conso-corte-hdr" id="conso-hdr-${corte.id}">
        <span>${corte.label}</span>
        <button class="conso-cap-btn" id="conso-cap-btn-${corte.id}" onclick="_consoCapturar('${corte.id}')"
          style="background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);color:inherit;border-radius:7px;padding:4px 10px;font-size:.62rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">📸 Capturar registro</button>
      </div>
      <div class="conso-secs">`;
    corte.secs.forEach(secId=>{
      const def=_CS[secId];
      const sd=cd[secId]||{};
      const tot=def.total?def.total(sd):null;
      html+=`<div class="conso-sec"><div class="conso-sec-hdr" style="background:${def.color};">${def.label}</div>`;
      def.fields.forEach(([key,lbl,opt])=>{
        if(opt&&opt.desde){
          // Campo derivado de la tabla de Gestión: se muestra bloqueado, con el
          // valor del día que se esté viendo en el consolidado.
          const val=(_gdData[_consoDia]||{})[opt.desde]||0;
          html+=`<div class="conso-row"><span class="conso-lbl">${lbl} 🔒</span>
            <span class="conso-inp conso-inp-ro" id="ci-${corte.id}-${secId}-${key}"
              title="Se toma de la tabla de Gestión, del día que estás viendo">${val}</span></div>`;
          return;
        }
        html+=`<div class="conso-row"><span class="conso-lbl">${lbl}</span>
          <input type="number" min="0" value="${sd[key]||''}" placeholder="0" class="conso-inp"
            id="ci-${corte.id}-${secId}-${key}"
            onchange="_consoCambio('${corte.id}','${secId}','${key}',this.value)"></div>`;
      });
      if(!def.noTotal){
        html+=`<div class="conso-total-row"><span class="conso-total-lbl">TOTAL</span><span class="conso-total-val" id="ct-${corte.id}-${secId}">${tot||0}</span></div>`;
      }
      html+=`</div>`;
    });
    html+=`</div></div>`; // cierra .conso-secs y .conso-corte
  });
  document.getElementById('conso-form').innerHTML=html;
}

// Captura un corte (8 AM / 12 PM / 5 PM) como imagen y la deja en el
// portapapeles, lista para pegar en WhatsApp. Si el navegador no permite
// escribir imágenes en el portapapeles, la descarga como PNG.
async function _consoCapturar(corteId){
  const cont=document.getElementById('conso-corte-'+corteId);
  if(!cont)return;
  const btn=document.getElementById('conso-cap-btn-'+corteId);
  const cab=document.getElementById('conso-cap-hdr-'+corteId);
  const hdr=document.getElementById('conso-hdr-'+corteId);
  const txtBtn=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Capturando...';}
  try{
    await _cargarLib(_LIB_H2C);
    // En la imagen, la cabecera con tienda/fecha/asesor reemplaza al header de
    // pantalla (que lleva el botón): así no quedan dos franjas oscuras seguidas.
    if(hdr) hdr.style.display='none';
    if(cab) cab.style.display='block';
    // Fondo sólido: sin esto el PNG sale transparente y en WhatsApp se ve negro.
    const fondo=getComputedStyle(document.body).backgroundColor||'#ffffff';
    const canvas=await html2canvas(cont,{backgroundColor:fondo,scale:2,logging:false,useCORS:true});
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
    if(!blob) throw new Error('no se pudo generar la imagen');
    const nombreArch='Consolidado_'+corteId+'_'+_gdMes+'-'+String(_consoDia).padStart(2,'0')+'.png';
    try{
      if(!navigator.clipboard||!window.ClipboardItem) throw new Error('sin portapapeles');
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      toast('📋 Registro copiado — pégalo en WhatsApp');
    }catch(errClip){
      // Firefox y los navegadores sin permiso de portapapeles caen acá
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=nombreArch; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),4000);
      toast('📥 Tu navegador no deja copiar imágenes: se descargó '+nombreArch,4500);
    }
  }catch(e){
    console.error('[CONSO] captura falló',e);
    toast('⚠️ No se pudo capturar: '+(e&&e.message||e),4000);
  }finally{
    if(cab) cab.style.display='none';
    if(hdr) hdr.style.display='';
    if(btn){btn.disabled=false;btn.textContent=txtBtn;}
  }
}

function _consoCambio(corteId,secId,campo,valor){
  if(!_consoData[corteId])_consoData[corteId]={};
  if(!_consoData[corteId][secId])_consoData[corteId][secId]={};
  _consoData[corteId][secId][campo]=parseInt(valor)||0;
  const def=_CS[secId];
  if(def&&def.total){
    const el=document.getElementById('ct-'+corteId+'-'+secId);
    if(el)el.textContent=def.total(_consoData[corteId][secId])||0;
  }
  if(_consoSaveTimer)clearTimeout(_consoSaveTimer);
  _consoSaveTimer=setTimeout(_consoGuardar,900);
}

function _consoGuardar(){
  if(typeof _db==='undefined'||!window._currentUsername)return;
  document.getElementById('gd-save-st').textContent='Guardando...';
  _db.ref(_gdBasePath()+'/consolidado/'+_consoDia).set(_consoData).then(()=>{
    document.getElementById('gd-save-st').textContent='✓ Guardado';
    setTimeout(()=>{const el=document.getElementById('gd-save-st');if(el)el.textContent='';},2000);
  });
}

// ── NOVEDADES ───────────────────────────────────────────────────────────
let _novData={}, _novModalState={mode:'new',id:null,solNum:1}, _novTipoActivo='img', _novEstadoActivo='solucionada';

function _novBase(tk){ return 'novedades/'+(tk||_gdTK())+'/'+_gdMes; }
function _novBasePath(){ return _novBase(); }

function _novInit(){
  document.getElementById('nov-table-wrap').innerHTML='<div style="padding:20px;color:var(--text-3);font-size:.78rem;text-align:center;">Cargando...</div>';
  if(typeof _db==='undefined'){ _novData={}; _novRender(); return; }
  _leerTienda(_novBase, r=>r.orderByChild('ts')).then(snap=>{
    _novData={};
    snap.forEach(ch=>{ _novData[ch.key]=ch.val(); });
    _novRender();
    // _novSyncGD removido: ya sincroniza al mutar. Sincronizar N días en cada
    // apertura del tab generaba N lecturas+escrituras Firebase innecesarias.
  });
}

function _novRender(){
  const el=document.getElementById('nov-table-wrap');
  const _nq=(_novFilter.q||'').toLowerCase();
  const allNov=Object.entries(_novData).sort((a,b)=>b[1].ts-a[1].ts);
  const entries=allNov.filter(([,n])=>{
    if(_nq&&![(n.guia||''),(n.asesor||'')].some(v=>v.toLowerCase().includes(_nq)))return false;
    if(_novFilter.sol==='sin'){if(_novGetSols(n).length)return false;}
    else if(_novFilter.sol==='solucionada'){if(!_novGetSols(n).some(s=>s.estado==='solucionada'))return false;}
    else if(_novFilter.sol==='devuelta'){if(!_novGetSols(n).some(s=>s.estado==='devuelta'))return false;}
    return true;
  });
  const cntNov=document.getElementById('nov-count');
  if(cntNov){const tot=allNov.length;cntNov.textContent=entries.length<tot?`${entries.length} de ${tot}`:`${tot} novedades`;}
  if(!entries.length){
    el.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.78rem;">${allNov.length?'Sin resultados con este filtro.':'No hay novedades registradas este mes.'}</div>`;
    return;
  }
  let rows='';
  entries.forEach(([id,n])=>{
    const sols=_novGetSols(n);
    const lastSol=sols.length?sols[sols.length-1]:null; // último por ts (más reciente)
    const lastFecha=lastSol?.fechaLabel?`<div style="font-size:.55rem;color:var(--text-3);margin-top:2px;">${lastSol.fechaLabel}</div>`:'';
    const estadoBadge=n.solucionadaDropi
      ?`<span style="background:var(--success-soft);color:var(--success);border-radius:20px;padding:2px 8px;font-size:.6rem;font-weight:700;">✅ Solucionada</span>${lastFecha}`
      :!lastSol
        ?'<span style="background:var(--bg-inset);color:var(--text-3);border-radius:20px;padding:2px 8px;font-size:.6rem;font-weight:700;">Sin gestión</span>'
        :lastSol.estado==='devuelta'
          ?`<span style="background:var(--warning-soft);color:var(--warning);border-radius:20px;padding:2px 8px;font-size:.6rem;font-weight:700;">🔄 Devuelta</span>${lastFecha}`
          :lastSol.estado==='solucionada'
            ?`<span style="background:var(--success-soft);color:var(--success);border-radius:20px;padding:2px 8px;font-size:.6rem;font-weight:700;">✅ Solucionada</span>${lastFecha}`
            // Registros anteriores al retiro del estado "gestionada": no están
            // resueltos ni devueltos, así que se muestran como pendientes.
            :`<span style="background:var(--info-soft);color:var(--info);border-radius:20px;padding:2px 8px;font-size:.6rem;font-weight:700;">📋 Pendiente</span>${lastFecha}`;
    rows+=`<tr>
      <td style="white-space:nowrap;color:var(--text-2);font-size:.7rem;vertical-align:top;padding-top:10px;">${n.fecha||'—'}</td>
      <td style="font-weight:800;font-size:.82rem;white-space:nowrap;vertical-align:top;padding-top:10px;">
        ${n.guia||'—'}
        ${n.tipoNovedad?'<div style="font-size:.6rem;color:var(--warning);font-weight:600;margin-top:2px;">'+n.tipoNovedad+'</div>':''}
      </td>
      <td style="vertical-align:top;">${_novSolsCell(id,n,sols)}</td>
      <td style="text-align:center;vertical-align:top;padding-top:10px;">
        <span style="background:var(--info-soft);color:var(--info);padding:3px 10px;border-radius:20px;font-size:.65rem;font-weight:700;white-space:nowrap;">${n.asesor||'—'}</span>
        <div style="margin-top:5px;">${estadoBadge}</div>
      </td>
      <td style="text-align:center;white-space:nowrap;vertical-align:top;padding-top:8px;">
        <button onclick="_novEditar('${id}')" title="Editar" style="background:var(--bg-inset);border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:.8rem;margin-right:4px;">✏️</button>
        <button onclick="_novEliminar('${id}')" title="Eliminar" style="background:var(--danger-soft);border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:.8rem;">🗑️</button>
      </td>
    </tr>`;
  });
  el.innerHTML=`<div style="overflow-x:auto;"><table id="nov-table">
    <colgroup><col style="width:90px"><col style="width:120px"><col><col style="width:110px"><col style="width:70px"></colgroup>
    <thead>
      <tr>
        <th>FECHA</th>
        <th>GUÍA</th>
        <th class="redth">EVIDENCIAS DE SOLUCIÓN</th>
        <th>ASESOR</th>
        <th style="background:#1A2230;"></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function _novSolsCell(id,n,sols){
  let html='<div style="display:flex;flex-direction:column;gap:6px;padding:6px 0;">';
  sols.forEach((s,i)=>{
    const color=s.estado==='solucionada'?'#16a34a':s.estado==='devuelta'?'#d97706':'#0891b2';
    const bg=s.estado==='solucionada'?'#dcfce7':s.estado==='devuelta'?'#fef3c7':'#e0f2fe';
    // El tercer caso solo aparece en soluciones guardadas antes de retirar el
    // estado "en gestión"; ya no se puede elegir al registrar.
    const label=s.estado==='solucionada'?'✅ Solucionada':s.estado==='devuelta'?'🔄 Devuelta':'📋 Pendiente';
    const delBtn=s._key
      ?`<button onclick="_novDelSol('${id}','${s._key}')" style="background:var(--danger-soft);color:var(--danger);border:none;border-radius:5px;padding:2px 6px;font-size:.6rem;cursor:pointer;font-family:inherit;" title="Eliminar">🗑️</button>`
      :s._legacyNum
      ?`<button onclick="_novClearSol('${id}',${s._legacyNum})" style="background:var(--danger-soft);color:var(--danger);border:none;border-radius:5px;padding:2px 6px;font-size:.6rem;cursor:pointer;font-family:inherit;" title="Eliminar">🗑️</button>`
      :'';
    html+=`<div style="border:1.5px solid ${color}30;border-radius:8px;overflow:hidden;">`;
    html+=`<div style="background:${bg};padding:4px 8px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:.58rem;font-weight:700;color:${color};">${label} · ${i+1}ª evidencia</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:.52rem;color:var(--text-3);">${s.fechaLabel||''}</span>
        ${delBtn}
      </div>
    </div>`;
    if(s.tipo==='img'){
      html+=`<img src="${s.val}" onclick="_novVerImg(this.src)" style="width:100%;max-height:120px;object-fit:cover;cursor:zoom-in;display:block;">`;
    } else {
      html+=`<div style="padding:6px 8px;font-size:.68rem;color:var(--text-1);">${s.val}</div>`;
    }
    html+='</div>';
  });
  html+=`<button onclick="_novAbrirSol('${id}')" style="width:100%;padding:6px;border:1.5px dashed #e2e8f0;border-radius:8px;background:none;color:var(--text-3);font-size:.7rem;cursor:pointer;font-family:inherit;" onmouseover="this.style.borderColor='#7c3aed';this.style.color='#7c3aed';" onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#94a3b8';">+ Agregar evidencia</button>`;
  html+='</div>';
  return html;
}

function _novNuevo(){
  _novModalState={mode:'new',id:null,solNum:1};
  document.getElementById('nov-m-meta').style.display='block';
  document.getElementById('nov-m-sol-section').style.display='block';
  document.getElementById('nov-m-title').textContent='Nueva Novedad';
  document.getElementById('nov-m-sol-label').textContent='Solución 1 (opcional)';
  const hoy=_hoyLocal();
  document.getElementById('nov-m-fecha').value=hoy;
  document.getElementById('nov-sol-fecha').value=hoy;
  document.getElementById('nov-m-guia').value='';
  document.getElementById('nov-m-asesor').value=window.getLoginAsesor?window.getLoginAsesor():'';
  document.getElementById('nov-m-img').value='';
  document.getElementById('nov-m-txt').value='';
  _novSetEstado('solucionada');
  document.getElementById('nov-modal').classList.add('open');
}

function _novAbrirSol(id){
  const sols=_novGetSols(_novData[id]||{});
  _novModalState={mode:'sol',id,solNum:sols.length+1};
  document.getElementById('nov-m-meta').style.display='none';
  document.getElementById('nov-m-sol-section').style.display='block';
  document.getElementById('nov-m-title').textContent='Evidencia '+(sols.length+1);
  document.getElementById('nov-m-sol-label').textContent='Evidencia '+(sols.length+1);
  document.getElementById('nov-m-img').value='';
  document.getElementById('nov-m-txt').value='';
  // Precargar fecha de hoy
  const hoy=_hoyLocal();
  document.getElementById('nov-sol-fecha').value=hoy;
  _novSetEstado('solucionada');
  document.getElementById('nov-modal').classList.add('open');
}

function _novCerrarModal(){
  document.getElementById('nov-modal').classList.remove('open');
  document.getElementById('nov-m-meta').style.display='block';
  document.getElementById('nov-m-sol-section').style.display='block';
  document.getElementById('nov-m-save-btn').textContent='Guardar';
}

function _novEditar(id){
  const n=_novData[id];
  if(!n)return;
  _novModalState={mode:'edit',id,solNum:null};
  document.getElementById('nov-m-title').textContent='Editar Novedad';
  document.getElementById('nov-m-meta').style.display='block';
  document.getElementById('nov-m-sol-section').style.display='none';
  document.getElementById('nov-m-fecha').value=n.fecha||'';
  document.getElementById('nov-m-guia').value=n.guia||'';
  document.getElementById('nov-m-asesor').value=n.asesor||'';
  document.getElementById('nov-m-save-btn').textContent='Actualizar';
  document.getElementById('nov-modal').classList.add('open');
}

function _novDelSol(id, solKey){
  if(!confirm('¿Eliminar esta evidencia?'))return;
  _db.ref(_novBasePath()+'/'+id+'/soluciones/'+solKey).remove().then(()=>{
    const dia=_novData[id]?.dia||new Date().getDate();
    if(_novData[id]?.soluciones) delete _novData[id].soluciones[solKey];
    _novRender(); _novSyncGD(dia);
  });
}
function _novClearSol(id,num){
  if(!confirm('¿Eliminar evidencia '+num+'?'))return;
  _db.ref(_novBasePath()+'/'+id+'/sol'+num).remove().then(()=>{
    const dia=_novData[id]?.dia||new Date().getDate();
    if(_novData[id]) _novData[id]['sol'+num]=null;
    _novRender(); _novSyncGD(dia);
  });
}

function _novEliminar(id){
  const n=_novData[id];
  const guia=n?n.guia:'esta novedad';
  if(!confirm('¿Eliminar la novedad de guía '+guia+'?\nEsta acción no se puede deshacer.'))return;
  const dia=n?.dia||new Date().getDate();
  _db.ref(_novBasePath()+'/'+id).remove().then(()=>{
    delete _novData[id];
    _novRender();
    _novSyncGD(dia);
  });
}

function _novSetEstado(estado){
  _novEstadoActivo=estado;
  document.getElementById('nov-estado-sol').classList.toggle('active',estado==='solucionada');
  document.getElementById('nov-estado-dev').classList.toggle('active',estado==='devuelta');
  const tipoWrap=document.getElementById('nov-tipo-wrap');
  if(estado==='devuelta'){
    tipoWrap.style.display='none';
    _novSetTipo('txt');
  } else {
    tipoWrap.style.display='block';
    _novSetTipo('img');
  }
}

function _novSetTipo(tipo){
  _novTipoActivo=tipo;
  document.getElementById('nov-tipo-img').classList.toggle('active',tipo==='img');
  document.getElementById('nov-tipo-txt').classList.toggle('active',tipo==='txt');
  document.getElementById('nov-m-img-wrap').style.display=tipo==='img'?'block':'none';
  document.getElementById('nov-m-txt-wrap').style.display=tipo==='txt'?'block':'none';
}

async function _novGuardar(){
  const btn=document.getElementById('nov-m-save-btn');
  btn.textContent='Guardando...'; btn.disabled=true;
  try{
    const state=_novModalState;
    const fechaInput=document.getElementById('nov-sol-fecha')?.value;
    const fechaBase=fechaInput?new Date(fechaInput+'T12:00:00'):new Date();
    const fechaLabel=fechaBase.toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});
    // Build solution object
    let solObj=null;
    if(_novTipoActivo==='img'){
      const fi=document.getElementById('nov-m-img');
      if(fi.files.length) solObj={estado:_novEstadoActivo,tipo:'img',val:await _novResizeImg(fi.files[0],800,.72),fechaLabel,ts:Date.now()};
    } else {
      const txt=document.getElementById('nov-m-txt').value.trim();
      if(txt) solObj={estado:_novEstadoActivo,tipo:'txt',val:txt,fechaLabel,ts:Date.now()};
    }
    const _fmtFecha=v=>{if(!v)return'';const d=new Date(v+'T12:00:00');return isNaN(d)?v:d.toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});};
    if(state.mode==='new'){
      const guia=document.getElementById('nov-m-guia').value.trim();
      if(!guia){ alert('Ingresa el número de guía'); btn.textContent='Guardar'; btn.disabled=false; return; }
      const fechaVal=document.getElementById('nov-m-fecha').value.trim();
      const novData={
        guia, fecha:_fmtFecha(fechaVal)||fechaVal,
        asesor:document.getElementById('nov-m-asesor').value.trim(),
        dia:new Date().getDate(), ts:Date.now()
      };
      // Primera evidencia va en soluciones/ si existe
      const ref=await _db.ref(_novBasePath()).push(novData);
      _novData[ref.key]=novData;
      if(solObj){
        await _db.ref(_novBasePath()+'/'+ref.key+'/soluciones').push(solObj);
        if(!_novData[ref.key].soluciones)_novData[ref.key].soluciones={};
        _novData[ref.key].soluciones[Date.now()]=solObj;
      }
    } else if(state.mode==='edit'){
      const guia=document.getElementById('nov-m-guia').value.trim();
      if(!guia){ alert('Ingresa el número de guía'); btn.textContent='Actualizar'; btn.disabled=false; return; }
      const fechaValE=document.getElementById('nov-m-fecha').value.trim();
      const updates={
        guia, fecha:_fmtFecha(fechaValE)||fechaValE,
        asesor:document.getElementById('nov-m-asesor').value.trim()
      };
      await _db.ref(_novBasePath()+'/'+state.id).update(updates);
      Object.assign(_novData[state.id], updates);
    } else {
      // Agregar nueva evidencia → siempre push a soluciones/
      if(!solObj){ alert('Agrega una imagen o texto de evidencia'); btn.textContent='Guardar'; btn.disabled=false; return; }
      const solRef=await _db.ref(_novBasePath()+'/'+state.id+'/soluciones').push(solObj);
      if(!_novData[state.id]) _novData[state.id]={};
      if(!_novData[state.id].soluciones) _novData[state.id].soluciones={};
      _novData[state.id].soluciones[solRef.key]=solObj;
    }
    _novCerrarModal();
    _novRender();
    // Sincronizar conteos en tabla GD
    const diaSync=state.mode==='new'?new Date().getDate():(_novData[state.id]?.dia||new Date().getDate());
    _novSyncGD(diaSync);
  } catch(e){ alert('Error al guardar: '+e.message); }
  btn.textContent='Guardar'; btn.disabled=false;
}

// _novGetSols vive en shared/app-shared.js (la usa también Gestión Logística)

// Recalcula soluc/devuelt del día en GD a partir de todas las novedades
async function _novSyncGD(dia){
  if(typeof _db==='undefined'||!window._currentUsername||!_gdMes||!dia) return;
  // Una novedad es solucionada o devuelta, nada más. Devuelta gana si hay de
  // ambas. Las que no tienen ninguna solución registrada siguen pendientes y no
  // suman en ninguna de las dos columnas: contarlas como resueltas inflaría el
  // dato. Antes 'soluc' era solo lo sincronizado a Dropi y todo lo demás caía en
  // el bucket 'gestion', que ya no existe.
  let soluc=0, devuelt=0;
  Object.values(_novData).forEach(n=>{
    if((n.dia||0)!==dia) return;
    const sols=_novGetSols(n);
    if(sols.some(s=>s.estado==='devuelta')){ devuelt++; }
    else if(n.solucionadaDropi||sols.some(s=>s.estado==='solucionada')){ soluc++; }
  });
  // Leer datos actuales del día en GD (para no pisar otras columnas).
  // _leerTienda sobre el nodo completo primero: si el mes aún vive en la clave
  // vieja, lo migra entero — leer solo /dias/{dia} habría copiado ese día suelto
  // y dejado el resto del historial atrás.
  const base=_gdBasePath();
  await _leerTienda(_gdBase);
  const snap=await _db.ref(base+'/dias/'+dia).once('value');
  const dayData=snap.val()||{};
  dayData.soluc=soluc; dayData.devuelt=devuelt;
  delete dayData.gestion; // campo retirado: se limpia al recalcular el día
  await _db.ref(base+'/dias/'+dia).set(dayData);
  // Actualizar cache local y UI si la tabla está visible
  if(!_gdData[dia]) _gdData[dia]={};
  Object.assign(_gdData[dia], {soluc, devuelt});
  delete _gdData[dia].gestion;
  const tabGestion=document.getElementById('gd-tab-gestion');
  if(tabGestion&&tabGestion.style.display!=='none'){
    const t=_gdCalc();
    if(document.getElementById('gd-soluc-'+dia)) document.getElementById('gd-soluc-'+dia).textContent=soluc||'';
    if(document.getElementById('gd-devuelt-'+dia)) document.getElementById('gd-devuelt-'+dia).textContent=devuelt||'';
    const tg=(_gdData[dia].conf||0)+(_gdData[dia].cancel||0)+soluc+devuelt+(_gdData[dia].recupCarri||0)+(_gdData[dia].contNoRecup||0)+(_gdData[dia].ventasWpp||0);
    const tgEl=document.getElementById('gd-tg-'+dia); if(tgEl) tgEl.textContent=tg||'';
    if(document.getElementById('gdt-soluc')) document.getElementById('gdt-soluc').textContent=t.soluc;
    if(document.getElementById('gdt-devuelt')) document.getElementById('gdt-devuelt').textContent=t.devuelt;
    if(document.getElementById('gdt-gral')) document.getElementById('gdt-gral').textContent=t.gral;
    _gdRenderResumen();
  }
}

// ── LIGHTBOX CON ZOOM ────────────────────────────────────
let _lbZoom=1,_lbX=0,_lbY=0,_lbDragging=false,_lbDragPrev={x:0,y:0};
let _lbPinchStart=null,_lbZoomStart=1,_lbSetup=false;

function _novVerImg(src){
  const img=document.getElementById('nov-lb-img');
  img.src=src; _lbZoom=1; _lbX=0; _lbY=0; _lbUpdate();
  document.getElementById('nov-lightbox').classList.add('open');
  const hint=document.getElementById('nov-lb-hint');
  if(hint) hint.style.display='block';
  if(!_lbSetup) _lbSetupEvents();
}
function _lbClose(){ document.getElementById('nov-lightbox').classList.remove('open'); }
function _lbZoomIn(){ _lbZoom=Math.min(8,_lbZoom*1.45); _lbUpdate(); }
function _lbZoomOut(){ _lbZoom=Math.max(1,_lbZoom/1.45); if(_lbZoom<=1){_lbZoom=1;_lbX=0;_lbY=0;} _lbUpdate(); }
function _lbReset(){ _lbZoom=1;_lbX=0;_lbY=0;_lbUpdate(); }
function _lbUpdate(){
  const img=document.getElementById('nov-lb-img');
  if(!img)return;
  img.style.transform=`translate(${_lbX}px,${_lbY}px) scale(${_lbZoom})`;
  img.style.cursor=_lbZoom>1?'grab':'default';
  const el=document.getElementById('nov-lb-zoom-val');
  if(el) el.textContent=Math.round(_lbZoom*100)+'%';
}
function _lbSetupEvents(){
  _lbSetup=true;
  const lb=document.getElementById('nov-lightbox');
  const img=document.getElementById('nov-lb-img');
  // Rueda del mouse → zoom
  lb.addEventListener('wheel',e=>{
    e.preventDefault();
    _lbZoom=Math.max(1,Math.min(8,_lbZoom*(e.deltaY<0?1.2:.83)));
    if(_lbZoom===1){_lbX=0;_lbY=0;}
    _lbUpdate();
  },{passive:false});
  // Arrastre con mouse
  img.addEventListener('mousedown',e=>{
    if(_lbZoom<=1)return;
    e.preventDefault(); _lbDragging=true;
    _lbDragPrev={x:e.clientX,y:e.clientY};
    img.style.cursor='grabbing';
  });
  document.addEventListener('mousemove',e=>{
    if(!_lbDragging)return;
    _lbX+=e.clientX-_lbDragPrev.x; _lbY+=e.clientY-_lbDragPrev.y;
    _lbDragPrev={x:e.clientX,y:e.clientY}; _lbUpdate();
  });
  document.addEventListener('mouseup',()=>{
    if(_lbDragging){ _lbDragging=false; const i=document.getElementById('nov-lb-img'); if(i&&_lbZoom>1)i.style.cursor='grab'; }
  });
  // Toque: pellizco (pinch) y arrastre
  img.addEventListener('touchstart',e=>{
    e.preventDefault();
    if(e.touches.length===1){
      _lbDragging=true; _lbPinchStart=null;
      _lbDragPrev={x:e.touches[0].clientX,y:e.touches[0].clientY};
    } else if(e.touches.length===2){
      _lbDragging=false;
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      _lbPinchStart=Math.sqrt(dx*dx+dy*dy); _lbZoomStart=_lbZoom;
    }
  },{passive:false});
  img.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length===1&&_lbDragging&&_lbZoom>1){
      _lbX+=e.touches[0].clientX-_lbDragPrev.x; _lbY+=e.touches[0].clientY-_lbDragPrev.y;
      _lbDragPrev={x:e.touches[0].clientX,y:e.touches[0].clientY}; _lbUpdate();
    } else if(e.touches.length===2&&_lbPinchStart){
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      _lbZoom=Math.max(1,Math.min(8,_lbZoomStart*Math.sqrt(dx*dx+dy*dy)/_lbPinchStart));
      if(_lbZoom===1){_lbX=0;_lbY=0;} _lbUpdate();
    }
  },{passive:false});
  img.addEventListener('touchend',()=>{ _lbDragging=false; _lbPinchStart=null; });
  // Doble clic → zoom rápido al 200% / reset
  img.addEventListener('dblclick',e=>{
    e.preventDefault();
    if(_lbZoom>1){ _lbReset(); } else { _lbZoom=2.5; _lbX=0; _lbY=0; _lbUpdate(); }
  });
}

function _novResizeImg(file,maxW,quality){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Error leyendo archivo'));
    reader.onload=e=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Error cargando imagen'));
      img.onload=()=>{
        const ratio=Math.min(1,maxW/img.width);
        const canvas=document.createElement('canvas');
        canvas.width=Math.round(img.width*ratio);
        canvas.height=Math.round(img.height*ratio);
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',quality));
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── FILTROS POR PESTAÑA ─────────────────────────────────────────────────
let _roFilter={q:'',estado:''};
let _antFilter={con:{q:'',transport:'',entrega:''},sin:{q:'',transport:'',entrega:''}};
let _novFilter={q:'',sol:''};

let _roSearchTimer=null;
function _roSearch(q){_roFilter.q=q;if(_roSearchTimer)clearTimeout(_roSearchTimer);_roSearchTimer=setTimeout(_roRender,200);}
function _roEstChip(e,btn){
  _roFilter.estado=e;
  document.querySelectorAll('#ro-est-chips .tab-chip').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');
  _roRender();
}
let _antSearchTimer=null;
function _antSearch(tipo,q){_antFilter[tipo].q=q;if(_antSearchTimer)clearTimeout(_antSearchTimer);_antSearchTimer=setTimeout(()=>_antRender(tipo),200);}
function _antTransChip(tipo,t,btn){
  _antFilter[tipo].transport=t;
  const grp=btn&&btn.closest('.tab-chips');
  if(grp)grp.querySelectorAll('.tab-chip').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');
  _antRender(tipo);
}
function _antEntChip(tipo,e,btn){
  _antFilter[tipo].entrega=e;
  const grp=btn&&btn.closest('.tab-chips');
  if(grp)grp.querySelectorAll('.tab-chip').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');
  _antRender(tipo);
}
let _novSearchTimer=null;
function _novSearch(q){_novFilter.q=q;if(_novSearchTimer)clearTimeout(_novSearchTimer);_novSearchTimer=setTimeout(_novRender,200);}
function _novSolChip(s,btn){
  _novFilter.sol=s;
  document.querySelectorAll('#nov-sol-chips .tab-chip').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');
  _novRender();
}

// ── R.O. (RECLAMO EN OFICINA) ──────────────────────────────────────────
const _RO_ESTADOS=[
  {val:'ENTREGADO',                       bg:'#16a34a'},
  {val:'DEVUELTO',                        bg:'#dc2626'},
  {val:'CANCELADO - CLIENTE REHUSA RECIBIR', bg:'#7c3aed'},
  {val:'EN PROCESO',                      bg:'#d97706'},
  {val:'PENDIENTE',                       bg:'#64748b'}
];
let _roData={}, _roST={};

function _roBase(tk){ return 'ro/'+(tk||_gdTK())+'/'+_gdMes; }
function _roPath(){ return _roBase(); }

function _roInit(){
  const wrap=document.getElementById('ro-table-wrap');
  if(wrap) wrap.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-3);font-size:.72rem;">Cargando...</div>';
  // Si hay pedidos de Logística cargados, sincronizar oficina antes de leer
  if(typeof pedidos!=='undefined'&&pedidos.length) _roAutoSync();
  if(typeof _db==='undefined'){_roData={};_roRender();return;}
  // Pequeño delay para que los writes de autoSync lleguen primero
  setTimeout(()=>{
    _leerTienda(_roBase, r=>r.orderByChild('ts')).then(snap=>{
      _roData={};
      snap.forEach(ch=>{ _roData[ch.key]=ch.val(); });
      _roRender();
    });
  // 'pedidos' solo existe si está cargado Gestión Logística; sin el typeof esto
  // lanzaba ReferenceError y el setTimeout nunca llegaba a programarse, así que
  // la tabla se quedaba en "Cargando..." para siempre en gestiones-diarias.html.
  }, (typeof pedidos!=='undefined'&&pedidos.filter(p=>p.estadoKey==='oficina').length)?800:0);
}

function _roRender(){
  const wrap=document.getElementById('ro-table-wrap');
  if(!wrap)return;
  const _roQ=(_roFilter.q||'').toLowerCase();
  const entries=Object.entries(_roData)
    .filter(([,r])=>{
      if(_roFilter.estado&&r.estado!==_roFilter.estado)return false;
      if(_roQ&&![(r.cliente||''),(r.telefono||''),(r.guia||''),(r.notaCliente||''),(r.notaSeguimiento||'')].some(v=>v.toLowerCase().includes(_roQ)))return false;
      return true;
    })
    .sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
  const cntEl=document.getElementById('ro-count');
  if(cntEl){const tot=Object.keys(_roData).length;cntEl.textContent=entries.length<tot?`${entries.length} de ${tot}`:`${tot} registros`;}
  const eOpts=_RO_ESTADOS.map(e=>`<option value="${e.val}">${e.val}</option>`).join('');
  let rows=entries.map(([id,r])=>{
    const eBg=(_RO_ESTADOS.find(e=>e.val===r.estado)||{bg:'white'}).bg;
    const eCol=r.estado?'white':'#374151';
    return `<tr>
      <td><input class="ant-inp" type="date" value="${r.fechaContacto||''}" onchange="_roCambio('${id}','fechaContacto',this.value)" style="min-width:112px;"></td>
      <td><input class="ant-inp" value="${(r.cliente||'').replace(/"/g,'&quot;')}" placeholder="Cliente" onchange="_roCambio('${id}','cliente',this.value)" style="min-width:130px;"></td>
      <td><input class="ant-inp" value="${r.telefono||''}" placeholder="Teléfono" onchange="_roCambio('${id}','telefono',this.value)" style="min-width:90px;"></td>
      <td><input class="ant-inp" value="${r.guia||''}" placeholder="N° Guía" onchange="_roCambio('${id}','guia',this.value)" style="min-width:105px;"></td>
      <td><input class="ant-inp" value="${(r.notaCliente||'').replace(/"/g,'&quot;')}" placeholder="Nota del cliente..." onchange="_roCambio('${id}','notaCliente',this.value)" style="min-width:175px;"></td>
      <td><select class="ant-sel" id="ro-est-${id}" onchange="_roEstCambio('${id}',this)" style="background:${eBg};color:${eCol};min-width:140px;font-size:.59rem;">
        <option value="">— Estado —</option>${eOpts}
      </select></td>
      <td><input class="ant-inp" value="${(r.notaSeguimiento||'').replace(/"/g,'&quot;')}" placeholder="Nota de seguimiento..." onchange="_roCambio('${id}','notaSeguimiento',this.value)" style="min-width:175px;"></td>
      <td><input class="ant-inp" type="date" value="${r.fechaEstado||''}" onchange="_roCambio('${id}','fechaEstado',this.value)" style="min-width:112px;"></td>
      <td><button class="ant-del-btn" onclick="_roEliminar('${id}')">🗑️</button></td>
    </tr>`;
  }).join('');
  wrap.innerHTML=`<table class="ro-tbl">
    <thead>
      <tr><th colspan="9" style="background:#dc2626;font-size:.68rem;padding:8px 10px;letter-spacing:.3px;font-weight:900;">
        REGISTRO Y SEGUIMIENTO DE ÓRDENES EN R.O. (RECLAMO EN OFICINA)
      </th></tr>
      <tr><th colspan="9" style="background:#1A2230;font-size:.58rem;font-weight:400;padding:4px 8px;color:#cbd5e1;">
        Seguimiento de pedidos que llegan a oficina de transportadora · Gestión de reclamos
      </th></tr>
      <tr>
        <th>FECHA DE<br>CONTACTO</th><th>CLIENTE</th><th>TELÉFONO</th><th>N° GUÍA</th>
        <th>NOTA DEL CLIENTE<br>EN PRIMER CONTACTO</th><th>ESTADO</th>
        <th>NOTA DE<br>SEGUIMIENTO</th><th>FECHA ACT.<br>DE ESTADO</th><th></th>
      </tr>
    </thead>
    <tbody>${rows||'<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text-3);font-size:.72rem;">Sin registros · usa el botón para agregar</td></tr>'}</tbody>
  </table>`;
  entries.forEach(([id,r])=>{
    const sel=document.getElementById('ro-est-'+id);
    if(sel&&r.estado) sel.value=r.estado;
  });
}

function _roEstCambio(id,sel){
  const e=_RO_ESTADOS.find(x=>x.val===sel.value);
  sel.style.background=e?e.bg:'white';
  sel.style.color=e?'white':'#374151';
  _roCambio(id,'estado',sel.value);
}

function _roCambio(id,campo,valor){
  if(!_roData[id])return;
  _roData[id][campo]=valor;
  const k='ro'+id+campo;
  if(_roST[k])clearTimeout(_roST[k]);
  _roST[k]=setTimeout(()=>{
    if(typeof _db!=='undefined')
      _db.ref(_roPath()+'/'+id).set(_roData[id]);
  },700);
}

function _roAgregar(){
  if(typeof _db==='undefined')return;
  const hoy=_hoyLocal();
  const obj={fechaContacto:hoy,cliente:'',telefono:'',guia:'',notaCliente:'',estado:'',notaSeguimiento:'',fechaEstado:'',ts:Date.now()};
  const ref=_db.ref(_roPath()).push(obj);
  _roData[ref.key]=Object.assign({},obj);
  _roRender();
  setTimeout(()=>{ const w=document.getElementById('ro-table-wrap'); if(w)w.scrollTop=w.scrollHeight; },50);
}

function _roEliminar(id){
  if(!confirm('¿Eliminar este registro de R.O.?'))return;
  if(typeof _db!=='undefined') _db.ref(_roPath()+'/'+id).remove();
  delete _roData[id];
  _roRender();
}

// _roAutoSync/_roSyncFromGestion viven en shared/app-shared.js (Gestión
// Logística los necesita siempre; aquí solo se llaman de forma guardada — ver
// línea de más abajo con "typeof pedidos" — así que no hace falta duplicarlos).

// ── ANTICIPOS ───────────────────────────────────────────────────────────
const _ANT_TRANSPORTES=[
  {val:'COORDINADORA', bg:'#1d4ed8'},
  {val:'INTERRAPIDÍSIMO', bg:'#111827'},
  {val:'ENVÍA', bg:'#dc2626'},
  {val:'TCC', bg:'#15803d'},
  {val:'SERVIENTREGA', bg:'#7c3aed'},
  {val:'OTRO', bg:'#64748b'}
];
let _antData={con:{},sin:{}}, _antST={};

function _antBase(tipo,tk){ return 'anticipos/'+(tk||_gdTK())+'/'+_gdMes+'/'+tipo; }
function _antPath(tipo){ return _antBase(tipo); }

function _antInit(){
  ['con','sin'].forEach(tipo=>{
    document.getElementById('ant-'+tipo+'-wrap').innerHTML='<div style="padding:12px;color:var(--text-3);font-size:.72rem;text-align:center;">Cargando...</div>';
    if(typeof _db==='undefined'){_antData[tipo]={};_antRender(tipo);return;}
    _leerTienda(tk=>_antBase(tipo,tk), r=>r.orderByChild('ts')).then(snap=>{
      _antData[tipo]={};
      snap.forEach(ch=>{ _antData[tipo][ch.key]=ch.val(); });
      _antRender(tipo);
    });
  });
}

function _antRender(tipo){
  const el=document.getElementById('ant-'+tipo+'-wrap');
  const _af=_antFilter[tipo];
  const _aq=(_af.q||'').toLowerCase();
  const allEntries=Object.entries(_antData[tipo]).sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
  const entries=allEntries.filter(([,r])=>{
    if(_af.transport&&r.transporte!==_af.transport)return false;
    if(_af.entrega==='si'&&!r.entrega)return false;
    if(_af.entrega==='no'&&r.entrega)return false;
    if(_af.entrega==='comp'&&!r.comprobante)return false;
    if(_aq&&![(r.telefono||''),(r.cliente||''),(r.motivo||''),(r.producto||''),(r.fecha||'')].some(v=>v.toLowerCase().includes(_aq)))return false;
    return true;
  });
  const cntAnt=document.getElementById('ant-'+tipo+'-count');
  if(cntAnt){const tot=allEntries.length;cntAnt.textContent=entries.length<tot?`${entries.length} de ${tot}`:`${tot} registros`;}
  const opts=_ANT_TRANSPORTES.map(t=>`<option value="${t.val}">${t.val}</option>`).join('');
  const esCon=tipo==='con';
  let rows=entries.map(([id,r])=>{
    const tBg=(_ANT_TRANSPORTES.find(t=>t.val===r.transporte)||{bg:'white'}).bg;
    const tColor=r.transporte&&tBg!=='white'?'white':'#374151';
    const compCell=esCon?`<td style="text-align:center;min-width:58px;">${
      r.comprobante
        ?`<div style="display:flex;align-items:center;justify-content:center;gap:3px;">
            <img src="${r.comprobante}" style="height:34px;width:34px;object-fit:cover;border-radius:4px;cursor:pointer;border:1.5px solid var(--border);" onclick="_antVerComp('${id}')" title="Ver comprobante">
            <button class="ant-del-btn" onclick="_antDelComp('${id}')" title="Quitar comprobante" style="font-size:.65rem;">✕</button>
          </div>`
        :`<button onclick="_antSubirComp('${id}')" style="background:none;border:1.5px dashed #cbd5e1;border-radius:5px;padding:5px 8px;cursor:pointer;font-size:.85rem;color:var(--text-3);" title="Adjuntar comprobante">📎</button>`
    }</td>`:'';
    return `<tr>
      <td><input class="ant-inp" value="${r.fecha||''}" placeholder="Fecha" onchange="_antCambio('${tipo}','${id}','fecha',this.value)" style="min-width:72px;"></td>
      <td><input class="ant-inp" value="${(r.cliente||'').replace(/"/g,'&quot;')}" placeholder="Cliente" onchange="_antCambio('${tipo}','${id}','cliente',this.value)" style="min-width:100px;"></td>
      <td><input class="ant-inp" value="${r.telefono||''}" placeholder="Teléfono" onchange="_antCambio('${tipo}','${id}','telefono',this.value)" style="min-width:82px;"></td>
      <td><select class="ant-sel" id="ant-sel-${id}" onchange="_antSelCambio('${tipo}','${id}',this)" style="background:${tBg};color:${tColor};min-width:112px;">
        <option value="">—</option>${opts}
      </select></td>
      <td><input class="ant-inp" value="${(r.motivo||'').replace(/"/g,'&quot;')}" placeholder="Motivo" onchange="_antCambio('${tipo}','${id}','motivo',this.value)" style="min-width:100px;"></td>
      <td><input class="ant-inp" value="${(r.producto||'').replace(/"/g,'&quot;')}" placeholder="Producto" onchange="_antCambio('${tipo}','${id}','producto',this.value)" style="min-width:100px;"></td>
      ${compCell}
      <td style="text-align:center;"><input type="checkbox" ${r.entrega?'checked':''} onchange="_antCambio('${tipo}','${id}','entrega',this.checked)" style="cursor:pointer;width:14px;height:14px;"></td>
      <td><button class="ant-del-btn" onclick="_antEliminar('${tipo}','${id}')">🗑️</button></td>
    </tr>`;
  }).join('');
  const cols=esCon?9:8;
  el.innerHTML=`<table class="ant-tbl">
    <thead><tr>
      <th>FECHA</th><th>CLIENTE</th><th>TELÉFONO</th><th>TRANSPORT.</th><th>MOTIVO</th><th>PRODUCTO</th>
      ${esCon?'<th>COMPROBANTE</th>':''}
      <th>ENTREGA</th><th></th>
    </tr></thead>
    <tbody>${rows||`<tr><td colspan="${cols}" style="padding:14px;text-align:center;color:var(--text-3);font-size:.7rem;">Sin registros</td></tr>`}</tbody>
  </table>`;
  entries.forEach(([id,r])=>{
    const sel=document.getElementById('ant-sel-'+id);
    if(sel&&r.transporte) sel.value=r.transporte;
  });
}

function _antVerComp(id){
  const r=_antData['con'][id];
  if(r&&r.comprobante) _novVerImg(r.comprobante);
}

function _antSubirComp(id){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='image/*';
  inp.onchange=async e=>{
    const file=e.target.files[0];
    if(!file)return;
    const b64=await _novResizeImg(file,800,0.72);
    _antData['con'][id].comprobante=b64;
    if(typeof _db!=='undefined')
      _db.ref(_antPath('con')+'/'+id).update({comprobante:b64});
    _antRender('con');
  };
  inp.click();
}

function _antDelComp(id){
  if(!confirm('¿Quitar el comprobante de pago?'))return;
  delete _antData['con'][id].comprobante;
  if(typeof _db!=='undefined')
    _db.ref(_antPath('con')+'/'+id).update({comprobante:null});
  _antRender('con');
}

function _antSelCambio(tipo,id,sel){
  const t=_ANT_TRANSPORTES.find(x=>x.val===sel.value);
  sel.style.background=t?t.bg:'white';
  sel.style.color=t?'white':'#374151';
  _antCambio(tipo,id,'transporte',sel.value);
}

function _antCambio(tipo,id,campo,valor){
  if(!_antData[tipo][id])return;
  _antData[tipo][id][campo]=valor;
  const key=tipo+id;
  if(_antST[key])clearTimeout(_antST[key]);
  _antST[key]=setTimeout(()=>{
    if(typeof _db!=='undefined')
      _db.ref(_antPath(tipo)+'/'+id).set(_antData[tipo][id]);
  },700);
}

function _antAgregar(tipo){
  if(typeof _db==='undefined')return;
  const hoy=new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'});
  const ref=_db.ref(_antPath(tipo)).push({fecha:hoy,cliente:'',telefono:'',transporte:'',motivo:'',producto:'',entrega:false,ts:Date.now()});
  _antData[tipo][ref.key]={fecha:hoy,cliente:'',telefono:'',transporte:'',motivo:'',producto:'',entrega:false,ts:Date.now()};
  _antRender(tipo);
  // Scroll al final
  const wrap=document.getElementById('ant-'+tipo+'-wrap');
  if(wrap) wrap.scrollTop=wrap.scrollHeight;
}

function _antEliminar(tipo,id){
  if(!confirm('¿Eliminar este registro?'))return;
  if(typeof _db!=='undefined') _db.ref(_antPath(tipo)+'/'+id).remove();
  delete _antData[tipo][id];
  _antRender(tipo);
}


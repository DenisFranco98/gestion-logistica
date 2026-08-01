// ══════════════════════════════════════════════════════════════════════
// shared/app-shared.js — Firebase, sesión/login, admin, y utilidades
// comunes a las 3 páginas de módulo (control-financiero, gestiones-diarias,
// gestion-logistica) + index.html. Un solo archivo, referenciado con
// <script src>, para no duplicar fixes (ver plan de split en 3 páginas).
// ══════════════════════════════════════════════════════════════════════

// ── HELPERS ────────────────────────────────────────────────────────────
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function toast(msg,dur=2200){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
// Escapa datos que vienen del Excel/Dropi (nombre del cliente, etc.) antes de insertarlos en innerHTML
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// Normaliza nombre → clave Firebase segura (sin tildes, sin espacios, solo a-z0-9_)
function _gdKey(s){
  return (s||'').trim().toLowerCase()
    .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u').replace(/ü/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')||'_';
}
// Fallback de _gdKey (misma normalización) — defensivo, _gdKey ya está garantizada aquí mismo
function _gdKeyFallback(s){
  return (s||'').trim().toLowerCase()
    .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u').replace(/ü/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')||'_';
}
// Compartida entre Control Financiero y Gestiones Diarias (widget "Cómo va la tienda")
function _cfMesLabel(m){if(!m)return '';const [y,mo]=m.split('-');const d=new Date(+y,+mo-1,1);return d.toLocaleDateString('es-CO',{month:'long',year:'numeric'}).toUpperCase();}
// Formatea fecha (serial de Excel o texto) a DD/MM/AAAA — usada por Gestión Logística y Gestiones Diarias
function _fmtFecha(val){
  if(!val)return'';
  let d;
  if(typeof val==='number'){d=new Date(Math.round((val-25569)*86400*1000));}
  else{const s=String(val).trim(),p=s.split(/[\/\-\.]/);
    if(p.length===3){d=p[0].length===4?new Date(p[0],p[1]-1,p[2]):new Date(p[2],p[1]-1,p[0]);}
    else{d=new Date(s);}
  }
  if(!d||isNaN(d))return String(val);
  return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();
}
// Mes actualmente cargado en Gestión Logística (window._mesCargado) — lo usa también Gestiones Diarias
function _getMesCargado(){
  return window._mesCargado || new Date().toISOString().slice(0,7);
}

// ── CARGA DIFERIDA DE LIBRERÍAS EXTERNAS ────────────────────────────────
// El Centro de Operaciones está en las 4 páginas, pero XLSX (reporte
// consolidado) y Chart.js (analítica) solo venían en el <head> de algunas —
// en el resto el botón moría con "XLSX is not defined". En vez de sumarle
// ~1MB al landing, se inyectan la primera vez que se usan. Si la página ya
// las trae en el <head>, resuelve de inmediato sin volver a descargarlas.
const _LIB_XLSX  = {global:'XLSX',  url:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'};
const _LIB_CHART = {global:'Chart', url:'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'};
const _libsPendientes = {};
function _cargarLib(lib){
  if(window[lib.global]) return Promise.resolve();
  if(_libsPendientes[lib.url]) return _libsPendientes[lib.url];
  _libsPendientes[lib.url] = new Promise((resolve,reject)=>{
    const fallo=msg=>{ delete _libsPendientes[lib.url]; reject(new Error(msg)); };
    const s=document.createElement('script');
    s.src=lib.url;
    s.onload=()=>{ window[lib.global] ? resolve() : fallo(lib.global+' no quedó disponible'); };
    s.onerror=()=>fallo('no se pudo descargar la librería (revisa tu conexión)');
    document.head.appendChild(s);
  });
  return _libsPendientes[lib.url];
}

// ── DROPDOWN "FALSO" REUTILIZABLE ───────────────────────────────────────
// Genera un <select> oculto (fuente de verdad, dispara 'change' normal) +
// un dropdown propio en HTML/CSS para poder controlar 100% su estilo,
// ya que el listado nativo de <select> no es fiable entre navegador/SO.
function _fselHtml(id, opciones, actual, onchange){
  const actualOpt=opciones.find(o=>o.value===actual)||opciones[0];
  const optsSelectHtml=opciones.map(o=>'<option value="'+o.value.replace(/"/g,'&quot;')+'"'+(o.value===actual?' selected':'')+(o.disabled?' disabled':'')+'>'+o.label+'</option>').join('');
  const optsListHtml=opciones.map(o=>'<div class="fsel-opt'+(o.value===actual?' selected':'')+(o.disabled?' disabled':'')+'" data-value="'+o.value.replace(/"/g,'&quot;')+'"'+(o.disabled&&o.hint?' data-hint="'+o.hint.replace(/"/g,'&quot;')+'"':'')+' onclick="_fselPick(this)">'+o.label+'</div>').join('');
  return '<select id="'+id+'" style="display:none;"'+(onchange?' onchange="'+onchange+'"':'')+'>'+optsSelectHtml+'</select>'+
    '<div class="fsel" data-target="'+id+'" style="position:relative;">'+
      '<button type="button" class="fsel-btn" onclick="_fselToggle(this)" style="width:100%;text-align:left;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:.8rem;color:var(--text-1);background:var(--bg-card);outline:none;font-family:inherit;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px;">'+
        '<span class="fsel-label">'+actualOpt.label+'</span><span style="opacity:.55;font-size:.65rem;">▾</span>'+
      '</button>'+
      '<div class="fsel-list">'+optsListHtml+'</div>'+
    '</div>';
}
function _fselToggle(btn){
  const wrap=btn.closest('.fsel');
  const list=wrap.querySelector('.fsel-list');
  const abierto=list.classList.contains('open');
  document.querySelectorAll('.fsel-list.open').forEach(l=>l.classList.remove('open'));
  if(!abierto)list.classList.add('open');
}
// Aviso flotante justo encima del punto donde se hizo clic (en vez del toast genérico)
function _fselAvisoPunto(msg, anchorEl){
  if(!anchorEl){toast('🔒 '+msg);return;}
  let tip=document.getElementById('fsel-tip');
  if(!tip){
    tip=document.createElement('div');
    tip.id='fsel-tip';
    tip.className='fsel-tip';
    document.body.appendChild(tip);
  }
  tip.textContent='🔒 '+msg;
  tip.style.display='block';
  const r=anchorEl.getBoundingClientRect();
  const margin=8;
  const tipW=Math.min(240,tip.offsetWidth||220);
  let left=r.left;
  left=Math.max(margin,Math.min(left,window.innerWidth-tipW-margin));
  tip.style.left=left+'px';
  const tipH=tip.offsetHeight||30;
  let top=r.top-tipH-8;
  if(top<margin) top=r.bottom+8;
  tip.style.top=top+'px';
  tip.classList.add('show');
  clearTimeout(tip._hideTimer);
  tip._hideTimer=setTimeout(()=>{
    tip.classList.remove('show');
    setTimeout(()=>{if(!tip.classList.contains('show'))tip.style.display='none';},200);
  },2500);
}
function _fselPick(opt){
  if(opt.classList.contains('disabled')){
    if(opt.dataset.hint)_fselAvisoPunto(opt.dataset.hint,opt);
    return;
  }
  const wrap=opt.closest('.fsel');
  const list=wrap.querySelector('.fsel-list');
  const sel=document.getElementById(wrap.dataset.target);
  if(sel){sel.value=opt.dataset.value;sel.dispatchEvent(new Event('change'));}
  wrap.querySelectorAll('.fsel-opt').forEach(o=>o.classList.remove('selected'));
  opt.classList.add('selected');
  wrap.querySelector('.fsel-label').textContent=opt.textContent;
  list.classList.remove('open');
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.fsel'))document.querySelectorAll('.fsel-list.open').forEach(l=>l.classList.remove('open'));
});

// Navegación real entre páginas del sitio: marca la bandera para que el
// beforeunload de cada página no muestre el diálogo nativo de salida.
function irAPagina(url){ window._navegandoInterno=true; location.href=url; }

// ===== FIREBASE INIT =====
const _fbApp = firebase.initializeApp({
  apiKey: "AIzaSyA9Ae7Zt7TwKsg7h7TOD9PTfeEaYhkoLVE",
  authDomain: "gestion-logistica-86fd7.firebaseapp.com",
  databaseURL: "https://gestion-logistica-86fd7-default-rtdb.firebaseio.com",
  projectId: "gestion-logistica-86fd7",
  storageBucket: "gestion-logistica-86fd7.firebasestorage.app",
  messagingSenderId: "950929138441",
  appId: "1:950929138441:web:a6f3fc27e23fe355a6e9d8"
});
const _db = firebase.database();

// Diagnóstico: listar nodos de historial_diario con estructura vieja ({fecha} directo
// en vez de {asesor}/{fecha}). Ejecutar desde la consola: _auditHistorialEstructura()
window._auditHistorialEstructura = function(){
  _db.ref('historial_diario').once('value', snap=>{
    const data = snap.val()||{};
    const viejos = [], nuevos = [];
    Object.entries(data).forEach(([uid, contenido])=>{
      const keys = Object.keys(contenido||{});
      if(!keys.length) return;
      const esViejo = keys[0].match(/^\d{4}-\d{2}-\d{2}$/);
      (esViejo ? viejos : nuevos).push(uid);
    });
    console.log('%c[AUDIT historial_diario]','font-weight:bold');
    console.log('Estructura NUEVA ({asesor}/{fecha}):', nuevos.length, nuevos);
    console.log('Estructura VIEJA ({fecha} directo) — candidatos a migrar:', viejos.length, viejos);
    if(viejos.length) console.log('Usa la herramienta de migración del superadmin para actualizar estos nodos.');
  });
};

// Diagnóstico: inventario de las 5 raíces que se clavan por tienda, para saber
// qué migró ya a empresaId, qué sigue en la clave vieja (slug del nombre), qué
// rutas comparten dos negocios distintos y qué quedó sin dueño.
// Ejecutar desde la consola como admin: _auditTiendas()
// Solo lee — no escribe ni borra nada.
window._auditTiendas = function(){
  const RAICES=['gestiones_diarias','control_financiero','ro','novedades','anticipos'];
  const cuenta=n=>{ // registros aproximados de un nodo de tienda (hojas por mes)
    let t=0;
    Object.entries(n||{}).forEach(([mes,v])=>{ if(mes==='config'||!v||typeof v!=='object')return; t+=Object.keys(v).length; });
    return t;
  };
  console.log('%c[AUDIT tiendas] leyendo...','font-weight:bold');
  Promise.all([
    _db.ref('empresas').once('value'),
    _db.ref('admin_empresas').once('value'),
    ...RAICES.map(r=>_db.ref(r).once('value'))
  ]).then(snaps=>{
    const empresas=snaps[0].val()||{}, adminEmp=snaps[1].val()||{};
    const datos={}; RAICES.forEach((r,i)=>datos[r]=snaps[i+2].val()||{});
    // dueño de cada empresa: el admin que la tiene asignada (o creadoPor)
    const duenoDe={};
    Object.entries(adminEmp).forEach(([adm,emps])=>Object.keys(emps||{}).forEach(e=>{ (duenoDe[e]=duenoDe[e]||new Set()).add(adm); }));
    const slugDe={}, porSlug={};
    Object.entries(empresas).forEach(([id,e])=>{
      const s=_gdKey(e.nombre||id); slugDe[id]=s;
      (porSlug[s]=porSlug[s]||[]).push({id,nombre:e.nombre,creadoPor:e.creadoPor});
    });

    console.group('%c1) Colisiones — un slug, varios negocios','color:#b91c1c;font-weight:bold');
    const colis=[];
    Object.entries(porSlug).forEach(([slug,lista])=>{
      if([...new Set(lista.map(x=>x.creadoPor))].length<2) return;
      colis.push(slug);
      const filas=lista.map(x=>({tienda:x.nombre,empresaId:x.id,admin:(x.creadoPor||'').slice(0,10)+'…'}));
      console.log('%c'+slug,'font-weight:bold'); console.table(filas);
      RAICES.forEach(r=>{ const n=cuenta(datos[r][slug]); if(n) console.log('   '+r+'/'+slug+' → '+n+' registros aún en la ruta compartida'); });
    });
    if(!colis.length) console.log('Ninguna. Todas las tiendas tienen ruta propia.');
    console.groupEnd();

    console.group('%c2) Estado de migración por tienda','color:#0e7490;font-weight:bold');
    const estado=Object.entries(empresas).map(([id,e])=>{
      const f={tienda:e.nombre,empresaId:id};
      RAICES.forEach(r=>{
        // Vale la EXISTENCIA del nodo, no su conteo: un nodo ya migrado que solo
        // tenga /config cuenta 0 registros y no por eso está sin migrar.
        const yaMigrado=!!datos[r][id], viejo=cuenta(datos[r][slugDe[id]]);
        f[r]=yaMigrado?('✔ '+cuenta(datos[r][id])):(viejo?('pendiente ('+viejo+')'):'—');
      });
      return f;
    }).sort((a,b)=>String(a.tienda).localeCompare(String(b.tienda)));
    console.table(estado);
    console.log('✔ n = ya migrado a la clave por empresaId, n registros. "pendiente (n)" = sigue solo en la clave vieja.');
    console.groupEnd();

    console.group('%c3) Nodos sin dueño','color:#a16207;font-weight:bold');
    const vivos=new Set([...Object.keys(empresas),...Object.values(slugDe)]);
    let hay=false;
    RAICES.forEach(r=>Object.keys(datos[r]).forEach(k=>{
      if(vivos.has(k))return;
      hay=true;
      console.log(r+'/'+k+'  → '+cuenta(datos[r][k])+' registros'+(k==='_'?'   (clave vacía: se guardó sin tienda en sesión)':''));
    }));
    if(!hay) console.log('Ninguno.');
    console.log('Ojo: "sin dueño" es relativo a las tiendas que ESTA sesión puede leer de /empresas. Si las reglas limitan la lectura a tus propias tiendas, las de otros negocios aparecerán acá sin serlo.');
    console.groupEnd();

    console.log('%cRecordá: las rutas viejas son el respaldo de la migración. No las borres hasta que TODAS las tiendas que comparten ese slug aparezcan con ✔ arriba.','color:#b91c1c');
  }).catch(e=>console.error('[AUDIT tiendas] falló (¿sesión de admin?):',e));
};

// Migración masiva de las 5 raíces por tienda: copia todo lo que siga bajo la
// clave vieja (slug del nombre) a la clave por empresaId. Existe porque la
// migración perezosa de _leerTienda solo cubre el mes que se está mirando, y
// hacerlo a mano son 25 tiendas × 5 módulos × varios meses.
// Ejecutar desde la consola como admin: _migrarTiendas()
// - Copia mes por mes (segundo nivel de cada raíz) y también /config.
// - NUNCA sobrescribe un mes que ya exista en destino: lo salta y lo reporta.
// - No borra nada: la ruta vieja queda intacta como respaldo.
// Ojo: en los slugs que comparten dos negocios, ambas tiendas reciben copia del
// histórico mezclado — separar registros ajenos es un trabajo posterior y manual.
window._migrarTiendas = function(){
  const RAICES=['gestiones_diarias','control_financiero','ro','novedades','anticipos'];
  console.log('%c[MIGRAR tiendas] leyendo...','font-weight:bold');
  Promise.all([_db.ref('empresas').once('value'),...RAICES.map(r=>_db.ref(r).once('value'))]).then(snaps=>{
    const empresas=snaps[0].val()||{};
    const datos={}; RAICES.forEach((r,i)=>datos[r]=snaps[i+1].val()||{});
    const copias=[], saltados=[];
    Object.entries(empresas).forEach(([id,e])=>{
      const slug=_gdKey(e.nombre||id);
      if(slug===id) return;
      RAICES.forEach(raiz=>{
        const origen=datos[raiz][slug]; if(!origen) return;
        const destino=datos[raiz][id]||{};
        Object.keys(origen).forEach(mes=>{
          const item={raiz,tienda:e.nombre,id,slug,mes,
            n:(origen[mes]&&typeof origen[mes]==='object')?Object.keys(origen[mes]).length:1};
          if(destino[mes]!==undefined){ saltados.push(item); return; }  // ya migrado: no pisar
          item._val=origen[mes];
          copias.push(item);
        });
      });
    });
    if(saltados.length){
      console.group('%cYa estaban en destino — se dejan como están ('+saltados.length+')','color:#a16207');
      console.table(saltados.map(({raiz,tienda,mes,n})=>({raiz,tienda,mes,registros:n})));
      console.groupEnd();
    }
    if(!copias.length){ console.log('%cNada que migrar: todo lo viejo ya tiene su equivalente por empresaId.','color:#15803d;font-weight:bold'); return; }
    console.group('%cA copiar ('+copias.length+' nodos)','color:#0e7490;font-weight:bold');
    console.table(copias.map(({raiz,tienda,slug,id,mes,n})=>({raiz,tienda,de:raiz+'/'+slug+'/'+mes,a:raiz+'/'+id+'/'+mes,registros:n})));
    console.groupEnd();
    // Secuencial a propósito: son escrituras sobre datos de producción y así el
    // log queda en orden y un fallo no deja la mitad en el aire sin avisar.
    let hechas=0, fallidas=0;
    copias.reduce((p,c)=>p.then(()=>
      _db.ref(c.raiz+'/'+c.id+'/'+c.mes).set(c._val)
        .then(()=>{ hechas++; })
        .catch(err=>{ fallidas++; console.error('  ✗ '+c.raiz+'/'+c.id+'/'+c.mes,err); })
    ), Promise.resolve()).then(()=>{
      console.log('%c[MIGRAR tiendas] listo: '+hechas+' copiados, '+fallidas+' con error, '+saltados.length+' ya existían.',
        'font-weight:bold;color:'+(fallidas?'#b91c1c':'#15803d'));
      console.log('Las rutas viejas siguen intactas. Verificá con _auditTiendas() y recién después borrá una ruta legacy, solo si TODAS las tiendas que comparten ese slug quedaron en ✔.');
    });
  }).catch(e=>console.error('[MIGRAR tiendas] falló (¿sesión de admin?):',e));
};

// Rescata las novedades que quedaron bajo la clave vieja DESPUÉS de migrar.
// Pasó con la extensión de Dropi: siguió escribiendo en novedades/{slug} un
// tiempo más, y _migrarTiendas() no las trae porque salta los meses que ya
// existen en destino (para no pisar lo migrado).
// A diferencia de _migrarTiendas, esto FUSIONA registro a registro:
//   - novedad que no está en destino          → se copia entera
//   - novedad que sí está pero con soluciones
//     que el destino no tiene                 → se copian solo esas soluciones
// Identidad de una novedad: guía + día. Nada se borra del origen.
// Ejecutar desde la consola como admin: _fusionarNovedades()
window._fusionarNovedades = function(){
  const idNov=n=>String((n&&n.guia)||'').trim()+'|'+String((n&&n.dia)||'');
  const idSol=s=>String((s&&s.estado)||'')+'|'+String((s&&s.ts)||'')+'|'+String((s&&s.val)||'').slice(0,40);
  console.log('%c[FUSIONAR novedades] leyendo...','font-weight:bold');
  Promise.all([_db.ref('empresas').once('value'),_db.ref('novedades').once('value')]).then(([se,sn])=>{
    const empresas=se.val()||{}, nov=sn.val()||{};
    const nuevas=[], solsNuevas=[];
    Object.entries(empresas).forEach(([id,e])=>{
      const slug=_gdKey(e.nombre||id);
      if(slug===id||!nov[slug]) return;
      Object.entries(nov[slug]).forEach(([mes,regs])=>{
        if(!regs||typeof regs!=='object') return;
        const destino=(nov[id]&&nov[id][mes])||{};
        const porId={};
        Object.entries(destino).forEach(([k,v])=>{ porId[idNov(v)]=Object.assign({_key:k},v); });
        Object.values(regs).forEach(r=>{
          const gemela=porId[idNov(r)];
          if(!gemela){ nuevas.push({tienda:e.nombre,id,mes,guia:r.guia,dia:r.dia,_val:r}); return; }
          const yaHay=new Set(Object.values(gemela.soluciones||{}).map(idSol));
          Object.values(r.soluciones||{}).forEach(s=>{
            if(!yaHay.has(idSol(s))) solsNuevas.push({tienda:e.nombre,id,mes,destKey:gemela._key,guia:r.guia,estado:s.estado,_val:s});
          });
        });
      });
    });
    if(!nuevas.length&&!solsNuevas.length){ console.log('%cNada que rescatar: no hay novedades ni soluciones sueltas en las rutas viejas.','color:#15803d;font-weight:bold'); return; }
    if(nuevas.length){ console.group('%cNovedades a recuperar ('+nuevas.length+')','color:#0e7490;font-weight:bold');
      console.table(nuevas.map(({tienda,mes,guia,dia})=>({tienda,mes,guia,dia}))); console.groupEnd(); }
    if(solsNuevas.length){ console.group('%cSoluciones sueltas a recuperar ('+solsNuevas.length+')','color:#0e7490;font-weight:bold');
      console.table(solsNuevas.map(({tienda,mes,guia,estado})=>({tienda,mes,guia,estado}))); console.groupEnd(); }
    let n=0,f=0;
    const tareas=[
      ...nuevas.map(x=>()=>_db.ref('novedades/'+x.id+'/'+x.mes).push(x._val)),
      ...solsNuevas.map(x=>()=>_db.ref('novedades/'+x.id+'/'+x.mes+'/'+x.destKey+'/soluciones').push(x._val))
    ];
    tareas.reduce((p,t)=>p.then(()=>t().then(()=>{n++;}).catch(e=>{f++;console.error('  ✗',e);})),Promise.resolve())
      .then(()=>{
        console.log('%c[FUSIONAR novedades] listo: '+n+' recuperados, '+f+' con error.','font-weight:bold;color:'+(f?'#b91c1c':'#15803d'));
        console.log('Las rutas viejas quedan intactas. Los contadores del día se recalculan al abrir cada novedad o al guardar una solución.');
      });
  }).catch(e=>console.error('[FUSIONAR novedades] falló (¿sesión de admin?):',e));
};

// Clave para gestiones_sync: siempre por tienda (empresa), no por usuario individual
let _gsKeyWarned=false;
function _gsKey(){
  if(!window._currentTiendaId && window._currentUsername && !_gsKeyWarned){
    _gsKeyWarned=true;
    console.warn('[SYNC] Sin empresaId — gestiones_sync se guardará bajo el username "'+window._currentUsername+'". El admin no verá estas gestiones al filtrar por tienda.');
  }
  return window._currentTiendaId || window._currentUsername;
}

// ===== LOGIN =====
function _initLogin(){
  const LOGIN_KEY = 'lgs_auth';
  const TIENDA_KEY = 'lgs_tienda';
  const ASESOR_KEY = 'lgs_asesor';
  const USER_KEY = 'lgs_user';
  const ADMIN_USER = 'admin';
  const ADMIN_PASS = 'admin';
  const FALLBACK_USER = '3D Company';
  const FALLBACK_PASS = '3dcompany';

  let _heartbeatInterval = null;
  let _currentUsername = null;

  function _hideSplash(){ const s=document.getElementById('app-splash'); if(s) s.style.display='none'; }
  function _loginShow(){
    _hideSplash();
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-screen').classList.add('visible');
    document.getElementById('admin-panel').classList.remove('visible');
    document.getElementById('tienda-select-screen').style.display='none';
    const sp = document.getElementById('super-admin-panel');
    if(sp) sp.style.display='none';
  }
  function _loginHide(){ document.getElementById('login-screen').classList.add('hidden'); document.getElementById('login-screen').classList.remove('visible'); }
  function _showAdmin(){ _hideSplash(); document.getElementById('admin-panel').classList.add('visible'); _loginHide(); }
  function _showSuperAdmin(){ _hideSplash(); document.getElementById('super-admin-panel').style.display='block'; _loginHide(); }

  // ── Presencia en Firebase ──
  function _registrarPresencia(username, tienda, asesor){
    _currentUsername = username;
    window._currentUsername = username;
    _cachedLoginTime = Date.now(); // cachear loginTime localmente para evitar lectura Firebase por acción
    const ref = _db.ref('presence/' + username);
    ref.set({ online: true, lastSeen: Date.now(), loginTime: _cachedLoginTime, tienda: tienda||'', asesor: asesor||'', sessionGestiones: 0, force_logout: false });
    ref.onDisconnect().update({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    if(_heartbeatInterval){clearInterval(_heartbeatInterval);_heartbeatInterval=null;}
    _heartbeatInterval = setInterval(()=>{ if(_currentUsername===username) ref.update({ lastSeen: Date.now(), online: true }); }, 30000);
    // Registrar inicio de sesión en historial (en try-catch para no afectar presencia)
    try{
      const _sesRef = _db.ref('session_hist/'+username).push({ start: Date.now(), tienda: tienda||'', asesor: asesor||'' });
      window._currentSessionKey = _sesRef.key;
      _sesRef.onDisconnect().update({ end: firebase.database.ServerValue.TIMESTAMP });
    }catch(_){}
    // Nota: el cierre real (offline en presence/ y end en session_hist) ya lo cubren
    // los onDisconnect() de arriba (líneas ~12030/12038) — se retiró el listener de
    // beforeunload que hacía lo mismo porque también se dispara cuando Chrome descarga
    // la pestaña en segundo plano (no solo al cerrar de verdad), marcando "offline"
    // a un asesor que sigue trabajando y cortando su session_hist antes de tiempo.
    // Escuchar si el admin fuerza cierre de sesión.
    // Detach del listener anterior: sin esto cada login/logout acumula
    // listeners y el cierre forzado se dispararía múltiples veces.
    if(window._forceLogoutRef){ window._forceLogoutRef.off('value'); }
    window._forceLogoutRef = ref.child('force_logout');
    window._forceLogoutRef.on('value', snap=>{
      if(snap.val()===true){
        // Detener heartbeat PRIMERO antes de cualquier operación async
        // para evitar que sobreescriba online:false con online:true
        if(_heartbeatInterval){ clearInterval(_heartbeatInterval); _heartbeatInterval=null; }
        ref.child('force_logout').set(false);
        _limpiarPresencia();
        [LOGIN_KEY,TIENDA_KEY,ASESOR_KEY,USER_KEY].forEach(k=>localStorage.removeItem(k));
        ['login-user','login-pass','login-tienda','login-asesor'].forEach(id=>{ const el=document.getElementById(id); if(el)el.value=''; });
        // Cerrar cualquier modal abierto
        ['logout-modal','nuevo-modal','reset-modal'].forEach(id=>{ const el=document.getElementById(id); if(el){el.classList.remove('open');el.style.display='none';} });
        _loginShow();
        setTimeout(()=>{ const err=document.getElementById('login-error'); if(err){err.textContent='⚠️ Tu sesión fue cerrada por el administrador';err.classList.add('show');setTimeout(()=>err.classList.remove('show'),4000);} }, 200);
      }
    });
  }

  function _limpiarPresencia(){
    if(window._forceLogoutRef){ window._forceLogoutRef.off('value'); window._forceLogoutRef = null; }
    if(_currentUsername){
      const ref = _db.ref('presence/'+_currentUsername);
      ref.onDisconnect().cancel();
      ref.update({ online: false, lastSeen: Date.now() });
      if(window._currentSessionKey){
        _db.ref('session_hist/'+_currentUsername+'/'+window._currentSessionKey).update({ end: Date.now() });
        window._currentSessionKey = null;
      }
    }
    if(_heartbeatInterval){ clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
    _currentUsername = null;
    window._currentUsername = null;
  }

  window._fbIncrementarGestion = function(){
    if(!_currentUsername) return;
    _db.ref('presence/'+_currentUsername+'/sessionGestiones').transaction(v=>(v||0)+1);
  };

  function _entrarApp(username, tienda, asesor, empresaId){
    localStorage.setItem(LOGIN_KEY, '1');
    localStorage.setItem(TIENDA_KEY, tienda);
    localStorage.setItem(ASESOR_KEY, asesor);
    localStorage.setItem(USER_KEY, username);
    localStorage.setItem('lgs_rol', window._currentRol||'dueno');
    localStorage.setItem('lgs_empresa_id', empresaId||'');
    window._currentTiendaId = empresaId||null;
    // Sin empresaId las gestiones se guardarían bajo el username y el admin
    // (que lee por tienda) no las vería. Resolver el id por nombre de tienda.
    if(!empresaId && tienda){
      _db.ref('empresas').once('value', snapE=>{
        const emps = snapE.val()||{};
        const match = Object.entries(emps).find(([,e])=>(e.nombre||'').trim().toLowerCase()===String(tienda).trim().toLowerCase());
        if(match){
          window._currentTiendaId = match[0];
          localStorage.setItem('lgs_empresa_id', match[0]);
          console.log('[LOGIN] empresaId resuelto por nombre de tienda:', match[0]);
        } else {
          console.warn('[LOGIN] Sin empresaId y tienda "'+tienda+'" no existe en /empresas — gestiones_sync usará el username como clave');
        }
      });
    }
    document.getElementById('login-error').classList.remove('show');
    document.getElementById('login-error-campos').classList.remove('show');
    _loginHide();
    _registrarPresencia(username, tienda, asesor);
    window._gdMostrarModeSelect(asesor);
  }
  // Expuesta globalmente: _admEntrarTienda (fuera de este closure) también la necesita
  window._entrarApp = _entrarApp;

  // _gsKey definida globalmente abajo

  let _pendingUser = null, _pendingPass = null;

  let _ls2AsesoresList = [];

  function _pedirPerfil(username, tiendaGuardada){
    _pendingUser = username;
    _ls2AsesoresList = [];
    document.getElementById('ls2-asesor').value = '';
    document.getElementById('ls2-asesor-lista').style.display = 'none';
    document.getElementById('ls2-asesor-hint').style.display = 'none';
    document.getElementById('ls2-tienda').value = tiendaGuardada||'';
    // Ocultar campo tienda si ya está guardada
    document.getElementById('ls2-tienda-field').style.display = tiendaGuardada ? 'none' : 'block';
    document.getElementById('ls2-error').style.display = 'none';
    // Cargar asesores previos desde historial_diario
    _db.ref('historial_diario/'+username).once('value', snap=>{
      const data = snap.val()||{};
      const keys = Object.keys(data);
      const isNew = keys.length>0 && !keys[0].match(/^\d{4}-\d{2}-\d{2}$/);
      if(isNew){
        _ls2AsesoresList = keys.map(k=>{
          // obtener nombre legible del primer día disponible
          const dias = data[k];
          const primerDia = dias[Object.keys(dias)[0]];
          return primerDia?.asesorNombre || k;
        }).filter(Boolean);
        if(_ls2AsesoresList.length){
          const hint = document.getElementById('ls2-asesor-hint');
          hint.textContent = '👥 '+_ls2AsesoresList.length+' asesor'+(+_ls2AsesoresList.length>1?'es':'')+ ' han trabajado en esta cuenta';
          hint.style.display = 'block';
        }
      }
    });
    document.getElementById('login-step2-modal').classList.add('open');
    document.getElementById('ls2-asesor').focus();
  }

  window._ls2FiltrarAsesores = function(val){
    const lista = document.getElementById('ls2-asesor-lista');
    if(!_ls2AsesoresList.length){ lista.style.display='none'; return; }
    const filtrados = val.trim()===''
      ? _ls2AsesoresList
      : _ls2AsesoresList.filter(n=>n.toLowerCase().includes(val.toLowerCase()));
    if(!filtrados.length){ lista.style.display='none'; return; }
    lista.innerHTML = filtrados.map(n=>
      '<div onclick="_ls2SeleccionarAsesor(\''+n.replace(/'/g,"\\'")+'\')" style="padding:10px 14px;cursor:pointer;font-size:.82rem;color:#e2e8f0;border-bottom:1px solid #334155;" onmouseenter="this.style.background=\'#334155\'" onmouseleave="this.style.background=\'\'">'+n+'</div>'
    ).join('');
    lista.style.display='block';
  };

  window._ls2SeleccionarAsesor = function(nombre){
    document.getElementById('ls2-asesor').value = nombre;
    document.getElementById('ls2-asesor-lista').style.display='none';
  };

  window._ls2OcultarLista = function(){
    document.getElementById('ls2-asesor-lista').style.display='none';
  };

  window._loginStep2Confirmar = function(){
    const a = document.getElementById('ls2-asesor').value.trim();
    const tInput = document.getElementById('ls2-tienda').value.trim();
    const tHidden = document.getElementById('ls2-tienda-field').style.display==='none';
    const t = tHidden ? document.getElementById('ls2-tienda').value.trim() || localStorage.getItem('lgs_tienda') || '' : tInput;
    if(!a || !t){ document.getElementById('ls2-error').style.display='block'; return; }
    document.getElementById('ls2-asesor-lista').style.display='none';
    document.getElementById('login-step2-modal').classList.remove('open');
    const _pu = _pendingUser; _pendingUser = null;
    _db.ref('user_tiendas/'+_pu).once('value', snapUT=>{
      const ids = Object.keys(snapUT.val()||{});
      _entrarApp(_pu, t, a, ids.length === 1 ? ids[0] : null);
    });
  };

  // App secundaria para crear usuarios sin perder sesión del admin
  const _fbSecApp = firebase.apps.find(a=>a.name==='secondary') ||
    firebase.initializeApp({
      apiKey:'AIzaSyA9Ae7Zt7TwKsg7h7TOD9PTfeEaYhkoLVE',
      authDomain:'gestion-logistica-86fd7.firebaseapp.com',
      databaseURL:'https://gestion-logistica-86fd7-default-rtdb.firebaseio.com',
      projectId:'gestion-logistica-86fd7',
      storageBucket:'gestion-logistica-86fd7.firebasestorage.app',
      messagingSenderId:'950929138441',
      appId:'1:950929138441:web:a6f3fc27e23fe355a6e9d8'
    },'secondary');
  window._fbSecAuth = _fbSecApp.auth();

  // Entrar al panel según el rol elegido
  function _entrarConRol(uid, email, rolTipo, admData, userData, snapTiendasPrefetch){
    const btn = document.querySelector('.login-btn');
    if(btn){ btn.disabled=false; btn.textContent='Ingresar'; }
    document.getElementById('rol-select-screen').style.display='none';
    // Mostrar botón "Cambiar perfil" solo si la cuenta tiene múltiples roles
    const tieneMultiRol = window._rolPendiente && window._rolPendiente.roles && window._rolPendiente.roles.length > 1;
    ['btn-volver-roles-sa','btn-volver-roles-adm','btn-volver-roles-topnav','btn-volver-roles-tienda','btn-volver-roles-modeselect'].forEach(id=>{
      const b = document.getElementById(id);
      if(b) b.style.display = tieneMultiRol ? 'inline-block' : 'none';
    });
    if(rolTipo === 'superadmin'){
      localStorage.setItem(LOGIN_KEY,'superadmin');
      _showSuperAdmin(); _superAdmCargar();
    } else if(rolTipo === 'admin'){
      _auditLogin(email,'exito');
      localStorage.setItem(LOGIN_KEY,'admin');
      localStorage.setItem('lgs_admin_id', uid);
      localStorage.setItem('lgs_admin_user', email);
      _showAdmin(); _admCargarDashboard();
    } else {
      const d = userData||{};
      _auditLogin(email,'exito');
      window._currentRol = d.rol||'dueno';
      const nombreAsesor = d.asesor||email;
      const _resolverTiendas = snapT=>{
        const tiendaIds = Object.keys(snapT.val()||{});
        window._currentTiendaIds = tiendaIds;
        console.log('[LOGIN] tiendas:', tiendaIds, '| asesor:', d.asesor, '| tienda:', d.tienda);
        toast('🔍 tiendas:'+tiendaIds.length+' | asesor:"'+(d.asesor||'')+ '" | tienda:"'+(d.tienda||'')+'"', 8000);
        if(!tiendaIds.length){
          // Si el perfil ya tiene nombre y tienda (cuenta creada por admin), entrar directo
          if(d.asesor && d.tienda){
            toast('🚀 Entrando a la app...', 4000);
            _entrarApp(uid, d.tienda, d.asesor, null);
          } else {
            toast('⚠️ Falta asesor o tienda → pidiendo perfil', 6000);
            _pedirPerfil(uid, d.tienda||'');
          }
          return;
        }
        if(tiendaIds.length===1){
          _db.ref('empresas/'+tiendaIds[0]).once('value', snapE=>{
            _entrarApp(uid, (snapE.val()||{}).nombre||tiendaIds[0], nombreAsesor, tiendaIds[0]);
          });
        } else {
          _mostrarSelectorTienda(uid, nombreAsesor, tiendaIds);
        }
      };
      // Usar datos ya cargados si están disponibles (evita segunda lectura que puede colgarse)
      if(snapTiendasPrefetch){ _resolverTiendas(snapTiendasPrefetch); }
      else { _db.ref('user_tiendas/'+uid).once('value', _resolverTiendas); }
    }
  }

  // Mostrar selector de roles cuando una cuenta tiene varios
  function _mostrarSelectorRol(uid, email, roles, admData, userData){
    const ICONOS = { superadmin:'🛡️', admin:'🏢', dueno:'🏪', asesor:'👤' };
    const LABELS  = { superadmin:'Super Admin', admin:'Admin de negocios', dueno:'Dueño de tienda', asesor:'Asesor' };
    document.getElementById('rss-subtitle').textContent = email;
    document.getElementById('rss-lista').innerHTML = roles.map(r=>`
      <button class="mss-btn light" onclick="_entrarConRol('${uid}','${email}','${r}',null,null)">
        <div style="font-size:2rem;flex-shrink:0;">${ICONOS[r]||'👤'}</div>
        <div>
          <div style="font-size:.92rem;font-weight:700;">${LABELS[r]||r}</div>
          <div style="font-size:.7rem;color:var(--text-3);margin-top:3px;">Ingresar con este perfil</div>
        </div>
      </button>`).join('');
    // Guardar en caché para poder volver desde cualquier panel
    window._rolPendiente = { uid, email, roles, admData, userData };
    // Reescribir onclick con closure real
    document.getElementById('rss-lista').querySelectorAll('button').forEach((btn,i)=>{
      const r = roles[i];
      btn.onclick = ()=>_entrarConRol(uid, email, r, admData, userData);
    });
    document.getElementById('rol-select-screen').style.display='flex';
  }

  window._volverSelectorRol = function(){
    const p = window._rolPendiente;
    if(p && p.roles && p.roles.length > 1){
      document.getElementById('super-admin-panel').style.display='none';
      document.getElementById('admin-panel').classList.remove('visible');
      localStorage.removeItem(LOGIN_KEY);
      _mostrarSelectorRol(p.uid, p.email, p.roles, p.admData, p.userData);
      return;
    }
    // Si no hay caché (sesión restaurada directo), re-consultar Firebase
    const user = firebase.auth().currentUser;
    if(!user) return;
    const uid = user.uid; const email = user.email;
    Promise.all([
      _db.ref('config/superAdminUid').once('value'),
      _db.ref('admins/'+uid).once('value'),
      _db.ref('users/'+uid).once('value'),
      _db.ref('user_tiendas/'+uid).once('value')
    ]).then(([snapSA, snapAdm, snapUser, snapTiendas])=>{
      const roles = [];
      if(snapSA.val()===uid) roles.push('superadmin');
      if(snapAdm.exists()) roles.push('admin');
      const hasTiendas = snapTiendas.exists() && Object.keys(snapTiendas.val()||{}).length > 0;
      if(snapUser.exists()||hasTiendas) roles.push(((snapUser.val()||{}).rol||'dueno')==='dueno'?'dueno':'asesor');
      if(roles.length<=1){ toast('Solo tienes un perfil disponible'); return; }
      document.getElementById('super-admin-panel').style.display='none';
      document.getElementById('admin-panel').classList.remove('visible');
      localStorage.removeItem(LOGIN_KEY);
      _mostrarSelectorRol(uid, email, roles, snapAdm.val(), snapUser.val());
    });
  };

  window._cerrarSesionRol = function(){
    document.getElementById('rol-select-screen').style.display='none';
    firebase.auth().signOut().then(()=>{ _loginShow(); document.getElementById('login-user').focus(); });
  };

  window._loginCheck = function(){
    const email = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');
    err.classList.remove('show');
    document.getElementById('login-error-campos').classList.remove('show');
    if(!email||!p){ document.getElementById('login-error-campos').classList.add('show'); setTimeout(()=>document.getElementById('login-error-campos').classList.remove('show'),3000); return; }

    // Acceso de emergencia hardcodeado (solo para Super Admin sin cuenta Gmail aún)
    if(email === ADMIN_USER && p === ADMIN_PASS){
      firebase.auth().signInAnonymously().then(()=>{
        localStorage.setItem(LOGIN_KEY,'superadmin');
        _showSuperAdmin(); _superAdmCargar();
      });
      return;
    }

    const btn = document.querySelector('.login-btn');
    if(btn){ btn.disabled=true; btn.textContent='Verificando...'; }

    // Timeout de seguridad: si Firebase RTDB no responde en 12s, mostrar error
    let _loginDone = false;
    const _loginTimeout = setTimeout(()=>{
      if(_loginDone) return;
      _loginDone = true;
      if(btn){ btn.disabled=false; btn.textContent='Ingresar'; }
      err.textContent='Error de conexión con la base de datos. Recarga la página e intenta de nuevo.';
      err.classList.add('show');
      firebase.auth().signOut();
    }, 12000);

    firebase.auth().signInWithEmailAndPassword(email, p)
      .then(cred=>{
        const uid = cred.user.uid;
        // Leer solo users/uid para determinar el rol (lectura mínima)
        return _db.ref('users/'+uid).once('value').then(snapUser=>{
          // Verificar superAdmin y admin en paralelo sólo si es necesario
          return Promise.all([
            _db.ref('config/superAdminUid').once('value'),
            _db.ref('admins/'+uid).once('value'),
            _db.ref('user_tiendas/'+uid).once('value')
          ]).then(([snapSA, snapAdm, snapTiendas])=>{
            if(_loginDone) return; _loginDone = true;
            clearTimeout(_loginTimeout);
            if(btn){ btn.disabled=false; btn.textContent='Ingresar'; }
            const roles = [];
            if(snapSA.val() === uid) roles.push('superadmin');
            if(snapAdm.exists()) roles.push('admin');
            const hasTiendas = snapTiendas.exists() && Object.keys(snapTiendas.val()||{}).length > 0;
            if(snapUser.exists() || hasTiendas){
              const rol = (snapUser.val()||{}).rol||'dueno';
              roles.push(rol==='dueno'?'dueno':'asesor');
            }
            if(!roles.length){
              _auditLogin(email,'fallo_usuario');
              err.textContent='Cuenta no autorizada. Contacta al administrador.';
              err.classList.add('show');
              firebase.auth().signOut(); return;
            }
            console.log('[LOGIN] roles:', roles, '| user:', snapUser.val(), '| tiendas:', snapTiendas.val());
            toast('✅ ROL: '+roles.join(',')+' | user:'+(snapUser.exists()?'SI':'NO')+' tiendas:'+(snapTiendas.exists()?'SI':'NO'), 6000);
            _auditLogin(email,'exito');
            const admData = snapAdm.val();
            const userData = snapUser.val();
            try {
              if(roles.length === 1){
                _entrarConRol(uid, email, roles[0], admData, userData, snapTiendas);
              } else {
                _mostrarSelectorRol(uid, email, roles, admData, userData);
              }
            } catch(ex) {
              console.error('Error al entrar con rol:', ex);
              toast('❌ Error JS: '+ex.message, 10000);
            }
          });
        });
      })
      .catch(e=>{
        if(_loginDone) return; _loginDone = true;
        clearTimeout(_loginTimeout);
        if(btn){ btn.disabled=false; btn.textContent='Ingresar'; }
        let msg = 'Correo o contraseña incorrectos';
        if(e.code==='auth/user-not-found'||e.code==='auth/invalid-email') msg='Correo no registrado';
        else if(e.code==='auth/wrong-password'||e.code==='auth/invalid-credential') msg='Contraseña incorrecta';
        else if(e.code==='auth/too-many-requests') msg='Demasiados intentos. Intenta más tarde.';
        else msg='Error: '+(e.code||e.message||'desconocido');
        _auditLogin(email, (e.code==='auth/wrong-password'||e.code==='auth/invalid-credential')?'fallo_password':'fallo_usuario');
        err.textContent=msg; err.classList.add('show');
        document.getElementById('login-pass').value=''; document.getElementById('login-pass').focus();
      });
  };

  window.getLoginTienda = function(){ return localStorage.getItem(TIENDA_KEY) || ''; };
  window.getLoginAsesor = function(){ return localStorage.getItem(ASESOR_KEY) || ''; };

  window._cerrarSesion = function(){ document.getElementById('logout-modal').classList.add('open'); };
  window._logoutCancelar = function(){ document.getElementById('logout-modal').classList.remove('open'); };
  window._logoutConfirmar = function(){
    document.getElementById('logout-modal').classList.remove('open');
    _limpiarPresencia();
    [LOGIN_KEY,TIENDA_KEY,ASESOR_KEY,USER_KEY,'lgs_rol'].forEach(k=>localStorage.removeItem(k));
    window._currentRol=null;
    firebase.auth().signOut().then(()=>{ _loginShow(); document.getElementById('login-user').focus(); });
  };
  window._admLogout = function(){
    localStorage.removeItem(LOGIN_KEY);
    localStorage.removeItem('lgs_admin_id');
    localStorage.removeItem('lgs_admin_user');
    localStorage.removeItem('lgs_empresa_actual');
    document.getElementById('admin-panel').classList.remove('visible');
    firebase.auth().signOut().then(()=>{ _loginShow(); document.getElementById('login-user').focus(); });
  };
  window._superAdmLogout = function(){
    localStorage.removeItem(LOGIN_KEY);
    document.getElementById('super-admin-panel').style.display='none';
    firebase.auth().signOut().then(()=>{ _loginShow(); document.getElementById('login-user').focus(); });
  };

  window._mostrarSelectorTienda = function _mostrarSelectorTienda(username, nombreAsesor, tiendaIds){
    _db.ref('empresas').once('value', snapE=>{
      const todasEmpresas = snapE.val()||{};
      const lista = document.getElementById('tss-lista');
      document.getElementById('tss-subtitle').textContent = 'Hola '+nombreAsesor.split(' ')[0]+', selecciona la tienda para esta sesión';
      lista.innerHTML = '';
      tiendaIds.forEach(empId=>{
        const emp = todasEmpresas[empId]||{};
        const nombre = emp.nombre||empId;
        const btn = document.createElement('button');
        btn.className='mss-btn light';
        btn.innerHTML='<div style="font-size:2rem;flex-shrink:0;">🏪</div><div><div style="font-size:.92rem;font-weight:700;">'+nombre+'</div></div>';
        btn.onclick=()=>{
          document.getElementById('tienda-select-screen').style.display='none';
          _entrarApp(username, nombre, nombreAsesor, empId);
        };
        lista.appendChild(btn);
      });
      _loginHide();
      document.getElementById('tienda-select-screen').style.display='flex';
    });
  };

  ['login-user','login-pass'].forEach(function(id){
    document.getElementById(id).addEventListener('keydown', function(e){ if(e.key==='Enter') window._loginCheck(); });
  });
  document.getElementById('ls2-asesor').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('ls2-tienda').focus(); });
  document.getElementById('ls2-tienda').addEventListener('keydown', function(e){ if(e.key==='Enter') window._loginStep2Confirmar(); });

  // Al restaurar sesión directo (recarga de página) _rolPendiente no existe
  // todavía — se recalcula aquí para que "🎭 Cambiar perfil" siga apareciendo
  // si la cuenta tiene varios roles disponibles.
  function _refrescarBotonCambiarPerfil(uid, email){
    if(!uid) return;
    Promise.all([
      _db.ref('config/superAdminUid').once('value'),
      _db.ref('admins/'+uid).once('value'),
      _db.ref('users/'+uid).once('value'),
      _db.ref('user_tiendas/'+uid).once('value')
    ]).then(([snapSA, snapAdm, snapUser, snapTiendas])=>{
      const roles = [];
      if(snapSA.val()===uid) roles.push('superadmin');
      if(snapAdm.exists()) roles.push('admin');
      const hasTiendas = snapTiendas.exists() && Object.keys(snapTiendas.val()||{}).length > 0;
      if(snapUser.exists()||hasTiendas) roles.push(((snapUser.val()||{}).rol||'dueno')==='dueno'?'dueno':'asesor');
      const tieneMultiRol = roles.length > 1;
      ['btn-volver-roles-sa','btn-volver-roles-adm','btn-volver-roles-topnav','btn-volver-roles-tienda','btn-volver-roles-modeselect'].forEach(id=>{
        const b = document.getElementById(id);
        if(b) b.style.display = tieneMultiRol ? 'inline-block' : 'none';
      });
      if(tieneMultiRol) window._rolPendiente = { uid, email, roles, admData: snapAdm.val(), userData: snapUser.val() };
    });
  }

  // Restauración de sesión via Firebase Auth
  firebase.auth().onAuthStateChanged(user=>{
    _hideSplash();
    const savedSession = localStorage.getItem(LOGIN_KEY);
    if(!savedSession){ _loginShow(); document.getElementById('login-user').focus(); return; }
    if(savedSession==='superadmin'){ _showSuperAdmin(); _superAdmCargar(); if(user)_refrescarBotonCambiarPerfil(user.uid,user.email||''); return; }
    if(savedSession==='admin'){
      // Un admin en una página de módulo (las 3 declaran _PAGINA_MODULO en su
      // bootstrap; index.html no) abre ese módulo con la última tienda a la que
      // entró. Antes se caía siempre al Centro de Operaciones y los módulos
      // eran inalcanzables salvo pasando por 🏪 Tiendas → "Entrar a tienda".
      const tAdm = localStorage.getItem(TIENDA_KEY), aAdm = localStorage.getItem(ASESOR_KEY);
      if(window._PAGINA_MODULO && user && tAdm && aAdm){
        _loginHide();
        window._currentRol = localStorage.getItem('lgs_rol')||'dueno';
        window._currentTiendaId = localStorage.getItem('lgs_empresa_id')||null;
        _registrarPresencia(user.uid, tAdm, aAdm);
        _refrescarBotonCambiarPerfil(user.uid, user.email||'');
        window._gdMostrarModeSelect(aAdm);
        return;
      }
      // Sin tienda elegida no hay ruta de datos que leer (_gdTK/_gdAK caerían
      // en '_') y el módulo saldría vacío sin explicación: mejor quedarse en el
      // Centro de Operaciones y decir cómo entrar.
      if(window._PAGINA_MODULO){
        setTimeout(()=>toast('Para abrir '+window._PAGINA_MODULO+', entra primero a una tienda desde 🏪 Tiendas',4500),800);
      }
      _showAdmin(); _admCargarDashboard(); if(user)_refrescarBotonCambiarPerfil(user.uid,user.email||''); return;
    }
    if(!user){ _loginShow(); document.getElementById('login-user').focus(); return; }
    const uid = user.uid;
    const t = localStorage.getItem(TIENDA_KEY);
    const a = localStorage.getItem(ASESOR_KEY);
    _refrescarBotonCambiarPerfil(uid, user.email||'');
    if(t && a){
      _loginHide();
      window._currentRol = localStorage.getItem('lgs_rol')||'dueno';
      window._currentTiendaId = localStorage.getItem('lgs_empresa_id')||null;
      _registrarPresencia(uid, t, a);
      window._gdMostrarModeSelect(a);
    } else {
      _db.ref('users/'+uid).once('value', snap=>{
        if(!snap.exists()){ firebase.auth().signOut(); return; }
        const d = snap.val();
        window._currentRol = d.rol||'dueno';
        if(d.asesor && d.tienda){
          _entrarApp(uid, d.tienda, d.asesor, null);
        } else {
          _pedirPerfil(uid, d.tienda||'');
        }
      });
    }
  });
}

// ===== REGISTRO DE ADMIN =====
window._mostrarRegistro = function(){
  document.getElementById('registro-modal').style.display='flex';
  document.getElementById('reg-user').focus();
};
window._ocultarRegistro = function(){
  document.getElementById('registro-modal').style.display='none';
  ['reg-user','reg-pass','reg-pass2'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('reg-error').style.display='none';
};
window._registrarAdmin = function(){
  const email=document.getElementById('reg-user').value.trim();
  const p=document.getElementById('reg-pass').value;
  const p2=document.getElementById('reg-pass2').value;
  const err=document.getElementById('reg-error');
  err.style.display='none';
  if(!email||!p||!p2){err.textContent='Completa todos los campos';err.style.display='block';return;}
  if(!email.includes('@')){err.textContent='Ingresa un correo electrónico válido';err.style.display='block';return;}
  if(p!==p2){err.textContent='Las contraseñas no coinciden';err.style.display='block';return;}
  if(p.length<6){err.textContent='La contraseña debe tener al menos 6 caracteres';err.style.display='block';return;}
  firebase.auth().createUserWithEmailAndPassword(email, p)
    .then(cred=>{
      const uid=cred.user.uid;
      return _db.ref('admins/'+uid).set({email, username:email, createdAt:Date.now()});
    })
    .then(()=>{
      _ocultarRegistro();
      const uid=firebase.auth().currentUser.uid;
      localStorage.setItem('lgs_auth','admin');
      localStorage.setItem('lgs_admin_id', uid);
      localStorage.setItem('lgs_admin_user', email);
      document.getElementById('login-screen').classList.add('hidden');
      _showAdminGlobal(); _admCargarDashboard();
    })
    .catch(e=>{
      let msg='Error al crear cuenta: '+e.message;
      if(e.code==='auth/email-already-in-use') msg='Ese correo ya está registrado';
      else if(e.code==='auth/invalid-email') msg='Correo inválido';
      err.textContent=msg; err.style.display='block';
    });
};

// ===== SUPER ADMIN CARGAR =====
let _saData = null; // cache de datos cargados

// ===== MIGRACIÓN DE USUARIOS VIEJOS =====
function _esUidFirebase(key){ return /^[A-Za-z0-9]{20,}$/.test(key) && /[A-Z]/.test(key) && /[0-9]/.test(key); }

window._migCargar = function(){
  const modal = document.getElementById('modal-migracion');
  modal.style.display = 'flex';
  document.getElementById('mig-lista').innerHTML = '';
  document.getElementById('mig-log').style.display = 'none';
  document.getElementById('mig-loading').style.display = 'block';
  _db.ref('users').once('value', snap=>{
    const users = snap.val()||{};
    const viejos = Object.entries(users).filter(([key])=>!_esUidFirebase(key));
    document.getElementById('mig-loading').style.display = 'none';
    if(!viejos.length){
      document.getElementById('mig-lista').innerHTML = '<div style="text-align:center;color:#10b981;padding:20px;font-size:.82rem;">✅ No hay usuarios en formato antiguo. Todos ya migrados.</div>';
      return;
    }
    document.getElementById('mig-lista').innerHTML = viejos.map(([key, u])=>`
      <div id="mig-row-${key}" style="border:1.5px solid var(--border);border-radius:10px;padding:14px 16px;background:var(--bg-hover);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:34px;height:34px;border-radius:8px;background:#131920;display:flex;align-items:center;justify-content:center;color:white;font-size:.75rem;font-weight:800;flex-shrink:0;">${(u.asesor||key).slice(0,2).toUpperCase()}</div>
          <div>
            <div style="font-weight:700;font-size:.82rem;color:var(--text-1);">${u.asesor||key}</div>
            <div style="font-size:.68rem;color:var(--text-3);">Clave antigua: <code>${key}</code> · Rol: ${u.rol||'asesor'}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input id="mig-email-${key}" type="email" placeholder="correo@gmail.com" style="flex:1;min-width:160px;padding:7px 11px;border:1.5px solid #d6d2cc;border-radius:8px;font-size:.75rem;outline:none;font-family:inherit;"/>
          <input id="mig-pass-${key}" type="password" placeholder="Contraseña temporal (mín. 6 caracteres)" style="flex:1;min-width:160px;padding:7px 11px;border:1.5px solid #d6d2cc;border-radius:8px;font-size:.75rem;outline:none;font-family:inherit;"/>
          <button onclick="_migUsuario('${key}')" style="background:#131920;color:white;border:none;border-radius:8px;padding:7px 16px;font-size:.74rem;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit;">Migrar →</button>
        </div>
      </div>`).join('');
  });
};

window._migUsuario = async function(oldKey){
  const email = (document.getElementById('mig-email-'+oldKey)||{}).value?.trim();
  const pass  = (document.getElementById('mig-pass-'+oldKey)||{}).value;
  const log   = document.getElementById('mig-log');
  const row   = document.getElementById('mig-row-'+oldKey);
  if(!email||!pass){ toast('⚠️ Ingresa correo y contraseña'); return; }
  if(pass.length<6){ toast('⚠️ La contraseña debe tener mínimo 6 caracteres'); return; }

  log.style.display = 'block';
  const _log = msg=>{ log.innerHTML += '• '+msg+'<br>'; log.scrollTop=9999; };
  const btn = row.querySelector('button');
  btn.disabled=true; btn.textContent='Migrando...';

  try{
    _log('Creando cuenta Firebase Auth para '+email+'...');
    const cred = await window._fbSecAuth.createUserWithEmailAndPassword(email, pass);
    const newUid = cred.user.uid;
    _log('✅ Cuenta creada — UID: '+newUid);

    const [snapUser, snapTiendas, snapEA, snapPresence] = await Promise.all([
      _db.ref('users/'+oldKey).once('value'),
      _db.ref('user_tiendas/'+oldKey).once('value'),
      _db.ref('empresa_asesores').once('value'),
      _db.ref('presence/'+oldKey).once('value')
    ]);

    // Copiar perfil de usuario
    const userData = snapUser.val()||{};
    userData.email = email;
    await _db.ref('users/'+newUid).set(userData);
    _log('✅ Perfil copiado a /users/'+newUid);

    // Copiar user_tiendas
    const tiendas = snapTiendas.val()||{};
    if(Object.keys(tiendas).length){
      await _db.ref('user_tiendas/'+newUid).set(tiendas);
      _log('✅ Tiendas copiadas: '+Object.keys(tiendas).join(', '));
    }

    // Actualizar empresa_asesores
    const eaUpdates = {};
    Object.entries(snapEA.val()||{}).forEach(([empId, asesores])=>{
      if(asesores[oldKey]!==undefined){
        eaUpdates['empresa_asesores/'+empId+'/'+newUid] = true;
        eaUpdates['empresa_asesores/'+empId+'/'+oldKey] = null;
      }
    });
    if(Object.keys(eaUpdates).length){ await _db.ref().update(eaUpdates); _log('✅ Empresa_asesores actualizado'); }

    // Migrar historial_diario directo (usuario como dueño/tienda)
    const snapHDirect = await _db.ref('historial_diario/'+oldKey).once('value');
    if(snapHDirect.exists()){
      await _db.ref('historial_diario/'+newUid).set(snapHDirect.val());
      await _db.ref('historial_diario/'+oldKey).remove();
      _log('✅ Historial propio migrado (historial_diario/'+oldKey+' → '+newUid+')');
    }

    // Migrar historial_diario como asesor dentro de otras tiendas
    const snapEAAll = await _db.ref('empresa_asesores').once('value');
    for(const [tiendaId] of Object.entries(snapEAAll.val()||{})){
      const snapH = await _db.ref('historial_diario/'+tiendaId+'/'+oldKey).once('value');
      if(snapH.exists()){
        await _db.ref('historial_diario/'+tiendaId+'/'+newUid).set(snapH.val());
        await _db.ref('historial_diario/'+tiendaId+'/'+oldKey).remove();
        _log('✅ Historial como asesor migrado en tienda '+tiendaId);
      }
    }

    // Migrar gestiones_sync → a la empresa (tienda) del usuario, no al UID personal
    const snapGS = await _db.ref('gestiones_sync/'+oldKey).once('value');
    if(snapGS.exists()){
      const tiendaIds = Object.keys(tiendas);
      if(tiendaIds.length === 1){
        await _db.ref('gestiones_sync/'+tiendaIds[0]).update(snapGS.val());
        _log('✅ Gestiones sync migradas a empresa '+tiendaIds[0]);
      } else if(tiendaIds.length > 1){
        // Varios tiendas: mover al primero (más común: una tienda por dueño)
        await _db.ref('gestiones_sync/'+tiendaIds[0]).update(snapGS.val());
        _log('✅ Gestiones sync migradas a empresa '+tiendaIds[0]+' (múltiples tiendas — verifica manualmente)');
      } else {
        // Sin tienda asignada todavía: dejar bajo newUid como fallback
        await _db.ref('gestiones_sync/'+newUid).set(snapGS.val());
        _log('⚠️ Sin tienda asignada — gestiones sync temporalmente en '+newUid);
      }
      await _db.ref('gestiones_sync/'+oldKey).remove();
    }

    // Eliminar datos viejos
    await Promise.all([
      _db.ref('users/'+oldKey).remove(),
      _db.ref('user_tiendas/'+oldKey).remove(),
      _db.ref('presence/'+oldKey).remove()
    ]);
    _log('✅ Datos antiguos eliminados');

    // Enviar email de reset para que el asesor cambie su contraseña
    await firebase.auth().sendPasswordResetEmail(email);
    _log('📧 Email de cambio de contraseña enviado a '+email);

    await window._fbSecAuth.signOut();

    row.style.background = '#f0fdf4';
    row.style.borderColor = '#86efac';
    row.innerHTML = '<div style="color:var(--success);font-size:.8rem;font-weight:700;padding:4px 0;">✅ '+email+' migrado correctamente → UID: '+newUid+'</div>';
    _log('🎉 Migración de '+oldKey+' completada');

  } catch(e){
    _log('❌ Error: '+e.message);
    btn.disabled=false; btn.textContent='Reintentar';
    toast('⚠️ Error: '+e.message);
  }
};

window._migRecuperar = async function(){
  const oldKey = (document.getElementById('mig-rec-oldkey').value||'').trim();
  const newUid = (document.getElementById('mig-rec-newuid').value||'').trim();
  const log = document.getElementById('mig-rec-log');
  if(!oldKey||!newUid){ alert('Ingresa la clave antigua y el UID nuevo'); return; }
  log.style.display='block';
  log.innerHTML = '';
  const _log = msg=>{ log.innerHTML += '• '+msg+'<br>'; log.scrollTop=9999; };
  _log('🔍 Buscando datos bajo la clave "'+oldKey+'"...');
  try{

  // historial_diario directo (como dueño)
  const snapHD = await _db.ref('historial_diario/'+oldKey).once('value');
  if(snapHD.exists()){
    await _db.ref('historial_diario/'+newUid).update(snapHD.val());
    await _db.ref('historial_diario/'+oldKey).remove();
    _log('✅ Historial propio recuperado ('+Object.keys(snapHD.val()).length+' entradas)');
  } else { _log('ℹ️ Sin historial directo en historial_diario/'+oldKey); }

  // historial_diario como asesor en otras tiendas
  const snapEA = await _db.ref('empresa_asesores').once('value');
  for(const tiendaId of Object.keys(snapEA.val()||{})){
    const snapH = await _db.ref('historial_diario/'+tiendaId+'/'+oldKey).once('value');
    if(snapH.exists()){
      await _db.ref('historial_diario/'+tiendaId+'/'+newUid).update(snapH.val());
      await _db.ref('historial_diario/'+tiendaId+'/'+oldKey).remove();
      _log('✅ Historial como asesor recuperado en tienda '+tiendaId);
    }
  }

  // gestiones_sync → mover a la empresa del usuario, no al UID personal
  const snapGS = await _db.ref('gestiones_sync/'+oldKey).once('value');
  const snapUTR = await _db.ref('user_tiendas/'+newUid).once('value');
  const empIdsR = Object.keys(snapUTR.val()||{});
  if(snapGS.exists()){
    const destGS = empIdsR.length >= 1 ? empIdsR[0] : newUid;
    await _db.ref('gestiones_sync/'+destGS).update(snapGS.val());
    await _db.ref('gestiones_sync/'+oldKey).remove();
    _log('✅ Gestiones sync recuperadas → empresa '+destGS);
  } else {
    // Buscar si ya hay gestiones bajo el UID (del fallback anterior) y mover a empresa
    if(empIdsR.length >= 1){
      const snapGSUid = await _db.ref('gestiones_sync/'+newUid).once('value');
      if(snapGSUid.exists()){
        await _db.ref('gestiones_sync/'+empIdsR[0]).update(snapGSUid.val());
        await _db.ref('gestiones_sync/'+newUid).remove();
        _log('✅ Gestiones sync movidas de UID a empresa '+empIdsR[0]);
      } else { _log('ℹ️ Sin gestiones_sync para recuperar'); }
    } else { _log('ℹ️ Sin gestiones_sync bajo "'+oldKey+'"'); }
  }

  // user_tiendas
  const snapUT = await _db.ref('user_tiendas/'+oldKey).once('value');
  if(snapUT.exists()){
    await _db.ref('user_tiendas/'+newUid).update(snapUT.val());
    await _db.ref('user_tiendas/'+oldKey).remove();
    _log('✅ user_tiendas recuperado');
  }

  // empresa_asesores: reemplazar oldKey por newUid
  const eaUpdates = {};
  Object.entries(snapEA.val()||{}).forEach(([empId, asesores])=>{
    if(asesores[oldKey]!==undefined){
      eaUpdates['empresa_asesores/'+empId+'/'+newUid] = true;
      eaUpdates['empresa_asesores/'+empId+'/'+oldKey] = null;
    }
  });
  if(Object.keys(eaUpdates).length){ await _db.ref().update(eaUpdates); _log('✅ empresa_asesores actualizado'); }

  _log('🎉 Recuperación completada. Datos de "'+oldKey+'" movidos a UID '+newUid);
  alert('✅ Recuperación completada correctamente');
  } catch(err){
    console.error('_migRecuperar error:', err);
    _log('❌ Error: '+(err.message||err));
  }
};

// --- Designar Super Admin Gmail ---
window._saDesignarSuperAdmin = function(){
  const emailBuscar = document.getElementById('sa-superadmin-email').value.trim();
  if(!emailBuscar){ toast('⚠️ Ingresa un correo'); return; }
  // Buscar en /admins por email
  _db.ref('admins').once('value', snap=>{
    const found = Object.entries(snap.val()||{}).find(([uid,d])=>d.email===emailBuscar);
    if(!found){
      // Buscar en /users también
      _db.ref('users').once('value', snapU=>{
        const foundU = Object.entries(snapU.val()||{}).find(([uid,d])=>d.email===emailBuscar);
        if(!foundU){ toast('⚠️ No se encontró ninguna cuenta con ese correo'); return; }
        _db.ref('config/superAdminUid').set(foundU[0]).then(()=>{
          toast('✅ '+emailBuscar+' designado como Super Admin');
          document.getElementById('sa-superadmin-actual').textContent='Super Admin actual: '+emailBuscar+' ('+foundU[0]+')';
        });
      });
      return;
    }
    _db.ref('config/superAdminUid').set(found[0]).then(()=>{
      toast('✅ '+emailBuscar+' designado como Super Admin');
      document.getElementById('sa-superadmin-actual').textContent='Super Admin actual: '+emailBuscar+' ('+found[0]+')';
    });
  });
};

window._saQuitarSuperAdmin = function(){
  if(!confirm('¿Quitar la cuenta Gmail de Super Admin?')) return;
  _db.ref('config/superAdminUid').remove().then(()=>{
    toast('✅ Vinculación de Super Admin eliminada');
    document.getElementById('sa-superadmin-actual').textContent='Sin cuenta Gmail vinculada como Super Admin';
    document.getElementById('sa-superadmin-email').value='';
  });
};

function _superAdmCargar(){
  const tree = document.getElementById('sa-tree');
  tree.innerHTML = '<div class="adm-empty">Cargando...</div>';
  // Cargar estado actual de Super Admin Gmail
  _db.ref('config/superAdminUid').once('value', snapSA=>{
    const saUid = snapSA.val();
    const saDiv = document.getElementById('sa-superadmin-actual');
    if(saUid){
      _db.ref('admins/'+saUid).once('value', sn=>{
        const e = (sn.val()||{}).email||'';
        if(!e) _db.ref('users/'+saUid).once('value', sn2=>{
          saDiv.textContent='Super Admin actual: '+((sn2.val()||{}).email||saUid);
        }); else saDiv.textContent='Super Admin actual: '+e;
      });
    } else {
      saDiv.textContent='Sin cuenta Gmail vinculada como Super Admin';
    }
  });

  Promise.all([
    _db.ref('admins').once('value'),
    _db.ref('empresas').once('value'),
    _db.ref('admin_empresas').once('value'),
    _db.ref('empresa_asesores').once('value'),
    _db.ref('users').once('value'),
    _db.ref('presence').once('value')
  ]).then(([snapAdmins, snapEmpresas, snapAE, snapEAs, snapUsers, snapPresence])=>{
    const admins         = snapAdmins.val()||{};
    const empresas       = snapEmpresas.val()||{};
    const adminEmpresas  = snapAE.val()||{};
    const empresaAsesores= snapEAs.val()||{};
    const users          = snapUsers.val()||{};
    const presencia      = snapPresence.val()||{};

    const totalOnline = Object.values(presencia).filter(p=>p.online&&(Date.now()-(p.lastSeen||0))<120000).length;
    document.getElementById('sa-stat-admins').textContent  = Object.keys(admins).length;
    document.getElementById('sa-stat-empresas').textContent = Object.keys(empresas).length;
    document.getElementById('sa-stat-asesores').textContent = Object.keys(users).length;
    document.getElementById('sa-stat-online').textContent   = totalOnline;

    // Construir estructura de datos enriquecida
    const usersArr = Object.entries(users).map(([uid,d])=>({uid,...d}));
    _saData = Object.entries(admins).map(([adminId, adminData])=>{
      const misEmpresasIds = Object.keys(adminEmpresas[adminId]||{});
      let totalAsesores = 0;
      const misEmpresas = misEmpresasIds.map(empId=>{
        const emp = empresas[empId];
        if(!emp) return null;
        const asesorKeys = Object.keys(empresaAsesores[empId]||{});
        const asesores = asesorKeys.map(ukey=>{
          const u = usersArr.find(x=>x.uid===ukey);
          const online = !!(presencia[ukey]||{}).online && (Date.now()-((presencia[ukey]||{}).lastSeen||0))<120000;
          return { nombre: u?(u.asesor||u.email||ukey):ukey, user: ukey, online };
        });
        totalAsesores += asesores.length;
        return { empId, nombre: emp.nombre, createdAt: emp.createdAt||0, asesores };
      }).filter(Boolean);
      return {
        adminId,
        username: adminData.username||'',
        email: adminData.email||null,
        createdAt: adminData.createdAt||0,
        empresas: misEmpresas,
        totalEmpresas: misEmpresas.length,
        totalAsesores
      };
    });

    _saFiltrar();
  }).catch(err=>{
    tree.innerHTML='<div class="adm-empty" style="color:var(--danger);">⚠️ Error cargando datos: '+err.message+'</div>';
  });
}

function _saFiltrar(){
  if(!_saData) return;
  const q      = (document.getElementById('sa-search')||{value:''}).value.toLowerCase();
  const sort   = (document.getElementById('sa-sort')||{value:'reciente'}).value;
  const filtro = (document.getElementById('sa-filtro')||{value:'todos'}).value;

  let lista = _saData.filter(a=>{
    // Filtro de categoría
    if(filtro==='con-empresas'  && a.totalEmpresas===0) return false;
    if(filtro==='sin-empresas'  && a.totalEmpresas>0)   return false;
    if(filtro==='con-asesores'  && a.totalAsesores===0) return false;
    if(filtro==='sin-asesores'  && a.totalAsesores>0)   return false;
    // Búsqueda de texto
    if(q){
      const matchAdmin = a.username.toLowerCase().includes(q);
      const matchEmpresa = a.empresas.some(e=>e.nombre.toLowerCase().includes(q));
      const matchAsesor = a.empresas.some(e=>e.asesores.some(as=>as.nombre.toLowerCase().includes(q)||as.user.toLowerCase().includes(q)));
      if(!matchAdmin && !matchEmpresa && !matchAsesor) return false;
    }
    return true;
  });

  // Ordenamiento
  lista.sort((a,b)=>{
    if(sort==='reciente')    return b.createdAt - a.createdAt;
    if(sort==='antiguo')     return a.createdAt - b.createdAt;
    if(sort==='az')          return a.username.localeCompare(b.username);
    if(sort==='za')          return b.username.localeCompare(a.username);
    if(sort==='mas-empresas')return b.totalEmpresas - a.totalEmpresas;
    if(sort==='mas-asesores')return b.totalAsesores - a.totalAsesores;
    return 0;
  });

  const label = document.getElementById('sa-results-label');
  if(label) label.textContent = lista.length+' administrador'+(lista.length!==1?'es':'')+' encontrado'+(lista.length!==1?'s':'');

  const tree = document.getElementById('sa-tree');
  tree.innerHTML = '';
  if(!lista.length){
    tree.innerHTML='<div class="adm-empty">No se encontraron resultados</div>';
    return;
  }
  lista.forEach(a=>tree.appendChild(_saBuildCard(a, q)));
}

function _saBuildCard(a, q){
  const card = document.createElement('div');
  card.style.cssText='background:var(--bg-card);border-radius:14px;border:1.5px solid var(--border);overflow:hidden;';
  card.dataset.adminId = a.adminId;

  const fechaReg = a.createdAt ? new Date(a.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : 'Sin fecha';
  const initials = (a.username||'?').slice(0,2).toUpperCase();

  // Header del admin (clickeable para expandir/colapsar)
  const headerDiv = document.createElement('div');
  headerDiv.style.cssText='padding:14px 20px;background:var(--bg-hover);display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;transition:background .15s;';
  headerDiv.onmouseenter=()=>headerDiv.style.background='var(--bg-elevated)';
  headerDiv.onmouseleave=()=>headerDiv.style.background='var(--bg-hover)';

  const onlineAsesores = a.empresas.reduce((s,e)=>s+e.asesores.filter(x=>x.online).length,0);
  headerDiv.innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
      <div style="width:36px;height:36px;background:#131920;border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-size:.88rem;font-weight:800;flex-shrink:0;">${initials}</div>
      <div style="min-width:0;">
        <div style="font-weight:800;color:var(--text-1);font-size:.88rem;">@${a.username}</div>
        <div style="color:var(--text-3);font-size:.62rem;margin-top:2px;">
          🏪 ${a.totalEmpresas} tienda${a.totalEmpresas!==1?'s':''} &nbsp;·&nbsp; 👥 ${a.totalAsesores} asesor${a.totalAsesores!==1?'es':''}
          ${onlineAsesores?'&nbsp;·&nbsp; <span style="color:var(--success);font-weight:700;">🟢 '+onlineAsesores+' en línea</span>':''}
          &nbsp;·&nbsp; Registrado ${fechaReg}
          ${a.email?'&nbsp;·&nbsp; ✉️ '+a.email:''}
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
      <button class="sa-adm-act" data-act="edit" title="Editar usuario" style="background:none;border:1px solid var(--border-strong);color:var(--text-2);border-radius:6px;padding:5px 8px;font-size:.75rem;cursor:pointer;line-height:1;">✏️</button>
      ${a.email?'<button class="sa-adm-act" data-act="reset" title="Enviar restablecimiento de contraseña" style="background:none;border:1px solid var(--border-strong);color:var(--text-2);border-radius:6px;padding:5px 8px;font-size:.75rem;cursor:pointer;line-height:1;">🔑</button>':''}
      <button class="sa-adm-act" data-act="delete" title="Eliminar administrador" style="background:none;border:1px solid rgba(230,57,70,.4);color:var(--danger);border-radius:6px;padding:5px 8px;font-size:.75rem;cursor:pointer;line-height:1;">🗑️</button>
      <div class="sa-chevron" style="color:var(--text-3);font-size:.9rem;transition:transform .2s;margin-left:2px;">▼</div>
    </div>`;

  headerDiv.querySelectorAll('.sa-adm-act').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      const act = btn.dataset.act;
      if(act==='edit')   _saEditarUsuario(a.adminId, a.username, a.email);
      if(act==='reset')  _saResetPassword(a.email);
      if(act==='delete') _saEliminarAdmin(a.adminId, a.username);
    };
  });

  // Body desplegable
  const bodyDiv = document.createElement('div');
  bodyDiv.style.cssText='display:none;';

  if(!a.empresas.length){
    bodyDiv.innerHTML='<div style="padding:12px 20px 14px;color:var(--text-3);font-size:.75rem;font-style:italic;">Sin tiendas creadas</div>';
  } else {
    a.empresas.forEach(emp=>{
      const empSection = document.createElement('div');
      empSection.style.cssText='border-top:1px solid var(--border);';

      const empHeader = document.createElement('div');
      empHeader.style.cssText='padding:10px 20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;';
      empHeader.onmouseenter=()=>empHeader.style.background='var(--bg-hover)';
      empHeader.onmouseleave=()=>empHeader.style.background='';

      const onlineEmp = emp.asesores.filter(x=>x.online).length;
      empHeader.innerHTML=`
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:.8rem;font-weight:700;color:var(--text-1);">🏢 ${emp.nombre}</span>
          <span style="background:var(--bg-inset);color:var(--text-2);font-size:.6rem;font-weight:700;padding:2px 7px;border-radius:8px;">${emp.asesores.length}</span>
          ${onlineEmp?'<span style="background:var(--success-soft);color:var(--success);font-size:.58rem;font-weight:700;padding:2px 7px;border-radius:8px;">'+onlineEmp+' online</span>':''}
        </div>
        <span class="sa-emp-chevron" style="color:var(--text-3);font-size:.75rem;transition:transform .2s;">▸</span>`;

      const empBody = document.createElement('div');
      empBody.style.cssText='display:none;padding:8px 20px 12px;';

      if(!emp.asesores.length){
        empBody.innerHTML='<div style="color:var(--text-3);font-size:.72rem;font-style:italic;">Sin asesores asignados</div>';
      } else {
        empBody.innerHTML='<div style="display:flex;flex-direction:column;gap:5px;">'
          +emp.asesores.map(as=>`
            <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border);">
              <div style="width:28px;height:28px;border-radius:8px;background:${as.online?'#16a34a':'#1e293b'};display:flex;align-items:center;justify-content:center;color:white;font-size:.66rem;font-weight:800;flex-shrink:0;">${as.nombre.slice(0,2).toUpperCase()}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:.77rem;font-weight:700;color:var(--text-1);">${as.nombre}</div>
                <div style="font-size:.63rem;color:var(--text-3);">@${as.user}</div>
              </div>
              ${as.online?'<span style="background:var(--success-soft);color:var(--success);font-size:.58rem;font-weight:700;padding:2px 8px;border-radius:8px;white-space:nowrap;">🟢 En línea</span>':''}
            </div>`).join('')
          +'</div>';
      }

      // Toggle empresa
      empHeader.onclick=()=>{
        const open = empBody.style.display==='block';
        empBody.style.display = open?'none':'block';
        empHeader.querySelector('.sa-emp-chevron').style.transform = open?'':'rotate(90deg)';
      };

      empSection.appendChild(empHeader);
      empSection.appendChild(empBody);
      bodyDiv.appendChild(empSection);
    });
  }

  // Toggle admin card
  headerDiv.onclick=()=>{
    const open = bodyDiv.style.display==='block';
    bodyDiv.style.display = open?'none':'block';
    headerDiv.querySelector('.sa-chevron').style.transform = open?'':'rotate(180deg)';
  };

  card.appendChild(headerDiv);
  card.appendChild(bodyDiv);
  return card;
}

// ── Acciones sobre administradores (Super Admin) ────────────────────────
let _meaAdminId = null;

window._saEditarUsuario = function(adminId, actual, email){
  _meaAdminId = adminId;
  document.getElementById('mea-username').value = actual||'';
  document.getElementById('mea-email-row').textContent = email ? '✉️ Correo de acceso (no editable aquí): '+email : '';
  document.getElementById('mea-error').style.display='none';
  document.getElementById('modal-editar-admin').classList.add('open');
  setTimeout(()=>document.getElementById('mea-username').focus(),100);
};
window._meaCerrar = function(){
  document.getElementById('modal-editar-admin').classList.remove('open');
  _meaAdminId = null;
};
window._meaGuardar = function(){
  const nuevo = document.getElementById('mea-username').value.trim();
  const err = document.getElementById('mea-error');
  if(!nuevo){ err.textContent='Escribe un usuario válido'; err.style.display='block'; return; }
  if(!_meaAdminId) return;
  _db.ref('admins/'+_meaAdminId+'/username').set(nuevo).then(()=>{
    _meaCerrar();
    toast('✅ Usuario actualizado');
    _superAdmCargar();
  }).catch(e=>{ err.textContent='Error: '+e.message; err.style.display='block'; });
};

// La contraseña real de Firebase Auth de OTRO usuario no se puede cambiar
// desde el cliente sin un backend con privilegios (Admin SDK) — por eso se
// envía un correo de restablecimiento estándar de Firebase.
window._saResetPassword = function(email){
  if(!email) return;
  _mConfirm('¿Enviar restablecimiento de contraseña?','Se enviará un correo a '+email+' con un enlace para que el administrador defina una nueva contraseña.',()=>{
    firebase.auth().sendPasswordResetEmail(email)
      .then(()=>toast('✅ Correo de restablecimiento enviado a '+email))
      .catch(e=>toast('⚠️ Error: '+e.message));
  });
};

// Revoca el acceso de administrador SIN borrar sus tiendas/asesores/datos
// (quedan intactos para reasignarlos a otro admin si hace falta)
window._saEliminarAdmin = function(adminId, username){
  _mConfirm('¿Eliminar a @'+username+'?','Se revocará su acceso de administrador. Sus tiendas, asesores y datos de gestión NO se eliminan — quedan intactos por si necesitas reasignarlos a otro admin.',()=>{
    _db.ref('admins/'+adminId).remove().then(()=>{
      toast('🗑️ Administrador eliminado');
      _superAdmCargar();
    });
  },'danger');
};

function _saExpandirTodos(expandir){
  document.querySelectorAll('#sa-tree .sa-chevron').forEach(ch=>{
    const header = ch.closest('div[style*="cursor:pointer"]');
    const body   = header?.nextElementSibling;
    if(!body) return;
    body.style.display = expandir?'block':'none';
    ch.style.transform  = expandir?'rotate(180deg)':'';
  });
}

// Referencia global a _showAdmin para usar fuera de _initLogin
function _showAdminGlobal(){
  document.getElementById('admin-panel').classList.add('visible');
  document.getElementById('login-screen').classList.add('hidden');
}

// ===== MIGRACIÓN INICIAL =====
function _migracionInicial(){
  // Asegurar que el admin 3DCompanyadmin existe
  _db.ref('admins').orderByChild('username').equalTo('3DCompanyadmin').once('value', snapAdm=>{
    const _asignarUsuarios = (empresaId)=>{
      // Siempre re-sincronizar todos los usuarios existentes a 3D Company
      _db.ref('users').once('value', snapUsers=>{
        const batch = {};
        Object.keys(snapUsers.val()||{}).forEach(uid=>{
          batch[uid] = true;
        });
        if(Object.keys(batch).length) _db.ref('empresa_asesores/'+empresaId).update(batch);
      });
    };

    const _asegurarEmpresa = (adminId)=>{
      _db.ref('admin_empresas/'+adminId).once('value', snapAE=>{
        const misEmpresas = Object.keys(snapAE.val()||{});
        if(misEmpresas.length){
          // Empresa ya existe — solo sincronizar asesores
          _asignarUsuarios(misEmpresas[0]);
        } else {
          // Crear empresa 3D Company
          const empRef = _db.ref('empresas').push();
          empRef.set({nombre:'3D Company', creadoPor:adminId, createdAt:Date.now()}).then(()=>{
            _db.ref('admin_empresas/'+adminId+'/'+empRef.key).set(true);
            _asignarUsuarios(empRef.key);
          });
        }
      });
    };

    if(snapAdm.exists()){
      let adminId;
      snapAdm.forEach(c=>{ adminId=c.key; });
      _asegurarEmpresa(adminId);
    } else {
      const admRef = _db.ref('admins').push();
      admRef.set({username:'3DCompanyadmin', password:'3DCompanyadmin', createdAt:Date.now()}).then(()=>{
        _asegurarEmpresa(admRef.key);
      });
    }
  });
}

_initLogin(); _migracionInicial();

// ===== FIREBASE SYNC GESTIONES =====
function _fbKey(k){ return String(k).replace(/[.#$\[\]\/]/g,'_'); }

// Calcula métricas de gestiones en un solo loop (evita 18 llamadas .filter separadas)
function _calcMetricas(){
  let contestaron=0,noContestaron=0,waEnviados=0,finalizados=0,devoluciones=0,
      guiasSinGestion=0,transitoSinGestion=0,rechazadosGestionados=0,rechazadosSinGestion=0,total=0;
  Object.values(gestiones).forEach(x=>{
    if(x.llamada==='contestó') contestaron++;
    else if(x.llamada==='no_contestó') noContestaron++;
    if(x.wa_enviado) waEnviados++;
    if(x.gestion_final) finalizados++;
    if(x.devolucion) devoluciones++;
    if(x.guia_generada_hoy) guiasSinGestion++;
    if(x.transito_sin_gestion) transitoSinGestion++;
    if(x.rechazado_gestionado) rechazadosGestionados++;
    if(x.rechazado_sin_gestion) rechazadosSinGestion++;
    if(x.llamada||x.wa_enviado||x.gestion_final) total++;
  });
  return{contestaron,noContestaron,waEnviados,finalizados,devoluciones,
         guiasSinGestion,transitoSinGestion,rechazadosGestionados,rechazadosSinGestion,total};
}

let _fbSyncPresTimer=null;
let _fbHistTimer=null;
let _cachedLoginTime=null; // loginTime cacheado localmente para evitar lectura Firebase por acción

function _fbSyncGestion(id){
  if(typeof _db==='undefined'||!window._currentUsername)return;
  const p=_pedidoMap.get(id);
  if(!p||!p.dropiId)return;
  const g=Object.assign({},gestiones[id]||{});
  delete g.mensajes_listos;
  g._ts=Date.now();
  if(p.guia)    g._guia=p.guia;
  if(p.nombre)  g._nombre=p.nombre;
  if(p.telefono) g._tel=p.telefono.replace(/^57/,'');
  if(p.ciudad)  g._ciudad=p.ciudad;
  const _asesorActual = window.getLoginAsesor ? window.getLoginAsesor() : '';
  if(_asesorActual) g._asesor = _asesorActual;
  _db.ref('gestiones_sync/'+_gsKey()+'/'+_fbKey(p.dropiId)).update(g);
  // Actualizar presence con label de acción (inmediato) y métricas (debounced 3s)
  const g0=gestiones[id]||{};
  let _actLabel='🔄 Gestionando pedido';
  if(g0.gestion_final)_actLabel='🏁 Finalizó pedido';
  else if(g0.devolucion)_actLabel='↩️ Marcó devolución';
  else if(g0.llamada==='contestó')_actLabel='📞 Llamada contestada';
  else if(g0.llamada==='no_contestó')_actLabel='📵 Sin respuesta';
  else if(g0.wa_enviado)_actLabel='📱 WA enviado';
  // Presencia + métricas en una sola escritura debounced (evita 2 writes por acción)
  if(_fbSyncPresTimer) clearTimeout(_fbSyncPresTimer);
  _fbSyncPresTimer = setTimeout(()=>{
    const m=_calcMetricas();
    _db.ref('presence/'+window._currentUsername).update({
      lastActivity:Date.now(),lastActionLabel:_actLabel,
      lastActionPedido:p.nombre||(p.dropiId?'#'+p.dropiId:''),
      sessionGestiones:m.total, totalPedidos:pedidos.length,
      contestaron:m.contestaron, noContestaron:m.noContestaron,
      waEnviados:m.waEnviados, finalizados:m.finalizados,
      devoluciones:m.devoluciones, guiasSinGestion:m.guiasSinGestion,
      transitoSinGestion:m.transitoSinGestion,
      rechazadosGestionados:m.rechazadosGestionados,
      rechazadosSinGestion:m.rechazadosSinGestion,
    });
  }, 3000);
  _fbActualizarHistorial();
}

function _fbActualizarHistorial(){
  if(typeof _db==='undefined'||!window._currentUsername)return;
  // Debounce: historial_diario solo se escribe como máximo 1 vez cada 30s
  if(_fbHistTimer) clearTimeout(_fbHistTimer);
  _fbHistTimer = setTimeout(()=>{
    const hoy=new Date().toISOString().slice(0,10);
    const user=window._currentUsername;
    const asesorRaw=window.getLoginAsesor?window.getLoginAsesor():'';
    const asesorKey=_fbKey((asesorRaw||user).trim().toLowerCase());
    const m=_calcMetricas();
    // Usar loginTime cacheado localmente (se setea en _registrarPresencia)
    const loginTime=_cachedLoginTime||Date.now();
    const minutos=Math.max(1,Math.floor((Date.now()-loginTime)/60000));
    _db.ref('historial_diario/'+user+'/'+asesorKey+'/'+hoy).set({
      asesorNombre:asesorRaw||user, totalPedidos:pedidos.length,
      contestaron:m.contestaron, noContestaron:m.noContestaron,
      waEnviados:m.waEnviados, finalizados:m.finalizados,
      devoluciones:m.devoluciones, guiasSinGestion:m.guiasSinGestion,
      transitoSinGestion:m.transitoSinGestion,
      rechazadosGestionados:m.rechazadosGestionados,
      rechazadosSinGestion:m.rechazadosSinGestion,
      minutos,_ts:Date.now()
    });
  }, 30000);
}

function _fbRestaurarGestiones(cb){
  if(typeof _db==='undefined'||!window._currentUsername){if(cb)cb();return;}
  _db.ref('gestiones_sync/'+_gsKey()).once('value',snap=>{
    const fb=snap.val()||{};
    if(!Object.keys(fb).length){if(cb)cb();return;}
    let changed=false;
    pedidos.forEach(p=>{
      if(!p.dropiId)return;
      const fbG=fb[_fbKey(p.dropiId)];
      if(!fbG)return;
      const localG=gestiones[p.id]||{};
      const localTs=localG._ts||0;
      const fbTs=fbG._ts||0;
      if(fbTs>localTs){
        const g=Object.assign({},fbG);
        delete g._ts;
        // Solo restaurar notas desde Firebase; la gestión activa se hace en la sesión actual
        if(g.notas&&g.notas.length&&!(gestiones[p.id]&&gestiones[p.id].notas&&gestiones[p.id].notas.length)){
          if(!gestiones[p.id])gestiones[p.id]={};
          gestiones[p.id].notas=g.notas;
          changed=true;
        }
      }
    });
    if(changed){guardar();toast('☁️ Gestiones sincronizadas desde la nube');}
    if(cb)cb(); else if(changed)renderAll();
  });
}

function _fbGuardarInformeSesion(){
  if(typeof _db==='undefined'||!window._currentUsername||!pedidos.length||!sesionInicio)return;
  const arr=Object.values(gestiones);
  const now=Date.now();
  _db.ref('session_reports/'+window._currentUsername).push({
    ts:now,
    asesorNombre:window.getLoginAsesor?window.getLoginAsesor():'',
    tienda:window.getLoginTienda?window.getLoginTienda():'',
    loginTime:sesionInicio,
    endTime:now,
    totalPedidos:pedidos.length,
    sessionGestiones:arr.filter(x=>x.llamada||x.wa_enviado||x.gestion_final).length,
    contestaron:arr.filter(x=>x.llamada==='contestó').length,
    noContestaron:arr.filter(x=>x.llamada==='no_contestó').length,
    waEnviados:arr.filter(x=>x.wa_enviado).length,
    finalizados:arr.filter(x=>x.gestion_final).length,
    devoluciones:arr.filter(x=>x.devolucion).length,
    guiasSinGestion:arr.filter(x=>x.guia_generada_hoy).length,
    transitoSinGestion:arr.filter(x=>x.transito_sin_gestion).length,
    rechazadosGestionados:arr.filter(x=>x.rechazado_gestionado).length,
    rechazadosSinGestion:arr.filter(x=>x.rechazado_sin_gestion).length,
  });
}

// Rechazados se guardan directamente en gestiones_sync via _fbSyncGestion
function _fbGuardarRechazado(id){ _fbSyncGestion(id); }

// Al cargar nuevo Excel: marcar automáticamente rechazados ya registrados en gestiones_sync
function _fbRestaurarRechazados(cb){
  if(typeof _db==='undefined'||!window._currentUsername){if(cb)cb();return;}
  _db.ref('gestiones_sync/'+_gsKey()).once('value', snap=>{
    const data=snap.val()||{};
    const rechPorGuia={};
    Object.values(data).forEach(g=>{
      if(!g._guia)return;
      if(g.rechazado_gestionado) rechPorGuia[g._guia]={estado:'gestionado'};
      else if(g.rechazado_sin_gestion) rechPorGuia[g._guia]={estado:'sin_gestion'};
    });
    if(!Object.keys(rechPorGuia).length){if(cb)cb();return;}
    let changed=false;
    pedidos.forEach(p=>{
      if(p.estadoKey!=='rechazado'||!p.guia)return;
      const rec=rechPorGuia[p.guia];
      if(!rec)return;
      if(!gestiones[p.id])gestiones[p.id]={};
      if(rec.estado==='gestionado'&&!gestiones[p.id].rechazado_gestionado){
        gestiones[p.id].rechazado_gestionado=true;
        changed=true;
      } else if(rec.estado==='sin_gestion'&&!gestiones[p.id].rechazado_sin_gestion){
        gestiones[p.id].rechazado_sin_gestion=true;
        changed=true;
      }
    });
    if(changed)guardar();
    if(cb)cb();
  });
}

// Al cargar un Excel nuevo: si una guía ya se gestionó/finalizó HOY (según lo
// último sincronizado en gestiones_sync), restaura ese estado localmente para
// que no vuelva a aparecer como pendiente — evita rehacer trabajo ya hecho hoy
// cuando se recarga el Excel con datos actualizados de Dropi a mitad de jornada.
function _fbRestaurarGestionadosHoy(cb){
  if(typeof _db==='undefined'||!window._currentUsername){if(cb)cb();return;}
  _db.ref('gestiones_sync/'+_gsKey()).once('value',snap=>{
    const data=snap.val()||{};
    const hoy=new Date().toDateString();
    const porGuia={};
    Object.values(data).forEach(g=>{
      if(!g._guia||!g._ts)return;
      if(new Date(g._ts).toDateString()!==hoy)return; // solo si se gestionó HOY
      const yaHecho=g.gestion_final||g.devolucion||g.transito_gestionado||g.transito_sin_gestion||g.guia_reportada||g.guia_generada_hoy;
      if(!yaHecho)return;
      porGuia[g._guia]=g;
    });
    if(!Object.keys(porGuia).length){if(cb)cb();return;}
    const CAMPOS=['gestion_final','devolucion','devolucion_razon','transito_gestionado','transito_sin_gestion','guia_reportada','guia_generada_hoy','nov_solucionada','resultado_gestion','contacto_metodo'];
    let changed=false, restaurados=0;
    pedidos.forEach(p=>{
      if(!p.guia)return;
      const fbG=porGuia[p.guia];
      if(!fbG)return;
      const local=gestiones[p.id]||{};
      if(local.gestion_final||local.devolucion||local.transito_gestionado||local.transito_sin_gestion)return; // ya está resuelto localmente
      if(!gestiones[p.id])gestiones[p.id]={};
      CAMPOS.forEach(k=>{ if(fbG[k]!==undefined) gestiones[p.id][k]=fbG[k]; });
      changed=true;restaurados++;
    });
    if(changed){guardar();toast('☁️ '+restaurados+' pedido'+(restaurados===1?'':'s')+' ya gestionado'+(restaurados===1?'':'s')+' hoy — restaurado'+(restaurados===1?'':'s')+' como Gestionado'+(restaurados===1?'':'s'));}
    if(cb)cb();
  });
}

// ===== ADMIN DASHBOARD =====
let _anlChart = null, _anlDonut = null, _anlCierreChart = null, _anlCompChart = null;
let _admUsuariosCache = [];
let _admPresenceListener = null;
let _admPresenciaCache = {};
let _admAsesorUidsCache = null;
let _admPresenceRenderTimer = null;

function _admTab(tab){
  ['enlive','ranking','equipo','analitica','empresas','buscar','gdconsolid','auditoria','reportes','negocio'].forEach(t=>{
    const el = document.getElementById('adm-tab-'+t);
    if(el) el.style.display = t===tab ? 'block' : 'none';
    const btn = document.getElementById('tab-btn-'+t);
    if(btn) btn.classList.toggle('active', t===tab);
  });
  if(tab==='equipo') _cargarEquipoGlobal();
  if(tab==='analitica') _anlInicializar();
  if(tab==='ranking') _rnkInicializar();
  if(tab==='empresas') _admCargarEmpresas();
  if(tab==='buscar') setTimeout(()=>{ const i=document.getElementById('bord-input'); if(i) i.focus(); }, 100);
  if(tab==='gdconsolid'){
    // Pre-fill mes con el mes actual
    const hoy=new Date(), y=hoy.getFullYear(), m=String(hoy.getMonth()+1).padStart(2,'0');
    const mesEl=document.getElementById('gdadm-mes');
    if(mesEl&&!mesEl.value) mesEl.value=y+'-'+m;
    _gdadmPoblarTiendas();
  }
  if(tab==='auditoria') _audInicializar();
  if(tab==='reportes') _admCargarReportes();
  if(tab==='negocio') _admCargarNegocio();
}

// ── AUDITORÍA DE LOGINS ───────────────────────────────────────────────────
let _audAllData=[], _audFilter='';

async function _auditLogin(username, resultado){
  try{
    if(typeof _db==='undefined')return;
    // Firebase no permite ".", "#", "$", "[", "]" en rutas — sanitizar el email
    const safeKey = String(username).replace(/[.#$[\]]/g,'_');
    // Obtener IP y ubicación via API gratuita (sin API key)
    let ip='—', ciudad='—', pais='—', isp='—', region='—';
    try{
      const r=await fetch('https://ip-api.com/json/?fields=status,query,city,regionName,country,org',{cache:'no-store'});
      if(r.ok){
        const d=await r.json();
        if(d.status==='success'){ip=d.query||'—';ciudad=d.city||'—';region=d.regionName||'—';pais=d.country||'—';isp=d.org||'—';}
      }
    }catch(_){}
    const ua=navigator.userAgent||'—';
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'—';
    // Detectar dispositivo aproximado
    const esMovil=/Mobi|Android|iPhone|iPad/i.test(ua);
    const navegador=ua.includes('Chrome')?'Chrome':ua.includes('Firefox')?'Firefox':ua.includes('Safari')?'Safari':ua.includes('Edge')?'Edge':'Otro';
    const record={
      username, resultado, ts:Date.now(),
      fecha:new Date().toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}),
      ip, ciudad, region, pais, isp,
      dispositivo:esMovil?'Móvil':'Escritorio',
      navegador, tz,
      ua:ua.slice(0,120) // truncar para no exceder límites
    };
    await _db.ref('login_audit/'+safeKey).push(record);
  }catch(e){ console.warn('[audit]',e); }
}

async function _audInicializar(){
  const wrap=document.getElementById('aud-table-wrap');
  if(!wrap)return;
  wrap.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-3);font-size:.75rem;">Cargando registros...</div>';
  // Cargar todos los usuarios para el selector
  const [snapUsers, snapAdmins]=await Promise.all([
    _db.ref('users').once('value'),
    _db.ref('admins').once('value')
  ]);
  const usuarios=[];
  snapUsers.val()&&Object.entries(snapUsers.val()).forEach(([uid,u])=>usuarios.push(u.email||uid));
  snapAdmins.val()&&Object.entries(snapAdmins.val()).forEach(([uid,a])=>usuarios.push(a.email||a.username||uid));
  const sel=document.getElementById('aud-user-sel');
  if(sel){
    sel.innerHTML='<option value="">Todos los usuarios</option>'+[...new Set(usuarios)].sort().map(u=>`<option value="${u}">${u}</option>`).join('');
  }
  _audCargar();
}

async function _audCargar(){
  const wrap=document.getElementById('aud-table-wrap');
  if(!wrap)return;
  wrap.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-3);font-size:.75rem;">Cargando...</div>';
  const userFil=(document.getElementById('aud-user-sel')||{}).value||'';
  let snap;
  if(userFil){
    snap=await _db.ref('login_audit/'+userFil).orderByChild('ts').limitToLast(200).once('value');
    _audAllData=[];
    snap.forEach(ch=>_audAllData.unshift({...ch.val(),_key:ch.key}));
  } else {
    // Consultar por usuario con límite en vez de bajar todo el árbol
    // (login_audit crece sin tope; la descarga completa se vuelve lenta con el tiempo)
    const sel=document.getElementById('aud-user-sel');
    const usuarios=sel?[...sel.options].map(o=>o.value).filter(Boolean):[];
    _audAllData=[];
    if(usuarios.length){
      const snaps=await Promise.all(usuarios.map(u=>
        _db.ref('login_audit/'+String(u).replace(/[.#$[\]]/g,'_')).orderByChild('ts').limitToLast(30).once('value')
      ));
      snaps.forEach((s,i)=>{ s.forEach(ch=>{ _audAllData.push({...ch.val(),_key:ch.key,username:ch.val().username||usuarios[i]}); }); });
    } else {
      const snapAll=await _db.ref('login_audit').limitToLast(50).once('value');
      Object.entries(snapAll.val()||{}).forEach(([user,regs])=>{
        Object.entries(regs||{}).forEach(([k,r])=>_audAllData.push({...r,_key:k,username:r.username||user}));
      });
    }
    _audAllData.sort((a,b)=>(b.ts||0)-(a.ts||0));
    _audAllData=_audAllData.slice(0,300);
  }
  _audFiltrar();
}

function _audFiltrar(){
  const wrap=document.getElementById('aud-table-wrap');
  if(!wrap)return;
  const resFil=(document.getElementById('aud-result-sel')||{}).value||'';
  const rows=_audAllData.filter(r=>!resFil||r.resultado===resFil);
  if(!rows.length){wrap.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-3);font-size:.75rem;">Sin registros</div>';return;}
  const badge=r=>{
    if(r.resultado==='exito') return '<span style="background:var(--success-soft);color:var(--success);border-radius:12px;padding:2px 8px;font-size:.62rem;font-weight:700;">✅ Éxito</span>';
    if(r.resultado==='fallo_password') return '<span style="background:var(--danger-soft);color:var(--danger);border-radius:12px;padding:2px 8px;font-size:.62rem;font-weight:700;">❌ Contraseña incorrecta</span>';
    if(r.resultado==='fallo_usuario') return '<span style="background:var(--warning-soft);color:var(--warning);border-radius:12px;padding:2px 8px;font-size:.62rem;font-weight:700;">👤 Usuario no existe</span>';
    return '<span style="background:var(--bg-inset);color:var(--text-2);border-radius:12px;padding:2px 8px;font-size:.62rem;font-weight:700;">' +(r.resultado||'—')+'</span>';
  };
  wrap.innerHTML=`<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.7rem;">
    <thead><tr style="background:#0D1117;color:white;font-size:.62rem;letter-spacing:.3px;">
      <th style="padding:8px 10px;text-align:left;">FECHA</th>
      <th style="padding:8px 10px;text-align:left;">USUARIO</th>
      <th style="padding:8px 10px;text-align:left;">RESULTADO</th>
      <th style="padding:8px 10px;text-align:left;">IP</th>
      <th style="padding:8px 10px;text-align:left;">CIUDAD / REGIÓN</th>
      <th style="padding:8px 10px;text-align:left;">PAÍS</th>
      <th style="padding:8px 10px;text-align:left;">ISP / OPERADOR</th>
      <th style="padding:8px 10px;text-align:left;">DISPOSITIVO</th>
      <th style="padding:8px 10px;text-align:left;">NAVEGADOR</th>
      <th style="padding:8px 10px;text-align:left;">ZONA HORARIA</th>
    </tr></thead>
    <tbody>${rows.map((r,i)=>`<tr style="background:${i%2?'var(--bg-hover)':'var(--bg-card)'};border-bottom:1px solid var(--border);">
      <td style="padding:6px 10px;white-space:nowrap;color:var(--text-2);">${r.fecha||'—'}</td>
      <td style="padding:6px 10px;font-weight:700;color:var(--text-1);">${r.username||'—'}</td>
      <td style="padding:6px 10px;">${badge(r)}</td>
      <td style="padding:6px 10px;font-family:monospace;color:var(--info);">${r.ip||'—'}</td>
      <td style="padding:6px 10px;">${r.ciudad||'—'}${r.region&&r.region!==r.ciudad?' · '+r.region:''}</td>
      <td style="padding:6px 10px;">${r.pais||'—'}</td>
      <td style="padding:6px 10px;color:var(--text-2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.isp||''}">${r.isp||'—'}</td>
      <td style="padding:6px 10px;">${r.dispositivo||'—'}</td>
      <td style="padding:6px 10px;">${r.navegador||'—'}</td>
      <td style="padding:6px 10px;color:var(--text-2);">${r.tz||'—'}</td>
    </tr>`).join('')}</tbody>
  </table><div style="padding:8px 10px;font-size:.62rem;color:var(--text-3);">${rows.length} registros mostrados</div></div>`;
}

function _admCargarDashboard(){
  const adminId = localStorage.getItem('lgs_admin_id');
  _admCargarNegocio(); // refresca nombre/logo del negocio en el encabezado

  if(!adminId){
    _admCargarDashboardLegacy();
    return;
  }

  // Mostrar "Cambiar perfil" si la cuenta tiene otros roles
  Promise.all([
    _db.ref('config/superAdminUid').once('value'),
    _db.ref('users/'+adminId).once('value'),
    _db.ref('user_tiendas/'+adminId).once('value')
  ]).then(([snapSA, snapU, snapT])=>{
    const hasOtherRoles = snapSA.val()===adminId || snapU.exists() || (snapT.exists()&&Object.keys(snapT.val()||{}).length>0);
    const btn = document.getElementById('btn-volver-roles-adm');
    if(btn) btn.style.display = hasOtherRoles ? 'inline-block' : 'none';
  });

  _db.ref('admin_empresas/'+adminId).once('value', snapAE=>{
    const misEmpresasIds = Object.keys(snapAE.val()||{});
    if(!misEmpresasIds.length){
      _admMostrarSinEmpresas();
      return;
    }
    let empresaActual = localStorage.getItem('lgs_empresa_actual');
    const valido = empresaActual==='__todas__' || misEmpresasIds.includes(empresaActual);
    if(!empresaActual || !valido){
      empresaActual = misEmpresasIds[0];
      localStorage.setItem('lgs_empresa_actual', empresaActual);
    }
    _admCargarEmpresa(adminId, misEmpresasIds, empresaActual);
  });
}

function _admCargarEmpresa(adminId, empresasIds, empresaActualId){
  const esTodas = empresaActualId==='__todas__';
  Promise.all([
    _db.ref('empresas').once('value'),
    esTodas ? _db.ref('empresa_asesores').once('value') : _db.ref('empresa_asesores/'+empresaActualId).once('value'),
    _db.ref('users').once('value'),
    _db.ref('presence').once('value')
  ]).then(([snapEmpresas, snapAsesores, snapUsers, snapPresence])=>{
    const todasEmpresas = snapEmpresas.val()||{};
    let asesorUids;
    if(esTodas){
      // Unir los asesores de todas las tiendas del admin (sin duplicados)
      const porEmpresa = snapAsesores.val()||{};
      const set = new Set();
      empresasIds.forEach(empId=>Object.keys(porEmpresa[empId]||{}).forEach(uid=>set.add(uid)));
      asesorUids = [...set];
    } else {
      asesorUids = Object.keys(snapAsesores.val()||{});
    }
    const todosUsers = Object.entries(snapUsers.val()||{}).map(([uid,d])=>({uid,...d}));
    const presencia = snapPresence.val()||{};

    const usuarios = todosUsers.filter(u=>asesorUids.includes(u.uid));

    _admPresenciaCache = presencia;
    _admUsuariosCache = usuarios;

    _admActualizarSelectorEmpresa(adminId, empresasIds, todasEmpresas, empresaActualId);

    const online = usuarios.filter(u=>(presencia[u.uid]||{}).online&&(Date.now()-((presencia[u.uid]||{}).lastSeen||0))<120000).length;
    const totalGest = usuarios.reduce((s,u)=>s+(presencia[u.uid]?.sessionGestiones||0),0);
    const totalFin = usuarios.reduce((s,u)=>s+(presencia[u.uid]?.finalizados||0),0);
    const totalTP = usuarios.reduce((s,u)=>s+(presencia[u.uid]?.totalPedidos||0),0);
    document.getElementById('adm-stat-total').textContent = usuarios.length;
    document.getElementById('adm-stat-online').textContent = online;
    document.getElementById('adm-stat-gest').textContent = totalGest;
    document.getElementById('adm-stat-fin').textContent = totalFin;
    document.getElementById('adm-stat-tp').textContent = totalTP || '—';

    usuarios.sort((a,b)=>{
      const ao=!!(presencia[a.uid]||{}).online&&(Date.now()-((presencia[a.uid]||{}).lastSeen||0))<120000;
      const bo=!!(presencia[b.uid]||{}).online&&(Date.now()-((presencia[b.uid]||{}).lastSeen||0))<120000;
      if(ao!==bo) return bo-ao;
      return ((presencia[b.uid]||{}).lastSeen||0)-((presencia[a.uid]||{}).lastSeen||0);
    });

    _buildEnliveCards(usuarios, presencia);
    // Equipo carga globalmente al abrir su tab

    // Cachear los UIDs de asesores visibles para no releer en cada heartbeat
    // (va aquí adentro porque depende de `usuarios`, calculado async arriba)
    _admAsesorUidsCache = usuarios.map(u=>u.uid);

    if(_admPresenceListener){ _db.ref('presence').off('value', _admPresenceListener); _admPresenceListener=null; }
    if(_admPresenceRenderTimer){ clearTimeout(_admPresenceRenderTimer); _admPresenceRenderTimer=null; }
    _admPresenceListener = _db.ref('presence').on('value', snapP=>{
      _admPresenciaCache = snapP.val()||{};
      // Debounce: agrupar actualizaciones (con 10 asesores hay heartbeats cada ~3s)
      if(_admPresenceRenderTimer) clearTimeout(_admPresenceRenderTimer);
      _admPresenceRenderTimer = setTimeout(()=>{
        const uids = _admAsesorUidsCache;
        if(uids){
          const usrs = _admUsuariosCache.filter(u=>uids.includes(u.uid));
          _buildEnliveCards(usrs, _admPresenciaCache);
          // Actualizar stats
          const online=usrs.filter(u=>((_admPresenciaCache[u.uid]||{}).online)&&(Date.now()-((_admPresenciaCache[u.uid]||{}).lastSeen||0))<120000).length;
          const totalGest=usrs.reduce((s,u)=>s+(_admPresenciaCache[u.uid]?.sessionGestiones||0),0);
          const totalFin=usrs.reduce((s,u)=>s+(_admPresenciaCache[u.uid]?.finalizados||0),0);
          const totalTP=usrs.reduce((s,u)=>s+(_admPresenciaCache[u.uid]?.totalPedidos||0),0);
          document.getElementById('adm-stat-online').textContent=online;
          document.getElementById('adm-stat-gest').textContent=totalGest;
          document.getElementById('adm-stat-fin').textContent=totalFin;
          document.getElementById('adm-stat-tp').textContent=totalTP||'—';
        }
      }, 5000); // 5s debounce: agrupa todos los heartbeats del periodo
    });
  });
}

function _admActualizarSelectorEmpresa(adminId, empresasIds, todasEmpresas, empresaActualId){
  let sel = document.getElementById('adm-empresa-select');
  if(!sel){
    const hdr = document.querySelector('.adm-header-right');
    const wrapper = document.createElement('div');
    wrapper.style.cssText='display:flex;align-items:center;gap:8px;';
    wrapper.innerHTML='<span style="color:rgba(255,255,255,.5);font-size:.7rem;">Empresa:</span><select id="adm-empresa-select" onchange="_admCambiarEmpresa(this.value)" style="background:#131920;color:white;border:1px solid #334155;border-radius:7px;padding:4px 10px;font-size:.74rem;cursor:pointer;outline:none;max-width:160px;"></select>';
    hdr.insertBefore(wrapper, hdr.firstChild);
    sel = document.getElementById('adm-empresa-select');
  }
  sel.innerHTML = '';
  if(empresasIds.length>1){
    const optTodas = document.createElement('option');
    optTodas.value = '__todas__';
    optTodas.textContent = '🌐 Todas las tiendas';
    optTodas.selected = empresaActualId==='__todas__';
    sel.appendChild(optTodas);
  }
  empresasIds.forEach(empId=>{
    const emp = todasEmpresas[empId];
    if(!emp) return;
    const opt = document.createElement('option');
    opt.value = empId;
    opt.textContent = emp.nombre;
    opt.selected = empId===empresaActualId;
    sel.appendChild(opt);
  });
}

window._admCambiarEmpresa = function(empresaId){
  localStorage.setItem('lgs_empresa_actual', empresaId);
  _admAsesorUidsCache = null; // Limpiar caché al cambiar empresa
  _admUsuariosCache = [];
  _admCargarDashboard();
};

function _admMostrarSinEmpresas(){
  const list = document.getElementById('adm-users-list');
  if(list) list.innerHTML = '<div class="adm-empty" style="display:flex;flex-direction:column;align-items:center;gap:12px;"><div>No tienes empresas creadas aún.</div><button onclick="_admAbrirCrearEmpresa()" style="background:#131920;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;">+ Crear mi primera empresa</button></div>';
  document.getElementById('adm-stat-total').textContent='0';
  document.getElementById('adm-stat-online').textContent='0';
  document.getElementById('adm-stat-gest').textContent='0';
  document.getElementById('adm-stat-fin').textContent='0';
  document.getElementById('adm-stat-tp').textContent='—';
}

function _admCargarDashboardLegacy(){
  if(_admPresenceListener){ _db.ref('presence').off('value', _admPresenceListener); _admPresenceListener = null; }
  function _procesarDatos(presencia, usuarios){
    _admPresenciaCache = presencia;
    // Legacy: fallback user no aplica con Firebase Auth
    _admUsuariosCache = usuarios;
    const online = Object.values(presencia).filter(p=>p.online&&(Date.now()-(p.lastSeen||0))<120000).length;
    const totalGest = Object.values(presencia).reduce((s,p)=>s+(p.sessionGestiones||0),0);
    const totalFin = Object.values(presencia).reduce((s,p)=>s+(p.finalizados||0),0);
    const totalTP = Object.values(presencia).reduce((s,p)=>s+(p.totalPedidos||0),0);
    document.getElementById('adm-stat-total').textContent = usuarios.length;
    document.getElementById('adm-stat-online').textContent = online;
    document.getElementById('adm-stat-gest').textContent = totalGest;
    document.getElementById('adm-stat-fin').textContent = totalFin;
    document.getElementById('adm-stat-tp').textContent = totalTP || '—';
    usuarios.sort((a,b)=>{
      const ao=!!(presencia[a.uid]||{}).online&&(Date.now()-((presencia[a.uid]||{}).lastSeen||0))<120000;
      const bo=!!(presencia[b.uid]||{}).online&&(Date.now()-((presencia[b.uid]||{}).lastSeen||0))<120000;
      if(ao!==bo) return bo-ao;
      return ((presencia[b.uid]||{}).lastSeen||0)-((presencia[a.uid]||{}).lastSeen||0);
    });
    _buildEnliveCards(usuarios, presencia);
    // Equipo carga globalmente al abrir su tab
  }
  function _cargarUsuarios(presencia){
    _db.ref('users').once('value', snapUsers=>{
      const usuarios = Object.values(snapUsers.val()||{});
      _procesarDatos(presencia, usuarios);
    }, err=>{
      const list = document.getElementById('adm-users-list');
      if(list) list.innerHTML='<div class="adm-empty" style="color:var(--danger);">⚠️ Sin acceso a Firebase.</div>';
    });
  }
  _admPresenceListener = _db.ref('presence').on('value', snapPresence=>{
    const presencia = snapPresence.val()||{};
    _admPresenciaCache = presencia;
    if(_admPresenceRenderTimer) clearTimeout(_admPresenceRenderTimer);
    _admPresenceRenderTimer = setTimeout(()=>{
      if(_admUsuariosCache && _admUsuariosCache.length){
        // Ya tenemos usuarios: solo actualizar presencia y re-renderizar (sin Firebase read)
        _procesarDatos(presencia, _admUsuariosCache);
      } else {
        _cargarUsuarios(presencia);
      }
    }, 5000);
  }, err=>{ _cargarUsuarios({}); });
}

function _avatarColor(name){
  const cols=['#2563eb','#7c3aed','#db2777','#059669','#d97706','#0891b2','#4f46e5','#dc2626'];
  let h=0; for(let i=0;i<(name||'').length;i++) h=(name.charCodeAt(i)+((h<<5)-h))|0;
  return cols[Math.abs(h)%cols.length];
}
function _avatarInitials(name){
  const w=(name||'?').trim().split(/\s+/);
  return w.length>=2?(w[0][0]+w[1][0]).toUpperCase():(name||'?').slice(0,2).toUpperCase();
}

function _buildEnliveCards(usuarios, presencia){
  const grid=document.getElementById('enlive-cards');
  const offGrid=document.getElementById('enlive-offline-cards');
  const offSec=document.getElementById('enlive-offline-section');
  grid.innerHTML=''; offGrid.innerHTML='';
  const on=[], off=[];
  usuarios.forEach(u=>{
    if(!u.uid) return;
    const p=presencia[u.uid]||{};
    const isOnline=!!p.online&&(Date.now()-(p.lastSeen||0))<120000;
    if(isOnline) on.push({u,p}); else off.push({u,p});
  });
  if(!on.length) grid.innerHTML='<div class="adm-empty" style="grid-column:1/-1;border:1px dashed #d6d2cc;border-radius:10px;">Ningún asesor conectado en este momento</div>';
  on.forEach(({u,p})=>grid.appendChild(_mkEnliveCard(u,p,true)));
  if(off.length){ offSec.style.display='block'; off.forEach(({u,p})=>offGrid.appendChild(_mkEnliveCard(u,p,false))); }
  else offSec.style.display='none';
}

function _mkEnliveCard(u, p, isOnline){
  const name=isOnline&&p.asesor?p.asesor:(u.asesor||u.email||u.uid);
  const tienda=isOnline&&p.tienda?p.tienda:(u.tienda||'—');
  const color=_avatarColor(name);
  const initials=_avatarInitials(name);
  const cont=p.contestaron||0, noCont=p.noContestaron||0, wa=p.waEnviados||0;
  const fin=p.finalizados||0, dev=p.devoluciones||0;
  const total=cont+noCont+wa;
  const tp=p.totalPedidos||0;
  const tCierre=tp>0?Math.min(100,Math.round(fin/tp*100)):Math.min(100,Math.round(fin/Math.max(total,fin,1)*100));
  const tContacto=tp>0?Math.min(100,Math.round(cont/tp*100)):(total>0?Math.round(cont/total*100):0);
  const min=isOnline&&p.loginTime?Math.max(1,(Date.now()-p.loginTime)/60000):0;
  const gpm=min>0?fin/min:0;
  const score=Math.max(0,Math.round(fin*5+tCierre*1-dev*4+Math.min(gpm*15,20)));
  const scoreColor=score>=80?'#4ade80':score>=40?'#fbbf24':'#f87171';
  const tiempoActivo=isOnline&&p.loginTime?_fmtDuracion(Date.now()-p.loginTime):null;
  const barCont=Math.min(100,tContacto), barCierre=Math.min(100,tCierre);
  const barDev=fin>0?Math.min(100,Math.round(dev/fin*100)):0;
  const cC=tContacto>=70?'#3b82f6':tContacto>=50?'#f59e0b':'#ef4444';
  const cCi=tCierre>=60?'#10b981':tCierre>=40?'#f59e0b':'#ef4444';
  const cDev=barDev<=5?'#10b981':barDev<=15?'#f59e0b':'#ef4444';
  const card=document.createElement('div');
  card.className='enlive-card'+(isOnline?' online':'');
  card.style.cursor='pointer';
  card.onclick=()=>window._malAbrir(u.uid);
  const safeU=(u.uid||'').replace(/'/g,"\\'");
  const safeEmail=(u.email||'').replace(/'/g,"\\'");
  const safeA=(u.asesor||'').replace(/'/g,"\\'");
  const safeT=(u.tienda||'').replace(/'/g,"\\'");
  card.innerHTML=
    '<div class="enlive-card-top">'+
      '<div class="enlive-avatar" style="background:'+color+'">'+initials+'</div>'+
      '<div style="flex:1;min-width:0;">'+
        '<div class="enlive-name">'+name+'</div>'+
        '<div class="enlive-tienda">🏪 '+tienda+'</div>'+
      '</div>'+
      '<div class="enlive-status">'+
        (isOnline
          ? '<div class="enlive-online-pill"><span class="adm-live-dot"></span>EN VIVO</div>'
          : '<div class="enlive-offline-pill">Offline</div>')+
        (tiempoActivo?'<div class="enlive-time">'+tiempoActivo+'</div>':(p.lastSeen?'<div class="enlive-time">'+_fmtTiempo(p.lastSeen)+'</div>':''))+
        (isOnline?'<div class="enlive-score" style="color:'+scoreColor+'">'+score+'</div><div class="enlive-score-lbl">score</div>':'')+
      '</div>'+
    '</div>'+
    (isOnline
      ? '<div class="enlive-metrics" style="grid-template-columns:repeat(4,1fr)">'+
          '<div class="enlive-metric"><div class="enlive-metric-val" style="color:var(--text-3);font-size:.82rem">'+(tp||'—')+'</div><div class="enlive-metric-lbl">Total ped.</div></div>'+
          '<div class="enlive-metric"><div class="enlive-metric-val" style="color:#4ade80">'+fin+'</div><div class="enlive-metric-lbl">Final.</div></div>'+
          '<div class="enlive-metric"><div class="enlive-metric-val" style="color:#60a5fa">'+cont+'</div><div class="enlive-metric-lbl">Cont.</div></div>'+
          '<div class="enlive-metric"><div class="enlive-metric-val" style="color:#a78bfa">'+wa+'</div><div class="enlive-metric-lbl">WA</div></div>'+
        '</div>'+
        '<div class="enlive-bars">'+
          '<div class="enlive-bar-row"><div class="enlive-bar-lbl">Tasa contacto</div><div class="enlive-bar-track"><div class="enlive-bar-fill" style="width:'+barCont+'%;background:'+cC+'"></div></div><div class="enlive-bar-val" style="color:'+cC+'">'+tContacto+'%</div></div>'+
          '<div class="enlive-bar-row"><div class="enlive-bar-lbl">Tasa cierre</div><div class="enlive-bar-track"><div class="enlive-bar-fill" style="width:'+barCierre+'%;background:'+cCi+'"></div></div><div class="enlive-bar-val" style="color:'+cCi+'">'+tCierre+'%</div></div>'+
          (fin>0?'<div class="enlive-bar-row"><div class="enlive-bar-lbl">Dev.</div><div class="enlive-bar-track"><div class="enlive-bar-fill" style="width:'+barDev+'%;background:'+cDev+'"></div></div><div class="enlive-bar-val" style="color:'+cDev+'">'+barDev+'%</div></div>':'')+
        '</div>'
      : '')+
    '<div class="enlive-actions">'+
      (isOnline?'<button class="enlive-btn danger" onclick="_admForzarLogout(\''+safeU+'\')">⏻ Cerrar sesión</button>':'')+
      '<button class="enlive-btn" onclick="_admAbrirEditar(\''+safeU+'\',\''+safeEmail+'\',\''+safeA+'\',\''+safeT+'\',\''+(u.rol||'asesor')+'\')">✏️ Editar</button>'+
      '<button class="enlive-btn danger" onclick="_admEliminarUsuario(\''+safeU+'\')">✕</button>'+
    '</div>';
  return card;
}

window._admEquipoTodos = [];

function _cargarEquipoGlobal(){
  const adminId = localStorage.getItem('lgs_admin_id');
  if(!adminId) return;
  const list = document.getElementById('adm-users-list');
  if(list) list.innerHTML = '<div class="adm-empty">Cargando equipo...</div>';
  Promise.all([
    _db.ref('admin_empresas/'+adminId).once('value'),
    _db.ref('empresas').once('value'),
    _db.ref('empresa_asesores').once('value'),
    _db.ref('users').once('value'),
    _db.ref('presence').once('value')
  ]).then(([snapAE, snapEmpresas, snapEAse, snapUsers, snapPresence])=>{
    const empresasIds = Object.keys(snapAE.val()||{});
    const empresas = snapEmpresas.val()||{};
    const empresaAsesores = snapEAse.val()||{};
    const users = snapUsers.val()||{};
    _admPresenciaCache = snapPresence.val()||{};
    const todos = [];
    empresasIds.forEach(empId=>{
      const emp = empresas[empId]; if(!emp) return;
      Object.keys(empresaAsesores[empId]||{}).forEach(uid=>{
        const u = users[uid]||{};
        todos.push({ uid, asesor:u.asesor||u.email||uid, email:u.email||'', rol:u.rol||'asesor', tiendaId:empId, tiendaNombre:emp.nombre||empId });
      });
    });
    window._admEquipoTodos = todos;
    // Poblar selector de tienda
    const sel = document.getElementById('equipo-filter-tienda');
    if(sel){
      const cur = sel.value;
      sel.innerHTML = '<option value="">Todas las tiendas ('+empresasIds.length+')</option>';
      empresasIds.forEach(empId=>{
        const emp = empresas[empId]; if(!emp) return;
        const o = document.createElement('option');
        o.value = empId; o.textContent = emp.nombre||empId;
        if(empId===cur) o.selected=true;
        sel.appendChild(o);
      });
    }
    _buildEquipoList();
  });
}

function _buildEquipoList(){
  const list = document.getElementById('adm-users-list');
  if(!list) return;
  const presencia = _admPresenciaCache||{};
  const todos = window._admEquipoTodos||[];
  const q = ((document.getElementById('equipo-search')||{}).value||'').toLowerCase();
  const fTienda = (document.getElementById('equipo-filter-tienda')||{}).value||'';
  const fRol = (document.getElementById('equipo-filter-rol')||{}).value||'';
  const fEstado = (document.getElementById('equipo-filter-estado')||{}).value||'';
  if(!todos.length){ list.innerHTML='<div class="adm-empty">No hay usuarios registrados</div>'; return; }
  const sorted = [...todos].sort((a,b)=>{
    const pa=presencia[a.uid]||{}, pb=presencia[b.uid]||{};
    const ao=!!pa.online&&(Date.now()-(pa.lastSeen||0))<120000;
    const bo=!!pb.online&&(Date.now()-(pb.lastSeen||0))<120000;
    if(ao!==bo) return bo-ao;
    return (pb.lastSeen||0)-(pa.lastSeen||0);
  });
  list.innerHTML='';
  let visible=0;
  sorted.forEach(u=>{
    const p=presencia[u.uid]||{};
    const isOnline=!!p.online&&(Date.now()-(p.lastSeen||0))<120000;
    const name=isOnline&&p.asesor?p.asesor:u.asesor;
    if(fTienda && u.tiendaId!==fTienda) return;
    if(fRol && u.rol!==fRol) return;
    if(fEstado==='online'&&!isOnline) return;
    if(fEstado==='offline'&&isOnline) return;
    if(q&&!name.toLowerCase().includes(q)&&!u.email.toLowerCase().includes(q)&&!u.tiendaNombre.toLowerCase().includes(q)) return;
    visible++;
    const tiempoActivo=isOnline&&p.loginTime?_fmtDuracion(Date.now()-p.loginTime):null;
    const cont=p.contestaron||0,noCont=p.noContestaron||0,wa=p.waEnviados||0,fin=p.finalizados||0;
    const statsHtml=isOnline
      ?'<div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap;">'+
        (cont?'<span style="background:#1e40af15;color:#60a5fa;border-radius:5px;padding:1px 7px;font-size:.6rem;font-weight:700;">✅ '+cont+'</span>':'')+
        (noCont?'<span style="background:#7f1d1d15;color:#f87171;border-radius:5px;padding:1px 7px;font-size:.6rem;font-weight:700;">❌ '+noCont+'</span>':'')+
        (wa?'<span style="background:#4c1d9515;color:#a78bfa;border-radius:5px;padding:1px 7px;font-size:.6rem;font-weight:700;">📱 '+wa+'</span>':'')+
        (fin?'<span style="background:#14532d15;color:#4ade80;border-radius:5px;padding:1px 7px;font-size:.6rem;font-weight:700;">🏁 '+fin+'</span>':'')+
        (!cont&&!noCont&&!wa&&!fin?'<span style="color:var(--text-3);font-size:.6rem;">Sin gestiones</span>':'')+
        '</div>':''
    ;
    const safeU=u.uid.replace(/'/g,"\\'");
    const safeEmail=u.email.replace(/'/g,"\\'");
    const safeA=u.asesor.replace(/'/g,"\\'");
    const safeT=u.tiendaNombre.replace(/'/g,"\\'");
    const row=document.createElement('div');
    row.className='adm-user-row'+(isOnline?' online':'');
    row.innerHTML=
      '<div class="adm-online-dot'+(isOnline?' on':'')+'"></div>'+
      '<div class="adm-user-row-info" style="flex:1;">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'+
          '<div>'+
            '<div class="adm-user-row-name">'+name+(u.email&&name!==u.email?'<span style="color:var(--text-3);font-size:.65rem;font-weight:400;margin-left:6px;">'+u.email+'</span>':'')+'</div>'+
            '<div class="adm-user-row-meta">🏪 '+u.tiendaNombre+' · '+(u.rol==='dueno'?'<span style="color:#7c3aed;font-weight:700;">👑 Dueño</span>':'<span style="color:var(--info);font-weight:700;">👤 Asesor</span>')+'</div>'+
          '</div>'+
          '<div style="font-size:.63rem;font-weight:600;color:'+(isOnline?'#10b981':'#94a3b8')+'">'+
            (isOnline?'🟢 En línea'+(tiempoActivo?' · '+tiempoActivo:''):(p.lastSeen?'⚫ '+_fmtTiempo(p.lastSeen):'Sin conexión'))+
          '</div>'+
        '</div>'+statsHtml+
      '</div>'+
      '<div class="adm-user-row-actions">'+
        (isOnline?'<button class="adm-row-btn" style="color:#f59e0b;border-color:#78350f20;" onclick="_admForzarLogout(\''+safeU+'\')">⏻</button>':'')+
        '<button class="adm-row-btn" onclick="_admAbrirEditar(\''+safeU+'\',\''+safeEmail+'\',\''+safeA+'\',\''+safeT+'\',\''+(u.rol||'asesor')+'\')">✏️</button>'+
        '<button class="adm-row-btn danger" onclick="_admEliminarUsuario(\''+safeU+'\')">✕</button>'+
      '</div>';
    list.appendChild(row);
  });
  const contador=document.getElementById('equipo-contador');
  if(contador) contador.textContent=visible+' usuario'+(visible!==1?'s':'')+' · '+todos.length+' en total';
  if(!visible) list.innerHTML='<div class="adm-empty">Sin resultados para los filtros aplicados</div>';
}

// ===== ANALÍTICA =====
function _anlInicializar(){
  const sel = document.getElementById('anl-user-filter');
  const current = sel.value;
  sel.innerHTML = '<option value="">Todas las tiendas</option>';
  _admUsuariosCache.forEach(u=>{
    if(!u.uid) return;
    const opt = document.createElement('option');
    opt.value = u.uid;
    opt.textContent = u.tienda || u.asesor || u.email || u.uid;
    if(u.uid===current) opt.selected = true;
    sel.appendChild(opt);
  });
  _anlCargar();
}

function _rnkInicializar(){
  const sel = document.getElementById('rnk-user-filter');
  const current = sel.value;
  sel.innerHTML = '<option value="">Todas las tiendas</option>';
  _admUsuariosCache.forEach(u=>{
    if(!u.uid) return;
    const opt = document.createElement('option');
    opt.value = u.uid;
    opt.textContent = u.tienda || u.asesor || u.email || u.uid;
    if(u.uid===current) opt.selected = true;
    sel.appendChild(opt);
  });
  _rnkCargar();
}

function _anlUserChange(){
  const user = document.getElementById('anl-user-filter').value;
  const wrap = document.getElementById('anl-asesor-wrap');
  const asel = document.getElementById('anl-asesor-filter');
  asel.innerHTML = '<option value="">Todos los asesores</option>';
  if(!user){ wrap.style.display='none'; _anlCargar(); return; }
  // Cargar asesores disponibles para esta tienda desde historial_diario
  _db.ref('historial_diario/'+user).once('value', snap=>{
    const data = snap.val()||{};
    // Si la estructura es nueva (asesor/fecha), los keys son asesores
    // Si es vieja (fecha directamente), no hay asesores
    const keys = Object.keys(data);
    const isNewStructure = keys.length>0 && !keys[0].match(/^\d{4}-\d{2}-\d{2}$/);
    if(isNewStructure){
      wrap.style.display='block';
      keys.forEach(asesorKey=>{
        const nombre = data[asesorKey][Object.keys(data[asesorKey])[0]]?.asesorNombre || asesorKey;
        const opt = document.createElement('option');
        opt.value = asesorKey;
        opt.textContent = nombre;
        asel.appendChild(opt);
      });
    } else {
      wrap.style.display='none';
    }
    _anlCargar();
  });
}

function _anlPeriodChange(){
  const v = document.getElementById('anl-period-filter').value;
  const cr = document.getElementById('anl-custom-range');
  cr.style.display = v==='custom' ? 'flex' : 'none';
  if(v!=='custom') _anlCargar();
}

function _anlGetFechas(){
  const period = document.getElementById('anl-period-filter').value;
  const fechas = [];
  if(period==='today'){
    fechas.push(new Date().toISOString().slice(0,10));
  } else if(period==='yesterday'){
    const d=new Date(); d.setDate(d.getDate()-1); fechas.push(d.toISOString().slice(0,10));
  } else if(period==='custom'){
    const from = document.getElementById('anl-date-from').value;
    const to   = document.getElementById('anl-date-to').value;
    if(!from||!to) return [];
    const cur = new Date(from);
    const end = new Date(to);
    while(cur<=end){ fechas.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  } else {
    const dias = parseInt(period);
    for(let i=dias-1;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); fechas.push(d.toISOString().slice(0,10)); }
  }
  return fechas;
}

function _anlCargar(){
  const userFilter = document.getElementById('anl-user-filter').value;
  const period     = document.getElementById('anl-period-filter').value;
  const fechas     = _anlGetFechas();
  if(!fechas.length) return;

  const asesorFilter = document.getElementById('anl-asesor-filter')?.value||'';
  const _anlUserMap=new Map(_admUsuariosCache.map(u=>[u.uid,u]));
  const tiendaName = userFilter ? ((_anlUserMap.get(userFilter)||{}).tienda||userFilter) : 'Todas las tiendas';
  const asesorName = asesorFilter ? document.getElementById('anl-asesor-filter').options[document.getElementById('anl-asesor-filter').selectedIndex]?.text : '';
  const periodLabel = period==='today'?'Hoy':period==='yesterday'?'Ayer':period==='custom'?'Rango personalizado':'Últimos '+period+' días';
  document.getElementById('anl-chart-title').textContent = (asesorName||tiendaName) + ' — ' + periodLabel;

  const kpiSuffix = {today:' (hoy)',yesterday:' (ayer)',custom:''}[period]||' ('+period+'d)';
  document.getElementById('kpi-fin-lbl').textContent  = 'Finalizados'+kpiSuffix;
  document.getElementById('kpi-cont-lbl').textContent = 'Contestaron'+kpiSuffix;
  document.getElementById('kpi-wa-lbl').textContent   = 'WA enviados'+kpiSuffix;

  const users = userFilter ? [userFilter] : _admUsuariosCache.filter(u=>u.uid).map(u=>u.uid);
  const limit = Math.max(fechas.length, 30);
  const promises = users.map(u => _db.ref('historial_diario/'+u).once('value').then(s=>({u,data:s.val()||{}})));

  // Helper: aplanar estructura nueva (tienda/asesor/fecha) o vieja (tienda/fecha)
  function _aplanarHistorial(data, soloAsesor){
    const byFecha = {};
    fechas.forEach(f=>{ byFecha[f]={finalizados:0,contestaron:0,noContestaron:0,waEnviados:0,devoluciones:0,guiasSinGestion:0,transitoSinGestion:0,rechazadosGestionados:0,rechazadosSinGestion:0,minutos:0,totalPedidos:0}; });
    // Detectar si es estructura nueva: primer key no es una fecha
    const keys = Object.keys(data);
    const isNew = keys.length>0 && !keys[0].match(/^\d{4}-\d{2}-\d{2}$/);
    if(isNew){
      Object.entries(data).forEach(([asesorKey, fechasData])=>{
        if(soloAsesor && asesorKey!==soloAsesor) return;
        Object.entries(fechasData).forEach(([f,d])=>{
          if(!byFecha[f]) return;
          byFecha[f].finalizados   += d.finalizados||0;
          byFecha[f].contestaron   += d.contestaron||0;
          byFecha[f].noContestaron += d.noContestaron||0;
          byFecha[f].waEnviados    += d.waEnviados||0;
          byFecha[f].devoluciones  += d.devoluciones||0;
          byFecha[f].guiasSinGestion      += d.guiasSinGestion||0;
          byFecha[f].transitoSinGestion   += d.transitoSinGestion||0;
          byFecha[f].rechazadosGestionados+= d.rechazadosGestionados||0;
          byFecha[f].rechazadosSinGestion += d.rechazadosSinGestion||0;
          byFecha[f].minutos       += d.minutos||0;
          byFecha[f].totalPedidos  += d.totalPedidos||0;
        });
      });
    } else {
      Object.entries(data).forEach(([f,d])=>{
        if(!byFecha[f]) return;
        byFecha[f].finalizados   += d.finalizados||0;
        byFecha[f].contestaron   += d.contestaron||0;
        byFecha[f].noContestaron += d.noContestaron||0;
        byFecha[f].waEnviados    += d.waEnviados||0;
        byFecha[f].devoluciones  += d.devoluciones||0;
        byFecha[f].guiasSinGestion += d.guiasSinGestion||0;
        byFecha[f].minutos       += d.minutos||0;
        byFecha[f].totalPedidos  += d.totalPedidos||0;
      });
    }
    return byFecha;
  }

  // Helper: obtener lista de asesores con sus totales del período (para comparativo)
  function _getAsesoresPorPeriodo(data){
    const keys = Object.keys(data);
    const isNew = keys.length>0 && !keys[0].match(/^\d{4}-\d{2}-\d{2}$/);
    if(!isNew) return [];
    return Object.entries(data).map(([asesorKey, fechasData])=>{
      let cont=0,noCont=0,wa=0,fin=0,dev=0,gsg=0,min=0,tp=0;
      const nombre = fechasData[Object.keys(fechasData)[0]]?.asesorNombre || asesorKey;
      let tsg=0,rg=0,rsg=0;
      fechas.forEach(f=>{ const d=fechasData[f]||{}; cont+=d.contestaron||0; noCont+=d.noContestaron||0; wa+=d.waEnviados||0; fin+=d.finalizados||0; dev+=d.devoluciones||0; gsg+=d.guiasSinGestion||0; tsg+=d.transitoSinGestion||0; rg+=d.rechazadosGestionados||0; rsg+=d.rechazadosSinGestion||0; min+=d.minutos||0; tp+=d.totalPedidos||0; });
      return {asesorKey, nombre, cont, noCont, wa, fin, dev, gsg, tsg, rg, rsg, min, tp};
    }).filter(x=>x.cont+x.noCont+x.wa+x.fin+x.gsg+x.tsg>0);
  }

  // Chart.js se descarga en paralelo con el historial (solo control-financiero.html lo trae en el <head>)
  Promise.all([Promise.all(promises), _cargarLib(_LIB_CHART)]).then(([results])=>{
    const byFecha = {};
    fechas.forEach(f=>{ byFecha[f]={finalizados:0,contestaron:0,noContestaron:0,waEnviados:0,devoluciones:0,guiasSinGestion:0,transitoSinGestion:0,rechazadosGestionados:0,rechazadosSinGestion:0,minutos:0}; });

    results.forEach(({data})=>{
      const parcial = _aplanarHistorial(data, asesorFilter);
      Object.entries(parcial).forEach(([f,d])=>{
        byFecha[f].finalizados   += d.finalizados;
        byFecha[f].contestaron   += d.contestaron;
        byFecha[f].noContestaron += d.noContestaron;
        byFecha[f].waEnviados    += d.waEnviados;
        byFecha[f].devoluciones  += d.devoluciones;
        byFecha[f].guiasSinGestion      += d.guiasSinGestion||0;
        byFecha[f].transitoSinGestion   += d.transitoSinGestion||0;
        byFecha[f].rechazadosGestionados+= d.rechazadosGestionados||0;
        byFecha[f].rechazadosSinGestion += d.rechazadosSinGestion||0;
        byFecha[f].minutos       += d.minutos;
      });
    });

    const labels = fechas.map(f=>{ const [,m,d]=f.split('-'); return d+'/'+m; });

    // KPIs — un solo loop en lugar de 10 reduce separados
    let totMin=0,totFin=0,totCont=0,totNoCont=0,totWA=0,totDev=0,
        totGSG=0,totTSG=0,totRG=0,totRSG=0,totTP=0;
    Object.values(byFecha).forEach(d=>{
      totMin+=d.minutos; totFin+=d.finalizados; totCont+=d.contestaron;
      totNoCont+=d.noContestaron; totWA+=d.waEnviados; totDev+=d.devoluciones;
      totGSG+=d.guiasSinGestion||0; totTSG+=d.transitoSinGestion||0;
      totRG+=d.rechazadosGestionados||0; totRSG+=d.rechazadosSinGestion||0;
      totTP+=d.totalPedidos||0;
    });
    const totGest  = totCont + totNoCont + totWA;
    const gpm = totMin>0 ? (totFin/totMin).toFixed(2) : '—';
    const tasaContacto = totTP>0 ? Math.round(totCont/totTP*100) : (totGest>0 ? Math.round(totCont/totGest*100) : null);
    const tasaCierre   = totTP>0 ? Math.round(totFin/totTP*100)  : (totGest>0 ? Math.round(totFin/totGest*100)  : null);
    const tasaDev      = totFin>0  ? Math.round(totDev/totFin*100)  : null;

    document.getElementById('kpi-fin').textContent  = totFin;
    document.getElementById('kpi-cont').textContent = totCont;
    document.getElementById('kpi-wa').textContent   = totWA;
    document.getElementById('kpi-total').textContent= totGest;
    document.getElementById('kpi-gsg').textContent  = totGSG||'—';
    document.getElementById('kpi-tsg').textContent  = totTSG||'—';
    document.getElementById('kpi-rg').textContent   = totRG||'—';
    document.getElementById('kpi-rsg').textContent  = totRSG||'—';
    document.getElementById('kpi-gpm').textContent  = gpm+(gpm!=='—'?'/min':'');
    document.getElementById('kpi-gpm').style.color  = gpm==='—'?'white':gpm>=1?'#4ade80':gpm>=0.5?'#fbbf24':'#f87171';

    const tcEl = document.getElementById('kpi-tasa-contacto');
    tcEl.textContent = tasaContacto!==null ? tasaContacto+'%' : '—';
    tcEl.style.color = tasaContacto===null?'white':tasaContacto>=70?'#4ade80':tasaContacto>=50?'#fbbf24':'#f87171';

    const tccEl = document.getElementById('kpi-tasa-cierre');
    tccEl.textContent = tasaCierre!==null ? tasaCierre+'%' : '—';
    tccEl.style.color = tasaCierre===null?'white':tasaCierre>=60?'#4ade80':tasaCierre>=40?'#fbbf24':'#f87171';

    const devEl = document.getElementById('kpi-dev-rate');
    devEl.textContent = tasaDev!==null ? tasaDev+'%' : '—';
    devEl.style.color = tasaDev===null?'white':tasaDev<=5?'#4ade80':tasaDev<=15?'#fbbf24':'#f87171';

    // ── DONUT: Distribución de contacto ──
    const ctxD = document.getElementById('anl-donut').getContext('2d');
    if(_anlDonut) _anlDonut.destroy();
    const soloWA = Math.max(0, totWA - totCont); // WA sin llamada contestada
    _anlDonut = new Chart(ctxD,{
      type:'doughnut',
      data:{
        labels:['Contestaron','No contestaron','Solo WA'],
        datasets:[{
          data:[totCont, totNoCont, soloWA],
          backgroundColor:['#4ade8066','#f8717166','#a78bfa66'],
          borderColor:['#4ade80','#f87171','#a78bfa'],
          borderWidth:2,
        }]
      },
      options:{
        responsive:true,cutout:'68%',
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:ctx=>{
            const total=ctx.dataset.data.reduce((a,b)=>a+b,0);
            const pct=total>0?Math.round(ctx.parsed/total*100):0;
            return ctx.label+': '+ctx.parsed+' ('+pct+'%)';
          }}}
        }
      }
    });
    // leyenda manual
    const legendEl = document.getElementById('anl-donut-legend');
    const legendData=[['#4ade80','Contestaron',totCont],['#f87171','No contestaron',totNoCont],['#a78bfa','Solo WA',soloWA]];
    const grandTotal = totCont+totNoCont+soloWA||1;
    legendEl.innerHTML = legendData.map(([c,l,v])=>
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'+
        '<div style="display:flex;align-items:center;gap:6px;">'+
          '<div style="width:10px;height:10px;border-radius:50%;background:'+c+'"></div>'+
          '<span style="color:var(--text-3)">'+l+'</span>'+
        '</div>'+
        '<span style="color:white;font-weight:700">'+v+' <span style="color:var(--text-2);font-weight:400">('+Math.round(v/grandTotal*100)+'%)</span></span>'+
      '</div>'
    ).join('');

    // ── LÍNEA: % de cierre por día ──
    document.getElementById('anl-cierre-title').textContent = '% de cierre diario — '+(asesorName||tiendaName);
    const ctxC = document.getElementById('anl-cierre-chart').getContext('2d');
    if(_anlCierreChart) _anlCierreChart.destroy();
    const cierrePorDia = fechas.map(f=>{
      const d=byFecha[f];
      const base=(d.contestaron||0)+(d.noContestaron||0)+(d.waEnviados||0);
      return base>0 ? Math.round((d.finalizados||0)/base*100) : null;
    });
    _anlCierreChart = new Chart(ctxC,{
      type:'line',
      data:{
        labels,
        datasets:[{
          label:'% Cierre',
          data:cierrePorDia,
          borderColor:'#4ade80',
          backgroundColor:'#4ade8020',
          borderWidth:2,
          pointBackgroundColor:'#4ade80',
          pointRadius:4,
          fill:true,
          tension:0.35,
          spanGaps:true,
        }]
      },
      options:{
        responsive:true,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:ctx=>ctx.parsed.y!==null?ctx.parsed.y+'% de cierre':'Sin datos'}}
        },
        scales:{
          x:{ticks:{color:'#64748b',font:{size:10},maxRotation:45},grid:{color:'#1e293b'}},
          y:{ticks:{color:'#64748b',font:{size:11},callback:v=>v+'%'},grid:{color:'#334155'},beginAtZero:true,max:100}
        }
      }
    });

    // ── BARRAS COMPARATIVO ──
    // Si hay tienda seleccionada → comparar asesores de esa tienda
    // Si no hay tienda → comparar tiendas entre sí
    const compWrap = document.getElementById('anl-comparativo-wrap');
    const compTitle = compWrap.querySelector('.anl-card-title');
    let perComp = [];

    if(userFilter && !asesorFilter){
      // Comparar asesores dentro de la tienda
      const tiendaData = results[0]?.data||{};
      perComp = _getAsesoresPorPeriodo(tiendaData).map(x=>({
        name: x.nombre,
        tCont: x.tp>0?Math.min(100,Math.round(x.cont/x.tp*100)):Math.round(x.cont/(x.cont+x.noCont+x.wa||1)*100),
        tCierre: x.tp>0?Math.min(100,Math.round(x.fin/x.tp*100)):Math.min(100,Math.round(x.fin/Math.max(x.cont+x.noCont+x.wa,x.fin,1)*100)),
      }));
      compTitle.textContent = 'Comparativo de asesores — '+tiendaName;
    } else if(!userFilter){
      // Comparar tiendas
      perComp = results.map(({u, data})=>{
        const tot = _aplanarHistorial(data,'');
        let cont=0,noCont=0,wa=0,fin=0,tp=0;
        Object.values(tot).forEach(d=>{cont+=d.contestaron;noCont+=d.noContestaron;wa+=d.waEnviados;fin+=d.finalizados;tp+=d.totalPedidos||0;});
        return {
          name:(_admUsuariosCache.find(x=>x.username===u)||{}).tienda||u,
          tCont:tp>0?Math.min(100,Math.round(cont/tp*100)):Math.round(cont/(cont+noCont+wa||1)*100),
          tCierre:tp>0?Math.min(100,Math.round(fin/tp*100)):Math.min(100,Math.round(fin/Math.max(cont+noCont+wa,fin,1)*100)),
        };
      }).filter(x=>x.tCont>0||x.tCierre>0);
      compTitle.textContent = 'Comparativo de tiendas';
    }

    if(perComp.length>1){
      compWrap.style.display='block';
      const ctxComp = document.getElementById('anl-comparativo-chart').getContext('2d');
      if(_anlCompChart) _anlCompChart.destroy();
      _anlCompChart = new Chart(ctxComp,{
        type:'bar',
        data:{
          labels: perComp.map(x=>x.name),
          datasets:[
            {label:'Tasa de contacto %', data:perComp.map(x=>x.tCont),  backgroundColor:'#60a5fa55',borderColor:'#60a5fa',borderWidth:2,borderRadius:6},
            {label:'Tasa de cierre %',   data:perComp.map(x=>x.tCierre),backgroundColor:'#4ade8055',borderColor:'#4ade80',borderWidth:2,borderRadius:6},
          ]
        },
        options:{
          responsive:true,
          plugins:{
            legend:{labels:{color:'#94a3b8',font:{size:11},boxWidth:12,padding:14}},
            tooltip:{mode:'index',intersect:false,callbacks:{label:ctx=>ctx.dataset.label+': '+ctx.parsed.y+'%'}}
          },
          scales:{
            x:{ticks:{color:'#cbd5e1',font:{size:11}},grid:{color:'#1e293b'}},
            y:{ticks:{color:'#64748b',font:{size:11},callback:v=>v+'%'},grid:{color:'#334155'},beginAtZero:true,max:100}
          }
        }
      });
    } else {
      compWrap.style.display = 'none';
    }

    // Chart — todas las gestiones como barras agrupadas
    const ctx = document.getElementById('anl-chart').getContext('2d');
    if(_anlChart) _anlChart.destroy();
    _anlChart = new Chart(ctx,{
      type:'bar',
      data:{
        labels,
        datasets:[
          {label:'Finalizados',       data:fechas.map(f=>byFecha[f].finalizados),     backgroundColor:'#4ade8044',borderColor:'#4ade80',borderWidth:2,borderRadius:5},
          {label:'Contestaron',       data:fechas.map(f=>byFecha[f].contestaron),     backgroundColor:'#60a5fa44',borderColor:'#60a5fa',borderWidth:2,borderRadius:5},
          {label:'No contestaron',    data:fechas.map(f=>byFecha[f].noContestaron),   backgroundColor:'#f8717144',borderColor:'#f87171',borderWidth:2,borderRadius:5},
          {label:'WA enviados',       data:fechas.map(f=>byFecha[f].waEnviados),      backgroundColor:'#a78bfa44',borderColor:'#a78bfa',borderWidth:2,borderRadius:5},
          {label:'Devoluciones',      data:fechas.map(f=>byFecha[f].devoluciones),    backgroundColor:'#fb923c44',borderColor:'#fb923c',borderWidth:2,borderRadius:5},
          {label:'Guías Sin Gestión',   data:fechas.map(f=>byFecha[f].guiasSinGestion),   backgroundColor:'#93c5fd44',borderColor:'#93c5fd',borderWidth:2,borderRadius:5},
          {label:'Tránsito Sin Gestión',data:fechas.map(f=>byFecha[f].transitoSinGestion), backgroundColor:'#67e8f944',borderColor:'#67e8f9',borderWidth:2,borderRadius:5},
        ]
      },
      options:{
        responsive:true,
        plugins:{
          legend:{labels:{color:'#94a3b8',font:{size:11},boxWidth:12,padding:16}},
          tooltip:{mode:'index',intersect:false}
        },
        scales:{
          x:{ticks:{color:'#64748b',font:{size:10},maxRotation:45},grid:{color:'#1e293b'}},
          y:{ticks:{color:'#64748b',font:{size:11},stepSize:1},grid:{color:'#334155'},beginAtZero:true}
        }
      }
    });

    // Tabla detalle (solo si hay tienda o asesor seleccionado)
    if(!userFilter){
      document.getElementById('anl-table-wrap').innerHTML='<div class="anl-empty">Selecciona una tienda para ver el detalle día a día</div>';
      const _ac=document.getElementById('anl-asesor-table-card');if(_ac)_ac.style.display='none';
      return;
    }

    // ── TABLA RESUMEN POR ASESOR (cuando hay tienda seleccionada y no hay asesor específico) ──
    const asesorWrap = document.getElementById('anl-asesor-table-wrap');
    const asesorCard = document.getElementById('anl-asesor-table-card');
    if(asesorWrap){
      if(!asesorFilter){
        const tiendaData = results[0]?.data||{};
        const asesores = _getAsesoresPorPeriodo(tiendaData);
        if(asesores.length > 0){
          if(asesorCard) asesorCard.style.display='block';
          let aRows = '';
          asesores.sort((a,b)=>b.fin-a.fin).forEach(x=>{
            const total = x.cont+x.noCont+x.wa;
            const tCont = x.tp>0?Math.min(100,Math.round(x.cont/x.tp*100)):(total>0?Math.round(x.cont/total*100):0);
            const tCierre = x.tp>0?Math.min(100,Math.round(x.fin/x.tp*100)):Math.min(100,Math.round(x.fin/Math.max(total,x.fin,1)*100));
            const gpm = x.min>0 ? (x.fin/x.min).toFixed(2) : '—';
            const gc = gpm==='—'?'#64748b':gpm>=1?'#4ade80':gpm>=0.5?'#fbbf24':'#f87171';
            aRows+='<tr>'+
              '<td style="color:#e2e8f0;font-weight:600">'+x.nombre+'</td>'+
              '<td style="color:#60a5fa">'+x.cont+'</td>'+
              '<td style="color:#f87171">'+x.noCont+'</td>'+
              '<td style="color:#a78bfa">'+x.wa+'</td>'+
              '<td style="color:#4ade80;font-weight:700">'+x.fin+'</td>'+
              '<td style="color:#fb923c">'+x.dev+'</td>'+
              '<td style="color:#93c5fd">'+x.gsg+'</td>'+
              '<td style="color:#67e8f9">'+x.tsg+'</td>'+
              '<td style="color:#86efac">'+x.rg+'</td>'+
              '<td style="color:#fda4af">'+x.rsg+'</td>'+
              '<td style="color:'+(tCont>=70?'#4ade80':tCont>=50?'#fbbf24':'#f87171')+'">'+(tCont+'%')+'</td>'+
              '<td style="color:'+(tCierre>=60?'#4ade80':tCierre>=40?'#fbbf24':'#f87171')+';font-weight:700">'+tCierre+'%</td>'+
              '<td style="color:'+gc+';font-weight:700">'+(gpm==='—'?'—':gpm+'/m')+'</td>'+
            '</tr>';
          });
          asesorWrap.innerHTML=
            '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Resumen por asesor</div>'+
            '<table class="anl-table">'+
            '<thead><tr>'+
              '<th style="text-align:left">Asesor</th>'+
              '<th style="color:#60a5fa">✅ Cont.</th>'+
              '<th style="color:#f87171">❌ No cont.</th>'+
              '<th style="color:#a78bfa">📱 WA</th>'+
              '<th style="color:#4ade80">🏁 Final.</th>'+
              '<th style="color:#fb923c">↩️ Dev.</th>'+
              '<th style="color:#93c5fd">📦 S/G</th>'+
              '<th style="color:#67e8f9">🚚 T.ok</th>'+
              '<th style="color:#86efac">✅ R.G</th>'+
              '<th style="color:#fda4af">🚫 R.SG</th>'+
              '<th>% Contacto</th>'+
              '<th>% Cierre</th>'+
              '<th>G/min</th>'+
            '</tr></thead>'+
            '<tbody>'+aRows+'</tbody></table>';
        } else {
          asesorWrap.innerHTML='';
          if(asesorCard) asesorCard.style.display='none';
        }
      } else {
        asesorWrap.innerHTML='';
        if(asesorCard) asesorCard.style.display='none';
      }
    }

    // Obtener datos aplanados del período ya filtrados
    const userHistFlat = _aplanarHistorial(results[0]?.data||{}, asesorFilter);
    const diasFiltrados = fechas.filter(f=>userHistFlat[f]&&(userHistFlat[f].contestaron||userHistFlat[f].finalizados||userHistFlat[f].waEnviados||userHistFlat[f].guiasSinGestion||userHistFlat[f].transitoSinGestion||userHistFlat[f].rechazadosGestionados||userHistFlat[f].rechazadosSinGestion)).reverse();
    const userHist = userHistFlat;
    if(!diasFiltrados.length){
      document.getElementById('anl-table-wrap').innerHTML='<div class="anl-empty">Sin historial en este período'+(asesorFilter?' para este asesor':' para esta tienda')+'</div>';
      return;
    }
    let rows='';
    diasFiltrados.forEach(f=>{
      const d=userHist[f];
      const gpmD = d.minutos>0 ? (d.finalizados/d.minutos).toFixed(2) : '—';
      const gc = gpmD==='—'?'#64748b':gpmD>=1?'#4ade80':gpmD>=0.5?'#fbbf24':'#f87171';
      const [y,m,dd]=f.split('-');
      rows+='<tr>'+
        '<td>'+dd+'/'+m+'/'+y.slice(2)+'</td>'+
        '<td style="color:#60a5fa">'+(d.contestaron||0)+'</td>'+
        '<td style="color:#f87171">'+(d.noContestaron||0)+'</td>'+
        '<td style="color:#a78bfa">'+(d.waEnviados||0)+'</td>'+
        '<td style="color:#4ade80">'+(d.finalizados||0)+'</td>'+
        '<td style="color:#fb923c">'+(d.devoluciones||0)+'</td>'+
        '<td style="color:#93c5fd">'+(d.guiasSinGestion||0)+'</td>'+
        '<td style="color:#67e8f9">'+(d.transitoSinGestion||0)+'</td>'+
        '<td style="color:#86efac">'+(d.rechazadosGestionados||0)+'</td>'+
        '<td style="color:#fda4af">'+(d.rechazadosSinGestion||0)+'</td>'+
        '<td>'+(d.minutos||0)+'m</td>'+
        '<td style="color:'+gc+';font-weight:700">'+(gpmD==='—'?'—':gpmD+'/m')+'</td>'+
      '</tr>';
    });
    document.getElementById('anl-table-wrap').innerHTML=
      '<table class="anl-table">'+
      '<thead><tr><th>Fecha</th><th style="color:#60a5fa">✅ Cont.</th><th style="color:#f87171">❌ No cont.</th><th style="color:#a78bfa">📱 WA</th><th style="color:#4ade80">🏁 Final.</th><th style="color:#fb923c">↩️ Dev.</th><th style="color:#93c5fd">📦 S/G</th><th style="color:#67e8f9">🚚 T.ok</th><th style="color:#86efac">✅ R.G</th><th style="color:#fda4af">🚫 R.SG</th><th>⏱ Mins</th><th>G/min</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>';
  }).catch(e=>{
    console.error('[analitica]', e);
    const w=document.getElementById('anl-table-wrap');
    if(w) w.innerHTML='<div class="anl-empty">No se pudo cargar la analítica: '+esc(e&&e.message||e)+'</div>';
  });
}

function _fmtTiempo(ts){ if(!ts)return'—'; const d=new Date(ts); return d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}); }
function _fmtDuracion(ms){ const m=Math.floor(ms/60000); if(m<1)return'<1m'; if(m<60)return m+'m'; return Math.floor(m/60)+'h '+(m%60)+'m'; }

function _admAbrirAgregar(){
  ['adm-new-user','adm-new-pass','adm-new-asesor','adm-new-tienda'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('adm-new-rol').value='asesor';
  document.getElementById('adm-add-error').style.display='none';
  document.getElementById('adm-add-modal').classList.add('open');
}
function _admCerrarAgregar(){ document.getElementById('adm-add-modal').classList.remove('open'); }

function _admGuardarUsuario(){
  const email=document.getElementById('adm-new-user').value.trim();
  const p=document.getElementById('adm-new-pass').value.trim();
  const a=document.getElementById('adm-new-asesor').value.trim();
  const t=document.getElementById('adm-new-tienda').value.trim();
  const rol=document.getElementById('adm-new-rol').value||'asesor';
  const err=document.getElementById('adm-add-error');
  err.style.display='none';
  if(!email||!p){ err.textContent='Correo y contraseña son obligatorios'; err.style.display='block'; return; }
  if(!email.includes('@')){ err.textContent='Ingresa un correo válido'; err.style.display='block'; return; }
  if(!a){ err.textContent='El nombre completo es obligatorio'; err.style.display='block'; return; }
  if(!t){ err.textContent='La tienda es obligatoria'; err.style.display='block'; return; }
  const secAuth=window._fbSecAuth;
  if(!secAuth){ err.textContent='Error interno. Recarga la página.'; err.style.display='block'; return; }
  secAuth.createUserWithEmailAndPassword(email, p)
    .then(cred=>{
      const uid=cred.user.uid;
      secAuth.signOut();
      return _db.ref('users/'+uid).set({email, username:email, asesor:a, tienda:t, rol, createdAt:Date.now()})
        .then(()=>{
          const empresaActual=localStorage.getItem('lgs_empresa_actual');
          if(empresaActual) _db.ref('empresa_asesores/'+empresaActual+'/'+uid).set(true);
        });
    })
    .then(()=>{ _admCerrarAgregar(); _admCargarDashboard(); toast('✅ Usuario creado'); })
    .catch(e=>{
      let msg='Error: '+e.message;
      if(e.code==='auth/email-already-in-use') msg='Ese correo ya está registrado';
      else if(e.code==='auth/invalid-email') msg='Correo inválido';
      else if(e.code==='auth/weak-password') msg='Contraseña muy débil (mínimo 6 caracteres)';
      err.textContent=msg; err.style.display='block';
    });
}

function _admAbrirEditar(uid, email, asesor, tienda, rol){
  document.getElementById('adm-edit-uid').value = uid;
  document.getElementById('adm-edit-user').value = email;
  document.getElementById('adm-edit-asesor').value = asesor;
  document.getElementById('adm-edit-tienda').value = tienda;
  document.getElementById('adm-edit-rol').value = rol||'asesor';
  document.getElementById('adm-edit-error').style.display = 'none';
  const contenedor = document.getElementById('adm-edit-tiendas');
  contenedor.innerHTML = '<div style="font-size:.7rem;color:var(--text-3);">Cargando tiendas…</div>';
  Promise.all([
    _db.ref('empresas').once('value'),
    _db.ref('admin_empresas/'+localStorage.getItem('lgs_admin_id')).once('value'),
    _db.ref('user_tiendas/'+uid).once('value')
  ]).then(([snapE, snapAE, snapUT])=>{
    const todasEmpresas = snapE.val()||{};
    const misEmpresasIds = Object.keys(snapAE.val()||{});
    const habilitadas = snapUT.val()||{};
    if(!misEmpresasIds.length){ contenedor.innerHTML='<div style="font-size:.7rem;color:var(--text-3);">Sin tiendas disponibles</div>'; return; }
    contenedor.innerHTML = misEmpresasIds.map(empId=>{
      const nombre = (todasEmpresas[empId]||{}).nombre||empId;
      const checked = habilitadas[empId]?'checked':'';
      return `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:.82rem;color:var(--text-1);background:var(--bg-hover);">
        <input type="checkbox" data-empid="${empId}" ${checked} style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;">
        🏪 ${nombre}
      </label>`;
    }).join('');
  });
  document.getElementById('adm-edit-modal').classList.add('open');
  document.getElementById('adm-edit-asesor').focus();
}
function _admCerrarEditar(){ document.getElementById('adm-edit-modal').classList.remove('open'); }

function _admGuardarEdicion(){
  const uid    = document.getElementById('adm-edit-uid').value;
  const asesor = document.getElementById('adm-edit-asesor').value.trim();
  const tienda = document.getElementById('adm-edit-tienda').value.trim();
  const rol    = document.getElementById('adm-edit-rol').value||'asesor';
  const err    = document.getElementById('adm-edit-error');
  if(!asesor){ err.textContent='El nombre es obligatorio'; err.style.display='block'; return; }
  const checkboxes = document.querySelectorAll('#adm-edit-tiendas input[type=checkbox]');
  // Update multi-path atómico: users + user_tiendas + empresa_asesores (simétrico)
  // + presence (nombre visible en el panel En Vivo sin esperar re-login)
  const updates = {};
  updates['users/'+uid+'/asesor'] = asesor;
  updates['users/'+uid+'/tienda'] = tienda||asesor;
  updates['users/'+uid+'/rol'] = rol;
  checkboxes.forEach(cb=>{
    const val = cb.checked ? true : null;
    updates['user_tiendas/'+uid+'/'+cb.dataset.empid] = val;
    updates['empresa_asesores/'+cb.dataset.empid+'/'+uid] = val;
  });
  updates['presence/'+uid+'/asesor'] = asesor;
  updates['presence/'+uid+'/tienda'] = tienda||asesor;
  _db.ref().update(updates).then(()=>{
    _admCerrarEditar();
    _admCargarDashboard();
    toast('✅ Usuario actualizado');
  }).catch(e=>{ err.textContent='Error: '+e.message; err.style.display='block'; });
}

function _admEnviarResetPass(){
  const email=document.getElementById('adm-edit-user').value;
  if(!email){ toast('⚠️ Sin correo'); return; }
  firebase.auth().sendPasswordResetEmail(email)
    .then(()=>{ toast('📧 Email de restablecimiento enviado a '+email); })
    .catch(e=>{ toast('⚠️ Error: '+e.message); });
}

function _admForzarLogout(uid){
  _mConfirm('¿Cerrar sesión remota?','Se cerrará la sesión activa de forma inmediata.',()=>{
    _db.ref('presence/'+uid).update({ force_logout: true, online: false, lastSeen: Date.now() });
    toast('⏻ Sesión cerrada');
  },'danger');
}

function _admEliminarUsuario(uid){
  _mConfirm('¿Eliminar usuario?','Esta acción eliminará permanentemente al usuario. No se puede deshacer.',()=>{
    // Leer sus tiendas primero para limpiar también empresa_asesores (simetría)
    _db.ref('user_tiendas/'+uid).once('value', snapT=>{
      const updates = {};
      updates['users/'+uid] = null;
      updates['presence/'+uid] = null;
      updates['user_tiendas/'+uid] = null;
      Object.keys(snapT.val()||{}).forEach(empId=>{
        updates['empresa_asesores/'+empId+'/'+uid] = null;
      });
      _db.ref().update(updates).then(()=>{
        _admCargarDashboard();
        toast('🗑️ Usuario eliminado');
      });
    });
  },'danger');
}


function _rnkCargar(){
  const userFilter=document.getElementById('rnk-user-filter').value;
  const period=document.getElementById('rnk-period-filter').value;
  const tbody=document.getElementById('rnk-tbody');
  const podio=document.getElementById('rnk-podio');
  tbody.innerHTML='<tr><td colspan="10" class="rnk-empty">Cargando ranking...</td></tr>';
  podio.innerHTML='';
  const fechas=[];
  if(period==='today'){
    fechas.push(new Date().toISOString().slice(0,10));
  } else {
    const dias=parseInt(period);
    for(let i=dias-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);fechas.push(d.toISOString().slice(0,10));}
  }
  const users=userFilter?[userFilter]:_admUsuariosCache.filter(u=>u.uid).map(u=>u.uid);
  const _rnkUserMap=new Map(_admUsuariosCache.map(u=>[u.uid,u]));
  const promises=users.map(u=>_db.ref('historial_diario/'+u).once('value').then(s=>({u,data:s.val()||{},obj:_rnkUserMap.get(u)||{uid:u}})));
  Promise.all(promises).then(results=>{
    const asesores=[];
    results.forEach(({data,obj})=>{
      const keys=Object.keys(data);
      const isNew=keys.length>0&&!keys[0].match(/^\d{4}-\d{2}-\d{2}$/);
      if(isNew){
        Object.entries(data).forEach(([ak,fd])=>{
          let cont=0,noCont=0,wa=0,fin=0,dev=0,min=0,tp=0;
          const nombre=fd[Object.keys(fd)[0]]?.asesorNombre||ak;
          fechas.forEach(f=>{const d=fd[f]||{};cont+=d.contestaron||0;noCont+=d.noContestaron||0;wa+=d.waEnviados||0;fin+=d.finalizados||0;dev+=d.devoluciones||0;min+=d.minutos||0;tp+=d.totalPedidos||0;});
          const total=cont+noCont+wa;
          if(!total&&!fin) return;
          const tCierre=tp>0?Math.min(100,Math.round(fin/tp*100)):Math.min(100,Math.round(fin/Math.max(total,fin,1)*100));
          const tContacto=tp>0?Math.min(100,Math.round(cont/tp*100)):(total>0?Math.round(cont/total*100):0);
          const gpm=min>0?parseFloat((fin/min).toFixed(2)):0;
          const score=Math.max(0,Math.round(fin*5+tCierre*1-dev*4+Math.min(gpm*15,20)));
          asesores.push({nombre,tienda:obj.tienda||obj.username,cont,noCont,wa,fin,dev,min,tCierre,tContacto,gpm,score,total,tp});
        });
      } else {
        let cont=0,noCont=0,wa=0,fin=0,dev=0,min=0,tp=0;
        Object.entries(data).forEach(([f,d])=>{if(!fechas.includes(f))return;cont+=d.contestaron||0;noCont+=d.noContestaron||0;wa+=d.waEnviados||0;fin+=d.finalizados||0;dev+=d.devoluciones||0;min+=d.minutos||0;tp+=d.totalPedidos||0;});
        const total=cont+noCont+wa;
        if(!total&&!fin) return;
        const tCierre=tp>0?Math.min(100,Math.round(fin/tp*100)):Math.min(100,Math.round(fin/Math.max(total,fin,1)*100));
        const tContacto=tp>0?Math.min(100,Math.round(cont/tp*100)):(total>0?Math.round(cont/total*100):0);
        const gpm=min>0?parseFloat((fin/min).toFixed(2)):0;
        const score=Math.max(0,Math.round(fin*5+tCierre*1-dev*4+Math.min(gpm*15,20)));
        asesores.push({nombre:obj.asesor||obj.username,tienda:obj.tienda||obj.username,cont,noCont,wa,fin,dev,min,tCierre,tContacto,gpm,score,total,tp});
      }
    });
    asesores.sort((a,b)=>b.score-a.score);
    const medals=['🥇','🥈','🥉'];
    const podioColors=['gold','silver','bronze'];
    const scoreColors=['#f59e0b','#94a3b8','#cd7c3a'];
    const top3=asesores.slice(0,3);
    while(top3.length<3) top3.push(null);
    podio.innerHTML='';
    top3.forEach((a,i)=>{
      const div=document.createElement('div');
      div.className='rnk-podio-card '+(podioColors[i]||'');
      div.innerHTML=a
        ? '<span class="rnk-medal">'+medals[i]+'</span>'+
          '<div class="rnk-podio-name">'+a.nombre+'</div>'+
          '<div class="rnk-podio-tienda">🏪 '+a.tienda+'</div>'+
          '<div class="rnk-podio-score" style="color:'+scoreColors[i]+'">'+a.score+'</div>'+
          '<div class="rnk-podio-score-lbl">puntos</div>'+
          '<div class="rnk-podio-stats">'+
            '<span class="rnk-mini-stat">🏁 '+a.fin+'</span>'+
            '<span class="rnk-mini-stat">'+a.tCierre+'% cierre</span>'+
            (a.gpm?'<span class="rnk-mini-stat">'+a.gpm+'/min</span>':'')+
          '</div>'
        : '<span class="rnk-medal" style="opacity:.2">'+medals[i]+'</span><div style="color:#0e1c2e;font-size:.75rem;margin-top:8px;">Sin datos</div>';
      podio.appendChild(div);
    });
    if(!asesores.length){
      tbody.innerHTML='<tr><td colspan="10" class="rnk-empty">Sin historial en este período</td></tr>';
      return;
    }
    tbody.innerHTML=asesores.map((a,i)=>{
      const sc=a.score>=150?'#4ade80':a.score>=80?'#fbbf24':'#f87171';
      const sb=a.score>=150?'#14532d20':a.score>=80?'#451a0320':'#450a0a20';
      const cc=a.tCierre>=60?'#4ade80':a.tCierre>=40?'#fbbf24':'#f87171';
      const cco=a.tContacto>=70?'#4ade80':a.tContacto>=50?'#fbbf24':'#f87171';
      const cg=a.gpm>=1?'#4ade80':a.gpm>=0.5?'#fbbf24':'#f87171';
      const badge=i<3?medals[i]+'':'#'+(i+1);
      return '<tr>'+
        '<td><span class="rnk-rank-num">'+badge+'</span></td>'+
        '<td><div class="rnk-rank-name">'+a.nombre+'</div><div class="rnk-rank-tienda">🏪 '+a.tienda+'</div></td>'+
        '<td style="color:#4ade80;font-weight:700">'+a.fin+'</td>'+
        '<td style="color:#60a5fa">'+a.cont+'</td>'+
        '<td style="color:#a78bfa">'+a.wa+'</td>'+
        '<td style="color:#fb923c">'+a.dev+'</td>'+
        '<td style="color:'+cc+';font-weight:700">'+a.tCierre+'%</td>'+
        '<td style="color:'+cco+'">'+a.tContacto+'%</td>'+
        '<td style="color:'+cg+';font-weight:700">'+(a.gpm||'—')+'/m</td>'+
        '<td><span class="rnk-score-pill" style="background:'+sb+';color:'+sc+'">'+a.score+'</span></td>'+
      '</tr>';
    }).join('');
  });
}

// ===== MI NEGOCIO (datos del negocio del admin: nombre, logo, país, etc.) =====
let _admNegocioLogoData=null; // base64 del logo elegido, pendiente de guardar; '' = quitar; null = sin cambios

function _admCargarNegocio(){
  const adminId = localStorage.getItem('lgs_admin_id');
  if(!adminId||typeof _db==='undefined')return;
  _db.ref('admins/'+adminId+'/negocio').once('value', snap=>{
    const n = snap.val()||{};
    _admNegocioAplicarHeader(n);
    const elN=document.getElementById('neg-nombre'); if(elN) elN.value=n.nombre||'';
    const elP=document.getElementById('neg-pais'); if(elP) elP.value=n.pais||'';
    const elU=document.getElementById('neg-ubicacion'); if(elU) elU.value=n.ubicacion||'';
    const elCE=document.getElementById('neg-contacto-email'); if(elCE) elCE.value=n.contactoEmail||'';
    const elCT=document.getElementById('neg-contacto-tel'); if(elCT) elCT.value=n.contactoTelefono||'';
    _admNegocioLogoData = null;
    const prev=document.getElementById('neg-logo-preview');
    if(prev) prev.innerHTML = n.logo ? '<img src="'+n.logo+'" style="width:100%;height:100%;object-fit:cover;">' : '🏢';
  });
  _admCargarCoadmins();
}

// ── Administradores compartidos del negocio ──────────────────────────
// Comparte acceso a TODAS mis tiendas con otra cuenta admin ya existente,
// replicando admin_empresas/{miId}/{empId} bajo admin_empresas/{otroId}/{empId}
let _admCoadminMisIds=[];
let _admCoadminDisponibles=[];

function _admCargarCoadmins(){
  const adminId = localStorage.getItem('lgs_admin_id');
  const actDiv=document.getElementById('neg-coadmins-actuales');
  if(!adminId||typeof _db==='undefined'||!actDiv)return;
  Promise.all([
    _db.ref('admin_empresas/'+adminId).once('value'),
    _db.ref('admin_empresas').once('value'),
    _db.ref('admins').once('value'),
    _db.ref('users').once('value')
  ]).then(([snapMios, snapTodos, snapAdmins, snapUsers])=>{
    const misIds = Object.keys(snapMios.val()||{});
    _admCoadminMisIds = misIds;
    const todosAE = snapTodos.val()||{};
    const todosAdmins = snapAdmins.val()||{};
    const todosUsers = snapUsers.val()||{};
    const emailDe = uid=>(todosAdmins[uid]||{}).email || (todosUsers[uid]||{}).email || uid;
    const coadmins=[];
    Object.entries(todosAE).forEach(([otroId, empsObj])=>{
      if(otroId===adminId)return;
      const compartidas = Object.keys(empsObj||{}).filter(e=>misIds.includes(e));
      if(compartidas.length) coadmins.push({uid:otroId, email:emailDe(otroId), compartidas});
    });
    actDiv.innerHTML = coadmins.length ? coadmins.map(c=>`
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border);">
        <div style="width:26px;height:26px;border-radius:7px;background:#131920;display:flex;align-items:center;justify-content:center;color:white;font-size:.65rem;font-weight:800;flex-shrink:0;">${(c.email||'?').slice(0,2).toUpperCase()}</div>
        <div style="flex:1;"><div style="font-size:.76rem;font-weight:700;color:var(--text-1);">${c.email}</div><div style="font-size:.6rem;color:var(--text-3);">${c.compartidas.length} tienda${c.compartidas.length!==1?'s':''} compartida${c.compartidas.length!==1?'s':''}</div></div>
        <button onclick="_admQuitarCoadmin('${c.uid}')" style="background:var(--danger-soft);color:var(--danger);border:1px solid rgba(230,57,70,.35);border-radius:6px;padding:3px 9px;font-size:.65rem;font-weight:700;cursor:pointer;">Quitar</button>
      </div>`).join('') : '<div style="color:var(--text-3);font-size:.72rem;font-style:italic;">Solo tú administras este negocio.</div>';
    const idsCoadmin = coadmins.map(c=>c.uid);
    // Disponibles para agregar: cualquier cuenta ya existente (admin de otro negocio
    // o usuario/asesor de una tienda) que aún no comparta acceso conmigo
    const disponiblesMap = new Map();
    Object.entries(todosAdmins).forEach(([uid,d])=>{
      if(uid===adminId||idsCoadmin.includes(uid))return;
      disponiblesMap.set(uid,{uid, email:d.email||uid});
    });
    Object.entries(todosUsers).forEach(([uid,d])=>{
      if(uid===adminId||idsCoadmin.includes(uid)||disponiblesMap.has(uid))return;
      disponiblesMap.set(uid,{uid, email:d.email||uid});
    });
    _admCoadminDisponibles = Array.from(disponiblesMap.values());
    _admCoadminFiltrar(document.getElementById('neg-coadmin-buscar')?document.getElementById('neg-coadmin-buscar').value:'');
  });
}

function _admCoadminFiltrar(q){
  const disDiv=document.getElementById('neg-coadmins-disponibles');
  if(!disDiv)return;
  q=(q||'').trim();
  if(!q){ disDiv.innerHTML='<div style="color:var(--text-3);font-size:.7rem;padding:4px;">Escribe un correo para buscar.</div>'; return; }
  const filtrados = _admCoadminDisponibles.filter(u=>(u.email||'').toLowerCase().includes(q.toLowerCase()));
  disDiv.innerHTML = filtrados.length ? filtrados.map(u=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--success-soft);border-radius:8px;border:1px solid #bbf7d0;">
      <div style="flex:1;font-size:.74rem;color:var(--text-1);">${u.email}</div>
      <button onclick="_admAgregarCoadmin('${u.uid}')" style="background:#16a34a;color:white;border:none;border-radius:6px;padding:3px 9px;font-size:.65rem;font-weight:700;cursor:pointer;">+ Agregar</button>
    </div>`).join('') : '<div style="color:var(--text-3);font-size:.7rem;padding:4px;">Sin resultados. La persona debe tener ya una cuenta creada en la plataforma (como administrador, dueño o asesor).</div>';
}

function _admAgregarCoadmin(uid){
  if(!_admCoadminMisIds.length){toast('No tienes tiendas para compartir todavía');return;}
  const finalizar=()=>{
    const updates={};
    _admCoadminMisIds.forEach(empId=>{ updates['admin_empresas/'+uid+'/'+empId]=true; });
    _db.ref().update(updates).then(()=>{
      toast('✅ Ahora también es administrador de tus tiendas');
      const b=document.getElementById('neg-coadmin-buscar'); if(b)b.value='';
      _admCargarCoadmins();
    }).catch(e=>toast('⚠️ Error: '+e.message));
  };
  // Si esta cuenta todavía no tiene registro en /admins (era solo dueño/asesor
  // de tienda), se lo creamos ahora para que quede promovida a admin también
  _db.ref('admins/'+uid).once('value', snapAdm=>{
    if(snapAdm.exists()){ finalizar(); return; }
    _db.ref('users/'+uid).once('value', snapU=>{
      const u=snapU.val()||{};
      _db.ref('admins/'+uid).set({email:u.email||'', username:u.email||uid, createdAt:Date.now(), promovidoDeUsuario:true}).then(finalizar);
    });
  });
}

function _admQuitarCoadmin(uid){
  if(!confirm('¿Quitar el acceso de este administrador a tus tiendas?'))return;
  const updates={};
  _admCoadminMisIds.forEach(empId=>{ updates['admin_empresas/'+uid+'/'+empId]=null; });
  _db.ref().update(updates).then(()=>{
    toast('↩️ Acceso removido');
    _admCargarCoadmins();
  }).catch(e=>toast('⚠️ Error: '+e.message));
}

function _admNegocioAplicarHeader(n){
  const sub=document.getElementById('adm-header-sub');
  if(sub) sub.textContent = n.nombre ? n.nombre : 'Panel de Administración';
  const logoEl=document.getElementById('adm-header-logo');
  if(logoEl) logoEl.innerHTML = n.logo ? '<img src="'+n.logo+'" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">' : '🛡️';
  const footerLbl=document.getElementById('adm-sidebar-user-lbl');
  if(footerLbl) footerLbl.textContent = n.nombre ? n.nombre : 'Administrador';
}

function _admNegocioLogoChange(input){
  const file=input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const maxW=200;
      const scale=Math.min(1, maxW/img.width);
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.width*scale));
      canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      _admNegocioLogoData = canvas.toDataURL('image/jpeg',0.85);
      const prev=document.getElementById('neg-logo-preview');
      if(prev) prev.innerHTML = '<img src="'+_admNegocioLogoData+'" style="width:100%;height:100%;object-fit:cover;">';
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
  input.value='';
}

function _admNegocioQuitarLogo(){
  _admNegocioLogoData = '';
  const prev=document.getElementById('neg-logo-preview');
  if(prev) prev.innerHTML = '🏢';
}

function _admGuardarNegocio(){
  const adminId = localStorage.getItem('lgs_admin_id');
  if(!adminId||typeof _db==='undefined')return;
  const datos = {
    nombre: (document.getElementById('neg-nombre').value||'').trim(),
    pais: (document.getElementById('neg-pais').value||'').trim(),
    ubicacion: (document.getElementById('neg-ubicacion').value||'').trim(),
    contactoEmail: (document.getElementById('neg-contacto-email').value||'').trim(),
    contactoTelefono: (document.getElementById('neg-contacto-tel').value||'').trim()
  };
  if(_admNegocioLogoData) datos.logo = _admNegocioLogoData; // nuevo logo elegido en esta sesión
  const ref = _db.ref('admins/'+adminId+'/negocio');
  const guardar = _admNegocioLogoData===''
    ? ref.child('logo').remove().then(()=>ref.update(datos))
    : ref.update(datos);
  guardar.then(()=>{
    _admNegocioLogoData=null;
    _admCargarNegocio();
    const msg=document.getElementById('neg-guardado-msg');
    if(msg){ msg.style.display='inline'; setTimeout(()=>{msg.style.display='none';}, 2500); }
    toast('✅ Datos del negocio guardados');
  }).catch(e=>toast('⚠️ Error guardando: '+e.message));
}

// ===== GESTIÓN DE EMPRESAS =====
// ── REPORTES CONSOLIDADOS (todas las tiendas) ────────────────────────
// Cada tienda sincroniza sus guías "para recomendar"/"para reportar" a
// logistica_guias/{empId} al cargar su Excel (ver _syncGuiasReporteAdmin).
// Este tab del admin las junta todas en un solo Excel descargable.
let _admRepDatos=[];

function _admCargarReportes(){
  const adminId = localStorage.getItem('lgs_admin_id');
  const wrap = document.getElementById('adm-rep-tabla');
  const btn = document.getElementById('adm-rep-btn-descargar');
  const totalEl = document.getElementById('adm-rep-total');
  if(!adminId){ if(wrap) wrap.innerHTML='<div class="adm-empty">Sin sesión de administrador.</div>'; return; }
  if(btn) btn.disabled=true;
  if(totalEl) totalEl.textContent='';
  if(wrap) wrap.innerHTML='<div class="adm-empty">Cargando...</div>';
  Promise.all([
    _db.ref('admin_empresas/'+adminId).once('value'),
    _db.ref('empresas').once('value'),
    _db.ref('logistica_guias').once('value')
  ]).then(([snapAE, snapEmpresas, snapGuias])=>{
    const misIds = Object.keys(snapAE.val()||{});
    const todasEmpresas = snapEmpresas.val()||{};
    const todasGuias = snapGuias.val()||{};
    const filas=[];
    const porTienda=[];
    misIds.forEach(empId=>{
      const emp = todasEmpresas[empId];
      if(!emp) return;
      const nodo = todasGuias[empId];
      const guiasObj = (nodo&&nodo.guias)||{};
      const lista = Object.values(guiasObj);
      lista.forEach(g=>{
        filas.push({
          'NUMERO DE GUIA': g.guia||'',
          'TRANSPORTADORA': g.transportadora||'',
          'ESTATUS': g.estatus||'',
          'FECHA ULT MOV': g.fechaMov||'',
          'TIENDA': emp.nombre||empId,
          _grupo: g.grupo||'reportar'
        });
      });
      const cantRecomendar = lista.filter(g=>(g.grupo||'reportar')==='recomendar').length;
      const cantReportar = lista.length - cantRecomendar;
      porTienda.push({
        nombre: emp.nombre||empId,
        cant: lista.length,
        cantRecomendar, cantReportar,
        actualizado: (nodo&&nodo.actualizado)?new Date(nodo.actualizado).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}):'—'
      });
    });
    _admRepDatos = filas;
    const tiendasConDatos = porTienda.filter(t=>t.cant>0).length;
    if(totalEl){
      const totRecomendar=filas.filter(f=>f._grupo==='recomendar').length;
      const totReportar=filas.length-totRecomendar;
      totalEl.textContent = filas.length+' guías de '+tiendasConDatos+' tienda'+(tiendasConDatos!==1?'s':'')+' · 📢 '+totRecomendar+' para recomendar · 🚩 '+totReportar+' para reportar';
    }
    if(btn) btn.disabled = filas.length===0;
    if(wrap){
      if(!porTienda.length){
        wrap.innerHTML='<div class="adm-empty">No tienes tiendas registradas.</div>';
      } else {
        wrap.innerHTML=`<table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;padding:7px 10px;font-size:.65rem;font-weight:700;color:var(--text-2);border-bottom:1.5px solid var(--border);">Tienda</th>
            <th style="text-align:right;padding:7px 10px;font-size:.65rem;font-weight:700;color:#0e7490;border-bottom:1.5px solid var(--border);">📢 Recomendar</th>
            <th style="text-align:right;padding:7px 10px;font-size:.65rem;font-weight:700;color:#b91c1c;border-bottom:1.5px solid var(--border);">🚩 Reportar</th>
            <th style="text-align:right;padding:7px 10px;font-size:.65rem;font-weight:700;color:var(--text-2);border-bottom:1.5px solid var(--border);">Total</th>
            <th style="text-align:right;padding:7px 10px;font-size:.65rem;font-weight:700;color:var(--text-2);border-bottom:1.5px solid var(--border);">Última carga de Excel</th>
          </tr></thead>
          <tbody>${porTienda.map(t=>`<tr>
            <td style="padding:6px 10px;font-size:.73rem;color:var(--text-1);font-weight:600;border-bottom:1px solid var(--border);">${t.nombre}</td>
            <td style="padding:6px 10px;font-size:.73rem;text-align:right;color:${t.cantRecomendar>0?'#0e7490':'var(--text-3)'};border-bottom:1px solid var(--border);">${t.cantRecomendar}</td>
            <td style="padding:6px 10px;font-size:.73rem;text-align:right;color:${t.cantReportar>0?'#b91c1c':'var(--text-3)'};border-bottom:1px solid var(--border);">${t.cantReportar}</td>
            <td style="padding:6px 10px;font-size:.73rem;text-align:right;font-weight:700;color:${t.cant>0?'var(--text-1)':'var(--text-3)'};border-bottom:1px solid var(--border);">${t.cant}</td>
            <td style="padding:6px 10px;font-size:.68rem;text-align:right;color:var(--text-3);border-bottom:1px solid var(--border);">${t.actualizado}</td>
          </tr>`).join('')}</tbody>
        </table>`;
      }
    }
  }).catch(()=>{
    if(wrap) wrap.innerHTML='<div class="adm-empty">Error cargando reportes.</div>';
  });
}

function _admDescargarReporteConsolidado(){
  if(!_admRepDatos.length){toast('No hay guías para exportar');return;}
  toast('⏳ Generando Excel...');
  _cargarLib(_LIB_XLSX).then(()=>{
    const cols=['NUMERO DE GUIA','TRANSPORTADORA','ESTATUS','FECHA ULT MOV','TIENDA'];
    const recomendar=_admRepDatos.filter(f=>f._grupo==='recomendar');
    const reportar=_admRepDatos.filter(f=>f._grupo!=='recomendar');
    const wb = XLSX.utils.book_new();
    const agregarHoja=(filas,nombreHoja)=>{
      const ws = XLSX.utils.json_to_sheet(filas, {header:cols});
      ws['!cols']=[18,22,26,16,22].map(w=>({wch:w}));
      XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
    };
    agregarHoja(recomendar, 'Guías para recomendar');
    agregarHoja(reportar, 'Guías para reportar');
    const hoy = new Date().toLocaleDateString('es-CO').replace(/\//g,'-');
    XLSX.writeFile(wb, 'Reporte_Guias_Todas_Tiendas_'+hoy+'.xlsx');
    toast('📤 Reporte consolidado descargado');
  }).catch(e=>toast('⚠️ No se pudo generar el Excel: '+(e&&e.message||e)));
}

function _admCargarEmpresas(){
  const adminId = localStorage.getItem('lgs_admin_id');
  if(!adminId) return;
  Promise.all([
    _db.ref('admin_empresas/'+adminId).once('value'),
    _db.ref('empresas').once('value'),
    _db.ref('empresa_asesores').once('value'),
    _db.ref('users').once('value')
  ]).then(([snapAE, snapEmpresas, snapEAs, snapUsers])=>{
    const misIds = Object.keys(snapAE.val()||{});
    const todasEmpresas = snapEmpresas.val()||{};
    const empresaAsesores = snapEAs.val()||{};
    const todosUsers = Object.values(snapUsers.val()||{});
    const list = document.getElementById('adm-empresas-list');
    list.innerHTML='';
    if(!misIds.length){list.innerHTML='<div class="adm-empty">No tienes empresas. Crea la primera.</div>';return;}
    misIds.forEach(empId=>{
      const emp = todasEmpresas[empId];
      if(!emp) return;
      const asesorUsernames = Object.keys(empresaAsesores[empId]||{});
      const card = document.createElement('div');
      card.style.cssText='background:var(--bg-card);border-radius:12px;border:1.5px solid var(--border);padding:16px;';
      const monedaTxt = emp.moneda?(emp.moneda.simbolo+' '+(emp.moneda.codigo||'')):'';
      card.innerHTML=`
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-weight:800;color:var(--text-1);font-size:.9rem;">🏢 ${emp.nombre}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button onclick="_admEntrarTienda('${empId}','${emp.nombre.replace(/'/g,"\\'")}')" style="background:#131920;color:white;border:none;border-radius:7px;padding:5px 12px;font-size:.7rem;font-weight:700;cursor:pointer;">→ Entrar a tienda</button>
            <button onclick="_admAbrirEditarEmpresa('${empId}')" style="background:var(--bg-hover);color:var(--text-2);border:1.5px solid var(--border);border-radius:7px;padding:5px 12px;font-size:.7rem;font-weight:700;cursor:pointer;">✏️ Editar</button>
            <button onclick="_admGestionarEmpresa('${empId}')" style="background:var(--bg-hover);color:var(--text-2);border:1.5px solid var(--border);border-radius:7px;padding:5px 12px;font-size:.7rem;font-weight:700;cursor:pointer;">Gestionar asesores</button>
          </div>
        </div>
        <div style="font-size:.72rem;color:var(--text-3);">${asesorUsernames.length} asesor${asesorUsernames.length!==1?'es':''} asignado${asesorUsernames.length!==1?'s':''}${emp.pais?' &nbsp;·&nbsp; 🌍 '+emp.pais:''}${monedaTxt?' &nbsp;·&nbsp; 💱 '+monedaTxt:''}</div>
      `;
      list.appendChild(card);
    });
  });
}

// ── Editar tienda: nombre, país y moneda ────────────────────────────────
let _meeEmpId=null, _meeNombreOriginal='';

window._admAbrirEditarEmpresa = function(empId){
  _meeEmpId = empId;
  const err=document.getElementById('modal-editar-empresa-error'); err.style.display='none';
  document.getElementById('mee-warn').style.display='none';
  _db.ref('empresas/'+empId).once('value', snap=>{
    const emp = snap.val()||{};
    _meeNombreOriginal = emp.nombre||'';
    const mon = emp.moneda||{codigo:'COP',simbolo:'$'};
    document.getElementById('mee-nombre').value = _meeNombreOriginal;
    document.getElementById('mee-pais').value = emp.pais||'';
    document.getElementById('mee-simbolo').value = mon.simbolo||'$';
    document.getElementById('mee-codigo').value = mon.codigo||'COP';
    const match = _CF_MONEDAS.find(m=>m.codigo===mon.codigo&&m.simbolo===mon.simbolo);
    const sel = document.getElementById('mee-preset');
    sel.innerHTML = _CF_MONEDAS.map(m=>`<option value="${m.codigo}|${m.simbolo}" ${match&&match.codigo===m.codigo?'selected':''}>${m.label}</option>`).join('')
      + `<option value="custom" ${match?'':'selected'}>Personalizado…</option>`;
    document.getElementById('mee-nombre').oninput = _meeCheckNombreCambio;
    document.getElementById('modal-editar-empresa').classList.add('open');
  });
};

function _meeCheckNombreCambio(){
  const actual=(document.getElementById('mee-nombre').value||'').trim();
  const warn=document.getElementById('mee-warn');
  warn.style.display = (actual && _gdKey(actual)!==_gdKey(_meeNombreOriginal)) ? 'block':'none';
}

window._meeAplicarPreset = function(v){
  if(v==='custom')return;
  const [codigo,simbolo]=v.split('|');
  const preset=_CF_MONEDAS.find(m=>m.codigo===codigo&&m.simbolo===simbolo);
  document.getElementById('mee-simbolo').value=simbolo;
  document.getElementById('mee-codigo').value=codigo;
  if(preset) document.getElementById('mee-pais').value=preset.pais;
};

window._meeCerrar = function(){
  document.getElementById('modal-editar-empresa').classList.remove('open');
  _meeEmpId=null;
};

window._meeGuardar = function(){
  const err=document.getElementById('modal-editar-empresa-error');
  err.style.display='none';
  const nombre=(document.getElementById('mee-nombre').value||'').trim();
  const pais=(document.getElementById('mee-pais').value||'').trim();
  const simbolo=(document.getElementById('mee-simbolo').value||'$').trim()||'$';
  const codigo=(document.getElementById('mee-codigo').value||'').trim().toUpperCase()||'COP';
  if(!nombre){err.textContent='Escribe el nombre de la tienda';err.style.display='block';return;}
  if(!_meeEmpId)return;
  const empId=_meeEmpId;
  const oldKey=_gdKey(_meeNombreOriginal);
  const newKey=_gdKey(nombre);
  const rename=_meeNombreOriginal && oldKey!==newKey;
  const btn=document.querySelector('#modal-editar-empresa .adm-modal-btn.primary');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  const moneda={codigo,simbolo};
  _db.ref('empresas/'+empId).update({nombre,pais,moneda}).then(()=>{
    if(!rename){
      return _db.ref('control_financiero/'+newKey+'/config').update({moneda});
    }
    // El nombre cambió → la clave de control_financiero/gestiones_diarias
    // (derivada del nombre) también cambia. Migramos el historial para no perderlo.
    // ro/novedades/anticipos también se clavaban por nombre y no se migraban:
    // al renombrar quedaban huérfanos (así se perdieron los registros de
    // ro/frankaro al pasar la tienda a "Frankaro Colombia").
    const RAICES_POR_NOMBRE=['control_financiero','gestiones_diarias','ro','novedades','anticipos'];
    return Promise.all(RAICES_POR_NOMBRE.map(r=>_db.ref(r+'/'+oldKey).once('value')))
      .then(snaps=>{
      const tareas=[];
      snaps.forEach((snap,i)=>{
        const raiz=RAICES_POR_NOMBRE[i];
        if(!snap.exists()){
          if(raiz==='control_financiero') tareas.push(_db.ref('control_financiero/'+newKey+'/config').update({moneda}));
          return;
        }
        let data=snap.val();
        if(raiz==='control_financiero'){
          data=Object.assign({},data);
          data.config=Object.assign({},data.config||{},{moneda});
        }
        tareas.push(_db.ref(raiz+'/'+newKey).set(data).then(()=>_db.ref(raiz+'/'+oldKey).remove()));
      });
      return Promise.all(tareas);
    });
  }).then(()=>{
    if(btn){btn.disabled=false;btn.textContent='Guardar cambios';}
    _meeCerrar();
    _admCargarEmpresas();
    toast('✅ Tienda actualizada'+(rename?' — historial migrado a la nueva clave':''));
  }).catch(e=>{
    if(btn){btn.disabled=false;btn.textContent='Guardar cambios';}
    err.textContent='Error: '+e.message; err.style.display='block';
  });
};

window._admEntrarTienda = function(empId, empNombre){
  const adminId = localStorage.getItem('lgs_admin_id');
  const adminEmail = localStorage.getItem('lgs_admin_user')||'';
  if(!adminId) return;
  _db.ref('users/'+adminId).once('value', snapU=>{
    const u = snapU.val()||{};
    const nombreAsesor = u.asesor || adminEmail.split('@')[0] || 'Admin';
    window._currentRol = u.rol||'dueno';
    // Ocultar panel admin y entrar a la tienda
    document.getElementById('admin-panel').classList.remove('visible');
    window._cameFromAdmin = true;
    const btnV = document.getElementById('mss-btn-volver-admin');
    if(btnV) btnV.style.display = 'block';
    _entrarApp(adminId, empNombre, nombreAsesor, empId);
  });
};

window._volverAlAdmin = function(){
  const btnV = document.getElementById('mss-btn-volver-admin');
  if(btnV) btnV.style.display = 'none';
  _ocultarTodosModos();
  document.getElementById('mode-select-screen').style.display = 'none';
  if(window._cameFromAdmin){
    // Se entró viendo una empresa puntual desde el Panel Admin: volver ahí
    window._cameFromAdmin = false;
    localStorage.setItem('lgs_auth','admin');
    _showAdminGlobal();
    _admCargarDashboard();
  } else {
    // Se entró eligiendo un perfil desde el selector de roles: volver ahí
    _volverSelectorRol();
  }
};

window._admAbrirCrearEmpresa = function(){
  const err = document.getElementById('modal-empresa-error');
  err.style.display='none';
  document.getElementById('modal-crear-empresa').classList.add('open');
  setTimeout(()=>document.getElementById('modal-empresa-nombre').focus(),100);
};
window._mCrearEmpresaCerrar = function(){
  document.getElementById('modal-crear-empresa').classList.remove('open');
  document.getElementById('modal-empresa-nombre').value='';
  document.getElementById('modal-empresa-error').style.display='none';
};
window._mCrearEmpresaOk = function(){
  const nombre = document.getElementById('modal-empresa-nombre').value.trim();
  const err = document.getElementById('modal-empresa-error');
  if(!nombre){ err.textContent='Escribe el nombre de la empresa'; err.style.display='block'; return; }
  const adminId = localStorage.getItem('lgs_admin_id');
  if(!adminId){ err.textContent='Error: sesión no encontrada'; err.style.display='block'; return; }
  const ref = _db.ref('empresas').push();
  ref.set({nombre, creadoPor:adminId, createdAt:Date.now()}).then(()=>{
    _db.ref('admin_empresas/'+adminId+'/'+ref.key).set(true).then(()=>{
      _mCrearEmpresaCerrar();
      _admCargarEmpresas();
      _admCargarDashboard();
      toast('🏢 Empresa "'+nombre+'" creada');
    });
  });
};

let _mgaEmpresaId = null;
let _mgaDisponibles = [];

window._admGestionarEmpresa = function(empresaId){
  _mgaEmpresaId = empresaId;
  Promise.all([
    _db.ref('empresa_asesores/'+empresaId).once('value'),
    _db.ref('users').once('value'),
    _db.ref('admins').once('value'),
    _db.ref('empresas/'+empresaId).once('value')
  ]).then(([snapEA, snapUsers, snapAdmins, snapEmp])=>{
    const asignados = Object.keys(snapEA.val()||{});
    const todosUsers = Object.entries(snapUsers.val()||{}).map(([uid,d])=>({uid,...d}));
    // Incluir admins que no estén ya en /users
    Object.entries(snapAdmins.val()||{}).forEach(([uid,d])=>{
      if(!todosUsers.find(u=>u.uid===uid))
        todosUsers.push({uid, email:d.email||'', asesor:d.asesor||d.email||uid, rol:'dueno'});
    });
    const empNombre = (snapEmp.val()||{}).nombre||'Empresa';
    _mgaDisponibles = todosUsers.filter(u=>!asignados.includes(u.uid));

    document.getElementById('mga-titulo').textContent = empNombre;
    document.getElementById('mga-search').value = '';

    // Asesores actuales (busca en users + admins)
    const actDiv = document.getElementById('mga-actuales');
    if(!asignados.length){
      actDiv.innerHTML='<div style="color:var(--text-3);font-size:.75rem;font-style:italic;">Sin asesores asignados</div>';
    } else {
      actDiv.innerHTML = asignados.map(uid=>{
        const u = todosUsers.find(x=>x.uid===uid);
        const nombre = u?(u.asesor||u.email||uid):uid;
        const display = u?(u.email||uid):uid;
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border);">
          <div style="width:26px;height:26px;border-radius:7px;background:#131920;display:flex;align-items:center;justify-content:center;color:white;font-size:.65rem;font-weight:800;flex-shrink:0;">${nombre.slice(0,2).toUpperCase()}</div>
          <div style="flex:1;"><div style="font-size:.76rem;font-weight:700;color:var(--text-1);">${nombre}</div><div style="font-size:.62rem;color:var(--text-3);">${display}</div></div>
          <button onclick="_mgaQuitarAsesor('${uid}')" style="background:var(--danger-soft);color:var(--danger);border:1px solid rgba(230,57,70,.35);border-radius:6px;padding:3px 9px;font-size:.65rem;font-weight:700;cursor:pointer;">Quitar</button>
        </div>`;
      }).join('');
    }

    _mgaFiltrar('');
    document.getElementById('modal-gestionar-asesores').classList.add('open');
  });
};

window._mgaFiltrar = function(q){
  const disDiv = document.getElementById('mga-disponibles');
  const sinDiv = document.getElementById('mga-sin-disponibles');
  const filtrados = q ? _mgaDisponibles.filter(u=>((u.asesor||'').toLowerCase().includes(q.toLowerCase())||(u.email||'').toLowerCase().includes(q.toLowerCase()))) : _mgaDisponibles;
  if(!filtrados.length){
    disDiv.innerHTML='';
    sinDiv.style.display='block';
    return;
  }
  sinDiv.style.display='none';
  disDiv.innerHTML = filtrados.map(u=>{
    const nombre = u.asesor||u.email||u.uid;
    const display = u.email||u.uid;
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--success-soft);border-radius:8px;border:1px solid #bbf7d0;">
      <div style="width:26px;height:26px;border-radius:7px;background:#16a34a;display:flex;align-items:center;justify-content:center;color:white;font-size:.65rem;font-weight:800;flex-shrink:0;">${nombre.slice(0,2).toUpperCase()}</div>
      <div style="flex:1;"><div style="font-size:.76rem;font-weight:700;color:var(--text-1);">${nombre}</div><div style="font-size:.62rem;color:var(--text-3);">${display}</div></div>
      <button onclick="_mgaAgregarAsesor('${u.uid}')" style="background:#16a34a;color:white;border:none;border-radius:6px;padding:3px 9px;font-size:.65rem;font-weight:700;cursor:pointer;">+ Agregar</button>
    </div>`;
  }).join('');
};

window._mgaAgregarAsesor = function(uid){
  if(!_mgaEmpresaId) return;
  // Asegurar que exista /users/{uid} y /user_tiendas/{uid}/{empresaId}
  _db.ref('users/'+uid).once('value', snapU=>{
    const finalize = ()=>{
      const updates = {};
      updates['empresa_asesores/'+_mgaEmpresaId+'/'+uid] = true;
      updates['user_tiendas/'+uid+'/'+_mgaEmpresaId] = true;
      _db.ref().update(updates).then(()=>{
        toast('✅ Agregado a la tienda');
        _admGestionarEmpresa(_mgaEmpresaId);
        _admCargarEmpresas();
        _admCargarDashboard();
      });
    };
    if(!snapU.exists()){
      // Crear registro mínimo si viene de /admins
      _db.ref('admins/'+uid).once('value', snapAdm=>{
        const email = (snapAdm.val()||{}).email||'';
        // Usar nombre real si existe, si no el prefijo del email
        const asesor = (snapAdm.val()||{}).asesor || (email.includes('@') ? email.split('@')[0] : email) || uid;
        _db.ref('users/'+uid).set({ email, asesor, rol:'dueno', createdAt: Date.now() }).then(finalize);
      });
    } else {
      finalize();
    }
  });
};

window._mgaQuitarAsesor = function(username){
  if(!_mgaEmpresaId) return;
  const updates = {};
  updates['empresa_asesores/'+_mgaEmpresaId+'/'+username] = null;
  updates['user_tiendas/'+username+'/'+_mgaEmpresaId] = null;
  _db.ref().update(updates).then(()=>{
    toast('↩️ Asesor quitado de la empresa');
    _admGestionarEmpresa(_mgaEmpresaId);
    _admCargarEmpresas();
    _admCargarDashboard();
  });
};

window._cambiarEmpresa = function(empresaId){
  localStorage.setItem('lgs_empresa_actual', empresaId);
};

// ===== MODALES UNIVERSALES =====
let _mConfirmCallback = null;
window._mConfirm = function(titulo, msg, cb, tipo){
  _mConfirmCallback = cb;
  document.getElementById('modal-confirm-title').textContent = titulo;
  document.getElementById('modal-confirm-msg').textContent = msg;
  const btn = document.getElementById('modal-confirm-ok');
  btn.style.background = tipo==='danger' ? '#dc2626' : '#1e293b';
  btn.textContent = tipo==='danger' ? 'Eliminar' : 'Confirmar';
  document.getElementById('modal-confirm').classList.add('open');
};
window._mConfirmOk = function(){
  document.getElementById('modal-confirm').classList.remove('open');
  if(_mConfirmCallback){ _mConfirmCallback(); _mConfirmCallback=null; }
};
window._mConfirmCancel = function(){
  document.getElementById('modal-confirm').classList.remove('open');
  _mConfirmCallback = null;
};

// ===== MODAL DETALLE ASESOR EN VIVO =====
let _malUsername=null, _malPresRef=null, _malPresData=null, _malInterval=null;

window._malAbrir = function(username){
  _malUsername = username;
  document.getElementById('modal-asesor-live').classList.add('open');
  if(_malPresRef){ _malPresRef.off('value'); _malPresRef=null; }
  _malPresRef = _db.ref('presence/'+username);
  _malPresRef.on('value', snap=>{ _malPresData=snap.val()||{}; _malRender(); });
  if(_malInterval){ clearInterval(_malInterval); _malInterval=null; }
  _malInterval = setInterval(_malActualizarTiempos, 15000);
  // Cargar historial de sesiones (últimas 3)
  _malCargarSesiones(username);
};

function _malCargarSesiones(username){
  const el = document.getElementById('mal-session-hist');
  el.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);">Cargando...</div>';
  _db.ref('session_hist/'+username).orderByChild('start').limitToLast(3).once('value', snap=>{
    const sesiones = [];
    snap.forEach(c=>sesiones.unshift(c.val())); // más reciente primero
    if(!sesiones.length){
      el.innerHTML='<div style="font-size:.72rem;color:var(--text-3);">Sin sesiones registradas aún</div>';
      return;
    }
    el.innerHTML = sesiones.map((s,i)=>{
      const inicio = s.start ? _bordFmtTs(s.start) : '—';
      const fin    = s.end   ? _bordFmtTs(s.end)   : '<span style="color:#10b981;font-weight:700;">En línea ahora</span>';
      const dur    = (s.start && s.end) ? _fmtDuracion(s.end - s.start) : null;
      return (
        '<div style="background:var(--bg-hover);border:1px solid var(--border);border-radius:8px;padding:9px 12px;">'+
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'+
            '<span style="font-size:.7rem;font-weight:700;color:var(--text-1);">'+(i===0?'🕐 Sesión más reciente':'Sesión '+(i+1))+'</span>'+
            (dur?'<span style="font-size:.68rem;color:var(--text-2);background:var(--bg-inset);padding:1px 7px;border-radius:10px;">'+dur+'</span>':'')+
          '</div>'+
          '<div style="font-size:.7rem;color:var(--text-2);">▶ '+inicio+'</div>'+
          '<div style="font-size:.7rem;color:var(--text-2);margin-top:2px;">⏹ '+fin+'</div>'+
        '</div>'
      );
    }).join('');
  });
}

window._malCerrar = function(){
  document.getElementById('modal-asesor-live').classList.remove('open');
  if(_malPresRef){ _malPresRef.off('value'); _malPresRef=null; }
  if(_malInterval){ clearInterval(_malInterval); _malInterval=null; }
  _malPresData=null; _malUsername=null;
};

let _iadmReports=[];

function _malVerInforme(){
  if(!_malUsername)return;
  const nombre=(_malPresData?.asesor)||_malUsername||'—';
  document.getElementById('iadm-sub').textContent='Últimos informes de '+nombre;
  document.getElementById('iadm-body').innerHTML='<div style="text-align:center;padding:24px;font-size:.78rem;color:var(--text-3);">Cargando...</div>';
  document.getElementById('modal-informe-adm').classList.add('open');

  _db.ref('session_reports/'+_malUsername).orderByChild('ts').limitToLast(5).once('value',snap=>{
    const saved=[];
    snap.forEach(c=>saved.unshift({key:c.key,...c.val()}));

    // Si el asesor está en vivo, agregar sesión actual al principio
    const p=_malPresData||{};
    const isOnline=!!p.online&&(Date.now()-(p.lastSeen||0))<120000;
    if(isOnline&&p.loginTime){
      saved.unshift({
        _live:true,ts:Date.now(),asesorNombre:p.asesor||'',tienda:p.tienda||'',
        loginTime:p.loginTime,endTime:Date.now(),
        totalPedidos:p.totalPedidos||0,sessionGestiones:p.sessionGestiones||0,
        contestaron:p.contestaron||0,noContestaron:p.noContestaron||0,
        waEnviados:p.waEnviados||0,finalizados:p.finalizados||0,
        devoluciones:p.devoluciones||0,guiasSinGestion:p.guiasSinGestion||0,
        transitoSinGestion:p.transitoSinGestion||0,
        rechazadosGestionados:p.rechazadosGestionados||0,rechazadosSinGestion:p.rechazadosSinGestion||0,
      });
    }

    if(!saved.length){
      document.getElementById('iadm-body').innerHTML='<div style="text-align:center;padding:30px;font-size:.82rem;color:var(--text-3);">Sin informes guardados aún.<br><small style="font-size:.72rem;">Se guardan automáticamente cuando el asesor cierra su sesión.</small></div>';
      return;
    }
    _iadmReports=saved;
    _iadmLista();
  });
}

function _iadmLista(){
  const html=_iadmReports.map((r,i)=>{
    const fecha=new Date(r.loginTime||r.ts).toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'short'});
    const hora=new Date(r.loginTime||r.ts).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const durMs=r.endTime&&r.loginTime?Math.max(0,r.endTime-r.loginTime):0;
    const dur=_fmtDuracion(durMs);
    const tp=r.totalPedidos||0;
    const gest=r.sessionGestiones||0;
    const pct=tp>0?Math.round(gest/tp*100):0;
    const etiqueta=r._live?'🔴 Sesión actual (EN VIVO)':(i===0?'🕐 Más reciente':'Sesión '+(i+1));
    const borde=r._live?'2px solid #f87171':'1px solid var(--border)';
    return `<div onclick="_iadmDetalle(${i})" style="background:var(--bg-hover);border:${borde};border-radius:10px;padding:11px 14px;cursor:pointer;margin-bottom:8px;" onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='var(--bg-hover)'">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:.74rem;font-weight:700;color:var(--text-1);">${etiqueta}</span>
        <span style="font-size:.67rem;color:var(--text-2);background:var(--bg-inset);padding:1px 7px;border-radius:10px;">${dur}</span>
      </div>
      <div style="font-size:.67rem;color:var(--text-2);margin-bottom:5px;">${fecha} · ${hora}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:.71rem;">
        <span style="color:var(--text-1);font-weight:700;">${tp} pedidos</span>
        <span style="color:var(--text-1);">${gest} gestionados</span>
        <span style="color:var(--text-1);">${pct}% completado</span>
        <span style="color:var(--success);">${r.finalizados||0} finalizados</span>
        <span style="color:var(--accent);">${r.contestaron||0} contest.</span>
      </div>
    </div>`;
  }).join('');
  document.getElementById('iadm-sub').textContent='Últimos informes de '+((_malPresData?.asesor)||_malUsername||'—');
  document.getElementById('iadm-body').innerHTML=html;
}

function _iadmDetalle(idx){
  const r=_iadmReports[idx];
  const tp=r.totalPedidos||0,gest=r.sessionGestiones||0;
  const pend=tp-gest,pct=tp>0?Math.round(gest/tp*100):0;
  const tCierre=tp>0?Math.min(100,Math.round((r.finalizados||0)/tp*100)):0;
  const durMs=r.endTime&&r.loginTime?Math.max(0,r.endTime-r.loginTime):0;
  const fecha=new Date(r.loginTime||r.ts).toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const horaInicio=r.loginTime?new Date(r.loginTime).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}):'—';
  const horaFin=r._live?'En línea ahora':(r.endTime?new Date(r.endTime).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}):'—');
  document.getElementById('iadm-sub').textContent=(r.asesorNombre||_malUsername||'—')+' · '+(r.tienda||'—')+' · '+fecha+' · '+horaInicio+' → '+horaFin+' ('+_fmtDuracion(durMs)+')';
  const st=(val,lbl,color)=>`<div class="pdf-stat"><div class="val" style="color:${color||'#1e293b'}">${val}</div><div class="lbl">${lbl}</div></div>`;
  document.getElementById('iadm-body').innerHTML=`
    <button onclick="_iadmLista()" style="background:none;border:none;color:var(--accent);font-size:.78rem;cursor:pointer;padding:0 0 14px 0;font-weight:600;display:block;">← Volver a la lista</button>
    ${r._live?'<div style="background:var(--danger-soft);border:1px solid rgba(230,57,70,.35);border-radius:8px;padding:7px 12px;font-size:.72rem;color:var(--danger);font-weight:600;margin-bottom:12px;">🔴 Sesión en curso — datos en tiempo real</div>':''}
    <div class="pdf-section"><h3>Resumen general</h3>
      <div class="pdf-stat-grid">
        ${st(tp,'Total pedidos','#1e293b')}
        ${st(gest,'Gestionados','#374151')}
        ${st(pend,'Pendientes','#dc2626')}
        ${st(pct+'%','% Completado','#374151')}
        ${st(r.finalizados||0,'NC Finalizados','#15803d')}
        ${st(tCierre+'%','% Cierre','#334155')}
        ${st(r.contestaron||0,'Contestaron','#2563eb')}
        ${st(r.noContestaron||0,'No contestaron','#64748b')}
        ${st(r.waEnviados||0,'WA enviados','#7c3aed')}
        ${st(r.devoluciones||0,'Devoluciones','#ea580c')}
        ${st(_fmtDuracion(durMs),'Tiempo sesión','#374151')}
      </div>
    </div>
    <div class="pdf-section"><h3>Detalle por tipo</h3>
      <table class="pdf-table">
        <thead><tr><th>Tipo</th><th>Cantidad</th></tr></thead>
        <tbody>
          <tr><td>📦 Guías generadas hoy</td><td><strong>${r.guiasSinGestion||0}</strong></td></tr>
          <tr><td>🚚 En tránsito sin gestión</td><td><strong style="color:${(r.transitoSinGestion||0)>0?'#dc2626':'#374151'}">${r.transitoSinGestion||0}</strong></td></tr>
          <tr><td>✅ Rechazados gestionados</td><td><strong style="color:var(--success)">${r.rechazadosGestionados||0}</strong></td></tr>
          <tr><td>⚠️ Rechazados sin gestión</td><td><strong style="color:${(r.rechazadosSinGestion||0)>0?'#dc2626':'#374151'}">${r.rechazadosSinGestion||0}</strong></td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function _malRender(){
  const p=_malPresData; if(!p) return;
  const isOnline=!!p.online&&(Date.now()-(p.lastSeen||0))<120000;
  const name=p.asesor||_malUsername||'—';
  const color=_avatarColor(name);
  const initials=_avatarInitials(name);
  const av=document.getElementById('mal-avatar');
  av.style.background=color; av.textContent=initials;
  document.getElementById('mal-nombre').textContent=name;
  document.getElementById('mal-tienda').textContent='🏪 '+(p.tienda||'—');
  document.getElementById('mal-status').innerHTML=isOnline
    ?'<div class="enlive-online-pill"><span class="adm-live-dot"></span>EN VIVO</div>'
    :'<div class="enlive-offline-pill">Offline</div>';
  const fin=p.finalizados||0, tp=p.totalPedidos||0;
  const tCierre=tp>0?Math.min(100,Math.round(fin/tp*100)):null;
  document.getElementById('mal-m-total').textContent=tp||'—';
  document.getElementById('mal-m-fin').textContent=fin;
  document.getElementById('mal-m-cierre').textContent=tCierre!==null?tCierre+'%':'—';
  document.getElementById('mal-m-cont').textContent=p.contestaron||0;
  document.getElementById('mal-m-wa').textContent=p.waEnviados||0;
  document.getElementById('mal-m-dev').textContent=p.devoluciones||0;
  _malActualizarTiempos();
}

function _malActualizarTiempos(){
  const p=_malPresData; if(!p) return;
  const now=Date.now();
  const isOnline=!!p.online&&(now-(p.lastSeen||0))<120000;
  // Tiempo en línea
  const tOnEl=document.getElementById('mal-t-online');
  if(isOnline&&p.loginTime){
    tOnEl.textContent=_fmtDuracion(now-p.loginTime);
    tOnEl.style.color='#10b981';
  } else if(!isOnline&&p.lastSeen){
    tOnEl.textContent='Offline';
    tOnEl.style.color='#94a3b8';
  } else {
    tOnEl.textContent='—'; tOnEl.style.color='#94a3b8';
  }
  // Tiempo sin actividad
  const tInEl=document.getElementById('mal-t-inactivo');
  const acEl=document.getElementById('mal-ultima-accion');
  const saEl=document.getElementById('mal-sin-accion');
  if(p.lastActivity){
    const diff=now-p.lastActivity;
    tInEl.textContent=_fmtDuracion(diff);
    tInEl.style.color=diff<5*60000?'#10b981':diff<15*60000?'#f59e0b':'#ef4444';
    acEl.style.display='block'; saEl.style.display='none';
    document.getElementById('mal-accion-label').textContent=p.lastActionLabel||'—';
    document.getElementById('mal-accion-pedido').textContent=p.lastActionPedido?'📦 '+p.lastActionPedido:'';
    document.getElementById('mal-accion-hace').textContent='Hace '+_fmtDuracion(diff);
  } else {
    tInEl.textContent='—'; tInEl.style.color='#94a3b8';
    acEl.style.display='none';
    saEl.style.display=isOnline?'block':'none';
  }
}

// ===== HISTORIAL CLIENTE DESDE CARD =====
function _verHistorialCliente(guia){
  const fh=_fbHistGuias[guia]||{notas:[],eventos:[]};
  const p=pedidos.find(x=>x.guia===guia);
  const r={guia:guia,nombre:p?p.nombre:'',asesores:{}};
  const user=window._currentUsername||'yo';
  r.asesores[user]={nombreAsesor:user,tiendaAsesor:'',notas:fh.notas||[],gestion:p?{_nombre:p.nombre,_tel:p.telefono,_ciudad:p.ciudad,_guia:guia}:{_guia:guia},events:fh.eventos||[]};
  const modal=document.getElementById('bord-modal');
  document.getElementById('bord-modal-title').textContent='📋 Historial: '+(p?p.nombre:guia);
  document.getElementById('bord-modal-sub').textContent='Trayectoria completa de este cliente';
  const body=document.getElementById('bord-modal-body');
  try{ body.innerHTML=_bordRenderDetalle(r); }
  catch(e){ body.innerHTML='<div style="color:var(--danger);padding:16px;font-size:.78rem;">Error: '+e.message+'</div>'; }
  modal.style.display='flex';
}

// ===== VEEDURÍA: BUSCAR ORDEN =====

function _bordNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim(); }
function _bordFmtTs(ts){ if(!ts)return'—'; const d=new Date(ts); return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}); }

function _admBuscarOrden(){
  const q = (document.getElementById('bord-input').value||'').trim();
  if(q.length < 3){ document.getElementById('bord-results').innerHTML='<div class="adm-empty">Escribe al menos 3 caracteres para buscar</div>'; return; }
  const empresaId = localStorage.getItem('lgs_empresa_actual');
  if(!empresaId){ document.getElementById('bord-results').innerHTML='<div class="adm-empty">Selecciona una empresa primero</div>'; return; }

  document.getElementById('bord-results').innerHTML='<div class="adm-empty">🔍 Buscando...</div>';
  const qN = _bordNorm(q);
  const esNumero = /^[\d\s\-]+$/.test(q.replace(/\s/g,''));

  // gestiones_sync ahora es por tienda — una sola lectura cubre todos los asesores
  _db.ref('gestiones_sync/'+empresaId).once('value', snapGest=>{
    const gestTienda = snapGest.val()||{};
    const resultadosPorGuia = {};
    const _debug = {asesores:1, gests: Object.keys(gestTienda).length};

    Object.entries(gestTienda).forEach(([dropiKey, g])=>{
      const matchKey    = _bordNorm(dropiKey).includes(qN);
      const matchGuia   = g._guia   && _bordNorm(g._guia).includes(qN);
      const matchNombre = g._nombre && _bordNorm(g._nombre).includes(qN);
      const matchTel    = esNumero  && g._tel && g._tel.replace(/\D/g,'').includes(qN.replace(/\D/g,''));
      const matchCiudad = g._ciudad && _bordNorm(g._ciudad).includes(qN);
      if(matchKey || matchGuia || matchNombre || matchTel || matchCiudad){
        const displayGuia = g._guia || dropiKey;
        if(!resultadosPorGuia[displayGuia])
          resultadosPorGuia[displayGuia]={guia:displayGuia,nombre:g._nombre||'',asesores:{}};
        const asesorKey = g._asesor||'—';
        if(!resultadosPorGuia[displayGuia].asesores[asesorKey])
          resultadosPorGuia[displayGuia].asesores[asesorKey]={nombreAsesor:asesorKey,tiendaAsesor:'',notas:[],gestion:null,events:[]};
        const slot = resultadosPorGuia[displayGuia].asesores[asesorKey];
        slot.gestion = g;
        if(g.notas&&Array.isArray(g.notas)) g.notas.forEach(n=>slot.notas.push(n));
        if(g.eventos) Object.values(g.eventos).forEach(e=>slot.events.push(e));
      }
    });
    _bordMostrarResultados(resultadosPorGuia, q, _debug);
  });
}

function _bordMostrarResultados(mapa, q, debug){
  const keys = Object.keys(mapa);
  const el = document.getElementById('bord-results');
  const debugTxt = debug
    ? '<div style="font-size:.65rem;color:var(--text-3);margin-top:6px;">🔎 Revisé '+debug.asesores+' asesor(es) · '+debug.gests+' gestiones</div>'
    : '';
  if(!keys.length){
    el.innerHTML='<div class="adm-empty">Sin historial para "'+q+'"<br><span style="font-size:.72rem;color:var(--text-3)">Esta orden no tiene gestiones registradas en el sistema</span>'+debugTxt+'</div>';
    return;
  }
  let html='<div style="font-size:.75rem;color:var(--text-2);margin-bottom:4px;">'+keys.length+' resultado(s) encontrado(s)</div>'+debugTxt+'<div style="height:8px;"></div>';
  html+='<div style="display:flex;flex-direction:column;gap:8px;">';
  keys.forEach(key=>{
    const r=mapa[key];
    const asesoresCount=Object.keys(r.asesores).length;
    const nombres=Object.values(r.asesores).map(a=>a.nombreAsesor).join(', ');
    const primerG=Object.values(r.asesores).map(a=>a.gestion).find(g=>g)||{};
    const ciudad=primerG._ciudad||'';
    const tel=primerG._tel||'';
    const totalEvts=Object.values(r.asesores).reduce((s,a)=>{
      let c=0;
      if(a.gestion){
        if(a.gestion.llamada)c++;if(a.gestion.wa_enviado)c++;if(a.gestion.gestion_final)c++;
      }
      return s+c+(a.events||[]).length;
    },0);
    const totalNotas=Object.values(r.asesores).reduce((s,a)=>s+(a.notas||[]).length,0);
    const fueGest=Object.values(r.asesores).some(a=>{const g=a.gestion||{};return g.gestion_final||g.llamada||g.wa_enviado;});
    html+=
      '<div data-bord-key="'+key.replace(/"/g,'&quot;')+'" class="bord-result-card" style="background:var(--bg-card);border-radius:10px;border:1.5px solid var(--border);padding:14px 16px;cursor:pointer;transition:all .15s;">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'+
          '<div style="min-width:0;">'+
            '<div style="font-size:.85rem;font-weight:700;color:var(--text-1);font-family:monospace;">'+r.guia+'</div>'+
            (r.nombre?'<div style="font-size:.78rem;color:var(--text-2);margin-top:2px;">👤 '+r.nombre+'</div>':'')+
            '<div style="display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:.7rem;color:var(--text-3);">'+
              (ciudad?'<span>📍 '+ciudad+'</span>':'')+
              (tel?'<span>📞 '+tel+'</span>':'')+
              '<span>👥 '+nombres+'</span>'+
            '</div>'+
          '</div>'+
          '<div style="text-align:right;flex-shrink:0;">'+
            '<div style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:.68rem;font-weight:700;'+
              (fueGest?'background:var(--success-soft);color:var(--success);':'background:var(--warning-soft);color:var(--warning);')+'">'+
              (fueGest?'✅ Gestionado':'⏳ Pendiente')+'</div>'+
            '<div style="font-size:.65rem;color:var(--text-3);margin-top:4px;">⚡'+totalEvts+' · 📝'+totalNotas+'</div>'+
          '</div>'+
        '</div>'+
        '<div style="margin-top:6px;font-size:.68rem;color:var(--accent);font-weight:600;">Ver trayectoria completa →</div>'+
      '</div>';
  });
  html+='</div>';
  el.innerHTML=html;
  window._bordResultadosMapa = mapa;
  // Event delegation para clicks en resultados
  el.querySelectorAll('.bord-result-card').forEach(function(card){
    card.addEventListener('click', function(){
      var k=this.getAttribute('data-bord-key');
      if(k) window._bordVerDetalle(k);
    });
  });
}

window._bordVerDetalle = function(key){
  try{
    const mapa = window._bordResultadosMapa||{};
    const r = mapa[key];
    if(!r){alert('No se encontró la orden: '+key);return;}
    const modal = document.getElementById('bord-modal');
    const body = document.getElementById('bord-modal-body');
    document.getElementById('bord-modal-title').textContent = '📦 '+(r.guia||key);
    document.getElementById('bord-modal-sub').textContent = r.nombre ? '👤 '+r.nombre : 'Sin nombre registrado';
    modal.style.display = 'flex';
    try{ body.innerHTML = _bordRenderDetalle(r); }
    catch(e2){ body.innerHTML='<div style="color:var(--danger);padding:16px;font-size:.82rem;">❌ Error al renderizar: '+e2.message+'<br><pre style="margin-top:8px;font-size:.7rem;color:var(--text-3);white-space:pre-wrap;">'+e2.stack+'</pre></div>'; }
  }catch(e){alert('Error abriendo detalle: '+e.message);}
};

function _bordRenderDetalle(r){
  const lineas=[];
  let clienteInfo={};

  Object.entries(r.asesores).forEach(([username, data])=>{
    const g=data.gestion||{};
    const asesor=data.nombreAsesor||username;
    const tienda=data.tiendaAsesor||'';

    if(g._nombre&&!clienteInfo.nombre) clienteInfo.nombre=g._nombre;
    if(g._tel&&!clienteInfo.tel) clienteInfo.tel=g._tel;
    if(g._ciudad&&!clienteInfo.ciudad) clienteInfo.ciudad=g._ciudad;
    if(g._guia&&!clienteInfo.guia) clienteInfo.guia=g._guia;

    const accionesGest=[
      g.llamada==='contestó'      && {ts:g._ts,label:'📞 Llamada — Contestó',color:'#10b981'},
      g.llamada==='no_contestó'   && {ts:g._ts,label:'📵 Llamada — No contestó',color:'#ef4444'},
      g.wa_enviado                && {ts:g._ts,label:'📱 WhatsApp enviado',color:'#7c3aed'},
      g.gestion_final             && {ts:g._ts,label:'🏁 Gestión finalizada',color:'#0891b2'},
      g.devolucion                && {ts:g._ts,label:'↩️ Pedido para devolución',color:'#d97706'},
      g.rechazado_gestionado      && {ts:g._ts,label:'✅ Rechazado gestionado',color:'#10b981'},
      g.rechazado_sin_gestion     && {ts:g._ts,label:'🚫 Rechazado sin gestión',color:'#ef4444'},
      g.nueva_entrega             && {ts:g._ts,label:'🔄 Nueva entrega solicitada',color:'#0891b2'},
    ].filter(Boolean);
    accionesGest.forEach(a=>lineas.push({ts:a.ts||0,asesor,tienda,tipo:'accion',label:a.label,color:a.color}));

    (data.events||[]).forEach(ev=>{
      if(ev.tipo==='gestion_sync') return;
      lineas.push({ts:ev.ts||0,asesor,tienda,tipo:'evento',label:_bordLabelEvento(ev.tipo),color:'#475569'});
    });

    const notasSeen=new Set();
    const todasNotas=[...(data.notas||[]),...(Array.isArray(g.notas)?g.notas:[])];
    todasNotas.forEach(n=>{
      const k=(n.texto||'')+'|'+(n.ts||'');
      if(notasSeen.has(k))return; notasSeen.add(k);
      lineas.push({ts:n.ts||0,asesor,tienda,tipo:'nota',label:n.texto||n.text||'(sin texto)',color:'#10b981'});
    });
  });

  // Ficha del cliente
  let html='';
  const ci=clienteInfo;
  const asesoresList=Object.values(r.asesores);
  const totalGestiones=lineas.filter(l=>l.tipo!=='nota').length;
  const totalNotas=lineas.filter(l=>l.tipo==='nota').length;
  const fueGestionado=lineas.some(l=>l.label&&(l.label.includes('Finalizada')||l.label.includes('finalizada')||l.label.includes('Contestó')||l.label.includes('WhatsApp')));

  html+='<div style="background:var(--bg-hover);border:1.5px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">';
  html+='<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:10px;">';
  if(ci.nombre) html+='<div style="font-size:.88rem;font-weight:700;color:var(--text-1);">👤 '+ci.nombre+'</div>';
  html+='<div style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700;'+(fueGestionado?'background:var(--success-soft);color:var(--success);':'background:var(--warning-soft);color:var(--warning);')+'">'+
    (fueGestionado?'✅ Gestionado':'⏳ Sin gestión confirmada')+'</div>';
  html+='</div>';
  html+='<div style="display:flex;flex-wrap:wrap;gap:8px 20px;font-size:.76rem;color:var(--text-2);">';
  if(ci.guia) html+='<div>📋 Guía: <strong style="font-family:monospace;">'+ci.guia+'</strong></div>';
  if(ci.tel) html+='<div>📞 '+ci.tel+'</div>';
  if(ci.ciudad) html+='<div>📍 '+ci.ciudad+'</div>';
  html+='<div>👥 '+asesoresList.length+' asesor'+(asesoresList.length>1?'es':'')+': '+asesoresList.map(a=>a.nombreAsesor).join(', ')+'</div>';
  html+='</div>';
  html+='</div>';

  if(!lineas.length){
    return html+'<div style="text-align:center;padding:24px;color:var(--text-3);font-size:.82rem;">⚠️ Sin historial de gestión registrado para esta orden</div>';
  }

  // Deduplicar
  const seen=new Set();
  const lineasUnicas=lineas.filter(l=>{
    const k=l.tipo+'|'+l.label+'|'+l.ts;
    if(seen.has(k))return false; seen.add(k); return true;
  });
  lineasUnicas.sort((a,b)=>b.ts-a.ts);

  // Separar notas de acciones/eventos
  const soloNotas=lineasUnicas.filter(l=>l.tipo==='nota');
  const soloAcciones=lineasUnicas.filter(l=>l.tipo!=='nota');

  // ── SECCIÓN NOTAS DEL ASESOR ──
  if(soloNotas.length){
    html+='<div style="margin-bottom:16px;">';
    html+='<div style="font-size:.78rem;font-weight:700;color:var(--text-1);margin-bottom:8px;">📝 Notas del asesor ('+soloNotas.length+')</div>';
    html+='<div style="display:flex;flex-direction:column;gap:6px;">';
    soloNotas.forEach(n=>{
      const fecha=n.ts?new Date(n.ts).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}):'';
      const hora=n.ts?new Date(n.ts).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}):'';
      html+=
        '<div style="background:var(--success-soft);border:1.5px solid #bbf7d0;border-radius:10px;padding:10px 14px;">'+
          '<div style="font-size:.82rem;color:var(--text-1);line-height:1.5;white-space:pre-wrap;">'+n.label+'</div>'+
          '<div style="display:flex;gap:12px;margin-top:6px;font-size:.66rem;color:#6b7280;">'+
            (n.asesor?'<span>👤 '+n.asesor+'</span>':'')+
            (n.tienda?'<span>🏪 '+n.tienda+'</span>':'')+
            (fecha?'<span>📅 '+fecha+'</span>':'')+
            (hora?'<span>🕐 '+hora+'</span>':'')+
          '</div>'+
        '</div>';
    });
    html+='</div></div>';
  }

  // ── SECCIÓN LÍNEA DE TIEMPO (acciones y eventos) ──
  if(soloAcciones.length){
    const porFecha={};
    soloAcciones.forEach(l=>{
      const fecha=l.ts?new Date(l.ts).toLocaleDateString('es-CO',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}):'Sin fecha';
      if(!porFecha[fecha])porFecha[fecha]=[];
      porFecha[fecha].push(l);
    });

    html+='<div style="font-size:.78rem;font-weight:700;color:var(--text-1);margin-bottom:10px;">⚡ Historial de gestiones ('+soloAcciones.length+')</div>';
    Object.entries(porFecha).forEach(([fecha,items])=>{
      html+='<div style="margin-bottom:14px;">';
      html+='<div style="font-size:.72rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.3px;padding:4px 0 6px;border-bottom:1px solid var(--border);margin-bottom:6px;">'+fecha+'</div>';
      html+='<div style="display:flex;flex-direction:column;gap:4px;padding-left:8px;border-left:2px solid var(--border);">';
      items.forEach(l=>{
        const icono=l.tipo==='accion'?'⚡':'🔔';
        const hora=l.ts?new Date(l.ts).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}):'';
        html+=
          '<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 10px;background:var(--bg-card);border-radius:8px;border-left:3px solid '+l.color+';">'+
            '<div style="flex:1;min-width:0;">'+
              '<div style="font-size:.78rem;font-weight:600;color:var(--text-1);">'+icono+' '+l.label+'</div>'+
              (l.asesor?'<div style="font-size:.65rem;color:var(--text-3);margin-top:1px;">'+l.asesor+(l.tienda?' · 🏪 '+l.tienda:'')+'</div>':'')+
            '</div>'+
            (hora?'<div style="font-size:.65rem;color:var(--text-3);white-space:nowrap;flex-shrink:0;">'+hora+'</div>':'')+
          '</div>';
      });
      html+='</div></div>';
    });
  }
  return html;
}

function _bordLabelEvento(tipo){
  const m={
    'llamada_contestada':'📞 Llamada — Contestó',
    'llamada_no_contestada':'📵 Llamada — No contestó',
    'llamada_contesto':'📞 Llamada — Contestó',
    'llamada_no_contesto':'📵 Llamada — No contestó',
    'wa_enviado':'📱 WhatsApp enviado',
    'gestion_final':'🏁 Gestión finalizada',
    'finalizado':'🏁 Gestión finalizada',
    'devolucion':'↩️ Pedido para devolución',
    'nota_guardada':'📝 Nota guardada',
    'nueva_entrega':'🔄 Nueva entrega',
    'rechazado_gestionado':'✅ Rechazado gestionado',
    'guia_generada':'📋 Guía generada',
    'gestion_sync':'⚡ Gestión registrada',
  };
  return m[tipo]||tipo||'Evento';
}

// ── Analítica multi-tienda del panel de administración (vive en #admin-panel,
// NO es parte del módulo Gestiones Diarias pese al prefijo _gdadm — ver debug
// de plataforma, hallazgo sobre _gdadm* clasificado incorrectamente por nombre).
// ── ADMIN: CONSOLIDADO GD ───────────────────────────────────────────────
let _gdadmData={}, _gdadmAsesores=[], _gdadmDias=31, _gdadmSubtabActual='ranking';

// Selector de tiendas: lista las tiendas propias del admin (no requiere
// conocer la clave interna de Firebase) y permite marcar varias a la vez.
let _gdadmTiendasDisponibles=[]; // [{key, nombre}]
let _gdadmTiendasSel=new Set();

function _gdadmToggleDropdown(e){
  e.stopPropagation();
  const btn=document.getElementById('gdadm-tiendas-btn');
  const dd=document.getElementById('gdadm-tiendas-dropdown');
  if(!btn||!dd) return;
  const opening=!btn.classList.contains('open');
  btn.classList.toggle('open'); dd.classList.toggle('open');
  if(opening){document.addEventListener('click',()=>{btn.classList.remove('open');dd.classList.remove('open');},{once:true});}
}

function _gdadmPoblarTiendas(){
  const adminId = localStorage.getItem('lgs_admin_id');
  const cont = document.getElementById('gdadm-tiendas-items');
  if(!cont) return;
  if(!adminId||typeof _db==='undefined'){ cont.innerHTML='<div style="padding:8px 14px;font-size:.75rem;color:var(--text-3);">Sin admin activo</div>'; return; }
  Promise.all([
    _db.ref('admin_empresas/'+adminId).once('value'),
    _db.ref('empresas').once('value')
  ]).then(([snapAE, snapEmp])=>{
    const ids = Object.keys(snapAE.val()||{});
    const empresas = snapEmp.val()||{};
    // key = empresaId (única). keyLegacy = slug del nombre, para seguir viendo
    // lo guardado antes del cambio de clave. Con el slug, dos tiendas homónimas
    // de negocios distintos caían en la misma ruta y el admin veía datos ajenos.
    _gdadmTiendasDisponibles = ids.map(empId=>{
      const nombre=(empresas[empId]||{}).nombre||empId;
      return {key:empId, keyLegacy:_gdKey(nombre), nombre};
    }).sort((a,b)=>a.nombre.localeCompare(b.nombre));
    // La primera vez que se cargan las tiendas, marcarlas todas por defecto
    if(!_gdadmTiendasSel.size) _gdadmTiendasDisponibles.forEach(t=>_gdadmTiendasSel.add(t.key));
    _gdadmRenderChecklist();
  });
}

function _gdadmRenderChecklist(){
  const cont = document.getElementById('gdadm-tiendas-items');
  if(!cont) return;
  cont.innerHTML = _gdadmTiendasDisponibles.length
    ? _gdadmTiendasDisponibles.map(t=>`
      <div class="sf-item" onclick="event.stopPropagation();_gdadmToggleTienda('${t.key}')">
        <input type="checkbox" ${_gdadmTiendasSel.has(t.key)?'checked':''} readonly/>
        <label>${t.nombre}</label>
      </div>`).join('')
    : '<div style="padding:8px 14px;font-size:.75rem;color:var(--text-3);">No tienes tiendas creadas</div>';
  _gdadmActualizarLabel();
}

function _gdadmToggleTienda(key){
  if(_gdadmTiendasSel.has(key)) _gdadmTiendasSel.delete(key);
  else _gdadmTiendasSel.add(key);
  _gdadmRenderChecklist();
}

function _gdadmToggleTodas(){
  if(_gdadmTiendasSel.size>=_gdadmTiendasDisponibles.length) _gdadmTiendasSel.clear();
  else _gdadmTiendasDisponibles.forEach(t=>_gdadmTiendasSel.add(t.key));
  _gdadmRenderChecklist();
}

function _gdadmActualizarLabel(){
  const lbl = document.getElementById('gdadm-tiendas-label');
  if(!lbl) return;
  const n=_gdadmTiendasSel.size, total=_gdadmTiendasDisponibles.length;
  if(!n) lbl.textContent='Selecciona tiendas';
  else if(n===total && total>1) lbl.textContent='Todas ('+n+')';
  else if(n===1){
    const t=_gdadmTiendasDisponibles.find(x=>_gdadmTiendasSel.has(x.key));
    lbl.textContent=t?t.nombre:'1 tienda';
  } else lbl.textContent=n+' tiendas seleccionadas';
}

function _gdadmCargar(){
  const mes=document.getElementById('gdadm-mes').value;
  const tiendas=_gdadmTiendasDisponibles.filter(t=>_gdadmTiendasSel.has(t.key));
  if(!tiendas.length||!mes){alert('Selecciona al menos una tienda y un mes');return;}
  const el=document.getElementById('gdadm-content');
  el.innerHTML='<div style="padding:20px;color:var(--text-3);font-size:.78rem;">Cargando...</div>';
  Promise.all(tiendas.map(t=>
    _db.ref('gestiones_diarias/'+t.key+'/'+mes).once('value').then(snap=>{
      // Si la tienda todavía no migró a la clave por id, leer la ruta vieja.
      if(snap.exists()||!t.keyLegacy||t.keyLegacy===t.key) return {tienda:t,snap};
      return _db.ref('gestiones_diarias/'+t.keyLegacy+'/'+mes).once('value').then(sv=>({tienda:t,snap:sv}));
    })
  )).then(results=>{
    // raw = { asesorKey: { _nombre, dias:{1:{...},2:{...},...}, notas }, ... }
    _gdadmAsesores=[];
    const [y,m]=mes.split('-').map(Number);
    _gdadmDias=new Date(y,m,0).getDate();
    results.forEach(({tienda,snap})=>{
      if(!snap.exists()) return;
      const raw=snap.val()||{};
      Object.entries(raw).forEach(([aKey,aVal])=>{
        if(!aVal||!aVal.dias) return;
        _gdadmAsesores.push({
          key:tienda.key+'/'+aKey,
          nombre:(aVal._nombre||aKey).toUpperCase(),
          tienda:tienda.nombre,
          dias:aVal.dias||{}
        });
      });
    });
    // Sort by nombre
    _gdadmAsesores.sort((a,b)=>a.nombre.localeCompare(b.nombre));
    _gdadmData={tiendas:tiendas.map(t=>t.key),mes};
    if(!_gdadmAsesores.length){ el.innerHTML='<div style="padding:20px;color:var(--text-3);font-size:.78rem;">Sin datos para las tiendas/mes seleccionados.</div>'; return; }
    _gdadmSubtab(_gdadmSubtabActual);
  });
}

function _gdadmSubtab(t){
  _gdadmSubtabActual=t;
  ['ranking','collab','tipo'].forEach(s=>{
    const b=document.getElementById('gdst-'+s);
    if(b) b.classList.toggle('active',s===t);
  });
  if(!_gdadmAsesores.length) return;
  if(t==='ranking') _gdadmRenderRanking();
  else if(t==='collab') _gdadmRenderCollab();
  else if(t==='tipo') _gdadmRenderTipo();
}

// ── helpers ──────────────────────────────────────────────
function _gdadmDayTotals(dias){
  // Returns {conf,cancel,soluc,devuelt,recupNov,recupCarri,ventasWpp,gral} summed over all days
  let c={conf:0,cancel:0,soluc:0,devuelt:0,recupNov:0,recupCarri:0,ventasWpp:0,gral:0};
  Object.values(dias).forEach(d=>{
    c.conf+=d.conf||0; c.cancel+=d.cancel||0; c.soluc+=d.soluc||0;
    c.devuelt+=d.devuelt||0; c.recupNov+=d.recupNov||0;
    c.recupCarri+=d.recupCarri||0; c.ventasWpp+=d.ventasWpp||0;
    const g=(d.conf||0)+(d.cancel||0)+(d.soluc||0)+(d.recupNov||0)+(d.recupCarri||0)+(d.ventasWpp||0);
    c.gral+=g;
  });
  return c;
}
function _pct(n,d){ return d?Math.round(n/d*100)+'%':'—'; }
function _avg(n,d){ return d?(n/d).toFixed(1):'—'; }

// ── Tabla 1: RANKING ─────────────────────────────────────
function _gdadmRenderRanking(){
  const el=document.getElementById('gdadm-content');
  let rows='', totals={conf:0,cancel:0,soluc:0,recupNov:0,recupCarri:0,ventasWpp:0,gral:0};
  _gdadmAsesores.forEach((a,i)=>{
    const t=_gdadmDayTotals(a.dias);
    totals.conf+=t.conf; totals.cancel+=t.cancel; totals.soluc+=t.soluc+t.devuelt;
    totals.recupNov+=t.recupNov+t.recupCarri; totals.ventasWpp+=t.ventasWpp; totals.gral+=t.gral;
    const prom=_avg(t.gral,_gdadmDias);
    const efect=_pct(t.conf,t.gral);
    const bg=i===0?'style="background:var(--warning-soft);"':i===1?'style="background:var(--success-soft);"':i===2?'style="background:var(--warning-soft);"':'';
    rows+=`<tr ${bg}>
      <td style="font-weight:800;">${i+1}</td>
      <td style="text-align:left;font-weight:700;">${a.nombre}</td>
      <td style="text-align:left;">🏪 ${a.tienda||'—'}</td>
      <td class="hi">${t.gral}</td>
      <td>${t.conf}</td>
      <td>${t.cancel}</td>
      <td>${t.soluc+t.devuelt}</td>
      <td>${t.recupNov+t.recupCarri}</td>
      <td>${t.ventasWpp}</td>
      <td>${prom}</td>
      <td class="${parseInt(efect)>=50?'hi':'warn'}">${efect}</td>
      <td>0</td><td>—</td><td>—</td>
    </tr>`;
  });
  el.innerHTML=`<div style="font-size:.7rem;font-weight:800;color:var(--text-1);margin-bottom:8px;letter-spacing:.3px;">EQUIPO · RANKING · BONIFICACIONES</div>
  <div style="overflow:auto;"><table class="gdadm-table">
    <thead><tr>
      <th>#</th><th>NOMBRE</th><th>TIENDA</th><th>TOTAL GEST.</th>
      <th>CONFIRM.</th><th>RECHAZ.</th><th>NOVEDADES</th><th>CARRITOS</th><th>VENTAS WPP</th>
      <th>PROM. DIARIO</th><th>% EFECT.</th><th>MAL GEST.</th><th>BONO BASE</th><th>BONO FINAL</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3" style="text-align:left;font-weight:800;">TOTALES</td>
      <td>${totals.gral}</td><td>${totals.conf}</td><td>${totals.cancel}</td>
      <td>${totals.soluc}</td><td>${totals.recupNov}</td><td>${totals.ventasWpp}</td>
      <td>${_avg(totals.gral,_gdadmDias)}</td>
      <td>${_pct(totals.conf,totals.gral)}</td>
      <td>0</td><td colspan="2"></td>
    </tr></tfoot>
  </table></div>`;
}

// ── Tabla 2: POR COLABORADOR ──────────────────────────────
function _gdadmRenderCollab(){
  const el=document.getElementById('gdadm-content');
  let rows='', mesTotals=_gdadmAsesores.map(()=>0), diasTotalArr=[];
  for(let d=1;d<=_gdadmDias;d++){
    let rowTotal=0;
    let cells=_gdadmAsesores.map((a,i)=>{
      const day=a.dias[d]||{};
      const g=(day.conf||0)+(day.cancel||0)+(day.soluc||0)+(day.recupNov||0)+(day.recupCarri||0)+(day.ventasWpp||0);
      mesTotals[i]+=g; rowTotal+=g; return `<td>${g||''}</td>`;
    }).join('');
    diasTotalArr.push(rowTotal);
    rows+=`<tr><td style="font-weight:700;">${d}</td>${cells}<td class="hi" style="font-weight:700;">${rowTotal||''}</td><td>${rowTotal?_avg(rowTotal,_gdadmAsesores.length||1):''}  </td></tr>`;
  }
  const grandTotal=mesTotals.reduce((a,b)=>a+b,0);
  const multiTienda=new Set(_gdadmAsesores.map(a=>a.tienda)).size>1;
  const aHeaders=_gdadmAsesores.map(a=>`<th>${a.nombre.split(' ')[0]}${multiTienda?'<br><span style="font-weight:400;opacity:.6;font-size:.55rem;">🏪 '+a.tienda+'</span>':''}</th>`).join('');
  const aTotals=mesTotals.map((t,i)=>`<td class="hi">${t}</td>`).join('');
  const aProms=mesTotals.map(t=>`<td>${_avg(t,_gdadmDias)}</td>`).join('');
  el.innerHTML=`<div style="font-size:.7rem;font-weight:800;color:var(--text-1);margin-bottom:8px;letter-spacing:.3px;">CONSOLIDADO DIARIO — TOTAL GESTIONES POR COLABORADOR</div>
  <div style="overflow:auto;"><table class="gdadm-table">
    <thead><tr><th>DÍA</th>${aHeaders}<th>TOTAL DÍA</th><th>PROM.</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row"><td>TOTAL MES</td>${aTotals}<td>${grandTotal}</td><td>${_avg(grandTotal,_gdadmDias)}</td></tr>
      <tr class="prom-row"><td>PROMEDIO</td>${aProms}<td>${_avg(grandTotal,_gdadmDias)}</td><td>${_avg(grandTotal/_gdadmAsesores.length||0,_gdadmDias)}</td></tr>
    </tfoot>
  </table></div>`;
}

// ── Tabla 3: POR TIPO DE GESTIÓN ─────────────────────────
function _gdadmRenderTipo(){
  const el=document.getElementById('gdadm-content');
  let rows='';
  let tConf=0,tCancel=0,tSoluc=0,tRecup=0,tVwpp=0,tTotal=0;
  for(let d=1;d<=_gdadmDias;d++){
    let conf=0,cancel=0,soluc=0,recup=0,vwpp=0;
    _gdadmAsesores.forEach(a=>{
      const day=a.dias[d]||{};
      conf+=day.conf||0; cancel+=day.cancel||0;
      soluc+=(day.soluc||0)+(day.devuelt||0);
      recup+=(day.recupNov||0)+(day.recupCarri||0);
      vwpp+=day.ventasWpp||0;
    });
    const total=conf+cancel+soluc+recup+vwpp;
    tConf+=conf;tCancel+=cancel;tSoluc+=soluc;tRecup+=recup;tVwpp+=vwpp;tTotal+=total;
    if(!total){rows+=`<tr><td style="font-weight:700;">${d}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;continue;}
    rows+=`<tr>
      <td style="font-weight:700;">${d}</td>
      <td>${conf}</td><td>${cancel?`<span class="warn">${cancel}</span>`:''}</td>
      <td>${soluc}</td><td>${recup}</td><td>${vwpp}</td>
      <td class="hi" style="font-weight:700;">${total}</td>
      <td class="${conf/total>=.5?'hi':'warn'}">${_pct(conf,total)}</td>
      <td class="${cancel/total<=.06?'hi':'warn'}">${_pct(cancel,total)}</td>
    </tr>`;
  }
  const tEfect=_pct(tConf,tTotal), tCancelPct=_pct(tCancel,tTotal);
  // KPIs
  let maxDia=0,minDia=Infinity;
  for(let i=1;i<=_gdadmDias;i++){
    let t=0; _gdadmAsesores.forEach(a=>{const d=a.dias[i]||{};t+=(d.conf||0)+(d.cancel||0)+(d.soluc||0)+(d.recupNov||0)+(d.recupCarri||0)+(d.ventasWpp||0);});
    if(t>maxDia)maxDia=t; if(t<minDia)minDia=t;
  }
  if(minDia===Infinity)minDia=0;
  el.innerHTML=`<div style="font-size:.7rem;font-weight:800;color:var(--text-1);margin-bottom:8px;letter-spacing:.3px;">CONSOLIDADO POR TIPO DE GESTIÓN</div>
  <div style="overflow:auto;"><table class="gdadm-table">
    <thead><tr>
      <th>DÍA</th><th>CONFIRM.</th><th>CANCELADAS</th><th>NOVEDADES SOLUC.</th>
      <th>CARRITOS RECUP.</th><th>VENTAS WPP</th><th>TOTAL</th><th>% EFECT.</th><th>% CANCELADO</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row">
      <td>TOTAL</td><td>${tConf}</td><td>${tCancel}</td><td>${tSoluc}</td>
      <td>${tRecup}</td><td>${tVwpp}</td><td>${tTotal}</td><td>${tEfect}</td><td>${tCancelPct}</td>
    </tr></tfoot>
  </table></div>
  <div style="margin-top:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
    <div style="background:#131920;color:white;border-radius:10px;padding:12px 14px;">
      <div style="font-size:.6rem;opacity:.55;font-weight:700;letter-spacing:.4px;margin-bottom:8px;">KPIs AUTO-CALCULADOS</div>
      ${[['Total gestiones mes',tTotal],['Total ventas WPP',tVwpp],['% Efectividad global',tEfect],['% Cancelación global',tCancelPct],['Total bonificaciones','—']].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:.68rem;"><span style="opacity:.6;">${l}</span><strong>${v}</strong></div>`).join('')}
    </div>
    <div style="background:#131920;color:white;border-radius:10px;padding:12px 14px;">
      <div style="font-size:.6rem;opacity:.55;font-weight:700;letter-spacing:.4px;margin-bottom:8px;">REFERENCIAS</div>
      ${[['Total mal gestionados',0],['Meta devoluciones','≤ 25%'],['Mejor día (max)',maxDia],['Peor día (min)',minDia],['Meta novedades','≥ 95%']].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:.68rem;"><span style="opacity:.6;">${l}</span><strong>${v}</strong></div>`).join('')}
    </div>
  </div>`;
}

// ── IDENTIDAD DE TIENDA ─────────────────────────────────────────────────
// gestiones_diarias, control_financiero, ro, novedades y anticipos se clavaban
// con el slug del NOMBRE de la tienda. El nombre se repite entre negocios
// distintos (dos "Luva" de dos admins → la MISMA ruta), así que esos negocios
// leían y escribían datos del otro. La clave canónica pasa a ser el empresaId,
// que es único por tienda.
//   _gdTK()       → clave de ESCRITURA (empresaId; cae al slug si aún no hay id)
//   _gdTKLegacy() → clave vieja, solo para leer/migrar lo anterior al cambio
function _gdTKLegacy(){ return _gdKey(window.getLoginTienda?window.getLoginTienda():'_'); }
function _gdTK(){
  return window._currentTiendaId || localStorage.getItem('lgs_empresa_id') || _gdTKLegacy();
}
function _gdAK(){ return _gdKey(window.getLoginAsesor?window.getLoginAsesor():'_'); }

// Guard de escritura. Sin tienda resuelta, _gdTK() cae en '_' (el valor que
// devuelve _gdKey('')) y los datos terminan en un nodo que ninguna tienda puede
// abrir: así se creó control_financiero/_ con un mes entero de cifras reales
// dentro. Antes de guardar cualquier dato de tienda hay que pasar por acá.
function _tiendaLista(que){
  const tk=_gdTK();
  if(tk && tk!=='_') return true;
  console.warn('[TIENDA] escritura bloqueada'+(que?' ('+que+')':'')+': no hay tienda en la sesión');
  if(typeof toast==='function') toast('⚠️ No hay tienda activa — no se guardó nada. Vuelve a entrar a la tienda.',4500);
  return false;
}

// Lee un nodo de tienda tolerando el cambio de clave: si la ruta nueva (por id)
// está vacía y la vieja (por nombre) tiene datos, los copia una sola vez a la
// nueva y sigue trabajando ahí. Sin esa copia, la primera escritura sobre un
// registro leído del legacy crearía una ruta nueva con un solo registro y el
// resto del historial dejaría de verse.
// La ruta vieja NO se borra: la migración es reversible y el rescate de datos
// mezclados entre tiendas homónimas se decide aparte.
//   rutaFn: tk => 'raiz/'+tk+'/...'      q: ref => ref.orderByChild('ts')  (opcional)
function _leerTienda(rutaFn, q){
  const nueva=rutaFn(_gdTK()), vieja=rutaFn(_gdTKLegacy());
  const ref=r=>{ const base=_db.ref(r); return q?q(base):base; };
  return ref(nueva).once('value').then(sn=>{
    if(sn.exists()||nueva===vieja) return sn;
    return ref(vieja).once('value').then(sv=>{
      if(!sv.exists()) return sn;
      // Copiar el nodo completo a la clave nueva antes de que alguien lo edite.
      return _db.ref(nueva).set(sv.val())
        .then(()=>ref(nueva).once('value'))
        .catch(e=>{ console.warn('[TIENDA] no se pudo migrar '+vieja+' → '+nueva, e); return sv; });
    });
  });
}
// Lee las evidencias/soluciones de un registro de novedad (esquema nuevo
// soluciones/{key} o el viejo sol1/2/3) — usada por Gestión Logística y GD.
function _novGetSols(n){
  if(n.soluciones&&Object.keys(n.soluciones).length){
    return Object.entries(n.soluciones).sort((a,b)=>(a[1].ts||0)-(b[1].ts||0)).map(([k,s])=>({...s,_key:k}));
  }
  return [n.sol1,n.sol2,n.sol3].filter(Boolean).map((s,i)=>({...s,_legacyNum:i+1}));
}
// _roAutoSync/_roSyncFromGestion: sincroniza el tracking de "Reclamo en Oficina"
// a Firebase desde Gestión Logística en cada guardado de gestión — llamada de
// forma incondicional desde el módulo legacy, por eso vive aquí y no en
// gestiones-diarias.js (su UI/caché en memoria de GD se actualiza solo si
// esa página está cargada, ver guards de typeof adentro).
function _roAutoSync(){
  // Sincronizar todos los pedidos en Oficina que aún no tienen registro RO.
  // 'pedidos' solo existe con Gestión Logística cargado y este archivo lo cargan
  // las 4 páginas, así que el typeof no es opcional (ver bug del "Cargando..."
  // eterno en la pestaña R.O. de Gestiones Diarias).
  if(typeof _db==='undefined'||!window._currentUsername||typeof pedidos==='undefined'||!pedidos.length)return;
  if(!_tiendaLista('sincronización de oficina'))return;
  const oficinas=pedidos.filter(p=>p.estadoKey==='oficina'&&p.guia);
  // Migrar el mes de ro/ ANTES de escribir: si esta sync creara el nodo nuevo
  // con un registro suelto, la lectura posterior lo daría por existente y el
  // resto del historial (aún en la clave vieja) dejaría de verse.
  _leerTienda(tk=>'ro/'+tk+'/'+_getMesCargado())
    .catch(()=>{})
    .then(()=>oficinas.forEach(p=>_roSyncFromGestion(p.id)));
}

function _roSyncFromGestion(id){
  try{
    if(typeof _db==='undefined'||!window._currentUsername)return;
    const p=_pedidoMap.get(id);
    if(!p||p.estadoKey!=='oficina'||!p.guia)return;
    const g=gestiones[id]||{};
    const notas=g.notas||(g.nota?[{texto:g.nota,fecha:new Date().toLocaleDateString('es-CO'),ts:Date.now()}]:[]);
    // Determinar estado
    let estado='PENDIENTE';
    if(g.devolucion)       estado='DEVUELTO';
    else if(g.gestion_final) estado='ENTREGADO';
    else if(g.llamada)     estado='EN PROCESO';
    const hoy=new Date().toISOString().split('T')[0];
    const mes=_getMesCargado();
    const tel=(p.telefono||'').replace(/^57/,'');
    const rKey=_fbKey(p.guia);
    const basePath='ro/'+_gdTK()+'/'+mes+'/'+rKey;
    _db.ref(basePath).once('value').then(snap=>{
      const ex=snap.val()||{};
      // La primera nota nunca se sobreescribe (primer contacto)
      const notaCliente=ex.notaCliente||(notas.length?notas[0].texto:'');
      const notaSeg=notas.length?notas[notas.length-1].texto:'';
      return _db.ref(basePath).set({
        guia:p.guia, cliente:p.nombre||'', telefono:tel,
        notaCliente, notaSeguimiento:notaSeg,
        estado, fechaContacto:hoy, fechaEstado:hoy,
        ts:ex.ts||Date.now(), _fromLogistica:true
      });
    }).then(()=>{
      // Actualizar caché/UI de Gestiones Diarias solo si esa página está cargada
      // (en gestion-logistica.html estas variables/función no existen — el
      // registro en Firebase de arriba ya se hizo, esto es solo refresco visual).
      if(typeof _gdMes==='undefined')return;
      if(!_gdMes||_gdMes===mes){
        if(typeof _roData!=='undefined'){
          if(!_roData[rKey])_roData[rKey]={ts:Date.now()};
          Object.assign(_roData[rKey],{guia:p.guia,cliente:p.nombre||'',telefono:tel,estado});
        }
        const tabRo=document.getElementById('gd-tab-ro');
        if(tabRo&&tabRo.style.display!=='none'&&typeof _roInit==='function')_roInit();
      }
    }).catch(e=>console.warn('[roSync]',e));
  }catch(e){console.warn('[roSync]',e);}
}

// ── Router del landing (index.html): mode-select, cambiar de tienda ────
// _ocultarTodosModos/_gdMostrarModeSelect/_cambiarTienda vivían junto al
// código legacy de Gestión Logística pese a ser lógica de landing/router —
// promovidas aquí para que index.html (ya sin ese código) siga funcionando.
// Con guards: en index.html ya no existen upload-zone/gd-panel/cf-panel/
// main/right-panel (viven en sus propias páginas), así que esto es un no-op
// seguro ahí; en las páginas de módulo, cada una sobreescribe
// _gdMostrarModeSelect con su propio bootstrap (ver *.html), así que esta
// versión "de verdad" solo se ejecuta en index.html.
function _ocultarTodosModos(){
  const uz=document.getElementById('upload-zone'); if(uz)uz.style.display='none';
  const gp=document.getElementById('gd-panel'); if(gp)gp.style.display='none';
  const cp=document.getElementById('cf-panel'); if(cp)cp.style.display='none';
  const main=document.getElementById('main');if(main)main.style.display='none';
  const rp=document.getElementById('right-panel');if(rp)rp.style.display='none';
}
window._gdMostrarModeSelect = function(asesor){
  _ocultarTodosModos();
  const ms=document.getElementById('mode-select-screen');
  ms.style.display='flex';
  // Si el nombre es un email, usar solo la parte antes del @
  let nombreRaw=(asesor||'').trim();
  if(nombreRaw.includes('@')) nombreRaw=nombreRaw.split('@')[0];
  const nombre=nombreRaw.split(' ')[0];
  document.getElementById('mss-greeting').textContent=nombre?'¡Hola, '+nombre+'!':'¡Hola!';
  // Botón de volver: al Panel Admin si se entró navegando una empresa puntual
  // desde ahí, o al selector de perfil si la cuenta tiene varios roles
  const btnVolver = document.getElementById('mss-btn-volver-admin');
  if(btnVolver){
    if(window._cameFromAdmin){
      btnVolver.textContent = '← Volver al Panel Admin';
      btnVolver.style.display = 'block';
    } else if(window._rolPendiente?.roles?.length > 1){
      btnVolver.textContent = '← Volver a selección de perfil';
      btnVolver.style.display = 'block';
    } else {
      btnVolver.style.display = 'none';
    }
  }
  // Control Financiero solo para dueños
  const rol=window._currentRol||localStorage.getItem('lgs_rol')||'dueno';
  const btnCF=document.querySelector('#mode-select-screen .mss-btn[onclick="_modoFinanciero()"]');
  if(btnCF) btnCF.style.display=rol==='asesor'?'none':'flex';
  // Mostrar "Cambiar tienda" solo si el usuario tiene más de una tienda
  const btnCambiarTienda = document.getElementById('mss-btn-cambiar-tienda');
  if(btnCambiarTienda) btnCambiarTienda.style.display = (window._currentTiendaIds && window._currentTiendaIds.length > 1) ? 'block' : 'none';
};
window._cambiarTienda = function(){
  const uid = localStorage.getItem('lgs_user');
  const asesor = localStorage.getItem('lgs_asesor');
  if(!uid || !window._currentTiendaIds || !window._currentTiendaIds.length) return;
  document.getElementById('mode-select-screen').style.display='none';
  _mostrarSelectorTienda(uid, asesor, window._currentTiendaIds);
};

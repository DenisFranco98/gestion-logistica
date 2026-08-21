// ══════════════════════════════════════════════════════════════════════
// shared/app-shared.js — Firebase, sesión/login, admin, y utilidades
// comunes a las 3 páginas de módulo (control-financiero, gestiones-diarias,
// gestion-logistica) + index.html. Un solo archivo, referenciado con
// <script src>, para no duplicar fixes (ver plan de split en 3 páginas).
// ══════════════════════════════════════════════════════════════════════

// ── UN SOLO ORIGEN: www.dominio → dominio ──────────────────────────────
// Para el navegador, www.redking-tulogistica.com y redking-tulogistica.com son
// ORÍGENES DISTINTOS, o sea que cada uno tiene su propio localStorage. Quien
// entrara por www se encontraba sin sesión, sin tienda elegida y sin tema, y
// volvía a loguearse sin entender por qué. Antes daba casi igual porque www lo
// servía GitHub Pages; desde el 2026-08-17 los dos apuntan al mismo sitio de
// Firebase Hosting, así que sirven la misma app con dos memorias separadas.
//
// Esto va lo más arriba posible del archivo a propósito: corre antes de
// initializeApp() y antes de _initLogin(), así que no se llega a leer ni a
// escribir la sesión del origen equivocado. Lo único que se ejecuta antes es el
// <script> inline del tema, que es cosmético y se vuelve a aplicar al llegar.
//
// No puede entrar en bucle: el destino nunca empieza por "www.". Y no hace falta
// limitarlo al dominio de producción, porque ni localhost ni el .web.app empiezan
// por "www.". Se conservan path, query y hash — el hash va a importar cuando el
// Centro de Operaciones tenga su router.
(function(){
  try{
    var h = location.hostname;
    if(h.indexOf('www.') === 0){
      location.replace(location.protocol + '//' + h.slice(4) + location.pathname + location.search + location.hash);
    }
  }catch(_){}
})();

// ── HELPERS ────────────────────────────────────────────────────────────
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function toast(msg,dur=2200){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
// Escapa datos que vienen del Excel/Dropi (nombre del cliente, etc.) antes de insertarlos en innerHTML
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// Fecha YYYY-MM-DD en la zona horaria del equipo. toISOString() devuelve UTC:
// en Colombia (UTC-5) a partir de las 19:00 ya informa el día siguiente, así
// que todo lo gestionado de tarde-noche se guardaba con la fecha de mañana
// (historial diario, evidencias de novedades, fechas de R.O., rangos de la
// analítica). Usar siempre esta función para "hoy", nunca toISOString().
function _hoyLocal(d){
  const f=d||new Date();
  return f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0')+'-'+String(f.getDate()).padStart(2,'0');
}

// ── VERSIÓN PUBLICADA vs VERSIÓN CARGADA ─────────────────────────────
// GitHub Pages sirve el HTML con Cache-Control: max-age=600, así que hasta 10
// minutos después de publicar el navegador sigue usando el HTML viejo — y ese
// HTML pide los scripts con el ?v= anterior. De ahí que hubiera que explicar
// "recargá con Ctrl+F5" cada vez.
//
// version.json se pide sin caché y se compara con la versión que realmente se
// cargó. Si no coinciden, se recarga sola con un parámetro nuevo en la URL, que
// es lo único que obliga al navegador a volver a pedir el HTML.
//
// Salvaguardas, porque una recarga automática mal hecha deja la app en bucle:
//   · una sola recarga por pestaña (queda anotada en sessionStorage);
//   · si tras recargar sigue sin coincidir, no se insiste y se avisa por consola;
//   · si version.json no existe o falla, no se hace nada.
const _VER_FLAG = 'lgs_ver_recargada';

function _versionCargada(){
  const s = document.querySelector('script[src*="app-shared"]');
  const m = s && s.src && s.src.match(/[?&]v=([^&]+)/);
  return m ? m[1] : null;
}

async function _chequearVersion(){
  try{
    const actual = _versionCargada();
    if(!actual) return;
    // Absoluta a propósito: desde /admin/equipo, "version.json" a secas pediría
    // /admin/version.json, el rewrite devolvería index.html y el JSON.parse
    // reventaría. Mismo motivo por el que los <script src> son absolutos.
    const r = await fetch('/version.json?cb='+Date.now(), {cache:'no-store'});
    if(!r.ok) return;
    const pub = (await r.json()||{}).v;
    if(!pub || pub===actual){
      sessionStorage.removeItem(_VER_FLAG);   // al día: se limpia la marca
      return;
    }
    if(sessionStorage.getItem(_VER_FLAG)===pub){
      // Ya se recargó por esta misma versión y sigue llegando la vieja: puede
      // ser un proxy intermedio. No se insiste para no dejar la app girando.
      console.warn('[VERSIÓN] Publicada '+pub+' pero sigue cargando '+actual+
                   ' después de recargar. Probá con Ctrl+F5.');
      return;
    }
    sessionStorage.setItem(_VER_FLAG, pub);
    console.log('[VERSIÓN] Hay una versión nueva ('+pub+' vs '+actual+'): recargando.');
    const u = new URL(location.href);
    u.searchParams.set('_v', pub);
    location.replace(u.toString());
  }catch(e){ /* sin conexión o sin version.json: se sigue con lo cargado */ }
}

// El parámetro _v cumplió su función al pedir el HTML; se saca de la barra para
// que la URL quede limpia y no se comparta con él pegado.
function _limpiarParamVersion(){
  try{
    const u = new URL(location.href);
    if(!u.searchParams.has('_v')) return;
    u.searchParams.delete('_v');
    history.replaceState(null, '', u.pathname + (u.search||'') + (u.hash||''));
  }catch(e){}
}

// Meses cortos, escritos a mano y no con toLocaleDateString: es-CO con
// month:'short' devuelve "1 de ago" y el resultado cambia según el entorno.
// Vive acá porque lo usan Gestiones Diarias y el Consolidado GD del Panel Admin,
// que están en páginas distintas.
const _NOV_MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// La guía se escribe a mano o se pega desde Dropi, así que para comparar se
// ignoran espacios, guiones y mayúsculas: "ABC 123" y "abc-123" son la misma.
// Vive acá porque la usan los dos lados del cruce: Gestiones Diarias, para no
// duplicar la novedad de una guía ya registrada, y Gestión Logística, para
// reconocer en el tablero una guía que ya se gestionó.
function _novNormGuia(g){ return String(g||'').replace(/[\s-]+/g,'').toLowerCase(); }

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
// El respaldo va por _hoyLocal y no por toISOString: este equipo está en
// Colombia (UTC-5), así que el último día del mes, a partir de las 19:00, la
// versión UTC ya devolvía el mes SIGUIENTE. Con eso, novedades/, ro/ y la
// sincronización de guías se ponían a leer y escribir un nodo del mes que
// viene, vacío, justo en el cierre de mes.
function _getMesCargado(){
  return window._mesCargado || _hoyLocal().slice(0,7);
}

// ── CARGA DIFERIDA DE LIBRERÍAS EXTERNAS ────────────────────────────────
// El Centro de Operaciones está en las 4 páginas, pero XLSX (reporte
// consolidado) y Chart.js (analítica) solo venían en el <head> de algunas —
// en el resto el botón moría con "XLSX is not defined". En vez de sumarle
// ~1MB al landing, se inyectan la primera vez que se usan. Si la página ya
// las trae en el <head>, resuelve de inmediato sin volver a descargarlas.
const _LIB_XLSX  = {global:'XLSX',  url:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'};
const _LIB_CHART = {global:'Chart', url:'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'};
const _LIB_H2C   = {global:'html2canvas', url:'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'};
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

// ===== MODO AUDITORÍA (solo lectura) ====================================
// El admin entra a una tienda para VER cómo trabaja el equipo, no para operar.
// Antes "Entrar a tienda" lo metía como un asesor más: se registraba en
// presence/ (aparecía en "En vivo" y abría una sesión en session_hist), y
// cualquier cosa que tocara quedaba guardada a su nombre dentro de una tienda
// ajena. Auditar ensuciaba justamente lo que se iba a auditar.
//
// El modo auditoría corrige las tres cosas:
//   1. no registra presencia ni sesión — el auditor es invisible;
//   2. bloquea TODA escritura a la base (ver _refSoloLectura, más abajo);
//   3. deja elegir a qué asesor se está mirando (ver _gdAK).
//
// El estado se persiste en localStorage porque saltar de módulo es
// irAPagina() → location.href → carga completa: lo que viva solo en memoria no
// sobrevive al salto (mismo motivo que _cameFromAdmin y _currentTiendaIds).
const AUDIT_AK_KEY = 'lgs_audit_ak';  // uid del asesor que se está mirando
const AUDIT_AN_KEY = 'lgs_audit_an';  // su nombre, para pintarlo en la barra
// La verdad sobre "esto es una auditoría" la lleva lgs_auth==='audit', y no una
// bandera propia, a propósito: una bandera aparte sobrevive a un cierre de
// pestaña sin "Salir", y entonces el SIGUIENTE que entrara en ese navegador
// —un asesor, con su sesión legítima— se encontraría la app en solo lectura sin
// entender por qué. lgs_auth, en cambio, lo reescribe cada login.
// window._auditoria solo cubre el instante previo a que _entrarApp la fije.
function _esAuditoria(){
  if(window._auditoria===false) return false;
  try{ if(localStorage.getItem('lgs_auth')==='audit') return true; }catch(e){}
  return window._auditoria===true;
}
function _setAuditoria(on){ window._auditoria = !!on; }
// El asesor observado. Sin uno elegido se cae al del propio auditor, que dentro
// de una tienda ajena es un nodo vacío: por eso la barra elige el primero apenas
// carga la lista.
function _setAuditAsesor(uid, nombre){
  window._auditAk = uid||'';
  window._auditAn = nombre||'';
  try{
    uid ? localStorage.setItem(AUDIT_AK_KEY, uid) : localStorage.removeItem(AUDIT_AK_KEY);
    nombre ? localStorage.setItem(AUDIT_AN_KEY, nombre) : localStorage.removeItem(AUDIT_AN_KEY);
  }catch(e){}
}
function _getAuditAsesor(){
  if(window._auditAk) return window._auditAk;
  try{ const v=localStorage.getItem(AUDIT_AK_KEY); if(v){ window._auditAk=v; return v; } }catch(e){}
  return '';
}
function _getAuditAsesorNombre(){
  if(window._auditAn) return window._auditAn;
  try{ const v=localStorage.getItem(AUDIT_AN_KEY); if(v){ window._auditAn=v; return v; } }catch(e){}
  return '';
}
function _limpiarAuditoria(){
  window._auditoria=false; window._auditAk=''; window._auditAn='';
  try{ [AUDIT_AK_KEY,AUDIT_AN_KEY].forEach(k=>localStorage.removeItem(k)); }catch(e){}
}

// ── Blindaje de escritura ────────────────────────────────────────────────
// Ocultar los botones no alcanza: entre los 4 archivos hay ~356 llamadas de
// escritura, muchas automáticas (sincronizaciones, contadores derivados,
// heartbeats) que se disparan solas con solo abrir un módulo. Como todas pasan
// por _db.ref(), se blinda ahí una sola vez y no queda ningún camino suelto.
//
// El bloqueo NO rechaza la promesa: devuelve una resuelta. Un reject suelto
// dentro de un .then() de la app rompería el render a medias y el auditor vería
// una pantalla incompleta en vez de los datos que vino a mirar.
const _AUDIT_METODOS_ESCRITURA = ['set','update','remove','setPriority','setWithPriority','transaction'];
let _auditAvisoTs = 0;
function _auditBloquear(metodo, ruta){
  console.warn('[AUDITORÍA] escritura bloqueada: '+metodo+'() sobre '+ruta);
  // Un solo aviso cada 3s: una acción de la UI suele disparar varias escrituras
  // encadenadas y el usuario recibiría una ráfaga de toasts por un solo clic.
  const ahora = Date.now();
  if(ahora - _auditAvisoTs > 3000){
    _auditAvisoTs = ahora;
    if(typeof toast==='function') toast('🛡️ Modo auditoría: solo lectura, no se guardó nada', 3500);
  }
}
const _AUDIT_ON_DISCONNECT_NOOP = {
  set:()=>Promise.resolve(), update:()=>Promise.resolve(),
  remove:()=>Promise.resolve(), setWithPriority:()=>Promise.resolve(),
  cancel:()=>Promise.resolve()
};
// Envuelve una Reference/Query de Firebase dejando pasar las lecturas y
// neutralizando las escrituras. Todo lo que devuelva otra ref (child, parent,
// orderByChild, .ref de una Query...) se envuelve también, para que el blindaje
// no se pierda al navegar el árbol.
function _refSoloLectura(ref){
  if(!ref || typeof ref!=='object') return ref;
  return new Proxy(ref, {
    get(target, prop){
      const valor = target[prop];
      if(_AUDIT_METODOS_ESCRITURA.includes(prop) && typeof valor==='function'){
        return function(...args){
          _auditBloquear(prop, String(target));
          // transaction() recibe un callback de resultado que hay que honrar:
          // si no se llama, el código que espera confirmación se queda colgado.
          if(prop==='transaction' && typeof args[1]==='function') args[1](null, false, null);
          return Promise.resolve();
        };
      }
      if(prop==='onDisconnect') return ()=>_AUDIT_ON_DISCONNECT_NOOP;
      // push(valor) escribe; push() a secas solo genera una clave del lado del
      // cliente. Se llama sin argumentos para conservar .key —hay código que lo
      // usa— sin que nada llegue a la base.
      if(prop==='push' && typeof valor==='function'){
        return function(...args){
          if(args.length) _auditBloquear('push', String(target));
          return _refSoloLectura(valor.call(target));
        };
      }
      if(typeof valor==='function'){
        return function(...args){
          const r = valor.apply(target, args);
          // Devolvió otra ref o query (tiene once()): envolverla.
          return (r && typeof r==='object' && typeof r.once==='function') ? _refSoloLectura(r) : r;
        };
      }
      // Propiedades que son refs: .parent, .root, .ref de una Query.
      if(valor && typeof valor==='object' && typeof valor.once==='function') return _refSoloLectura(valor);
      return valor;
    }
  });
}
// Se instala una sola vez por carga de página, y solo si la sesión ya venía en
// auditoría: cada módulo es una carga nueva, así que el estado se relee de
// localStorage en cada una.
const _dbRefOriginal = _db.ref.bind(_db);
// El dueño de tienda puede mirar la Gestión de sus asesores. Mientras observa a
// otro, todo queda en solo lectura por el mismo camino que la auditoría: son
// datos de otra persona y un guardado accidental se los escribiría encima.
function _gdViendoOtro(){
  const v = window._gdVerAsesor;
  return !!(v && v!==window._currentUsername);
}
// Única condición de solo lectura del sistema: la usa el blindaje, así que
// alcanza con que devuelva true para que ninguna escritura pase.
function _esSoloLectura(){ return _esAuditoria() || _gdViendoOtro(); }

function _instalarBlindajeAuditoria(){
  if(window._auditBlindado) return;
  window._auditBlindado = true;
  _db.ref = function(ruta){
    const r = _dbRefOriginal(ruta);
    // Se evalúa en CADA llamada: así el mismo blindaje sirve para el admin
    // auditando y para el dueño mirando a un asesor, sin reinstalarlo.
    return _esSoloLectura() ? _refSoloLectura(r) : r;
  };
}
if(_esAuditoria()) _instalarBlindajeAuditoria();

// ── Barra de auditoría ───────────────────────────────────────────────────
// Se inyecta desde acá y no desde el HTML porque tiene que existir en las 4
// páginas: los 4 archivos cargan app-shared.js, así que se escribe una vez.
// Sin ella el auditor no tendría cómo saber que está en solo lectura, a quién
// está mirando, ni cómo salir.
window._auditBarraRefrescar = function(){
  const previa = document.getElementById('audit-bar');
  if(!_esAuditoria()){
    if(previa) previa.remove();
    document.body.classList.remove('modo-auditoria');
    return;
  }
  document.body.classList.add('modo-auditoria');
  let bar = previa;
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'audit-bar';
    document.body.appendChild(bar);
  }
  const tienda = localStorage.getItem('lgs_tienda') || '—';
  bar.innerHTML =
    '<span class="audit-bar-tag">🛡️ Modo auditoría</span>'+
    '<span class="audit-bar-sep">·</span>'+
    '<span class="audit-bar-ro">solo lectura</span>'+
    '<span class="audit-bar-tienda">🏪 '+esc(tienda)+'</span>'+
    '<label class="audit-bar-lbl" for="audit-asesor">Viendo a</label>'+
    '<select id="audit-asesor" class="audit-bar-select" onchange="_auditCambiarAsesor(this.value)">'+
      '<option value="">Cargando…</option>'+
    '</select>'+
    '<button class="audit-bar-salir" onclick="_volverAlAdmin()">Salir de la tienda</button>';
  _auditCargarAsesores();
};

// Los asesores salen de empresa_asesores/{empresaId} (el índice que ya usa el
// Panel Admin) y los nombres de /users. Se agregan los uid que tengan datos en
// gestiones_diarias del mes: alguien que ya no está asignado a la tienda igual
// trabajó ahí, y su historial es justamente lo que se viene a auditar.
window._auditCargarAsesores = function(){
  const sel = document.getElementById('audit-asesor');
  const empId = window._currentTiendaId || localStorage.getItem('lgs_empresa_id') || '';
  if(!sel || !empId) return;
  const mes = (typeof _gdMes!=='undefined' && _gdMes) ? _gdMes : _hoyLocal().slice(0,7);
  Promise.all([
    _db.ref('empresa_asesores/'+empId).once('value'),
    _db.ref('users').once('value'),
    _db.ref('gestiones_diarias/'+empId+'/'+mes).once('value')
  ]).then(([snapEA, snapU, snapGD])=>{
    const lista = _auditListaAsesores(snapU.val()||{}, snapGD.val()||{}, Object.keys(snapEA.val()||{}));
    if(!lista.length){
      sel.innerHTML = '<option value="">Sin asesores en esta tienda</option>';
      return;
    }
    let elegido = _getAuditAsesor();
    // Sin nadie elegido (o si el elegido ya no está en la tienda) se toma el
    // primero: el selector nunca puede quedar apuntando a un nodo que no existe,
    // porque entonces el módulo sale vacío y parece un error de datos.
    if(!elegido || !lista.find(a=>a.uid===elegido)){
      elegido = lista[0].uid;
      _setAuditAsesor(elegido, lista[0].nombre);
    } else {
      // Refrescar el nombre por si lo renombraron desde la última vez.
      _setAuditAsesor(elegido, (lista.find(a=>a.uid===elegido)||{}).nombre||'');
    }
    // data-nombre lleva el nombre limpio: el texto visible puede traer el correo
    // pegado para desempatar homónimos, y ese texto no sirve como nombre.
    sel.innerHTML = lista.map(a=>
      '<option value="'+esc(a.uid)+'" data-nombre="'+esc(a.nombre)+'"'+
      (a.uid===elegido?' selected':'')+'>'+esc(a.etiqueta||a.nombre)+'</option>'
    ).join('');
  }).catch(e=>{
    console.warn('[AUDITORÍA] no se pudo cargar la lista de asesores', e);
    sel.innerHTML = '<option value="">No se pudo cargar</option>';
  });
};

// Quién sale en el selector, a partir de /users, del nodo del mes en
// gestiones_diarias y de los asignados en empresa_asesores. Aparte y sin tocar
// Firebase para poder probarla: tiene dos reglas que se ven en los datos reales.
//   users: {uid:{asesor,email}}   gd: nodo de gestiones_diarias/{tienda}/{mes}
function _auditListaAsesores(users, gd, asignados){
  const nombreDe = uid => (users[uid]||{}).asesor || (users[uid]||{}).email || uid;
  const claves = new Set(asignados||[]);
  // Regla 1: del mes solo interesan las carpetas de personas. 'consolidado' y
  // 'notasHist' cuelgan del mes pero son de la tienda entera, y aparecían
  // listados como si fueran un asesor más.
  Object.keys(gd||{}).forEach(k=>{ if(!_GD_NO_ASESOR.has(k)) claves.add(k); });
  const candidatos = [...claves].map(clave=>{
    const esUid = !!users[clave];
    // _nombre es el rótulo que deja el propio módulo cuando la carpeta no es un
    // uid (las viejas, por slug del nombre): sin él quedaría la clave cruda.
    const nombre = esUid ? nombreDe(clave) : ((gd||{})[clave]||{})._nombre || clave;
    return {uid:clave, nombre, esUid};
  });
  // Regla 2: una misma persona puede tener DOS carpetas, la nueva por uid y la
  // vieja por slug del nombre, de antes de que la clave canónica pasara a ser el
  // uid — por eso se veían "DALILA" y "dalila" como si fueran dos asesoras. Se
  // muestra solo la del uid: para un mes que solo exista en la carpeta vieja,
  // _leerGD cae al slug del nombre observado y los datos igual salen. Las
  // carpetas viejas SIN uid equivalente se siguen listando, porque ahí no hay
  // ninguna otra forma de llegar a ese historial.
  const slugsConUid = new Set(candidatos.filter(c=>c.esUid).map(c=>_gdKey(c.nombre)));
  const lista = candidatos
    .filter(c=>c.esUid || !slugsConUid.has(_gdKey(c.nombre)))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  // Regla 3: dos CUENTAS distintas pueden llamarse igual (pasa cuando queda una
  // cuenta vieja "por tienda" junto a la personal). Ahí no hay nada que fusionar
  // —son uids distintos, con datos distintos— pero dos opciones con el mismo
  // texto dejan al auditor eligiendo a ciegas, así que se desempatan con el
  // correo. `etiqueta` es solo para mostrar: `nombre` tiene que quedar limpio
  // porque de él sale el slug con el que _gdAKLegacy busca las carpetas viejas.
  const vecesPorNombre = {};
  lista.forEach(c=>{ vecesPorNombre[c.nombre] = (vecesPorNombre[c.nombre]||0)+1; });
  lista.forEach(c=>{
    if(vecesPorNombre[c.nombre] < 2){ c.etiqueta = c.nombre; return; }
    const u = users[c.uid]||{};
    const detalle = u.email || u.username || (c.esUid ? c.uid.slice(0,6) : 'carpeta antigua');
    c.etiqueta = c.nombre+' · '+detalle;
  });
  return lista;
}

window._auditCambiarAsesor = function(uid){
  if(!uid) return;
  const sel = document.getElementById('audit-asesor');
  const opt = sel ? sel.options[sel.selectedIndex] : null;
  // El nombre limpio, no el texto visible: con homónimos el texto trae el correo.
  const nombre = opt ? (opt.dataset.nombre || opt.text || '') : '';
  _setAuditAsesor(uid, nombre);
  // Recarga completa a propósito. La clave del asesor (_gdAK) está leída en
  // decenas de puntos de cada módulo —tablas, contadores, consolidado, gráficos—
  // y no hay un único "repintar todo" que se pueda llamar; recargar garantiza
  // que no quede en pantalla un dato de la persona anterior.
  window._navegandoInterno = true;   // que el beforeunload no pida confirmación
  location.reload();
};

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

// Igual que _fusionarNovedades pero para anticipos, que la extensión vieja de
// ChateaPro siguió escribiendo bajo el slug del nombre después de la migración.
// La ruta tiene un nivel más: anticipos/{tienda}/{mes}/{con|sin}/{id}.
// Identidad de un anticipo: ts + cliente + teléfono (no hay guía).
// Ejecutar desde la consola como admin: _fusionarAnticipos()
window._fusionarAnticipos = function(){
  const idAnt=a=>String((a&&a.ts)||'')+'|'+String((a&&a.cliente)||'').trim().toLowerCase()+'|'+String((a&&a.telefono)||'').replace(/\D/g,'');
  console.log('%c[FUSIONAR anticipos] leyendo...','font-weight:bold');
  Promise.all([_db.ref('empresas').once('value'),_db.ref('anticipos').once('value')]).then(([se,sa])=>{
    const empresas=se.val()||{}, ant=sa.val()||{};
    const faltan=[];
    Object.entries(empresas).forEach(([id,e])=>{
      const slug=_gdKey(e.nombre||id);
      if(slug===id||!ant[slug]) return;
      Object.entries(ant[slug]).forEach(([mes,tipos])=>{
        if(!tipos||typeof tipos!=='object') return;
        ['con','sin'].forEach(tipo=>{
          const origen=tipos[tipo];
          if(!origen||typeof origen!=='object') return;
          const destino=(((ant[id]||{})[mes])||{})[tipo]||{};
          const yaHay=new Set(Object.values(destino).map(idAnt));
          Object.values(origen).forEach(a=>{
            if(!yaHay.has(idAnt(a))) faltan.push({tienda:e.nombre,id,mes,tipo,cliente:a.cliente||'',_val:a});
          });
        });
      });
    });
    if(!faltan.length){ console.log('%cNada que rescatar: no hay anticipos sueltos en las rutas viejas.','color:#15803d;font-weight:bold'); return; }
    console.group('%cAnticipos a recuperar ('+faltan.length+')','color:#0e7490;font-weight:bold');
    console.table(faltan.map(({tienda,mes,tipo,cliente})=>({tienda,mes,tipo,cliente})));
    console.groupEnd();
    let n=0,f=0;
    faltan.reduce((p,x)=>p.then(()=>
      _db.ref('anticipos/'+x.id+'/'+x.mes+'/'+x.tipo).push(x._val).then(()=>{n++;}).catch(e=>{f++;console.error('  ✗',e);})
    ),Promise.resolve()).then(()=>{
      console.log('%c[FUSIONAR anticipos] listo: '+n+' recuperados, '+f+' con error.','font-weight:bold;color:'+(f?'#b91c1c':'#15803d'));
      console.log('Las rutas viejas quedan intactas.');
    });
  }).catch(e=>console.error('[FUSIONAR anticipos] falló (¿sesión de admin?):',e));
};

// Recalcula los contadores soluc/devuelt de Gestiones Diarias a partir de la
// fuente de verdad, que son las novedades mismas (novedades/{tienda}/{mes}).
// Los contadores son un dato DERIVADO: si quedaron mal, se reconstruyen sin
// perder nada, porque las evidencias y sus estados están intactos.
//
// Hizo falta porque la extensión de Dropi estuvo mandando a `gestion` (bucket
// retirado, que ya nadie suma) todo lo marcado solucionada desde la app, y como
// escribe el día entero con un PUT, además pisaba lo que el panel había contado
// bien.
//
// Misma regla que _novSyncGD: devuelta gana sobre solucionada, y una novedad sin
// ninguna evidencia queda pendiente y no suma en ninguna columna.
//
// Solo corrige nodos de asesor que YA tienen registro de ese día: el contador se
// escribe bajo el asesor que estaba logueado, así que no hay forma de deducir a
// quién le tocaría un día que nadie registró. Nunca crea nodos nuevos.
//
// Ejecutar desde la consola como admin:
//   _recontarNovedades()                    → simulación, no escribe nada
//   _recontarNovedades({aplicar:true})      → aplica las correcciones
//   _recontarNovedades({mes:'2026-08'})     → limita a un mes
// Fusiona las evidencias que quedaron partidas en dos: hasta el 2026-08-05, una
// gestion con foto Y texto se guardaba como DOS evidencias, y como la unidad que
// suma es la evidencia, contaba 2 gestiones y pintaba 2 cuadros. Ya no pasa, pero
// las anteriores siguen duplicadas.
//
// Se reconocen por como se creaban: misma novedad, una tipo img y otra txt, del
// mismo asesor, mismo dia y mismo estado, con ts a menos de 5 segundos (se
// escribian con Date.now() y Date.now()+1). Se conserva la de imagen y el texto
// pasa a su campo `nota`; la de texto se borra.
//
// Ejecutar desde la consola como admin:
//   _novFusionarEvidencias()                 -> simulacion, no escribe nada
//   _novFusionarEvidencias({aplicar:true})   -> aplica
window._novFusionarEvidencias = function(opts){
  const aplicar=!!(opts||{}).aplicar;
  console.log('%c[FUSIONAR evidencias]'+(aplicar?'':' (simulacion - no escribe)'),'font-weight:bold');
  _db.ref('novedades').once('value').then(snap=>{
    const todo=snap.val()||{};
    const pares=[], updates={};
    Object.entries(todo).forEach(([tienda,meses])=>{
      Object.entries(meses||{}).forEach(([mes,novs])=>{
        Object.entries(novs||{}).forEach(([novId,n])=>{
          const sols=Object.entries((n&&n.soluciones)||{});
          const imgs=sols.filter(([,x])=>x&&x.tipo==='img');
          const txts=sols.filter(([,x])=>x&&x.tipo==='txt');
          imgs.forEach(([ki,si])=>{
            if(si.nota) return;                     // ya fusionada
            const par=txts.find(([kt,st])=>
              !updates['novedades/'+tienda+'/'+mes+'/'+novId+'/soluciones/'+kt] &&
              st.estado===si.estado && st.dia===si.dia &&
              (st.asesorUid||st.asesor)===(si.asesorUid||si.asesor) &&
              Math.abs((st.ts||0)-(si.ts||0))<5000);
            if(!par) return;
            const [kt,st]=par;
            const base='novedades/'+tienda+'/'+mes+'/'+novId+'/soluciones/';
            updates[base+ki+'/nota']=st.val||'';
            updates[base+kt]=null;
            pares.push({tienda,mes,guia:(n.guia||''),dia:si.dia,asesor:si.asesor||'',texto:String(st.val||'').slice(0,42)});
          });
        });
      });
    });
    if(!pares.length){ console.log('No hay evidencias partidas en dos. Nada que hacer.'); return; }
    console.table(pares);
    console.log(pares.length+' gestiones estaban contando doble.');
    if(!aplicar){ console.log('%cSimulacion: no se escribio nada. Para aplicar: _novFusionarEvidencias({aplicar:true})','color:#b45309'); return; }
    return _db.ref().update(updates).then(()=>{
      console.log('%cListo: '+pares.length+' fusionadas. Corre _recontarNovedades({aplicar:true}) para bajar los contadores.','color:#15803d;font-weight:bold');
    });
  }).catch(e=>console.error('[FUSIONAR] fallo (¿sesion de admin?):',e));
};

window._recontarNovedades = function(opts){
  const o=opts||{}, aplicar=!!o.aplicar, mesFiltro=o.mes||null;
  console.log('%c[RECONTAR novedades] leyendo...'+(aplicar?'':' (simulación — no escribe)'),'font-weight:bold');
  Promise.all([
    _db.ref('empresas').once('value'),
    _db.ref('novedades').once('value'),
    _db.ref('gestiones_diarias').once('value')
  ]).then(([se,sn,sg])=>{
    const empresas=se.val()||{}, nov=sn.val()||{}, gd=sg.val()||{};
    const nombreDe=k=>(empresas[k]&&empresas[k].nombre)||k;
    const cambios=[], duplicados=[];
    Object.entries(nov).forEach(([tk,meses])=>{
      if(!meses||typeof meses!=='object') return;
      Object.entries(meses).forEach(([mes,regs])=>{
        if(mesFiltro&&mes!==mesFiltro) return;
        if(!regs||typeof regs!=='object') return;
        // Conteo correcto por (asesor, día): cada evidencia es una gestión y
        // suma a quien la hizo, el día que la hizo.
        const esperado={};   // esperado[asesorKey][dia] = {soluc,devuelt}
        Object.values(regs).forEach(n=>{
          _novGestionesDe(n, mes).forEach(g=>{
            if(!g.dia||!g.asesorKey) return;
            if(!esperado[g.asesorKey]) esperado[g.asesorKey]={};
            if(!esperado[g.asesorKey][g.dia]) esperado[g.asesorKey][g.dia]={soluc:0,devuelt:0};
            if(g.estado==='devuelta') esperado[g.asesorKey][g.dia].devuelt++;
            else esperado[g.asesorKey][g.dia].soluc++;
          });
        });
        const asesores=((gd[tk]||{})[mes])||{};
        // Gestiones cuyo asesor no tiene nodo en gestiones_diarias: no se les
        // puede acreditar nada. Suele ser el campo 'asesor' escrito distinto.
        Object.keys(esperado).forEach(ak=>{
          if(!asesores[ak]) duplicados.push({tienda:nombreDe(tk),mes,asesorSinNodo:ak,
            gestiones:Object.values(esperado[ak]).reduce((a,d)=>a+d.soluc+d.devuelt,0)});
        });
        Object.entries(asesores).forEach(([ak,nodo])=>{
          const dias=(nodo||{}).dias||{};
          // Días con gestiones que el asesor todavía no tiene registrados: hay
          // que crearlos, si no esas gestiones no aparecerían en ninguna fila.
          const todosLosDias=new Set([...Object.keys(dias), ...Object.keys(esperado[ak]||{})]);
          todosLosDias.forEach(dia=>{
            const d=dias[dia]||{};
            const exp=(esperado[ak]||{})[dia]||{soluc:0,devuelt:0};
            const actSol=d.soluc||0, actDev=d.devuelt||0;
            const tieneLegacy=d.gestion!==undefined;
            if(actSol===exp.soluc&&actDev===exp.devuelt&&!tieneLegacy) return;
            cambios.push({
              tienda:nombreDe(tk), asesor:ak, mes, dia:+dia,
              soluc:actSol+' → '+exp.soluc, devuelt:actDev+' → '+exp.devuelt,
              gestionLegacy:tieneLegacy?(d.gestion||0):'',
              _path:'gestiones_diarias/'+tk+'/'+mes+'/'+ak+'/dias/'+dia,
              _upd:{soluc:exp.soluc,devuelt:exp.devuelt,gestion:null}
            });
          });
        });
      });
    });
    if(duplicados.length){
      console.group('%c⚠ Gestiones que no se le pueden acreditar a nadie ('+duplicados.length+')','color:#b45309;font-weight:bold');
      console.table(duplicados);
      console.log('El nombre del asesor de esas gestiones no coincide con ningún nodo de gestiones_diarias — casi siempre es el campo "asesor" escrito distinto (tildes, apellido, mayúsculas). Corregí el nombre en la novedad y volvé a correr esto.');
      console.groupEnd();
    }
    if(!cambios.length){ console.log('%cContadores al día: no hay nada que corregir.','color:#15803d;font-weight:bold'); return; }
    console.group('%cDías a corregir ('+cambios.length+')','color:#0e7490;font-weight:bold');
    console.table(cambios.map(({tienda,asesor,mes,dia,soluc,devuelt,gestionLegacy})=>({tienda,asesor,mes,dia,soluc,devuelt,gestionLegacy})));
    console.groupEnd();
    if(!aplicar){ console.log('%cSimulación: no se escribió nada. Para aplicar: _recontarNovedades({aplicar:true})','font-weight:bold'); return; }
    let n=0,f=0;
    cambios.reduce((p,x)=>p.then(()=>
      _db.ref(x._path).update(x._upd).then(()=>{n++;}).catch(e=>{f++;console.error('  ✗',x._path,e);})
    ),Promise.resolve()).then(()=>{
      console.log('%c[RECONTAR novedades] listo: '+n+' días corregidos, '+f+' con error.','font-weight:bold;color:'+(f?'#b91c1c':'#15803d'));
      console.log('Solo se tocaron soluc/devuelt y se limpió el campo gestion. Las novedades no se modificaron.');
    });
  }).catch(e=>console.error('[RECONTAR novedades] falló (¿sesión de admin?):',e));
};

// Deja UNA sola carpeta por persona en gestiones_diarias, la del uid.
//
// Una misma persona podía tener dos: la del uid y la vieja del slug de su
// nombre, porque la extensión y el Gestor Logístico acreditaban por nombre. En
// Paquetin, DALILA salía el 5 de agosto con 89 gestiones en una carpeta y 43 en
// la otra. El origen ya está corregido; esto ordena lo que quedó guardado.
//
// Hace DOS cosas, y las dos hacen falta:
//   A) rellena `asesorUid` en las evidencias viejas, que solo traen el nombre.
//      Sin esto, el primer recuento vuelve a crear la carpeta del slug y la
//      unificación se deshace sola.
//   B) suma los días de la carpeta vieja en la del uid y borra la vieja.
//
// NO toca:
//   · las carpetas viejas SIN uid equivalente en esa tienda — son el único
//     acceso a ese historial, y borrarlas perdería las gestiones;
//   · los casos ambiguos, dos cuentas distintas cuyo nombre da el mismo slug;
//   · el consolidado de la tienda, que es de la tienda y no de nadie.
//
// Ejecutar desde la consola como admin:
//   _unificarCarpetasAsesor()                → simulación, no escribe nada
//   _unificarCarpetasAsesor({aplicar:true})  → descarga el respaldo y aplica
window._unificarCarpetasAsesor = async function(opts){
  const aplicar=!!(opts||{}).aplicar;
  console.log('%c[UNIFICAR carpetas]'+(aplicar?'':' (simulación - no escribe)'),'font-weight:bold');
  try{
    const [uSnap,eSnap,gSnap]=await Promise.all([
      _db.ref('users').once('value'),
      _db.ref('empresas').once('value'),
      _db.ref('gestiones_diarias').once('value')
    ]);
    const users=uSnap.val()||{}, empresas=eSnap.val()||{}, gd=gSnap.val()||{};
    const nomTienda=tk=>((empresas[tk]||{}).nombre)||tk;
    const plan=[], ambiguos=[], soloViejas=[];

    Object.entries(gd).forEach(([tk,meses])=>{
      Object.entries(meses||{}).forEach(([mes,carpetas])=>{
        if(!carpetas||typeof carpetas!=='object') return;
        const pers=Object.entries(carpetas)
          .filter(([k,v])=>v&&typeof v==='object'&&v.dias&&!_GD_NO_ASESOR.has(k));
        const nombreDe=e=>String(e[1]._nombre||(users[e[0]]||{}).asesor||e[0]).trim();
        // Es carpeta vieja si su clave ES el slug de su propio nombre. La del
        // uid nunca coincide consigo misma: el uid no se deriva del nombre.
        const esSlug=e=>_gdKey(nombreDe(e))===e[0];
        const porSlug={};
        pers.forEach(e=>{ if(esSlug(e)) return;
          const s=_gdKey(nombreDe(e)); (porSlug[s]=porSlug[s]||[]).push(e[0]); });
        pers.forEach(e=>{
          if(!esSlug(e)) return;
          const [k,v]=e, destinos=porSlug[k]||[];
          if(!destinos.length){
            soloViejas.push({tienda:nomTienda(tk),mes,carpeta:k,nombre:nombreDe(e)}); return; }
          if(destinos.length>1){
            ambiguos.push({tienda:nomTienda(tk),mes,carpeta:k,candidatos:destinos.join(' · ')}); return; }
          const uid=destinos[0], dias=v.dias||{}, dstDias=((carpetas[uid]||{}).dias)||{};
          let gest=0; const listaDias=[], seSuman=[];
          Object.entries(dias).forEach(([d,x])=>{
            if(!x||typeof x!=='object') return;
            gest+=(x.soluc||0)+(x.devuelt||0);
            listaDias.push(d);
            if(dstDias[d]) seSuman.push(d);
          });
          plan.push({tienda:nomTienda(tk), _tk:tk, mes, nombre:nombreDe(e).toUpperCase(),
            de:k, a:uid, dias:listaDias.join(','), gestiones:gest,
            diasQueSeSuman:seSuman.join(',')||'—'});
        });
      });
    });

    if(!plan.length){ console.log('%cNo hay carpetas para unificar.','color:#15803d'); }
    else { console.group('%cSe unificarían '+plan.length+' carpetas','color:#b45309;font-weight:bold');
      console.table(plan.map(p=>({tienda:p.tienda,mes:p.mes,asesor:p.nombre,
        'carpeta vieja':p.de,'queda en (uid)':p.a,días:p.dias,
        'gestiones que mueve':p.gestiones,'días que se suman':p.diasQueSeSuman})));
      console.groupEnd(); }
    if(soloViejas.length){
      console.group('%cCarpetas viejas SIN uid equivalente ('+soloViejas.length+') — NO se tocan','color:#2563eb');
      console.log('Son el único acceso a ese historial. Se siguen viendo en el Consolidado GD.');
      console.table(soloViejas); console.groupEnd(); }
    if(ambiguos.length){
      console.group('%cAmbiguos ('+ambiguos.length+') — NO se tocan','color:#b91c1c');
      console.log('Dos cuentas distintas cuyo nombre da el mismo slug: hay que resolverlas a mano.');
      console.table(ambiguos); console.groupEnd(); }
    if(!aplicar){
      console.log('%cSimulación. Para aplicar: _unificarCarpetasAsesor({aplicar:true})','font-weight:bold');
      return plan; }
    if(!plan.length) return plan;

    // ── Aplicar ──
    const respaldo={ts:Date.now(), fecha:new Date().toString(), plan, carpetas:{}, evidencias:[]};
    plan.forEach(p=>{
      respaldo.carpetas['gestiones_diarias/'+p._tk+'/'+p.mes+'/'+p.de]=((gd[p._tk]||{})[p.mes]||{})[p.de]||null;
      respaldo.carpetas['gestiones_diarias/'+p._tk+'/'+p.mes+'/'+p.a]=((gd[p._tk]||{})[p.mes]||{})[p.a]||null;
    });

    // A) asesorUid en las evidencias viejas de esas personas.
    const pares=[...new Set(plan.map(p=>p._tk+'|'+p.mes))];
    let evi=0;
    for(const par of pares){
      const tk=par.split('|')[0], mes=par.split('|')[1];
      const slugs={}; plan.filter(p=>p._tk===tk&&p.mes===mes).forEach(p=>{slugs[p.de]=p.a;});
      const novs=(await _db.ref('novedades/'+tk+'/'+mes).once('value')).val()||{};
      const upd={};
      Object.entries(novs).forEach(([nid,n])=>{
        Object.entries((n||{}).soluciones||{}).forEach(([sk,s])=>{
          if(!s||typeof s!=='object'||s.asesorUid) return;
          const uid=slugs[_gdKey(s.asesor||(n||{}).asesor||'')];
          if(!uid) return;
          upd['novedades/'+tk+'/'+mes+'/'+nid+'/soluciones/'+sk+'/asesorUid']=uid;
          respaldo.evidencias.push({path:'novedades/'+tk+'/'+mes+'/'+nid+'/soluciones/'+sk,
            asesor:s.asesor||null, asesorUidPuesto:uid});
        });
      });
      if(Object.keys(upd).length){ await _db.ref().update(upd); evi+=Object.keys(upd).length; }
    }

    // Respaldo ANTES de borrar nada irreversible.
    try{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([JSON.stringify(respaldo,null,2)],{type:'application/json'}));
      a.download='unificar-carpetas-respaldo-'+_hoyLocal()+'.json';
      a.click(); URL.revokeObjectURL(a.href);
      console.log('Respaldo descargado: '+a.download);
    }catch(e){ console.warn('No se pudo descargar el respaldo, queda en window._unifRespaldo',e); }
    window._unifRespaldo=respaldo;

    // B) sumar los días en la carpeta del uid y borrar la vieja.
    const updGD={};
    plan.forEach(p=>{
      const nodo=((gd[p._tk]||{})[p.mes])||{};
      const fus={};
      _gdadmSumarDias(fus,(nodo[p.a]||{}).dias);   // primero el destino: su texto manda
      _gdadmSumarDias(fus,(nodo[p.de]||{}).dias);
      Object.entries(fus).forEach(([d,v])=>{
        updGD['gestiones_diarias/'+p._tk+'/'+p.mes+'/'+p.a+'/dias/'+d]=v; });
      // El nombre, por si la carpeta del uid no lo tenía.
      if(!(nodo[p.a]||{})._nombre && (nodo[p.de]||{})._nombre)
        updGD['gestiones_diarias/'+p._tk+'/'+p.mes+'/'+p.a+'/_nombre']=(nodo[p.de]||{})._nombre;
      updGD['gestiones_diarias/'+p._tk+'/'+p.mes+'/'+p.de]=null;
    });
    await _db.ref().update(updGD);

    console.log('%c[UNIFICAR carpetas] listo: '+plan.length+' carpetas unificadas, '+evi+
      ' evidencias con asesorUid.','font-weight:bold;color:#15803d');
    console.log('El respaldo tiene las carpetas como estaban y cada evidencia tocada.');
    return plan;
  }catch(e){ console.error('[UNIFICAR carpetas] falló (¿sesión de admin?):',e); }
};

// Recorre TODA la base y dice qué nodos siguen indexados por NOMBRE en vez de
// por uid (personas) o empresaId (tiendas). Solo lee, nunca escribe.
//
// Lista las claves con ?shallow=true de la API REST, que devuelve los nombres
// de los hijos sin bajar su contenido. Es obligatorio: nov_img pesa megas en
// imágenes y leerlo entero para mirar sus claves colgaría el navegador.
//
// Ejecutar desde la consola como admin:  _auditarClavesPorNombre()
// Busca gestiones registradas en lote: varias del mismo asesor en el mismo
// segundo. Nadie gestiona así, o sea que un lote es el sistema acreditándole
// trabajo a alguien — como pasó el 2026-08-06, cuando cargar el Excel le sumó
// 102 gestiones en un segundo a quien tenía la pantalla abierta.
//
// Solo lee. Ejecutar desde la consola como admin:
//   _auditarGestionesEnLote()              → el mes actual
//   _auditarGestionesEnLote('2026-07')     → otro mes
//   _auditarGestionesEnLote('2026-08', 3)  → bajando el umbral a 3
window._auditarGestionesEnLote = async function(mes, minimo){
  const MES = mes || _hoyLocal().slice(0,7);
  const MIN = minimo || 3;
  console.log('%c[LOTES de gestiones] '+MES+' · umbral: '+MIN+' en el mismo segundo','font-weight:bold');
  try{
    const [empSnap, usSnap] = await Promise.all([
      _db.ref('empresas').once('value'), _db.ref('users').once('value')]);
    const empresas = empSnap.val()||{}, users = usSnap.val()||{};
    const quien = u => (users[u]||{}).asesor || u;
    const lotes = [];
    for(const [id, e] of Object.entries(empresas)){
      const novs = (await _db.ref('novedades/'+id+'/'+MES).once('value')).val();
      if(!novs) continue;
      const porSegundo = {};
      Object.entries(novs).forEach(([nid, n])=>{
        Object.entries((n&&n.soluciones)||{}).forEach(([sk, s])=>{
          if(!s || typeof s!=='object') return;
          if(s.estado!=='solucionada' && s.estado!=='devuelta') return;
          const k = (s.asesorUid || s.asesor || '?') + '|' + Math.floor((s.ts||0)/1000);
          (porSegundo[k] = porSegundo[k] || []).push({nid, sk, s});
        });
      });
      Object.entries(porSegundo).forEach(([k, arr])=>{
        if(arr.length < MIN) return;
        const uid = k.split('|')[0];
        const dias = [...new Set(arr.map(x=>x.s.dia).filter(v=>v!=null))].sort((a,b)=>a-b);
        lotes.push({
          tienda: e.nombre || id,
          asesor: quien(uid),
          gestiones: arr.length,
          cuando: arr[0].s.ts ? new Date(arr[0].s.ts).toLocaleString('es-CO') : '—',
          'días que tocó': dias.join(', ') || '—',
          automáticas: arr.filter(x=>x.s.fromLogistica && x.s.val==='✅ Solucionada en Dropi').length
        });
      });
    }
    lotes.sort((a,b)=>b.gestiones-a.gestiones);
    if(!lotes.length){
      console.log('%cNingún lote sospechoso en '+MES+'.','color:#15803d;font-weight:bold');
      return [];
    }
    console.group('%c'+lotes.length+' lote(s) sospechoso(s) — '+
      lotes.reduce((a,b)=>a+b.gestiones,0)+' gestiones','color:#b91c1c;font-weight:bold');
    console.log('Una persona no registra varias gestiones en el mismo segundo. Revisá');
    console.log('con el asesor antes de borrar: puede haber gestiones reales mezcladas.');
    console.table(lotes);
    console.groupEnd();
    return lotes;
  }catch(e){ console.error('[LOTES de gestiones] falló (¿sesión de admin?):', e); }
};

window._auditarClavesPorNombre = async function(){
  console.log('%c[AUDITAR claves] solo lectura','font-weight:bold');
  try{
    // /admins además de /users: un administrador NO está en /users, así que
    // comparando solo contra ahí sus nodos salían como "desconocidos" — y son
    // cuentas activas. tY0ZAbs… es admin de 13 tiendas y figuraba para borrar.
    const [uSnap,eSnap,aSnap]=await Promise.all([
      _db.ref('users').once('value'), _db.ref('empresas').once('value'),
      _db.ref('admins').once('value')]);
    const users=uSnap.val()||{}, empresas=eSnap.val()||{}, admins=aSnap.val()||{};
    const esPersonaConocida=k=>!!users[k]||!!admins[k];
    const quien=u=>((users[u]||{}).asesor)||((users[u]||{}).email)||
                   ((admins[u]||{}).username)||((admins[u]||{}).email)||u;
    const slugAsesor={}, slugEmpresa={};
    Object.entries(users).forEach(([uid,u])=>{ const s=_gdKey((u||{}).asesor||'');
      if(s&&s!=='_') (slugAsesor[s]=slugAsesor[s]||[]).push(uid); });
    Object.entries(empresas).forEach(([id,e])=>{ const s=_gdKey((e||{}).nombre||'');
      if(s&&s!=='_') (slugEmpresa[s]=slugEmpresa[s]||[]).push(id); });

    const dbURL=((_db.app||{}).options||{}).databaseURL||'';
    let token=null;
    try{ const cu=firebase.auth().currentUser; if(cu) token=await cu.getIdToken(); }catch(e){}
    const claves=async path=>{
      try{
        const r=await fetch(dbURL+'/'+path+'.json?shallow=true'+(token?'&auth='+token:''));
        if(!r.ok) return null;
        const j=await r.json();
        return (j&&typeof j==='object')?Object.keys(j):[];
      }catch(e){ return null; }
    };

    // Nodos cuyo primer nivel es una PERSONA y cuáles una TIENDA.
    const PERSONA=['users','admins','user_tiendas','admin_empresas','presence',
                   'session_hist','session_reports','historial_diario'];
    const TIENDA=['gestiones_diarias','novedades','anticipos','ro','control_financiero',
                  'gestiones_sync','nov_img','logistica_guias','empresa_asesores'];
    const filas=[], sanos=[];

    for(const nodo of PERSONA.concat(TIENDA)){
      const esPersona=PERSONA.indexOf(nodo)>=0;
      const ks=await claves(nodo);
      if(ks===null){ filas.push({nodo,clave:'(sin acceso)',tipo:'?',dato:''}); continue; }
      let ok=0;
      ks.forEach(k=>{
        if(esPersona ? esPersonaConocida(k) : !!empresas[k]){ ok++; return; }
        const dueños=esPersona?slugAsesor[k]:slugEmpresa[k];
        filas.push({nodo, clave:k,
          tipo: dueños ? (esPersona?'NOMBRE de asesor':'NOMBRE de tienda') : 'desconocida',
          dato: dueños ? ('existe como '+(esPersona?'uid':'empresaId')+': '+dueños.join(' · ')) : ''});
      });
      sanos.push({nodo, tipo:esPersona?'por persona':'por tienda',
        'claves correctas':ok, 'claves a revisar':ks.length-ok});
    }

    console.group('%cResumen por nodo','font-weight:bold');
    console.table(sanos); console.groupEnd();
    if(filas.length){
      console.group('%cClaves que NO son uid/empresaId ('+filas.length+')','color:#b45309;font-weight:bold');
      console.table(filas); console.groupEnd();
    } else console.log('%cTodos los primeros niveles usan uid o empresaId.','color:#15803d');

    // gestiones_diarias tiene la persona en el TERCER nivel: /{tienda}/{mes}/{asesor}
    const gdRes=[];
    for(const tk of (await claves('gestiones_diarias'))||[]){
      for(const mes of (await claves('gestiones_diarias/'+tk))||[]){
        const aks=(await claves('gestiones_diarias/'+tk+'/'+mes))||[];
        let uid=0, nom=0, otras=0;
        aks.forEach(k=>{ if(_GD_NO_ASESOR.has(k)) return;
          if(users[k]) uid++; else if(slugAsesor[k]) nom++; else otras++; });
        if(nom||otras) gdRes.push({tienda:((empresas[tk]||{}).nombre)||tk, mes,
          'por uid':uid, 'por NOMBRE':nom, 'sin dueño conocido':otras});
      }
    }
    if(gdRes.length){
      console.group('%cgestiones_diarias · carpetas de asesor por nombre','color:#b45309;font-weight:bold');
      console.log('Las de "por NOMBRE" son las que unifica _unificarCarpetasAsesor().');
      console.table(gdRes); console.groupEnd();
    } else console.log('%cgestiones_diarias: todas las carpetas de asesor son uid.','color:#15803d');

    console.log('%cNo se revisan: login_audit (va por correo a propósito, registra intentos de '+
      'gente que puede no tener cuenta) e historial_diario, que dentro del uid abre una rama por '+
      'nombre — ver el detalle abajo.','color:#6b7280');
    const hd=[];
    for(const u of (await claves('historial_diario'))||[]){
      const ramas=(await claves('historial_diario/'+u))||[];
      if(ramas.length>1) hd.push({uid:u, asesor:quien(u), ramas:ramas.join(' · ')});
    }
    if(hd.length){
      console.group('%chistorial_diario con más de una rama de nombre ('+hd.length+')','color:#b45309');
      console.log('Misma persona, historial partido: pasa si le cambiaron o le escribieron distinto el nombre.');
      console.table(hd); console.groupEnd();
    }
    return {filas, gdRes, hd};
  }catch(e){ console.error('[AUDITAR claves] falló (¿sesión de admin?):',e); }
};

// Fusiona un pedido de gestiones_sync sobre el que ya está en la tienda, sin
// perder nada de ninguno de los dos: las notas se concatenan (sin repetir), los
// flags de gestionado ganan si alguno los tiene, y los textos vacíos se
// completan con el otro. `_ts` se queda con el más reciente.
function _gsFusionarPedido(dst, src){
  const out=Object.assign({}, dst||{});
  Object.entries(src||{}).forEach(([k,v])=>{
    if(k==='notas'||k==='eventos'){
      const a=Array.isArray(out[k])?out[k]:[], b=Array.isArray(v)?v:[];
      const vistos=new Set(a.map(n=>JSON.stringify(n)));
      out[k]=a.concat(b.filter(n=>!vistos.has(JSON.stringify(n))));
    }
    else if(typeof v==='boolean') out[k]=out[k]||v;
    else if(typeof v==='number')  out[k]=Math.max(out[k]||0, v);
    else if(out[k]===undefined||out[k]===null||out[k]==='') out[k]=v;
  });
  return out;
}

// Mueve las gestiones que quedaron guardadas bajo la identidad del USUARIO a la
// tienda que les corresponde.
//
// Pasa cuando la sesión arranca sin empresaId resuelto: _gsKey() es
// `_currentTiendaId || _currentUsername`, así que el trabajo del día entero se
// escribe bajo el uid (o el username) de quien lo hizo. El equipo no ve esas
// notas en el kanban y el admin no las cuenta al filtrar por tienda.
//
//   _moverGestionesSync({de:'<uid o username>', a:'<empresaId>'})              → simula
//   _moverGestionesSync({de:'...', a:'...', aplicar:true})                     → aplica
//
// Los pedidos que ya existen en la tienda NO se pisan: se fusionan con
// _gsFusionarPedido. Descarga un respaldo antes de escribir.
window._moverGestionesSync = async function(opts){
  opts=opts||{};
  const de=opts.de, a=opts.a, aplicar=opts.aplicar===true;
  if(!de||!a){ console.log("uso: _moverGestionesSync({de:'<clave origen>', a:'<empresaId destino>'})"); return; }
  console.log('%c[MOVER gestiones_sync]'+(aplicar?'':' (simulación - no escribe)'),'font-weight:bold');
  try{
    const [oSnap,dSnap,eSnap]=await Promise.all([
      _db.ref('gestiones_sync/'+de).once('value'),
      _db.ref('gestiones_sync/'+a).once('value'),
      _db.ref('empresas/'+a).once('value')
    ]);
    const origen=oSnap.val()||{}, destino=dSnap.val()||{};
    const nOrigen=Object.keys(origen).length;
    if(!nOrigen){ console.log('El origen no tiene gestiones.'); return; }
    if(!eSnap.exists()) console.warn('OJO: "'+a+'" no es un empresaId de /empresas. Revisá el destino antes de aplicar.');

    const nuevos=[], chocan=[];
    Object.keys(origen).forEach(k=>{ (destino[k]?chocan:nuevos).push(k); });
    console.log('Origen: gestiones_sync/'+de+'  ('+nOrigen+' pedidos)');
    console.log('Destino: gestiones_sync/'+a+'  ('+((eSnap.val()||{}).nombre||'?')+', '+
                Object.keys(destino).length+' pedidos)');
    console.table([{ 'se agregan':nuevos.length, 'ya existen y se fusionan':chocan.length }]);
    if(chocan.length){
      console.group('Pedidos que ya están en la tienda ('+chocan.length+')');
      console.table(chocan.slice(0,20).map(k=>({pedido:k,
        cliente:(origen[k]||{})._nombre||'', 'notas origen':((origen[k]||{}).notas||[]).length,
        'notas destino':((destino[k]||{}).notas||[]).length})));
      if(chocan.length>20) console.log('… y '+(chocan.length-20)+' más');
      console.groupEnd();
    }
    if(!aplicar){
      console.log('%cSimulación. Para aplicar: _moverGestionesSync({de:"'+de+'", a:"'+a+'", aplicar:true})','font-weight:bold');
      return {nuevos:nuevos.length, chocan:chocan.length};
    }

    const respaldo={ts:Date.now(), fecha:new Date().toString(), de, a,
      origen, destinoPrevio:{}};
    chocan.forEach(k=>{ respaldo.destinoPrevio[k]=destino[k]; });
    try{
      const el=document.createElement('a');
      el.href=URL.createObjectURL(new Blob([JSON.stringify(respaldo,null,2)],{type:'application/json'}));
      el.download='mover-gestiones-respaldo-'+_gdKey(de)+'-'+_hoyLocal()+'.json';
      el.click(); URL.revokeObjectURL(el.href);
      console.log('Respaldo descargado: '+el.download);
    }catch(e){ console.warn('No se pudo descargar el respaldo, queda en window._moverRespaldo',e); }
    window._moverRespaldo=respaldo;

    // Por lotes: un update con miles de pedidos completos es un payload enorme.
    const todas=Object.keys(origen);
    for(let i=0;i<todas.length;i+=200){
      const upd={};
      todas.slice(i,i+200).forEach(k=>{
        upd['gestiones_sync/'+a+'/'+k]=destino[k]?_gsFusionarPedido(destino[k],origen[k]):origen[k];
      });
      await _db.ref().update(upd);
      console.log('  … '+Math.min(i+200,todas.length)+'/'+todas.length);
    }
    await _db.ref('gestiones_sync/'+de).remove();
    console.log('%c[MOVER gestiones_sync] listo: '+nuevos.length+' agregados, '+chocan.length+
      ' fusionados. Origen borrado.','font-weight:bold;color:#15803d');
    return {nuevos:nuevos.length, chocan:chocan.length};
  }catch(e){ console.error('[MOVER gestiones_sync] falló (¿sesión de admin?):',e); }
};

// Lista las cuentas actuales con su uid, para poder decir "esta carpeta vieja
// es de esta persona". Muestra nombre, correo, rol y tiendas — nunca la
// contraseña, que en /users está en texto plano y no hay por qué pasearla.
//
// Ejecutar desde la consola como admin:
//   _listarUsuarios()          → todas
//   _listarUsuarios('lau')     → las que coincidan con ese texto
window._listarUsuarios = async function(filtro){
  try{
    const [uSnap,aSnap,eSnap]=await Promise.all([
      _db.ref('users').once('value'), _db.ref('admins').once('value'),
      _db.ref('empresas').once('value')]);
    const users=uSnap.val()||{}, admins=aSnap.val()||{}, empresas=eSnap.val()||{};
    const f=String(filtro||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const filas=[];
    for(const [uid,u] of Object.entries(users)){
      const nombre=(u||{}).asesor||'', mail=(u||{}).email||(u||{}).username||'';
      const txt=(nombre+' '+mail+' '+uid).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
      if(f && txt.indexOf(f)<0) continue;
      const t=(await _db.ref('user_tiendas/'+uid).once('value')).val()||{};
      filas.push({nombre, uid, correo:mail, rol:(u||{}).rol||'asesor',
        tiendas:Object.keys(t).map(id=>((empresas[id]||{}).nombre)||id).join(' · ')||'—',
        es:'usuario'});
    }
    Object.entries(admins).forEach(([uid,a])=>{
      const nombre=(a||{}).username||(a||{}).email||uid;
      const txt=(nombre+' '+uid).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
      if(f && txt.indexOf(f)<0) return;
      filas.push({nombre, uid, correo:(a||{}).email||'', rol:'admin', tiendas:'(todas las suyas)', es:'admin'});
    });
    filas.sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es'));
    console.table(filas);
    console.log(filas.length+' cuentas'+(filtro?' que coinciden con "'+filtro+'"':'')+'.');
    return filas;
  }catch(e){ console.error('[LISTAR usuarios] falló (¿sesión de admin?):',e); }
};

// Lleva lo guardado en una cuenta vieja (la del login por nombre de tienda) a
// la carpeta del uid de cada persona.
//
// Una misma cuenta guarda el trabajo de VARIAS personas: en historial_diario
// cuelga una rama por nombre, y adentro de 'Rojucol' conviven Giscela, Daniel C
// y Laura. Por eso el destino se define rama por rama, no de una.
//
//   _migrarCuentaVieja({
//     de:'Wildropshop',
//     ramas:{ 'laura':'<uid de Laura>', 'miguel quintero':'<uid de Miguel>' },
//     sesionesA:'<uid>',   // opcional: a quién van session_hist y session_reports
//     borrar:true          // opcional: borra la cuenta vieja al terminar
//   })
//
// Sin `aplicar:true` solo simula. Descarga respaldo antes de escribir.
//
// Qué hace con cada cosa:
//   · historial_diario → cada día va a historial_diario/{uid}/{nombre actual}/{fecha}.
//     Todo termina en UNA rama por persona, la de su nombre de hoy. Si el día ya
//     existe en destino se conserva el de _ts más reciente y se avisa.
//   · session_hist y session_reports → se copian tal cual: son push keys y no chocan.
//   · presence → NO se migra, solo se borra: es el estado de la ÚLTIMA sesión
//     (online, lastSeen) y pisaría el presence vivo de la persona. Se regenera
//     solo la próxima vez que entre.
window._migrarCuentaVieja = async function(opts){
  opts=opts||{};
  const de=opts.de, ramas=opts.ramas||{}, aplicar=opts.aplicar===true;
  // Ramas que se tiran a propósito, porque esa persona ya no está y se decidió
  // no conservar su historial. Van aparte de `ramas` y no por un valor especial
  // adentro: descartar trabajo tiene que costar escribirlo, no ser un descuido.
  const descartar=opts.descartar||[];
  if(!de){ console.log("uso: _migrarCuentaVieja({de:'Wildropshop', ramas:{'laura':'<uid>'}, sesionesA:'<uid>', borrar:true})"); return; }
  console.log('%c[MIGRAR cuenta vieja: '+de+']'+(aplicar?'':' (simulación - no escribe)'),'font-weight:bold');
  try{
    const [users,admins]=await Promise.all([
      _db.ref('users').once('value').then(s=>s.val()||{}),
      _db.ref('admins').once('value').then(s=>s.val()||{})]);
    const existe=uid=>!!users[uid]||!!admins[uid];
    const nombreDe=uid=>((users[uid]||{}).asesor)||((admins[uid]||{}).username)||uid;
    // Los uid se copian a mano y confundir l/1, O/0 o S/5 manda el historial a
    // una carpeta que no existe: no se avisa, simplemente nadie lo vuelve a ver.
    const malos=Object.values(ramas).filter(u=>!existe(u));
    if(opts.sesionesA && !existe(opts.sesionesA)) malos.push(opts.sesionesA);
    if(malos.length){
      console.error('Estos uid de destino no existen ni en /users ni en /admins:\n  '+
        [...new Set(malos)].join('\n  ')+'\nRevisalos con _listarUsuarios(). No se hace nada.');
      return;
    }
    const ramaDe=uid=>_gdKey(nombreDe(uid));
    const [hd,sh,sr]=await Promise.all([
      _db.ref('historial_diario/'+de).once('value').then(s=>s.val()||{}),
      _db.ref('session_hist/'+de).once('value').then(s=>s.val()||{}),
      _db.ref('session_reports/'+de).once('value').then(s=>s.val()||{})
    ]);
    const plan=[], choques=[], sinAsignar=[];
    // Dos ramas del MISMO lote pueden ir a la misma carpeta y traer el mismo
    // día: 'tatiana' y 'tat' eran la misma persona y las dos tenían el 12 de
    // mayo. Escribían en la misma ruta y la segunda pisaba a la primera sin
    // decir nada. Se lleva un índice para detectarlo y avisar.
    const yaPlan={}, choquesRamas=[];
    for(const [rama,uid] of Object.entries(ramas)){
      const dias=hd[rama];
      if(!dias){ console.warn('La rama "'+rama+'" no existe en '+de); continue; }
      const destRama=ramaDe(uid);
      const yaHay=(await _db.ref('historial_diario/'+uid+'/'+destRama).once('value')).val()||{};
      Object.entries(dias).forEach(([fecha,val])=>{
        const previo=yaHay[fecha];
        if(previo){
          const gana=(val&&val._ts||0)>=(previo._ts||0)?'el de la cuenta vieja':'el que ya estaba';
          choques.push({rama, fecha, 'se queda':gana});
        }
        const _path='historial_diario/'+uid+'/'+destRama+'/'+fecha;
        const _val=(previo && (previo._ts||0)>(val&&val._ts||0))?previo:val;
        const antes=yaPlan[_path];
        if(antes){
          // Gana el de _ts más reciente, igual que contra el destino.
          const ganaNuevo=(_val&&_val._ts||0)>(antes.item._val&&antes.item._val._ts||0);
          choquesRamas.push({fecha, 'ramas en conflicto':antes.rama+' ↔ '+rama,
            'se queda el de':ganaNuevo?rama:antes.rama, 'se descarta el de':ganaNuevo?antes.rama:rama});
          if(ganaNuevo) antes.item._val=_val;
          return;                       // no se agrega otra fila para la misma ruta
        }
        const item={rama, fecha, 'va a':nombreDe(uid)+' / '+destRama, _path, _val};
        yaPlan[_path]={rama, item};
        plan.push(item);
      });
    }
    const tirar=[];
    Object.keys(hd).forEach(r=>{
      if(r in ramas) return;
      const n=Object.keys(hd[r]||{}).length;
      if(descartar.indexOf(r)>=0) tirar.push({rama:r, 'días que se pierden':n});
      else sinAsignar.push({rama:r, días:n});
    });
    if(tirar.length){
      console.group('%cRamas que se DESCARTAN ('+tirar.length+') — se pierden al borrar','color:#b91c1c;font-weight:bold');
      console.log('Quedan en el respaldo que se descarga, pero salen de la base.');
      console.table(tirar); console.groupEnd();
    }

    console.log('Días de historial a mover: '+plan.length);
    if(plan.length) console.table(plan.map(p=>({rama:p.rama, fecha:p.fecha, 'va a':p['va a']})));
    if(choques.length){ console.group('%cDías que ya existen en destino ('+choques.length+')','color:#b45309');
      console.table(choques); console.groupEnd(); }
    if(choquesRamas.length){
      console.group('%cMismo día en DOS ramas que van a la misma persona ('+choquesRamas.length+')','color:#b91c1c;font-weight:bold');
      console.log('Solo puede quedar uno: se conserva el de _ts más reciente y el otro NO se guarda.');
      console.table(choquesRamas); console.groupEnd();
    }
    if(sinAsignar.length){ console.group('%cRamas SIN asignar ('+sinAsignar.length+') — no se tocan','color:#b91c1c');
      console.log('Si borrás la cuenta con estas ramas sin asignar, ese trabajo se pierde.');
      console.table(sinAsignar); console.groupEnd(); }
    const nSes=Object.keys(sh).length, nRep=Object.keys(sr).length;
    // Reparto de sesiones por el asesor que figura en cada una. Hace falta
    // cuando una cuenta la usaron varias personas: en 'Frankaro' hay 81
    // sesiones de Denis, 25 de la cuenta del asesor de turno y 5 de alguien que
    // ya no está. Mandarlas todas a un solo uid mezclaría las tres.
    const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
    const porAsesor={}, tirarDe=new Set((opts.descartarSesionesDe||[]).map(norm));
    Object.entries(opts.sesionesPorAsesor||{}).forEach(([n,uid])=>{ porAsesor[norm(n)]=uid; });
    const hayReparto=Object.keys(porAsesor).length>0||tirarDe.size>0;
    const sesPlan=[], sesHuerfanas={};
    if(hayReparto){
      const malosR=Object.values(porAsesor).filter(u=>!existe(u));
      if(malosR.length){
        console.error('Estos uid de sesionesPorAsesor no existen: '+[...new Set(malosR)].join(', ')+
          '. No se hace nada.'); return;
      }
      // session_hist guarda el nombre en `asesor` y session_reports en
      // `asesorNombre`. Mirando solo el primero, los reportes quedaban sin
      // dueño y el guard frenaba la migración entera.
      const quienEs=v=>(v||{}).asesor||(v||{}).asesorNombre||'';
      [['session_hist',sh],['session_reports',sr]].forEach(([raiz,obj])=>{
        Object.entries(obj).forEach(([k,v])=>{
          const a=norm(quienEs(v));
          if(tirarDe.has(a)) return;                       // descartada a propósito
          const uid=porAsesor[a];
          if(uid) sesPlan.push({raiz, k, v, uid});
          else { const n=quienEs(v)||'(sin asesor)'; sesHuerfanas[n]=(sesHuerfanas[n]||0)+1; }
        });
      });
      const resumen={};
      sesPlan.forEach(s=>{ const n=nombreDe(s.uid); resumen[n]=(resumen[n]||0)+1; });
      console.group('Reparto de sesiones por asesor');
      console.table(Object.entries(resumen).map(([n,c])=>({'va a':n, sesiones:c})));
      if(tirarDe.size) console.log('Se descartan las de: '+[...tirarDe].join(', '));
      if(Object.keys(sesHuerfanas).length){
        console.log('%cSesiones sin destino:','color:#b91c1c');
        console.table(Object.entries(sesHuerfanas).map(([n,c])=>({asesor:n, sesiones:c})));
      }
      console.groupEnd();
    }
    if(opts.sesionesA) console.log('Sesiones a mover: '+nSes+' de session_hist y '+nRep+
      ' de session_reports → '+nombreDe(opts.sesionesA));
    else if(!hayReparto && (nSes||nRep)) console.log('%cHay '+nSes+' sesiones y '+nRep+
      ' reportes SIN destino. Con borrar:true se pierden; pasá sesionesA para '+
      'conservarlos, o descartarSesiones:true para confirmar que se tiran.','color:#b45309');
    if(opts.borrar) console.log('Al terminar se borra: historial_diario/'+de+', session_hist/'+de+
      ', session_reports/'+de+' y presence/'+de);

    if(!aplicar){ console.log('%cSimulación. Agregá aplicar:true para hacerlo.','font-weight:bold'); return {plan:plan.length, choques:choques.length, sinAsignar}; }
    if(sinAsignar.length && opts.borrar){
      console.error('No se aplica: hay ramas sin asignar y borrar:true las perdería. Asignalas, descartalas o quitá borrar.');
      return;
    }
    if(opts.borrar && hayReparto && Object.keys(sesHuerfanas).length && !opts.descartarSesiones){
      console.error('No se aplica: hay sesiones cuyo asesor no está en sesionesPorAsesor '+
        'ni en descartarSesionesDe. Asignalas o pasá descartarSesiones:true.');
      return;
    }
    if(opts.borrar && (nSes||nRep) && !opts.sesionesA && !hayReparto && !opts.descartarSesiones){
      console.error('No se aplica: hay '+nSes+' sesiones y '+nRep+' reportes sin destino. '+
        'Pasá sesionesA para conservarlos o descartarSesiones:true para tirarlos.');
      return;
    }

    const respaldo={ts:Date.now(), fecha:new Date().toString(), de,
      historial_diario:hd, session_hist:sh, session_reports:sr,
      presence:(await _db.ref('presence/'+de).once('value')).val()};
    try{
      const el=document.createElement('a');
      el.href=URL.createObjectURL(new Blob([JSON.stringify(respaldo,null,2)],{type:'application/json'}));
      el.download='migrar-'+_gdKey(de)+'-'+_hoyLocal()+'.json';
      el.click(); URL.revokeObjectURL(el.href);
      console.log('Respaldo descargado: '+el.download);
    }catch(e){ console.warn('Queda en window._migCuentaRespaldo',e); }
    window._migCuentaRespaldo=respaldo;

    const upd={};
    plan.forEach(p=>{ upd[p._path]=p._val; });
    if(hayReparto) sesPlan.forEach(s=>{ upd[s.raiz+'/'+s.uid+'/'+s.k]=s.v; });
    else if(opts.sesionesA){
      Object.entries(sh).forEach(([k,v])=>{ upd['session_hist/'+opts.sesionesA+'/'+k]=v; });
      Object.entries(sr).forEach(([k,v])=>{ upd['session_reports/'+opts.sesionesA+'/'+k]=v; });
    }
    if(Object.keys(upd).length) await _db.ref().update(upd);
    if(opts.borrar){
      const del={};
      // Se borra TODO el rastro de la cuenta vieja: si quedara session_hist la
      // clave seguiría viva y volvería a aparecer en la próxima auditoría.
      del['historial_diario/'+de]=null;
      del['session_hist/'+de]=null;
      del['session_reports/'+de]=null;
      del['presence/'+de]=null;
      await _db.ref().update(del);
    }
    console.log('%c[MIGRAR cuenta vieja] listo: '+plan.length+' días'+
      (opts.sesionesA?', '+nSes+' sesiones, '+nRep+' reportes':'')+
      (opts.borrar?'. Cuenta vieja borrada.':'.'),'font-weight:bold;color:#15803d');
    return {plan:plan.length, choques:choques.length};
  }catch(e){ console.error('[MIGRAR cuenta vieja] falló (¿sesión de admin?):',e); }
};

// Responde "¿esta clave vieja es una persona que HOY ya tiene su uid, o es
// alguien distinto?". Es la pregunta que hay que contestar antes de borrar o
// archivar nada: las cuentas viejas eran por tienda (el login era 'Dalevys',
// 'Monklic'…) y detrás había personas que hoy tienen cuenta propia. Que la
// clave no sea un uid no significa que la persona no exista.
//
// Ejecutar desde la consola como admin:  _cruzarClavesViejas()
window._cruzarClavesViejas = async function(){
  console.log('%c[CRUZAR claves viejas con usuarios actuales] solo lectura','font-weight:bold');
  try{
    const [uSnap,aSnap,eSnap]=await Promise.all([
      _db.ref('users').once('value'), _db.ref('admins').once('value'),
      _db.ref('empresas').once('value')]);
    const users=uSnap.val()||{}, admins=aSnap.val()||{}, empresas=eSnap.val()||{};
    const dbURL=((_db.app||{}).options||{}).databaseURL||'';
    let token=null;
    try{ const cu=firebase.auth().currentUser; if(cu) token=await cu.getIdToken(); }catch(e){}
    const claves=async path=>{
      try{
        const r=await fetch(dbURL+'/'+path+'.json?shallow=true'+(token?'&auth='+token:''));
        if(!r.ok) return null;
        const j=await r.json(); return (j&&typeof j==='object')?Object.keys(j):[];
      }catch(e){ return null; }
    };
    // El nombre NO se escribe igual en la cuenta vieja y en la nueva: "Yiseth
    // Jácome" contra "YISETH", "Denis" contra "Denis Franco", "Yon Lopez"
    // contra "YON". Comparar el nombre completo daba "no tiene cuenta" para
    // gente que sí la tiene. Se compara por partes, sin tildes: hay candidato
    // cuando todas las palabras del nombre más corto están en el más largo.
    const partes=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
      .toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
    const coincide=(a,b)=>{
      if(!a.length||!b.length) return false;
      const chico=a.length<=b.length?a:b, grande=new Set(a.length<=b.length?b:a);
      return chico.every(t=>grande.has(t));
    };
    const usuariosHoy=Object.entries(users).map(([uid,u])=>({
      uid, nombre:(u||{}).asesor||(u||{}).email||uid, p:partes((u||{}).asesor||'')}));
    // Todas las claves de nodos por persona que no son uid ni admin.
    const NODOS=['presence','session_hist','session_reports','historial_diario'];
    const vistas=new Set();
    for(const nodo of NODOS){
      for(const k of (await claves(nodo))||[]){
        if(users[k]||admins[k]) continue;
        vistas.add(k);
      }
    }
    const filas=[];
    for(const k of vistas){
      const p=(await _db.ref('presence/'+k).once('value')).val()||{};
      const nombre=p.asesor||'';
      const np=partes(nombre);
      const cands=usuariosHoy.filter(u=>coincide(np,u.p));
      const ut=[];
      for(const c of cands){
        const t=(await _db.ref('user_tiendas/'+c.uid).once('value')).val()||{};
        Object.keys(t).forEach(id=>ut.push(((empresas[id]||{}).nombre)||id));
      }
      filas.push({
        'clave vieja':k,
        'quién la usaba':nombre||'(sin presence)',
        'tienda entonces':p.tienda||'',
        '¿tiene cuenta hoy?':cands.length?(cands.length>1?'SÍ ('+cands.length+' posibles)':'SÍ'):'NO',
        'se llama hoy':cands.map(c=>c.nombre).join(' · ')||'—',
        'uid actual':cands.map(c=>c.uid).join(' · ')||'—',
        'tiendas hoy':[...new Set(ut)].join(' · ')||'—'
      });
    }
    filas.sort((a,b)=>String(a['¿tiene cuenta hoy?']).localeCompare(String(b['¿tiene cuenta hoy?'])));
    console.table(filas);
    const sin=filas.filter(f=>f['¿tiene cuenta hoy?']==='NO');
    console.log('%cCon cuenta actual: '+(filas.length-sin.length)+'  ·  Sin cuenta actual: '+sin.length,
      'font-weight:bold');
    if(sin.length) console.log('Las que no tienen cuenta hoy son las delicadas: si esa persona sigue '+
      'trabajando, hay que darle de alta antes de tocar nada (es el caso de TATIANA).');
    return filas;
  }catch(e){ console.error('[CRUZAR claves viejas] falló (¿sesión de admin?):',e); }
};

// Mide un nodo sin saber su forma: cuántas hojas tiene y entre qué fechas va.
// Las fechas salen de dos lados, porque conviven los dos formatos: números que
// parecen timestamps en ms, y claves con forma AAAA-MM-DD (historial_diario).
function _invMedir(v){
  let hojas=0, min=Infinity, max=0;
  const FECHA=/^\d{4}-\d{2}-\d{2}$/;
  (function rec(x){
    if(x===null||x===undefined) return;
    if(typeof x!=='object'){
      hojas++;
      if(typeof x==='number'&&x>1.4e12&&x<2.2e12){ min=Math.min(min,x); max=Math.max(max,x); }
      return;
    }
    Object.entries(x).forEach(([k,val])=>{
      if(FECHA.test(k)){ const t=Date.parse(k+'T12:00:00');
        if(t){ min=Math.min(min,t); max=Math.max(max,t); } }
      rec(val);
    });
  })(v);
  return {hojas, desde:min===Infinity?null:min, hasta:max||null};
}

// Inventario de TODO lo que quedó guardado bajo una clave que no es uid ni
// empresaId, para poder decidir qué se borra con el dato a la vista y no a
// ciegas. Solo lee, y descarga un respaldo con el contenido completo.
//
// Existe por un motivo concreto: en la auditoría, la clave
// oB2NSeO2P4bbTT7GSOLHSuVIFw63 figuraba como "desconocida" y resultó tener 180
// gestiones reales de TATIANA con sus notas. Una clave rara no es basura hasta
// que se mira qué hay adentro.
//
// Ejecutar desde la consola como admin:  _inventarioClavesViejas()
window._inventarioClavesViejas = async function(){
  console.log('%c[INVENTARIO claves viejas] solo lectura','font-weight:bold');
  try{
    // /admins además de /users, por lo mismo que en _auditarClavesPorNombre:
    // un admin no está en /users y sus nodos aparecían como candidatos a borrar.
    const [uSnap,eSnap,aSnap]=await Promise.all([
      _db.ref('users').once('value'), _db.ref('empresas').once('value'),
      _db.ref('admins').once('value')]);
    const users=uSnap.val()||{}, empresas=eSnap.val()||{}, admins=aSnap.val()||{};
    const esPersonaConocida=k=>!!users[k]||!!admins[k];
    const PERSONA=['admins','user_tiendas','admin_empresas','presence',
                   'session_hist','session_reports','historial_diario'];
    const TIENDA=['gestiones_diarias','novedades','anticipos','ro','control_financiero',
                  'gestiones_sync','nov_img','logistica_guias','empresa_asesores'];
    const dbURL=((_db.app||{}).options||{}).databaseURL||'';
    let token=null;
    try{ const cu=firebase.auth().currentUser; if(cu) token=await cu.getIdToken(); }catch(e){}
    const claves=async path=>{
      try{
        const r=await fetch(dbURL+'/'+path+'.json?shallow=true'+(token?'&auth='+token:''));
        if(!r.ok) return null;
        const j=await r.json();
        return (j&&typeof j==='object')?Object.keys(j):[];
      }catch(e){ return null; }
    };

    const filas=[], respaldo={ts:Date.now(), fecha:new Date().toString(), nodos:{}};
    for(const nodo of PERSONA.concat(TIENDA)){
      const esPersona=PERSONA.indexOf(nodo)>=0;
      const ks=await claves(nodo);
      if(!ks) continue;
      for(const k of ks){
        if(esPersona ? esPersonaConocida(k) : !!empresas[k]) continue;   // clave correcta
        // nov_img son imágenes: se cuenta por shallow, nunca se baja.
        let val=null, hijos=0, medida={hojas:0,desde:null,hasta:null};
        if(nodo==='nov_img'){ hijos=((await claves(nodo+'/'+k))||[]).length; }
        else{
          val=(await _db.ref(nodo+'/'+k).once('value')).val();
          hijos=(val&&typeof val==='object')?Object.keys(val).length:(val==null?0:1);
          medida=_invMedir(val);
          respaldo.nodos[nodo+'/'+k]=val;
        }
        // ¿De quién es? presence guarda asesor y tienda de la última sesión y
        // es una lectura chica: es la forma barata de ponerle nombre a un
        // nodo huérfano. El username puede mentir (ver "3D Company").
        let due='';
        try{
          const p=(await _db.ref('presence/'+k).once('value')).val();
          if(p) due=(p.asesor||'?')+' · '+(p.tienda||'?');
        }catch(e){}
        // _hoyLocal y no toISOString: en UTC una sesión de las 7 de la tarde
        // colombiana ya figura al día siguiente.
        const f=t=>t?_hoyLocal(new Date(t)):'';
        filas.push({nodo, clave:k, 'de quién es':due||'(sin presence)',
          registros:hijos, datos:medida.hojas,
          desde:f(medida.desde), hasta:f(medida.hasta),
          '¿tiene trabajo?': medida.hojas>0 ? 'SÍ' : 'vacío'});
      }
    }

    const conDatos=filas.filter(f=>f['¿tiene trabajo?']==='SÍ');
    const vacias=filas.filter(f=>f['¿tiene trabajo?']!=='SÍ');
    console.group('%cClaves viejas con datos adentro ('+conDatos.length+') — NO borrar sin mirar','color:#b45309;font-weight:bold');
    console.table(conDatos); console.groupEnd();
    if(vacias.length){
      console.group('%cClaves vacías o sin datos útiles ('+vacias.length+') — seguras de borrar','color:#15803d');
      console.table(vacias); console.groupEnd();
    }
    try{
      const el=document.createElement('a');
      el.href=URL.createObjectURL(new Blob([JSON.stringify(respaldo,null,2)],{type:'application/json'}));
      el.download='inventario-claves-viejas-'+_hoyLocal()+'.json';
      el.click(); URL.revokeObjectURL(el.href);
      console.log('Respaldo con el contenido completo descargado: '+el.download);
    }catch(e){ console.warn('Queda en window._invRespaldo',e); }
    window._invRespaldo=respaldo;
    console.log('Nada se borró. Con esta lista decidimos qué sí y qué no.');
    return filas;
  }catch(e){ console.error('[INVENTARIO claves viejas] falló (¿sesión de admin?):',e); }
};

// Audita de quién son realmente los números de la tabla de Gestión de una
// tienda. Responde a "¿estas confirmaciones son de esta asesora o de alguien
// más?", que tiene dos formas posibles de mezclarse:
//   1. La clave del nodo sale del NOMBRE del asesor (_gdKey), no del uid ni del
//      correo: dos personas con el mismo nombre comparten fila, y un nombre
//      vacío cae en la clave '_' donde se acumula todo.
//   2. _leerTienda copia el nodo entero desde la ruta vieja por nombre de
//      tienda cuando la nueva (por empresaId) está vacía. Si dos negocios
//      tienen una tienda con el mismo nombre, una puede heredar el histórico
//      de la otra.
// Solo lee, no escribe nada.
// Ejecutar desde la consola como admin:
//   _auditGD('PAQUETIN')            → mes actual
//   _auditGD('PAQUETIN','2026-07')  → un mes concreto
window._auditGD = function(nombreTienda, mes){
  const hoy=new Date();
  const m=mes||(hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0'));
  const buscado=_gdKey(nombreTienda||'');
  if(!buscado||buscado==='_'){ console.error('Pasá el nombre de la tienda: _auditGD("PAQUETIN")'); return; }
  console.log('%c[AUDIT GD] '+nombreTienda+' · '+m,'font-weight:bold');
  Promise.all([_db.ref('empresas').once('value'),_db.ref('gestiones_diarias').once('value'),_db.ref('users').once('value')])
  .then(([se,sg,su])=>{
    const empresas=se.val()||{}, gd=sg.val()||{}, users=su.val()||{};
    // 1. ¿Cuántas empresas se llaman así?
    const mismas=Object.entries(empresas).filter(([,e])=>_gdKey((e||{}).nombre||'')===buscado);
    if(!mismas.length){ console.error('No hay ninguna empresa con ese nombre.'); return; }
    if(mismas.length>1){
      console.group('%c⚠ '+mismas.length+' negocios distintos tienen una tienda llamada así','color:#b91c1c;font-weight:bold');
      console.table(mismas.map(([id,e])=>({empresaId:id,nombre:e.nombre})));
      console.log('Comparten la ruta vieja gestiones_diarias/'+buscado+'/ — de ahí se pudo copiar historial ajeno.');
      console.groupEnd();
    }
    // 2. Nodos de asesor, en la ruta nueva de cada empresa y en la vieja
    const suma=d=>{let c=0,t=0;Object.values(d||{}).forEach(x=>{c+=(x.conf||0);
      t+=(x.conf||0)+(x.cancel||0)+(x.soluc||0)+(x.devuelt||0)+(x.recupCarri||0)+(x.contNoRecup||0)+(x.ventasWpp||0);});return{conf:c,total:t};};
    const filas=[];
    const push=(ruta,ak,nodo)=>{
      const s=suma((nodo||{}).dias);
      filas.push({ruta, claveAsesor:ak, nombreGuardado:(nodo||{})._nombre||'—', conf:s.conf, totalGestiones:s.total,
                  dias:Object.keys((nodo||{}).dias||{}).length});
    };
    mismas.forEach(([id,e])=>Object.entries(((gd[id]||{})[m])||{}).forEach(([ak,nodo])=>push('nueva · '+(e.nombre||id),ak,nodo)));
    Object.entries(((gd[buscado]||{})[m])||{}).forEach(([ak,nodo])=>push('VIEJA · '+buscado,ak,nodo));
    if(!filas.length){ console.log('Sin datos de ese mes.'); return; }
    console.group('%cNodos de asesor y sus números','color:#0e7490;font-weight:bold');
    console.table(filas);
    console.groupEnd();
    // 3. Personas cuyo nombre colapsa en la misma clave
    const porClave={};
    Object.entries(users).forEach(([uid,u])=>{
      const ak=_gdKey((u||{}).asesor||'');
      (porClave[ak]=porClave[ak]||[]).push({uid, asesor:(u||{}).asesor||'(vacío)', email:(u||{}).email||'', rol:(u||{}).rol||''});
    });
    const claves=new Set(filas.map(f=>f.claveAsesor));
    const choques=[...claves].filter(ak=>(porClave[ak]||[]).length>1);
    if(choques.length){
      console.group('%c⚠ Personas distintas que comparten la misma clave de asesor','color:#b91c1c;font-weight:bold');
      choques.forEach(ak=>{ console.log('clave "'+ak+'":'); console.table(porClave[ak]); });
      console.log('Todas escriben en el MISMO nodo: sus números están sumados entre sí.');
      console.groupEnd();
    } else {
      console.log('%c✔ Ninguna clave de asesor de esta tienda la comparten dos personas.','color:#15803d;font-weight:bold');
    }
    if(claves.has('_')) console.warn('Hay un nodo con clave "_": son gestiones guardadas sin nombre de asesor en sesión.');
  }).catch(e=>console.error('[AUDIT GD] falló (¿sesión de admin?):',e));
};

// La pertenencia de un asesor a una tienda vive en dos índices espejo:
//   empresa_asesores/{empresaId}/{uid}   ← lo lee el panel de admin
//   user_tiendas/{uid}/{empresaId}       ← lo lee el login
// Si solo está uno, el asesor entra pero no aparece en el panel (o al revés), y
// sin user_tiendas entra SIN empresaId: sus datos se guardan en las rutas viejas
// por nombre de tienda. El alta ya escribe ambos, esto repara lo anterior.
// Además detecta membresías a empresas que no existen — típicamente el nodo
// basura 'empresa_asesores/__todas__' que creaba el alta vieja.
//
// Ejecutar desde la consola como admin:
//   _auditMembresias()                  → simulación, no escribe nada
//   _auditMembresias({aplicar:true})    → completa el índice que falte
window._auditMembresias = function(opts){
  const aplicar=!!(opts||{}).aplicar;
  console.log('%c[MEMBRESÍAS] leyendo...'+(aplicar?'':' (simulación — no escribe)'),'font-weight:bold');
  Promise.all([
    _db.ref('empresa_asesores').once('value'),
    _db.ref('user_tiendas').once('value'),
    _db.ref('empresas').once('value'),
    _db.ref('users').once('value')
  ]).then(([sea,sut,se,su])=>{
    const ea=sea.val()||{}, ut=sut.val()||{}, empresas=se.val()||{}, users=su.val()||{};
    const nombreEmp=id=>(empresas[id]||{}).nombre||'(no existe)';
    const quien=uid=>{const u=users[uid]||{};return (u.asesor||u.email||uid);};
    const faltaUT=[], faltaEA=[], huerfanos=[], sinCuenta=[];
    // Una asimetría entre los dos índices NO siempre es falta de sincronía:
    // puede ser una membresía de alguien que ya no existe. Repararla la hace
    // aparecer en el panel como un asesor fantasma — pasó dos veces en
    // producción. Si no hay cuenta en users/, va a la lista de borrar.
    const revisar=(uid,empId,indice)=>{
      if(users[uid]) return false;
      sinCuenta.push({uid, tienda:nombreEmp(empId), visto:indice,
        _paths:['empresa_asesores/'+empId+'/'+uid,'user_tiendas/'+uid+'/'+empId]});
      return true;
    };
    Object.entries(ea).forEach(([empId,uids])=>{
      Object.keys(uids||{}).forEach(uid=>{
        if(!empresas[empId]){ huerfanos.push({indice:'empresa_asesores',empresaId:empId,uid,asesor:quien(uid)}); return; }
        if(revisar(uid,empId,'empresa_asesores')) return;
        if(!((ut[uid]||{})[empId])) faltaUT.push({asesor:quien(uid),uid,tienda:nombreEmp(empId),empresaId:empId,
          _path:'user_tiendas/'+uid+'/'+empId});
      });
    });
    Object.entries(ut).forEach(([uid,emps])=>{
      Object.keys(emps||{}).forEach(empId=>{
        if(!empresas[empId]){ huerfanos.push({indice:'user_tiendas',empresaId:empId,uid,asesor:quien(uid)}); return; }
        if(revisar(uid,empId,'user_tiendas')) return;
        if(!((ea[empId]||{})[uid])) faltaEA.push({asesor:quien(uid),uid,tienda:nombreEmp(empId),empresaId:empId,
          _path:'empresa_asesores/'+empId+'/'+uid});
      });
    });
    if(sinCuenta.length){
      console.group('%c⚠ Membresías de cuentas que NO existen ('+sinCuenta.length+') — hay que BORRARLAS, no repararlas','color:#b91c1c;font-weight:bold');
      console.table(sinCuenta.map(({uid,tienda,visto})=>({uid,tienda,visto})));
      console.log('Repararlas las haría aparecer en el panel como asesores fantasma. Borralas a mano o con _limpiarMembresiasSinCuenta().');
      console.groupEnd();
    }
    if(faltaEA.length){
      console.group('%c⚠ INVISIBLES EN EL PANEL — están en user_tiendas pero no en empresa_asesores ('+faltaEA.length+')','color:#b91c1c;font-weight:bold');
      console.table(faltaEA.map(({asesor,tienda,uid})=>({asesor,tienda,uid}))); console.groupEnd();
    }
    if(faltaUT.length){
      console.group('%c⚠ ENTRAN SIN empresaId — están en empresa_asesores pero no en user_tiendas ('+faltaUT.length+')','color:#b45309;font-weight:bold');
      console.table(faltaUT.map(({asesor,tienda,uid})=>({asesor,tienda,uid})));
      console.log('Sus datos se están guardando en las rutas viejas por nombre de tienda.');
      console.groupEnd();
    }
    if(huerfanos.length){
      console.group('%c⚠ Membresías a empresas que no existen ('+huerfanos.length+')','color:#b91c1c;font-weight:bold');
      console.table(huerfanos);
      console.log('Si el empresaId es "__todas__" viene del alta vieja. Estas NO se reparan solas: hay que reasignar a mano la tienda correcta.');
      console.groupEnd();
    }
    // SOLO se repara la dirección segura: completar empresa_asesores para quien
    // ya está en user_tiendas. Eso lo hace visible en el panel y nada más.
    //
    // La dirección inversa NO se repara nunca: escribir user_tiendas le DA
    // acceso real a una tienda. Al correr esto en producción aparecieron 46
    // casos, todos de "3D Company", que tenía 22 asesores asignados habiendo 17
    // usuarios en total — los deja ahí _migracionInicial(), no son un error de
    // sincronía. Repararlos habría dado acceso a esa tienda a media empresa.
    if(faltaUT.length) console.log('%cLos '+faltaUT.length+' de arriba NO se reparan solos: escribir user_tiendas les daría acceso a esa tienda. Revisá caso por caso y agregalos desde el panel si corresponde.','color:#b45309');
    const arreglos=faltaEA;
    if(!arreglos.length){ console.log('%c✔ No hay asesores invisibles en el panel.','color:#15803d;font-weight:bold'); return; }
    if(!aplicar){ console.log('%cSimulación: no se escribió nada. Para reparar los '+arreglos.length+' invisibles: _auditMembresias({aplicar:true})','font-weight:bold'); return; }
    const updates={}; arreglos.forEach(x=>{ updates[x._path]=true; });
    _db.ref().update(updates)
      .then(()=>console.log('%c[MEMBRESÍAS] listo: '+arreglos.length+' reparadas. Los huérfanos siguen pendientes de reasignar a mano.','font-weight:bold;color:#15803d'))
      .catch(e=>console.error('  ✗',e));
  }).catch(e=>console.error('[MEMBRESÍAS] falló (¿sesión de admin?):',e));
};

// Mueve las Gestiones Diarias de un asesor cuando le cambian el nombre.
// La carpeta donde se guardan sale de _gdKey(nombre), así que al renombrarlo
// las gestiones nuevas empiezan en otra clave y lo anterior queda bajo la vieja
// (el asesor "pierde" su historial y aparece partido en dos en el consolidado).
// Solo afecta a gestiones_diarias: novedades, R.O. y anticipos cuelgan de la
// tienda, y historial_diario se indexa por uid.
//
// Nunca pisa un día que ya exista en destino — si el mismo día está en las dos
// claves lo reporta y lo deja quieto, porque sumar duplicaría. El origen no se
// borra: la migración es reversible.
//
// Ejecutar desde la consola como admin:
//   _migrarAsesor('PAQUETIN','Wildropshop','Laura')                 → simula
//   _migrarAsesor('PAQUETIN','Wildropshop','Laura',{aplicar:true})  → aplica
window._migrarAsesor = function(nombreTienda, nombreViejo, nombreNuevo, opts){
  const aplicar=!!(opts||{}).aplicar;
  const kViejo=_gdKey(nombreViejo||'');
  if(!kViejo||kViejo==='_'||!nombreNuevo){ console.error('Faltan nombres: _migrarAsesor("TIENDA","Nombre viejo","Nombre nuevo")'); return; }
  const kTienda=_gdKey(nombreTienda||'');
  console.log('%c[MIGRAR asesor] desde '+kViejo+(aplicar?'':' (simulación — no escribe)'),'font-weight:bold');
  Promise.all([_db.ref('empresas').once('value'),_db.ref('gestiones_diarias').once('value'),_db.ref('users').once('value')]).then(([se,sg,su])=>{
    const empresas=se.val()||{}, gd=sg.val()||{}, users=su.val()||{};
    // El destino es el UID de la persona, que es la clave canónica desde la
    // migración de identidad. Se resuelve por nombre o aceptando el uid directo;
    // solo si no hay cuenta que coincida se cae al slug del nombre.
    const porNombre=Object.entries(users).filter(([,u])=>_gdKey((u||{}).asesor||'')===_gdKey(nombreNuevo));
    let kNuevo;
    if(users[nombreNuevo]) kNuevo=nombreNuevo;                    // pasaron el uid
    else if(porNombre.length===1) kNuevo=porNombre[0][0];         // resuelto por nombre
    else if(porNombre.length>1){
      console.error('Hay '+porNombre.length+' cuentas llamadas "'+nombreNuevo+'". Pasá el uid en vez del nombre:');
      console.table(porNombre.map(([uid,u])=>({uid,email:u.email||'',asesor:u.asesor||''})));
      return;
    } else kNuevo=_gdKey(nombreNuevo);
    if(kViejo===kNuevo){ console.log('Origen y destino son la misma carpeta ("'+kViejo+'"): no hay nada que mover.'); return; }
    console.log('  destino: '+kNuevo+((users[kNuevo]||{}).asesor?' ('+users[kNuevo].asesor+')':''));
    const tiendas=Object.entries(empresas).filter(([,e])=>_gdKey((e||{}).nombre||'')===kTienda);
    if(!tiendas.length){ console.error('No hay ninguna tienda que se llame así.'); return; }
    if(tiendas.length>1) console.warn('⚠ '+tiendas.length+' tiendas comparten ese nombre: se procesan todas.');
    const mover=[], conflictos=[];
    tiendas.forEach(([tid,emp])=>{
      Object.entries(gd[tid]||{}).forEach(([mes,asesores])=>{
        const origen=(asesores||{})[kViejo]; if(!origen) return;
        const destino=(asesores||{})[kNuevo]||{};
        Object.entries(origen.dias||{}).forEach(([dia,d])=>{
          if((destino.dias||{})[dia]) conflictos.push({tienda:emp.nombre,mes,dia:+dia});
          else mover.push({tienda:emp.nombre,mes,dia:+dia,_path:'gestiones_diarias/'+tid+'/'+mes+'/'+kNuevo+'/dias/'+dia,_val:d});
        });
        if(!destino._nombre) mover.push({tienda:emp.nombre,mes,dia:'—',_path:'gestiones_diarias/'+tid+'/'+mes+'/'+kNuevo+'/_nombre',_val:nombreNuevo});
      });
    });
    if(conflictos.length){
      console.group('%c⚠ Días que ya existen en la clave nueva ('+conflictos.length+') — no se tocan','color:#b45309;font-weight:bold');
      console.table(conflictos);
      console.log('Revisá esos días a mano: sumarlos duplicaría las gestiones.');
      console.groupEnd();
    }
    if(!mover.length){ console.log('%cNada que mover.','color:#15803d;font-weight:bold'); return; }
    console.group('%cDías a mover ('+mover.filter(m=>m.dia!=='—').length+')','color:#0e7490;font-weight:bold');
    console.table(mover.filter(m=>m.dia!=='—').map(({tienda,mes,dia})=>({tienda,mes,dia})));
    console.groupEnd();
    if(!aplicar){ console.log('%cSimulación: no se escribió nada. Para aplicar: _migrarAsesor("'+nombreTienda+'","'+nombreViejo+'","'+nombreNuevo+'",{aplicar:true})','font-weight:bold'); return; }
    const updates={}; mover.forEach(m=>{ updates[m._path]=m._val; });
    _db.ref().update(updates)
      .then(()=>console.log('%c[MIGRAR asesor] listo: '+mover.length+' nodos copiados. La clave vieja queda intacta por si hay que revisar.','font-weight:bold;color:#15803d'))
      .catch(e=>console.error('  ✗',e));
  }).catch(e=>console.error('[MIGRAR asesor] falló (¿sesión de admin?):',e));
};

// Saca las imágenes de evidencia de dentro de las novedades y las lleva a
// nov_img/. Guardadas en base64 dentro del registro, leer novedades/{tienda}
// arrastraba todas las fotos: 16 MB contra 0,26 MB de datos reales, y sumando
// ~65 KB por cada foto nueva. Después de migrar, la novedad queda con {img:true}
// y el binario se pide solo al abrirlo.
//
// Va de a una imagen por vez a propósito: son varios MB y un update masivo
// puede fallar entero. Si se corta, lo ya migrado queda hecho y se puede volver
// a correr — es idempotente.
//
// Ejecutar desde la consola como admin:
//   _migrarImagenesNovedades()                 → simulación, no escribe nada
//   _migrarImagenesNovedades({aplicar:true})   → aplica
window._migrarImagenesNovedades = function(opts){
  const aplicar=!!(opts||{}).aplicar;
  console.log('%c[IMÁGENES] leyendo...'+(aplicar?'':' (simulación — no escribe)'),'font-weight:bold');
  Promise.all([_db.ref('novedades').once('value'), _db.ref('empresas').once('value')]).then(([sn,se])=>{
    const nov=sn.val()||{}, emp=se.val()||{};
    const pend=[]; let bytes=0;
    Object.entries(nov).forEach(([tk,meses])=>Object.entries(meses||{}).forEach(([mes,regs])=>
      Object.entries(regs||{}).forEach(([novId,n])=>{
        Object.entries((n||{}).soluciones||{}).forEach(([solKey,s])=>{
          if(!s||s.tipo!=='img'||!s.val||!String(s.val).startsWith('data:')) return;
          bytes+=s.val.length;
          pend.push({tienda:(emp[tk]||{}).nombre||tk, mes, novId, solKey, guia:(n||{}).guia||'',
                     kb:Math.round(s.val.length/1024), _tk:tk, _val:s.val});
        });
      })));
    if(!pend.length){ console.log('%c✔ No quedan imágenes dentro de las novedades.','color:#15803d;font-weight:bold'); return; }
    console.group('%cImágenes a mover ('+pend.length+' · '+(bytes/1048576).toFixed(1)+' MB)','color:#0e7490;font-weight:bold');
    const porTienda={};
    pend.forEach(p=>{ porTienda[p.tienda]=(porTienda[p.tienda]||0)+1; });
    console.table(Object.entries(porTienda).map(([tienda,n])=>({tienda, imagenes:n})));
    console.groupEnd();
    if(!aplicar){ console.log('%cSimulación: no se escribió nada. Para aplicar: _migrarImagenesNovedades({aplicar:true})','font-weight:bold'); return; }
    let ok=0, fail=0;
    pend.reduce((p,x)=>p.then(async()=>{
      try{
        // Primero la imagen en su nodo nuevo; recién cuando está a salvo se
        // vacía el original. Al revés, un corte perdería la foto.
        await _db.ref(_novImgPath(x._tk, x.mes, x.novId, x.solKey)).set(x._val);
        await _db.ref('novedades/'+x._tk+'/'+x.mes+'/'+x.novId+'/soluciones/'+x.solKey)
          .update({val:'', img:true});
        ok++;
        if(ok%25===0) console.log('  '+ok+'/'+pend.length+'...');
      }catch(e){ fail++; console.error('  ✗ '+x.guia+' ('+x.mes+')', e.message); }
    }), Promise.resolve()).then(()=>{
      console.log('%c[IMÁGENES] listo: '+ok+' movidas, '+fail+' con error.','font-weight:bold;color:'+(fail?'#b91c1c':'#15803d'));
      if(!fail) console.log('Las novedades quedan livianas. Volvé a correrlo si en el futuro entran fotos por una versión vieja de la extensión.');
    });
  }).catch(e=>console.error('[IMÁGENES] falló (¿sesión de admin?):',e));
};

// Borra las membresías de cuentas que ya no existen en users/. Son asesores
// fantasma: aparecen en el panel y en los filtros, pero no hay nadie detrás.
// Solo borra si además NO tienen datos en ninguna raíz — si los tuvieran, es
// una cuenta que trabajó y se eliminó, y sus registros hay que reasignarlos
// antes, no dejarlos huérfanos.
// Ejecutar desde la consola como admin:
//   _limpiarMembresiasSinCuenta()                 → simulación
//   _limpiarMembresiasSinCuenta({aplicar:true})   → aplica
window._limpiarMembresiasSinCuenta = function(opts){
  const aplicar=!!(opts||{}).aplicar;
  const RAICES=['gestiones_diarias','novedades','ro','anticipos','gestiones_sync','historial_diario','user_fotos'];
  console.log('%c[MEMBRESÍAS FANTASMA] leyendo...'+(aplicar?'':' (simulación — no escribe)'),'font-weight:bold');
  Promise.all([
    _db.ref('users').once('value'), _db.ref('empresas').once('value'),
    _db.ref('empresa_asesores').once('value'), _db.ref('user_tiendas').once('value'),
    ...RAICES.map(r=>_db.ref(r).once('value'))
  ]).then(snaps=>{
    const users=snaps[0].val()||{}, empresas=snaps[1].val()||{}, ea=snaps[2].val()||{}, ut=snaps[3].val()||{};
    const datos=RAICES.map((r,i)=>({raiz:r, val:snaps[4+i].val()||{}}));
    const ids=new Set();
    Object.values(ea).forEach(m=>Object.keys(m||{}).forEach(u=>{ if(!users[u]) ids.add(u); }));
    Object.keys(ut).forEach(u=>{ if(!users[u]) ids.add(u); });
    if(!ids.size){ console.log('%c✔ No hay membresías sin cuenta.','color:#15803d;font-weight:bold'); return; }
    const borrar=[], conDatos=[];
    ids.forEach(uid=>{
      // ¿tiene datos en algún lado, como clave de tienda o de asesor?
      const donde=[];
      datos.forEach(({raiz,val})=>{
        if(val[uid]) donde.push(raiz+' (como tienda)');
        Object.entries(val).forEach(([tid,ms])=>{
          if(!ms||typeof ms!=='object') return;
          Object.entries(ms).forEach(([mes,ases])=>{ if(ases&&typeof ases==='object'&&ases[uid]) donde.push(raiz+'/'+tid+'/'+mes); });
        });
      });
      const tiendas=[...new Set([
        ...Object.entries(ea).filter(([,m])=>(m||{})[uid]).map(([e])=>e),
        ...Object.keys(ut[uid]||{})
      ])];
      const fila={ uid, tiendas:tiendas.map(e=>(empresas[e]||{}).nombre||e).join(', ') };
      if(donde.length){ conDatos.push({...fila, datosEn:donde.slice(0,4).join(' · ')}); return; }
      borrar.push({...fila, _paths:[...tiendas.map(e=>'empresa_asesores/'+e+'/'+uid), 'user_tiendas/'+uid]});
    });
    if(conDatos.length){
      console.group('%c⚠ Tienen datos — NO se borran ('+conDatos.length+')','color:#b45309;font-weight:bold');
      console.table(conDatos); console.log('Reasigná esos registros antes de eliminar la membresía.'); console.groupEnd();
    }
    if(!borrar.length){ console.log('%cNada que borrar.','color:#15803d;font-weight:bold'); return; }
    console.group('%cMembresías fantasma a borrar ('+borrar.length+')','color:#0e7490;font-weight:bold');
    console.table(borrar.map(({uid,tiendas})=>({uid,tiendas}))); console.groupEnd();
    if(!aplicar){ console.log('%cSimulación: no se escribió nada. Para aplicar: _limpiarMembresiasSinCuenta({aplicar:true})','font-weight:bold'); return; }
    const updates={}; borrar.forEach(b=>b._paths.forEach(p=>{ updates[p]=null; }));
    _db.ref().update(updates)
      .then(()=>console.log('%c[MEMBRESÍAS FANTASMA] listo: '+borrar.length+' eliminadas.','font-weight:bold;color:#15803d'))
      .catch(e=>console.error('  ✗',e));
  }).catch(e=>console.error('[MEMBRESÍAS FANTASMA] falló (¿sesión de admin?):',e));
};

// Nodos que cuelgan del MES en gestiones_diarias pero no son la carpeta de una
// persona: el consolidado y las notas son de la tienda entera. Confundirlos con
// asesores mete "consolidado" en cualquier lista de gente.
const _GD_NO_ASESOR = new Set(['notasHist','cod','config','consolidado','dias','_nombre']);

// Pasa las Gestiones Diarias de la clave por nombre a la clave por uid.
// Antes la carpeta de cada asesor era _gdKey(su nombre): renombrarlo partía su
// historial, y dos homónimos en la misma tienda compartían carpeta sin aviso.
// El uid no cambia nunca, aunque cambien nombre, correo o contraseña.
//
// La correspondencia nombre → uid se resuelve cruzando contra users/. Si dos
// cuentas comparten el mismo nombre, la carpeta es ambigua (sus datos ya venían
// mezclados) y NO se migra: se reporta para resolverla a mano.
//
// Nunca pisa un día que ya exista en el destino, y no borra el origen.
//
// Ejecutar desde la consola como admin:
//   _migrarAsesoresAUid()                 → simulación, no escribe nada
//   _migrarAsesoresAUid({aplicar:true})   → aplica
window._migrarAsesoresAUid = function(opts){
  const aplicar=!!(opts||{}).aplicar;
  console.log('%c[MIGRAR a uid] leyendo...'+(aplicar?'':' (simulación — no escribe)'),'font-weight:bold');
  Promise.all([
    _db.ref('users').once('value'),
    _db.ref('empresas').once('value'),
    _db.ref('gestiones_diarias').once('value')
  ]).then(([su,se,sg])=>{
    const users=su.val()||{}, empresas=se.val()||{}, gd=sg.val()||{};
    // slug del nombre → uids que lo producen
    const porSlug={};
    Object.entries(users).forEach(([uid,u])=>{
      const k=_gdKey((u||{}).asesor||'');
      if(!k||k==='_') return;
      (porSlug[k]=porSlug[k]||[]).push(uid);
    });
    // Los nodos que no son de una persona (ver _GD_NO_ASESOR) se saltan:
    // tratarlos como carpetas de asesor los mandaría a "sin dueño".
    const NO_ASESOR = _GD_NO_ASESOR;
    const mover=[], ambiguos=[], sinDuenio=[], conflictos=[];
    Object.entries(gd).forEach(([tid,meses])=>{
      // Las raíces que no son un empresaId son las rutas legacy por nombre de
      // tienda, que quedaron como respaldo de la migración anterior. Copiar ahí
      // sería crear registros nuevos dentro de una copia de seguridad.
      if(!empresas[tid]) return;
      const tNombre=(empresas[tid]||{}).nombre||tid;
      Object.entries(meses||{}).forEach(([mes,asesores])=>{
        Object.entries(asesores||{}).forEach(([clave,nodo])=>{
          if(NO_ASESOR.has(clave)) return;               // no es una persona
          if(users[clave]) return;                       // ya es un uid: nada que hacer
          const cands=porSlug[clave]||[];
          const dias=Object.keys((nodo||{}).dias||{}).length;
          if(!cands.length){ sinDuenio.push({tienda:tNombre,mes,carpeta:clave,dias,nombreGuardado:(nodo||{})._nombre||''}); return; }
          if(cands.length>1){ ambiguos.push({tienda:tNombre,mes,carpeta:clave,dias,
            cuentas:cands.map(x=>(users[x]||{}).email||x).join(' · ')}); return; }
          const uid=cands[0];
          const destino=(asesores||{})[uid]||{};
          Object.entries((nodo||{}).dias||{}).forEach(([dia,d])=>{
            if((destino.dias||{})[dia]) conflictos.push({tienda:tNombre,mes,dia:+dia,carpeta:clave});
            else mover.push({tienda:tNombre,mes,dia:+dia,de:clave,a:uid,
              asesor:(users[uid]||{}).asesor||uid,
              _path:'gestiones_diarias/'+tid+'/'+mes+'/'+uid+'/dias/'+dia,_val:d});
          });
          if(!destino._nombre) mover.push({tienda:tNombre,mes,dia:'—',de:clave,a:uid,
            asesor:(users[uid]||{}).asesor||uid,
            _path:'gestiones_diarias/'+tid+'/'+mes+'/'+uid+'/_nombre',_val:(users[uid]||{}).asesor||''});
        });
      });
    });
    if(ambiguos.length){
      console.group('%c⚠ Carpetas de nombre compartido por varias cuentas ('+ambiguos.length+') — NO se migran','color:#b91c1c;font-weight:bold');
      console.table(ambiguos);
      console.log('Sus gestiones ya venían mezcladas entre esas personas. Hay que repartirlas a mano antes de migrar.');
      console.groupEnd();
    }
    if(sinDuenio.length){
      console.group('%c⚠ Carpetas sin cuenta que las reclame ('+sinDuenio.length+')','color:#b45309;font-weight:bold');
      console.table(sinDuenio);
      console.log('El asesor fue renombrado o eliminado. Si sabés de quién son, usá _migrarAsesor().');
      console.groupEnd();
    }
    if(conflictos.length){
      console.group('%c⚠ Días que ya existen bajo el uid ('+conflictos.length+') — no se tocan','color:#b45309;font-weight:bold');
      console.table(conflictos); console.groupEnd();
    }
    if(!mover.length){ console.log('%cNada que migrar.','color:#15803d;font-weight:bold'); return; }
    console.group('%cDías a migrar ('+mover.filter(m=>m.dia!=='—').length+')','color:#0e7490;font-weight:bold');
    console.table(mover.filter(m=>m.dia!=='—').map(({tienda,mes,dia,asesor,de})=>({tienda,mes,dia,asesor,carpetaVieja:de})));
    console.groupEnd();
    if(!aplicar){ console.log('%cSimulación: no se escribió nada. Para aplicar: _migrarAsesoresAUid({aplicar:true})','font-weight:bold'); return; }
    const updates={}; mover.forEach(m=>{ updates[m._path]=m._val; });
    _db.ref().update(updates)
      .then(()=>console.log('%c[MIGRAR a uid] listo: '+mover.length+' nodos copiados. Las carpetas viejas quedan intactas.','font-weight:bold;color:#15803d'))
      .catch(e=>console.error('  ✗',e));
  }).catch(e=>console.error('[MIGRAR a uid] falló (¿sesión de admin?):',e));
};

// ===== PERFIL DEL USUARIO =====
// Cada quien edita su nombre, su contraseña y su foto. El correo NO: es la
// credencial de acceso y un error de tipeo dejaría a la persona afuera, así que
// lo cambia el admin desde el panel, que puede corregirlo.
//
// La foto vive en user_fotos/{uid} y no dentro de users/: el Centro de
// Operaciones lee users completo en cada carga, y con 35 imágenes adentro se
// arrastraría todas en cada refresco.
const FOTOS_PATH='user_fotos';
let _fotosCache={}, _fotosCargadas=false;

// Reduce la imagen antes de guardarla. Sin esto, una foto de celular de 4 MB se
// guarda tal cual en la base y la lee todo el que abra el panel.
function _perfilResizeImg(file, max, quality){
  return new Promise((resolve,reject)=>{
    const rd=new FileReader();
    rd.onerror=()=>reject(new Error('No se pudo leer el archivo'));
    rd.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('El archivo no es una imagen válida'));
      img.onload=()=>{
        const lado=Math.min(img.width,img.height);          // recorte cuadrado centrado
        const sx=(img.width-lado)/2, sy=(img.height-lado)/2;
        const c=document.createElement('canvas');
        c.width=c.height=Math.min(max,lado);
        c.getContext('2d').drawImage(img,sx,sy,lado,lado,0,0,c.width,c.height);
        resolve(c.toDataURL('image/jpeg',quality));
      };
      img.src=rd.result;
    };
    rd.readAsDataURL(file);
  });
}

// Carga las fotos una sola vez por sesión; el avatar cae a las iniciales si no hay.
window._cargarFotos=function(){
  if(_fotosCargadas||typeof _db==='undefined') return Promise.resolve(_fotosCache);
  _fotosCargadas=true;
  return _db.ref(FOTOS_PATH).once('value')
    .then(s=>{ _fotosCache=s.val()||{}; return _fotosCache; })
    .catch(()=>_fotosCache);
};
window._fotoDe=function(uid){ return (_fotosCache||{})[uid]||null; };
// Avatar reutilizable: foto si hay, iniciales si no.
window._avatarHTML=function(uid,nombre,tam,clase){
  const f=window._fotoDe(uid), px=tam||38;
  if(f) return '<div class="'+(clase||'')+'" style="width:'+px+'px;height:'+px+'px;border-radius:50%;background-image:url('+f+');background-size:cover;background-position:center;flex-shrink:0;"></div>';
  return '<div class="'+(clase||'')+'" style="width:'+px+'px;height:'+px+'px;border-radius:50%;background:'+_avatarColor(nombre)+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:'+Math.round(px*0.36)+'px;flex-shrink:0;">'+_avatarInitials(nombre)+'</div>';
};

let _perfilFotoNueva=null;   // '' = quitar, null = sin cambios, string = nueva
window._perfilAbrir=function(){
  const uid=localStorage.getItem('lgs_user')||window._currentUsername;
  if(!uid||typeof _db==='undefined'){ toast('No hay sesión activa'); return; }
  _perfilFotoNueva=null;
  const $=id=>document.getElementById(id);
  $('perfil-error').style.display='none';
  $('perfil-ok').style.display='none';
  $('perfil-pass-actual').value=''; $('perfil-pass-nueva').value=''; $('perfil-pass-rep').value='';
  $('perfil-modal').classList.add('open');
  _db.ref('users/'+uid).once('value').then(s=>{
    const u=s.val()||{};
    $('perfil-nombre').value=u.asesor||'';
    $('perfil-correo').value=u.email||'(sin correo)';
    $('perfil-rol').textContent=u.rol==='dueno'?'👑 Dueño de tienda':'👤 Asesor';
  });
  window._cargarFotos().then(()=>_perfilPintarFoto(window._fotoDe(uid),
    (localStorage.getItem('lgs_asesor')||'')));
};
function _perfilPintarFoto(src,nombre){
  const box=document.getElementById('perfil-foto');
  if(!box) return;
  box.innerHTML = src
    ? '<img src="'+src+'" style="width:100%;height:100%;object-fit:cover;">'
    : '<span style="font-size:1.6rem;font-weight:800;color:#fff;">'+_avatarInitials(nombre||'?')+'</span>';
  box.style.background = src ? 'transparent' : _avatarColor(nombre||'?');
  const btnQuitar=document.getElementById('perfil-foto-quitar');
  if(btnQuitar) btnQuitar.style.display = src ? 'inline-block' : 'none';
}
window._perfilElegirFoto=async function(input){
  const f=input.files&&input.files[0]; if(!f) return;
  const err=document.getElementById('perfil-error');
  try{
    if(!/^image\//.test(f.type)) throw new Error('Elegí un archivo de imagen');
    _perfilFotoNueva=await _perfilResizeImg(f,256,.8);
    _perfilPintarFoto(_perfilFotoNueva, localStorage.getItem('lgs_asesor')||'');
    err.style.display='none';
  }catch(e){ err.textContent=e.message; err.style.display='block'; }
  input.value='';
};
window._perfilQuitarFoto=function(){
  _perfilFotoNueva='';
  _perfilPintarFoto(null, localStorage.getItem('lgs_asesor')||'');
};
window._perfilCerrar=function(){ document.getElementById('perfil-modal').classList.remove('open'); };

window._perfilGuardar=async function(btn){
  const uid=localStorage.getItem('lgs_user')||window._currentUsername;
  const $=id=>document.getElementById(id);
  const err=$('perfil-error'), ok=$('perfil-ok');
  err.style.display='none'; ok.style.display='none';
  const nombre=$('perfil-nombre').value.trim();
  if(!nombre){ err.textContent='El nombre no puede quedar vacío'; err.style.display='block'; return; }
  if(btn){ btn.disabled=true; btn.textContent='Guardando...'; }
  try{
    const updates={};
    updates['users/'+uid+'/asesor']=nombre;
    // presence también, para que el panel lo vea sin esperar a la próxima carga
    updates['presence/'+uid+'/asesor']=nombre;
    if(_perfilFotoNueva!==null) updates[FOTOS_PATH+'/'+uid]=_perfilFotoNueva||null;
    await _db.ref().update(updates);
    // La sesión local tiene que quedar en sintonía: getLoginAsesor() alimenta
    // el saludo y el nombre que se guarda en las gestiones nuevas.
    localStorage.setItem('lgs_asesor',nombre);
    if(_perfilFotoNueva!==null){
      if(_perfilFotoNueva) _fotosCache[uid]=_perfilFotoNueva; else delete _fotosCache[uid];
      _perfilFotoNueva=null;
    }
    ok.textContent='✅ Perfil actualizado'; ok.style.display='block';
    const g=document.getElementById('mss-greeting');
    if(g) g.textContent='¡Hola, '+nombre.split(' ')[0]+'!';
  }catch(e){ err.textContent='No se pudo guardar: '+e.message; err.style.display='block'; }
  if(btn){ btn.disabled=false; btn.textContent='Guardar cambios'; }
};

// Firebase exige haber iniciado sesión hace poco para cambiar la contraseña, así
// que se pide la actual y se reautentica en el momento. Sin esto devuelve
// auth/requires-recent-login y el usuario no entiende por qué falla.
window._perfilCambiarPass=async function(btn){
  const $=id=>document.getElementById(id);
  const err=$('perfil-error'), ok=$('perfil-ok');
  err.style.display='none'; ok.style.display='none';
  const actual=$('perfil-pass-actual').value, nueva=$('perfil-pass-nueva').value, rep=$('perfil-pass-rep').value;
  if(!actual||!nueva){ err.textContent='Completá la contraseña actual y la nueva'; err.style.display='block'; return; }
  if(nueva.length<6){ err.textContent='La nueva contraseña necesita al menos 6 caracteres'; err.style.display='block'; return; }
  if(nueva!==rep){ err.textContent='La confirmación no coincide con la nueva contraseña'; err.style.display='block'; return; }
  const user=firebase.auth().currentUser;
  if(!user||!user.email){ err.textContent='No hay sesión activa. Volvé a entrar.'; err.style.display='block'; return; }
  if(btn){ btn.disabled=true; btn.textContent='Cambiando...'; }
  try{
    const cred=firebase.auth.EmailAuthProvider.credential(user.email,actual);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(nueva);
    $('perfil-pass-actual').value=''; $('perfil-pass-nueva').value=''; $('perfil-pass-rep').value='';
    ok.textContent='✅ Contraseña actualizada'; ok.style.display='block';
  }catch(e){
    const m=e.code==='auth/wrong-password'||e.code==='auth/invalid-credential' ? 'La contraseña actual no es correcta'
      : e.code==='auth/weak-password' ? 'La nueva contraseña es demasiado débil'
      : e.code==='auth/too-many-requests' ? 'Demasiados intentos. Esperá unos minutos.'
      : 'No se pudo cambiar: '+e.message;
    err.textContent=m; err.style.display='block';
  }
  if(btn){ btn.disabled=false; btn.textContent='Cambiar contraseña'; }
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

// Clave para ESCRIBIR en gestiones_sync. Solo el empresaId sirve: si se cae al
// username, el trabajo del día entero queda bajo la identidad de la persona en
// vez de la tienda, el equipo no ve esas notas en el kanban y el admin no las
// cuenta al filtrar. Así se perdieron de vista ~1550 pedidos de Paquetin, que
// hubo que rescatar a mano con _moverGestionesSync. Antes esto solo avisaba por
// consola —donde nadie mira— y escribía igual.
let _gsAvisado=false;
function _gsKeyEscritura(){
  if(window._currentTiendaId) return window._currentTiendaId;
  if(!_gsAvisado){
    _gsAvisado=true;
    const msg='⚠️ No se pudo identificar la tienda: tu gestión no se está guardando. Recargá la página antes de seguir.';
    // toast() no pinta nada si su nodo no está en la página, y este aviso no se
    // puede perder: es la diferencia entre frenar y trabajar toda la tarde en
    // un nodo que nadie va a leer.
    if(typeof toast==='function' && document.getElementById('toast')) toast(msg, 9000);
    else alert(msg);
    console.error('[SYNC] Sin empresaId resuelto: se bloqueó la escritura en gestiones_sync.');
  }
  return null;
}

// ── Tiendas del usuario (para "🏪 Cambiar tienda" del selector de módulo) ──
// Se persiste porque window._currentTiendaIds solo se poblaba en el login
// fresco: al restaurar sesión —recargar la página, o volver al menú desde un
// módulo, que es un irAPagina('/') y por lo tanto una carga nueva— quedaba
// undefined y el botón desaparecía para el resto de la sesión. Con la lista en
// localStorage el selector puede pintarse bien de entrada, sin esperar a
// Firebase; la relectura posterior la corrige si cambió.
// ── Presencia: criterio único de "está en línea" ─────────────────────────
// `lastSeen` se escribe con la hora del SERVIDOR y se compara contra la hora del
// servidor, no contra el reloj local. Antes se guardaba Date.now() del asesor y
// se comparaba contra Date.now() del admin: con un reloj desfasado más de 2
// minutos —cosa común en equipos sin sincronizar— el asesor no aparecía nunca
// en línea, o aparecía siempre. Firebase publica el desfase en
// .info/serverTimeOffset, así que ambos extremos quedan en la misma referencia.
const PRESENCIA_VENTANA_MS = 120000;   // 2 min = 4 heartbeats perdidos
window._serverTimeOffset = 0;
function _iniciarOffsetServidor(){
  if(typeof _db==='undefined'||window._offsetListo) return;
  window._offsetListo = true;
  _db.ref('.info/serverTimeOffset').on('value', s=>{ window._serverTimeOffset = s.val()||0; });
}
function _ahoraServidor(){ return Date.now() + (window._serverTimeOffset||0); }
// Criterio único, antes repetido con la misma fórmula en ~10 lugares.
function _estaOnline(p){
  if(!p||!p.online) return false;
  return (_ahoraServidor() - (p.lastSeen||0)) < PRESENCIA_VENTANA_MS;
}

const TIENDAS_KEY = 'lgs_tiendas';
// Mismo problema con "← Volver al Panel Admin": window._cameFromAdmin vivía solo
// en memoria, así que un admin que entraba a una tienda, abría un módulo y
// volvía al menú perdía el botón en la recarga y se quedaba sin camino de vuelta
// al Panel Admin salvo cerrando sesión.
const FROM_ADMIN_KEY = 'lgs_from_admin';
function _setCameFromAdmin(v){
  window._cameFromAdmin = !!v;
  try{ v ? localStorage.setItem(FROM_ADMIN_KEY,'1') : localStorage.removeItem(FROM_ADMIN_KEY); }catch(e){}
}
function _getCameFromAdmin(){
  if(window._cameFromAdmin) return true;
  try{ if(localStorage.getItem(FROM_ADMIN_KEY)==='1'){ window._cameFromAdmin = true; return true; } }catch(e){}
  return false;
}
function _setTiendaIds(ids){
  const arr = Array.isArray(ids) ? ids.filter(Boolean) : [];
  window._currentTiendaIds = arr;
  try{ localStorage.setItem(TIENDAS_KEY, JSON.stringify(arr)); }catch(e){}
  return arr;
}
function _getTiendaIds(){
  if(Array.isArray(window._currentTiendaIds) && window._currentTiendaIds.length) return window._currentTiendaIds;
  try{
    const arr = JSON.parse(localStorage.getItem(TIENDAS_KEY) || '[]');
    if(Array.isArray(arr)){ window._currentTiendaIds = arr; return arr; }
  }catch(e){}
  return [];
}

// ===== LOGIN =====
function _initLogin(){
  const LOGIN_KEY = 'lgs_auth';
  const TIENDA_KEY = 'lgs_tienda';
  const ASESOR_KEY = 'lgs_asesor';
  // Nombre anterior tras un renombre: sin él no se puede encontrar el historial
  // guardado bajo la carpeta vieja (ver _gdAKPrevio).
  const ASESOR_PREV_KEY = 'lgs_asesor_prev';
  const USER_KEY = 'lgs_user';
  // Acá vivían ADMIN_USER/ADMIN_PASS ('admin'/'admin') y FALLBACK_USER/
  // FALLBACK_PASS ('3D Company'/'3dcompany'). Se borraron el 2026-08-17: este
  // archivo lo descarga cualquiera que abra el sitio, así que eran credenciales
  // públicas — con 'admin'/'admin' se entraba como SUPER ADMIN. El acceso de
  // super admin ahora es solo por cuenta de Google contra config/superAdminUid
  // (ver _leerRoles). Las dos FALLBACK ya no se usaban en ninguna parte: eran
  // residuo del Facilitador viejo. No volver a poner credenciales acá.

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
    _admRutaLimpiar();
  }
  function _loginHide(){ document.getElementById('login-screen').classList.add('hidden'); document.getElementById('login-screen').classList.remove('visible'); }
  function _showAdmin(){
    _hideSplash(); document.getElementById('admin-panel').classList.add('visible'); _loginHide();
    // En diferido a propósito. Los tres sitios que abren el panel hacen
    // "_showAdmin(); _admCargarDashboard();", y si la URL pide una sección que no
    // es En Vivo, su carga (_cargarEquipoGlobal y compañía) tiene que salir
    // DESPUÉS del dashboard, igual que cuando se llega ahí haciendo clic. Con la
    // llamada directa se adelantaría a él.
    setTimeout(_admRutaAplicar, 0);
  }
  function _showSuperAdmin(){ _hideSplash(); document.getElementById('super-admin-panel').style.display='block'; _loginHide(); }

  // ── Presencia en Firebase ──
  function _registrarPresencia(username, tienda, asesor){
    _currentUsername = username;
    window._currentUsername = username;
    _cachedLoginTime = Date.now(); // cachear loginTime localmente para evitar lectura Firebase por acción
    const ref = _db.ref('presence/' + username);
    _iniciarOffsetServidor();
    const AHORA = firebase.database.ServerValue.TIMESTAMP;
    // lastSeen SIEMPRE con hora del servidor: con Date.now() del cliente, un
    // reloj desfasado más de 2 minutos dejaba al asesor permanentemente fuera
    // de "en línea" en el panel (o permanentemente dentro).
    ref.set({ online: true, lastSeen: AHORA, loginTime: _cachedLoginTime, tienda: tienda||'', asesor: asesor||'', sessionGestiones: 0, force_logout: false });
    ref.onDisconnect().update({ online: false, lastSeen: AHORA });
    if(_heartbeatInterval){clearInterval(_heartbeatInterval);_heartbeatInterval=null;}
    const _latir = ()=>{ if(_currentUsername===username) ref.update({ lastSeen: firebase.database.ServerValue.TIMESTAMP, online: true }); };
    _heartbeatInterval = setInterval(_latir, 30000);
    // Chrome frena los setInterval de las pestañas en segundo plano, así que al
    // volver a primer plano se late de inmediato en vez de esperar hasta 30s —
    // si no, un asesor que vuelve a la pestaña puede verse offline un rato.
    if(!window._presVisListo){
      window._presVisListo = true;
      document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) _latir(); });
    }
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
        [LOGIN_KEY,TIENDA_KEY,ASESOR_KEY,USER_KEY,TIENDAS_KEY,FROM_ADMIN_KEY].forEach(k=>localStorage.removeItem(k));
        window._currentTiendaIds=null; window._cameFromAdmin=false;
        _limpiarAuditoria();
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

  // auditoria=true entra en solo lectura y sin presencia: es el camino de
  // "🛡️ Auditar tienda" del Panel Admin (ver _admEntrarTienda).
  function _entrarApp(username, tienda, asesor, empresaId, auditoria){
    localStorage.setItem(LOGIN_KEY, auditoria ? 'audit' : '1');
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
    if(auditoria) _entrarSinPresencia(username);
    else _registrarPresencia(username, tienda, asesor);
    window._gdMostrarModeSelect(asesor);
  }

  // Sesión de auditoría: nada de presence/ ni session_hist —el auditor no
  // aparece en "En vivo" ni suma como asesor de la tienda—, pero sí se publica
  // window._currentUsername, porque media app lo usa como "¿hay sesión viva?"
  // antes de LEER (_fbCargarHistorialPropio, el historial por guía del kanban):
  // sin él, el auditor entraría a un módulo en blanco.
  function _entrarSinPresencia(username){
    window._currentUsername = username;
    _cachedLoginTime = Date.now();
    _iniciarOffsetServidor();
    if(window._forceLogoutRef){ window._forceLogoutRef.off('value'); window._forceLogoutRef=null; }
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
    // Alguien está entrando con su propia sesión: sea quien sea, ya no es la
    // auditoría de antes. Va acá arriba porque lgs_auth todavía puede decir
    // 'audit' (un admin que cerró la pestaña sin salir) y las escrituras de este
    // login —_auditLogin, presencia— quedarían bloqueadas sin explicación.
    _limpiarAuditoria();
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
      // El acceso ya quedó registrado al validar la contraseña (ver _loginCheck).
      // Registrarlo otra vez acá era el 46% de los duplicados de login_audit.
      localStorage.setItem(LOGIN_KEY,'admin');
      localStorage.setItem('lgs_admin_id', uid);
      localStorage.setItem('lgs_admin_user', email);
      _showAdmin(); _admCargarDashboard();
    } else {
      const d = userData||{};
      // Igual que arriba: el registro ya se hizo al validar la contraseña.
      window._currentRol = d.rol||'dueno';
      const nombreAsesor = d.asesor||email;
      const _resolverTiendas = snapT=>{
        const tiendaIds = _setTiendaIds(Object.keys(snapT.val()||{}));
        console.log('[LOGIN] tiendas:', tiendaIds, '| asesor:', d.asesor, '| tienda:', d.tienda);
        if(!tiendaIds.length){
          // Si el perfil ya tiene nombre y tienda (cuenta creada por admin), entrar directo
          if(d.asesor && d.tienda){
            _entrarApp(uid, d.tienda, d.asesor, null);
          } else {
            // Sin toast: _pedirPerfil() ya muestra una pantalla que se explica sola.
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

  // Deja la pantalla y el estado limpios antes de mostrar el selector de perfil.
  // Antes solo se ocultaban los paneles de admin/super-admin: el mode-select y
  // los paneles de módulo quedaban con display puesto por detrás (no se veía
  // porque el selector va en z-index 9999) y reaparecían al salir del panel
  // siguiente.
  function _prepararSelectorRol(){
    const sp=document.getElementById('super-admin-panel'); if(sp) sp.style.display='none';
    const ap=document.getElementById('admin-panel'); if(ap) ap.classList.remove('visible');
    const ms=document.getElementById('mode-select-screen'); if(ms) ms.style.display='none';
    const ts=document.getElementById('tienda-select-screen'); if(ts) ts.style.display='none';
    if(typeof _ocultarTodosModos==='function') _ocultarTodosModos();
    // Elegir perfil abandona el contexto del anterior. Sin esto, un admin que
    // entró a una tienda y después cambia a "dueño" se llevaba el flag puesto y
    // el selector de módulo le seguía ofreciendo "← Volver al Panel Admin".
    _setCameFromAdmin(false);
  }

  // Lee los roles reales de la cuenta. Es la fuente de verdad cuando no hay
  // caché en memoria — que es lo normal tras cualquier navegación entre páginas.
  function _leerRoles(uid){
    return Promise.all([
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
      return { roles, admData:snapAdm.val(), userData:snapUser.val(), tiendas:snapTiendas.val() };
    });
  }

  window._volverSelectorRol = function(){
    const p = window._rolPendiente;
    if(p && p.roles && p.roles.length > 1){
      _prepararSelectorRol();
      _marcarEnSelectorRol();
      _mostrarSelectorRol(p.uid, p.email, p.roles, p.admData, p.userData);
      return;
    }
    // Si no hay caché (sesión restaurada directo), re-consultar Firebase
    const user = firebase.auth().currentUser;
    if(!user) return;
    const uid = user.uid; const email = user.email;
    _leerRoles(uid).then(({roles, admData, userData})=>{
      if(roles.length<=1){ toast('Solo tienes un perfil disponible'); return; }
      _prepararSelectorRol();
      _marcarEnSelectorRol();
      _mostrarSelectorRol(uid, email, roles, admData, userData);
    });
  };

  // Estar en el selector de perfil es un estado propio de la sesión, no "sin
  // sesión". Antes se borraba LOGIN_KEY acá: si el usuario recargaba, cerraba la
  // pestaña o el navegador mientras elegía perfil, la app lo mandaba al login a
  // escribir usuario y contraseña de nuevo, aunque su sesión de Firebase Auth
  // siguiera perfectamente viva. Con este valor, onAuthStateChanged lo devuelve
  // al selector — cambiar de perfil nunca obliga a volver a autenticarse.
  function _marcarEnSelectorRol(){ localStorage.setItem(LOGIN_KEY,'rolselect'); }

  window._cerrarSesionRol = function(){
    document.getElementById('rol-select-screen').style.display='none';
    localStorage.removeItem(LOGIN_KEY);
    firebase.auth().signOut().then(()=>{ _loginShow(); document.getElementById('login-user').focus(); });
  };

  window._loginCheck = function(){
    // Segundo chequeo: la pestaña pudo quedar abierta en el login mucho rato y
    // haberse publicado algo en el medio. Si hay versión nueva, recarga acá,
    // antes de entrar.
    _chequearVersion();
    const email = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');
    err.classList.remove('show');
    document.getElementById('login-error-campos').classList.remove('show');
    if(!email||!p){ document.getElementById('login-error-campos').classList.add('show'); setTimeout(()=>document.getElementById('login-error-campos').classList.remove('show'),3000); return; }

    // Acá estaba el "acceso de emergencia": si el usuario escribía 'admin' y la
    // contraseña 'admin', entraba como SUPER ADMIN. Se eliminó el 2026-08-17.
    // No era una puerta oculta: las dos constantes estaban en este mismo archivo,
    // que se descarga con solo abrir el sitio. Además entraba con
    // signInAnonymously(), así que la sesión más privilegiada del sistema quedaba
    // atada a un uid anónimo distinto en cada visita — sin relación con ninguna
    // cuenta real. El super admin ahora entra por Google como todo el mundo, y el
    // rol se resuelve en _leerRoles() contra config/superAdminUid.

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
              // El detalle técnico va a la consola; al usuario se le dice qué
              // hacer. Sin ningún aviso se quedaría mirando el login colgado
              // sin saber que algo falló.
              console.error('Error al entrar con rol:', ex);
              toast('No se pudo abrir tu sesión. Recargá la página; si sigue igual, avisá al administrador.', 8000);
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
  // ── CIERRE DE SESIÓN POR INACTIVIDAD ─────────────────────────────────
  // Hasta ahora la sesión no caducaba nunca: quedaba abierta hasta que alguien
  // tocaba "Salir". Con la pestaña abierta el latido la marcaba como conectada
  // aunque nadie la estuviera usando, y había cuentas figurando en línea dos días
  // seguidos.
  //
  // Ahora, tras 2 horas sin ninguna interacción real, se cierra sola. Un minuto
  // antes aparece un aviso con un botón para seguir trabajando, así a nadie se le
  // corta la sesión sin verlo venir.
  //
  // Cuenta solo la interacción de la persona (mouse, teclado, toque, scroll), no
  // el latido ni los refrescos automáticos: si contaran, el temporizador no
  // llegaría nunca a cero, que es justamente lo que pasaba.
  //
  // LA MARCA VIVE EN localStorage, NO EN MEMORIA, y esa es la parte importante.
  // La app son cuatro páginas distintas y la gente trabaja con varias pestañas
  // abiertas. Con la marca en memoria, cada pestaña contaba SU propio tiempo
  // quieto: la que quedaba de fondo llegaba a las 2 horas y cerraba la sesión
  // —borrando LOGIN_KEY, que es compartido— mientras la persona estaba
  // trabajando en otra. Desde afuera parecía que se cerraba sola sin motivo.
  // En localStorage la marca es una sola para todas las pestañas y todas las
  // páginas: cualquier actividad, en cualquier lado, cuenta para todas.
  const _INAC_LIMITE = 2*60*60*1000;   // 2 horas sin tocar nada
  const _INAC_AVISO  = 60*1000;        // el aviso sale 1 minuto antes
  const _INAC_KEY    = 'lgs_ult_actividad';
  const _INAC_GRABA  = 10*1000;        // cada cuánto se refresca la marca, como mucho
  let _inacUltima = Date.now();        // respaldo si localStorage no está disponible
  let _inacGrabada = 0;
  let _inacTick = null;
  let _inacAvisoEl = null;

  function _inacHaySesion(){
    try{ return !!localStorage.getItem(LOGIN_KEY); }catch(e){ return false; }
  }

  function _inacLeer(){
    try{ return parseInt(localStorage.getItem(_INAC_KEY),10) || 0; }catch(e){ return 0; }
  }
  function _inacGrabar(t){
    _inacUltima = t; _inacGrabada = t;
    try{ localStorage.setItem(_INAC_KEY, String(t)); }catch(e){}
  }
  // La compartida manda. La de memoria es el respaldo para navegadores con el
  // almacenamiento bloqueado, donde el comportamiento vuelve a ser el de antes.
  function _inacMarca(){ return _inacLeer() || _inacUltima; }

  function _inacQuitarAviso(){
    if(_inacAvisoEl){ _inacAvisoEl.remove(); _inacAvisoEl = null; }
  }

  window._inacSeguir = function(){
    _inacGrabar(Date.now());
    _inacQuitarAviso();
  };

  function _inacMostrarAviso(seg){
    if(!_inacAvisoEl){
      _inacAvisoEl = document.createElement('div');
      _inacAvisoEl.id = 'inac-aviso';
      _inacAvisoEl.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;'+
        'align-items:center;justify-content:center;padding:20px;';
      _inacAvisoEl.innerHTML =
        '<div style="background:var(--bg-card,#141a22);border:1px solid var(--border,#2a3441);'+
          'border-radius:14px;padding:22px 24px;max-width:380px;text-align:center;'+
          'box-shadow:0 18px 50px rgba(0,0,0,.5);">'+
          '<div style="font-size:2rem;margin-bottom:8px;">⏰</div>'+
          '<div style="font-size:.95rem;font-weight:800;color:var(--text-1,#e2eaf4);margin-bottom:6px;">'+
            'Tu sesión está por cerrarse</div>'+
          '<div style="font-size:.78rem;color:var(--text-2,#8b9db5);margin-bottom:16px;">'+
            'Llevás 2 horas sin actividad. Se cerrará en '+
            '<strong id="inac-seg" style="color:var(--warning-strong,#e6b539);">'+seg+'</strong> segundos.</div>'+
          '<button onclick="_inacSeguir()" style="width:100%;padding:11px;border-radius:9px;border:none;'+
            'background:#15803D;color:#fff;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;">'+
            'Seguir trabajando</button>'+
        '</div>';
      document.body.appendChild(_inacAvisoEl);
    } else {
      const s = document.getElementById('inac-seg');
      if(s) s.textContent = seg;
    }
  }

  function _inacCerrar(){
    _inacQuitarAviso();
    if(_inacTick){ clearInterval(_inacTick); _inacTick = null; }
    // Marca fresca para el próximo que entre: la vieja ya cumplió su función.
    _inacGrabar(Date.now());
    try{ sessionStorage.setItem('lgs_cerro_por_inactividad','1'); }catch(e){}
    // Se reusa el cierre normal para no dejar a medias la presencia ni las claves
    // guardadas. Según el perfil abierto, el logout que corresponda.
    try{
      if(document.getElementById('super-admin-panel') &&
         document.getElementById('super-admin-panel').style.display==='block') window._superAdmLogout();
      else if(document.getElementById('admin-panel') &&
         document.getElementById('admin-panel').classList.contains('visible')) window._admLogout();
      else {
        const m = document.getElementById('logout-modal');
        if(m) m.classList.add('open');    // _logoutConfirmar espera cerrarlo
        window._logoutConfirmar();
      }
    }catch(e){ location.reload(); }
  }

  // Llegar a esta página NAVEGANDO es actividad de la persona: hizo clic en algo,
  // escribió la URL o usó atrás/adelante. Una RECARGA no lo es —la app se recarga
  // sola cuando detecta una versión nueva— y no tiene por qué regalar dos horas.
  function _inacFueNavegacion(){
    try{
      const n = performance.getEntriesByType('navigation')[0];
      return !n || n.type !== 'reload';
    }catch(e){ return true; }
  }

  function _inacIniciar(){
    if(_inacTick) return;
    const c = _inacLeer();
    // Se siembra la marca en tres casos: no hay ninguna; la que hay ya venció
    // —quedó de una sesión anterior, y sin esto quien acaba de entrar se
    // encontraría la sesión cerrada en el acto—; o se llegó acá navegando.
    // Fuera de eso NO se toca: que la marca sobreviva a la navegación es
    // justamente lo que hace que las pestañas de fondo dejen de cerrar la sesión.
    if(!c || (Date.now()-c) >= _INAC_LIMITE || _inacFueNavegacion()) _inacGrabar(Date.now());
    else _inacUltima = c;

    const marcar = ()=>{
      // Con el aviso en pantalla no se reinicia solo por mover el mouse: hay que
      // apretar el botón. Si no, basta con rozar el teclado sin mirar para que la
      // sesión siga abierta indefinidamente.
      if(_inacAvisoEl) return;
      const t = Date.now();
      _inacUltima = t;
      // Escribir en localStorage en cada scroll sería un disparate: alcanza con
      // refrescar la marca cada 10 segundos, que al lado de un límite de dos
      // horas es más precisión de la que hace falta.
      if(t - _inacGrabada >= _INAC_GRABA) _inacGrabar(t);
    };
    ['mousedown','keydown','touchstart','scroll','click'].forEach(ev=>
      document.addEventListener(ev, marcar, {passive:true, capture:true}));

    _inacTick = setInterval(()=>{
      if(!_inacHaySesion()){
        _inacQuitarAviso();
        // Sin sesión el reloj no corre, pero la marca se mantiene al día. Así,
        // cuando alguien entra, arranca con las dos horas enteras y no con lo que
        // le quedaba a quien usó la pestaña antes —que si no, al relevarse dos
        // asesores en el mismo equipo, al segundo se le cerraría a los minutos.
        // LOGIN_KEY es compartido, así que esta rama solo se da cuando NADIE
        // tiene la sesión abierta: una pestaña en el login no le estira el
        // tiempo a otra que sí está trabajando.
        const t = Date.now();
        if(t - _inacGrabada >= _INAC_GRABA) _inacGrabar(t);
        return;
      }
      const quieto = Date.now() - _inacMarca();
      const restante = _INAC_LIMITE - quieto;
      if(restante <= 0) return _inacCerrar();
      if(restante <= _INAC_AVISO) _inacMostrarAviso(Math.ceil(restante/1000));
      else _inacQuitarAviso();
    }, 5000);
  }

  // Si la sesión anterior se cerró sola, se explica en el login: si no, la
  // persona vuelve, se encuentra deslogueada y cree que se rompió algo.
  function _inacAvisarSiCerroSola(){
    try{
      if(sessionStorage.getItem('lgs_cerro_por_inactividad')!=='1') return;
      sessionStorage.removeItem('lgs_cerro_por_inactividad');
      setTimeout(()=>{
        if(typeof toast==='function' && document.getElementById('toast'))
          toast('⏰ Tu sesión se cerró por 2 horas de inactividad. Volvé a entrar.', 7000);
      }, 800);
    }catch(e){}
  }

  window._logoutConfirmar = function(){
    document.getElementById('logout-modal').classList.remove('open');
    _limpiarPresencia();
    // TIENDAS_KEY va acá también: sin borrarla, el próximo usuario en este
    // navegador heredaría la lista de tiendas del anterior.
    [LOGIN_KEY,TIENDA_KEY,ASESOR_KEY,USER_KEY,'lgs_rol',TIENDAS_KEY,FROM_ADMIN_KEY].forEach(k=>localStorage.removeItem(k));
    window._currentRol=null;
    window._currentTiendaIds=null;
    window._cameFromAdmin=false;
    _limpiarAuditoria();
    firebase.auth().signOut().then(()=>{ _loginShow(); document.getElementById('login-user').focus(); });
  };
  window._admLogout = function(){
    [LOGIN_KEY,'lgs_admin_id','lgs_admin_user','lgs_empresa_actual',TIENDAS_KEY,FROM_ADMIN_KEY].forEach(k=>localStorage.removeItem(k));
    window._currentTiendaIds=null; window._cameFromAdmin=false;
    _limpiarAuditoria();
    document.getElementById('admin-panel').classList.remove('visible');
    firebase.auth().signOut().then(()=>{ _loginShow(); document.getElementById('login-user').focus(); });
  };
  window._superAdmLogout = function(){
    [LOGIN_KEY,TIENDAS_KEY,FROM_ADMIN_KEY].forEach(k=>localStorage.removeItem(k));
    window._currentTiendaIds=null; window._cameFromAdmin=false;
    _limpiarAuditoria();
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
    // Misma lectura que usa el selector (_leerRoles): si acá se calculara el
    // multi-rol con otro criterio, el botón podría ofrecer cambiar de perfil a
    // una cuenta que después el selector rechaza por tener un solo rol.
    _leerRoles(uid).then(({roles, admData, userData, tiendas})=>{
      const tieneMultiRol = roles.length > 1;
      ['btn-volver-roles-sa','btn-volver-roles-adm','btn-volver-roles-topnav','btn-volver-roles-tienda','btn-volver-roles-modeselect'].forEach(id=>{
        const b = document.getElementById(id);
        if(b) b.style.display = tieneMultiRol ? 'inline-block' : 'none';
      });
      if(tieneMultiRol) window._rolPendiente = { uid, email, roles, admData, userData };
      // Esta lectura ya traía user_tiendas y no se estaba aprovechando: es la
      // que repuebla la lista al restaurar sesión, y además capta una tienda
      // asignada mientras la sesión seguía viva. Se llama en las ramas de
      // onAuthStateChanged, así que el selector siempre termina bien pintado.
      _setTiendaIds(Object.keys(tiendas||{}));
      if(typeof window._refrescarBtnCambiarTienda==='function') window._refrescarBtnCambiarTienda();
      _sincronizarNombreAsesor(uid, userData);
    });
  }

  // Si el admin le cambió el nombre, la sesión abierta tiene que enterarse. El
  // nombre vivía solo en el localStorage del asesor, puesto al iniciar sesión, y
  // _registrarPresencia lo reescribe en presence con un set completo en cada
  // navegación: el cambio del admin duraba hasta que el asesor cambiaba de
  // página. Había que cerrar sesión y volver a entrar para que tomara.
  function _sincronizarNombreAsesor(uid, userData){
    const nuevo = ((userData||{}).asesor||'').trim();
    if(!nuevo) return;
    const actual = (localStorage.getItem(ASESOR_KEY)||'').trim();
    if(actual === nuevo) return;
    console.log('[SESIÓN] el nombre cambió: "'+actual+'" → "'+nuevo+'"');
    // El nombre anterior se conserva porque la lectura de datos viejos depende
    // de él: gestiones_diarias guardaba la carpeta como _gdKey(nombre), así que
    // pisar el nombre sin recordarlo dejaba el historial invisible (le pasó a
    // una asesora renombrada: entró y vio la tabla vacía).
    if(actual) localStorage.setItem(ASESOR_PREV_KEY, actual);
    localStorage.setItem(ASESOR_KEY, nuevo);
    // Que el panel lo vea sin esperar a la próxima navegación del asesor.
    if(typeof _db!=='undefined' && uid) _db.ref('presence/'+uid+'/asesor').set(nuevo);
    // OJO: _gdAK() —la carpeta donde se guardan sus gestiones— sale de este
    // nombre. A partir de acá escribe bajo la clave nueva; lo cargado antes
    // queda bajo la vieja. Ver _migrarAsesor() para mover lo anterior.
    if(typeof toast==='function') toast('Tu nombre se actualizó a "'+nuevo+'"', 4000);
  }

  // Restauración de sesión via Firebase Auth
  // Antes de mostrar nada: si hay una versión más nueva publicada, la app se
  // recarga sola. Acá no hay trabajo en curso que se pueda perder — es el
  // momento seguro para hacerlo, y evita tener que pedir Ctrl+F5.
  _limpiarParamVersion();
  _chequearVersion();
  _inacAvisarSiCerroSola();

  firebase.auth().onAuthStateChanged(user=>{
    _hideSplash();
    // El reloj de inactividad corre siempre que haya sesión: se controla solo
    // mirando LOGIN_KEY en cada vuelta, así vale igual para asesor, admin o
    // super admin, y en las cuatro páginas.
    _inacIniciar();
    const savedSession = localStorage.getItem(LOGIN_KEY);
    if(!savedSession){ _loginShow(); document.getElementById('login-user').focus(); return; }
    // El usuario estaba eligiendo perfil cuando la página se recargó (o navegó).
    // Se le devuelve el selector en vez de mandarlo al login: la sesión de
    // Firebase Auth sigue viva, no hay nada que volver a autenticar.
    if(savedSession==='rolselect'){
      if(!user){ localStorage.removeItem(LOGIN_KEY); _loginShow(); document.getElementById('login-user').focus(); return; }
      _loginHide();
      _leerRoles(user.uid).then(({roles, admData, userData})=>{
        if(roles.length<=1){
          // Perdió el multi-rol mientras tanto: no dejarlo encerrado en un
          // selector de una sola opción.
          localStorage.removeItem(LOGIN_KEY);
          _loginShow(); document.getElementById('login-user').focus();
          return;
        }
        _prepararSelectorRol();
        _mostrarSelectorRol(user.uid, user.email||'', roles, admData, userData);
      }).catch(()=>{ localStorage.removeItem(LOGIN_KEY); _loginShow(); });
      return;
    }
    if(savedSession==='superadmin'){ _showSuperAdmin(); _superAdmCargar(); if(user)_refrescarBotonCambiarPerfil(user.uid,user.email||''); return; }
    if(savedSession==='admin'){
      // Un admin en una página de módulo (las 3 declaran _PAGINA_MODULO en su
      // bootstrap; index.html no) abre ese módulo con la última tienda a la que
      // entró. Antes se caía siempre al Centro de Operaciones y los módulos
      // eran inalcanzables salvo pasando por 🏪 Tiendas → "Entrar a tienda".
      const tAdm = localStorage.getItem(TIENDA_KEY), aAdm = localStorage.getItem(ASESOR_KEY);
      if(window._PAGINA_MODULO && user && tAdm && aAdm){
        // Un admin dentro de una tienda es un auditor, se haya metido por
        // "🛡️ Auditar tienda" o entrando a la URL del módulo a mano: en los dos
        // casos mira datos ajenos, así que entra igual de blindado.
        _setAuditoria(true);
        _instalarBlindajeAuditoria();
        localStorage.setItem(LOGIN_KEY,'audit');
        _loginHide();
        window._currentRol = localStorage.getItem('lgs_rol')||'dueno';
        window._currentTiendaId = localStorage.getItem('lgs_empresa_id')||null;
        _entrarSinPresencia(user.uid);
        _refrescarBotonCambiarPerfil(user.uid, user.email||'');
        window._gdMostrarModeSelect(aAdm);
        _auditBarraRefrescar();
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
    // Auditoría en curso (el admin está dentro de una tienda, en solo lectura).
    // Necesita rama propia porque es el único estado que entra a un módulo SIN
    // registrar presencia: si cayera en la rama de abajo, cada salto de página
    // volvería a publicarlo en "En vivo" como un asesor más de la tienda.
    if(savedSession==='audit'){
      if(!user){ _limpiarAuditoria(); localStorage.removeItem(LOGIN_KEY); _loginShow(); document.getElementById('login-user').focus(); return; }
      const tAud = localStorage.getItem(TIENDA_KEY), aAud = localStorage.getItem(ASESOR_KEY);
      if(!tAud){
        // Sin tienda no hay nada que auditar: devolverlo al Centro de Operaciones.
        _limpiarAuditoria(); localStorage.setItem(LOGIN_KEY,'admin');
        if(window._PAGINA_MODULO){ irAPagina('/'); return; }
        _showAdmin(); _admCargarDashboard(); return;
      }
      _setAuditoria(true);
      _instalarBlindajeAuditoria();
      _loginHide();
      window._currentRol = localStorage.getItem('lgs_rol')||'dueno';
      window._currentTiendaId = localStorage.getItem('lgs_empresa_id')||null;
      _entrarSinPresencia(user.uid);
      _refrescarBotonCambiarPerfil(user.uid, user.email||'');
      window._gdMostrarModeSelect(aAud);
      _auditBarraRefrescar();
      return;
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
  if(!oldKey||!newUid){ _mAlert('Faltan datos','Ingresá la clave antigua y el UID nuevo.'); return; }
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
  _mAlert('✅ Recuperación completada','Los datos se movieron correctamente al UID nuevo.');
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
  _mConfirm('¿Quitar la cuenta Gmail de Super Admin?','Esa cuenta dejará de tener acceso al panel de Super Admin.',()=>{
    _db.ref('config/superAdminUid').remove().then(()=>{
      toast('✅ Vinculación de Super Admin eliminada');
      document.getElementById('sa-superadmin-actual').textContent='Sin cuenta Gmail vinculada como Super Admin';
      document.getElementById('sa-superadmin-email').value='';
    });
  },'danger');
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

    const totalOnline = Object.values(presencia).filter(_estaOnline).length;
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
          const online = _estaOnline(presencia[ukey]);
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
// Acá estaba _migracionInicial(), borrada el 2026-08-17 junto con su llamada
// automática. Era de cuando la app tenía una sola empresa ("3D Company") y
// corría SOLA en cada carga de página, para cualquier usuario y antes del login.
// Hacía tres cosas y hoy ninguna era deseable:
//
//  1. Si no encontraba el admin '3DCompanyadmin', lo creaba con
//     {username:'3DCompanyadmin', password:'3DCompanyadmin'} — una contraseña en
//     texto plano, igual al usuario, dentro de /admins.
//  2. Creaba la empresa "3D Company" si ese admin no tenía ninguna.
//  3. Leía /users ENTERO y metía a todos los uid en empresa_asesores/{3D Company}
//     en cada carga. Eso no era una migración: era una contaminación continua.
//     Es exactamente lo que documenta _auditMembresias() más arriba — "3D Company
//     tenía 22 asesores asignados habiendo 17 usuarios en total", y repararlo a
//     ciegas "habría dado acceso a esa tienda a media empresa".
//
// Borrarla no rompe nada: el admin y la empresa ya existen (no se recrean), el
// alta de asesores escribe los dos índices por su cuenta desde hace tiempo, y
// nadie más la llamaba. Lo que ya quedó de más en empresa_asesores sigue ahí;
// para revisarlo está _auditMembresias(). Si alguna vez hace falta consultarla,
// está en el historial de git.

_initLogin();

// ===== FIREBASE SYNC GESTIONES =====
function _fbKey(k){ return String(k).replace(/[.#$\[\]\/]/g,'_'); }

// ── FRENO CONTRA GESTIONES EN LOTE ───────────────────────────────────
// Ninguna persona registra decenas de gestiones en un par de segundos. Cuando
// eso pasa es un bucle del sistema acreditándole trabajo a quien tiene la
// pantalla abierta — el 2026-08-06 le sumó 102 gestiones en el mismo segundo a
// una asesora que no había gestionado nada.
//
// Esa causa puntual ya está corregida, pero el freno queda como red: cualquier
// código que en el futuro llame en bucle a algo que registra gestiones se topa
// con esto en vez de ensuciar meses de datos en silencio.
//
// No frena el trabajo real: el límite es muy superior al ritmo humano posible.
const _GEST_MAX = 12;        // gestiones permitidas...
const _GEST_VENTANA = 6000;  // ...en esta ventana de tiempo (ms)
let _gestSellos = [];
let _gestAvisado = false;

// Devuelve true si se puede registrar. Llamar SIEMPRE justo antes de crear una
// evidencia con resultado (solucionada/devuelta), que es lo que suma al día.
function _puedeRegistrarGestion(motivo){
  const ahora = Date.now();
  _gestSellos = _gestSellos.filter(t => ahora - t < _GEST_VENTANA);
  if(_gestSellos.length >= _GEST_MAX){
    if(!_gestAvisado){
      _gestAvisado = true;
      setTimeout(()=>{ _gestAvisado = false; }, 20000);
      const msg = '⚠️ Se frenó el registro automático de gestiones: se intentaron '+
                  (_gestSellos.length+1)+' en '+(_GEST_VENTANA/1000)+' segundos'+
                  (motivo?' ('+motivo+')':'')+'. No se guardó nada. Avisá a soporte.';
      if(typeof toast==='function' && document.getElementById('toast')) toast(msg, 9000);
      else if(typeof alert==='function') alert(msg);
    }
    console.error('[FRENO gestiones] bloqueadas por ritmo imposible.'+
      ' Intentos en los últimos '+(_GEST_VENTANA/1000)+'s: '+(_gestSellos.length+1)+
      (motivo?' · origen: '+motivo:'')+
      '. Si esto se repite, hay un bucle registrando gestiones que nadie hizo.');
    return false;
  }
  _gestSellos.push(ahora);
  return true;
}

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
  const _tk=_gsKeyEscritura();
  if(!_tk) return;
  _db.ref('gestiones_sync/'+_tk+'/'+_fbKey(p.dropiId)).update(g);
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
    const hoy=_hoyLocal();
    const user=window._currentUsername;
    const asesorRaw=window.getLoginAsesor?window.getLoginAsesor():'';
    // La rama es el UID, no el nombre. Con el nombre, a la misma persona se le
    // abría una rama nueva cada vez que se lo escribían distinto o no se
    // resolvía: quedaban "yiseth" y "yiseth jácome", o "dalevys" (el nombre de
    // la TIENDA) conviviendo con "yon". El nombre se sigue guardando adentro,
    // en asesorNombre, que es de donde lo toman el ranking y el selector.
    const asesorKey=user;
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
// Tick que reevalúa el "en línea" contra el reloj, aunque no llegue nada nuevo
// de Firebase (ver _admRepintarPresencia).
let _admPresenceTick = null;
// Nombres de tienda para "Buscar orden". Se cachean al abrir el panel: la
// búsqueda puede mirar varias tiendas a la vez y hay que poder decir de cuál
// salió cada resultado. Declarada acá arriba porque se asigna en
// _admCargarDashboard, mucho antes de donde se usa.
let _bordEmpresas = {};

// ── RUTAS DEL CENTRO DE OPERACIONES ──────────────────────────────────────
// El panel era 11 divs que se mostraban y se ocultaban, así que la URL se
// quedaba en "/" estuvieras donde estuvieras: no se podía mandar el enlace de
// una sección, F5 te devolvía siempre a En Vivo, y el botón atrás te sacaba de
// la app en vez de volver al tab anterior. Ahora cada sección tiene su URL real,
// /admin/equipo y compañía, sin "#".
//
// Sin "#" solo es posible porque el hosting devuelve index.html para cualquier
// ruta sin archivo (el rewrite de firebase.json). En GitHub Pages esto daba 404
// al recargar — fue el motivo de migrar. Si algún día se vuelve a un hosting sin
// rewrite, esto hay que pasarlo a location.hash.
//
// El router entra por UN SOLO punto: _admTab, que es la única función que cambia
// de sección y a la que apuntan los 44 onclick del HTML. No hace falta tocar
// ninguno de ellos.
const _ADM_TABS = ['enlive','ranking','equipo','analitica','empresas','botventas','buscar','gdconsolid','auditoria','reportes','negocio'];
const _ADM_TAB_INICIAL = 'enlive';   // el que el HTML ya trae marcado como activo

// Solo en la landing: el Centro de Operaciones vive en index.html. Las 3 páginas
// de módulo declaran _PAGINA_MODULO y tienen una copia muerta del panel, así que
// ahí el router no debe tocar la URL ni por casualidad.
function _admRouterActivo(){
  return !window._PAGINA_MODULO && typeof history !== 'undefined' && !!history.pushState;
}

// Devuelve el tab de la URL, o null. Se valida contra _ADM_TABS: una ruta
// inventada (/admin/loquesea) no puede hacer que se muestre nada raro.
function _admRutaLeer(){
  const m = String(location.pathname || '').match(/^\/admin\/([a-z]+)\/?$/);
  return (m && _ADM_TABS.indexOf(m[1]) >= 0) ? m[1] : null;
}

function _admRutaEscribir(tab, reemplazar){
  if(!_admRouterActivo()) return;
  const url = '/admin/' + tab;
  if(location.pathname === url) return;   // sin esto, recargar duplicaría historial
  history[reemplazar ? 'replaceState' : 'pushState']({admTab:tab}, '', url);
}

// Al abrir el panel: si la URL ya pedía una sección, se respeta. Si no, se
// normaliza a /admin/enlive con replaceState —no pushState— para no dejar una
// entrada de historial de más nada más entrar.
function _admRutaAplicar(){
  if(!_admRouterActivo()) return;
  const tab = _admRutaLeer();
  if(tab && tab !== _ADM_TAB_INICIAL) _admTab(tab, true);
  else _admRutaEscribir(_ADM_TAB_INICIAL, true);
}

// Al volver al login la URL no puede quedarse en /admin/algo: el siguiente que
// abra el navegador vería esa ruta sin tener sesión.
function _admRutaLimpiar(){
  if(!_admRouterActivo()) return;
  if(_admRutaLeer()) history.replaceState({}, '', '/');
}

// Atrás y adelante del navegador. Se exige que el panel esté visible: si el
// usuario ya salió al login, un popstate no debe repintar secciones de admin.
window.addEventListener('popstate', function(){
  if(!_admRouterActivo()) return;
  const panel = document.getElementById('admin-panel');
  if(!panel || !panel.classList.contains('visible')) return;
  _admTab(_admRutaLeer() || _ADM_TAB_INICIAL, true);
});

// _desdeLaRuta lo pasan _admRutaAplicar y el popstate: en esos dos casos la URL
// YA es la correcta y volver a escribirla duplicaría el historial. Los onclick
// del HTML llaman con un solo argumento, así que siguen escribiendo la URL.
function _admTab(tab, _desdeLaRuta){
  _ADM_TABS.forEach(t=>{
    const el = document.getElementById('adm-tab-'+t);
    if(el) el.style.display = t===tab ? 'block' : 'none';
    const btn = document.getElementById('tab-btn-'+t);
    if(btn) btn.classList.toggle('active', t===tab);
  });
  if(!_desdeLaRuta) _admRutaEscribir(tab);
  // Al volver a En Vivo se refresca en el acto: mientras estuvo oculto los ticks
  // no corrieron, así que sin esto se vería el pulso de cuando se salió del tab.
  if(tab==='enlive'){ _admRepintarPresencia(); if(_admTarjetasIds.length) _admCargarTarjetas(_admTarjetasIds); }
  if(tab==='equipo') _cargarEquipoGlobal();
  if(tab==='analitica') _anlInicializar();
  if(tab==='ranking') _rnkInicializar();
  if(tab==='empresas') _admCargarEmpresas();
  if(tab==='botventas') _botwCargar();
  if(tab==='buscar') setTimeout(()=>{ const i=document.getElementById('bord-input'); if(i) i.focus(); }, 100);
  if(tab==='gdconsolid'){
    // Pre-fill mes con el mes actual
    const hoy=new Date(), y=hoy.getFullYear(), m=String(hoy.getMonth()+1).padStart(2,'0');
    const mesEl=document.getElementById('gdadm-mes');
    if(mesEl&&!mesEl.value) mesEl.value=y+'-'+m;
    // El selector de día se llena a partir del mes, así que va después.
    _gdadmPoblarDias();
    _gdadmPoblarTiendas();
  }
  if(tab==='auditoria') _audInicializar();
  if(tab==='reportes') _admCargarReportes();
  if(tab==='negocio') _admCargarNegocio();
}

// ── AUDITORÍA DE LOGINS ───────────────────────────────────────────────────
let _audAllData=[], _audFilter='';

// La clave del nodo. Firebase no permite ".", "#", "$", "[", "]" en rutas, y
// además el correo se guarda EN MINÚSCULAS: se tomaba tal como se tecleaba, así
// que "Frankaroasesor1@gmail.com" y "frankaroasesor1@gmail.com" quedaron como
// dos personas distintas (20 y 74 registros) y ninguna lista las mostraba juntas.
function _audKey(username){
  return String(username||'').trim().toLowerCase().replace(/[.#$[\]]/g,'_');
}

// Un login exitoso se registraba DOS veces: una al validar la contraseña y otra
// al entrar con el rol, a ~120 ms de distancia. Eran el 46% de los registros.
// Las llamadas de más ya se quitaron; esto es la red de seguridad para que una
// vía nueva no vuelva a duplicar sin que nadie se entere.
const _AUD_REPETIDO_MS = 15000;
let _audUltimo = {};

// ── UNIFICAR CUENTAS QUE SOLO DIFIEREN EN MAYÚSCULAS ─────────────────────
// El correo se guardaba tal como se tecleaba, así que quien un día escribió
// "Frankaroasesor1@gmail.com" quedó con dos carpetas: 20 accesos en una y 74 en
// la otra, y ninguna lista los mostraba juntos. _audKey ya normaliza a
// minúsculas; esto arregla lo que quedó de antes.
//
//   _audUnificarMayusculas()                → simulación
//   _audUnificarMayusculas({aplicar:true})  → mueve los registros
window._audUnificarMayusculas = async function(opts){
  opts = opts||{};
  const snap = await _db.ref('login_audit').once('value');
  const todo = snap.val()||{};
  const grupos = {};
  Object.keys(todo).forEach(k=>{ const l=k.toLowerCase(); (grupos[l]=grupos[l]||[]).push(k); });
  const mover = [];
  Object.entries(grupos).forEach(([destino,claves])=>{
    if(claves.length<2 && claves[0]===destino) return;
    claves.filter(k=>k!==destino).forEach(origen=>{
      Object.entries(todo[origen]||{}).forEach(([key,reg])=>mover.push({origen,destino,key,reg}));
    });
  });
  console.log('%c══ CUENTAS DUPLICADAS POR MAYÚSCULAS ══','font-weight:bold;font-size:13px');
  if(!mover.length){ console.log('No hay ninguna.'); return {mover:[]}; }
  const resumen={};
  mover.forEach(m=>{ const id=m.origen+' → '+m.destino; resumen[id]=(resumen[id]||0)+1; });
  console.table(Object.entries(resumen).map(([ruta,n])=>({ruta,registros:n})));
  if(!opts.aplicar){
    console.log('%cSimulación. Para aplicar: _audUnificarMayusculas({aplicar:true})','color:#E6B539');
    return {mover};
  }
  const upd={};
  mover.forEach(m=>{ upd[m.destino+'/'+m.key]=m.reg; upd[m.origen+'/'+m.key]=null; });
  await _db.ref('login_audit').update(upd);
  console.log('%c✓ '+mover.length+' registros movidos. Ahora corré _audLimpiarDuplicados().','color:#39E67A;font-weight:bold');
  return {movidos:mover.length};
};

// ── LIMPIEZA DE LOS DUPLICADOS VIEJOS ────────────────────────────────────
// Los registros escritos antes del arreglo siguen ahí: 356 de 774 eran el mismo
// acceso guardado dos veces. Se conserva SIEMPRE el primero de cada par (es el
// que tiene la hora real del ingreso) y se borran los que lo siguen dentro de la
// ventana. Se agrupa por cuenta y resultado: dos personas distintas entrando a
// la vez, o un fallo seguido de un éxito, no son duplicados.
//
// Ejecutar desde la consola como admin:
//   _audLimpiarDuplicados()                  → simulación, no borra nada
//   _audLimpiarDuplicados({aplicar:true})    → borra (descarga el backup antes)
window._audLimpiarDuplicados = async function(opts){
  opts = opts||{};
  const ventana = opts.ventanaMs || _AUD_REPETIDO_MS;
  const snap = await _db.ref('login_audit').once('value');
  const todo = snap.val()||{};
  const aBorrar = [];
  let total = 0;

  Object.entries(todo).forEach(([cuenta,regs])=>{
    const lista = Object.entries(regs||{})
      .map(([k,r])=>({k, ts:(r||{}).ts||0, resultado:(r||{}).resultado||''}))
      .sort((a,b)=>a.ts-b.ts);
    total += lista.length;
    const ultimoDe = {};
    lista.forEach(r=>{
      // Un registro sin ts no se puede comparar con nada: se deja quieto.
      if(!r.ts) return;
      const previo = ultimoDe[r.resultado];
      if(previo!=null && r.ts-previo <= ventana){
        aBorrar.push({cuenta, key:r.k, ts:r.ts, resultado:r.resultado, separacionMs:r.ts-previo});
      } else {
        // El ancla es el PRIMERO del grupo y no se mueve: si se corriera con
        // cada duplicado, una ráfaga de registros se borraría en cadena.
        ultimoDe[r.resultado] = r.ts;
      }
    });
  });

  const porCuenta = {};
  aBorrar.forEach(b=>{ porCuenta[b.cuenta]=(porCuenta[b.cuenta]||0)+1; });
  console.log('%c══ DUPLICADOS EN login_audit ══','font-weight:bold;font-size:13px');
  console.log('Registros en la base: '+total);
  console.log('A borrar: '+aBorrar.length+' ('+(total?(aBorrar.length/total*100).toFixed(1):0)+'%)');
  console.log('Quedarían: '+(total-aBorrar.length)+' accesos reales');
  console.table(Object.entries(porCuenta).sort((a,b)=>b[1]-a[1]).map(([cuenta,n])=>({cuenta,duplicados:n})));

  if(!opts.aplicar){
    console.log('%cSimulación: no se borró nada. Para aplicar: _audLimpiarDuplicados({aplicar:true})','color:#E6B539');
    return {total, aBorrar};
  }
  if(!aBorrar.length){ console.log('No hay nada que borrar.'); return {total, aBorrar}; }

  // Backup antes de tocar: el nodo entero, no solo lo que se borra.
  try{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(todo,null,2)],{type:'application/json'}));
    a.download='login_audit-backup-'+_hoyLocal()+'.json';
    a.click();
    console.log('%cBackup descargado: '+a.download,'color:#39E67A');
  }catch(e){ console.warn('No se pudo descargar el backup:',e); throw new Error('Sin backup no se borra. Revisá el error de arriba.'); }

  // En lotes: un update con 356 claves en una sola llamada es frágil.
  const LOTE=100;
  for(let i=0;i<aBorrar.length;i+=LOTE){
    const upd={};
    aBorrar.slice(i,i+LOTE).forEach(b=>{ upd[b.cuenta+'/'+b.key]=null; });
    await _db.ref('login_audit').update(upd);
    console.log('  borrados '+Math.min(i+LOTE,aBorrar.length)+'/'+aBorrar.length);
  }
  console.log('%c✓ Listo. Quedan '+(total-aBorrar.length)+' accesos.','color:#39E67A;font-weight:bold');
  return {total, borrados:aBorrar.length};
};

async function _auditLogin(username, resultado){
  try{
    if(typeof _db==='undefined')return;
    const safeKey = _audKey(username);
    const marca = safeKey+'|'+resultado;
    const ahora = Date.now();
    if(_audUltimo[marca] && ahora-_audUltimo[marca] < _AUD_REPETIDO_MS){
      console.warn('[audit] ignorado, mismo acceso hace '+(ahora-_audUltimo[marca])+' ms:', marca);
      return;
    }
    _audUltimo[marca] = ahora;

    const ua=navigator.userAgent||'—';
    const esMovil=/Mobi|Android|iPhone|iPad/i.test(ua);
    const navegador=ua.includes('Chrome')?'Chrome':ua.includes('Firefox')?'Firefox':ua.includes('Safari')?'Safari':ua.includes('Edge')?'Edge':'Otro';
    const record={
      username, resultado, ts:ahora,
      fecha:new Date().toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}),
      ip:'—', ciudad:'—', region:'—', pais:'—', isp:'—',
      dispositivo:esMovil?'Móvil':'Escritorio',
      navegador, tz:Intl.DateTimeFormat().resolvedOptions().timeZone||'—',
      ua:ua.slice(0,120) // truncar para no exceder límites
    };
    // El registro se guarda PRIMERO y la ubicación se agrega después. Antes se
    // esperaba a la API de IP para recién escribir: si la red fallaba o el
    // navegador cambiaba de página en el medio, el acceso no quedaba registrado.
    const ref = await _db.ref('login_audit/'+safeKey).push(record);
    _audUbicacion().then(u=>{ if(u) ref.update(u); }).catch(()=>{});
  }catch(e){ console.warn('[audit]',e); }
}

// El proveedor anterior (ip-api.com) no da HTTPS en su plan gratuito: desde la
// app respondía 403 y por eso los 774 registros que había tenían la IP y la
// ubicación vacías. ipwho.is sí sirve por HTTPS y sin API key; geojs queda de
// respaldo por si algún día cambia.
async function _audUbicacion(){
  const pedir=async(url,ms)=>{
    const ctl=new AbortController();
    const t=setTimeout(()=>ctl.abort(), ms);
    try{
      const r=await fetch(url,{cache:'no-store',signal:ctl.signal});
      return r.ok ? await r.json() : null;
    } finally { clearTimeout(t); }
  };
  try{
    const d=await pedir('https://ipwho.is/',6000);
    if(d && d.success && d.ip){
      return {ip:d.ip, ciudad:d.city||'—', region:d.region||'—', pais:d.country||'—',
              isp:(d.connection&&(d.connection.org||d.connection.isp))||'—'};
    }
  }catch(_){}
  try{
    const d=await pedir('https://get.geojs.io/v1/ip/geo.json',6000);
    if(d && d.ip){
      return {ip:d.ip, ciudad:d.city||'—', region:d.region||'—', pais:d.country||'—',
              isp:d.organization_name||d.organization||'—'};
    }
  }catch(_){}
  return null;
}

// Cuántos registros se bajan por cuenta. Estaba en 30 y con eso 434 de los 774
// registros que había NO se descargaban nunca: la cuenta con más movimiento
// tenía 292 accesos y en pantalla salían 30. No es un tope de pantalla, es un
// tope de consulta, y por eso parecía que los accesos no se estaban guardando.
const _AUD_POR_CUENTA = 500;
const _AUD_TOTAL = 3000;

// Las claves REALES del nodo, no las deducidas de /users y /admins. Hay
// registros guardados bajo nombres de tienda del login viejo (3D Company,
// Tendearte, Frankaro…) que no le corresponden a ningún correo y quedaban
// invisibles. `shallow` trae solo los nombres de las claves, no los registros.
async function _audClavesExistentes(){
  try{
    const dbURL=((_db.app||{}).options||{}).databaseURL||'';
    const u=firebase.auth().currentUser;
    if(!dbURL||!u) return [];
    const token=await u.getIdToken();
    const r=await fetch(dbURL+'/login_audit.json?shallow=true&auth='+encodeURIComponent(token),{cache:'no-store'});
    if(!r.ok) return [];
    return Object.keys(await r.json()||{});
  }catch(e){ console.warn('[audit] no se pudieron listar las cuentas:',e); return []; }
}

async function _audInicializar(){
  const wrap=document.getElementById('aud-table-wrap');
  if(!wrap)return;
  wrap.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-3);font-size:.75rem;">Cargando registros...</div>';
  const [snapUsers, snapAdmins, clavesReales]=await Promise.all([
    _db.ref('users').once('value'),
    _db.ref('admins').once('value'),
    _audClavesExistentes()
  ]);
  // El valor de cada opción es la clave del nodo y el texto es el correo: antes
  // el valor era el correo con puntos y la consulta con ese valor ni siquiera
  // llegaba a Firebase — "login_audit/x@y.com" es una ruta inválida.
  const etiquetas={};
  const agregar=nombre=>{ if(nombre) etiquetas[_audKey(nombre)] = etiquetas[_audKey(nombre)]||String(nombre); };
  snapUsers.val()&&Object.entries(snapUsers.val()).forEach(([uid,u])=>agregar(u.email||uid));
  snapAdmins.val()&&Object.entries(snapAdmins.val()).forEach(([uid,a])=>agregar(a.email||a.username||uid));
  clavesReales.forEach(k=>{ if(!etiquetas[k]) etiquetas[k]=k; });
  const sel=document.getElementById('aud-user-sel');
  if(sel){
    const conDatos=new Set(clavesReales);
    sel.innerHTML='<option value="">Todos los usuarios</option>'+
      Object.entries(etiquetas)
        .sort((a,b)=>a[1].localeCompare(b[1]))
        // Las cuentas sin un solo acceso se marcan en vez de esconderse: que no
        // haya registros es justamente algo que el admin quiere poder ver.
        .map(([k,txt])=>`<option value="${k}">${txt}${conDatos.has(k)?'':' — sin accesos'}</option>`).join('');
  }
  _audCargar();
}

async function _audCargar(){
  const wrap=document.getElementById('aud-table-wrap');
  if(!wrap)return;
  wrap.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-3);font-size:.75rem;">Cargando...</div>';
  const userFil=(document.getElementById('aud-user-sel')||{}).value||'';
  _audAllData=[];
  try{
    if(userFil){
      const snap=await _db.ref('login_audit/'+_audKey(userFil)).orderByChild('ts').limitToLast(_AUD_POR_CUENTA).once('value');
      snap.forEach(ch=>_audAllData.unshift({...ch.val(),_key:ch.key,_cuenta:userFil}));
    } else {
      // Consultar por cuenta con límite en vez de bajar todo el árbol
      // (login_audit crece sin tope; la descarga completa se vuelve lenta con el tiempo)
      const sel=document.getElementById('aud-user-sel');
      const cuentas=sel?[...sel.options].map(o=>o.value).filter(Boolean):[];
      const snaps=await Promise.all(cuentas.map(k=>
        _db.ref('login_audit/'+k).orderByChild('ts').limitToLast(_AUD_POR_CUENTA).once('value')
      ));
      snaps.forEach((s,i)=>{ s.forEach(ch=>{ _audAllData.push({...ch.val(),_key:ch.key,_cuenta:cuentas[i],username:ch.val().username||cuentas[i]}); }); });
      _audAllData.sort((a,b)=>(b.ts||0)-(a.ts||0));
      _audAllData=_audAllData.slice(0,_AUD_TOTAL);
    }
  }catch(e){
    console.warn('[audit] error al cargar',e);
    wrap.innerHTML='<div style="padding:30px;text-align:center;color:var(--danger);font-size:.75rem;">No se pudieron cargar los registros: '+String(e.message||e)+'</div>';
    return;
  }
  _audFiltrar();
}

// Se dice cuántos se bajaron y desde cuándo: sin eso, un tope de consulta se ve
// igual que "no se está registrando nada", que es justo la confusión que hubo.
function _audPie(mostrados){
  const total=_audAllData.length;
  const cuentas=new Set(_audAllData.map(r=>r._cuenta||r.username)).size;
  let txt=mostrados+' de '+total+' registro'+(total===1?'':'s')+' · '+cuentas+' cuenta'+(cuentas===1?'':'s');
  const ts=_audAllData.map(r=>r.ts).filter(Boolean);
  if(ts.length){
    const f=t=>new Date(t).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'});
    txt+=' · desde '+f(Math.min(...ts))+' hasta '+f(Math.max(...ts));
  }
  if(total>=_AUD_TOTAL) txt+=' · tope alcanzado, filtra por usuario para ver más atrás';
  return txt;
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
    // No es un acceso: es un admin pidiendo el correo de restablecimiento. Se
    // guarda acá porque es un cambio de credenciales y conviene saber quién lo pidió.
    if(r.resultado==='reset_solicitado') return '<span style="background:var(--info-soft);color:var(--info);border-radius:12px;padding:2px 8px;font-size:.62rem;font-weight:700;">🔑 Restablecimiento pedido'+
      (r.pedidoPor?' por '+esc(r.pedidoPor):'')+'</span>';
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
  </table><div style="padding:8px 10px;font-size:.62rem;color:var(--text-3);">${_audPie(rows.length)}</div></div>`;
}

function _admCargarDashboard(){
  const adminId = localStorage.getItem('lgs_admin_id');
  // El panel compara lastSeen (hora del servidor) contra su propio reloj: sin el
  // offset, un admin con la hora corrida vería a todos desconectados o a todos
  // conectados. Lo necesita igual que el cliente del asesor.
  _iniciarOffsetServidor();
  // Las fotos de perfil viven aparte de users/ y se leen una sola vez; cuando
  // llegan se repintan las tarjetas, que hasta entonces muestran iniciales.
  if(typeof window._cargarFotos==='function') window._cargarFotos().then(()=>_admRepintarPresencia());
  // Nombres de tienda para "Buscar orden", que ahora puede mirar varias a la vez.
  _db.ref('empresas').once('value').then(s=>{ _bordEmpresas=s.val()||{}; }).catch(()=>{});
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
    _db.ref('empresa_asesores').once('value'),
    _db.ref('users').once('value'),
    _db.ref('presence').once('value'),
    _db.ref('user_tiendas').once('value')
  ]).then(([snapEmpresas, snapAsesores, snapUsers, snapPresence, snapUserTiendas])=>{
    const todasEmpresas = snapEmpresas.val()||{};
    // La pertenencia de un asesor a una tienda vive en DOS índices espejo que
    // se desincronizan: empresa_asesores/{empId}/{uid} (el que miraba este
    // panel) y user_tiendas/{uid}/{empId} (el que usa el login). Un asesor que
    // solo estaba en el segundo trabajaba normal pero era invisible acá — de
    // ahí el "no me salen todos los asesores en vivo". Se toma la UNIÓN para
    // que nadie quede fuera; _auditMembresias() lista y repara los desparejos.
    const porEmpresa = snapAsesores.val()||{};
    const porUsuario = snapUserTiendas.val()||{};
    const idsObjetivo = esTodas ? empresasIds : [empresaActualId];
    const set = new Set();
    idsObjetivo.forEach(empId=>Object.keys(porEmpresa[empId]||{}).forEach(uid=>set.add(uid)));
    Object.entries(porUsuario).forEach(([uid,emps])=>{
      if(idsObjetivo.some(empId=>(emps||{})[empId])) set.add(uid);
    });
    const asesorUids = [...set];
    const todosUsers = Object.entries(snapUsers.val()||{}).map(([uid,d])=>({uid,...d}));
    const presencia = snapPresence.val()||{};

    // En Vivo es un tablero de operación y solo se mide a los asesores: los
    // dueños entran a revisar, no a gestionar, y ensuciaban la lista. El filtro
    // excluye rol 'dueno' en vez de exigir rol 'asesor' a propósito — hay
    // cuentas viejas sin rol guardado, y ocultar a alguien que sí trabaja es
    // peor que mostrar de más. Equipo sigue listando a todos, que para eso es.
    const usuarios = todosUsers.filter(u=>asesorUids.includes(u.uid) && u.rol!=='dueno');

    _admPresenciaCache = presencia;
    _admUsuariosCache = usuarios;

    _admActualizarSelectorEmpresa(adminId, empresasIds, todasEmpresas, empresaActualId);

    // Las tarjetas ya no salen de presence: los dos números de arriba vienen del
    // último Excel cargado y el resumen del día, de Gestiones Diarias.
    _admCargarTarjetas(esTodas?empresasIds:[empresaActualId]);

    usuarios.sort((a,b)=>{
      const ao=_estaOnline(presencia[a.uid]);
      const bo=_estaOnline(presencia[b.uid]);
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
      _admPresenceRenderTimer = setTimeout(_admRepintarPresencia, 5000);
    });
    // Estar "en línea" depende del tiempo transcurrido, no solo de lo que llega
    // de Firebase: si un asesor cierra de golpe y el onDisconnect no alcanza a
    // dispararse, su lastSeen se queda viejo y nadie lo vuelve a evaluar — el
    // panel lo mostraba conectado indefinidamente. Este tick relee el reloj.
    if(_admPresenceTick) clearInterval(_admPresenceTick);
    _admPresenceTick = setInterval(_admRepintarPresencia, 30000);
  });
}

// ── Tarjetas del Centro de Operaciones ───────────────────────────────────
// Todo sale de gestiones_diarias, de una sola lectura del mes por tienda:
//   · Pendientes de confirmación y Pedidos en novedad → del CONSOLIDADO, que es
//     donde cada tienda anota esas dos cifras en cada corte del día.
//   · El resumen del día → de las carpetas de asesor, sumando a TODOS los de la
//     tienda para el día de hoy.
// Antes las dos primeras salían de logistica_live/{empId} (el pulso del último
// Excel cargado en Gestión Logística). Se cambió porque el Excel refleja lo que
// una persona tenía abierto en su navegador en un momento suelto, mientras que
// el consolidado es el registro que la tienda lleva a mano tres veces al día.
// Los tres cortes del consolidado, del más temprano al más tarde (ver _CORTES
// en gestiones-diarias.js, que es donde se cargan).
const _ADM_CORTES = ['8am','12pm','5pm'];
const _ADM_CORTE_LBL = ['Consolidado 8 AM','Consolidado 12 PM','Consolidado 5 PM'];
// Cuánto tiene HOY una tienda de un campo del consolidado.
//
// Devuelve UN SOLO registro, nunca la suma de los cortes: en cada corte se
// vuelve a anotar cuánto hay pendiente EN ESE MOMENTO, así que sumar 8 AM + 12
// PM + 5 PM contaría tres veces el mismo pedido. Se toma el corte más reciente
// que tenga el dato cargado, que es el que dice cómo está la tienda ahora.
//
// Se busca campo por campo y no "el último corte cargado" entero, porque un
// corte puede estar a medio llenar: si a las 5 PM ya anotaron novedades pero
// todavía no el pendiente de Dropi, el pendiente sigue saliendo del de 12 PM en
// vez de contarse como cero.
//   secciones: se prueban en orden — el corte de 5 PM guarda las novedades bajo
//   'novedades5pm' y los otros dos bajo 'novedades'.
function _admConsoHoy(consolidado, dia, secciones, campo){
  const delDia = (consolidado||{})[dia];
  if(!delDia) return null;
  for(let i=_ADM_CORTES.length-1; i>=0; i--){
    const corte = delDia[_ADM_CORTES[i]];
    if(!corte) continue;
    for(const sec of secciones){
      const v = (corte[sec]||{})[campo];
      if(typeof v === 'number') return {valor:v, corte:i};
    }
  }
  return null;   // la tienda todavía no cargó ese dato hoy
}
let _admTarjetasTick = null;
let _admTarjetasIds = [];
// Gestiones de HOY por clave de asesor, para las tarjetas de En Vivo.
// Clave = _gdKey(nombre), igual que el nodo de gestiones_diarias.
let _admGDHoy = {};
// El tab En Vivo es el único que muestra estas tarjetas y las de asesores: si
// está oculto no hay nada que pintar, y refrescarlo sería gastar lecturas de
// Firebase para nadie.
function _admEnliveVisible(){
  const panel=document.getElementById('admin-panel');
  if(!panel || !panel.classList.contains('visible')) return false;
  const tab=document.getElementById('adm-tab-enlive');
  return !!tab && tab.style.display!=='none';
}
function _admCargarTarjetas(empresaIds){
  const ids=(empresaIds||[]).filter(x=>x&&x!=='__todas__');
  _admTarjetasIds = ids;   // para poder refrescar al volver al tab
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  if(!ids.length){ ['adm-stat-pendconf','adm-stat-novedad'].forEach(i=>set(i,'—')); return; }

  // Una sola lectura del mes por tienda alimenta las tres tarjetas y el desglose
  // por asesor de En Vivo (_admGDHoy).
  const hoy=new Date();
  const mes=hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0');
  const dia=String(hoy.getDate());
  Promise.all(ids.map(id=>_db.ref('gestiones_diarias/'+id+'/'+mes).once('value')))
    .then(snaps=>{
      let conf=0,soluc=0,carri=0,wpp=0,cancel=0;
      let pend=0, nov=0, reportaron=0, corteMasNuevo=-1;
      const porAsesor={};
      snaps.forEach(s=>{
        const mesData = s.val()||{};
        // 1. Pendientes y novedades: UN registro por tienda (ver _admConsoHoy).
        const p = _admConsoHoy(mesData.consolidado, dia, ['confDropi'], 'pendConfirmacion');
        const n = _admConsoHoy(mesData.consolidado, dia, ['novedades5pm','novedades'], 'novedadesPend');
        if(p || n){
          reportaron++;
          pend += (p ? p.valor : 0);
          nov  += (n ? n.valor : 0);
          // El corte que se muestra es el más atrasado entre las tiendas: decir
          // "12 PM" cuando una todavía va por el de 8 AM haría leer el total
          // como más fresco de lo que es.
          [p,n].forEach(x=>{ if(x && (corteMasNuevo<0 || x.corte<corteMasNuevo)) corteMasNuevo=x.corte; });
        }
        // 2. Resumen del día: un nivel por asesor, y de cada uno solo hoy.
        Object.entries(mesData).forEach(([ak,nodo])=>{
          if(_GD_NO_ASESOR.has(ak)) return;   // 'consolidado' y 'notasHist' no son personas
          const d=((nodo||{}).dias||{})[dia]; if(!d) return;
          conf+=d.conf||0; soluc+=d.soluc||0; carri+=d.recupCarri||0;
          wpp+=d.ventasWpp||0; cancel+=d.cancel||0;
          // Un asesor puede trabajar en varias tiendas del admin: se acumula.
          const a=porAsesor[ak]||(porAsesor[ak]={conf:0,soluc:0,devuelt:0,carri:0,noRecup:0,wpp:0,cancel:0,total:0});
          a.conf+=d.conf||0; a.soluc+=d.soluc||0; a.devuelt+=d.devuelt||0;
          a.carri+=d.recupCarri||0; a.noRecup+=d.contNoRecup||0;
          a.wpp+=d.ventasWpp||0; a.cancel+=d.cancel||0;
        });
      });
      // Total de gestiones del día, misma fórmula que _gdCalc y el consolidado.
      Object.values(porAsesor).forEach(a=>{
        a.total=a.conf+a.cancel+a.soluc+a.devuelt+a.carri+a.noRecup+a.wpp;
      });
      _admGDHoy=porAsesor;
      set('adm-res-conf',conf); set('adm-res-soluc',soluc); set('adm-res-carri',carri);
      set('adm-res-wpp',wpp); set('adm-res-cancel',cancel);
      set('adm-stat-pendconf', reportaron?pend:'—');
      set('adm-stat-novedad',  reportaron?nov:'—');
      // Con qué corte y cuántas tiendas se armó el número: un total al que le
      // faltan tiendas por cargar se lee como "hay poco pendiente" cuando lo que
      // pasa es que todavía no reportaron.
      const lbl=document.getElementById('adm-stat-pendconf-sub');
      if(lbl){
        lbl.textContent = reportaron
          ? (_ADM_CORTE_LBL[corteMasNuevo]||'Consolidado')+' · '+reportaron+' de '+ids.length+' tienda'+(ids.length!==1?'s':'')
          : 'Sin consolidado cargado hoy';
      }
      // Los datos llegaron después del primer render de las tarjetas.
      _admRepintarPresencia();
    })
    .catch(()=>{ ['adm-stat-pendconf','adm-stat-novedad'].forEach(i=>set(i,'—')); });

  // Refresco periódico: estos números los mueven los asesores mientras trabajan,
  // y no hay listener sobre esas rutas (serían lecturas de todo el mes).
  if(_admTarjetasTick) clearInterval(_admTarjetasTick);
  _admTarjetasTick = setInterval(()=>{
    if(_admEnliveVisible()) _admCargarTarjetas(ids);
  }, 60000);
}

function _admRepintarPresencia(){
  const uids = _admAsesorUidsCache;
  if(!uids) return;
  if(!_admEnliveVisible()) return;   // no gastar render si el tab no se ve
  const usrs = _admUsuariosCache.filter(u=>uids.includes(u.uid));
  // Solo las tarjetas de asesor: las del command bar ya no salen de presence.
  _buildEnliveCards(usrs, _admPresenciaCache);
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
  _admCargarTarjetas([]);   // deja las tarjetas en "—"
  ['adm-res-conf','adm-res-soluc','adm-res-carri','adm-res-wpp','adm-res-cancel']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent='0'; });
}

function _admCargarDashboardLegacy(){
  if(_admPresenceListener){ _db.ref('presence').off('value', _admPresenceListener); _admPresenceListener = null; }
  function _procesarDatos(presencia, usuariosTodos){
    _admPresenciaCache = presencia;
    // Solo asesores, igual que en el camino normal: el tablero mide operación.
    const usuarios = (usuariosTodos||[]).filter(u=>u && u.rol!=='dueno');
    // Legacy: fallback user no aplica con Firebase Auth
    _admUsuariosCache = usuarios;
    // Camino legacy (admin sin admin_empresas): no hay tienda con la que
    // resolver las tarjetas del command bar, así que solo se pintan los asesores.
    usuarios.sort((a,b)=>{
      const ao=_estaOnline(presencia[a.uid]);
      const bo=_estaOnline(presencia[b.uid]);
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
    const isOnline=_estaOnline(p);
    if(isOnline) on.push({u,p}); else off.push({u,p});
  });
  if(!on.length) grid.innerHTML='<div class="adm-empty" style="grid-column:1/-1;border:1px dashed #d6d2cc;border-radius:10px;">Ningún asesor conectado en este momento</div>';
  on.forEach(({u,p})=>grid.appendChild(_mkEnliveCard(u,p,true)));
  if(off.length){ offSec.style.display='block'; off.forEach(({u,p})=>offGrid.appendChild(_mkEnliveCard(u,p,false))); }
  else offSec.style.display='none';
}

function _mkEnliveCard(u, p, isOnline){
  // users/{uid}.asesor manda: es lo que edita el admin. presence.asesor lo
  // reescribe el propio navegador del asesor en cada navegación, con el nombre
  // que tenga guardado en su localStorage — por eso un cambio de nombre parecía
  // no aplicarse nunca. presence queda solo como respaldo.
  const name=u.asesor||p.asesor||u.email||u.uid;
  const tienda=isOnline&&p.tienda?p.tienda:(u.tienda||'—');
  const color=_avatarColor(name);
  const initials=_avatarInitials(name);
  // Trabajo del día desde Gestiones Diarias, que es lo que el equipo carga.
  // Antes la tarjeta salía de presence (solo se escribe al gestionar en el
  // kanban de Gestión Logística), así que a quien trabaja en Gestiones Diarias
  // le aparecía todo en cero aunque llevara el día entero trabajando.
  // El nodo de gestiones puede estar bajo el uid (clave nueva) o bajo el slug
  // del nombre (lo anterior a la migración): se suman las dos, porque un asesor
  // puede tener parte del mes en cada una hasta que se corra _migrarAsesoresAUid.
  const keyDe=typeof _gdKey==='function'?_gdKey:_gdKeyFallback;
  const gNuevo=(_admGDHoy||{})[u.uid]||{};
  const gViejo=(_admGDHoy||{})[keyDe(u.asesor||p.asesor||'')]||{};
  const g={};
  ['conf','soluc','devuelt','carri','noRecup','wpp','cancel','total'].forEach(k=>{
    g[k]=(gNuevo[k]||0)+(u.uid!==keyDe(u.asesor||p.asesor||'')?(gViejo[k]||0):0);
  });
  const gConf=g.conf||0, gSoluc=g.soluc||0, gCarri=g.carri||0, gWpp=g.wpp||0, gCancel=g.cancel||0;
  // Avance sobre el kanban de Gestión Logística: cuántos pedidos del Excel le
  // faltan y cuántos cerró. Vienen de presence, que los actualiza en vivo.
  const kTotal=p.totalPedidos||0, kFin=p.finalizados||0;
  const kPend=Math.max(0,kTotal-kFin);
  // Score = avance, terminadas sobre el total asignado. Sin Excel cargado no hay
  // denominador y se muestra "—" en vez de un 0% que parecería mal desempeño.
  // La fórmula anterior (fin*5 + tasaCierre − devoluciones*4 + ritmo/minuto) no
  // tenía tope, sumaba cantidades con porcentajes y premiaba cerrar rápido.
  const hayAvance=kTotal>0;
  const score=hayAvance?Math.min(100,Math.round(kFin/kTotal*100)):0;
  const scoreColor=!hayAvance?'var(--text-3)':score>=70?'#4ade80':score>=40?'#fbbf24':'#f87171';
  const tiempoActivo=isOnline&&p.loginTime?_fmtDuracion(Date.now()-p.loginTime):null;
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
      // Foto de perfil si la subió; si no, las iniciales de siempre.
      (window._fotoDe&&window._fotoDe(u.uid)
        ? '<div class="enlive-avatar" style="background-image:url('+window._fotoDe(u.uid)+');background-size:cover;background-position:center;"></div>'
        : '<div class="enlive-avatar" style="background:'+color+'">'+initials+'</div>')+
      '<div style="flex:1;min-width:0;">'+
        '<div class="enlive-name">'+name+'</div>'+
        '<div class="enlive-tienda">🏪 '+tienda+'</div>'+
      '</div>'+
      '<div class="enlive-status">'+
        (isOnline
          ? '<div class="enlive-online-pill"><span class="adm-live-dot"></span>EN VIVO</div>'
          : '<div class="enlive-offline-pill">Offline</div>')+
        (tiempoActivo?'<div class="enlive-time">'+tiempoActivo+'</div>':(p.lastSeen?'<div class="enlive-time">'+_fmtTiempo(p.lastSeen)+'</div>':''))+
        (isOnline?'<div class="enlive-score" style="color:'+scoreColor+'" title="Avance: pedidos terminados sobre el total asignado en Gestión Logística">'+(hayAvance?score+'%':'—')+'</div><div class="enlive-score-lbl">avance</div>':'')+
      '</div>'+
    '</div>'+
    (isOnline
      ? '<div class="enlive-linea"><span class="enlive-linea-lbl">Tiempo de actividad</span>'+
          '<b class="enlive-linea-val">'+(tiempoActivo||'—')+'</b></div>'+
        // Pendientes vs terminadas del kanban. Sin Excel cargado no hay nada que
        // repartir, así que se avisa en vez de mostrar dos ceros.
        '<div class="enlive-linea"><span class="enlive-linea-lbl">Gestiones</span>'+
          (kTotal>0
            ? '<span class="enlive-linea-val"><b style="color:#fbbf24">'+kPend+'</b>'+
              '<span class="enlive-linea-sep">pend.</span>'+
              '<b style="color:#4ade80">'+kFin+'</b>'+
              '<span class="enlive-linea-sep">term.</span></span>'
            : '<span class="enlive-linea-val" style="color:var(--text-3);font-weight:600;font-size:.66rem;">Sin Excel cargado</span>')+
        '</div>'+
        '<div class="enlive-gd">'+
          '<div class="enlive-gd-cab">Hoy</div>'+
          '<div class="enlive-gd-row"><span>Órdenes confirmadas</span><b style="color:#4ade80">'+gConf+'</b></div>'+
          '<div class="enlive-gd-row"><span>Novedades solucionadas</span><b style="color:#60a5fa">'+gSoluc+'</b></div>'+
          '<div class="enlive-gd-row"><span>Carritos recuperados</span><b style="color:#a78bfa">'+gCarri+'</b></div>'+
          '<div class="enlive-gd-row"><span>Ventas WPP a Dropi</span><b style="color:#fb923c">'+gWpp+'</b></div>'+
          '<div class="enlive-gd-row"><span>Órdenes canceladas</span><b style="color:#f87171">'+gCancel+'</b></div>'+
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
    // Una entrada POR PERSONA, con la lista de sus tiendas. Antes se generaba
    // una por cada par (usuario × tienda), así que alguien con 3 tiendas salía
    // 3 veces con el mismo correo y parecían cuentas distintas.
    const porUid = new Map();
    empresasIds.forEach(empId=>{
      const emp = empresas[empId]; if(!emp) return;
      Object.keys(empresaAsesores[empId]||{}).forEach(uid=>{
        const u = users[uid]||{};
        if(!porUid.has(uid)){
          porUid.set(uid, { uid, asesor:u.asesor||u.email||uid, email:u.email||'',
                            rol:u.rol||'asesor', tiendaTexto:u.tienda||'',
                            tiendaIds:[], tiendaNombres:[] });
        }
        const e = porUid.get(uid);
        if(!e.tiendaIds.includes(empId)){ e.tiendaIds.push(empId); e.tiendaNombres.push(emp.nombre||empId); }
      });
    });
    const todos = [...porUid.values()];
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
    const ao=_estaOnline(pa);
    const bo=_estaOnline(pb);
    if(ao!==bo) return bo-ao;
    return (pb.lastSeen||0)-(pa.lastSeen||0);
  });
  list.innerHTML='';
  let visible=0;
  sorted.forEach(u=>{
    const p=presencia[u.uid]||{};
    const isOnline=_estaOnline(p);
    // Igual que en las tarjetas: manda users/{uid}.asesor, que es lo editable.
    const name=u.asesor||p.asesor||u.email||u.uid;
    // Los filtros y la búsqueda miran TODAS sus tiendas, no una sola.
    if(fTienda && !u.tiendaIds.includes(fTienda)) return;
    if(fRol && u.rol!==fRol) return;
    if(fEstado==='online'&&!isOnline) return;
    if(fEstado==='offline'&&isOnline) return;
    const tiendasTxt=u.tiendaNombres.join(', ');
    if(q&&!name.toLowerCase().includes(q)&&!u.email.toLowerCase().includes(q)&&!tiendasTxt.toLowerCase().includes(q)) return;
    visible++;
    const tiempoActivo=isOnline&&p.loginTime?_fmtDuracion(Date.now()-p.loginTime):null;
    const cont=p.contestaron||0,noCont=p.noContestaron||0,wa=p.waEnviados||0,fin=p.finalizados||0;
    // Sin el "Sin gestiones": ocupaba una línea para decir que no hay nada.
    const chips=[
      cont?'<span style="background:#1e40af15;color:#60a5fa;border-radius:5px;padding:1px 7px;font-size:.6rem;font-weight:700;">✅ '+cont+'</span>':'',
      noCont?'<span style="background:#7f1d1d15;color:#f87171;border-radius:5px;padding:1px 7px;font-size:.6rem;font-weight:700;">❌ '+noCont+'</span>':'',
      wa?'<span style="background:#4c1d9515;color:#a78bfa;border-radius:5px;padding:1px 7px;font-size:.6rem;font-weight:700;">📱 '+wa+'</span>':'',
      fin?'<span style="background:#14532d15;color:#4ade80;border-radius:5px;padding:1px 7px;font-size:.6rem;font-weight:700;">🏁 '+fin+'</span>':''
    ].filter(Boolean).join('');
    const statsHtml=(isOnline&&chips)
      ?'<div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap;">'+chips+'</div>':'';
    // Solo la tienda donde está trabajando ahora. Listar también las otras
    // asignadas era ruido: lo que importa es dónde está, no dónde podría estar.
    // Desconectado se muestra la última donde estuvo, atenuada — presence.tienda
    // no se borra al cerrar sesión, así que el dato sigue disponible.
    const activa=p.tienda||'';
    const tiendasHtml=isOnline&&activa
      ? '<b style="color:#10b981;font-weight:800;">'+esc(activa)+'</b>'
      : '<span style="opacity:.6;">'+esc(activa||u.tiendaTexto||'—')+'</span>';
    const safeU=u.uid.replace(/'/g,"\\'");
    const safeEmail=u.email.replace(/'/g,"\\'");
    const safeA=u.asesor.replace(/'/g,"\\'");
    // El modal de edición resuelve las tiendas con checkboxes desde
    // user_tiendas; este campo es el texto legacy de users/{uid}.tienda.
    const safeT=(u.tiendaTexto||u.tiendaNombres[0]||'').replace(/'/g,"\\'");
    const row=document.createElement('div');
    row.className='adm-user-row'+(isOnline?' online':'');
    row.innerHTML=
      '<div class="adm-online-dot'+(isOnline?' on':'')+'"></div>'+
      '<div class="adm-user-row-info" style="flex:1;">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'+
          '<div>'+
            '<div class="adm-user-row-name">'+name+(u.email&&name!==u.email?'<span style="color:var(--text-3);font-size:.65rem;font-weight:400;margin-left:6px;">'+u.email+'</span>':'')+'</div>'+
            '<div class="adm-user-row-meta">🏪 '+tiendasHtml+' · '+(u.rol==='dueno'?'<span style="color:#7c3aed;font-weight:700;">👑 Dueño</span>':'<span style="color:var(--info);font-weight:700;">👤 Asesor</span>')+'</div>'+
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
        // El nombre sale del día MÁS RECIENTE, no del primero: si a la persona
        // le cambian el nombre, la rama sigue siendo su uid (que no cambia) y
        // acá se mostraría el nombre viejo para siempre.
        const fechas = Object.keys(data[asesorKey]).sort();
        const nombre = data[asesorKey][fechas[fechas.length-1]]?.asesorNombre || asesorKey;
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
    fechas.push(_hoyLocal());
  } else if(period==='yesterday'){
    const d=new Date(); d.setDate(d.getDate()-1); fechas.push(_hoyLocal(d));
  } else if(period==='custom'){
    const from = document.getElementById('anl-date-from').value;
    const to   = document.getElementById('anl-date-to').value;
    if(!from||!to) return [];
    const cur = new Date(from);
    const end = new Date(to);
    while(cur<=end){ fechas.push(_hoyLocal(cur)); cur.setDate(cur.getDate()+1); }
  } else {
    const dias = parseInt(period);
    for(let i=dias-1;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); fechas.push(_hoyLocal(d)); }
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
  ['adm-new-user','adm-new-pass','adm-new-asesor'].forEach(id=>document.getElementById(id).value='');
  // El selector de tienda se llena con las empresas del admin. La empresa
  // elegida acá es la que define la pertenencia en los dos índices.
  const selT=document.getElementById('adm-new-tienda');
  if(selT){
    selT.innerHTML='<option value="" disabled selected>Selecciona la tienda…</option>';
    const adminId=localStorage.getItem('lgs_admin_id');
    const actual=localStorage.getItem('lgs_empresa_actual');
    if(adminId){
      Promise.all([
        _db.ref('admin_empresas/'+adminId).once('value'),
        _db.ref('empresas').once('value')
      ]).then(([snapAE,snapE])=>{
        const mias=Object.keys(snapAE.val()||{}), todas=snapE.val()||{};
        mias.forEach(empId=>{
          const e=todas[empId]; if(!e) return;
          const o=document.createElement('option');
          o.value=empId; o.textContent=e.nombre||empId;
          // Preselecciona la tienda que se está viendo, salvo "todas".
          if(empId===actual) o.selected=true;
          selT.appendChild(o);
        });
      });
    }
  }
  // Sin rol preseleccionado: el default en 'asesor' hizo que se crearan dueños
  // marcados como asesores, y el rol no se puede corregir después desde el panel.
  document.getElementById('adm-new-rol').value='';
  document.getElementById('adm-add-error').style.display='none';
  document.getElementById('adm-add-modal').classList.add('open');
}
function _admCerrarAgregar(){ document.getElementById('adm-add-modal').classList.remove('open'); }

function _admGuardarUsuario(){
  const email=document.getElementById('adm-new-user').value.trim();
  const p=document.getElementById('adm-new-pass').value.trim();
  const a=document.getElementById('adm-new-asesor').value.trim();
  const selT=document.getElementById('adm-new-tienda');
  const empresaId=selT?selT.value:'';                       // ahora es el empresaId, no texto libre
  const t=(selT&&selT.selectedIndex>=0)?(selT.options[selT.selectedIndex].textContent||'').trim():'';
  const rol=document.getElementById('adm-new-rol').value;
  const err=document.getElementById('adm-add-error');
  err.style.display='none';
  if(!email||!p){ err.textContent='Correo y contraseña son obligatorios'; err.style.display='block'; return; }
  if(!email.includes('@')){ err.textContent='Ingresa un correo válido'; err.style.display='block'; return; }
  if(!a){ err.textContent='El nombre completo es obligatorio'; err.style.display='block'; return; }
  if(!empresaId||empresaId==='__todas__'){ err.textContent='Elige la tienda a la que pertenece'; err.style.display='block'; return; }
  // El rol define permisos (notas del coordinador, Control Financiero) y hoy no
  // se puede corregir desde el panel: hay que elegirlo a conciencia al crear.
  if(rol!=='asesor'&&rol!=='dueno'){ err.textContent='Elige si es Asesor o Dueño de tienda'; err.style.display='block'; return; }
  const secAuth=window._fbSecAuth;
  if(!secAuth){ err.textContent='Error interno. Recarga la página.'; err.style.display='block'; return; }
  secAuth.createUserWithEmailAndPassword(email, p)
    .then(cred=>{
      const uid=cred.user.uid;
      secAuth.signOut();
      // Los tres nodos en un update atómico. Antes solo se escribía
      // empresa_asesores (y con la empresa del selector del encabezado, que
      // puede ser "__todas__"): sin user_tiendas el asesor entraba SIN
      // empresaId, así que sus datos caían en las rutas viejas por nombre de
      // tienda y el panel no lo mostraba. Los dos índices se escriben juntos o
      // no se escribe ninguno.
      return _db.ref().update({
        ['users/'+uid]: {email, username:email, asesor:a, tienda:t, rol, empresaId, createdAt:Date.now()},
        ['empresa_asesores/'+empresaId+'/'+uid]: true,
        ['user_tiendas/'+uid+'/'+empresaId]: true
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
  // El color se fija acá y no solo en el HTML: la misma caja la usa el aviso de
  // restablecimiento, que la deja en verde.
  if(!asesor){ err.textContent='El nombre es obligatorio'; err.style.color='var(--danger-strong)'; err.style.display='block'; return; }
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

// El correo SÍ sale, pero Gmail lo manda a spam: lo envía Firebase desde
// noreply@gestion-logistica-86fd7.firebaseapp.com, un remitente sin reputación.
// Se dio por perdido varias veces creyendo que el botón no funcionaba.
//
// El aviso no puede ser un toast que se va en dos segundos: el dato importante
// es DÓNDE buscarlo, así que queda fijo en el modal hasta cerrarlo.
//
// Además "enviado" acá no significa "entregado" ni siquiera "la cuenta existe":
// el proyecto tiene la protección contra enumeración de correos, así que
// sendPasswordResetEmail responde OK siempre y el .catch casi nunca se dispara.
const _RESET_REMITENTE = 'noreply@gestion-logistica-86fd7.firebaseapp.com';

function _admEnviarResetPass(){
  const email=(document.getElementById('adm-edit-user').value||'').trim();
  const caja=document.getElementById('adm-edit-error');
  const avisar=(html,color)=>{
    if(!caja){ toast(String(html).replace(/<[^>]+>/g,'')); return; }
    caja.style.display='block';
    caja.style.color=color;
    caja.innerHTML=html;
  };
  if(!email){ avisar('⚠️ Este usuario no tiene correo cargado.','var(--danger-strong)'); return; }
  avisar('⏳ Enviando…','var(--text-2)');
  firebase.auth().sendPasswordResetEmail(email)
    .then(()=>{
      avisar(
        '📧 Correo solicitado para <b>'+esc(email)+'</b>.<br>'+
        '<span style="color:var(--warning-strong);font-weight:700;">Suele llegar a SPAM.</span> '+
        'Buscalo como <b>'+esc(_RESET_REMITENTE)+'</b> y marcalo como correo deseado.',
        'var(--success-strong)');
      // Rastro de quién pidió el restablecimiento: es un cambio de credenciales
      // y hasta ahora no quedaba registrado en ningún lado.
      try{
        _db.ref('login_audit/'+_audKey(email)).push({
          username:email, resultado:'reset_solicitado', ts:Date.now(),
          fecha:new Date().toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}),
          ip:'—', ciudad:'—', region:'—', pais:'—', isp:'—',
          dispositivo:'—', navegador:'—', tz:'—',
          pedidoPor: localStorage.getItem('lgs_admin_user')||window._currentUsername||'admin'
        });
      }catch(_){}
    })
    .catch(e=>{ avisar('⚠️ Error: '+esc(e.message),'var(--danger-strong)'); });
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
    fechas.push(_hoyLocal());
  } else {
    const dias=parseInt(period);
    for(let i=dias-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);fechas.push(_hoyLocal(d));}
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
  _mConfirm('¿Quitar el acceso de este administrador?','Dejará de ver todas tus tiendas. Podés volver a darle acceso después.',()=>{
    const updates={};
    _admCoadminMisIds.forEach(empId=>{ updates['admin_empresas/'+uid+'/'+empId]=null; });
    _db.ref().update(updates).then(()=>{
      toast('↩️ Acceso removido');
      _admCargarCoadmins();
    }).catch(e=>toast('⚠️ Error: '+e.message));
  },'danger');
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
let _admRepMeta=[];
// Filtro "más de N días sin movimiento". 0 = sin filtro. Se recuerda entre
// sesiones porque el admin suele mirar siempre el mismo corte.
let _admRepMinDias = (()=>{ const v=parseInt(localStorage.getItem('lgs_rep_min_dias'),10); return isNaN(v)?0:v; })();

// Días desde una fecha dd/mm/aaaa (el formato con el que _fmtFecha guarda
// fechaMov). Vive acá y no se reusa diasDesde() porque esa está en
// gestion-logistica.js y el panel admin no carga ese archivo.
function _admDiasDesdeTexto(val){
  if(!val) return null;
  const s=String(val).trim(), p=s.split(/[\/\-\.]/);
  let d;
  if(p.length===3) d = p[0].length===4 ? new Date(p[0],p[1]-1,p[2]) : new Date(p[2],p[1]-1,p[0]);
  else d = new Date(s);
  if(!d || isNaN(d)) return null;
  const hoy=new Date(); hoy.setHours(0,0,0,0); d.setHours(0,0,0,0);
  return Math.max(0, Math.round((hoy-d)/86400000));
}

// Días sin movimiento de una guía del reporte: el valor guardado si está, y si
// no, el calculado desde la fecha. Devuelve null cuando no hay ninguno de los
// dos, para poder distinguir "0 días" de "no se sabe".
function _admDiasSinMov(g){
  if(g && g.diasSinMov!=null && g.diasSinMov!=='') return +g.diasSinMov;
  return _admDiasDesdeTexto(g && g.fechaMov);
}

// Aplica el filtro de días. Las guías SIN dato de movimiento se excluyen en
// cuanto se pide un mínimo: no se puede afirmar que lleven más de N días.
function _admRepFiltrar(filas){
  if(!_admRepMinDias) return filas;
  return filas.filter(f=>f._dias!=null && f._dias>_admRepMinDias);
}

window._admRepSetMinDias = function(v){
  const n=parseInt(v,10);
  _admRepMinDias = isNaN(n)||n<0 ? 0 : n;
  localStorage.setItem('lgs_rep_min_dias', String(_admRepMinDias));
  _admRepPintar();
};

function _admCargarReportes(){
  const adminId = localStorage.getItem('lgs_admin_id');
  const wrap = document.getElementById('adm-rep-tabla');
  const btn = document.getElementById('adm-rep-btn-descargar');
  const totalEl = document.getElementById('adm-rep-total');
  if(!adminId){ if(wrap) wrap.innerHTML='<div class="adm-empty">Sin sesión de administrador.</div>'; return; }
  // El filtro se recuerda entre sesiones: hay que reflejarlo en el input, que
  // en el HTML arranca en 0.
  const inpDias=document.getElementById('adm-rep-dias');
  if(inpDias) inpDias.value=_admRepMinDias;
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
        const dias=_admDiasSinMov(g);
        filas.push({
          'NUMERO DE GUIA': g.guia||'',
          'TRANSPORTADORA': g.transportadora||'',
          'ESTATUS': g.estatus||'',
          'FECHA ULT MOV': g.fechaMov||'',
          'DIAS SIN MOV': dias!=null?dias:'',
          'TIENDA': emp.nombre||empId,
          _grupo: g.grupo||'reportar',
          _dias: dias
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
    _admRepMeta  = porTienda;
    _admRepPintar();
  }).catch(()=>{
    if(wrap) wrap.innerHTML='<div class="adm-empty">Error cargando reportes.</div>';
  });
}

// Pinta el resumen del tab de Reportes aplicando el filtro de días sin
// movimiento. Va aparte de _admCargarReportes para poder repintar al cambiar el
// filtro sin volver a leer Firebase.
function _admRepPintar(){
  const wrap = document.getElementById('adm-rep-tabla');
  const btn = document.getElementById('adm-rep-btn-descargar');
  const totalEl = document.getElementById('adm-rep-total');
  const avisoEl = document.getElementById('adm-rep-aviso');
  const filas = _admRepFiltrar(_admRepDatos);
  // Los conteos por tienda se recalculan sobre lo FILTRADO: si no, la tabla
  // diría 40 guías y el Excel traería 6.
  const porNombre = {};
  filas.forEach(f=>{
    const t = f.TIENDA || '—';
    if(!porNombre[t]) porNombre[t] = {nombre:t, cant:0, cantRecomendar:0, cantReportar:0};
    porNombre[t].cant++;
    if(f._grupo==='recomendar') porNombre[t].cantRecomendar++; else porNombre[t].cantReportar++;
  });
  const porTienda = (_admRepMeta||[]).map(m=>{
    const c = porNombre[m.nombre] || {cant:0, cantRecomendar:0, cantReportar:0};
    return {nombre:m.nombre, actualizado:m.actualizado, cant:c.cant,
            cantRecomendar:c.cantRecomendar, cantReportar:c.cantReportar};
  });
  const tiendasConDatos = porTienda.filter(t=>t.cant>0).length;
  if(totalEl){
    const totRecomendar = filas.filter(f=>f._grupo==='recomendar').length;
    const totReportar = filas.length - totRecomendar;
    totalEl.textContent = filas.length+' guías de '+tiendasConDatos+' tienda'+(tiendasConDatos!==1?'s':'')+
      ' · 📢 '+totRecomendar+' para recomendar · 🚩 '+totReportar+' para reportar';
  }
  if(avisoEl){
    if(!_admRepMinDias){ avisoEl.textContent=''; }
    else {
      const sinDato = _admRepDatos.filter(f=>f._dias==null).length;
      avisoEl.textContent = 'Filtrando: más de '+_admRepMinDias+(_admRepMinDias===1?' día':' días')+
        ' sin movimiento · '+filas.length+' de '+_admRepDatos.length+' guías'+
        (sinDato?' · '+sinDato+' sin fecha de movimiento quedan fuera':'');
    }
  }
  if(btn) btn.disabled = filas.length===0;
  if(!wrap) return;
  if(!porTienda.length){
    wrap.innerHTML='<div class="adm-empty">No tienes tiendas registradas.</div>';
    return;
  }
  if(!filas.length){
    wrap.innerHTML='<div class="adm-empty">Ninguna guía supera '+_admRepMinDias+
      (_admRepMinDias===1?' día':' días')+' sin movimiento.</div>';
    return;
  }
  wrap.innerHTML=`<table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      <th style="text-align:left;padding:7px 10px;font-size:.65rem;font-weight:700;color:var(--text-2);border-bottom:1.5px solid var(--border);">Tienda</th>
      <th style="text-align:right;padding:7px 10px;font-size:.65rem;font-weight:700;color:var(--info-strong);border-bottom:1.5px solid var(--border);">📢 Recomendar</th>
      <th style="text-align:right;padding:7px 10px;font-size:.65rem;font-weight:700;color:var(--danger-strong);border-bottom:1.5px solid var(--border);">🚩 Reportar</th>
      <th style="text-align:right;padding:7px 10px;font-size:.65rem;font-weight:700;color:var(--text-2);border-bottom:1.5px solid var(--border);">Total</th>
      <th style="text-align:right;padding:7px 10px;font-size:.65rem;font-weight:700;color:var(--text-2);border-bottom:1.5px solid var(--border);">Última carga de Excel</th>
    </tr></thead>
    <tbody>${porTienda.map(t=>`<tr>
      <td style="padding:6px 10px;font-size:.73rem;color:var(--text-1);font-weight:600;border-bottom:1px solid var(--border);">${esc(t.nombre)}</td>
      <td style="padding:6px 10px;font-size:.73rem;text-align:right;color:${t.cantRecomendar>0?'var(--info-strong)':'var(--text-3)'};border-bottom:1px solid var(--border);">${t.cantRecomendar||'—'}</td>
      <td style="padding:6px 10px;font-size:.73rem;text-align:right;color:${t.cantReportar>0?'var(--danger-strong)':'var(--text-3)'};border-bottom:1px solid var(--border);">${t.cantReportar||'—'}</td>
      <td style="padding:6px 10px;font-size:.73rem;text-align:right;font-weight:700;color:${t.cant>0?'var(--text-1)':'var(--text-3)'};border-bottom:1px solid var(--border);">${t.cant||'—'}</td>
      <td style="padding:6px 10px;font-size:.68rem;text-align:right;color:var(--text-3);border-bottom:1px solid var(--border);">${esc(t.actualizado)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function _admDescargarReporteConsolidado(){
  // El Excel sale con lo MISMO que muestra la pantalla: si hay filtro de días
  // puesto, se descargan solo esas guías.
  const datos=_admRepFiltrar(_admRepDatos);
  if(!datos.length){
    toast(_admRepMinDias?('No hay guías con más de '+_admRepMinDias+' días sin movimiento'):'No hay guías para exportar');
    return;
  }
  toast('⏳ Generando Excel...');
  _cargarLib(_LIB_XLSX).then(()=>{
    const cols=['NUMERO DE GUIA','TRANSPORTADORA','ESTATUS','FECHA ULT MOV','DIAS SIN MOV','TIENDA'];
    // Del más estancado al menos, que es el orden en que se atienden.
    const ordenar=a=>a.slice().sort((x,y)=>(y._dias??-1)-(x._dias??-1));
    const recomendar=ordenar(datos.filter(f=>f._grupo==='recomendar'));
    const reportar=ordenar(datos.filter(f=>f._grupo!=='recomendar'));
    const wb = XLSX.utils.book_new();
    const agregarHoja=(filas,nombreHoja)=>{
      const ws = XLSX.utils.json_to_sheet(filas, {header:cols});
      ws['!cols']=[18,22,26,16,14,22].map(w=>({wch:w}));
      XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
    };
    agregarHoja(recomendar, 'Guías para recomendar');
    agregarHoja(reportar, 'Guías para reportar');
    const hoy = new Date().toLocaleDateString('es-CO').replace(/\//g,'-');
    // El nombre del archivo deja constancia del corte usado.
    const suf = _admRepMinDias ? '_mas_de_'+_admRepMinDias+'_dias' : '';
    XLSX.writeFile(wb, 'Reporte_Guias_Todas_Tiendas'+suf+'_'+hoy+'.xlsx');
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
            <button onclick="_admEntrarTienda('${empId}','${emp.nombre.replace(/'/g,"\\'")}')" style="background:#131920;color:white;border:none;border-radius:7px;padding:5px 12px;font-size:.7rem;font-weight:700;cursor:pointer;" title="Entra en solo lectura para revisar cómo trabaja el equipo. No quedás registrado como conectado ni podés modificar nada.">🛡️ Auditar tienda</button>
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

// Entrar a una tienda desde el Panel Admin es SIEMPRE auditar: se mira cómo
// trabaja el equipo, en solo lectura y sin dejar rastro (ver el bloque MODO
// AUDITORÍA arriba). Antes esto entraba como un asesor más de la tienda, con
// presencia registrada y permiso de escritura sobre datos ajenos.
window._admEntrarTienda = function(empId, empNombre){
  const adminId = localStorage.getItem('lgs_admin_id');
  const adminEmail = localStorage.getItem('lgs_admin_user')||'';
  if(!adminId) return;
  _db.ref('users/'+adminId).once('value', snapU=>{
    const u = snapU.val()||{};
    const nombreAsesor = u.asesor || adminEmail.split('@')[0] || 'Admin';
    window._currentRol = u.rol||'dueno';
    // El blindaje se instala ANTES de entrar: desde acá no hay recarga de
    // página (el panel admin y el mode-select viven los dos en index.html), así
    // que nadie más lo va a instalar por nosotros.
    _setAuditoria(true);
    _setAuditAsesor('','');   // la barra elige el primer asesor al cargar la lista
    _instalarBlindajeAuditoria();
    // Ocultar panel admin y entrar a la tienda
    document.getElementById('admin-panel').classList.remove('visible');
    _setCameFromAdmin(true);
    const btnV = document.getElementById('mss-btn-volver-admin');
    if(btnV) btnV.style.display = 'block';
    _entrarApp(adminId, empNombre, nombreAsesor, empId, true);
    _auditBarraRefrescar();
  });
};

window._volverAlAdmin = function(){
  const btnV = document.getElementById('mss-btn-volver-admin');
  if(btnV) btnV.style.display = 'none';
  // Salir de la tienda termina la auditoría: se apaga la bandera (con lo que el
  // blindaje de _db.ref deja de bloquear solo) y se olvida el asesor observado,
  // para que la próxima no arranque mirando al de la vez pasada.
  const eraAuditoria = _esAuditoria();
  _limpiarAuditoria();
  _auditBarraRefrescar();
  // El Panel Admin solo existe en index.html: desde un módulo hay que navegar.
  if(eraAuditoria && window._PAGINA_MODULO){
    localStorage.setItem('lgs_auth','admin');
    _setCameFromAdmin(false);
    irAPagina('/');
    return;
  }
  _ocultarTodosModos();
  document.getElementById('mode-select-screen').style.display = 'none';
  if(_getCameFromAdmin()){
    // Se entró viendo una empresa puntual desde el Panel Admin: volver ahí
    _setCameFromAdmin(false);
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

// ===== INTEGRACIONES — workspaces y API keys del bot =============
// Cada tienda que quiera recibir ventas del bot de ChateaPro necesita una
// entrada en bot_workspaces/{codigo}: el código identifica la tienda y la API
// key prueba que quien manda es su bot. Los dos hacen falta — el código viaja
// dentro del payload y no es un secreto.
//
// Este nodo es el más sensible de la app: quien lea una key puede registrar
// ventas falsas en esa tienda. Por eso las reglas lo dejan solo para admins
// (ver api-ventas-bot/reglas-firebase.json) y acá la clave se muestra tapada.
let _botwData = {};

// 48 hex desde el generador criptográfico del navegador. Math.random() no sirve
// para un secreto: es predecible si se conoce el estado del generador.
function _botwGenKey(){
  const a = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Código legible a partir del nombre de la tienda ("3D Company" → WS-3D-COMPANY),
// con sufijo si ya existe. Es lo que se pega en el flujo del bot, así que se
// prefiere algo reconocible antes que un identificador opaco.
function _botwGenCodigo(nombre){
  const base = 'WS-' + String(nombre||'tienda').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,20) || 'WS-TIENDA';
  if(!_botwData[base]) return base;
  let i=2; while(_botwData[base+'-'+i]) i++;
  return base+'-'+i;
}

async function _botwCargar(){
  const cont = document.getElementById('botw-list');
  if(!cont || typeof _db==='undefined') return;
  cont.innerHTML = '<div class="adm-empty">Cargando...</div>';
  const adminId = localStorage.getItem('lgs_admin_id');
  try{
    const [snapAE, snapEmp] = await Promise.all([
      _db.ref('admin_empresas/'+adminId).once('value'),
      _db.ref('empresas').once('value')
    ]);
    const misIds = Object.keys(snapAE.val()||{});
    const empresas = snapEmp.val()||{};
    // UNA CONSULTA POR EMPRESA, en vez del nodo entero. Antes esto era
    // _db.ref('bot_workspaces').once('value'): se descargaban los workspaces de
    // TODAS las tiendas y recién después _botwRender filtraba por misIds. O sea
    // que el filtro era visual — cualquier admin podía escribir _botwData en la
    // consola del navegador y leer las API keys de las demás tiendas, y con una
    // de esas keys se pueden inyectar ventas falsas en la tienda ajena.
    //
    // Las reglas ahora solo aceptan la lectura si viene filtrada por una empresa
    // propia (ver "bot_workspaces" en functions/reglas-firebase.json), así que
    // las claves ajenas ya no llegan al navegador. Es también la razón por la que
    // no se puede volver a leer el nodo de una sola vez: esa lectura da
    // permission_denied a propósito.
    const porEmpresa = await Promise.all(misIds.map(id =>
      _db.ref('bot_workspaces').orderByChild('empresaId').equalTo(id).once('value')
    ));
    _botwData = {};
    porEmpresa.forEach(s => Object.assign(_botwData, s.val()||{}));
    // El selector de tienda solo ofrece las del admin: un workspace apuntando a
    // una empresa ajena dejaría entrar ventas donde no corresponde.
    const sel = document.getElementById('botw-empresa');
    if(sel){
      sel.innerHTML = '<option value="">Elegí la tienda...</option>' +
        misIds.filter(id=>empresas[id]).map(id=>`<option value="${esc(id)}">${esc(empresas[id].nombre||id)}</option>`).join('');
    }
    _botwRender(empresas, misIds);
  }catch(e){
    cont.innerHTML = '<div class="adm-empty">No se pudo leer la configuración del bot: '+esc(e.message)+'</div>';
  }
}

function _botwRender(empresas, misIds){
  const cont = document.getElementById('botw-list');
  if(!cont) return;
  // Solo los workspaces de las tiendas de este admin.
  const filas = Object.entries(_botwData).filter(([,w])=>!misIds || misIds.indexOf(w.empresaId)>=0);
  if(!filas.length){
    cont.innerHTML = '<div class="adm-empty">Todavía no hay ninguna tienda conectada al bot.</div>';
    return;
  }
  cont.innerHTML = filas.map(([code,w])=>{
    const nom = (empresas && empresas[w.empresaId] && empresas[w.empresaId].nombre) || w.nombre || w.empresaId;
    const activo = w.activo !== false;
    return `<div class="botw-card">
      <div class="botw-card-top">
        <div>
          <div class="botw-code">${esc(code)}</div>
          <div class="botw-tienda">${esc(nom)}</div>
        </div>
        <span class="botw-estado ${activo?'on':'off'}">${activo?'Activo':'Revocado'}</span>
      </div>
      <div class="botw-key-row">
        <input type="password" readonly value="${esc(w.apiKey||'')}" id="botw-k-${esc(code)}" class="botw-key">
        <button onclick="_botwVer('${esc(code)}',this)" title="Mostrar u ocultar">👁</button>
        <button onclick="_botwCopiar('${esc(code)}')" title="Copiar">📋</button>
      </div>
      <div class="botw-acciones">
        <button onclick="_botwToggle('${esc(code)}')">${activo?'Revocar':'Reactivar'}</button>
        <button onclick="_botwRegenerar('${esc(code)}')">Generar clave nueva</button>
        <button onclick="_botwCambiarCodigo('${esc(code)}')">Cambiar código</button>
        <button onclick="_botwDocs('${esc(code)}',this,'ventas')">📄 Agente de ventas</button>
        <button onclick="_botwDocs('${esc(code)}',this,'carritos')">🛒 Agente de carritos</button>
        <button class="botw-del" onclick="_botwEliminar('${esc(code)}')">Eliminar integración</button>
      </div>
      <div class="botw-docs" id="botw-docs-${esc(code)}" style="display:none;"></div>
    </div>`;
  }).join('');
}

// URL base de las Cloud Functions. Sale del projectId con el que se inicializó
// Firebase y no de una constante escrita a mano: si algún día se cambia de
// proyecto, la documentación del panel sigue diciendo la verdad.
function _botwBaseUrl(){
  let pid = 'TU-PROYECTO';
  try{ pid = (firebase.app().options.projectId) || pid; }catch(e){}
  return 'https://us-central1-'+pid+'.cloudfunctions.net';
}

// Bloque de copiar-y-pegar para configurar el bot. Va con el workspace de ESTA
// tienda ya puesto: la fuente de error más común es pegar el ejemplo genérico
// del README y olvidarse de reemplazar el código.
//
// La clave NO se escribe en los ejemplos, ni siquiera en el header: quedaría a
// la vista de cualquiera que pase por detrás y en cualquier captura de pantalla.
// Se deja el marcador y el botón de copiar de arriba, que sí la entrega.
// `tipo` es 'ventas' o 'carritos'. Son dos agentes distintos en ChateaPro y cada
// uno tiene sus endpoints, así que se documentan por separado: un solo documento
// con todo obligaría a leer la mitad que no se está configurando.
//
// Los dos botones comparten el mismo contenedor, así que abrir uno cierra el otro.
// Se recuerda cuál está abierto en un data- para que volver a pulsar el mismo lo
// cierre y pulsar el otro lo cambie, en vez de tener que cerrar y abrir.
window._botwDocs = function(code, btn, tipo){
  tipo = tipo || 'ventas';
  const cont = document.getElementById('botw-docs-'+code);
  if(!cont) return;

  const fila = btn.parentElement;
  const restaurar = () => {
    [...fila.querySelectorAll('button')].forEach(b=>{
      if(b.dataset.txtOrig){ b.textContent = b.dataset.txtOrig; delete b.dataset.txtOrig; }
    });
  };
  // Mismo botón otra vez: se cierra.
  if(cont.style.display !== 'none' && cont.dataset.tipo === tipo){
    cont.style.display='none'; restaurar(); return;
  }
  restaurar();
  btn.dataset.txtOrig = btn.textContent;
  btn.textContent = '✕ Ocultar';
  cont.dataset.tipo = tipo;

  const base = _botwBaseUrl();
  const bloque = (titulo, texto, id) => `
    <div class="botw-doc-b">
      <div class="botw-doc-h"><span>${titulo}</span><button onclick="_botwCopiarTxt('${id}')">Copiar</button></div>
      <pre id="${id}">${esc(texto)}</pre>
    </div>`;

  if(tipo === 'carritos'){ cont.innerHTML = _botwDocsCarritos(code, base, bloque); cont.style.display='block'; return; }

  const body = JSON.stringify({
    workspace: code,
    tienda: (_botwData[code]||{}).nombre || '',
    fecha_compra: '2026-08-13',
    fecha_registro: '2026-08-13 09:12',
    nombre: 'Nombre del cliente',
    telefono: '3001112233',
    ciudad: 'Medellín',
    departamento: 'Antioquia',
    order: '2 CEPILLOS DE BAMBU',
    producto: 'CEPILLO BAMBU',
    cantidad: 2,
    valor: 89000,
    estado_orden: 'CONFIRMADO',
    id_anuncio: '120312345678'
  }, null, 2);

  cont.innerHTML = `
    <div class="botw-doc-intro">
      El bot hace <b>dos llamadas</b>: primero pregunta si el pedido ya está, y solo si no está lo registra.
      Así no se duplica cuando el cliente vuelve a escribir.
    </div>

    <div class="botw-doc-paso"><b>1</b> Consultar si el pedido ya existe</div>
    <div class="botw-doc-nota">Se puede de dos formas y dan lo mismo. <b>Conviene el POST</b>:
    se configura igual que el paso 2 —misma dirección de estilo, mismos encabezados, los datos en el
    cuerpo— así los dos pedidos del bot quedan iguales y no hay que armar una URL con variables.</div>
    ${bloque('POST · dirección', base+'/ventasExiste', 'botw-d1-'+code)}
    ${bloque('POST · cuerpo (body) en formato JSON',
      JSON.stringify({ workspace: code, telefono: '3001112233', fecha_compra: '2026-08-13' }, null, 2),
      'botw-d1b-'+code)}
    ${bloque('Alternativa · GET, con los datos en la dirección',
      base+'/ventasExiste?workspace='+code+'&telefono=3001112233&fecha_compra=2026-08-13',
      'botw-d1c-'+code)}
    <div class="botw-doc-nota">Los encabezados son los mismos del paso 2 (incluida la clave).
    Responde <code>{"existe": true}</code> o <code>{"existe": false}</code>.
    Si da <code>true</code>, el flujo termina ahí: ese pedido ya está registrado.
    En <i>Ruta JSON</i> usá <code>$.existe</code>.</div>

    <div class="botw-doc-paso"><b>2</b> Registrar la venta</div>
    ${bloque('POST · dirección', base+'/ventas', 'botw-d2-'+code)}
    ${bloque('Encabezados', 'Content-Type: application/json\nX-Api-Key: (la clave de arriba, botón 📋)', 'botw-d3-'+code)}
    ${bloque('Cuerpo (body) en formato JSON', body, 'botw-d4-'+code)}
    <div class="botw-doc-nota">En <i>Ruta JSON</i> usá <code>$.duplicado</code> para saber si el
    pedido ya estaba. <b>Ojo:</b> <code>$.existe</code> es del paso 1; esta respuesta no lo trae.</div>

    <div class="botw-doc-nota">
      <b>Qué es obligatorio:</b> <code>workspace</code>, <code>telefono</code> y <code>fecha_compra</code>.
      Esos tres identifican el pedido; el resto puede ir vacío y se completa después.<br>
      <b>valor</b> es el total de la orden, no el precio por unidad.<br>
      <b>fecha_compra</b> acepta <code>2026-08-13</code> o <code>13/08/2026</code>.<br>
      <b>order</b> es el pedido completo ("2 CEPILLOS DE BAMBU") y <b>producto</b> solo el nombre ("CEPILLO BAMBU").
    </div>

    <div class="botw-doc-paso"><b>3</b> Cambiar el estado más adelante <span class="botw-doc-op">(opcional)</span></div>
    <div class="botw-doc-nota">Para cuando el pedido se confirma o se cae <i>después</i> de haberlo
    registrado. Payload corto: no hace falta volver a mandar los datos del pedido.</div>
    ${bloque('POST · dirección', base+'/ventasEstado', 'botw-d5-'+code)}
    ${bloque('POST · cuerpo (body) en formato JSON',
      JSON.stringify({ workspace: code, telefono: '3001112233', fecha_compra: '2026-08-13', estado: 'CONFIRMADO' }, null, 2),
      'botw-d6-'+code)}
    <div class="botw-doc-nota">Encabezados iguales al paso 2. Si esa venta no está registrada
    responde <code>404</code> y no crea nada: primero hay que registrarla con el paso 2.</div>

    <div class="botw-doc-nota warn">
      Si el mismo pedido llega dos veces, <b>no se duplica</b> y responde <code>{"duplicado": true}</code>.
      <b>El registro NO cambia el estado de una venta que ya existe</b>: si el bot registra siempre en
      PENDIENTE, sus reintentos no van a pisar lo que un asesor haya gestionado. Para cambiar el estado
      está el paso 3. Siempre responde <code>200</code>, incluso cuando ya existía, para que el bot no
      lo reintente en vano.
    </div>`;
  cont.style.display='block';
};

// ── Documentación del AGENTE DE CARRITOS ─────────────────────────────────
// Dos payloads y una consulta. La diferencia clave con ventas está arriba del
// todo, porque es lo que más confunde al configurarlo: acá la identidad es
// telefono + id_carrito, y el id es obligatorio en los dos envíos.
function _botwDocsCarritos(code, base, bloque){
  // LOS DOS CUERPOS SON EL MISMO, y es a propósito. Antes cada uno copiaba los
  // títulos de su Excel —uno con NOMBRES/APELLIDOS y NOTA, el otro con "Nombre del
  // usuario" y Producto— y eso hacía creer que había que armar dos formatos
  // distintos. Los dos endpoints leen exactamente los mismos campos, así que la
  // documentación muestra un único formato y el de recuperación solo agrega los
  // dos que le son propios: la fecha y el estado.
  const campos = {
    workspace: code,
    id_carrito: '1344229114102',
    nombre: 'María Gómez Ruiz',
    telefono: '3001112233',
    direccion: 'Cra 45 #12-30, Laureles',
    ciudad: 'Medellín',
    departamento: 'Antioquia',
    producto: 'CEPILLO BAMBU',
    cantidad: 2,
    valor: '89000'
  };
  const completos = JSON.stringify(campos, null, 2);
  const recuperado = JSON.stringify(Object.assign({}, campos, {
    fecha: '2026-08-18',
    estado: ''
  }), null, 2);

  return `
    <div class="botw-doc-intro">
      Dos envíos distintos: uno para el carrito que ya tiene <b>todos los datos</b> y solo falta
      confirmar, y otro para avisar que el carrito <b>se recuperó</b>. Los dos llegan a la pestaña
      <b>🛒 Carritos Bot</b> de Gestiones Diarias.
    </div>

    <div class="botw-doc-nota warn">
      <b>Lo más importante:</b> acá el carrito se identifica por <code>telefono</code> +
      <code>id_carrito</code>, no por la fecha como en ventas. <b>El <code>id_carrito</code> es
      obligatorio en los dos envíos</b> — es el número que genera ChateaPro, por ejemplo
      <code>1344229114102</code>. Sin él responde <code>400</code> y no guarda nada.<br>
      Gracias a eso un mismo cliente puede tener <b>varios carritos abiertos</b> sin que se pisen.
    </div>

    <div class="botw-doc-paso"><b>1</b> Consultar si el carrito ya está <span class="botw-doc-op">(opcional)</span></div>
    ${bloque('POST · dirección', base+'/carritosExiste', 'botw-c1-'+code)}
    ${bloque('POST · cuerpo (body) en formato JSON',
      JSON.stringify({ workspace: code, telefono: '3001112233', id_carrito: '1344229114102' }, null, 2),
      'botw-c1b-'+code)}
    <div class="botw-doc-nota">Responde <code>{"existe": true}</code> o <code>false</code>.
    En <i>Ruta JSON</i> usá <code>$.existe</code>. No es obligatorio: los dos envíos de abajo ya
    evitan duplicar por su cuenta.</div>

    <div class="botw-doc-paso"><b>2</b> Carrito con los datos completos</div>
    <div class="botw-doc-nota">El que tiene todo listo y solo falta confirmar con el cliente.
    Entra con estado <b>DATOS COMPLETOS</b>.</div>
    ${bloque('POST · dirección', base+'/carritos', 'botw-c2-'+code)}
    ${bloque('Encabezados', 'Content-Type: application/json\nX-Api-Key: (la clave de arriba, botón 📋)', 'botw-c3-'+code)}
    ${bloque('Cuerpo (body) en formato JSON', completos, 'botw-c4-'+code)}
    <div class="botw-doc-nota"><b>Los dos envíos usan el MISMO cuerpo.</b> El de abajo solo agrega
    la fecha y el estado; el resto de los campos son idénticos, así que no hay que armar dos formatos.<br>
    <b>valor</b> es el total del carrito, no el precio por unidad.</div>
    <div class="botw-doc-nota">
      <b>Los nombres no distinguen mayúsculas y aceptan los títulos del Excel tal cual</b>, así que
      cualquiera de estas variantes vale y se puede mapear sin renombrar nada:<br>
      <code>nombre</code> · <code>NOMBRES</code>+<code>APELLIDOS</code> · <code>Nombre del usuario</code><br>
      <code>telefono</code> · <code>TELÉFONO</code> · <code>Numero de telefono</code><br>
      <code>direccion</code> · <code>DIRECCIÓN Y BARRIO</code><br>
      <code>producto</code> · <code>PRODUCTO</code> · <code>NOTA</code><br>
      <code>valor</code> · <code>PRECIO TOTAL (SIN PUNTOS NI COMAS)</code><br>
      <code>ciudad</code> · <code>departamento</code> · <code>cantidad</code>, escritos como sea.
    </div>

    <div class="botw-doc-paso"><b>3</b> El carrito se recuperó</div>
    <div class="botw-doc-nota">Si ese carrito ya estaba, se <b>actualiza</b> y pasa a
    <b>CARRITO RECUPERADO</b>. Si nunca se había visto, se registra directamente como recuperado.</div>
    ${bloque('POST · dirección', base+'/carritosRecuperado', 'botw-c5-'+code)}
    ${bloque('Cuerpo (body) en formato JSON', recuperado, 'botw-c6-'+code)}
    <div class="botw-doc-nota">Encabezados iguales al paso 2. Es el mismo cuerpo del paso 2 más
    <code>fecha</code> y <code>estado</code>.<br>
    Si mandás <code>estado</code> con algo, se usa ese; si va vacío, queda como
    <b>CARRITO RECUPERADO</b>. También vale escribirlo <code>ESTADO DE LA ORDEN</code>.
    En <i>Ruta JSON</i>, <code>$.duplicado</code> dice si el carrito ya existía y
    <code>$.estado</code> con cuál quedó.</div>

    <div class="botw-doc-nota">
      <b>Qué es obligatorio:</b> <code>workspace</code>, <code>telefono</code> e
      <code>id_carrito</code>. El resto puede ir vacío y se completa después.<br>
      <b>No hace falta mandar <code>tienda</code>:</b> la tienda se sabe por el workspace y la clave,
      así que ese campo no cambia nada.<br>
      <b>La fecha</b> solo la trae el envío de recuperación; en el de datos completos se usa la del
      momento en que llega.<br>
      <b>Al actualizar no se pierde nada:</b> los campos que no mandés se dejan como estaban, así que
      la dirección cargada en el paso 2 sigue ahí después del paso 3.
    </div>

    <div class="botw-doc-nota warn">
      Si el mismo carrito llega dos veces <b>no se duplica</b>: responde <code>{"duplicado": true}</code>
      y actualiza lo que haya cambiado. Y un carrito <b>no cambia de mes</b> aunque se recupere en el
      siguiente: se queda donde se registró.
    </div>`;
}

window._botwCopiarTxt = function(id){
  const el = document.getElementById(id);
  if(!el) return;
  navigator.clipboard.writeText(el.textContent)
    .then(()=>toast('📋 Copiado'))
    .catch(()=>toast('No se pudo copiar; seleccionalo y copialo a mano'));
};

window._botwVer = function(code, btn){
  const i = document.getElementById('botw-k-'+code);
  if(!i) return;
  const oculto = i.type === 'password';
  i.type = oculto ? 'text' : 'password';
  btn.textContent = oculto ? '🙈' : '👁';
};

window._botwCopiar = function(code){
  const i = document.getElementById('botw-k-'+code);
  if(!i) return;
  navigator.clipboard.writeText(i.value)
    .then(()=>toast('📋 Clave copiada — pegala en el bot y no la compartas'))
    .catch(()=>toast('No se pudo copiar; mostrá la clave y copiala a mano'));
};

// El código lo pone el usuario: tiene que ser el MISMO que el bot manda en el
// campo `workspace` del payload. En ChateaPro ese valor ya existe —es el id del
// workspace, un número como 230003— y usarlo evita tener que escribir a mano un
// código inventado en cada flujo del bot y mantener dos nomenclaturas en
// paralelo. Si se deja vacío se sugiere uno a partir del nombre de la tienda.
window._botwCrear = async function(){
  const sel = document.getElementById('botw-empresa');
  const inpCode = document.getElementById('botw-codigo');
  const empresaId = sel ? sel.value : '';
  if(!empresaId){ _mAlert('Falta la tienda','Elegí a qué tienda le vas a conectar el bot.'); return; }
  const nombre = sel.options[sel.selectedIndex].textContent;

  let code = _botwNormCode(inpCode ? inpCode.value : '');
  if(!code) code = _botwGenCodigo(nombre);
  if(_botwData[code]){
    _mAlert('Ese código ya está en uso','El código "'+code+'" ya está conectado a otra tienda. Usá uno distinto.');
    return;
  }
  if(Object.values(_botwData).some(w=>w.empresaId===empresaId && w.activo!==false)){
    if(!await _mConfirmP('Esa tienda ya está conectada',
      'Ya tiene un workspace activo. Si creás otro, los dos van a poder registrar ventas en la misma tienda. ¿Seguís?')) return;
  }
  const w = { apiKey: _botwGenKey(), empresaId, nombre, activo: true, creado: Date.now() };
  try{
    await _db.ref('bot_workspaces/'+code).set(w);
    _botwData[code] = w;
    if(inpCode) inpCode.value='';
    await _botwCargar();
    toast('✓ Workspace '+code+' creado — copiá la clave y pegala en ChateaPro', 5000);
  }catch(e){ _mAlert('No se pudo crear', e.message); }
};

// Firebase no admite . # $ [ ] / en las claves, y un espacio de más rompería la
// comparación contra lo que manda el bot. Se conservan mayúsculas y minúsculas
// tal como se escriban: el endpoint compara el código exacto.
function _botwNormCode(v){
  return String(v||'').trim().replace(/\s+/g,'-').replace(/[.#$[\]/]/g,'-');
}

// Cambiar el código de un workspace ya creado. Firebase no permite renombrar una
// clave, así que se escribe el nodo nuevo y se borra el viejo — conservando la
// misma API key, para no tener que volver a configurarla en el bot.
window._botwCambiarCodigo = async function(code){
  const w = _botwData[code]; if(!w) return;
  const nuevo = _botwNormCode(await _botwPedirTexto(
    'Código del workspace',
    'Tiene que ser el mismo valor que el bot manda en el campo "workspace". En ChateaPro es el id del workspace, un número como 230003.',
    code));
  if(!nuevo || nuevo === code) return;
  if(_botwData[nuevo]){ _mAlert('Ese código ya está en uso','El código "'+nuevo+'" ya está conectado a otra tienda.'); return; }
  try{
    await _db.ref('bot_workspaces/'+nuevo).set(w);
    await _db.ref('bot_workspaces/'+code).remove();
    delete _botwData[code]; _botwData[nuevo] = w;
    await _botwCargar();
    toast('✓ Ahora el código es '+nuevo+' — la clave sigue siendo la misma', 5000);
  }catch(e){ _mAlert('No se pudo cambiar', e.message); }
};

// Pedir un texto con el mismo estilo que el resto de los modales, en vez del
// prompt() del navegador, que rompe la estética y algunos navegadores bloquean.
function _botwPedirTexto(titulo, msg, valor){
  return new Promise(resolve=>{
    const bg = document.createElement('div');
    bg.className = 'adm-modal-bg visible';
    bg.innerHTML = `<div class="adm-modal" style="max-width:420px;">
      <h3>${esc(titulo)}</h3>
      <p style="font-size:.76rem;color:var(--text-2);line-height:1.5;margin:0 0 12px;">${esc(msg)}</p>
      <div class="adm-field"><input type="text" id="botw-prompt-inp" value="${esc(valor||'')}" autocomplete="off"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="adm-btn-sec" id="botw-prompt-no">Cancelar</button>
        <button class="adm-btn" id="botw-prompt-si">Guardar</button>
      </div>
    </div>`;
    document.body.appendChild(bg);
    const inp = bg.querySelector('#botw-prompt-inp');
    inp.focus(); inp.select();
    const cerrar = v => { bg.remove(); resolve(v); };
    bg.querySelector('#botw-prompt-no').onclick = ()=>cerrar('');
    bg.querySelector('#botw-prompt-si').onclick = ()=>cerrar(inp.value);
    inp.onkeydown = e => { if(e.key==='Enter') cerrar(inp.value); if(e.key==='Escape') cerrar(''); };
  });
}

// Revocar no borra: el historial de ventas ya registradas se conserva y la
// tienda puede volver a activarse sin rehacer la configuración del bot.
window._botwToggle = async function(code){
  const w = _botwData[code]; if(!w) return;
  const activo = w.activo !== false;
  if(activo && !await _mConfirmP('¿Revocar el acceso?',
    'El bot va a dejar de poder registrar ventas en esta tienda hasta que lo reactivés. Las ventas ya guardadas no se tocan.','danger')) return;
  await _db.ref('bot_workspaces/'+code+'/activo').set(!activo);
  _botwData[code].activo = !activo;
  await _botwCargar();
  toast(activo ? 'Acceso revocado' : 'Acceso reactivado');
};

// Borra la conexión con el bot. NO toca las ventas ya registradas: viven en
// ventas_bot/{empresaId}, que no depende de este nodo. Se avisa explícitamente
// porque lo natural es suponer lo contrario, y también se ofrece "Revocar", que
// corta el acceso sin perder la configuración.
window._botwEliminar = async function(code){
  const w = _botwData[code]; if(!w) return;
  if(!await _mConfirmP('¿Eliminar la integración?',
    'Se borra el código "'+code+'" y su clave. El bot va a dejar de poder registrar ventas en esta tienda de inmediato, y para volver a conectarlo hay que crear la integración de nuevo y pegar una clave nueva en ChateaPro.\n\n' +
    'Las ventas ya registradas NO se borran: siguen en la pestaña Ventas Bot.\n\n' +
    'Si solo querés cortar el acceso un rato, usá "Revocar" en vez de esto.', 'danger')) return;
  try{
    await _db.ref('bot_workspaces/'+code).remove();
    delete _botwData[code];
    await _botwCargar();
    toast('Integración '+code+' eliminada — las ventas ya registradas se conservan', 5000);
  }catch(e){ _mAlert('No se pudo eliminar', e.message); }
};

window._botwRegenerar = async function(code){
  if(!await _mConfirmP('¿Generar una clave nueva?',
    'La clave actual deja de servir en el acto. El bot va a fallar hasta que pegues la nueva en ChateaPro.','danger')) return;
  const nueva = _botwGenKey();
  await _db.ref('bot_workspaces/'+code+'/apiKey').set(nueva);
  _botwData[code].apiKey = nueva;
  await _botwCargar();
  toast('Clave nueva generada — acordate de actualizarla en el bot', 5000);
};

// ===== MODALES UNIVERSALES =====
// Reemplazan a confirm()/alert() del navegador, que rompen la estética de la
// app (el cuadro gris del sistema con "redking-tulogistica.com dice") y además
// bloquean el hilo. Usar SIEMPRE estos, nunca los nativos.
let _mConfirmCallback = null, _mCancelCallback = null;
window._mConfirm = function(titulo, msg, cb, tipo, onCancel){
  _mConfirmCallback = cb; _mCancelCallback = onCancel||null;
  document.getElementById('modal-confirm-title').textContent = titulo;
  document.getElementById('modal-confirm-msg').textContent = msg;
  const btn = document.getElementById('modal-confirm-ok');
  const btnCancel = document.getElementById('modal-confirm-cancel');
  btn.style.background = tipo==='danger' ? '#dc2626' : '#1e293b';
  btn.textContent = tipo==='danger' ? 'Eliminar' : 'Confirmar';
  // 'aviso' = un solo botón, el equivalente de alert()
  if(btnCancel) btnCancel.style.display = tipo==='aviso' ? 'none' : '';
  if(tipo==='aviso') btn.textContent = 'Entendido';
  document.getElementById('modal-confirm').classList.add('open');
  // El foco arranca en Cancelar cuando la acción es destructiva, para que un
  // Enter de más no borre nada; en los avisos y confirmaciones normales va al
  // botón principal. Sin esto el teclado quedaba fuera del diálogo.
  setTimeout(()=>{ const f = (tipo==='danger' && btnCancel && btnCancel.style.display!=='none') ? btnCancel : btn; if(f) f.focus(); },30);
};
// Escape cancela y el clic en el fondo también, como en cualquier diálogo — y
// como hacía el confirm() del navegador. Se registra una sola vez.
if(!window._mConfirmKeysReady){
  window._mConfirmKeysReady = true;
  document.addEventListener('keydown', e=>{
    const m = document.getElementById('modal-confirm');
    if(!m || !m.classList.contains('open')) return;
    if(e.key==='Escape'){ e.preventDefault(); window._mConfirmCancel(); }
  });
  document.addEventListener('click', e=>{
    const m = document.getElementById('modal-confirm');
    if(!m || !m.classList.contains('open')) return;
    if(e.target===m) window._mConfirmCancel();   // solo el backdrop, no la tarjeta
  });
}
window._mConfirmOk = function(){
  document.getElementById('modal-confirm').classList.remove('open');
  _mCancelCallback = null;
  if(_mConfirmCallback){ _mConfirmCallback(); _mConfirmCallback=null; }
};
window._mConfirmCancel = function(){
  document.getElementById('modal-confirm').classList.remove('open');
  _mConfirmCallback = null;
  if(_mCancelCallback){ _mCancelCallback(); _mCancelCallback=null; }
};
// Versiones con Promise: dejan reemplazar confirm()/alert() sin dar vuelta la
// función que los llama —  if(!await _mConfirmP(...)) return;  se lee igual que
// el  if(!confirm(...)) return;  que había antes.
window._mConfirmP = function(titulo, msg, tipo){
  return new Promise(res=>_mConfirm(titulo, msg, ()=>res(true), tipo, ()=>res(false)));
};
window._mAlert = function(titulo, msg){
  return new Promise(res=>_mConfirm(titulo, msg, ()=>res(), 'aviso', ()=>res()));
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
  // Cada asesor se abre en la vista corta: dejar la ampliada pegada de la
  // persona anterior hace creer que el de ahora trabajó todos esos días.
  _malHistExpandido = false;
  _malCargarSesiones(username);
};

// ── Últimas sesiones del asesor ──────────────────────────────────────────
// Un INGRESO no es un registro de session_hist. Ahí se escribe una entrada por
// cada carga de página, y saltar de módulo a módulo es una carga completa
// (irAPagina → location.href), así que una sola jornada deja tres o cuatro
// registros solapados, de 0 y 1 minuto. Mostrarlos crudos daba una lista que no
// decía ni cuándo entró ni cuánto trabajó: en un caso real, 16 registros que en
// verdad eran 6 ingresos, y una jornada de 5h 46m partida en cuatro pedazos.
//
// Se unen los registros que se solapan o que arrancan a menos de 5 minutos del
// anterior: el ingreso queda con la hora del primero y la duración hasta el
// final del último. La tolerancia cubre el hueco entre que se cierra una página
// y termina de cargar la siguiente.
const _SES_UNIR_MS = 5*60000;
// Pura y aparte para poder probarla: recibe los registros crudos y devuelve los
// ingresos, del más viejo al más nuevo.
function _malAgruparSesiones(registros, ahora){
  const out = [];
  (registros||[])
    // typeof y no `r.start` a secas: un 0 es falsy y se colaría como registro
    // inválido cuando en realidad es un timestamp.
    .filter(r=>r && typeof r.start==='number')
    .sort((a,b)=>a.start-b.start)
    .forEach(r=>{
      // Sin `end` la sesión sigue viva: se mide hasta ahora. Ese caso es real,
      // no un dato roto — es justamente quien está trabajando en este momento.
      const abierta = !r.end;
      // Para AGRUPAR, una sesión sin cierre vale por su propio arranque y no
      // "hasta ahora". Midiéndola hasta ahora, su ventana llegaba al presente y
      // se tragaba todos los ingresos posteriores: una pestaña que murió sin
      // cerrar el lunes dejaba el martes y el miércoles dentro del mismo bloque.
      //
      // `start` lo escribe el cliente con Date.now() y `end` el servidor con
      // ServerValue.TIMESTAMP: con el reloj del asesor adelantado, el cierre
      // queda ANTES del inicio y la duración sale negativa (hay registros así en
      // la base). Nunca menos de cero: una jornada no puede durar -32 segundos.
      const fin = Math.max(r.end || r.start, r.start);
      const ultimo = out[out.length-1];
      if(ultimo && r.start <= ultimo.fin + _SES_UNIR_MS){
        if(fin > ultimo.fin) ultimo.fin = fin;
        if(abierta) ultimo.enCurso = true;
        ultimo.registros++;
      } else {
        out.push({inicio:r.start, fin, enCurso:abierta, registros:1});
      }
    });
  // La única sesión que puede estar viva de verdad es la última, y solo si es de
  // hoy: esa sí se mide hasta ahora, que es lo que hace correr el contador de
  // quien está trabajando en este momento.
  const ult = out[out.length-1];
  if(ult && ult.enCurso && _hoyLocal(new Date(ult.inicio))===_hoyLocal(new Date(ahora))){
    ult.fin = Math.max(ult.fin, ahora);
  }
  return out;
}
// "4 ago · 07:58 a. m." — el mes sale de _NOV_MESES y no de toLocaleDateString
// porque es-CO con month:'short' devuelve "4 de ago" y cambia según el entorno.
function _malFmtInicio(ts){
  const d = new Date(ts);
  return d.getDate()+' '+_NOV_MESES[d.getMonth()]+' · '+
         d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
}
// Cuántos días atrás mira la vista ampliada: hoy y los 3 anteriores.
const _MAL_DIAS_HIST = 4;
let _malHistExpandido = false;

// Medianoche local de hace N-1 días. Con Date.UTC o toISOString el corte se
// movería 5 horas y en Colombia se perdería la primera hora de la mañana.
function _malDesdeTs(dias){
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate()-(dias-1), 0, 0, 0, 0).getTime();
}

// Un ingreso "abierto" de un día pasado NO es alguien conectado: es una sesión
// que nunca cerró (la pestaña murió sin que corriera el onDisconnect). En la
// base hay varios así. Medirlos hasta ahora daba "en línea · 2d 6h" para
// alguien que hace días no entra, y ese número además se sumaba al día.
function _malSinCierre(s, ahora){
  return s.enCurso && _hoyLocal(new Date(s.inicio)) !== _hoyLocal(new Date(ahora||Date.now()));
}

function _malFilaIngreso(s){
  const dur = s.sinCierre
    ? '<span style="color:var(--text-3);" title="La sesión nunca se cerró: no se puede saber cuánto duró">sin cierre</span>'
    : s.enCurso
      ? '<span style="color:#10b981;font-weight:700;">en línea · '+_fmtDuracion(s.fin-s.inicio)+'</span>'
      : _fmtDuracion(s.fin - s.inicio);
  return (
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;'+
         'background:var(--bg-hover);border:1px solid var(--border);border-radius:8px;padding:8px 12px;">'+
      '<span style="font-size:.72rem;color:var(--text-1);font-weight:600;">'+_malFmtInicio(s.inicio)+'</span>'+
      '<span style="font-size:.7rem;color:var(--text-2);background:var(--bg-inset);padding:2px 9px;border-radius:10px;white-space:nowrap;">'+dur+'</span>'+
    '</div>'
  );
}

window._malVerMasSesiones = function(){
  _malHistExpandido = !_malHistExpandido;
  if(_malUsername) _malCargarSesiones(_malUsername);
};

function _malCargarSesiones(username){
  const el = document.getElementById('mal-session-hist');
  el.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);">Cargando...</div>';
  const desde = _malDesdeTs(_MAL_DIAS_HIST);
  // Ampliado se consulta por FECHA y no por cantidad: con un límite de registros
  // no hay forma de saber si los 4 días entraron o si quedaron a medias. Igual
  // se lee un poco antes del corte, porque un ingreso puede haber empezado la
  // noche anterior y hay que unirle sus registros para no partirlo en dos.
  const q = _malHistExpandido
    ? _db.ref('session_hist/'+username).orderByChild('start').startAt(desde - 12*3600000)
    : _db.ref('session_hist/'+username).orderByChild('start').limitToLast(60);

  q.once('value', snap=>{
    const crudos = [];
    snap.forEach(c=>{ crudos.push(c.val()); });
    const ahora = _ahoraServidor();
    const todos = _malAgruparSesiones(crudos, ahora);
    todos.forEach(s=>{ s.sinCierre = _malSinCierre(s, ahora); });
    const ingresos = _malHistExpandido
      ? todos.filter(s=>s.fin >= desde)   // por `fin`: una jornada que cruzó medianoche cuenta
      : todos.slice(-3);

    const boton = '<button onclick="_malVerMasSesiones()" style="margin-top:6px;background:none;border:1px solid var(--border);'+
      'color:var(--text-2);border-radius:8px;padding:6px 10px;font-size:.68rem;font-weight:700;cursor:pointer;font-family:inherit;">'+
      (_malHistExpandido ? '▲ Ver solo las últimas 3' : '▼ Ver los últimos '+_MAL_DIAS_HIST+' días')+'</button>';

    if(!ingresos.length){
      el.innerHTML='<div style="font-size:.72rem;color:var(--text-3);">'+
        (_malHistExpandido?'Sin ingresos en los últimos '+_MAL_DIAS_HIST+' días':'Sin sesiones registradas aún')+
        '</div>'+boton;
      return;
    }

    let html;
    if(_malHistExpandido){
      // Agrupados por día, del más reciente al más viejo, con el total de cada
      // uno: para saber cuánto trabajó alguien un día no sirve leer ingreso por
      // ingreso y sumarlos de cabeza.
      const porDia = {};
      ingresos.forEach(s=>{ const d=_hoyLocal(new Date(s.inicio)); (porDia[d]=porDia[d]||[]).push(s); });
      html = Object.keys(porDia).sort().reverse().map(dia=>{
        const lista = porDia[dia].sort((a,b)=>b.inicio-a.inicio);
        // Lo que nunca cerró no se puede medir, así que suma 0: es preferible un
        // total corto y honesto a uno inflado por una sesión que quedó abierta.
        const total = lista.reduce((a,s)=>a+(s.sinCierre?0:(s.fin-s.inicio)),0);
        const sinCerrar = lista.filter(s=>s.sinCierre).length;
        const [y,m,d] = dia.split('-').map(Number);
        const fecha = new Date(y, m-1, d);
        const hoy = _hoyLocal();
        const ayer = _hoyLocal(new Date(Date.now()-86400000));
        const etiqueta = dia===hoy ? 'Hoy' : dia===ayer ? 'Ayer'
          : fecha.toLocaleDateString('es-CO',{weekday:'long'})+' '+d+' '+_NOV_MESES[m-1];
        return '<div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">'+
            '<span style="font-size:.64rem;font-weight:800;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;">'+etiqueta+'</span>'+
            '<span style="font-size:.62rem;color:var(--text-3);">'+lista.length+(lista.length===1?' ingreso · ':' ingresos · ')+
              (total>0?_fmtDuracion(total):'—')+(sinCerrar?' <span title="'+sinCerrar+' sin cierre, no suman">+'+sinCerrar+'?</span>':'')+'</span>'+
          '</div>'+
          '<div style="display:flex;flex-direction:column;gap:5px;margin-top:5px;">'+lista.map(_malFilaIngreso).join('')+'</div>';
      }).join('');
    } else {
      html = ingresos.slice().reverse().map(_malFilaIngreso).join('');
    }
    el.innerHTML = html + boton;
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
    const isOnline=_estaOnline(p);
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
  const isOnline=_estaOnline(p);
  // El nombre editable manda sobre el de presence, igual que en el resto del
  // panel: presence lo reescribe el navegador del asesor en cada navegación.
  const uid=_malUsername;
  const name=((_admUsuariosCache||[]).find(u=>u.uid===uid)||{}).asesor || p.asesor || uid || '—';
  const av=document.getElementById('mal-avatar');
  const foto=window._fotoDe&&window._fotoDe(uid);
  if(foto){
    av.textContent=''; av.style.background='transparent';
    av.style.backgroundImage='url('+foto+')';
    av.style.backgroundSize='cover'; av.style.backgroundPosition='center';
  } else {
    av.style.backgroundImage='none';
    av.style.background=_avatarColor(name); av.textContent=_avatarInitials(name);
  }
  document.getElementById('mal-nombre').textContent=name;
  document.getElementById('mal-tienda').textContent='🏪 '+(p.tienda||'—');
  document.getElementById('mal-status').innerHTML=isOnline
    ?'<div class="enlive-online-pill"><span class="adm-live-dot"></span>EN VIVO</div>'
    :'<div class="enlive-offline-pill">Offline</div>';
  // Las métricas del kanban se retiraron: este modal mira ACTIVIDAD, no
  // producción. Las cifras del día están en la tarjeta, desde Gestiones Diarias.
  _malActualizarTiempos();
}

function _malActualizarTiempos(){
  const p=_malPresData; if(!p) return;
  // Hora del servidor, no el reloj local: lastSeen y lastActivity se escriben
  // con la del servidor, y comparar contra Date.now() daba duraciones falsas en
  // equipos con la hora corrida. Este punto había quedado fuera de la
  // unificación de _estaOnline.
  const now=_ahoraServidor();
  const isOnline=_estaOnline(p);
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
// Teléfono comparable: solo dígitos y quedándose con los últimos 10, que es el
// largo de un celular colombiano. Sin esto, el mismo número guardado como
// "+57 300 123 4567" en un lado y "3001234567" en otro no cruzaba, y el anticipo
// o el R.O. no aparecían en el pedido.
function _bordTel(s){
  const d=String(s||'').replace(/\D/g,'');
  return d.length>10 ? d.slice(-10) : d;
}

// Arma tres índices para cruzar contra el pedido: por guía y por teléfono.
// El teléfono es la única llave de los anticipos, que no guardan guía.
let _bordExtras={novPorGuia:{}, roPorGuia:{}, roPorTel:{}, antPorTel:{}, antPorCliente:{}};
function _bordIndexarExtras(novTiendas, roTiendas, antTiendas){
  const ix={novPorGuia:{}, roPorGuia:{}, roPorTel:{}, antPorTel:{}, antPorCliente:{}};
  const meter=(obj,k,v)=>{ if(!k) return; (obj[k]=obj[k]||[]).push(v); };
  novTiendas.forEach(({id,val})=>Object.entries(val||{}).forEach(([mes,regs])=>
    Object.entries(regs||{}).forEach(([nid,n])=>{
      if(!n||!n.guia) return;
      const sols=_novGetSols(n);
      const dev=sols.some(s=>s&&s.estado==='devuelta');
      meter(ix.novPorGuia,_bordNorm(n.guia),{mes, tienda:id, asesor:n.asesor||'', fecha:n.fecha||'',
        evidencias:sols.length, estado: dev?'devuelta':(n.solucionadaDropi||sols.some(s=>s&&s.estado==='solucionada')?'solucionada':'pendiente'),
        tipoNovedad:n.tipoNovedad||'', novId:nid,
        // Cada evidencia con lo justo para pintarla y para ir a buscar la
        // imagen cuando la pidan: el binario no se trae en la búsqueda.
        sols: sols.map(s=>({ key:s._key||'', tipo:s.tipo||'txt', estado:s.estado||'',
          fecha:s.fechaLabel||'', asesor:s.asesor||'',
          texto: s.tipo!=='img' ? (s.val||'') : '',
          tieneImg: s.tipo==='img' && (!!s.img || String(s.val||'').startsWith('data:')),
          incrustada: String(s.val||'').startsWith('data:') ? s.val : '' }))});
    })));
  roTiendas.forEach(({id,val})=>Object.entries(val||{}).forEach(([mes,regs])=>
    Object.values(regs||{}).forEach(r=>{
      if(!r) return;
      const fila={mes, tienda:id, cliente:r.cliente||'', telefono:r.telefono||'', guia:r.guia||'',
        notaCliente:r.notaCliente||'', notaSeguimiento:r.notaSeguimiento||'',
        fechaContacto:r.fechaContacto||'', fechaEstado:r.fechaEstado||''};
      meter(ix.roPorGuia,_bordNorm(r.guia),fila);
      meter(ix.roPorTel,_bordTel(r.telefono),fila);
    })));
  antTiendas.forEach(({id,val})=>Object.entries(val||{}).forEach(([mes,tipos])=>
    ['con','sin'].forEach(t=>Object.entries((tipos||{})[t]||{}).forEach(([aid,a])=>{
      if(!a) return;
      const fila={mes, tienda:id, tipo:t, id:aid, cliente:a.cliente||'', telefono:a.telefono||'',
        producto:a.producto||'', transporte:a.transporte||'', entrega:a.entrega||'',
        motivo:a.motivo||'', fecha:a.fecha||'',
        tieneComprobante: !!(a.comprobante||a.comp),
        // Los comprobantes viejos siguen dentro del registro; los nuevos van a
        // ant_comp/ y se piden al abrirlos.
        compIncrustado: String(a.comprobante||'').startsWith('data:') ? a.comprobante : ''};
      meter(ix.antPorTel,_bordTel(a.telefono),fila);
      meter(ix.antPorCliente,_bordNorm(a.cliente),fila);
    }))));
  return ix;
}
// Agrega resultados para clientes que aparecen en novedades, R.O. o anticipos
// pero no tienen pedido en el kanban. Sin esto, buscar el teléfono de alguien
// con anticipo y reclamo registrados no devolvía nada.
function _bordSumarSueltos(mapa, qN, esNumero, novTiendas, roTiendas, antTiendas){
  const qTel=_bordTel(qN);
  const yaEsta=(guia,tel)=>Object.values(mapa).some(r=>{
    if(guia && _bordNorm(r.guia)===_bordNorm(guia)) return true;
    const g=Object.values(r.asesores).map(a=>a.gestion).find(x=>x)||{};
    return tel && _bordTel(g._tel)===_bordTel(tel);
  });
  // Los anticipos no tienen guía: solo cliente, teléfono y demás datos. El
  // resultado se titula con el nombre del cliente y se marca `esCliente`, para
  // no inventar un número de guía que no existe.
  const crear=(clave,guia,nombre)=>{
    if(!mapa[clave]) mapa[clave]= guia
      ? {guia:String(guia).trim(), nombre:nombre||'', asesores:{}, sinKanban:true}
      : {guia:'', nombre:nombre||'', asesores:{}, sinKanban:true, esCliente:true};
    // Si primero entró por anticipo (sin guía) y después aparece un R.O. con
    // guía para el mismo teléfono, se completa.
    if(guia && !mapa[clave].guia){ mapa[clave].guia=String(guia).trim(); mapa[clave].esCliente=false; }
    if(nombre && !mapa[clave].nombre) mapa[clave].nombre=nombre;
    return mapa[clave];
  };
  // R.O.: tiene guía, cliente y teléfono
  roTiendas.forEach(({val})=>Object.values(val||{}).forEach(regs=>Object.values(regs||{}).forEach(r=>{
    if(!r) return;
    const hit = (r.guia && _bordNorm(r.guia).includes(qN)) || (r.cliente && _bordNorm(r.cliente).includes(qN)) ||
                (esNumero && qTel && _bordTel(r.telefono).includes(qTel));
    if(!hit || yaEsta(r.guia, r.telefono)) return;
    const clave = r.guia ? String(r.guia).trim() : 'tel:'+_bordTel(r.telefono);
    const e=crear(clave, r.guia, r.cliente);
    e.telSuelto=r.telefono||e.telSuelto;
  })));
  // Anticipos: NO tienen guía, se identifican por cliente y teléfono
  antTiendas.forEach(({val})=>Object.values(val||{}).forEach(tipos=>['con','sin'].forEach(t=>
    Object.values((tipos||{})[t]||{}).forEach(a=>{
      if(!a) return;
      const hit = (a.cliente && _bordNorm(a.cliente).includes(qN)) ||
                  (esNumero && qTel && _bordTel(a.telefono).includes(qTel));
      if(!hit || yaEsta(null, a.telefono)) return;
      const clave='tel:'+_bordTel(a.telefono);
      const e=crear(clave, null, a.cliente);
      e.telSuelto=a.telefono||e.telSuelto;
    }))));
  // Novedades: solo guía y asesor
  novTiendas.forEach(({val})=>Object.values(val||{}).forEach(regs=>Object.values(regs||{}).forEach(n=>{
    if(!n||!n.guia) return;
    if(!_bordNorm(n.guia).includes(qN) || yaEsta(n.guia, null)) return;
    crear(String(n.guia).trim(), n.guia, '');
  })));
}

// Lo que se sabe de un pedido fuera del kanban.
function _bordExtrasDe(guia, tel, nombre){
  const g=_bordNorm(guia), t=_bordTel(tel), n=_bordNorm(nombre);
  const roSet=new Set(), ro=[];
  [...(_bordExtras.roPorGuia[g]||[]), ...(t?(_bordExtras.roPorTel[t]||[]):[])].forEach(r=>{
    const k=r.mes+'|'+r.guia+'|'+r.telefono;      // el mismo R.O. puede entrar por guía y por teléfono
    if(roSet.has(k)) return; roSet.add(k); ro.push(r);
  });
  const antSet=new Set(), ant=[];
  [...(t?(_bordExtras.antPorTel[t]||[]):[]), ...(n?(_bordExtras.antPorCliente[n]||[]):[])].forEach(a=>{
    const k=a.mes+'|'+a.tipo+'|'+a.cliente+'|'+a.telefono+'|'+a.fecha;
    if(antSet.has(k)) return; antSet.add(k); ant.push(a);
  });
  return { novedades:_bordExtras.novPorGuia[g]||[], ro, anticipos:ant };
}
function _bordFmtTs(ts){ if(!ts)return'—'; const d=new Date(ts); return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}); }

function _admBuscarOrden(){
  const q = (document.getElementById('bord-input').value||'').trim();
  if(q.length < 3){ document.getElementById('bord-results').innerHTML='<div class="adm-empty">Escribe al menos 3 caracteres para buscar</div>'; return; }
  const empresaId = localStorage.getItem('lgs_empresa_actual');
  if(!empresaId){ document.getElementById('bord-results').innerHTML='<div class="adm-empty">Selecciona una empresa primero</div>'; return; }

  document.getElementById('bord-results').innerHTML='<div class="adm-empty">🔍 Buscando...</div>';
  const qN = _bordNorm(q);
  const esNumero = /^[\d\s\-]+$/.test(q.replace(/\s/g,''));

  // Con "Todas las tiendas" el selector vale '__todas__', y leer
  // gestiones_sync/__todas__ devolvía vacío: la búsqueda decía que el pedido no
  // existía cuando en realidad estaba mirando un nodo inexistente. Se resuelve
  // a las tiendas del admin y se busca en todas.
  const adminId = localStorage.getItem('lgs_admin_id');
  const resolverTiendas = (empresaId==='__todas__' && adminId)
    ? _db.ref('admin_empresas/'+adminId).once('value').then(s=>Object.keys(s.val()||{}))
    : Promise.resolve([empresaId]);

  // Además del kanban se traen novedades, R.O. y anticipos: un pedido se
  // entiende mirando todo lo que pasó con él, no solo sus llamadas.
  //   novedades → se cruzan por guía
  //   R.O.      → por guía, teléfono o cliente
  //   anticipos → NO tienen guía, solo por teléfono o cliente
  resolverTiendas.then(ids=>Promise.all([
    Promise.all(ids.map(id=>_db.ref('gestiones_sync/'+id).once('value').then(s=>({id, val:s.val()||{}})))),
    Promise.all(ids.map(id=>_db.ref('novedades/'+id).once('value').then(s=>({id, val:s.val()||{}})))),
    Promise.all(ids.map(id=>_db.ref('ro/'+id).once('value').then(s=>({id, val:s.val()||{}})))),
    Promise.all(ids.map(id=>_db.ref('anticipos/'+id).once('value').then(s=>({id, val:s.val()||{}}))))
  ])).then(([porTienda, novTiendas, roTiendas, antTiendas])=>{
    _bordExtras = _bordIndexarExtras(novTiendas, roTiendas, antTiendas);
    // Se juntan las gestiones de todas las tiendas consultadas, recordando de
    // cuál viene cada una para poder mostrarlo en el resultado.
    const gestTienda={}, tiendaDe={};
    porTienda.forEach(({id,val})=>Object.entries(val).forEach(([k,g])=>{
      gestTienda[k]=g; tiendaDe[k]=id;
    }));
    const resultadosPorGuia = {};
    const _debug = {asesores: porTienda.length, gests: Object.keys(gestTienda).length};

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
          resultadosPorGuia[displayGuia].asesores[asesorKey]={nombreAsesor:asesorKey,
            tiendaAsesor:(_bordEmpresas[tiendaDe[dropiKey]]||{}).nombre||'',notas:[],gestion:null,events:[]};
        const slot = resultadosPorGuia[displayGuia].asesores[asesorKey];
        slot.gestion = g;
        if(g.notas&&Array.isArray(g.notas)) g.notas.forEach(n=>slot.notas.push(n));
        if(g.eventos) Object.values(g.eventos).forEach(e=>slot.events.push(e));
      }
    });
    // Un cliente puede existir en novedades, R.O. o anticipos SIN tener pedido
    // en el kanban: pasa cuando el pedido no llegó a cargarse en el Excel o es
    // anterior. Arrancando solo desde gestiones_sync esos quedaban invisibles
    // aunque tuvieran anticipo y reclamo registrados.
    _bordSumarSueltos(resultadosPorGuia, qN, esNumero, novTiendas, roTiendas, antTiendas);
    _debug.gests += 0;
    _bordMostrarResultados(resultadosPorGuia, q, _debug);
  }).catch(e=>{
    document.getElementById('bord-results').innerHTML=
      '<div class="adm-empty" style="color:var(--danger);">No se pudo buscar: '+esc(e.message)+'</div>';
  });
}

// Resumen de una línea: si el pedido tuvo novedades, está en R.O. o tiene
// anticipos. El detalle completo va en el modal.
function _bordChipsExtras(guia, tel, nombre){
  const x=_bordExtrasDe(guia, tel, nombre);
  const chip=(txt,color,fondo)=>'<span style="background:'+fondo+';color:'+color+';border-radius:20px;padding:1px 8px;font-size:.62rem;font-weight:700;white-space:nowrap;">'+txt+'</span>';
  const partes=[];
  if(x.novedades.length){
    const dev=x.novedades.filter(n=>n.estado==='devuelta').length;
    const pend=x.novedades.filter(n=>n.estado==='pendiente').length;
    const txt='⚠️ '+x.novedades.length+' novedad'+(x.novedades.length>1?'es':'')+
      (dev?' · '+dev+' devuelta'+(dev>1?'s':''):'')+(pend?' · '+pend+' pendiente'+(pend>1?'s':''):'');
    partes.push(chip(txt, pend?'#d97706':'#16a34a', pend?'var(--warning-soft)':'var(--success-soft)'));
  }
  if(x.ro.length)        partes.push(chip('🏢 En R.O.'+(x.ro.length>1?' ('+x.ro.length+')':''), '#7c3aed','rgba(124,58,237,.12)'));
  if(x.anticipos.length) partes.push(chip('💵 '+x.anticipos.length+' anticipo'+(x.anticipos.length>1?'s':''), '#0891b2','var(--info-soft)'));
  if(!partes.length) return '';
  return '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">'+partes.join('')+'</div>';
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
    // Sin pedido en el kanban no hay asesores que listar: se dice explícito en
    // vez de dejar el renglón vacío, que se leería como un dato faltante.
    const nombres=asesoresCount
      ? Object.values(r.asesores).map(a=>a.nombreAsesor).join(', ')
      : 'sin gestión en el kanban';
    const primerG=Object.values(r.asesores).map(a=>a.gestion).find(g=>g)||{};
    const ciudad=primerG._ciudad||'';
    // telSuelto: los resultados que salen de R.O. o anticipos no tienen pedido
    // en el kanban, así que su teléfono viene de ahí.
    const tel=primerG._tel||r.telSuelto||'';
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
            // Sin guía (típico de un anticipo) el título es el cliente: poner
            // ahí el teléfono con formato de guía haría creer que existe una.
            (r.esCliente
              ? '<div style="font-size:.85rem;font-weight:700;color:var(--text-1);">👤 '+(r.nombre||tel||'Cliente')+'</div>'+
                '<div style="font-size:.66rem;color:var(--text-3);margin-top:2px;">Sin número de guía</div>'
              : '<div style="font-size:.85rem;font-weight:700;color:var(--text-1);font-family:monospace;">'+r.guia+'</div>'+
                (r.nombre?'<div style="font-size:.78rem;color:var(--text-2);margin-top:2px;">👤 '+r.nombre+'</div>':''))+
            '<div style="display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:.7rem;color:var(--text-3);">'+
              (ciudad?'<span>📍 '+ciudad+'</span>':'')+
              (tel?'<span>📞 '+tel+'</span>':'')+
              '<span>👥 '+nombres+'</span>'+
            '</div>'+
            _bordChipsExtras(r.guia, tel, r.nombre)+
            (r.sinKanban?'<div style="font-size:.62rem;color:var(--text-3);margin-top:4px;font-style:italic;">Este pedido no está en el Excel cargado: los datos salen de R.O., novedades o anticipos.</div>':'')+
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
    if(!r){_mAlert('Orden no encontrada','No se encontró la orden: '+key);return;}
    const modal = document.getElementById('bord-modal');
    const body = document.getElementById('bord-modal-body');
    // Sin guía se encabeza con el cliente: 'key' sería la clave interna
    // ("tel:3208529608") y se leería como un número de guía inventado.
    document.getElementById('bord-modal-title').textContent = r.esCliente
      ? '👤 '+(r.nombre||r.telSuelto||'Cliente')
      : '📦 '+(r.guia||key);
    document.getElementById('bord-modal-sub').textContent = r.esCliente
      ? (r.telSuelto? '📞 '+r.telSuelto+' · sin número de guía' : 'Sin número de guía')
      : (r.nombre ? '👤 '+r.nombre : 'Sin nombre registrado');
    modal.style.display = 'flex';
    try{ body.innerHTML = _bordRenderDetalle(r); }
    catch(e2){ body.innerHTML='<div style="color:var(--danger);padding:16px;font-size:.82rem;">❌ Error al renderizar: '+e2.message+'<br><pre style="margin-top:8px;font-size:.7rem;color:var(--text-3);white-space:pre-wrap;">'+e2.stack+'</pre></div>'; }
  }catch(e){_mAlert('No se pudo abrir el detalle', e.message);}
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
  // El teléfono puede venir del pedido o, si no hay pedido en el kanban, del
  // R.O. o el anticipo que originó el resultado.
  html += _bordRenderExtras(clienteInfo.guia||r.guia, clienteInfo.tel||r.telSuelto, clienteInfo.nombre||r.nombre);
  return html;
}

// Cuadritos de evidencia de una novedad. Las imágenes no se traen en la
// búsqueda: el cuadro solo dice que hay foto y se descarga al hacer clic.
function _bordEvidenciasHTML(n){
  const sols=(n&&n.sols)||[];
  if(!sols.length) return '';
  const cuadro=(cont,estilo,extra)=>'<div style="width:34px;height:34px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:.9rem;cursor:pointer;'+estilo+'" '+(extra||'')+'>'+cont+'</div>';
  let h='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;">';
  sols.forEach((s,i)=>{
    const col=s.estado==='solucionada'?'#16a34a':s.estado==='devuelta'?'#d97706':'#0891b2';
    const fondo=s.estado==='solucionada'?'var(--success-soft)':s.estado==='devuelta'?'var(--warning-soft)':'var(--info-soft)';
    const tit=esc([s.estado||'', s.fecha||'', s.asesor?'por '+s.asesor:''].filter(Boolean).join(' · '));
    if(s.tipo==='img' && s.tieneImg){
      h+=cuadro('📷','background:'+fondo+';border:1.5px solid '+col+';',
        'title="'+tit+'" onclick="_bordVerEvidencia(\''+n.tienda+'\',\''+n.mes+'\',\''+n.novId+'\',\''+s.key+'\')"');
    } else if(s.tipo!=='img' && s.texto){
      h+=cuadro('📝','background:'+fondo+';border:1.5px solid '+col+';',
        'title="'+tit+'" onclick="_bordVerTextoEvidencia('+JSON.stringify(s.texto).replace(/"/g,'&quot;')+')"');
    }
  });
  return h+'</div>';
}
// Visor. Se crea una sola vez y se reutiliza; el panel de admin no tiene el
// lightbox de Gestiones Diarias.
function _bordVisor(){
  let v=document.getElementById('bord-visor');
  if(v) return v;
  v=document.createElement('div');
  v.id='bord-visor';
  v.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:1000002;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;';
  v.onclick=()=>{ v.style.display='none'; v.innerHTML=''; };
  document.body.appendChild(v);
  return v;
}
window._bordVerEvidencia=async function(tienda, mes, novId, solKey){
  const v=_bordVisor();
  v.innerHTML='<div style="color:#fff;font-size:.85rem;">Cargando imagen…</div>';
  v.style.display='flex';
  try{
    const src=(await _db.ref(_novImgPath(tienda, mes, novId, solKey)).once('value')).val();
    if(!src){ v.innerHTML='<div style="color:#fff;font-size:.85rem;">Esta evidencia ya no tiene imagen guardada.</div>'; return; }
    v.innerHTML='<img src="'+src+'" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;">';
  }catch(e){ v.innerHTML='<div style="color:#fff;font-size:.85rem;">No se pudo cargar: '+esc(e.message)+'</div>'; }
};
window._bordVerTextoEvidencia=function(txt){
  const v=_bordVisor();
  v.innerHTML='<div style="background:var(--bg-card);color:var(--text-1);border-radius:12px;padding:20px;max-width:560px;max-height:80vh;overflow:auto;white-space:pre-wrap;font-size:.85rem;line-height:1.6;cursor:auto;" onclick="event.stopPropagation()">'+esc(txt)+'</div>';
  v.style.display='flex';
};
window._bordVerComprobante=async function(tienda, mes, tipo, id, incrustado){
  const v=_bordVisor();
  if(incrustado){ v.innerHTML='<img src="'+incrustado+'" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;">'; v.style.display='flex'; return; }
  v.innerHTML='<div style="color:#fff;font-size:.85rem;">Cargando comprobante…</div>';
  v.style.display='flex';
  try{
    const src=(await _db.ref(_antCompPath(tienda, mes, tipo, id)).once('value')).val();
    v.innerHTML = src
      ? '<img src="'+src+'" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;">'
      : '<div style="color:#fff;font-size:.85rem;">Este anticipo no tiene comprobante guardado.</div>';
  }catch(e){ v.innerHTML='<div style="color:#fff;font-size:.85rem;">No se pudo cargar: '+esc(e.message)+'</div>'; }
};

// Bloques de novedades, R.O. y anticipos del pedido. Van al final del detalle,
// después de la trayectoria del kanban, porque son el contexto de lo que pasó
// con el pedido más allá de las llamadas.
function _bordRenderExtras(guia, tel, nombre){
  const x=_bordExtrasDe(guia, tel, nombre);
  if(!x.novedades.length && !x.ro.length && !x.anticipos.length) return '';
  const nomTienda=id=>(_bordEmpresas[id]||{}).nombre||'';
  const titulo=t=>'<div style="font-size:.72rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.3px;padding:4px 0 6px;border-bottom:1px solid var(--border);margin-bottom:6px;">'+t+'</div>';
  const caja=(borde,cont)=>'<div style="padding:8px 10px;background:var(--bg-card);border-radius:8px;border-left:3px solid '+borde+';margin-bottom:5px;">'+cont+'</div>';
  const menor=t=>'<div style="font-size:.65rem;color:var(--text-3);margin-top:2px;">'+t+'</div>';
  let h='';
  if(x.novedades.length){
    h+='<div style="margin-bottom:14px;">'+titulo('⚠️ Novedades ('+x.novedades.length+')');
    x.novedades.forEach(n=>{
      const col=n.estado==='devuelta'?'#d97706':n.estado==='solucionada'?'#16a34a':'#0891b2';
      const et=n.estado==='devuelta'?'🔄 Devuelta':n.estado==='solucionada'?'✅ Solucionada':'📋 Pendiente';
      h+=caja(col,'<div style="font-size:.78rem;font-weight:600;color:var(--text-1);">'+et+
        (n.tipoNovedad?' · '+esc(n.tipoNovedad):'')+'</div>'+
        menor([n.fecha, n.asesor?'por '+esc(n.asesor):'', n.evidencias+' evidencia'+(n.evidencias===1?'':'s'),
               nomTienda(n.tienda)?'🏪 '+nomTienda(n.tienda):''].filter(Boolean).join(' · '))+
        _bordEvidenciasHTML(n));
    });
    h+='</div>';
  }
  if(x.ro.length){
    h+='<div style="margin-bottom:14px;">'+titulo('🏢 Reclamo en oficina ('+x.ro.length+')');
    x.ro.forEach(r=>{
      h+=caja('#7c3aed','<div style="font-size:.78rem;font-weight:600;color:var(--text-1);">'+
        esc(r.cliente||'(sin cliente)')+(r.guia?' · guía '+esc(r.guia):'')+'</div>'+
        (r.notaCliente?menor('🗒️ '+esc(r.notaCliente)):'')+
        (r.notaSeguimiento?menor('📌 '+esc(r.notaSeguimiento)):'')+
        menor([r.fechaContacto?'contacto: '+r.fechaContacto:'', r.fechaEstado?'estado: '+r.fechaEstado:'',
               nomTienda(r.tienda)?'🏪 '+nomTienda(r.tienda):''].filter(Boolean).join(' · ')));
    });
    h+='</div>';
  }
  if(x.anticipos.length){
    h+='<div style="margin-bottom:14px;">'+titulo('💵 Anticipos ('+x.anticipos.length+')')+
      '<div style="font-size:.62rem;color:var(--text-3);margin-bottom:6px;">Los anticipos no guardan número de guía: se vinculan por teléfono o nombre del cliente, así que pueden ser de otro pedido de la misma persona.</div>';
    x.anticipos.forEach(a=>{
      const verComp = a.tieneComprobante
        ? '<div style="margin-top:7px;"><button onclick="_bordVerComprobante(\''+a.tienda+'\',\''+a.mes+'\',\''+a.tipo+'\',\''+a.id+'\',\''+(a.compIncrustado||'')+'\')" '+
          'style="background:var(--info-soft);color:#0891b2;border:1.5px solid #0891b2;border-radius:7px;padding:4px 10px;font-size:.68rem;font-weight:700;cursor:pointer;">📎 Ver comprobante</button></div>'
        : menor('Sin comprobante adjunto');
      h+=caja('#0891b2','<div style="font-size:.78rem;font-weight:600;color:var(--text-1);">'+
        (a.tipo==='con'?'Con anticipo':'Sin anticipo')+(a.producto?' · '+esc(a.producto):'')+'</div>'+
        menor([a.fecha, a.transporte?esc(a.transporte):'', a.entrega?'entrega: '+esc(a.entrega):'',
               nomTienda(a.tienda)?'🏪 '+nomTienda(a.tienda):''].filter(Boolean).join(' · '))+
        (a.motivo?menor('🗒️ '+esc(a.motivo)):'')+verComp);
    });
    h+='</div>';
  }
  return h;
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

// Vuelca los días de una carpeta de asesor sobre otra, sumando los contadores.
// `dias` llega como array cuando las claves son 1..N seguidas y como objeto
// cuando hay huecos: Object.entries recorre bien las dos formas, y el resto del
// módulo lee dias[d] igual en un caso y en el otro.
function _gdadmSumarDias(destino, origen){
  Object.entries(origen||{}).forEach(([dia,val])=>{
    if(!val||typeof val!=='object') return;
    if(!destino[dia]) destino[dia]={};
    Object.entries(val).forEach(([campo,n])=>{
      // Los números se suman; lo demás (observaciones, notas) no se puede
      // sumar, así que se conserva lo primero que haya en vez de pisarlo.
      if(typeof n==='number') destino[dia][campo]=(destino[dia][campo]||0)+n;
      else if(destino[dia][campo]===undefined) destino[dia][campo]=n;
    });
  });
}

function _gdadmCargar(){
  const mes=document.getElementById('gdadm-mes').value;
  const tiendas=_gdadmTiendasDisponibles.filter(t=>_gdadmTiendasSel.has(t.key));
  if(!tiendas.length||!mes){_mAlert('Faltan filtros','Seleccioná al menos una tienda y un mes.');return;}
  const el=document.getElementById('gdadm-content');
  el.innerHTML='<div style="padding:20px;color:var(--text-3);font-size:.78rem;">Cargando...</div>';
  // Se lee /users junto con las gestiones para poder resolver el nombre cuando
  // la carpeta no trae `_nombre`. Sin esto la columna mostraba el uid crudo:
  // KAREN GOMEZ salía como "KAREN · Paquetin" (donde sí estaba el rótulo) y
  // como "ISDV7MAJ..." en Calzalandia y Medsock, leyéndose como tres personas.
  Promise.all([
    _db.ref('users').once('value').then(s=>s.val()||{}),
    Promise.all(tiendas.map(t=>
      _db.ref('gestiones_diarias/'+t.key+'/'+mes).once('value').then(snap=>{
        // Si la tienda todavía no migró a la clave por id, leer la ruta vieja.
        if(snap.exists()||!t.keyLegacy||t.keyLegacy===t.key) return {tienda:t,snap};
        return _db.ref('gestiones_diarias/'+t.keyLegacy+'/'+mes).once('value').then(sv=>({tienda:t,snap:sv}));
      })
    ))
  ]).then(([users,results])=>{
    // raw = { asesorKey: { _nombre, dias:{1:{...},2:{...},...}, notas }, ... }
    _gdadmAsesores=[];
    const [y,m]=mes.split('-').map(Number);
    _gdadmDias=new Date(y,m,0).getDate();
    _gdadmPoblarDias();   // por si el mes cambió sin pasar por su onchange
    results.forEach(({tienda,snap})=>{
      if(!snap.exists()) return;
      const raw=snap.val()||{};
      // Del mes solo son personas las carpetas de asesor: 'consolidado' y
      // 'notasHist' cuelgan del mismo nodo pero son de la tienda entera.
      const carpetas=Object.entries(raw).filter(([k,v])=>v&&v.dias&&!_GD_NO_ASESOR.has(k));
      // Una misma persona puede tener DOS carpetas en la tienda: la nueva por
      // uid y la vieja por slug del nombre. Salían como dos asesores con
      // gestiones distintas —DALILA con 89 y con 43 el mismo día en Paquetin—
      // porque cada vía acredita en una: las evidencias con asesorUid van a la
      // del uid y las que solo traían el nombre (extensión y Gestor Logístico,
      // hasta que se les agregó el uid) caían a la del slug. Acá se suman en la
      // del uid. Sin esto, arreglar el origen no repara lo ya guardado.
      // El `_nombre` es el rótulo que deja el propio módulo, pero no siempre
      // está: una carpeta creada por un recuento (_novSyncGD, la extensión) nace
      // sin él. Por eso se cae a /users antes que a la clave cruda — mismo
      // criterio que _auditListaAsesores. Mostrar el uid no es solo feo:
      // rompe el `esSlug` de abajo y parte a la persona en varias columnas.
      const nombreDe=e=>String(e[1]._nombre||(users[e[0]]||{}).asesor||e[0]).trim();
      // Es carpeta vieja si su clave ES el slug de su propio nombre; la del uid
      // nunca coincide consigo misma porque el uid no se deriva del nombre.
      const esSlug=e=>_gdKey(nombreDe(e))===e[0];
      const destinoDe={};
      carpetas.forEach(e=>{ if(!esSlug(e)) destinoDe[_gdKey(nombreDe(e))]=e[0]; });
      const acum={};
      carpetas.forEach(e=>{
        const [aKey,aVal]=e;
        const destino=(esSlug(e)&&destinoDe[aKey])||aKey;
        if(!acum[destino]) acum[destino]={nombre:'',dias:{}};
        // El nombre lo pone la carpeta destino; la vieja solo sirve de respaldo.
        if(destino===aKey||!acum[destino].nombre) acum[destino].nombre=nombreDe(e).toUpperCase();
        _gdadmSumarDias(acum[destino].dias, aVal.dias);
      });
      Object.entries(acum).forEach(([aKey,v])=>{
        _gdadmAsesores.push({
          key:tienda.key+'/'+aKey,
          nombre:v.nombre||aKey.toUpperCase(),
          tienda:tienda.nombre,
          dias:v.dias
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

// ── Filtro de día ────────────────────────────────────────
// 0 = todo el mes. Las tres tablas se arman recorriendo _gdadmDiasLista() y
// dividiendo los promedios por _gdadmDivisor(), así que acotar a un día es
// cambiar esas dos y nada más. El filtro es local: los días del mes ya están en
// _gdadmAsesores, no hace falta volver a Firebase para cambiar de día.
let _gdadmDiaSel = 0;
function _gdadmDiasLista(){
  if(_gdadmDiaSel) return [_gdadmDiaSel];
  const out=[]; for(let d=1;d<=_gdadmDias;d++) out.push(d);
  return out;
}
// Divisor de los promedios: con un día elegido es 1, no los 31 del mes — si no,
// "PROM." mostraría el trabajo de ese día repartido en todo el mes.
function _gdadmDivisor(){ return _gdadmDiaSel ? 1 : _gdadmDias; }
// Etiqueta del período, para que la tabla diga siempre de qué está hablando.
function _gdadmPeriodoLbl(){
  if(!_gdadmDiaSel) return 'MES';
  const mes=(_gdadmData||{}).mes||'';
  const [y,m]=mes.split('-').map(Number);
  const f=new Date(y,(m||1)-1,_gdadmDiaSel);
  return (_NOV_MESES && !isNaN(f) ? _gdadmDiaSel+' DE '+_NOV_MESES[f.getMonth()].toUpperCase() : 'DÍA '+_gdadmDiaSel);
}
window._gdadmPoblarDias = function(){
  const sel=document.getElementById('gdadm-dia');
  const mes=(document.getElementById('gdadm-mes')||{}).value||'';
  if(!sel) return;
  const [y,m]=mes.split('-').map(Number);
  const total=(y&&m)?new Date(y,m,0).getDate():0;
  const previo=_gdadmDiaSel;
  let html='<option value="0">Todo el mes</option>';
  for(let d=1;d<=total;d++) html+='<option value="'+d+'">Día '+d+'</option>';
  sel.innerHTML=html;
  // Si el mes nuevo es más corto, el día elegido puede no existir.
  _gdadmDiaSel = (previo && previo<=total) ? previo : 0;
  sel.value=String(_gdadmDiaSel);
};
window._gdadmSetDia = function(v){
  _gdadmDiaSel = parseInt(v,10)||0;
  if(_gdadmAsesores.length) _gdadmSubtab(_gdadmSubtabActual);
};

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
// Total de gestiones de UN día. Tiene que dar lo mismo que _gdCalc() en
// gestiones-diarias.js: el total cuenta todo el trabajo del día, con resultado
// positivo o no, así que las devoluciones y los carritos no recuperados también
// suman. Estaban faltando las dos y el admin veía menos gestiones que el propio
// asesor en su tabla.
// `recupNov` es un campo muerto (ningún módulo lo escribe ya) pero se sigue
// sumando para no bajar las cifras de los meses viejos que lo tengan.
// Punto único de cálculo a propósito: antes la fórmula estaba repetida en cuatro
// lugares de este panel y se desincronizaron.
function _gdadmGralDia(d){
  d=d||{};
  return (d.conf||0)+(d.cancel||0)+(d.soluc||0)+(d.devuelt||0)
       +(d.recupCarri||0)+(d.contNoRecup||0)+(d.recupNov||0)+(d.ventasWpp||0);
}
function _gdadmDayTotals(dias){
  // Suma los días del período elegido: el mes entero, o uno solo si hay filtro.
  let c={conf:0,cancel:0,soluc:0,devuelt:0,recupNov:0,recupCarri:0,contNoRecup:0,ventasWpp:0,gral:0};
  _gdadmDiasLista().map(n=>(dias||{})[n]).filter(Boolean).forEach(d=>{
    c.conf+=d.conf||0; c.cancel+=d.cancel||0; c.soluc+=d.soluc||0;
    c.devuelt+=d.devuelt||0; c.recupNov+=d.recupNov||0;
    c.recupCarri+=d.recupCarri||0; c.contNoRecup+=d.contNoRecup||0;
    c.ventasWpp+=d.ventasWpp||0;
    c.gral+=_gdadmGralDia(d);
  });
  return c;
}
function _pct(n,d){ return d?Math.round(n/d*100)+'%':'—'; }
function _avg(n,d){ return d?(n/d).toFixed(1):'—'; }

// Quién trabajó en el período que se está mirando, sea el mes entero o el día
// elegido. Las tiendas arrastran cuentas viejas y gente que nunca llegó a
// cargar nada: aparecían igual, en cero, y en la tabla por colaborador cada una
// se llevaba una columna vacía a lo ancho de los 31 días.
//
// Ocultarlas NO cambia ninguna cifra —quien está en cero suma cero a todos los
// totales—, salvo los promedios POR PERSONA, que ahora se dividen entre los que
// de verdad trabajaron en vez de diluirse entre los que no.
//
// El criterio es tener gestiones (`gral>0`), no tener carpeta: una carpeta
// creada por una observación suelta, sin una sola gestión, es exactamente el
// caso que se quiere sacar.
//
// Los que quedan fuera no se listan. Se probó nombrarlos en una línea arriba de
// la tabla y con las tiendas reales eran 19 nombres —media pantalla de texto
// para decir que no trabajaron—: la tabla sola comunica mejor.
function _gdadmConTrabajo(){
  return _gdadmAsesores.filter(a=>_gdadmDayTotals(a.dias).gral>0);
}

// ── Tabla 1: RANKING ─────────────────────────────────────
function _gdadmRenderRanking(){
  const el=document.getElementById('gdadm-content');
  let rows='', totals={conf:0,cancel:0,soluc:0,recupNov:0,recupCarri:0,ventasWpp:0,gral:0};
  // Quien está en cero llenaría la tabla de ceros y ensuciaría la comparación
  // entre los que sí trabajaron. Antes esto valía solo con un día elegido; en
  // el mes entero seguían apareciendo las cuentas que nunca cargaron nada.
  const visibles=_gdadmConTrabajo();
  visibles.forEach((a,i)=>{
    const t=_gdadmDayTotals(a.dias);
    // La columna NOVEDADES muestra solucionadas + devueltas, y CARRITOS
    // recuperados + no recuperados: ambas son gestiones hechas.
    totals.conf+=t.conf; totals.cancel+=t.cancel; totals.soluc+=t.soluc+t.devuelt;
    totals.recupNov+=t.recupNov+t.recupCarri+t.contNoRecup; totals.ventasWpp+=t.ventasWpp; totals.gral+=t.gral;
    const prom=_avg(t.gral,_gdadmDivisor());
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
      <td>${t.recupNov+t.recupCarri+t.contNoRecup}</td>
      <td>${t.ventasWpp}</td>
      <td>${prom}</td>
      <td class="${parseInt(efect)>=50?'hi':'warn'}">${efect}</td>
      <td>0</td><td>—</td><td>—</td>
    </tr>`;
  });
  el.innerHTML=`<div style="font-size:.7rem;font-weight:800;color:var(--text-1);margin-bottom:8px;letter-spacing:.3px;">EQUIPO · RANKING · BONIFICACIONES · ${_gdadmPeriodoLbl()}</div>
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
      <td>${_avg(totals.gral,_gdadmDivisor())}</td>
      <td>${_pct(totals.conf,totals.gral)}</td>
      <td>0</td><td colspan="2"></td>
    </tr></tfoot>
  </table></div>`;
}

// ── Tabla 2: POR COLABORADOR ──────────────────────────────
function _gdadmRenderCollab(){
  const el=document.getElementById('gdadm-content');
  const titulo=`<div style="font-size:.7rem;font-weight:800;color:var(--text-1);margin-bottom:8px;letter-spacing:.3px;">CONSOLIDADO DIARIO — TOTAL GESTIONES POR COLABORADOR · ${_gdadmPeriodoLbl()}</div>`;
  // Solo los que trabajaron en el período. Cada columna vacía se llevaba un
  // ancho completo a lo largo de todos los días del mes, y con varias tiendas
  // seleccionadas la tabla se iba de pantalla antes de mostrar a los que sí.
  const asesores=_gdadmConTrabajo();
  // Con nadie que mostrar se dice con palabras: una tabla de una sola columna
  // vacía se lee como que algo falló.
  if(!asesores.length){
    el.innerHTML=titulo+
      '<div style="padding:20px;color:var(--text-3);font-size:.78rem;">Nadie registró gestiones '+
      (_gdadmDiaSel?'ese día':'en este mes')+'.</div>';
    return;
  }
  let rows='', mesTotals=asesores.map(()=>0);
  _gdadmDiasLista().forEach(d=>{
    let rowTotal=0;
    let cells=asesores.map((a,i)=>{
      const g=_gdadmGralDia(a.dias[d]);
      mesTotals[i]+=g; rowTotal+=g; return `<td>${g||''}</td>`;
    }).join('');
    rows+=`<tr><td style="font-weight:700;">${d}</td>${cells}<td class="hi" style="font-weight:700;">${rowTotal||''}</td><td>${rowTotal?_avg(rowTotal,asesores.length):''}  </td></tr>`;
  });
  const grandTotal=mesTotals.reduce((a,b)=>a+b,0);
  const multiTienda=new Set(asesores.map(a=>a.tienda)).size>1;
  const aHeaders=asesores.map(a=>`<th>${a.nombre.split(' ')[0]}${multiTienda?'<br><span style="font-weight:400;opacity:.6;font-size:.55rem;">🏪 '+a.tienda+'</span>':''}</th>`).join('');
  const aTotals=mesTotals.map(t=>`<td class="hi">${t}</td>`).join('');
  const aProms=mesTotals.map(t=>`<td>${_avg(t,_gdadmDivisor())}</td>`).join('');
  const totLbl=_gdadmDiaSel?'TOTAL DÍA':'TOTAL MES';
  el.innerHTML=titulo+
  `<div style="overflow:auto;"><table class="gdadm-table">
    <thead><tr><th>DÍA</th>${aHeaders}<th>TOTAL DÍA</th><th>PROM.</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row"><td>${totLbl}</td>${aTotals}<td>${grandTotal}</td><td>${_avg(grandTotal,_gdadmDivisor())}</td></tr>
      <tr class="prom-row"><td>PROMEDIO</td>${aProms}<td>${_avg(grandTotal,_gdadmDivisor())}</td><td>${_avg(grandTotal/asesores.length,_gdadmDivisor())}</td></tr>
    </tfoot>
  </table></div>`;
}

// ── Tabla 3: POR TIPO DE GESTIÓN ─────────────────────────
function _gdadmRenderTipo(){
  const el=document.getElementById('gdadm-content');
  let rows='';
  let tConf=0,tCancel=0,tSoluc=0,tRecup=0,tVwpp=0,tTotal=0;
  _gdadmDiasLista().forEach(d=>{
    let conf=0,cancel=0,soluc=0,recup=0,vwpp=0;
    _gdadmAsesores.forEach(a=>{
      const day=a.dias[d]||{};
      conf+=day.conf||0; cancel+=day.cancel||0;
      soluc+=(day.soluc||0)+(day.devuelt||0);
      recup+=(day.recupNov||0)+(day.recupCarri||0)+(day.contNoRecup||0);
      vwpp+=day.ventasWpp||0;
    });
    const total=conf+cancel+soluc+recup+vwpp;
    tConf+=conf;tCancel+=cancel;tSoluc+=soluc;tRecup+=recup;tVwpp+=vwpp;tTotal+=total;
    if(!total){rows+=`<tr><td style="font-weight:700;">${d}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;return;}
    rows+=`<tr>
      <td style="font-weight:700;">${d}</td>
      <td>${conf}</td><td>${cancel?`<span class="warn">${cancel}</span>`:''}</td>
      <td>${soluc}</td><td>${recup}</td><td>${vwpp}</td>
      <td class="hi" style="font-weight:700;">${total}</td>
      <td class="${conf/total>=.5?'hi':'warn'}">${_pct(conf,total)}</td>
      <td class="${cancel/total<=.06?'hi':'warn'}">${_pct(cancel,total)}</td>
    </tr>`;
  });
  const tEfect=_pct(tConf,tTotal), tCancelPct=_pct(tCancel,tTotal);
  // KPIs
  let maxDia=0,minDia=Infinity;
  _gdadmDiasLista().forEach(i=>{
    let t=0; _gdadmAsesores.forEach(a=>{t+=_gdadmGralDia(a.dias[i]);});
    if(t>maxDia)maxDia=t; if(t<minDia)minDia=t;
  });
  if(minDia===Infinity)minDia=0;
  el.innerHTML=`<div style="font-size:.7rem;font-weight:800;color:var(--text-1);margin-bottom:8px;letter-spacing:.3px;">CONSOLIDADO POR TIPO DE GESTIÓN · ${_gdadmPeriodoLbl()}</div>
  <div style="overflow:auto;"><table class="gdadm-table">
    <thead><tr>
      <th>DÍA</th><th>CONFIRM.</th><th>CANCELADAS</th>
      <th title="Solucionadas + devueltas">NOVEDADES</th>
      <th title="Recuperados + no recuperados">CARRITOS</th>
      <th>VENTAS WPP</th><th>TOTAL</th><th>% EFECT.</th><th>% CANCELADO</th>
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
// Misma historia que con las tiendas, ahora con las personas. La carpeta del
// asesor era _gdKey(su nombre), así que:
//   · renombrarlo partía su historial en dos (y en el consolidado aparecía
//     como dos personas con la mitad de los números cada una);
//   · dos personas homónimas en la misma tienda COMPARTÍAN carpeta y sus
//     gestiones se sumaban entre sí, sin ningún aviso.
// La clave canónica pasa a ser el uid de Firebase Auth, que no cambia nunca
// aunque cambien nombre, correo o contraseña.
//   _gdAK()       → clave de ESCRITURA (uid; cae al slug del nombre si aún no
//                   hay sesión resuelta, para no escribir en un nodo suelto)
//   _gdAKLegacy() → clave vieja por nombre, solo para leer/migrar lo anterior
function _gdAKLegacy(){
  // Auditando se mira la carpeta vieja del asesor OBSERVADO, no la del admin
  // que está mirando: si esa persona todavía no migró a uid, su historial sigue
  // guardado bajo el slug de su nombre y es lo único que hay para mostrar.
  if(_esAuditoria() && _getAuditAsesorNombre()) return _gdKey(_getAuditAsesorNombre());
  return _gdKey(window.getLoginAsesor?window.getLoginAsesor():'_');
}
// Nombre con el que trabajaba antes de que lo renombraran, si lo hubo. Es la
// única pista para encontrar su historial: la carpeta vieja se llamaba así.
function _gdAKPrevio(){
  // 'lgs_asesor_prev' es el nombre anterior del que tiene la sesión abierta.
  // Auditando ese sería el del admin, y apuntaría a la carpeta equivocada.
  if(_esAuditoria()) return '';
  try{ const p=localStorage.getItem('lgs_asesor_prev'); return p?_gdKey(p):''; }catch(e){ return ''; }
}
function _gdAK(){
  // Auditando, la carpeta a leer es la del asesor que se eligió en la barra: sin
  // esto el admin abría Gestiones Diarias en su PROPIO nodo dentro de una tienda
  // ajena —vacío— y parecía que el equipo no había trabajado nada.
  if(_esAuditoria()){
    const observado = _getAuditAsesor();
    if(observado) return observado;
  }
  // El dueño mirando a uno de sus asesores: se lee la carpeta de esa persona.
  // Escribir no es riesgo, lo impide el blindaje (ver _esSoloLectura).
  if(_gdViendoOtro()) return window._gdVerAsesor;
  return window._currentUsername || localStorage.getItem('lgs_user') || _gdAKLegacy();
}

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
      // Auditando no se migra nada: la copia está bloqueada por ser escritura, y
      // encadenarla igual devolvería el nodo nuevo (vacío) en vez de los datos.
      // Se muestra el legacy tal cual y la migración queda para el dueño real.
      if(_esAuditoria()) return sv;
      // Copiar el nodo completo a la clave nueva antes de que alguien lo edite.
      return _db.ref(nueva).set(sv.val())
        .then(()=>ref(nueva).once('value'))
        .catch(e=>{ console.warn('[TIENDA] no se pudo migrar '+vieja+' → '+nueva, e); return sv; });
    });
  }).catch(e=>{
    // La clave vieja es el slug del nombre de la tienda, y no figura en
    // user_tiendas ni en admin_empresas —esos van por empresaId—, así que en
    // cuanto un nodo se cierra por tienda esta lectura devuelve
    // permission_denied. Pasa en el caso más normal que hay: un mes todavía sin
    // datos, donde el nodo nuevo no existe y se va a mirar el viejo.
    //
    // Sin este catch la promesa quedaba rechazada y sin nadie que la atendiera:
    // la pantalla se quedaba en "Cargando..." para siempre. Se sigue con el
    // snapshot nuevo (vacío), que es exactamente lo que hay que mostrar.
    if(String(e&&e.code||e).indexOf('PERMISSION_DENIED')<0) console.warn('[TIENDA] falló la lectura de '+vieja, e);
    return _db.ref(nueva).once('value');
  });
}
// Igual que _leerTienda pero para nodos que además cuelgan del asesor, o sea
// gestiones_diarias. Hay dos claves que cambiaron en momentos distintos (la
// tienda por empresaId, el asesor por uid), así que se prueban en orden de más
// nuevo a más viejo y se copia al destino nuevo lo primero que aparezca:
//   1. tienda nueva + asesor nuevo   ← donde se escribe siempre
//   2. tienda nueva + asesor viejo   ← ya migró la tienda, falta la persona
//   3. tienda vieja + asesor viejo   ← no migró ninguna de las dos
// La copia es obligatoria: sin ella, la primera escritura crearía la ruta nueva
// con un solo día y el resto del historial dejaría de verse. El origen no se
// borra, así que se puede revisar y revertir.
//   rutaFn: (tk, ak) => 'gestiones_diarias/'+tk+'/'+mes+'/'+ak
function _leerGD(rutaFn){
  const tkN=_gdTK(), tkV=_gdTKLegacy(), akN=_gdAK(), akV=_gdAKLegacy(), akP=_gdAKPrevio();
  const destino=rutaFn(tkN, akN);
  // El nombre previo va primero entre las alternativas: si a la persona la
  // renombraron, su historial está bajo el nombre ANTERIOR, no bajo el actual.
  const alternativas=[
    akP?rutaFn(tkN, akP):null,
    rutaFn(tkN, akV),
    akP?rutaFn(tkV, akP):null,
    rutaFn(tkV, akV)
  ].filter(r=>r&&r!==destino);
  return _db.ref(destino).once('value').then(sn=>{
    if(sn.exists()||!alternativas.length) return sn;
    // Probar las viejas en orden hasta encontrar una con datos.
    const probar=i=>{
      if(i>=alternativas.length) return Promise.resolve(sn);
      return _db.ref(alternativas[i]).once('value').then(sv=>{
        if(!sv.exists()) return probar(i+1);
        // Mismo motivo que en _leerTienda: auditando se lee el legacy y punto.
        if(_esAuditoria()) return sv;
        console.log('[GD] migrando '+alternativas[i]+' → '+destino);
        return _db.ref(destino).set(sv.val())
          .then(()=>_db.ref(destino).once('value'))
          .catch(e=>{ console.warn('[GD] no se pudo migrar '+alternativas[i]+' → '+destino, e); return sv; });
      });
    };
    return probar(0);
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

// ── Imágenes de evidencias, fuera del registro ───────────────────────────
// Las fotos de evidencia se guardaban en base64 DENTRO de la novedad, así que
// leer novedades/{tienda} traía todas las imágenes aunque no se mostraran: 16 MB
// contra 0,26 MB de datos reales, y creciendo ~65 KB por cada foto nueva. Ahora
// el binario vive en nov_img/ y la evidencia solo guarda una marca.
//   nov_img/{tienda}/{mes}/{novedadId}/{solKey} = "data:image/jpeg;base64,..."
// Compatibilidad: las evidencias anteriores siguen con la imagen en `val`, y se
// leen igual. _novImgSrc resuelve las dos formas.
// Sin solKey devuelve el nodo de toda la novedad, para borrarla entera. La
// barra final rompe la ruta en Firebase, así que solo se agrega si hay clave.
function _novImgPath(tk, mes, novId, solKey){
  return 'nov_img/'+tk+'/'+mes+'/'+novId+(solKey?'/'+solKey:'');
}
// Devuelve la imagen de una evidencia, venga del registro (formato viejo) o del
// nodo aparte (formato nuevo). Siempre asíncrona para que el llamador no tenga
// que saber cuál de los dos es.
function _novImgSrc(sol, tk, mes, novId, solKey){
  const s=sol||{};
  if(s.val && String(s.val).startsWith('data:')) return Promise.resolve(s.val);   // formato viejo
  if(!s.img) return Promise.resolve('');
  return _db.ref(_novImgPath(tk, mes, novId, solKey)).once('value')
    .then(sn=>sn.val()||'').catch(()=>'');
}
// Comprobante de un anticipo, misma idea.
function _antCompPath(tk, mes, tipo, id){ return 'ant_comp/'+tk+'/'+mes+'/'+tipo+'/'+id; }
function _antCompSrc(reg, tk, mes, tipo, id){
  const r=reg||{};
  if(r.comprobante && String(r.comprobante).startsWith('data:')) return Promise.resolve(r.comprobante);
  if(!r.comp) return Promise.resolve('');
  return _db.ref(_antCompPath(tk, mes, tipo, id)).once('value')
    .then(sn=>sn.val()||'').catch(()=>'');
}

// ── Gestiones de novedades: la unidad que suma en Gestiones Diarias ──────
// Regla de negocio (confirmada 2026-08-03): **cada evidencia es una gestión y
// suma al asesor que la hizo, el día que la hizo**. Una novedad trabajada por
// dos personas cuenta dos veces, una para cada una — a propósito: la tabla mide
// trabajo hecho, no novedades cerradas. Antes se contaba una vez por novedad y,
// peor, sin filtrar por asesor: cada asesor de una tienda veía en su fila el
// total de TODA la tienda en vez de lo suyo.
//
// Compatibilidad: las evidencias viejas no guardan `asesor` ni `dia` (se empezó
// a guardar con este cambio). Para no borrar historial al recalcular un día
// viejo, caen al asesor y al día de la novedad, que es la mejor aproximación
// disponible. Por eso el conteo de un día anterior al cambio sigue dando algo
// parecido a lo que ya mostraba, en vez de cero.
//
// Devuelve [{estado, asesorKey, dia}] solo de las evidencias que definen
// resultado; las que no lo tienen (estado vacío) no son gestiones y no suman.
function _novGestionesDe(n, mes){
  const keyDe = typeof _gdKey==='function' ? _gdKey : _gdKeyFallback;
  return _novGetSols(n||{})
    .filter(s=>s && (s.estado==='solucionada' || s.estado==='devuelta'))
    // Una evidencia de otro mes no suma en este (el nodo de GD es por mes).
    .filter(s=>!mes || !s.mes || s.mes===mes)
    .map(s=>({
      estado: s.estado,
      // El uid manda: es lo único que no cambia si renombran a la persona. Las
      // evidencias anteriores a este cambio no lo traen y caen al slug del
      // nombre, que es la clave con la que se guardaron en su momento.
      asesorKey: s.asesorUid || keyDe(s.asesor || (n||{}).asesor || ''),
      dia: s.dia || (n||{}).dia || 0
    }));
}

// Cuenta las gestiones de un asesor en un día concreto, sobre todas las
// novedades del mes. `novs` es el objeto crudo de novedades/{tienda}/{mes}.
//
// `asesorKey` acepta una clave o varias. Hacen falta las dos porque conviven dos
// formas de identificar a la misma persona: las evidencias guardadas desde el
// paso a identidad por uid traen `asesorUid`, y las anteriores solo el nombre,
// que se resuelve al slug. Si se comparara contra el uid nada más, todo lo
// cargado antes dejaría de contar y los contadores caerían a cero solos en
// cuanto alguien tocara una novedad.
function _novContarDia(novs, asesorKey, dia, mes){
  const claves=(Array.isArray(asesorKey)?asesorKey:[asesorKey]).filter(Boolean);
  let soluc=0, devuelt=0;
  Object.values(novs||{}).forEach(n=>{
    _novGestionesDe(n, mes).forEach(g=>{
      if(g.dia!==dia || !claves.includes(g.asesorKey)) return;
      if(g.estado==='devuelta') devuelt++; else soluc++;
    });
  });
  return {soluc, devuelt};
}
// Las dos claves de la persona de la sesión: uid (nueva) y slug del nombre
// (con la que se guardaron las evidencias anteriores).
function _clavesAsesorSesion(){
  const nom = window.getLoginAsesor ? window.getLoginAsesor() : '';
  return [...new Set([_gdAK(), _gdKey(nom||'_')].filter(k=>k&&k!=='_'))];
}
// _roAutoSync/_roSyncFromGestion: sincroniza el tracking de "Reclamo en Oficina"
// a Firebase desde Gestión Logística en cada guardado de gestión — llamada de
// forma incondicional desde el módulo legacy, por eso vive aquí y no en
// gestiones-diarias.js (su UI/caché en memoria de GD se actualiza solo si
// esa página está cargada, ver guards de typeof adentro).
// ── R.O. (Reclamo en Oficina) ────────────────────────────────────────────
// Reglas confirmadas por el usuario el 2026-08-04, después de encontrar los
// mismos pedidos duplicados en dos meses con estados que se contradecían:
//
//  1. UNA GUÍA, UN REGISTRO. Si la guía ya está en el mes, no se crea otro.
//     Antes no se podían reconocer entre sí: el Gestor Logístico guardaba con
//     la guía como clave y el alta manual de Gestiones Diarias con una clave
//     push, así que el mismo pedido entraba dos veces.
//  2. EL ESTADO ES DEL ASESOR. R.O. sigue si el cliente ya recogió el paquete, y
//     eso solo lo sabe quien habla con él. El registro nace PENDIENTE y desde
//     ahí solo lo cambia una persona. Antes se derivaba del tablero y
//     `gestion_final` —que es "cerré la card"— se guardaba como ENTREGADO:
//     había pedidos marcados como entregados cuya propia nota decía que el
//     cliente todavía no había reclamado. Además se escribía con .set(), así
//     que cada carga de Excel pisaba lo corregido a mano.
//  3. GESTIONAR EN EL TABLERO SOLO TOCA DOS CAMPOS: nota de seguimiento y fecha
//     de actualización de estado. Nada más.
//  4. EL MES ES EL DE HOY, no el del Excel. Con el mes del Excel, el kanban
//     escribía en julio mientras Gestiones Diarias miraba agosto: el asesor no
//     veía lo que generaba la carga y lo terminaba cargando a mano.
function _roMes(){ return _hoyLocal().slice(0,7); }

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
  _leerTienda(tk=>'ro/'+tk+'/'+_roMes())
    .catch(()=>{})
    // soloCrear: cargar un Excel no es gestionar. Los pedidos que ya tienen
    // registro se dejan intactos —estado, notas y fechas son del asesor—; solo
    // se dan de alta los que faltan.
    .then(()=>oficinas.forEach(p=>_roSyncFromGestion(p.id, true)))
    .then(()=>_roCerrarPorExcel());
}

// ENTREGADO y DEVUELTO son los dos estados que NO pone el asesor: los dice el
// Excel, que es lo que reporta la transportadora. Antes se deducían de lo que se
// hacía en el tablero —cerrar una card se guardaba como ENTREGADO— y quedaban
// pedidos marcados como entregados cuya propia nota decía que el cliente no
// había reclamado.
//
// Los dos desenlaces desaparecen del kanban (mapEstado los descarta: no hay nada
// que gestionar), y justamente por eso su registro de R.O. se quedaba esperando
// para siempre. Las guías se recogen durante el parseo, antes del descarte.
//
// Se revisan el mes actual y el anterior: un pedido de fin de julio que se cierra
// en agosto tiene su registro de R.O. en julio, y mirando solo el mes en curso
// no se cerraría nunca.
function _roCerrarPorExcel(){
  // guía normalizada → estado con el que hay que cerrarla.
  const destinoDe = new Map();
  (window._guiasEntregadas||new Set()).forEach(g=>destinoDe.set(_novNormGuia(g),'ENTREGADO'));
  // Entregado gana si una guía apareciera en las dos listas: es el desenlace
  // más avanzado y significa que el paquete llegó a manos del cliente.
  (window._guiasDevueltas||new Set()).forEach(g=>{
    const k=_novNormGuia(g);
    if(!destinoDe.has(k)) destinoDe.set(k,'DEVUELTO');
  });
  if(!destinoDe.size) return Promise.resolve();
  if(typeof _db==='undefined' || !_tiendaLista('cierre de R.O.')) return Promise.resolve();
  const hoy = _hoyLocal();
  const [y,m] = _roMes().split('-').map(Number);
  const prev = new Date(y, m-2, 1);   // m-2: getMonth es 0-based y se busca el anterior
  const meses = [...new Set([_roMes(), prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0')])];
  return Promise.all(meses.map(mes=>{
    const base = 'ro/'+_gdTK()+'/'+mes;
    return _db.ref(base).once('value').then(snap=>{
      const updates = {};
      let entregados=0, devueltos=0;
      Object.entries(snap.val()||{}).forEach(([k,r])=>{
        if(!r) return;
        const destino = destinoDe.get(_novNormGuia(r.guia));
        if(!destino) return;              // el pedido sigue su curso
        if(r.estado===destino) return;    // ya estaba cerrado así
        updates[k+'/estado'] = destino;
        updates[k+'/fechaEstado'] = hoy;
        destino==='ENTREGADO' ? entregados++ : devueltos++;
      });
      const n = entregados+devueltos;
      if(!n) return;
      return _db.ref(base).update(updates).then(()=>{
        const detalle = [entregados?entregados+' entregado'+(entregados!==1?'s':''):'',
                         devueltos?devueltos+' devuelto'+(devueltos!==1?'s':''):''].filter(Boolean).join(' y ');
        console.log('[R.O.] '+mes+': '+detalle+' según el Excel');
        if(typeof toast==='function') toast('📦 R.O. actualizado: '+detalle,4000);
      });
    });
  })).then(()=>{
    // Repintar si la pestaña R.O. está abierta en Gestiones Diarias.
    const tabRo=document.getElementById('gd-tab-ro');
    if(tabRo&&tabRo.style.display!=='none'&&typeof _roInit==='function')_roInit();
  }).catch(e=>console.warn('[R.O. entregados]',e));
}

// ── ANTICIPOS: actualizar el estado desde el Excel ───────────────────────
// Las dos tablas de Anticipos (con y sin) se cruzan con el Excel del Gestor
// Logístico POR TELÉFONO, que es el único dato que comparten: esas tablas no
// registran la guía.
//
// Solo ACTUALIZA. Nunca da de alta: un anticipo lo decide una persona, y crear
// filas por cada teléfono del Excel llenaría la tabla con clientes que nunca
// pidieron uno.
//
// Vive acá y no en gestiones-diarias.js porque quien dispara esto es el Gestor
// Logístico, que es otra página; app-shared.js lo cargan las cuatro.
const _ANT_PRIO={'ENTREGADO':4,'DEVUELTO':3,'EN PROCESO':2,'SIN ENVIAR':1};

// Últimos 10 dígitos: en las tablas los teléfonos se escriben a mano y llegan
// con espacios, guiones o el +57 adelante, así que "+57 300 111 2233" y
// "3001112233" tienen que cruzar. Mismo criterio que usa el bot de ventas.
function _antNormTel(v){
  const d=String(v==null?'':v).replace(/\D/g,'');
  return d.length>=10 ? d.slice(-10) : (d||'');
}

// De los estados de la transportadora a los cuatro de Anticipos:
//   · entregado                    → ENTREGADO
//   · cualquier devolución         → DEVUELTO
//   · pendiente/cancelado/anulado  → SIN ENVIAR   (nunca salió)
//   · el resto, que es lo que está en la calle con guía → EN PROCESO
//
// "entregado" se exige al PRINCIPIO para que un "NO ENTREGADO" no cuente como
// entregado, y "entregada a conexiones" —que es tránsito— tampoco entre. En
// devolución basta con que aparezca: sus variantes ("en proceso de devolución",
// "tránsito a devolución proveedor") significan todas lo mismo acá.
function _antEstadoDeExcel(estNorm){
  const n=String(estNorm||'');
  if(!n) return null;
  if(n.startsWith('entregado')) return 'ENTREGADO';
  if(n.includes('devolucion')||n.includes('devuelt')) return 'DEVUELTO';
  if(n.includes('pendiente')||n.includes('cancelad')||n.includes('rechazad')||n.includes('anulad')) return 'SIN ENVIAR';
  return 'EN PROCESO';
}

// Se revisan el mes actual y el anterior, igual que R.O.: un anticipo de fin de
// julio que se entrega en agosto vive en la tabla de julio, y mirando solo el
// mes en curso no se actualizaría nunca.
function _antSyncPorExcel(){
  const mapa=window._telEstadoExcel;
  if(!mapa||!mapa.size) return Promise.resolve();
  if(typeof _db==='undefined') return Promise.resolve();
  if(typeof _esAuditoria==='function'&&_esAuditoria()) return Promise.resolve();
  if(!_tiendaLista('sincronización de anticipos')) return Promise.resolve();
  const mesHoy=_hoyLocal().slice(0,7);
  const [y,m]=mesHoy.split('-').map(Number);
  const prev=new Date(y,m-2,1);   // m-2: getMonth es 0-based y se busca el anterior
  const meses=[...new Set([mesHoy, prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0')])];
  const tk=_gdTK();
  const tareas=[];
  meses.forEach(mes=>['con','sin'].forEach(tipo=>{
    const base='anticipos/'+tk+'/'+mes+'/'+tipo;
    // Se lee con _leerTienda y no con _db.ref directo: las tiendas que todavía
    // guardan bajo la clave vieja se migran al leer, y sin eso acá no se
    // encontraría nada y la sincronización pasaría en silencio. La auditoría ya
    // quedó descartada arriba, así que lo que devuelve es siempre la clave
    // nueva y las claves de los registros coinciden con `base`.
    tareas.push(_leerTienda(tk2=>'anticipos/'+tk2+'/'+mes+'/'+tipo).then(snap=>{
      const updates={}; let n=0;
      Object.entries(snap.val()||{}).forEach(([k,r])=>{
        if(!r||!r.telefono) return;
        const destino=mapa.get(_antNormTel(r.telefono));
        if(!destino) return;                 // ese cliente no está en el Excel
        if((r.estado||'')===destino) return; // ya estaba así
        updates[k+'/estado']=destino; n++;
      });
      if(!n) return 0;
      return _db.ref(base).update(updates).then(()=>n);
    }).catch(e=>{ console.warn('[ANTICIPOS] '+base, e); return 0; }));
  }));
  return Promise.all(tareas).then(res=>{
    const total=res.reduce((a,b)=>a+(b||0),0);
    if(!total) return;
    console.log('[ANTICIPOS] '+total+' guía(s) actualizadas según el Excel');
    if(typeof toast==='function') toast('📦 Anticipos: '+total+' guía'+(total!==1?'s':'')+' con estado actualizado',4000);
    // Repintar si la pestaña está abierta en Gestiones Diarias.
    const tab=document.getElementById('gd-tab-anticipos');
    if(tab&&tab.style.display!=='none'&&typeof _antInit==='function') _antInit();
  });
}

function _roSyncFromGestion(id, soloCrear){
  try{
    if(typeof _db==='undefined'||!window._currentUsername)return;
    const p=_pedidoMap.get(id);
    if(!p||p.estadoKey!=='oficina'||!p.guia)return;
    const g=gestiones[id]||{};
    const notas=g.notas||(g.nota?[{texto:g.nota,fecha:new Date().toLocaleDateString('es-CO'),ts:Date.now()}]:[]);
    const hoy=_hoyLocal();
    const mes=_roMes();
    const tel=(p.telefono||'').replace(/^57/,'');
    const rKey=_fbKey(p.guia);
    const base='ro/'+_gdTK()+'/'+mes;
    // Se lee el mes entero y se busca por GUÍA, no por clave: un registro dado
    // de alta a mano en Gestiones Diarias tiene una clave push que jamás
    // coincidiría con la de la guía, y se duplicaría.
    _db.ref(base).once('value').then(snap=>{
      const data=snap.val()||{};
      const guiaK=_novNormGuia(p.guia);
      let existente=Object.entries(data).find(([,r])=>_novNormGuia(r&&r.guia)===guiaK);
      // Respaldo por teléfono: cuando el asesor da de alta una fila a mano suele
      // llenar teléfono y nota y dejar la guía vacía —así están los registros
      // reales—, y buscando solo por guía no se la encontraba y se creaba un
      // duplicado del mismo cliente. Solo se adoptan filas SIN guía: si tiene
      // una guía distinta es otro pedido, aunque sea del mismo teléfono.
      if(!existente && tel){
        existente=Object.entries(data).find(([,r])=>r && !(r.guia||'').trim() && (r.telefono||'').trim()===tel);
      }
      if(existente){
        if(soloCrear) return;   // ya está: la carga del Excel no lo toca
        // Gestionado desde el tablero: la nota, la fecha de estado y —solo desde
        // PENDIENTE— el paso a EN PROCESO.
        const upd={fechaEstado:hoy};
        const reg=existente[1]||{};
        const notaUlt=notas.length?notas[notas.length-1].texto:'';
        // A DÓNDE VA LA NOTA. La primera gestión de una guía es el primer
        // contacto con el cliente, así que su nota es la NOTA DEL CLIENTE; solo
        // cuando esa columna ya tiene algo, lo que se escriba después es
        // seguimiento. Antes todo caía en seguimiento y la columna de primer
        // contacto quedaba vacía para siempre, incluso en registros que nacieron
        // de la carga del Excel sin ninguna nota todavía.
        //
        // SI LA NOTA YA ESTÁ GUARDADA, NO SE VUELVE A ESCRIBIR. Esta función se
        // llama desde siete puntos del tablero —guardar la nota, marcar la
        // gestión, cambiar el resultado…— y todos mandan la misma última nota. Sin
        // esta comprobación, la segunda llamada veía notaCliente ya lleno y
        // copiaba la MISMA frase en notaSeguimiento: la nota aparecía en las dos
        // columnas con una sola gestión, que es lo que se reportó.
        if(notaUlt
           && (reg.notaCliente||'').trim()!==notaUlt
           && (reg.notaSeguimiento||'').trim()!==notaUlt){
          if(!(reg.notaCliente||'').trim()) upd.notaCliente=notaUlt;
          else upd.notaSeguimiento=notaUlt;
        }
        // PENDIENTE → EN PROCESO. Que alguien gestionó el pedido es un hecho del
        // tablero, no una suposición, así que este salto sí puede darlo la app.
        //
        // SOLO DESDE PENDIENTE: cualquier otro estado lo puso una persona —o el
        // Excel, en ENTREGADO y DEVUELTO— y no se pisa. Es la regla que se fijó el
        // 2026-08-04, cuando el tablero marcaba ENTREGADO por su cuenta y quedaban
        // pedidos "entregados" cuya propia nota decía que el cliente no había
        // reclamado. Adelantar PENDIENTE → EN PROCESO no inventa ningún desenlace.
        const estActual=(reg.estado||'').trim();
        if(!estActual || estActual==='PENDIENTE') upd.estado='EN PROCESO';
        // Si se adoptó por teléfono, se completan los huecos que el asesor no
        // llenó. No pisa nada —solo escribe donde estaba vacío— y evita que la
        // próxima carga vuelva a no reconocer la fila.
        if(!(reg.guia||'').trim() && p.guia) upd.guia=p.guia;
        if(!(reg.cliente||'').trim() && p.nombre) upd.cliente=p.nombre;
        return _db.ref(base+'/'+existente[0]).update(upd);
      }
      // Alta: la primera nota va como nota de cliente. El seguimiento solo se
      // llena si YA hay más de una nota: con una sola, la misma frase aparecía
      // repetida en las dos columnas.
      //
      // Nace PENDIENTE si lo está creando la carga del Excel, y EN PROCESO si lo
      // crea una gestión —que es el caso de una guía que se gestiona antes de que
      // el registro exista—. Con PENDIENTE fijo, esa gestión no se veía por ningún
      // lado en R.O.
      const naceGestionado=!soloCrear && notas.length>0;
      return _db.ref(base+'/'+rKey).set({
        guia:p.guia, cliente:p.nombre||'', telefono:tel,
        notaCliente:notas.length?notas[0].texto:'',
        notaSeguimiento:notas.length>1?notas[notas.length-1].texto:'',
        estado:naceGestionado?'EN PROCESO':'PENDIENTE',
        fechaContacto:hoy, fechaEstado:naceGestionado?hoy:'',
        ts:Date.now(), _fromLogistica:true
      });
    }).then(()=>{
      // Refrescar la UI de Gestiones Diarias solo si esa página está cargada (en
      // gestion-logistica.html estas variables/función no existen — el registro
      // en Firebase ya se hizo, esto es solo repintado).
      // Se repinta releyendo de Firebase en vez de parchear _roData a mano: la
      // clave del registro puede no ser la de la guía —si lo dieron de alta a
      // mano es una clave push— y escribir en la caché con la clave equivocada
      // metía una fila fantasma que no existía en la base.
      if(typeof _gdMes==='undefined')return;
      if(!_gdMes||_gdMes===mes){
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
    if(_getCameFromAdmin()){
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
  window._refrescarBtnCambiarTienda();
};
// Visibilidad de "🏪 Cambiar tienda". Aparte de _gdMostrarModeSelect porque la
// lista de tiendas puede llegar después (la relectura de user_tiendas es
// asíncrona) y entonces hay que repintar el botón sin rearmar todo el selector.
window._refrescarBtnCambiarTienda = function(){
  const btn = document.getElementById('mss-btn-cambiar-tienda');
  if(!btn) return;
  btn.style.display = _getTiendaIds().length > 1 ? 'block' : 'none';
};
window._cambiarTienda = function(){
  const uid = localStorage.getItem('lgs_user');
  const asesor = localStorage.getItem('lgs_asesor');
  const ids = _getTiendaIds();
  if(!uid || !ids.length) return;
  document.getElementById('mode-select-screen').style.display='none';
  _mostrarSelectorTienda(uid, asesor, ids);
};

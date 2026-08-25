// ── MÓDULO INTEGRACIONES ─────────────────────────────────────────────────
// Las conexiones de LA TIENDA ACTIVA: ChateaPro hoy, Dropi en el paso siguiente.
//
// Es un módulo propio y no una pestaña del Centro de Operaciones porque los dueños
// de tienda no entran ahí, y son ellos quienes tienen que poder conectar lo suyo.
// La tienda ya viene elegida del selector, así que acá no se vuelve a preguntar:
// se lee la activa, igual que Gestiones Diarias y Control Financiero.
//
// El Centro de Operaciones mantiene su pestaña para que un admin vea de un vistazo
// qué tiene conectado cada tienda; la edición vive acá.

let _intWs = {};          // { codigo: {...} } los workspaces de esta tienda

function _intTK(){ return (typeof _gdTK==='function') ? _gdTK() : ''; }
function _intTiendaNombre(){
  return (window.getLoginTienda ? window.getLoginTienda() : '') || 'esta tienda';
}
// Conectar una integración da acceso a registrar ventas y a la cuenta de Dropi
// entera: es cosa del dueño, no de quien gestiona el día. En auditoría tampoco,
// que es de solo lectura por diseño.
function _intPuedeEditar(){
  const auditando = (typeof _esAuditoria==='function') && _esAuditoria();
  // Mismo criterio que _gdEsDueno en gestiones-diarias.js, escrito acá porque ese
  // archivo no se carga en esta página. Si algún día se mueve a app-shared, esta
  // copia se borra y se llama a la de allá.
  const rol = window._currentRol || localStorage.getItem('lgs_rol') || 'dueno';
  return rol !== 'asesor' && !auditando;
}

function _intVolver(){
  document.getElementById('int-panel').style.display='none';
  if(typeof _gdMostrarModeSelect==='function'){
    _gdMostrarModeSelect(localStorage.getItem('lgs_asesor')||'');
  }else{
    document.getElementById('mode-select-screen').style.display='flex';
  }
}

async function _intInit(){
  const cont=document.getElementById('int-lista');
  if(!cont) return;
  const tit=document.getElementById('int-title');
  if(tit) tit.textContent='INTEGRACIONES — '+_intTiendaNombre().toUpperCase();

  if(typeof _db==='undefined'){ cont.innerHTML='<div class="adm-empty">Sin conexión.</div>'; return; }
  const tk=_intTK();
  if(!tk){ cont.innerHTML='<div class="adm-empty">No hay una tienda activa.</div>'; return; }

  cont.innerHTML='<div class="adm-empty">Cargando...</div>';
  try{
    // Se consulta FILTRANDO por esta tienda, no el nodo entero: las reglas solo
    // aceptan la lectura así, y de paso las claves de otras tiendas no llegan al
    // navegador. Ver "bot_workspaces" en functions/reglas-firebase.json.
    const snap = await _db.ref('bot_workspaces').orderByChild('empresaId').equalTo(tk).once('value');
    _intWs = snap.val() || {};
    _intRender();
  }catch(e){
    cont.innerHTML='<div class="adm-empty">No se pudieron leer las integraciones.<br>'+
      '<span style="font-size:.7rem;">'+esc(e.message)+'</span></div>';
  }
}

function _intRender(){
  const cont=document.getElementById('int-lista');
  if(!cont) return;
  const puede=_intPuedeEditar();
  const codigos=Object.keys(_intWs);

  cont.innerHTML =
    `<div class="int-intro">
       Cada servicio que conectes acá trabaja con <b>${esc(_intTiendaNombre())}</b>.
       Para conectar otra tienda, cambiala arriba y volvé a entrar.
     </div>` +
    (puede ? '' :
     `<div class="botw-doc-nota warn">Solo el dueño de la tienda puede conectar o cambiar
      integraciones. Acá podés ver lo que hay conectado.</div>`) +
    _intChateaPro(codigos, puede) +
    _intDropi(puede);
}

// ── ChateaPro ────────────────────────────────────────────────────────────
function _intChateaPro(codigos, puede){
  const conectada = codigos.length>0;
  let cuerpo;

  if(!conectada){
    cuerpo = `<div class="int-vacio">Todavía no está conectada.</div>` +
      (puede ? `<div class="int-nuevo">
          <input type="text" id="int-cp-codigo" placeholder="Código del workspace (ej: 220003)" autocomplete="off">
          <button onclick="_intCrearWs()">Conectar</button>
        </div>
        <div class="botw-doc-nota">El código es el id del workspace en ChateaPro, un número
        como 220003. Tiene que ser <b>el mismo</b> que el bot manda en el payload.</div>` : '');
  }else{
    cuerpo = codigos.map(code=>{
      const w=_intWs[code]||{};
      const activo = w.activo !== false;
      return `<div class="int-conn">
        <div class="int-conn-top">
          <div>
            <div class="int-conn-code">${esc(code)}</div>
            <div class="int-conn-est ${activo?'ok':'off'}">${activo?'● Activa':'○ Revocada'}</div>
          </div>
        </div>
        <div class="botw-key-row">
          <input type="password" readonly value="${esc(w.apiKey||'')}" id="botw-k-${esc(code)}" class="botw-key">
          <button onclick="_botwVer('${esc(code)}',this)" title="Mostrar u ocultar">👁</button>
          <button onclick="_botwCopiar('${esc(code)}')" title="Copiar">📋</button>
        </div>
        <div class="botw-acciones">
          <button onclick="_botwDocs('${esc(code)}',this,'ventas')">📄 Agente de ventas</button>
          <button onclick="_botwDocs('${esc(code)}',this,'carritos')">🛒 Agente de carritos</button>
          ${puede?`<button onclick="_botwToggle('${esc(code)}')">${activo?'Revocar':'Reactivar'}</button>
                   <button onclick="_botwRegenerar('${esc(code)}')">Generar clave nueva</button>`:''}
        </div>
        <div class="botw-docs" id="botw-docs-${esc(code)}" style="display:none;"></div>
      </div>`;
    }).join('');
  }

  return `<div class="int-card">
    <div class="int-card-hdr">
      <div class="int-ico">🤖</div>
      <div>
        <div class="int-nombre">ChateaPro</div>
        <div class="int-desc">Registra en la plataforma las ventas y los carritos que atiende el bot</div>
      </div>
    </div>
    ${cuerpo}
  </div>`;
}

// Alta de la conexión con ChateaPro. La clave se genera acá y se muestra una vez:
// no hace falta pedirla ni inventarla a mano.
window._intCrearWs = async function(){
  if(!_intPuedeEditar()){ toast('Solo el dueño puede conectar integraciones'); return; }
  const inp=document.getElementById('int-cp-codigo');
  const code=(inp?inp.value:'').trim();
  if(!code){ toast('Escribí el código del workspace'); if(inp) inp.focus(); return; }
  if(typeof _tiendaLista==='function' && !_tiendaLista('la integración')) return;

  const tk=_intTK();
  try{
    // Que el código no esté tomado por OTRA tienda: el workspace identifica a
    // quién le entran las ventas, y dos tiendas con el mismo código se las
    // pisarían. La lectura puntual está permitida por las reglas.
    const ya = await _db.ref('bot_workspaces/'+_fbKey(code)).once('value');
    if(ya.exists() && (ya.val()||{}).empresaId !== tk){
      toast('Ese código ya está usado por otra tienda', 5000); return;
    }
    const apiKey = _intGenerarClave();
    await _db.ref('bot_workspaces/'+_fbKey(code)).set({
      empresaId: tk, nombre: _intTiendaNombre(), apiKey, activo: true, ts: Date.now()
    });
    toast('✓ ChateaPro conectada');
    _intInit();
  }catch(e){
    toast('⚠️ No se pudo conectar: '+(e&&e.message||e), 5000);
  }
};

// 32 caracteres de crypto.getRandomValues, no Math.random: esta clave es lo único
// que separa a quien puede registrar ventas en la tienda de quien no.
function _intGenerarClave(){
  const b=new Uint8Array(24);
  crypto.getRandomValues(b);
  return 'ws_'+Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');
}

// ── Dropi ────────────────────────────────────────────────────────────────
// Todavía no: la conexión que existe es global (dropi_oauth/cuenta) y hay que
// pasarla a una por tienda antes de ofrecerla acá. Se muestra el bloque para que
// se vea que viene, sin botón que haga algo a medias.
function _intDropi(puede){
  return `<div class="int-card int-card-pronto">
    <div class="int-card-hdr">
      <div class="int-ico">📦</div>
      <div>
        <div class="int-nombre">Dropi <span class="int-pronto">PRÓXIMAMENTE</span></div>
        <div class="int-desc">Stock del proveedor, cotizar el flete antes de generar la guía y ciudades con código DANE</div>
      </div>
    </div>
    <div class="int-vacio">La conexión con Dropi está en pruebas y todavía funciona con una sola
    cuenta. Se habilita acá cuando cada tienda pueda conectar la suya.</div>
  </div>`;
}

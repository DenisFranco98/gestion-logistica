const LS_KEY='dropi_logv4';
const LS_HIST='dropi_hist_wa';
const LS_CFG='dropi_cfg_v1';
const LS_NOTES='dropi_notas_v1'; // notas guardadas por guía (clave estable)
let sesionInicio=null, tiemposPorSeccion={};
let ultimaGestion=Date.now(), contadorAlertasInactividad=0;
let _inactTimer=null;
let pausaActiva=false, pausaInicio=null, totalPausadoMs=0, contadorPausas=0;

// ── CONFIGURACIÓN ─────────────────────────────────────────────────────────
// CFG.tiendas      → [{nombre, tel, color}]  — las tiendas con sus datos
// CFG.mapeoAT      → {'CHATEA PRO':'Al Natural', 'LUCIDBOT':'Importados', '__empty__':'Al Natural'}
//                    clave = valor crudo de col AT (o '__empty__' para celdas vacías)
//                    valor = nombre de tienda (o '' = sin tienda)
// ── DEFAULTS WA ────────────────────────────────────────────────────────
const WA_CATS=[
  {key:'reparto',    label:'Reparto'},
  {key:'telemercadeo',label:'Telemercadeo'},
  {key:'oficina',    label:'Oficina'},
  {key:'transito',   label:'Tránsito'},
];
const WA_NOV_CATS=[
  {key:'coordinar', label:'Coordinar entrega'},
  {key:'norecibe',  label:'No hay quien reciba'},
  {key:'direccion', label:'Dirección incorrecta'},
  {key:'nopaga',    label:'No pagará'},
  {key:'rehusa',    label:'Se rehúsa a recibir'},
  {key:'otra',      label:'Otra novedad'},
];

const CAS_DEFAULT_SIN_MOVIMIENTO='Buenos días. La orden lleva más de 24 horas sin movimiento. Solicitamos seguimiento con la transportadora para conocer el estado del paquete y garantizar la entrega. Quedamos atentos.';
const CAS_DEFAULT_NOVEDAD='Buenos días. La orden presenta una novedad sin resolver desde hace varios días. Hemos gestionado con el cliente pero requerimos apoyo para dar solución y concretar la entrega. Quedamos atentos.';

let CFG={
  negocio:'Gestión Logística',
  bot:'ChateaPro',
  tiendas:[],
  mapeoAT:{},
  casSinMovimiento:CAS_DEFAULT_SIN_MOVIMIENTO,
  casNovedad:CAS_DEFAULT_NOVEDAD,
  waMsgs:{},
  waNov:{},
  novSolucion:{}
};

let _exccelTiendas=[];   // valores únicos crudos de col AT (sin vacías)
let _hayVaciasAT=false;  // si hay IDs con guía y AT vacío

function cfgCargar(){
  try{
    const s=localStorage.getItem(LS_CFG);
    if(s)CFG={...CFG,...JSON.parse(s)};
    if(!CFG.casSinMovimiento)CFG.casSinMovimiento=CAS_DEFAULT_SIN_MOVIMIENTO;
    if(!CFG.casNovedad)CFG.casNovedad=CAS_DEFAULT_NOVEDAD;
    if(!CFG.waMsgs)CFG.waMsgs={};
    if(!CFG.waNov)CFG.waNov={};
    if(!CFG.novSolucion||!Object.keys(CFG.novSolucion).length)CFG.novSolucion=Object.assign({},NOV_SOLUCION_DEFAULT);
  }catch(e){}
}
function cfgGuardarLS(){
  try{localStorage.setItem(LS_CFG,JSON.stringify(CFG));}catch(e){}
}
function cfgGetTel(tienda){
  const t=(CFG.tiendas||[]).find(x=>norm(x.nombre)===norm(tienda||''));
  return t?'+'+t.tel:(CFG.tiendas.length?'+'+CFG.tiendas[0].tel:'');
}
function cfgGetColor(tienda){
  const t=(CFG.tiendas||[]).find(x=>norm(x.nombre)===norm(tienda||''));
  return t?t.color:null;
}
function getTienda(valorAT){
  const raw=String(valorAT||'').trim();
  const clave=raw||'__empty__';
  const mapeado=(CFG.mapeoAT||{})[clave];
  if(mapeado!==undefined)return mapeado; // puede ser '' = sin tienda
  // Si no está en el mapa, devolver el valor crudo
  return raw;
}

// ── MODAL CONFIG ──────────────────────────────────────────────────────────
function cfgCheckPrimerUso(){
  cfgCargar();
  const _h1=document.querySelector('#topnav h1')||document.querySelector('header h1');if(_h1)_h1.textContent='\uD83D\uDE9A '+(CFG.negocio||'Gestión Logística');
}


let _cfgOnboarding=false;
let _cfgSeccionActual='menu';

function cfgMostrarMenu(){
  _cfgSeccionActual='menu';
  ['cfg-menu','cfg-sec-tiendas','cfg-sec-cas','cfg-sec-wa'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.style.display=id==='cfg-menu'?'block':'none';
  });
  document.getElementById('cfg-header-title').textContent='⚙️ Configuración';
  document.getElementById('cfg-header-desc').textContent='Ajusta la herramienta según tu operación.';
  document.getElementById('cfg-btn-guardar').style.display='none';
  document.getElementById('cfg-footer').querySelector('.btn-config-edit').textContent='Cerrar';
}

function cfgMostrarSeccion(sec){
  _cfgSeccionActual=sec;
  ['cfg-menu','cfg-sec-tiendas','cfg-sec-cas','cfg-sec-wa'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.style.display='none';
  });
  const titles={tiendas:['🏪 Tiendas','Configura las tiendas detectadas en tu Excel.'],cas:['📋 Mensajes CAS','Textos para reportar casos en Dropi CAS y soluciones de novedad.'],wa:['💬 Mensajes WhatsApp','Personaliza los mensajes enviados a los clientes.']};
  document.getElementById('cfg-header-title').textContent=titles[sec][0];
  document.getElementById('cfg-header-desc').textContent=titles[sec][1];
  document.getElementById('cfg-btn-guardar').style.display='block';
  document.getElementById('cfg-footer').querySelector('.btn-config-edit').textContent='Cancelar';
  if(sec==='tiendas'){
    document.getElementById('cfg-sec-tiendas').style.display='block';
  } else if(sec==='cas'){
    document.getElementById('cfg-sec-cas').style.display='block';
    document.getElementById('cfg-cas-sinmov').value=CFG.casSinMovimiento||CAS_DEFAULT_SIN_MOVIMIENTO;
    document.getElementById('cfg-cas-novedad').value=CFG.casNovedad||CAS_DEFAULT_NOVEDAD;
    const src=CFG.novSolucion||NOV_SOLUCION_DEFAULT;
    const novSolCont=document.getElementById('cfg-novsol-rows');
    novSolCont.innerHTML=WA_NOV_CATS.map(c=>
      '<label style="font-size:.72rem;font-weight:600;color:var(--text-2);margin:8px 0 3px;display:block">'+c.label+'</label>'+
      '<textarea id="cfg-novsol-'+c.key+'" rows="2" style="width:100%;resize:vertical;border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;font-size:.76rem;font-family:inherit;color:var(--text-1);outline:none;transition:border .15s;" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'#e2e8f0\'">'+(src[c.key]||NOV_SOLUCION_DEFAULT[c.key])+'</textarea>'
    ).join('');
  } else if(sec==='wa'){
    const waEl=document.getElementById('cfg-sec-wa');
    waEl.style.display='flex';
    _wamTabActual='reparto';_wamNovActual='coordinar';
    const tabs=document.getElementById('wam-tabs');
    tabs.innerHTML=[...WA_CATS,{key:'novedad',label:'Novedad'}].map(c=>
      '<button class="wam-tab'+(c.key===_wamTabActual?' activo':'')+'" data-tab="'+c.key+'" onclick="wamCambiarTab(\''+c.key+'\')">'+c.label+'</button>'
    ).join('');
    const vars=document.getElementById('wam-vars');
    vars.innerHTML=_WA_VARS.map(v=>'<span class="wam-var" onclick="wamInsertarVar(\''+v+'\')" title="Clic para insertar">'+v+'</span>').join('');
    const sel=document.getElementById('wam-nov-sel');
    sel.innerHTML=WA_NOV_CATS.map(c=>'<option value="'+c.key+'">'+c.label+'</option>').join('');
    wamActualizarVista();
  }
}

function abrirConfig(irA){
  // Solo reconstruir tiendas desde el Excel si hay datos detectados
  if(_exccelTiendas.length>0||_hayVaciasAT){
    const COLORES_TIENDA={'chatea pro':'#29b6f6','chateapro':'#29b6f6','shopify':'#96bf48','dropi':'#f97316','lucybot':'#a855f7','lucidbot':'#a855f7','tiktok':'#000000','woocommerce':'#7f54b3'};
    const _colorTienda=(nombre,prev)=>prev?.color||(COLORES_TIENDA[nombre.toLowerCase().trim()])||TIENDA_PALETA[CFG.tiendas.length%TIENDA_PALETA.length];
    const guardadas=(CFG.tiendas||[]);
    CFG.tiendas=[];
    const _prev=n=>guardadas.find(t=>t.nombre.toLowerCase().trim()===n.toLowerCase().trim());
    _exccelTiendas.forEach(raw=>{
      const nombre=raw.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
      const prev=_prev(nombre);
      CFG.tiendas.push({nombre,tel:prev?.tel||'',color:_colorTienda(nombre,prev)});
    });
    if(_hayVaciasAT){
      const prev=_prev('Dropi');
      CFG.tiendas.push({nombre:'Dropi',tel:prev?.tel||'',color:_colorTienda('Dropi',prev)});
      if(!CFG.mapeoAT)CFG.mapeoAT={};
      CFG.mapeoAT['__empty__']='Dropi';
    }
  }
  document.getElementById('cfg-negocio').value=CFG.negocio||'';
  _renderTiendas();_renderMapeoAT();
  document.getElementById('config-modal').classList.add('open');
  if(irA) cfgMostrarSeccion(irA);
  else cfgMostrarMenu();
}

function cerrarConfig(){
  document.getElementById('config-modal').classList.remove('open');
}

function cfgCerrarOVolver(){
  if(_cfgSeccionActual==='menu') cerrarConfig();
  else cfgMostrarMenu();
}

function _renderTiendas(){
  const cont=document.getElementById('cfg-tiendas');
  cont.innerHTML='';
  (CFG.tiendas||[]).forEach((_,i)=>_renderTiendaRow(i));
}
function _renderTiendaRow(i){
  const t=(CFG.tiendas||[])[i]||{nombre:'',tel:'',color:'#334155'};
  const cont=document.getElementById('cfg-tiendas');
  const row=document.createElement('div');
  row.className='config-tienda-row';
  row.id='cfg-trow-'+i;
  row.innerHTML=
    '<div class="trow">'+
      '<label>Nombre</label>'+
      '<input type="text" id="cfg-t-nombre-'+i+'" placeholder="Ej: Al Natural" value="'+t.nombre.replace(/"/g,'&quot;')+'"/>'+
      '<button class="btn-del-tienda" onclick="cfgEliminarTienda('+i+')">🗑</button>'+
    '</div>'+
    '<div class="trow">'+
      '<label>WhatsApp</label>'+
      '<input type="text" id="cfg-t-tel-'+i+'" placeholder="57300123456 (sin +)" value="'+t.tel+'"/>'+
    '</div>'+
    '<div class="trow">'+
      '<label>Color</label>'+
      '<input type="color" id="cfg-t-color-'+i+'" value="'+t.color+'" style="width:48px;height:32px;padding:2px;cursor:pointer;border-radius:6px;border:1px solid var(--border);"/>'+
    '</div>';
  cont.appendChild(row);
}
function cfgAgregarTienda(){
  if(!CFG.tiendas)CFG.tiendas=[];
  CFG.tiendas.push({nombre:'',tel:'',color:'#334155'});
  _renderTiendaRow(CFG.tiendas.length-1);
}
function cfgResetCAS(){
  document.getElementById('cfg-cas-sinmov').value=CAS_DEFAULT_SIN_MOVIMIENTO;
  document.getElementById('cfg-cas-novedad').value=CAS_DEFAULT_NOVEDAD;
}
function cfgResetNovSol(){
  WA_NOV_CATS.forEach(c=>{
    const el=document.getElementById('cfg-novsol-'+c.key);
    if(el)el.value=NOV_SOLUCION_DEFAULT[c.key];
  });
}
function cfgEliminarTienda(i){
  CFG.tiendas.splice(i,1);
  _renderTiendas();
  _renderMapeoAT();
}

function _renderMapeoAT(){
  let cont=document.getElementById('cfg-mapeo-at');
  if(!cont){
    // Crear sección si no existe
    cont=document.createElement('div');
    cont.id='cfg-mapeo-at';
    cont.style.cssText='margin-top:16px;';
    document.getElementById('cfg-tiendas').parentElement.appendChild(cont);
  }
  // Construir filas: una por cada valor crudo del Excel + vacías si aplica
  const claves=[..._exccelTiendas,...(_hayVaciasAT?['__empty__']:[])];
  if(!claves.length){cont.innerHTML='';return;}
  const opciones=[{value:'',label:'— sin tienda —'}].concat(
    (CFG.tiendas||[]).filter(t=>t.nombre).map(t=>({value:t.nombre,label:t.nombre}))
  );

  cont.innerHTML='<div style="font-size:.75rem;font-weight:700;color:var(--text-1);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px;">🗂 ¿A qué tienda corresponde cada valor del Excel?</div>'+
    claves.map(clave=>{
      const actual=(CFG.mapeoAT||{})[clave]||'';
      const label=clave==='__empty__'?'⬜ (celdas vacías)':clave;
      const selId='cfg-map-'+encodeURIComponent(clave);
      return '<div class="trow" style="margin-bottom:8px;">'+
        '<label style="width:130px;flex-shrink:0;font-size:.74rem;font-weight:600;color:var(--text-2);background:var(--bg-inset);padding:4px 8px;border-radius:6px;">'+label+'</label>'+
        '<span style="color:var(--text-3);padding:0 6px;font-size:1rem;">→</span>'+
        '<div style="flex:1;">'+_fselHtml(selId,opciones,actual)+'</div>'+
      '</div>';
    }).join('');
}

// _fselHtml/_fselToggle/_fselAvisoPunto/_fselPick (dropdown falso reutilizable)
// y su listener global de click viven en shared/app-shared.js

function cfgGuardar(){
  if(_cfgSeccionActual==='tiendas'){
    CFG.negocio=(document.getElementById('cfg-negocio').value||'').trim()||'Gestión Logística';
    const nuevasTiendas=[];
    (CFG.tiendas||[]).forEach((_,i)=>{
      const nombre=(document.getElementById('cfg-t-nombre-'+i)?.value||'').trim();
      const tel=(document.getElementById('cfg-t-tel-'+i)?.value||'').replace(/\D/g,'');
      const color=document.getElementById('cfg-t-color-'+i)?.value||'#334155';
      if(nombre)nuevasTiendas.push({nombre,tel,color});
    });
    if(!nuevasTiendas.length){toast('Agrega al menos una tienda');return;}
    CFG.tiendas=nuevasTiendas;
    CFG.mapeoAT={};
    const claves=[..._exccelTiendas,...(_hayVaciasAT?['__empty__']:[])];
    claves.forEach(clave=>{
      const sel=document.getElementById('cfg-map-'+encodeURIComponent(clave));
      CFG.mapeoAT[clave]=sel?sel.value:'';
    });
    const _h1b=document.querySelector('#topnav h1')||document.querySelector('header h1');if(_h1b)_h1b.textContent='\uD83D\uDE9A '+CFG.negocio;
    renderAll();
  } else if(_cfgSeccionActual==='cas'){
    CFG.casSinMovimiento=(document.getElementById('cfg-cas-sinmov')?.value||'').trim()||CAS_DEFAULT_SIN_MOVIMIENTO;
    CFG.casNovedad=(document.getElementById('cfg-cas-novedad')?.value||'').trim()||CAS_DEFAULT_NOVEDAD;
    if(!CFG.novSolucion)CFG.novSolucion=Object.assign({},NOV_SOLUCION_DEFAULT);
    WA_NOV_CATS.forEach(c=>{
      const v=(document.getElementById('cfg-novsol-'+c.key)?.value||'').trim();
      CFG.novSolucion[c.key]=v||NOV_SOLUCION_DEFAULT[c.key];
    });
  } else if(_cfgSeccionActual==='wa'){
    wamGuardarActual();
  }
  cfgGuardarLS();
  toast('✅ Guardado');
  if(_cfgOnboarding){_cfgOnboarding=false;cerrarConfig();abrirInformeInicial();}
  else cfgMostrarMenu();
}

const TIENDA_PALETA=['#e11d48','#0d9488','#d97706','#7c3aed','#0891b2','#16a34a','#dc2626','#9333ea'];
const _tiendaColorCache={};
function getTiendaColor(tienda){
  if(!tienda)return'#334155';
  // Buscar en CFG primero
  const c=cfgGetColor(tienda);
  if(c)return c;
  if(_tiendaColorCache[tienda])return _tiendaColorCache[tienda];
  const usados=Object.values(_tiendaColorCache);
  const libre=TIENDA_PALETA.find(c=>!usados.includes(c))||TIENDA_PALETA[Object.keys(_tiendaColorCache).length%TIENDA_PALETA.length];
  _tiendaColorCache[tienda]=libre;
  return libre;
}

const ESTADO_KEYS={
  reparto:['guia_generada','guia generada'],
  telemercadeo:['telemercadeo','intento de entrega','reenvio','reenvío'],
  novedad:['novedad'],
  oficina:['reclame en oficina','reclame oficina','oficina'],
  transito:['en reparto','en distribucion','en procesamiento','en bodega transportadora',
            'en bodega destino','bodega destino','en terminal destino','despachada',
            'entregado a transportadora','preparado para transportadora','asignado',
            'en transito','transito','en terminal origen','en reexpedicion','en transporte',
            'en bodega origen','en ruta','en despacho','en espera de ruta domestica','entregada a conexiones'],
  pendiente:['pendiente','admitida'],
  rechazado:['rechazado','guia_anulada','guia anulada'],
  ignorar:['entregado','cancelado','devolucion','devolucion en bodega',
           'en proceso de devolucion','transito a devolucion proveedor',
           'pendiente confirmacion','novedad solucionada'],
};

const ESTADOS=[
  {key:'reparto',    label:'Guía generada', icon:'📋',p:1,color:'#2563eb',
   guion:'Guía recién generada · Verificar que la transportadora recoja el paquete · Confirmar que el pedido entre al sistema de la transportadora.'},
  {key:'oficina',    label:'En oficina',   icon:'🏢',p:3,color:'#7c3aed',
   guion:'Llamar al cliente · informar que el pedido esta en oficina Interrapidisimo · recordar plazo 5 dias · advertir cobro de flete si no recoge.'},
  {key:'transito',   label:'En transito',  icon:'\uD83D\uDCE6',p:4,color:'#0891b2',guion:'Garantiza que los pedidos sin movimiento sean reportados · Contactar al cliente o transportadora para conocer el motivo de la demora · Gestionar la entrega pronta.'},
  {key:'novedad',    label:'En novedad',  icon:'⚠️',p:2,color:'#d97706',
   guion:'Llamar al cliente · identificar el tipo de novedad · coordinar solución con transportadora.'},
  {key:'rechazado',  label:'Rechazados / Anulados', icon:'🚫',p:5,color:'#be123c',
   guion:'Pedido rechazado o guía anulada · Contactar al cliente · Verificar causa con transportadora · Gestionar reenvío o devolución.'},
  {key:'pendiente_sin_guia', label:'Sin guía',    icon:'⏳',p:0,color:'#dc2626',
   guion:'Pedidos sin guía generada · Verificar días de espera · Si supera 48h escalar al proveedor urgente.'},
];

// ── MENSAJES WA ────────────────────────────────────────────────────────
const AVISO='Por favor mantente *pendiente del telefono* y contesta llamadas de *numeros desconocidos*, puede ser nuestro mensajero.';
const CIERRE_T='\n\n_Este mensaje es informativo._ Si tienes alguna pregunta escribenos al WhatsApp *{tel_tienda}*.\n\nResponde con *OK* para confirmar que lo recibiste.';

// ── CLASIFICACIÓN DE NOVEDADES ─────────────────────────────────────────
function clasificarNovedad(tipo){
  const t=String(tipo||'').toLowerCase();
  if(t.includes('coordinar')||t.includes('reprogramar'))return'coordinar';
  if(t.includes('no hay quien')||t.includes('ausente'))return'norecibe';
  if(t.includes('direccion')||t.includes('dirección')||t.includes('localiza')||t.includes('no conocen')||t.includes('no existe'))return'direccion';
  if(t.includes('no pagara')||t.includes('no pagará')||t.includes('pago'))return'nopaga';
  if(t.includes('rehusa')||t.includes('rehúsa')||t.includes('rechaza'))return'rehusa';
  return'otra';
}

const NOV_CONFIG={
  coordinar:{color:'#334155',bg:'#e8edf2',icon:'[Coord]',label:'Coordinar entrega'},
  norecibe: {color:'#374151',bg:'#e8edf2',icon:'[Casa]', label:'No hay quien reciba'},
  direccion:{color:'#78716c',bg:'#f5f2ec',icon:'[Dir]',  label:'Direccion'},
  nopaga:   {color:'#dc2626',bg:'#fee2e2',icon:'[Pago]', label:'No pagara'},
  rehusa:   {color:'#374151',bg:'#ebe9f0',icon:'[Reh]',  label:'Se rehusa a recibir'},
  otra:     {color:'#64748b',bg:'#f1f5f9',icon:'[Nov]',  label:'Otra novedad'},
};

const WA_NOV={
  coordinar:[
    'Hola *{nombre}*, te escribimos de *{tienda}*. El mensajero intento entregarte tu *{producto}* pero no fue posible concretar la entrega. Nos puedes indicar el mejor horario y dia para un nuevo intento?\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
    'Hola *{nombre}*, somos de *{tienda}*. Tu *{producto}* esta listo pero el mensajero no pudo entregarlo. Cuentanos cuando podemos volver a intentar la entrega.\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
  ],
  norecibe:[
    'Hola *{nombre}*, te escribimos de *{tienda}*. Nuestro mensajero fue a entregarte tu *{producto}* pero no encontro a nadie en la direccion. Cuando hay alguien disponible para recibirlo?\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
    'Hola *{nombre}*, somos de *{tienda}*. Intentamos entregar tu *{producto}* pero no habia nadie en casa. Dinos cuando podemos volver.\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
  ],
  direccion:[
    'Hola *{nombre}*, te escribimos de *{tienda}*. Tenemos un inconveniente con la direccion registrada para entregar tu *{producto}*. Nos puedes confirmar o corregir tu direccion completa?\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
    'Hola *{nombre}*, somos de *{tienda}*. El mensajero no encontro la direccion para entregar tu *{producto}*. Por favor compartenos la direccion exacta con barrio y referencias.\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
  ],
  nopaga:[
    'Hola *{nombre}*, te escribimos de *{tienda}*. Nos reportaron que no fue posible completar la entrega de tu *{producto}* por un inconveniente con el pago. Si tienes dudas estamos aqui para ayudarte.\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
    'Hola *{nombre}*, somos de *{tienda}*. El mensajero informo que tu *{producto}* no pudo ser entregado por temas de pago. Escribenos si necesitas resolver algo.\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
  ],
  rehusa:[
    'Hola *{nombre}*, te escribimos de *{tienda}*. Nos informaron que no fue posible completar la entrega de tu *{producto}*. Si tuviste algun inconveniente con gusto te ayudamos a resolverlo.\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
    'Hola *{nombre}*, somos de *{tienda}*. El mensajero reporto que tu *{producto}* no fue recibido. Si hay algo en lo que podamos ayudarte no dudes en escribirnos.\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
  ],
  otra:[
    'Hola *{nombre}*, te escribimos de *{tienda}*. Queremos informarte que se presento una novedad con la entrega de tu *{producto}*. Estamos trabajando para resolverla y te mantendremos informado.\n\nSi tienes alguna pregunta escribenos al WhatsApp donde hiciste tu compra: *{tel_tienda}*\n\nResponde con *OK* para confirmar que recibiste este mensaje.',
  ],
};

const WA_MSGS={
  reparto:[
    'Hola *{nombre}!*\n\nTe escribimos desde *{tienda}*.\n\nTu *{producto}* ya esta en camino y sera entregado *hoy o manana*.\n\n'+AVISO+CIERRE_T,
    'Hola *{nombre}!*\n\nDesde *{tienda}* te avisamos que tu *{producto}* ya salio a *reparto*.\n\nEl mensajero intentara entregarlo hoy, asegurate de estar disponible.\n\n'+AVISO+CIERRE_T,
    'Hola *{nombre}!*\n\nTu *{producto}* de *{tienda}* ya salio a entrega hoy.\n\nMuy pronto el mensajero estara en tu puerta!\n\n'+AVISO+CIERRE_T,
    'Hola *{nombre}!*\n\nHoy es el dia de tu entrega desde *{tienda}*.\n\nTu *{producto}* esta en camino, estate pendiente del timbre y del telefono!\n\n'+AVISO+CIERRE_T,
    'Hola *{nombre}!*\n\nEl equipo de *{tienda}* te informa que el mensajero ya salio con tu *{producto}*.\n\nEstate listo para recibirlo hoy!\n\n'+AVISO+CIERRE_T,
  ],
  telemercadeo:[
    'Hola *{nombre}!*\n\nSomos del equipo de *{tienda}*.\n\n*Interrapidisimo* intento entregarte tu *{producto}* pero no fue posible contactarte.\n\nQueremos coordinar una *nueva entrega*, respondenos con tu disponibilidad de horario.\n\n'+AVISO+CIERRE_T,
    'Hola *{nombre}!*\n\nTe escribimos desde *{tienda}*.\n\n*Interrapidisimo* intento realizar la entrega de tu *{producto}* pero no fue posible.\n\nCuentanos *cuando podemos volver a intentarlo*.\n\n'+AVISO+CIERRE_T,
    'Hola *{nombre}!*\n\nDesde *{tienda}* te informamos que *Interrapidisimo* hizo un intento de entrega de tu *{producto}* sin exito.\n\nPodemos *reagendar*, en que horario te queda mejor recibirlo?\n\n'+AVISO+CIERRE_T,
    'Hola *{nombre}!*\n\nEl mensajero de *Interrapidisimo* paso a entregarte tu *{producto}* de *{tienda}* pero no fue posible.\n\nEscribenos para coordinar un *nuevo intento de entrega*.\n\n'+AVISO+CIERRE_T,
    'Hola *{nombre}!*\n\nTu *{producto}* de *{tienda}* esta pendiente de entrega.\n\n*Interrapidisimo* intento llevartelo pero no fue posible. Coordinemos el mejor momento para reintentarlo!\n\n'+AVISO+CIERRE_T,
  ],
  oficina:[
    'Hola *{nombre}!*\n\nTu *{producto}* de *{tienda}* ya llego a la oficina de *Interrapidisimo*.\n\nPresentate con tu *cedula* para reclamarlo.\n\n*IMPORTANTE:* Solo lo guardan *5 dias*. Si no lo reclamas nos lo devuelven y debemos cobrarte el valor del *flete*.'+CIERRE_T,
    'Hola *{nombre}!*\n\nTu *{producto}* de *{tienda}* esta disponible en la oficina de *Interrapidisimo*.\n\nTienes hasta *5 dias* para recogerlo.\n\nSi no lo reclamas a tiempo nos devuelven el paquete y debemos cobrarte el costo del *flete*.'+CIERRE_T,
    'Hola *{nombre}!*\n\nTu *{producto}* de *{tienda}* llego a la oficina de *Interrapidisimo*.\n\nSolo necesitas tu *cedula* para reclamarlo.\n\n*Atencion:* si no pasas en los proximos *5 dias* se genera devolucion y cobro de *flete*.'+CIERRE_T,
    'Hola *{nombre}!*\n\nTu *{producto}* de *{tienda}* te esta esperando en *Interrapidisimo*.\n\nRecuerda: tienes *maximo 5 dias* para recogerlo.\n\nSi no lo reclamas a tiempo nos lo devuelven y debemos cobrarte el *flete*.'+CIERRE_T,
    'Hola *{nombre}!*\n\nTu *{producto}* de *{tienda}* esta en la oficina de *Interrapidisimo*.\n\nPresentate con tu *cedula* y en minutos lo tienes.\n\nPasados *5 dias* sin reclamar se genera devolucion y cobro de *flete*.'+CIERRE_T,
  ],
  transito:[
    'Hola *{nombre}*, como estas?\n\nTe habla *Valeria* de *{tienda}*.\n\nTe escribimos porque queremos ser *transparentes* contigo: tu pedido de *{producto}* tiene un *retraso* por saturacion en la transportadora *{transportadora}*.\n\nNo te preocupes, ya lo marcamos como *prioritario* y lo estamos *rastreando de cerca*. Esta en camino y no lo perdemos de vista hasta que llegue a tus manos.\n\nComo agradecimiento por tu paciencia, te regalamos un *10% de descuento* en tu *proxima compra* (valido hasta el *30 de {mes_siguiente}*).\n\nNos confirmas con un *OK* que recibiste este mensaje? Eso nos ayuda mucho a saber que todo llego bien.'+CIERRE_T,
    'Hola *{nombre}*\n\nSoy *Valeria* de *{tienda}*.\n\nTe escribo para mantenerte *al tanto*: tu *{producto}* viene en camino, pero *{transportadora}* esta presentando *demoras* por alta carga de envios en este momento.\n\nQuiero que sepas que *seguimos tu pedido paso a paso*, no tienes que hacer nada, nosotros estamos *pendientes por ti*.\n\nPara compensar la espera te dejamos un *10% de descuento* en tu *siguiente compra* (valido hasta el *30 de {mes_siguiente}*).\n\nPor favor respondenos con un *OK* para saber que leiste este mensaje. Gracias por tu *paciencia*!'+CIERRE_T,
    'Hola *{nombre}*\n\nTe escribe *Valeria* de *{tienda}*.\n\nSabemos que *esperar es dificil* y por eso te avisamos directo: tu pedido de *{producto}* lleva un *retraso* por congestion en *{transportadora}*.\n\nYa esta en *seguimiento especial* de nuestra parte, lo estamos *monitoreando* hasta que llegue a tus manos.\n\nPor molestarte con esta espera, te obsequiamos un *10% de descuento* en tu *proxima compra* (valido hasta el *30 de {mes_siguiente}*).\n\nSolo necesitamos que nos respondas con un *OK* para confirmar que recibiste el mensaje. Muchas gracias por tu comprension!'+CIERRE_T,
    'Hola *{nombre}*, buen dia!\n\nTe habla *Valeria* de *{tienda}*.\n\nSiempre preferimos hablarte *con claridad*: tu *{producto}* viene con un *retraso* por la alta demanda de envios en *{transportadora}*.\n\nNo te preocupes, tenemos tu pedido *completamente identificado* y lo vigilamos de cerca para que llegue *lo antes posible*.\n\nPorque tu *tiempo vale*, te regalamos un *10% de descuento* en tu *proxima compra* (valido hasta el *30 de {mes_siguiente}*).\n\nRespondenos con un *OK* para confirmar que leiste esto. Gracias!'+CIERRE_T,
    'Hola *{nombre}*\n\nSoy *Valeria* de *{tienda}* y te contacto *personalmente* porque tu experiencia nos importa.\n\nTu pedido de *{producto}* presenta un *retraso* por la saturacion que tiene actualmente *{transportadora}*. Lo sentimos mucho.\n\nPero no estas sol@: tenemos tu pedido en *seguimiento prioritario* y te avisaremos de cualquier novedad. Lo gestionamos *como si fuera nuestro propio pedido*.\n\nComo muestra de nuestro compromiso, te damos un *10% de descuento* en tu *proxima compra* (valido hasta el *30 de {mes_siguiente}*).\n\nPor favor escribenos un *OK* para confirmar que recibiste este mensaje. Tu respuesta nos *ayuda muchisimo*!'+CIERRE_T,
  ],
};

let pedidos=[], gestiones={}, filtroActivo=null, filtrosSeccion={}, filtroTiendas=[];
let _pedidoMap=new Map(); // Índice O(1) por id para evitar pedidos.find() lineal
// Cards expandidas (persiste entre re-renders vía _actualizarCard)
const _cardsExp=new Set();
// Pedidos gestionados que el usuario está corrigiendo sin salir de la columna
// Gestionadas: mientras el id esté aquí, estaCompleta() lo fija como completo
// (solo "Eliminar y devolver" lo saca de la columna).
const _editandoGestion=new Set();
// Cierra la card flotante y la devuelve a su lugar en la grilla
function _cardFloatClose(){
  const wrap=document.getElementById('card-float-wrap');
  if(!wrap)return;
  const id=wrap.dataset.cardId;
  const card=wrap.querySelector('.card');
  const ph=document.getElementById('card-ph-'+id);
  if(card){
    if(ph&&ph.parentNode){ph.parentNode.insertBefore(card,ph);}
  }
  if(ph)ph.remove();
  wrap.remove();
  _cardsExp.delete(parseInt(id,10));
  document.body.classList.remove('card-gestionando');
  document.querySelectorAll('.cards-cols').forEach(c=>{c.style.minHeight='';});
}
// Esc cierra la card flotante que se esté gestionando
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(document.getElementById('card-float-wrap'))_cardFloatClose();
});
// Abre la card COMO CAPA FLOTANTE encima de las vecinas, en su misma posición
window._cardToggle=function(id){
  const abierta=document.getElementById('card-float-wrap');
  const esLaMisma=abierta&&abierta.dataset.cardId===String(id);
  _cardFloatClose();
  if(esLaMisma)return;
  const card=document.getElementById('card-'+id);
  if(!card)return;
  const sec=card.closest('.status-section');
  if(!sec)return;
  const cont=card.closest('.cards-cols')||sec;
  const r=card.getBoundingClientRect(), sr=cont.getBoundingClientRect();
  // Placeholder que conserva el hueco exacto en la grilla
  const ph=document.createElement('div');
  ph.id='card-ph-'+id;
  ph.style.cssText='height:'+r.height+'px;border:1px dashed var(--border);border-radius:var(--radius-md);opacity:.4;';
  card.parentNode.insertBefore(ph,card);
  // Capa flotante posicionada dentro de la sección (scrollea con ella)
  const wrap=document.createElement('div');
  wrap.id='card-float-wrap';
  wrap.dataset.cardId=id;
  wrap.style.cssText='position:absolute;left:'+(r.left-sr.left+cont.scrollLeft)+'px;top:'+(r.top-sr.top+cont.scrollTop)+'px;width:'+r.width+'px;z-index:95;border-radius:var(--radius-md);box-shadow:var(--shadow-lg),0 0 0 1px var(--border-strong);';
  _cardsExp.add(id);
  wrap.appendChild(card);
  document.body.classList.add('card-gestionando');
  cont.appendChild(wrap);
  // El kanban tiene alto fijo: limitar la card expandida al espacio visible
  // con scroll interno propio para que nunca quede recortada
  if(cont!==sec){
    const topPx=parseFloat(wrap.style.top)||0;
    const disp=cont.clientHeight-topPx-8;
    if(disp>120){wrap.style.maxHeight=disp+'px';wrap.style.overflowY='auto';}
  }
};
// Arrastre horizontal del kanban con el mouse (trabajo solo con mouse)
let _colsDrag=null;
document.addEventListener('mousedown',e=>{
  const c=e.target.closest('.cards-cols');
  if(!c)return;
  // No iniciar arrastre sobre cards ni controles — solo fondos y cabeceras
  if(e.target.closest('.card,#card-float-wrap,button,a,input,textarea,select,label'))return;
  _colsDrag={c,x:e.pageX,l:c.scrollLeft};
  c.classList.add('arrastrando');
  e.preventDefault();
});
document.addEventListener('mousemove',e=>{
  if(!_colsDrag)return;
  _colsDrag.c.scrollLeft=_colsDrag.l-(e.pageX-_colsDrag.x);
});
document.addEventListener('mouseup',()=>{
  if(_colsDrag){_colsDrag.c.classList.remove('arrastrando');_colsDrag=null;}
});

// Reabre la card en gestión después de un re-render completo de la grilla.
// Así la card flotante queda ESTÁTICA aunque las acciones disparen renderAll.
function _cardFloatReabrir(){
  const id=window._floatReopenId;
  window._floatReopenId=null;
  if(id==null)return;
  const c=document.getElementById('card-'+id);
  // Si la card ya quedó gestionada (o desapareció), la gestión terminó → no reabrir
  if(!c||c.classList.contains('gest')){_cardsExp.clear();return;}
  _cardsExp.delete(id); // _cardToggle la re-agrega
  _cardToggle(id);
}
let waCounters={reparto:0,oficina:0,transito:0,novedad:0,rechazado:0};
let vistaActual=localStorage.getItem('lgs_vista')||'grid';

function setVista(v){
  vistaActual=v;
  localStorage.setItem('lgs_vista',v);
  document.querySelectorAll('.btn-vista').forEach(b=>b.classList.toggle('activo',b.dataset.vista===v));
  renderAll();
}

function _mkGrid(){const d=document.createElement('div');d.className=vistaActual==='lista'?'cards-lista':'cards-grid';return d;}

// Días "vencidos" de un pedido para la agrupación por columnas
function _diasCard(p){
  if(p.estadoKey==='novedad'){const d=diasDesde(p.fechaNovedad);if(d!=null)return d;}
  if(p.diasSinMov!=null)return p.diasSinMov;
  return p.dias||0;
}

// Reorganiza cada grilla activa en columnas por días (mayor → menor).
// Prueba de estructura: aplica solo a la vista de cuadros, no a la lista
// ni a los grupos de gestionadas.
function _agruparColsPorDias(){
  if(vistaActual==='lista')return;
  document.querySelectorAll('#content .cards-grid').forEach(grid=>{
    if(grid.closest('.gest-list'))return;
    const cards=[...grid.children].filter(c=>c.classList.contains('card'));
    const secEl=grid.closest('.status-section');
    const glFondo=secEl?secEl.querySelector('.fondo-list'):null;
    const gbFondo=secEl?secEl.querySelector('.fondo-bar'):null;
    const gl=secEl?secEl.querySelector('.gestionadas-list'):null;
    const gb=secEl?secEl.querySelector('.gestionadas-bar'):null;
    const gfCards=glFondo?[...glFondo.querySelectorAll('.card')]:[];
    const gCards=gl?[...gl.querySelectorAll('.card')]:[];
    // Nada que columnizar: menos de 2 cards activas y sin fondo/gestionadas para mostrar como columna
    if(cards.length<2&&!gfCards.length&&!gCards.length)return;
    const grupos=new Map();
    cards.forEach(c=>{
      const d=parseInt(c.dataset.dias||'0',10)||0;
      if(!grupos.has(d))grupos.set(d,[]);
      grupos.get(d).push(c);
    });
    // Un solo valor de días y sin columnas especiales → grilla normal
    if(grupos.size<2&&!gfCards.length&&!gCards.length)return;
    const cont=document.createElement('div');
    cont.className='cards-cols';
    [...grupos.keys()].sort((a,b)=>b-a).forEach(d=>{
      const col=document.createElement('div');col.className='day-col';
      const hdr=document.createElement('div');col.appendChild(hdr);
      hdr.className='day-col-hdr';
      const ico=d>=7?'🚨':d>=4?'⚠️':'📅';
      hdr.innerHTML='<span>'+ico+' '+d+(d===1?' día':' días')+'</span><span class="day-col-count">'+grupos.get(d).length+'</span>';
      const body=document.createElement('div');
      body.className='day-col-body';
      grupos.get(d).forEach(c=>body.appendChild(c));
      col.appendChild(body);
      cont.appendChild(col);
    });
    // Columna: PENDIENTE / FONDO (cards enviadas "pasar al fondo")
    if(gfCards.length){
      const colP=document.createElement('div');
      colP.className='day-col day-col-fondo';
      const hdrP=document.createElement('div');
      hdrP.className='day-col-hdr';
      hdrP.innerHTML='<span style="color:var(--text-2);">&#11015;&#65039; PENDIENTE</span><span class="day-col-count">'+gfCards.length+'</span>';
      colP.appendChild(hdrP);
      const bodyP=document.createElement('div');
      bodyP.className='day-col-body';
      gfCards.forEach(c=>bodyP.appendChild(c));
      colP.appendChild(bodyP);
      cont.appendChild(colP);
      if(gbFondo)gbFondo.remove();
      if(glFondo)glFondo.remove();
    }
    // Columna final: GESTIONADAS (antes vivían en la lista de abajo)
    if(gCards.length){
      const colG=document.createElement('div');
      colG.className='day-col day-col-gest';
      const hdrG=document.createElement('div');
      hdrG.className='day-col-hdr';
      hdrG.innerHTML='<span style="color:var(--success);">✅ Gestionadas</span><span class="day-col-count">'+gCards.length+'</span>';
      colG.appendChild(hdrG);
      const bodyG=document.createElement('div');
      bodyG.className='day-col-body';
      gCards.forEach(c=>bodyG.appendChild(c));
      colG.appendChild(bodyG);
      cont.appendChild(colG);
      if(gb)gb.remove();
      if(gl)gl.remove();
    }
    grid.replaceWith(cont);
  });
}
function _mkCardEl(p,est,esGest){return vistaActual==='lista'?crearFila(p,est,esGest):crearCard(p,est,esGest);}
function _mkCardNovEl(p){return vistaActual==='lista'?crearFilaNovedad(p):crearCardNovedad(p);}

function crearFila(p,est,esGest){
  const g=gestiones[p.id]||{};
  const wrap=document.createElement('div');
  wrap.className='cf-wrap'+(esGest?' cf-gest':'');
  const telDisplay=(p.telefono||'').replace(/^57/,'');
  const prodSimple=getProductoSimple(p.productos)||'—';
  let diaVal='—',diaColor='#94a3b8';
  if(est.key==='reparto'){
    if(p.diasSinMov==null){diaVal='📅 Sin dato de movimiento';diaColor='#94a3b8';}
    else{const d=p.diasSinMov;if(d>=3){diaVal='🚨 '+d+' días en guía generada — ESCALAR';diaColor='#b91c1c';}else if(d>=2){diaVal='⚠️ '+d+' días en guía generada — revisar';diaColor='#d97706';}else if(d===1){diaVal='📦 1 día en guía generada';diaColor='#d97706';}else{diaVal='🚚 Entró en Guía Generada hoy';diaColor='#16a34a';}}
  }else if(est.key==='oficina'){
    const d=p.diasSinMov!=null?p.diasSinMov:(p.dias||0);
    const r=5-d;
    if(r<=0){diaVal='🚨 '+d+' dias — VENCIDO';diaColor='#b91c1c';}
    else if(d>=3){diaVal='⏳ '+d+' dias — '+r+' restantes';diaColor='#d97706';}
    else{diaVal='📅 '+d+' dias — '+r+' dias restantes';diaColor='#16a34a';}
  }else if(est.key==='transito'&&p.dias!=null){
    if(p.dias>=7){diaVal='🔴 '+p.dias+' dias — urgente';diaColor='#b91c1c';}
    else if(p.dias>=4){diaVal='🟡 '+p.dias+' dias en transito';diaColor='#d97706';}
    else if(p.dias>0){diaVal='📦 '+p.dias+' dias en transito';diaColor='#64748b';}
  }else if(est.key==='rechazado'&&p.dias!=null){
    diaVal='🚫 '+p.dias+' días';diaColor='#be123c';
  }else if(p.dias!=null&&p.dias>0){diaVal=p.dias+'d';}
  const gestIco=g.guia_reportada?'✅':g.guia_generada_hoy?'📦':g.transito_gestionado?'✅':g.transito_sin_gestion?'🚚':g.rechazado_gestionado?'✅':g.rechazado_sin_gestion?'🚫':estaCompleta(p)?'✅':(g.llamada?'📋':'·');
  const row=document.createElement('div');
  row.className='card-fila';
  const _tcFila=p.tienda?getTiendaColor(p.tienda):null;
  row.style.borderLeftColor=esGest?'#94a3b8':(_tcFila||est.color);
  row.innerHTML=
    '<span class="cf-gest-ico">'+gestIco+'</span>'+
    '<div class="cf-name">'+esc(p.nombre)+'<span class="cf-id">'+esc(p.guia||p.dropiId||'')+'</span></div>'+
    '<div class="cf-tel">'+(telDisplay?'📞 '+telDisplay:'—')+'</div>'+
    '<div class="cf-ciudad">'+(p.ciudad?'📍 '+p.ciudad:'—')+'</div>'+
    '<div class="cf-prod">🛍 '+prodSimple+'</div>'+
    '<div class="cf-dias-col" style="color:'+diaColor+'">'+diaVal+'</div>'+
    '<div class="cf-chev">›</div>';
  const detail=document.createElement('div');
  detail.className='cf-detail';
  detail.style.display='none';
  let rendered=false;
  row.onclick=()=>{
    const isOpen=detail.style.display!=='none';
    if(!isOpen&&!rendered){
      const card=crearCard(p,est,esGest);
      const twoCol=document.createElement('div');twoCol.className='cf-two-cols';
      const colL=document.createElement('div');colL.className='cf-col-left';
      const colR=document.createElement('div');colR.className='cf-col-right';
      let enDerecha=false;
      [...card.children].forEach(child=>{
        if(child.classList.contains('que-sigue')||child.classList.contains('acciones')||child.classList.contains('nota-widget'))enDerecha=true;
        (enDerecha?colR:colL).appendChild(child);
      });
      twoCol.appendChild(colL);twoCol.appendChild(colR);
      detail.appendChild(twoCol);
      rendered=true;
    }
    detail.style.display=isOpen?'none':'block';
    const chev=row.querySelector('.cf-chev');
    chev.textContent=isOpen?'›':'⌄';chev.classList.toggle('open',!isOpen);
  };
  wrap.appendChild(row);wrap.appendChild(detail);
  return wrap;
}

function crearFilaNovedad(p){
  const g=gestiones[p.id]||{};
  const wrap=document.createElement('div');
  wrap.className='cf-wrap';
  const telDisplay=(p.telefono||'').replace(/^57/,'');
  const prodSimple=getProductoSimple(p.productos)||'—';
  const dNov=diasDesde(p.fechaNovedad);
  let diaVal,diaColor;
  if(dNov==null){diaVal='Sin fecha de novedad';diaColor='#94a3b8';}
  else if(dNov>=3){diaVal='🚨 '+dNov+' días en novedad — ESCALAR YA';diaColor='#b91c1c';}
  else if(dNov>=2){diaVal='⚠️ '+dNov+' días en novedad — revisar';diaColor='#d97706';}
  else if(dNov===1){diaVal='📋 1 día en novedad';diaColor='#d97706';}
  else{diaVal='📋 Entró hoy';diaColor='#64748b';}
  const gestIco=g.guia_reportada?'✅':g.guia_generada_hoy?'📦':estaCompleta(p)?'✅':(g.llamada?'📋':'·');
  const row=document.createElement('div');
  row.className='card-fila';
  row.style.borderLeftColor='#d97706';
  row.innerHTML=
    '<span class="cf-gest-ico">'+gestIco+'</span>'+
    '<div class="cf-name">'+esc(p.nombre)+'<span class="cf-id">'+esc(p.guia||p.dropiId||'')+'</span></div>'+
    '<div class="cf-tel">'+(telDisplay?'📞 '+telDisplay:'—')+'</div>'+
    '<div class="cf-ciudad">'+(p.ciudad?'📍 '+p.ciudad:'—')+'</div>'+
    '<div class="cf-prod">🛍 '+prodSimple+'</div>'+
    '<div class="cf-dias-col" style="color:'+diaColor+'">'+diaVal+'</div>'+
    '<div class="cf-chev">›</div>';
  const detail=document.createElement('div');
  detail.className='cf-detail';detail.style.display='none';
  let rendered=false;
  row.onclick=()=>{
    const isOpen=detail.style.display!=='none';
    if(!isOpen&&!rendered){
      const card=crearCardNovedad(p);
      const twoCol=document.createElement('div');twoCol.className='cf-two-cols';
      const colL=document.createElement('div');colL.className='cf-col-left';
      const colR=document.createElement('div');colR.className='cf-col-right';
      let enDerecha=false;
      [...card.children].forEach(child=>{
        if(child.classList.contains('que-sigue')||child.classList.contains('acciones')||child.classList.contains('nota-widget'))enDerecha=true;
        (enDerecha?colR:colL).appendChild(child);
      });
      twoCol.appendChild(colL);twoCol.appendChild(colR);
      detail.appendChild(twoCol);
      rendered=true;
    }
    detail.style.display=isOpen?'none':'block';
    const chev=row.querySelector('.cf-chev');
    chev.textContent=isOpen?'›':'⌄';chev.classList.toggle('open',!isOpen);
  };
  wrap.appendChild(row);wrap.appendChild(detail);
  return wrap;
}

// ── HELPERS ────────────────────────────────────────────────────────────
// norm/toast/esc viven en shared/app-shared.js

function _copiarFallback(txt){
  // Copia síncrona con textarea oculto — devuelve true/false según resultado.
  // Textarea (no input) para conservar saltos de línea en textos CAS.
  try{
    const e=document.createElement('textarea');
    e.value=txt;
    e.setAttribute('readonly','');
    e.style.cssText='position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;font-size:16px;opacity:0;';
    document.body.appendChild(e);
    e.focus();
    const isIOS=/ipad|iphone|ipod/i.test(navigator.userAgent);
    if(isIOS){
      const range=document.createRange();
      range.selectNodeContents(e);
      const sel=window.getSelection();
      if(sel){sel.removeAllRanges();sel.addRange(range);}
      e.setSelectionRange(0,999999);
    }else{
      e.select();
      e.setSelectionRange(0,999999);
    }
    const ok=document.execCommand('copy');
    document.body.removeChild(e);
    return ok;
  }catch(_){return false;}
}
function _copiar(txt,cb){
  // 1) Intento SÍNCRONO primero: corre dentro del gesto del usuario y funciona
  //    siempre (el path async rechazaba al volver de otra pestaña y el fallback
  //    quedaba fuera del gesto → execCommand fallaba en silencio)
  if(_copiarFallback(txt)){ if(cb)cb(true); return; }
  // 2) API moderna como respaldo
  try{
    if(window.isSecureContext&&navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(()=>{if(cb)cb(true);}).catch(()=>{if(cb)cb(false);});
      return;
    }
  }catch(_){}
  if(cb)cb(false);
}

function copiarTexto(txt){ _copiar(txt,()=>toast('\uD83D\uDCCB Copiado: '+txt)); }

function copiarTel(tel){
  const d=tel.replace(/^57/,'');
  _copiar(d,()=>toast('\uD83D\uDCCB Copiado: '+d));
}

// _fmtFecha vive en shared/app-shared.js
function diasDesde(val){
  if(!val)return null;
  let d;
  if(typeof val==='number'){d=new Date(Math.round((val-25569)*86400*1000));}
  else{const s=String(val).trim(),p=s.split(/[\/\-\.]/);
    if(p.length===3){d=p[0].length===4?new Date(p[0],p[1]-1,p[2]):new Date(p[2],p[1]-1,p[0]);}
    else{d=new Date(s);}
  }
  if(!d||isNaN(d))return null;
  const hoy=new Date();hoy.setHours(0,0,0,0);d.setHours(0,0,0,0);
  return Math.max(0,Math.round((hoy-d)/86400000));
}

function mapEstado(raw,tr){
  const s=norm(raw);
  if(ESTADO_KEYS.telemercadeo.some(p=>s.includes(p))){
    const t=norm(tr||'');
    return(t.includes('interrapidisimo')||t.includes('inter')||t==='')
      ?'telemercadeo':'transito';
  }
  // Verificar rechazado ANTES de ignorar para no perder estos pedidos
  if(ESTADO_KEYS.rechazado.some(p=>s.includes(p)))return 'rechazado';
  // Verificar ignorar para evitar falsos positivos (ej: "pendiente confirmacion" != "pendiente")
  if(ESTADO_KEYS.ignorar.some(p=>s.includes(p)))return null;
  for(const[key,pats]of Object.entries(ESTADO_KEYS)){
    if(key==='telemercadeo'||key==='ignorar'||key==='rechazado')continue;
    if(pats.some(p=>s.includes(p)))return key;
  }
  return null;
}



function findCol(H,pats){
  for(const p of pats){const e=H.find(h=>norm(h)===norm(p));if(e)return e;}
  for(const p of pats){const e=H.find(h=>norm(h).includes(norm(p)));if(e)return e;}
  return null;
}
function findColOrIdx(H,pats,idx){
  // Busca por nombre primero; si no encuentra usa la posición fija
  return findCol(H,pats)||(H[idx]||null);
}

function formatTel(tel){
  const t=String(tel||'').replace(/\D/g,'');
  if(!t)return null;
  if(t.startsWith('57')&&t.length>=12)return t;
  if(t.length===10)return'57'+t;
  return t;
}

function horasDesde(val){
  if(!val)return null;
  let d;
  if(typeof val==='number'){d=new Date(Math.round((val-25569)*86400*1000));}
  else{const s=String(val).trim(),p=s.split(/[\/\-\.]/);
    if(p.length===3){d=p[0].length===4?new Date(p[0],p[1]-1,p[2]):new Date(p[2],p[1]-1,p[0]);}
    else{d=new Date(s);}
  }
  if(!d||isNaN(d))return null;
  return Math.round((Date.now()-d.getTime())/3600000);
}

function limpiarNombre(nombre){return String(nombre||'').replace(/\s*-\s*\d+\s*$/,'').trim();}
function getProductoSimple(productos){
  if(!productos||!productos.length)return'';
  // Agrupar por nombre y sumar cantidades
  const mapa={};
  productos.forEach(p=>{
    const n=limpiarNombre(p.nombre);
    if(!n)return;
    mapa[n]=(mapa[n]||0)+(p.cantidad||1);
  });
  return Object.entries(mapa).map(([n,c])=>c>1?n+' x'+c:n).join(' · ');
}
function getProductoWA(productos){
  if(!productos||!productos.length)return'tu pedido';
  return limpiarNombre(productos[0].nombre)||'tu pedido';
}

function formatValor(v){
  if(!v||isNaN(v))return null;
  return'$'+Math.round(v).toLocaleString('es-CO');
}

// ── HISTORIAL WA ───────────────────────────────────────────────────────
function histCargar(){try{return JSON.parse(localStorage.getItem(LS_HIST))||{};}catch(e){return{};}}
function histGuardar(h){try{localStorage.setItem(LS_HIST,JSON.stringify(h));}catch(e){}}
function _evtFbPush(guia,tipo){
  if(typeof _db==='undefined'||!window._currentUsername||!guia)return;
  const p=pedidos.find(x=>x.guia===guia);
  if(p&&p.dropiId){
    const tk=_gsKeyEscritura();
    if(!tk) return;
    _db.ref('gestiones_sync/'+tk+'/'+_fbKey(p.dropiId)+'/eventos').push({tipo,ts:Date.now(),fecha:new Date().toLocaleDateString('es-CO')});
  }
}
function histRegistrar(guia){
  if(!guia)return;
  const h=histCargar();
  if(!h[guia])h[guia]={};
  h[guia].wa={ts:Date.now(),fecha:new Date().toLocaleDateString('es-CO')};
  histGuardar(h);
  _evtFbPush(guia,'wa_enviado');
}

function histRegistrarContacto(guia, resultado){
  if(!guia)return;
  const h=histCargar();
  if(!h[guia])h[guia]={};
  h[guia].llamada={ts:Date.now(),fecha:new Date().toLocaleDateString('es-CO'),resultado};
  histGuardar(h);
  const tipo=resultado==='contestó'?'llamada_contestada':'llamada_no_contestada';
  _evtFbPush(guia,tipo);
}

function histRegistrarFin(guia){
  if(!guia)return;
  const h=histCargar();
  if(!h[guia])h[guia]={};
  h[guia].fin={ts:Date.now(),fecha:new Date().toLocaleDateString('es-CO')};
  histGuardar(h);
  _evtFbPush(guia,'finalizado');
}

function histGetInfo(guia){
  if(!guia)return null;
  return histCargar()[guia]||null;
}
function histDiasDesde(guia){
  if(!guia)return null;
  const h=histCargar()[guia];
  if(!h||!h.wa)return null;
  return Math.floor((Date.now()-h.wa.ts)/86400000);
}
function histPuedeMensaje(guia){
  if(!guia)return true;
  const h=histCargar()[guia];
  if(!h||!h.wa)return true;
  const dias=Math.floor((Date.now()-h.wa.ts)/86400000);
  return dias>=2;
}

// ── PARSEO ─────────────────────────────────────────────────────────────
function parsear(data){
  const wb=XLSX.read(data,{type:'array',cellDates:false});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});
  if(!rows.length)return[];
  const H=Object.keys(rows[0]);
  const cID  =findCol(H,['id']);
  const cN   =findCol(H,['nombre cliente','nombre']);
  const cT   =findCol(H,['telefono','celular']);
  const cD   =findCol(H,['direccion']);
  const cDep =findCol(H,['departamento destino','departamento']);
  const cCiu =findCol(H,['ciudad destino','ciudad']);
  const cG   =findColOrIdx(H,['numero guia','número guia','guia','num guia'],9); // col J
  const cE   =findCol(H,['estatus','estado','status']);
  const cTr  =findCol(H,['transportadora']);
  const cFG  =findCol(H,['fecha guia generada','fecha generacion de guia','fecha guia','fecha generacion guia']);
  const cNov =findCol(H,['novedad']);
  const cProd=findCol(H,['PRODUCTO','producto']);
  const cVar =findCol(H,['variacion','variación']);
  const cCant=findCol(H,['cantidad']);
  const cTipo=findColOrIdx(H,['tipo de tienda','tipo tienda'],45); // col AT
  const cProdId=findCol(H,['producto id','id producto','product id','sku','referencia producto','ref producto']);
  const cFO  =findCol(H,['fecha','fecha orden','fecha de orden','fecha creacion','fecha pedido']);
  const cOrdTda=findCol(H,['id de orden de tienda','numero de pedido de tienda','id orden']);
  const cTipoNov=findCol(H,['novedad','tipo novedad','tipo de novedad'])||findCol(H,['af','novedad_tipo']);
  const cFechaNov=findCol(H,['fecha novedad','fecha de novedad','fecha_novedad']);
  const cValor=findCol(H,['valor total','valor cod','valor del pedido','valor orden','valor pedido','valor','total','precio total','precio']);
  const cFechaMov=findCol(H,['fecha de ultimo movimiento','fecha ultimo movimiento','fecha_ultimo_movimiento','fecha de último movimiento','fecha mov','fecha movimiento','ultimo movimiento','ultimo mov','fecha actualizacion','fecha de actualizacion','fecha actualización','fecha de actualización','fecha estado','fecha de estado','last movement','fecha modificacion','fecha de modificacion']);
  if(!cFechaMov){
    setTimeout(()=>toast('⚠️ Columna "Fecha último movimiento" no encontrada en el Excel. Días en Oficina usarán fecha de guía.', 5000),1200);
  }

  // Cada ID tiene un único estatus. Si ese estatus es cancelado/ignorado,
  // mapEstado devuelve null y el ID completo se omite.
  // Si un cliente tiene 2 IDs (uno cancelado, uno activo), cada ID se evalúa
  // por separado: el cancelado queda fuera, el activo genera su tarjeta.
  // Los pedidos PENDIENTE DE CONFIRMACIÓN se descartan del kanban (están en la
  // lista `ignorar` de ESTADO_KEYS), pero el Centro de Operaciones necesita el
  // número, así que se cuentan acá antes de que mapEstado los deje fuera.
  // Se cuentan IDs únicos, no filas: un pedido con varios productos ocupa
  // varias filas del Excel.
  // Los desenlaces —ENTREGADO y DEVUELTO— se anotan por el mismo motivo, antes
  // de que mapEstado los descarte: son la única forma de saber que un pedido de
  // R.O. ya terminó. Los dos salen del kanban (no hay nada que gestionar), y
  // justamente por eso su registro de R.O. se quedaba esperando para siempre.
  // "entregado" se exige al PRINCIPIO del estado y no en cualquier parte, para
  // que un "NO ENTREGADO" no cuente como entregado; "entregada a conexiones",
  // que es tránsito, tampoco entra porque dice "entregada", no "entregado".
  // En devolución sí basta con que aparezca, para cubrir sus cuatro variantes
  // ("devolución", "devolución en bodega", "en proceso de devolución",
  // "tránsito a devolución proveedor"): en todas el cliente ya no lo va a
  // recoger, que es lo que R.O. necesita saber.
  const _idsPendConf=new Set();
  const _guiasEntregadas=new Set(), _guiasDevueltas=new Set();
  const mapa=new Map();let _idx=0;
  rows.forEach(r=>{
    const id=String(r[cID]||'').trim();if(!id)return;
    const guia=String(r[cG]||'').trim();
    const transportadora=String(r[cTr]||'').trim();
    const _estNorm=norm(r[cE]);
    if(_estNorm.includes('pendiente confirmacion')) _idsPendConf.add(id);
    if(guia){
      if(_estNorm.startsWith('entregado')) _guiasEntregadas.add(guia);
      else if(_estNorm.includes('devolucion')||_estNorm.includes('devuelt')) _guiasDevueltas.add(guia);
    }
    const _estadoRaw=mapEstado(r[cE],transportadora);
    if(!_estadoRaw)return;
    // Sin guía: solo se admiten PENDIENTE y RECHAZADO (pueden no tener guía generada)
    if(!guia && _estadoRaw!=='pendiente' && _estadoRaw!=='rechazado')return;
    // Mapear 'pendiente' → 'pendiente_sin_guia' para la sección correcta
    const estadoKey=_estadoRaw==='pendiente'?'pendiente_sin_guia':_estadoRaw;
    if(!mapa.has(id)){
      const uid=_idx++;
      const valorAT=String(r[cTipo]||'').trim();
      mapa.set(id,{
        id:uid,dropiId:id,
        nombre:String(r[cN]||'Sin nombre').trim(),
        telefono:formatTel(r[cT]),
        direccion:String(r[cD]||'').trim(),
        ciudad:String(r[cCiu]||'').trim(),
        depto:String(r[cDep]||'').trim(),
        guia,
        estadoKey,transportadora,
        estadoRaw:String(r[cE]||'').trim().toUpperCase(),
        fechaOrden:r[cFO]||null,
        novedad:String(r[cNov]||'').trim(),
        tipoNovedad:String(r[cTipoNov]||'').trim(),
        fechaNovedad:r[cFechaNov]||null,
        fechaMov:r[cFechaMov]||null,
        _valorAT:valorAT, // crudo, se resuelve al final
        tienda:'',
        dias:diasDesde(r[cFG]),
        diasSinGuia:diasDesde(r[cFO]),
        diasSinMov:diasDesde(r[cFechaMov]||null),
        idOrden:String(r[cOrdTda]||'').trim(),
        valor:0,
        productos:[],
      });
    }
    const prod=mapa.get(id);
    // Tomar primer valor no-vacío de AT
    if(!prod._valorAT){
      const v=String(r[cTipo]||'').trim();
      if(v)prod._valorAT=v;
    }
    // Acumular valor fila a fila (cada fila aporta el valor de su producto)
    if(cValor){
      const v=parseFloat(String(r[cValor]||'').replace(/[^0-9.]/g,''));
      if(!isNaN(v)&&v>0)prod.valor=(prod.valor||0)+v;
    }
    const pNombre=String(r[cProd]||'').trim();
    if(pNombre){
      const pVar=String(r[cVar]||'').trim();
      const pCant=parseInt(r[cCant]||1)||1;
      const pId=cProdId?String(r[cProdId]||'').trim():'';
      const existe=prod.productos.find(x=>x.nombre===pNombre&&x.variacion===pVar);
      if(existe){existe.cantidad+=pCant;}
      else{prod.productos.push({nombre:pNombre,variacion:pVar,cantidad:pCant,id:pId});}
    }
  });
  // Limpiar: si valor quedó en 0 (columna no existe o vacía), dejarlo null
  const result=Array.from(mapa.values());

  // Recoger valores únicos crudos de AT para el modal de config
  const todosAT=result.map(p=>p._valorAT);
  _exccelTiendas=[...new Set(todosAT.filter(Boolean))];
  _hayVaciasAT=todosAT.some(v=>!v);

  // Resolver tienda usando mapeoAT
  result.forEach(p=>{
    p.tienda=getTienda(p._valorAT);
    // Capitalizar el valor crudo de AT como nombre de herramienta (ej: "CHATEA PRO" → "Chatea Pro")
    p.herramienta=p._valorAT
      ? p._valorAT.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ')
      : '';
    delete p._valorAT;
    if(!p.valor)p.valor=null;
  });
  // Snapshot para el Centro de Operaciones. El Excel es de TODA la tienda, así
  // que se publica por tienda y la última carga reemplaza a la anterior — sumar
  // entre asesores multiplicaría el número, porque todos suben el mismo archivo.
  _publicarSnapshotLogistica(result, _idsPendConf.size);
  // Los consume _roCerrarPorExcel (shared/app-shared.js) cuando corre la
  // sincronización de R.O., ya sin acceso a las filas del Excel.
  window._guiasEntregadas = _guiasEntregadas;
  window._guiasDevueltas  = _guiasDevueltas;
  return result;
}

// Publica en logistica_live/{empresaId} el pulso del último Excel cargado.
// Se escribe una sola vez por carga (no por gestión), y lleva quién y cuándo
// para que el admin sepa si el dato está fresco o es de hace horas.
function _publicarSnapshotLogistica(pedidos, pendConfirmacion){
  try{
    if(typeof _db==='undefined'||!window._currentUsername) return;
    if(typeof _tiendaLista==='function' && !_tiendaLista('snapshot logística')) return;
    _db.ref('logistica_live/'+_gdTK()).set({
      pendConfirmacion: pendConfirmacion||0,
      enNovedad: pedidos.filter(p=>p.estadoKey==='novedad').length,
      totalPedidos: pedidos.length,
      ts: Date.now(),
      porAsesor: (window.getLoginAsesor?window.getLoginAsesor():'')||''
    });
  }catch(e){ console.warn('[LIVE] no se pudo publicar el snapshot de logística',e); }
}

// ── COMPLETITUD ────────────────────────────────────────────────────────
// "Sin acción" = todavía no hay nada que gestionar, así que no cuenta como
// pendiente en NINGÚN lado: ni en las cards, ni en el badge de la sección, ni
// en el progreso ("X de Y gestionados"), ni en el resumen del día.
//   · Tránsito con menos de 4 días: el pedido todavía se mueve solo.
//   · Guía generada hoy o ayer: la transportadora aún puede estar recogiendo.
// Una guía SIN fecha de generación no se oculta: no se puede afirmar que sea
// de hoy, y es preferible mostrar de más que esconder trabajo real.
function sinAccion(p){
  if(p.estadoKey==='transito') return (p.dias||0)<4;
  if(p.estadoKey==='reparto')  return p.dias!=null && p.dias<2;
  return false;
}
function alertaNivel(p){
  if(p.estadoKey!=='pendiente_sin_guia')return null;
  const d=p.diasSinGuia||0;
  if(d>2)return'rojo';
  if(d>1)return'amarillo';
  return'verde';
}

function estaCompleta(p){
  if(_editandoGestion.has(p.id))return true; // editando in-place: no sale de Gestionadas
  const g=gestiones[p.id]||{};
  if(g.devolucion)return true;
  if(p.estadoKey==='reparto'&&(g.guia_reportada||g.guia_generada_hoy))return true;
  if(p.estadoKey==='transito'){return!!(g.transito_sin_gestion)||!!(g.transito_gestionado);}
  if(p.estadoKey==='rechazado'){return!!(g.rechazado_gestionado)||!!(g.rechazado_sin_gestion);}
  if(g.gestion_final)return true; // compatibilidad con versiones anteriores
  const ll=g.llamada;
  if(!ll)return false;
  if(ll==='contestó'){
    if(p.estadoKey==='oficina'){
      return tieneNotaHoy(p.id);
    }
    return true;
  }
  return false;
}

// ── HISTORIAL FIREBASE POR GUÍA ────────────────────────────────────────
let _fbHistGuias = {}; // {guia: {notas:[], eventos:[]}}

function _fbCargarHistorialPropio(cb){
  if(!window._currentUsername||typeof _db==='undefined'){if(cb)cb();return;}
  _db.ref('gestiones_sync/'+_gsKey()).once('value').then(snap=>{
    _fbHistGuias={};
    const data=snap.val()||{};
    Object.values(data).forEach(g=>{
      const guia=g._guia;
      if(!guia)return;
      if(!_fbHistGuias[guia])_fbHistGuias[guia]={notas:[],eventos:[]};
      if(g.notas&&Array.isArray(g.notas)) g.notas.forEach(n=>_fbHistGuias[guia].notas.push(n));
      const evts=g.eventos?Object.values(g.eventos):[];
      evts.forEach(e=>{if(e.tipo)_fbHistGuias[guia].eventos.push(e);});
    });
    if(cb)cb();
  }).catch(()=>{if(cb)cb();});
}

// ── STORAGE ────────────────────────────────────────────────────────────
let _guardarTimer=null;
function guardar(){
  // Debounce: agrupar múltiples guardados seguidos en uno solo (máx 800ms de espera)
  if(_guardarTimer) clearTimeout(_guardarTimer);
  _guardarTimer = setTimeout(()=>{
    try{
      localStorage.setItem(LS_KEY,JSON.stringify({pedidos,gestiones,waCounters,sesionInicio,tiemposPorSeccion,totalPausadoMs,contadorPausas,contadorAlertasInactividad,estadosDesactivados:[...estadosDesactivados],ordenSecciones:ordenSecciones||[],mesCargado:window._mesCargado||null,ts:Date.now()}));
      const now=new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
      const el=document.getElementById('save-st');if(el)el.textContent='💾 '+now;
    }catch(e){}
  }, 800);
}

function checkSesion(){
  try{
    const raw=localStorage.getItem(LS_KEY);if(!raw)return;
    const d=JSON.parse(raw);if(!d.pedidos||!d.pedidos.length)return;
    const ts=new Date(d.ts);
    const hace=Math.round((Date.now()-d.ts)/60000);
    const mismo=ts.toDateString()===new Date().toDateString();
    document.getElementById('restore-info').textContent=
      mismo?d.pedidos.length+' pedidos · guardado hace '+(hace<1?'menos de 1 min':hace+' min')
           :'Sesión del '+ts.toLocaleDateString('es-CO')+' · '+d.pedidos.length+' pedidos';
    document.getElementById('restore-banner').style.display='flex';
  }catch(e){}
}

function restaurar(){
  try{
    const d=JSON.parse(localStorage.getItem(LS_KEY));
    if(!d||!Array.isArray(d.pedidos)||!d.pedidos.length){toast('⚠️ No se pudo restaurar: datos inválidos o vacíos.');return;}
    pedidos=d.pedidos;gestiones=d.gestiones||{};
    _pedidoMap=new Map(pedidos.map(p=>[p.id,p]));
    if(d.mesCargado) window._mesCargado=d.mesCargado;
    // Limpiar mensajes_listos al restaurar — la cola se controla manualmente cada sesión
    Object.values(gestiones).forEach(g=>{ delete g.mensajes_listos; });
    waCounters=d.waCounters||{reparto:0,oficina:0,transito:0,novedad:0};
    sesionInicio=d.sesionInicio||Date.now();
    tiemposPorSeccion=d.tiemposPorSeccion||{};
    totalPausadoMs=d.totalPausadoMs||0;
    contadorPausas=d.contadorPausas||0;
    contadorAlertasInactividad=d.contadorAlertasInactividad||0;
    estadosDesactivados=d.estadosDesactivados&&d.estadosDesactivados.length?new Set(d.estadosDesactivados):new Set();
    if(d.ordenSecciones&&d.ordenSecciones.length)ordenSecciones=d.ordenSecciones;
    ultimaGestion=Date.now(); // al restaurar reiniciamos el contador de inactividad
    document.getElementById('restore-banner').style.display='none';
    document.getElementById('upload-zone').style.display='none';
    document.getElementById('main').style.display='block';document.body.classList.add('data-loaded');
    document.getElementById('right-panel').style.display='flex';
    _fbRestaurarGestiones(()=>{renderAll();toast('✅ Sesión restaurada');_iniciarEscuchaNovedadesExt();});
  }catch(e){toast('⚠️ No se pudo restaurar.');}
}

function descartar(){localStorage.removeItem(LS_KEY);document.getElementById('restore-banner').style.display='none';}

let _archivosPendiente=null;
function cargar(file){
  const gestionesActivas=Object.keys(gestiones||{}).length;
  if(pedidos&&pedidos.length&&gestionesActivas>0){
    _archivosPendiente=file;
    document.getElementById('nuevo-modal-desc').innerHTML=
      'Tienes <strong>'+gestionesActivas+' gestiones</strong> registradas.<br><br>'+
      '✅ Si es de la misma tienda: tus gestiones se conservarán.<br>'+
      '🔄 Si es de tienda diferente: las gestiones anteriores no se mezclarán.';
    document.getElementById('nuevo-modal').style.display='flex';
    return;
  }
  _cargarArchivo(file);
}
function _nuevoCancelar(){document.getElementById('nuevo-modal').style.display='none';_archivosPendiente=null;document.getElementById('file-input').value='';}
function _nuevoConfirmar(){document.getElementById('nuevo-modal').style.display='none';const f=_archivosPendiente;_archivosPendiente=null;_cargarArchivo(f);}
function _cargarArchivo(file){
  const reader=new FileReader();
  reader.onload=ev=>{
    const nuevosPedidos=parsear(new Uint8Array(ev.target.result));
    if(!nuevosPedidos.length){toast('⚠️ No se detectaron pedidos accionables. Verifica que sea el reporte "Órdenes Productos" de Dropi.');return;}

    // Preservar gestiones existentes: remap por dropiId (clave estable entre excels)
    const gestionesPrevias={};
    // Fuente 1: pedidos en memoria (si ya había sesión activa)
    if(pedidos&&pedidos.length){
      pedidos.forEach(p=>{
        if(gestiones[p.id]&&p.dropiId){
          gestionesPrevias[p.dropiId]=gestiones[p.id];
        }
      });
    }
    // Fuente 2: localStorage (si el archivo es nuevo pero hay sesión guardada)
    if(!Object.keys(gestionesPrevias).length){
      try{
        const saved=JSON.parse(localStorage.getItem(LS_KEY)||'null');
        if(saved&&saved.pedidos&&saved.gestiones){
          saved.pedidos.forEach(p=>{
            if(saved.gestiones[p.id]&&p.dropiId){
              gestionesPrevias[p.dropiId]=saved.gestiones[p.id];
            }
          });
        }
      }catch(e){}
    }
    pedidos=nuevosPedidos;
    _pedidoMap=new Map(pedidos.map(p=>[p.id,p]));
    // Detectar el mes del Excel desde las fechas de los pedidos
    (function(){
      const mesesConteo={};
      pedidos.forEach(p=>{
        if(!p.fechaOrden)return;
        const val=p.fechaOrden;
        let d;
        if(typeof val==='number'){d=new Date(Math.round((val-25569)*86400*1000));}
        else{const s=String(val).trim(),pts=s.split(/[\/\-\.]/);
          if(pts.length===3){d=pts[0].length===4?new Date(pts[0],pts[1]-1,pts[2]):new Date(pts[2],pts[1]-1,pts[0]);}
          else{d=new Date(s);}
        }
        if(!d||isNaN(d))return;
        const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
        mesesConteo[k]=(mesesConteo[k]||0)+1;
      });
      const sorted=Object.entries(mesesConteo).sort((a,b)=>b[1]-a[1]);
      if(sorted.length){
        window._mesCargado=sorted[0][0];
        // _hoyLocal y no toISOString: el 31 a las 19:00 hora Colombia, la
        // versión UTC ya da el mes siguiente y el banner avisaría que el Excel
        // es de otro mes cuando en realidad es el del día.
        const mesActual=_hoyLocal().slice(0,7);
        const banner=document.getElementById('mes-excel-banner');
        const bannerTxt=document.getElementById('mes-excel-banner-txt');
        if(banner&&bannerTxt){
          if(window._mesCargado!==mesActual){
            const [y,m]=window._mesCargado.split('-');
            const nomMes=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][parseInt(m)-1];
            bannerTxt.innerHTML='El Excel cargado corresponde a <strong>'+nomMes+' '+y+'</strong>. Todas las gestiones y novedades se guardarán en ese mes.';
            banner.style.display='flex';
          }else{
            banner.style.display='none';
          }
        }
      }
    })();
    if(typeof _db!=='undefined'&&window._currentUsername){
      _db.ref('presence/'+window._currentUsername).update({totalPedidos:pedidos.length});
    }
    // Reasignar gestiones al nuevo id interno usando dropiId como puente
    gestiones={};
    pedidos.forEach(p=>{
      if(p.dropiId&&gestionesPrevias[p.dropiId]){
        gestiones[p.id]=gestionesPrevias[p.dropiId];
      }
    });
    // Al cargar nuevo Excel: conservar notas y devolución, resetear la gestión activa
    Object.values(gestiones).forEach(g=>{
      delete g.llamada; delete g.llamada_fecha; delete g.llamada_ts;
      delete g.wa_enviado; delete g.gestion_final; delete g.mensajes_listos;
      delete g.chatepro; delete g.nueva_entrega; delete g.nov_solucionada;
      delete g.intentos; delete g.wa_nov_enviado; delete g.wa_nov_idx;
      delete g.guia_reportada; delete g.guia_generada_hoy;
      // g.notas, g.nota, g.devolucion, g.rechazado_gestionado, g.rechazado_sin_gestion se conservan
    });
    // Restaurar notas históricas desde LS_NOTES (clave estable por guía)
    try{
      const _lsN=JSON.parse(localStorage.getItem(LS_NOTES)||'{}');
      pedidos.forEach(p=>{
        if(!p.guia)return;
        const notasEst=_lsN[p.guia];
        if(!notasEst||!notasEst.length)return;
        if(!gestiones[p.id])gestiones[p.id]={};
        if(!gestiones[p.id].notas||!gestiones[p.id].notas.length){
          gestiones[p.id].notas=notasEst;
        }
      });
    }catch(e){}
    const recuperadas=Object.keys(gestiones).filter(k=>gestiones[k].notas&&gestiones[k].notas.length).length;

    waCounters=waCounters||{reparto:0,oficina:0,transito:0,novedad:0};
    sesionInicio=Date.now(); // Siempre desde el momento en que se carga el archivo
    tiemposPorSeccion={};
    // Resetear contadores al cargar nuevo archivo
    ultimaGestion=Date.now();
    contadorAlertasInactividad=0;
    pausaActiva=false;pausaInicio=null;totalPausadoMs=0;contadorPausas=0;
    const _btnP=document.getElementById('btn-pausa');
    if(_btnP){_btnP.style.background='rgba(245,158,11,.25)';_btnP.style.borderColor='rgba(245,158,11,.4)';_btnP.style.color='#fcd34d';_btnP.textContent='⏸ Pausa';}
    document.getElementById('alerta-inac').classList.remove('show');
    document.getElementById('restore-banner').style.display='none';
    document.getElementById('upload-zone').style.display='none';
    document.getElementById('main').style.display='block';document.body.classList.add('data-loaded');
    document.getElementById('right-panel').style.display='flex';
    guardar();
    _syncGuiasReporteAdmin();
    setTimeout(mostrarBienvenida,300);
    _fbRestaurarGestiones(()=>{
      _fbRestaurarRechazados(()=>{
        _fbRestaurarGestionadosHoy(()=>{
          _fbCargarHistorialPropio(()=>{
            renderAll();
            toast('\u{1F4E6} '+pedidos.length+' pedidos cargados'+(recuperadas?' · 📝 '+recuperadas+' con historial de notas':''));
            // Auto-poblar RO con pedidos en Oficina
            setTimeout(_roAutoSync, 1500);
            _iniciarEscuchaNovedadesExt();
          });
        });
      });
    });
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('file-input').addEventListener('change',e=>{if(e.target.files[0])cargar(e.target.files[0]);});
const da=document.getElementById('drop-area');
da.addEventListener('dragover',e=>{e.preventDefault();da.classList.add('drag');});
da.addEventListener('dragleave',()=>da.classList.remove('drag'));
da.addEventListener('drop',e=>{e.preventDefault();da.classList.remove('drag');if(e.dataTransfer.files[0])cargar(e.dataTransfer.files[0]);});
(function(){
  document.getElementById('fecha').textContent=new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
  // Inicializar toggle de vista
  document.querySelectorAll('.btn-vista').forEach(b=>b.classList.toggle('activo',b.dataset.vista===vistaActual));
})();

// ── RENDER ─────────────────────────────────────────────────────────────

// ── NAVEGACIÓN HORIZONTAL ENTRE SECCIONES ─────────────────────────────
let _secIdx=0;
function buildSecNav(){
  const ct=document.getElementById('content');
  const secs=[...ct.querySelectorAll('.status-section')];
  const nav=document.getElementById('sec-nav');
  const dots=document.getElementById('sec-dots');
  if(!dots)return;
  dots.innerHTML='';
  if(secs.length<=1){nav.style.display='none';return;}
  nav.style.display='flex';
  secs.forEach((_,i)=>{
    const d=document.createElement('div');
    d.style.cssText='width:7px;height:7px;border-radius:50%;background:'+(i===0?'white':'rgba(255,255,255,.35)')+';cursor:pointer;transition:background .2s;';
    d.onclick=()=>goSec(i);
    dots.appendChild(d);
  });
  _secIdx=0;
  // Remover listener anterior antes de agregar uno nuevo para evitar acumulación
  if(ct._secScrollHandler) ct.removeEventListener('scroll',ct._secScrollHandler,{passive:true});
  ct._secScrollHandler=()=>{
    const w=ct.offsetWidth;const idx=Math.round(ct.scrollLeft/w);
    if(idx!==_secIdx){_secIdx=idx;updateDots();}
  };
  ct.addEventListener('scroll',ct._secScrollHandler,{passive:true});
}
function updateDots(){
  const dots=[...document.getElementById('sec-dots').children];
  dots.forEach((d,i)=>d.style.background=i===_secIdx?'white':'rgba(255,255,255,.35)');
}
function goSec(i){
  const ct=document.getElementById('content');
  const secs=[...ct.querySelectorAll('.status-section')];
  if(secs[i]){ct.scrollTo({left:ct.offsetWidth*i,behavior:'smooth'});_secIdx=i;updateDots();}
}
function navSec(dir){
  const ct=document.getElementById('content');
  const total=ct.querySelectorAll('.status-section').length;
  goSec(Math.max(0,Math.min(total-1,_secIdx+dir)));
}

// ── BIENVENIDA ─────────────────────────────────────────────────────────
const FRASES=[
  'Cada llamada que haces hoy es un cliente que recibe su pedido feliz. ¡Vamos!',
  'La logística no se ve, pero se siente. Tu trabajo hoy importa más de lo que crees.',
  'Un pedido gestionado a tiempo es una promesa cumplida. Tú haces eso posible.',
  'Detrás de cada guía hay alguien esperando. Hoy tú eres el puente.',
  'El equipo de logística mueve el negocio. Hoy es un buen día para demostrarlo.',
  'No es solo entregar paquetes, es entregar experiencias. Gracias por hacerlo bien.',
  'Los mejores equipos no esperan la motivación, la crean. ¡Arranca fuerte hoy!',
];

const ESTADOS_ORIGINAL=[...ESTADOS]; // orden original inmutable

const BV_CONFIGS=[
  {key:'reparto',      icon:'📋',label:'Guía generada',   color:'#2563eb'},
  {key:'oficina',      icon:'🏢', label:'En oficina',   color:'#7c3aed'},
  {key:'transito',     icon:'\uD83D\uDCE6', label:'En tránsito',  color:'#0891b2'},
  {key:'novedad',      icon:'⚠️', label:'En novedad',   color:'#d97706'},
  {key:'rechazado',    icon:'🚫', label:'Rechazados / Anulados', color:'#be123c'},
];
let ordenSecciones=null; // se resetea cada carga
let estadosDesactivados=new Set(); // estados excluidos de la sesión

function mostrarBienvenida(){
  // Restaurar orden original antes de mostrar opciones
  ESTADOS.length=0;
  ESTADOS_ORIGINAL.forEach(e=>ESTADOS.push(e));
  estadosDesactivados=new Set();

  const frase=FRASES[new Date().getDay()%FRASES.length];
  document.getElementById('bv-frase').textContent='"'+frase+'"';

  // Solo mostrar secciones con pedidos
  const activos=BV_CONFIGS.filter(cfg=>pedidos.filter(p=>p.estadoKey===cfg.key&&!sinAccion(p)).length>0);
  const total=activos.reduce((s,cfg)=>s+pedidos.filter(p=>p.estadoKey===cfg.key&&!sinAccion(p)).length,0);
  document.getElementById('bv-total').textContent=total;

  // Resetear orden cada vez que se sube el excel
  ordenSecciones=activos.map(cfg=>cfg.key);

  // Construir lista draggable con toggles
  const lista=document.getElementById('bv-orden-list');
  lista.innerHTML='';
  activos.forEach((cfg,idx)=>{
    const cnt=pedidos.filter(p=>p.estadoKey===cfg.key&&!sinAccion(p)).length;
    const item=document.createElement('div');
    item.className='bv-orden-item';
    item.dataset.key=cfg.key;
    item.draggable=true;

    const toggleId='tog_'+cfg.key;
    item.innerHTML=
      '<span class="bv-drag-handle">⠿</span>'+
      '<span class="bv-item-color" style="background:'+cfg.color+'"></span>'+
      '<span class="bv-item-icon">'+cfg.icon+'</span>'+
      '<div class="bv-item-info">'+
        '<div class="bv-item-label">'+cfg.label+'</div>'+
        '<div class="bv-item-cnt">'+cnt+' pedidos</div>'+
      '</div>'+
      '<label class="bv-toggle" onclick="event.stopPropagation()">'+
        '<input type="checkbox" id="'+toggleId+'" checked onchange="toggleEstado(\''+cfg.key+'\',this.checked,this.closest(\'.bv-orden-item\'))">'+
        '<span class="bv-toggle-track"></span>'+
      '</label>';

    // Drag events
    item.addEventListener('dragstart',e=>{
      if(estadosDesactivados.has(cfg.key))return e.preventDefault();
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',cfg.key);
    });
    item.addEventListener('dragend',()=>{
      item.classList.remove('dragging');
      lista.querySelectorAll('.bv-orden-item').forEach(i=>i.classList.remove('drag-over'));
      ordenSecciones=[...lista.querySelectorAll('.bv-orden-item')].map(i=>i.dataset.key);
    });
    item.addEventListener('dragover',e=>{
      e.preventDefault();
      const dragging=lista.querySelector('.dragging');
      if(dragging&&dragging!==item){
        const rect=item.getBoundingClientRect();
        const mid=rect.top+rect.height/2;
        lista.querySelectorAll('.bv-orden-item').forEach(i=>i.classList.remove('drag-over'));
        item.classList.add('drag-over');
        if(e.clientY<mid) lista.insertBefore(dragging,item);
        else lista.insertBefore(dragging,item.nextSibling);
      }
    });
    lista.appendChild(item);
  });

  document.getElementById('bienvenida-modal').classList.add('open');
}

function toggleEstado(key,activo,itemEl){
  if(!activo){estadosDesactivados.add(key);itemEl.classList.add('disabled');itemEl.draggable=false;}
  else{estadosDesactivados.delete(key);itemEl.classList.remove('disabled');itemEl.draggable=true;}
  // Actualizar total
  const lista=document.getElementById('bv-orden-list');
  const activos=[...lista.querySelectorAll('.bv-orden-item:not(.disabled)')].map(i=>i.dataset.key);
  const total=activos.reduce((s,key)=>s+pedidos.filter(p=>p.estadoKey===key&&!sinAccion(p)).length,0);
  document.getElementById('bv-total').textContent=total;
}

function cerrarBienvenida(){
  // Aplicar orden al array ESTADOS (solo los activos)
  const lista=document.getElementById('bv-orden-list');
  ordenSecciones=[...lista.querySelectorAll('.bv-orden-item:not(.disabled)')].map(i=>i.dataset.key);
  if(ordenSecciones&&ordenSecciones.length){
    const noOrdenados=ESTADOS.filter(e=>!ordenSecciones.includes(e.key)&&!estadosDesactivados.has(e.key));
    const ordenados=ordenSecciones.map(k=>ESTADOS.find(e=>e.key===k)).filter(Boolean);
    ESTADOS.length=0;
    ordenados.forEach(e=>ESTADOS.push(e));
    noOrdenados.forEach(e=>ESTADOS.push(e));
  }
  document.getElementById('bienvenida-modal').classList.remove('open');
  renderAll();
  guardar(); // guardar secciones desactivadas antes de cualquier acción
  // Siempre pedir configuración de tiendas — cada agente puede tener tiendas distintas
  if(_exccelTiendas.length>0||_hayVaciasAT){
    _cfgOnboarding=true;
    abrirConfig('tiendas');
  } else {
    abrirInformeInicial();
  }
}



let _renderAllPending=false;
function renderAll(){
  if(_renderAllPending)return; // Ya hay un render programado, ignorar duplicados
  _renderAllPending=true;
  requestAnimationFrame(()=>{
    _renderAllPending=false;
    renderPills();renderCards();_agruparColsPorDias();_cardFloatReabrir();renderProgress();renderResumen();
    actualizarBtnRapid();actualizarBtnSeguimiento();actualizarBtnTransp();
    actualizarBadgeSinGuia();buildSecNav();renderTranspLinks();
  });
}

// Reconstruye solo la card de un pedido (sin tocar el resto del DOM)
function _actualizarCard(id){
  const p=_pedidoMap.get(id); if(!p)return;
  const old=document.getElementById('card-'+id); if(!old)return;
  const est=ESTADOS.find(e=>e.key===p.estadoKey); if(!est)return;
  old.replaceWith(_mkCardEl(p,est,false));
  renderStats();
  if(_renderAllTimer)clearTimeout(_renderAllTimer);
  _renderAllTimer=setTimeout(renderAll,3000);
}

// Actualiza contadores y progress sin reconstruir las tarjetas (operación rápida)
function renderStats(){
  renderPills(); renderProgress(); renderResumen();
  actualizarBtnRapid(); actualizarBtnSeguimiento(); actualizarBtnTransp();
  actualizarBadgeSinGuia();
}

// Desvanece la tarjeta completada sin reconstruir todo el DOM.
// Actualiza contadores al instante y re-renderiza apenas termina el fade:
// el pedido aparece en la columna Gestionadas de inmediato.
let _renderAllTimer=null;
function _completarYLimpiar(id){
  const card=document.getElementById('card-'+id);
  if(card){
    card.style.transition='opacity .25s,transform .25s';
    card.style.opacity='0';
    card.style.transform='scale(.96)';
    setTimeout(()=>{
      if(card.parentNode)card.remove();
      const w=document.getElementById('card-float-wrap');
      if(w&&!w.querySelector('.card'))_cardFloatClose();
    },260);
  }
  renderStats();
  if(_renderAllTimer)clearTimeout(_renderAllTimer);
  _renderAllTimer=setTimeout(renderAll,350);
}

const TRANSP_DB=[
  {keys:['coordinadora'],          label:'Coordinadora',    color:'#e11d48', url:'https://coordinadora.com/'},
  {keys:['envia'],                  label:'Envia',           color:'#f59e0b', url:'https://envia.co/'},
  {keys:['interrapidisimo','inter'],label:'Interrapidísimo', color:'#2563eb', url:'http://reportes.interrapidisimo.com/Reportes/ExploradorEnvios/ExploradorEnvios.aspx'},
  {keys:['veloces'],                label:'Veloces',         color:'#16a34a', url:'https://tracking.veloces.app/'},
  {keys:['jamv','jamvdriver'],      label:'Jamv Driver',     color:'#7c3aed', url:'https://trackingcol.jamvdriver.com/'},
  {keys:['tcc'],                    label:'TCC',             color:'#0891b2', url:'https://www.tcc.com.co/'},
  {keys:['servientrega'],           label:'Servientrega',    color:'#ea580c', url:'https://www.servientrega.com/'},
  {keys:['deprisa'],                label:'Deprisa',         color:'#0284c7', url:'https://www.deprisa.com/'},
];

function renderTranspLinks(){
  const contenedor=document.getElementById('transp-popup-links');
  if(!contenedor)return;
  // Obtener transportadoras únicas de los pedidos activos
  const activas=new Set(pedidos.map(p=>norm(p.transportadora||'')).filter(Boolean));
  // Filtrar la DB a las que aparecen en los pedidos
  const visibles=TRANSP_DB.filter(t=>t.keys.some(k=>Array.from(activas).some(a=>a.includes(k))));
  if(!visibles.length){contenedor.innerHTML='<span style="font-size:.72rem;color:var(--text-3);padding:4px 8px;">Sin transportadoras</span>';return;}
  contenedor.innerHTML=visibles.map(t=>
    `<a class="transp-link" href="${t.url}" target="_blank"><span class="transp-dot" style="background:${t.color}"></span>${t.label}</a>`
  ).join('');
}

function renderPills(){
  const div=document.getElementById('pills');div.innerHTML='';
  const pendSinGuia=pedidos.filter(p=>p.estadoKey==='pendiente').length;
  const allPend=pedidos.filter(p=>p.estadoKey!=='pendiente'&&!sinAccion(p)&&!estaCompleta(p)).length;
  ESTADOS.forEach(est=>{
    const gr=pedidos.filter(p=>p.estadoKey===est.key);if(!gr.length)return;
    if(estadosDesactivados.has(est.key))return;
    const pend=gr.filter(p=>!sinAccion(p)&&!estaCompleta(p)).length;
    const ac=filtroActivo===est.key;
    const sp=document.createElement('span');sp.className='stat-pill';
    sp.style.cssText='border-color:'+est.color+';color:'+(ac?'white':est.color)+';background:'+(ac?est.color:'');
    sp.innerHTML=est.icon+' '+est.label+' <strong>('+pend+')</strong>';
    sp.onclick=()=>{
      if(!ac){if(!tiemposPorSeccion[est.key])tiemposPorSeccion[est.key]={inicio:Date.now(),fin:null};else tiemposPorSeccion[est.key].inicio=Date.now();}
      else if(tiemposPorSeccion[est.key]){tiemposPorSeccion[est.key].fin=Date.now();}
      filtroActivo=ac?null:est.key;renderAll();guardar();
    };
    div.appendChild(sp);
  });
  // Sin guía al final
  if(pendSinGuia>0){
    const pBtn=document.createElement('span');pBtn.className='stat-pill';
    const pAc=filtroActivo==='pendiente';
    pBtn.style.cssText='border-color:var(--danger);color:'+(pAc?'white':'#dc2626')+';background:'+(pAc?'#dc2626':'');
    pBtn.innerHTML='⏳ Sin guía <strong>('+pendSinGuia+')</strong>';
    pBtn.onclick=()=>{filtroActivo=pAc?null:'pendiente';renderAll();};
    div.appendChild(pBtn);
  }
}

function renderCards(){
  const _w0=document.getElementById('card-float-wrap');
  window._floatReopenId=_w0?parseInt(_w0.dataset.cardId,10):null;
  if(typeof _cardFloatClose==='function')_cardFloatClose();
  const ct=document.getElementById('content');ct.innerHTML='';
  // ── SECCIÓN PENDIENTES SIN GUÍA ── (resumen por antigüedad y producto)
  if(filtroActivo==='pendiente'){
    const pends=pedidos.filter(p=>p.estadoKey==='pendiente');
    if(pends.length){
      const sec=document.createElement('div');sec.className='status-section';
      const hdr=document.createElement('div');hdr.className='section-header';hdr.style.borderColor='#dc2626';
      hdr.innerHTML='<span style="font-size:1.2rem">⏳</span>'+
        '<h2 style="color:var(--danger)">Pendientes sin guía</h2>'+
        '<span class="sec-badge" style="background:var(--danger-soft);color:var(--danger)">'+pends.length+' pedidos</span>';
      sec.appendChild(hdr);

      // ── Resumen por antigüedad ──
      const p_ok   = pends.filter(p=>(horasDesde(p.fechaOrden)||0)<24);
      const p_warn = pends.filter(p=>{const h=horasDesde(p.fechaOrden)||0;return h>=24&&h<48;});
      const p_urg  = pends.filter(p=>(horasDesde(p.fechaOrden)||0)>=48);

      const antigBox=document.createElement('div');
      antigBox.style.cssText='display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 14px;';
      const mkAntig=(emoji,label,count,bg,color)=>{
        if(!count)return;
        const d=document.createElement('div');
        d.style.cssText='flex:1;min-width:130px;background:'+bg+';border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:3px;';
        d.innerHTML='<span style="font-size:1.5rem;font-weight:800;color:'+color+'">'+count+'</span>'+
          '<span style="font-size:.72rem;font-weight:700;color:'+color+'">'+emoji+' '+label+'</span>';
        antigBox.appendChild(d);
      };
      mkAntig('🟢','Menos de 1 día',  p_ok.length,  'var(--bg-inset)','var(--text-2)');
      mkAntig('⚠️','1 día — Revisar',p_warn.length,'var(--warning-soft)','var(--warning)');
      mkAntig('🚨','Más de 2 días — Escalar YA',p_urg.length,'var(--danger-soft)','var(--danger)');
      sec.appendChild(antigBox);

      // ── Resumen por producto ──
      const byProd={};
      pends.forEach(p=>{
        const prod=getProductoSimple(p.productos)||'Sin producto';
        const h=horasDesde(p.fechaOrden)||0;
        if(!byProd[prod])byProd[prod]={total:0,ok:0,warn:0,urg:0};
        byProd[prod].total++;
        if(h<24)byProd[prod].ok++;
        else if(h<48)byProd[prod].warn++;
        else byProd[prod].urg++;
      });

      const prodTitle=document.createElement('div');
      prodTitle.style.cssText='font-size:.74rem;font-weight:700;color:var(--text-2);margin-bottom:7px;text-transform:uppercase;letter-spacing:.4px;';
      prodTitle.textContent='Por producto';
      sec.appendChild(prodTitle);

      const tbl=document.createElement('table');
      tbl.style.cssText='width:100%;border-collapse:collapse;font-size:.78rem;background:var(--bg-card);border-radius:10px;overflow:hidden;border:1px solid var(--border);';
      tbl.innerHTML='<thead><tr style="background:var(--bg-hover)">'+
        '<th style="padding:8px 12px;text-align:left;color:var(--text-1);font-weight:700;border-bottom:1px solid var(--border)">Producto</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--text-1);font-weight:700;border-bottom:1px solid var(--border)">Total</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--text-2);font-weight:700;border-bottom:1px solid var(--border)">🟢 Hoy</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--warning);font-weight:700;border-bottom:1px solid var(--border)">⚠️ 1 día</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--danger);font-weight:700;border-bottom:1px solid var(--border)">🚨 +2 días</th>'+
      '</tr></thead>';
      const tbody=document.createElement('tbody');
      Object.entries(byProd).sort((a,b)=>b[1].urg-a[1].urg||b[1].warn-a[1].warn).forEach(([prod,v],i)=>{
        const tr=document.createElement('tr');
        tr.style.cssText='background:'+(i%2===0?'var(--bg-card)':'var(--bg-hover)')+';';
        tr.innerHTML='<td style="padding:7px 12px;color:var(--text-1);font-weight:500">'+prod+'</td>'+
          '<td style="padding:7px 10px;text-align:center;font-weight:700;color:var(--text-1)">'+v.total+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--text-2);font-weight:600">'+(v.ok||'—')+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--warning);font-weight:600">'+(v.warn||'—')+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--danger);font-weight:'+(v.urg?'700':'400')+'">'+((v.urg?v.urg:'—'))+'</td>';
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      sec.appendChild(tbl);

      // Botón exportar
      const btnExp=document.createElement('button');
      btnExp.style.cssText='margin-top:12px;background:#131920;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;';
      btnExp.innerHTML='\uD83D\uDCE4 Exportar por proveedor para escalar';
      btnExp.onclick=exportarPendientes;
      sec.appendChild(btnExp);
      ct.appendChild(sec);
    }
  }

  (filtroActivo?ESTADOS.filter(e=>e.key===filtroActivo):ESTADOS.filter(e=>!estadosDesactivados.has(e.key))).forEach(est=>{
    const gr=pedidos.filter(p=>p.estadoKey===est.key&&(filtroTiendas.length===0||filtroTiendas.includes(p.tienda)));if(!gr.length)return;
    const subFiltro=filtrosSeccion[est.key]||[];
    const grFiltrado=subFiltro.length>0?gr.filter(p=>subFiltro.includes(p.estadoRaw)):gr;
    // Los "sin acción" quedan fuera de la sección entera, no solo de las cards:
    // antes se filtraban acá y seguían contando en el progreso y en el badge,
    // así que un archivo con 10 guías de las que 5 eran de hoy mostraba 5 para
    // gestionar pero reportaba 10 pendientes.
    const gestionables=grFiltrado.filter(p=>!sinAccion(p));
    const pendientes=gestionables.filter(p=>!estaCompleta(p));
    pendientes.sort((a,b)=>urgenciaScore(b)-urgenciaScore(a));
    const gestionados=gestionables.filter(p=>estaCompleta(p));
    const sec=document.createElement('div');sec.className='status-section';
    const hdr=document.createElement('div');hdr.className='section-header';hdr.style.borderColor=est.color;
    hdr.innerHTML='<span style="font-size:1.2rem">'+est.icon+'</span>'+
      '<h2 style="color:'+est.color+'">'+est.label+'</h2>'+
      '<span class="sec-badge" style="background:'+est.color+'22;color:'+est.color+'">'+pendientes.length+' pendientes</span>';
    sec.appendChild(hdr);
    if(est.guion){
      const gb=document.createElement('div');gb.className='guion-box';gb.style.borderColor=est.color;
      gb.innerHTML='<strong style="color:'+est.color+'">\uD83D\uDCCB Guión:</strong> '+est.guion;
      sec.appendChild(gb);
    }
    // ── Filtros (fila con estado + tienda) ──
    const rawsDisponibles=[...new Set(gr.map(p=>p.estadoRaw).filter(Boolean))].sort();
    const tiendasSeccion=[...new Set(pedidos.filter(p=>p.estadoKey===est.key).map(p=>p.tienda).filter(Boolean))];
    const hayFiltroEstado=rawsDisponibles.length>1;
    const hayFiltroTienda=tiendasSeccion.length>1;
    if(hayFiltroEstado||hayFiltroTienda){
      const filaFiltros=document.createElement('div');
      filaFiltros.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px;';

      // Filtro por estado
      if(hayFiltroEstado){
        if(!filtrosSeccion[est.key])filtrosSeccion[est.key]=[];
        const seleccionados=filtrosSeccion[est.key];
        const wrap=document.createElement('div');wrap.className='sec-filtro-wrap';
        wrap.style.setProperty('--sec-color',est.color);wrap.style.margin='0';
        const hayFiltro=seleccionados.length>0;
        const btn=document.createElement('div');
        btn.className='sec-filtro-btn'+(hayFiltro?' activo':'');
        btn.innerHTML='🔽 Filtrar por estado'+(hayFiltro?'<span class="sec-filtro-badge">'+seleccionados.length+'</span>':'')+'<span class="sf-arrow">▼</span>';
        const dd=document.createElement('div');dd.className='sec-filtro-dropdown';
        const limpiar=document.createElement('button');limpiar.className='sf-limpiar';
        limpiar.innerHTML='✕ Limpiar filtros';
        limpiar.onclick=(e)=>{e.stopPropagation();filtrosSeccion[est.key]=[];renderAll();};
        dd.appendChild(limpiar);
        const divider=document.createElement('hr');divider.className='sf-divider';
        dd.appendChild(divider);
        rawsDisponibles.forEach(raw=>{
          const cnt=gr.filter(p=>p.estadoRaw===raw&&!estaCompleta(p)&&!sinAccion(p)).length;
          if(!cnt)return;
          const item=document.createElement('div');item.className='sf-item';
          const chk=document.createElement('input');chk.type='checkbox';chk.checked=seleccionados.includes(raw);
          const lbl=document.createElement('label');lbl.textContent=raw;
          const cnt_span=document.createElement('span');cnt_span.className='sf-count';cnt_span.textContent=cnt;
          item.appendChild(chk);item.appendChild(lbl);item.appendChild(cnt_span);
          item.onclick=(e)=>{
            e.stopPropagation();
            const idx=filtrosSeccion[est.key].indexOf(raw);
            if(idx>-1)filtrosSeccion[est.key].splice(idx,1);
            else filtrosSeccion[est.key].push(raw);
            renderAll();
          };
          dd.appendChild(item);
        });
        btn.onclick=(e)=>{
          e.stopPropagation();
          const opening=!btn.classList.contains('open');
          btn.classList.toggle('open');dd.classList.toggle('open');
          if(opening){document.addEventListener('click',()=>{btn.classList.remove('open');dd.classList.remove('open');},{once:true});}
        };
        wrap.appendChild(btn);wrap.appendChild(dd);
        filaFiltros.appendChild(wrap);
      }

      // Filtro por tienda
      if(hayFiltroTienda){
        const wrap2=document.createElement('div');wrap2.className='sec-filtro-wrap';
        wrap2.style.setProperty('--sec-color','#6366f1');wrap2.style.margin='0';
        const hayFiltroT=filtroTiendas.length>0;
        const btn2=document.createElement('div');
        btn2.className='sec-filtro-btn'+(hayFiltroT?' activo':'');
        btn2.innerHTML='🏪 Tienda'+(hayFiltroT?'<span class="sec-filtro-badge">'+filtroTiendas.length+'</span>':'')+'<span class="sf-arrow">▼</span>';
        const dd2=document.createElement('div');dd2.className='sec-filtro-dropdown';
        const limpiar2=document.createElement('button');limpiar2.className='sf-limpiar';
        limpiar2.innerHTML='✕ Limpiar filtros';
        limpiar2.onclick=(e)=>{e.stopPropagation();filtroTiendas=[];renderAll();};
        dd2.appendChild(limpiar2);
        const div2=document.createElement('hr');div2.className='sf-divider';dd2.appendChild(div2);
        tiendasSeccion.forEach(tienda=>{
          const color=getTiendaColor(tienda);
          const cnt=gr.filter(p=>p.tienda===tienda&&!estaCompleta(p)&&!sinAccion(p)).length;
          const item=document.createElement('div');item.className='sf-item';
          const chk=document.createElement('input');chk.type='checkbox';chk.checked=filtroTiendas.includes(tienda);chk.style.accentColor=color;
          const dot=document.createElement('span');dot.style.cssText='width:10px;height:10px;border-radius:50%;background:'+color+';flex-shrink:0;display:inline-block;';
          const lbl=document.createElement('label');lbl.textContent=tienda;
          const cntSpan=document.createElement('span');cntSpan.className='sf-count';cntSpan.textContent=cnt;
          item.appendChild(chk);item.appendChild(dot);item.appendChild(lbl);item.appendChild(cntSpan);
          item.onclick=(e)=>{
            e.stopPropagation();
            const idx=filtroTiendas.indexOf(tienda);
            if(idx>-1)filtroTiendas.splice(idx,1);
            else filtroTiendas.push(tienda);
            renderAll();
          };
          dd2.appendChild(item);
        });
        btn2.onclick=(e)=>{
          e.stopPropagation();
          const opening2=!btn2.classList.contains('open');
          btn2.classList.toggle('open');dd2.classList.toggle('open');
          if(opening2){document.addEventListener('click',()=>{btn2.classList.remove('open');dd2.classList.remove('open');},{once:true});}
        };
        wrap2.appendChild(btn2);wrap2.appendChild(dd2);
        filaFiltros.appendChild(wrap2);
      }

      sec.appendChild(filaFiltros);
    }
    if(est.key==='pendiente_sin_guia'){
      // ── Resumen por antigüedad ──
      const p_ok2  =pendientes.filter(p=>(horasDesde(p.fechaOrden)||0)<24);
      const p_warn2=pendientes.filter(p=>{const h=horasDesde(p.fechaOrden)||0;return h>=24&&h<48;});
      const p_urg2 =pendientes.filter(p=>(horasDesde(p.fechaOrden)||0)>=48);
      const antigBox2=document.createElement('div');
      antigBox2.style.cssText='display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 14px;';
      const mkA=(emoji,label,count,bg,color)=>{
        if(!count)return;
        const d=document.createElement('div');
        d.style.cssText='flex:1;min-width:130px;background:'+bg+';border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:3px;';
        d.innerHTML='<span style="font-size:1.5rem;font-weight:800;color:'+color+'">'+count+'</span>'+
          '<span style="font-size:.72rem;font-weight:700;color:'+color+'">'+emoji+' '+label+'</span>';
        antigBox2.appendChild(d);
      };
      mkA('🟢','Menos de 1 día',  p_ok2.length,  'var(--bg-inset)','var(--text-2)');
      mkA('⚠️','1 día — Revisar',p_warn2.length,'var(--warning-soft)','var(--warning)');
      mkA('🚨','Más de 2 días — Escalar YA',p_urg2.length,'var(--danger-soft)','var(--danger)');
      sec.appendChild(antigBox2);
      // ── Resumen por producto ──
      const byProd2={};
      pendientes.forEach(p=>{
        const prod=getProductoSimple(p.productos)||'Sin producto';
        const h=horasDesde(p.fechaOrden)||0;
        if(!byProd2[prod])byProd2[prod]={total:0,ok:0,warn:0,urg:0};
        byProd2[prod].total++;
        if(h<24)byProd2[prod].ok++;
        else if(h<48)byProd2[prod].warn++;
        else byProd2[prod].urg++;
      });
      const prodTitle2=document.createElement('div');
      prodTitle2.style.cssText='font-size:.74rem;font-weight:700;color:var(--text-2);margin-bottom:7px;text-transform:uppercase;letter-spacing:.4px;';
      prodTitle2.textContent='Por producto';
      sec.appendChild(prodTitle2);
      const tbl2=document.createElement('table');
      tbl2.style.cssText='width:100%;border-collapse:collapse;font-size:.78rem;background:var(--bg-card);border-radius:10px;overflow:hidden;border:1px solid var(--border);';
      tbl2.innerHTML='<thead><tr style="background:var(--bg-hover)">'+
        '<th style="padding:8px 12px;text-align:left;color:var(--text-1);font-weight:700;border-bottom:1px solid var(--border)">Producto</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--text-1);font-weight:700;border-bottom:1px solid var(--border)">Total</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--text-2);font-weight:700;border-bottom:1px solid var(--border)">🟢 Hoy</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--warning);font-weight:700;border-bottom:1px solid var(--border)">⚠️ 1 día</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--danger);font-weight:700;border-bottom:1px solid var(--border)">🚨 +2 días</th>'+
      '</tr></thead>';
      const tbody2=document.createElement('tbody');
      Object.entries(byProd2).sort((a,b)=>b[1].urg-a[1].urg||b[1].warn-a[1].warn).forEach(([prod,v],i)=>{
        const tr=document.createElement('tr');
        tr.style.cssText='background:'+(i%2===0?'var(--bg-card)':'var(--bg-hover)')+';';
        tr.innerHTML='<td style="padding:7px 12px;color:var(--text-1);font-weight:500">'+prod+'</td>'+
          '<td style="padding:7px 10px;text-align:center;font-weight:700;color:var(--text-1)">'+v.total+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--text-2);font-weight:600">'+(v.ok||'—')+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--warning);font-weight:600">'+(v.warn||'—')+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--danger);font-weight:'+(v.urg?'700':'400')+'">'+((v.urg?v.urg:'—'))+'</td>';
        tbody2.appendChild(tr);
      });
      tbl2.appendChild(tbody2);
      sec.appendChild(tbl2);
      const btnExp=document.createElement('button');
      btnExp.style.cssText='margin-top:12px;background:#131920;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;';
      btnExp.innerHTML='\uD83D\uDCE4 Exportar por proveedor para escalar';
      btnExp.onclick=exportarPendientes;
      sec.appendChild(btnExp);
    } else if(est.key==='novedad'){
      const novActivos=pendientes.filter(p=>!gestiones[p.id]?.mensajes_listos);
      const novMsgListos=pendientes.filter(p=>gestiones[p.id]?.mensajes_listos);
      // Ordenar por FECHA DE NOVEDAD descendente (más días en novedad = mayor prioridad)
      novActivos.sort((a,b)=>(diasDesde(b.fechaNovedad)||0)-(diasDesde(a.fechaNovedad)||0));
      const novGrid=_mkGrid();
      if(novActivos.length){
        novActivos.forEach(p=>novGrid.appendChild(_mkCardNovEl(p)));
      } else if(!novMsgListos.length){
        novGrid.innerHTML='<div class="empty-s">✅ Todas las novedades gestionadas</div>';
      }
      sec.appendChild(novGrid);
      if(novMsgListos.length){
        const barML=document.createElement('div');barML.className='gest-bar fondo-bar';
        barML.style.cssText='border-left:3px solid #94a3b8;background:var(--bg-inset);';
        barML.innerHTML='<span style="color:var(--text-2);font-weight:700">⏬ '+novMsgListos.length+' — En cola (pendientes al fondo)</span><span class="ver">ver ›</span>';
        const listML=document.createElement('div');listML.className='gest-list fondo-list';
        const gridML=_mkGrid();
        novMsgListos.forEach(p=>gridML.appendChild(_mkCardNovEl(p)));
        listML.appendChild(gridML);
        barML.onclick=()=>{listML.classList.toggle('open');barML.querySelector('.ver').textContent=listML.classList.contains('open')?'ocultar ‹':'ver ›';};
        sec.appendChild(barML);sec.appendChild(listML);
      }
    } else if(est.key==='transito'){
      // Dos columnas fijas en vez de agrupar por días: "para recomendar" y
      // "para reportar". El grupo lo decide el ESTADO que trae Dropi, con la
      // misma regla que la vista de Seguimiento a transportadoras
      // (_transpGrupoDe), para que las dos vistas no se contradigan.
      // Dentro de cada columna se ordena por días sin movimiento, del más
      // estancado al menos: lo que más tiempo lleva quieto va primero.
      const conAccAll=pendientes.filter(p=>!sinAccion(p));
      const pFondo=conAccAll.filter(p=>gestiones[p.id]?.mensajes_listos);
      const conAcc=conAccAll.filter(p=>!gestiones[p.id]?.mensajes_listos);
      const diasQuieto=p=>(p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);
      const cols={recomendar:[], reportar:[], sinGrupo:[]};
      conAcc.forEach(p=>{ const gr=_transpGrupoDe(p); (cols[gr||'sinGrupo']).push(p); });
      ['recomendar','reportar','sinGrupo'].forEach(k=>
        cols[k].sort((a,b)=>diasQuieto(b)-diasQuieto(a)));

      if(conAcc.length){
        // Se reusan las clases de la vista por columnas (.cards-cols/.day-col),
        // que ya están resueltas para scroll y para los dos temas.
        const wrap=document.createElement('div');
        wrap.className='cards-cols';
        ['recomendar','reportar'].forEach(k=>{
          const meta=TRANSP_GRUPOS[k];
          const col=document.createElement('div');
          col.className='day-col';
          const h=document.createElement('div');
          h.className='day-col-hdr';
          // El color va por variable de tema, no por el de TRANSP_GRUPOS: esos
          // (#0e7490 y #b91c1c) están pensados para el fondo claro de la vista
          // de Seguimiento y sobre el fondo oscuro del kanban quedaban en
          // 2,97:1, por debajo del mínimo legible. Medido en los dos temas.
          const cvar = k==='reportar' ? 'var(--danger-strong)' : 'var(--info-strong)';
          h.style.color=cvar;
          h.innerHTML='<span>'+meta.icon+' '+esc(meta.label)+'</span>'+
                      '<span class="day-col-count" style="background:'+meta.border+'22;color:'+cvar+'">'+cols[k].length+'</span>';
          const body=document.createElement('div');
          body.className='day-col-body';
          if(!cols[k].length){
            const em=document.createElement('div');
            em.className='empty-s'; em.style.margin='0';
            em.textContent='Sin guías en este grupo';
            body.appendChild(em);
          } else cols[k].forEach(p=>body.appendChild(_mkCardEl(p,est,false)));
          col.appendChild(h); col.appendChild(body);
          wrap.appendChild(col);
        });
        sec.appendChild(wrap);
        // Los estados que no caen en ninguno de los dos grupos no se pierden:
        // se listan aparte para que alguien decida si hay que clasificarlos.
        if(cols.sinGrupo.length){
          const bar=document.createElement('div');bar.className='gest-bar';
          bar.innerHTML='<span>❔ '+cols.sinGrupo.length+' sin clasificar (estado no está en recomendar ni reportar)</span><span class="ver">ver ›</span>';
          const list=document.createElement('div');list.className='gest-list';
          const g2=_mkGrid();
          cols.sinGrupo.forEach(p=>g2.appendChild(_mkCardEl(p,est,false)));
          list.appendChild(g2);
          bar.onclick=()=>{list.classList.toggle('open');bar.querySelector('.ver').textContent=list.classList.contains('open')?'ocultar ‹':'ver ›';};
          sec.appendChild(bar);sec.appendChild(list);
        }
      }
      if(false){
        const lbl=document.createElement('div');
        lbl.style.cssText='font-size:.73rem;font-weight:700;color:var(--text-2);margin:8px 0 6px;';
        lbl.innerHTML='\uD83D\uDCE8 Pendientes de mensaje ('+msgPend.length+')';
        sec.appendChild(lbl);
        const grid=_mkGrid();
        msgPend.forEach(p=>grid.appendChild(_mkCardEl(p,est,false)));
        sec.appendChild(grid);
      } else if(false){
        const lbl=document.createElement('div');
        lbl.style.cssText='font-size:.73rem;color:var(--text-2);font-weight:600;margin:8px 0 6px;';
        lbl.textContent='✅ Todos los mensajes de transito enviados por hoy';
        sec.appendChild(lbl);
      }
      if(false){
        const bar=document.createElement('div');bar.className='gest-bar';
        bar.innerHTML='<span>\uD83D\uDCE8 '+msgEnv.length+' con mensaje enviado recientemente</span><span class="ver">ver ›</span>';
        const list=document.createElement('div');list.className='gest-list';
        const grid2=_mkGrid();
        msgEnv.forEach(p=>{const c=_mkCardEl(p,est,false);c.style.opacity='.4';c.style.pointerEvents='none';grid2.appendChild(c);});
        list.appendChild(grid2);
        bar.onclick=()=>{list.classList.toggle('open');bar.querySelector('.ver').textContent=list.classList.contains('open')?'ocultar ‹':'ver ›';};
        sec.appendChild(bar);sec.appendChild(list);
      }
      if(pFondo.length){
        const barP=document.createElement('div');barP.className='gest-bar fondo-bar';
        barP.style.cssText='border-left:3px solid #94a3b8;background:var(--bg-inset);';
        barP.innerHTML='<span style="color:var(--text-2);font-weight:700">&#11015;&#65039; PENDIENTE ('+pFondo.length+')</span><span class="ver">ver &rsaquo;</span>';
        const listP=document.createElement('div');listP.className='gest-list fondo-list';
        const gridP=_mkGrid();
        pFondo.forEach(p=>gridP.appendChild(_mkCardEl(p,est,false)));
        listP.appendChild(gridP);
        barP.onclick=()=>{listP.classList.toggle('open');barP.querySelector('.ver').innerHTML=listP.classList.contains('open')?'ocultar &lsaquo;':'ver &rsaquo;';};
        sec.appendChild(barP);sec.appendChild(listP);
      }
    } else {
      // Solo se mueven al fondo los que tienen mensajes_listos (botón explícito)
      const pActivos   = pendientes.filter(p=>!gestiones[p.id]?.mensajes_listos);
      const pMsgListos = pendientes.filter(p=>gestiones[p.id]?.mensajes_listos);
      if(pActivos.length){
        const grid=_mkGrid();
        pActivos.forEach(p=>grid.appendChild(_mkCardEl(p,est,false)));
        sec.appendChild(grid);
      } else if(!pMsgListos.length){
        const em=document.createElement('div');em.className='empty-s';em.textContent='✅ Todos los pedidos de este grupo están gestionados';sec.appendChild(em);
      }
      // Mensajes listos → sección colapsada al fondo
      if(pMsgListos.length){
        const barML=document.createElement('div');barML.className='gest-bar fondo-bar';
        barML.style.cssText='border-left:3px solid #94a3b8;background:var(--bg-inset);';
        barML.innerHTML='<span style="color:var(--text-2);font-weight:700">⏬ '+pMsgListos.length+' — En cola (pendientes al fondo)</span><span class="ver">ver ›</span>';
        const listML=document.createElement('div');listML.className='gest-list fondo-list';
        const gridML=_mkGrid();
        pMsgListos.forEach(p=>gridML.appendChild(_mkCardEl(p,est,false)));
        listML.appendChild(gridML);
        barML.onclick=()=>{listML.classList.toggle('open');barML.querySelector('.ver').textContent=listML.classList.contains('open')?'ocultar ‹':'ver ›';};
        sec.appendChild(barML);sec.appendChild(listML);
      }
    }
    if(gestionados.length){
      const bar=document.createElement('div');bar.className='gest-bar gestionadas-bar';
      bar.innerHTML='<span>✅ '+gestionados.length+' gestionados</span><span class="ver">ver ›</span>';
      const list=document.createElement('div');list.className='gest-list gestionadas-list';
      const g2=_mkGrid();
      gestionados.forEach(p=>g2.appendChild(_mkCardEl(p,est,true)));
      list.appendChild(g2);
      bar.onclick=()=>{list.classList.toggle('open');bar.querySelector('.ver').textContent=list.classList.contains('open')?'ocultar ‹':'ver ›';};
      sec.appendChild(bar);sec.appendChild(list);
    }
    ct.appendChild(sec);
  });
  if(!ct.innerHTML.trim())ct.innerHTML='<div class="empty-s" style="padding:60px">No hay pedidos.</div>';
}

function crearCard(p,est,esGest){
  const g=gestiones[p.id]||{};
  const editando=_editandoGestion.has(p.id);
  const ncPend=!esGest&&g.llamada==='no_contestó'&&!g.gestion_final;
  const card=document.createElement('div');
  // Las de tránsito quedaron con dos botones y nada más, así que la altura fija
  // de 295px del kanban les dejaba media card vacía. Con esta clase crecen solo
  // lo que ocupan.
  card.className='card'+((esGest&&!editando)?' gest':ncPend?' nc-pend':'')+
                 (est.key==='transito'?' card-corta':'');
  card.dataset.dias=_diasCard(p);
  const tiendaColor=p.tienda?getTiendaColor(p.tienda):null;
  card.style.borderLeftColor=(esGest&&!editando)?'var(--text-3)':est.color;
  card.id='card-'+p.id;
  const intentos=g.intentos||0;
  const prodSimple=getProductoSimple(p.productos);
  const telDisplay=p.telefono?p.telefono.replace(/^57/,''):null;

  let html=
    '<div class="card-top">'+
      '<div style="flex:1;min-width:0">'+
        '<div class="card-guia copiable" '+(p.guia?'data-val="'+p.guia+'" onclick="event.stopPropagation();copiarTexto(this.dataset.val)"':'')+'>'+(p.guia?'<span class="ico">\u{1F4E6}</span> '+p.guia+' <span style="font-size:.58rem;color:var(--text-3)">copiar</span>':'Sin guía')+'</div>'+
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+
          '<div class="card-name">'+esc(p.nombre)+'</div>'+
          (p.tienda?'<span style="font-size:.62rem;font-weight:600;padding:1px 7px;border-radius:6px;border:1px solid var(--border);color:var(--text-2);display:inline-flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:'+(tiendaColor||'var(--text-3)')+';display:inline-block;"></span>'+p.tienda+'</span>':'')+
        '</div>'+
        (telDisplay?'<div class="card-phone" onclick="event.stopPropagation();copiarTel(\''+p.telefono+'\')"><span class="ico">📞</span> '+telDisplay+'<span class="copy-hint">copiar</span></div>':'<div style="font-size:.78rem;color:var(--text-3)">Sin teléfono</div>')+
      '</div>'+
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">'+
        (g.devolucion?'<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:8px;background:var(--danger-soft);color:var(--danger)">🔄 Devolución</span>':g.guia_generada_hoy?'<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:8px;background:var(--info-soft);color:var(--info)">📦 Sin gestión</span>':g.transito_gestionado?'<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:8px;background:var(--success-soft);color:var(--success)">✅ Gestionado</span>':g.transito_sin_gestion?'<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:8px;background:var(--info-soft);color:var(--info)">🚚 Sin novedad</span>':g.rechazado_gestionado?'<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:8px;background:var(--success-soft);color:var(--success)">✅ Gestionado</span>':g.rechazado_sin_gestion?'<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:8px;background:var(--danger-soft);color:var(--danger)">🚫 Sin gestión</span>':(esGest&&!editando)?'<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:8px;background:var(--success-soft);color:var(--success)">✅ Listo</span>':'')+
        (ncPend&&intentos>0?'<span class="intentos-badge">📵 '+intentos+' intento'+(intentos>1?'s':'')+'</span>':'')+
      '</div>'+
    '</div>';

  html+='<div class="card-meta">';
  if(p.ciudad)html+='<span class="meta-chip ciudad"><span class="ico">\u{1F4CD}</span> '+p.ciudad+(p.depto?', '+p.depto:'')+'</span>';
  if(p.transportadora)html+='<span class="meta-chip transp"><span class="ico">📮</span> '+p.transportadora+'</span>';
  html+='</div>';
  if(prodSimple)html+='<div class="card-producto"><span class="ico">🛍️</span> '+prodSimple+'</div>';
  if(p.valor){const vf=formatValor(p.valor);if(vf)html+='<div style="font-size:.78rem;font-weight:800;color:var(--success);font-family:var(--f-mono);margin-top:5px;display:inline-block"><span class="ico">💰</span> '+vf+'</div>';}
  if(p.direccion)html+='<div class="card-addr"><span class="ico">\u{1F4CD}</span> '+p.direccion+'</div>';
  if(p.novedad&&est.key==='telemercadeo')html+='<div class="card-nov">⚠️ '+p.novedad+'</div>';

  // Badge historial para todas las secciones
  const hInfo=histGetInfo(p.guia);
  if(!esGest||editando){
    const partes=[];
    if(hInfo)if(hInfo.llamada){
      const dc=Math.floor((Date.now()-hInfo.llamada.ts)/86400000);
      partes.push(hInfo.llamada.resultado==='contestó'
        ?'📞 Contestó '+(dc===0?'hoy':'hace '+dc+(dc===1?' dia':' dias'))
        :'📵 No contestó '+(dc===0?'hoy':'hace '+dc+(dc===1?' dia':' dias')));
    }
    if(hInfo&&hInfo.wa){
      const dw=Math.floor((Date.now()-hInfo.wa.ts)/86400000);
      partes.push('\uD83D\uDCE8 WA '+(dw===0?'hoy':'hace '+dw+(dw===1?' dia':' dias')));
    }
    if(hInfo&&hInfo.fin){
      const df=Math.floor((Date.now()-hInfo.fin.ts)/86400000);
      partes.push('✅ Gestionado '+(df===0?'hoy':'hace '+df+(df===1?' dia':' dias')));
    }
    {
      const hayHist=_histTieneRegistros(p);
      const izqTxt=partes.length
        ? partes.map(pt=>'<span>'+pt+'</span>').join('<span style="opacity:.4">&middot;</span>')
        : (_ultimoMovimientoTxt(p)||(hayHist?'':'<span style="opacity:.55;">Sin historial</span>'));
      html+='<div style="font-size:.67rem;background:var(--bg-inset);border-radius:6px;padding:4px 8px;margin-top:6px;color:var(--text-2);display:flex;flex-wrap:wrap;align-items:center;gap:6px;">'+
        '<span style="flex:1;display:flex;flex-wrap:wrap;gap:6px;min-width:0;">'+izqTxt+'</span>'+
        '<span onclick="event.stopPropagation();abrirHistorial('+p.id+',this)" title="Ver historial del cliente" style="cursor:pointer;font-size:.85rem;flex-shrink:0;position:relative;">'+
          '<span>&#128337;</span>'+
          (hayHist?'<span style="position:absolute;top:-3px;right:-6px;width:8px;height:8px;border-radius:50%;background:#ef4444;border:1.5px solid var(--bg-inset);"></span>':'')+
        '</span>'+
      '</div>';
    }
  }

  // Badge historial Firebase (sesiones anteriores)
  if(p.guia&&(!esGest||editando)){
    const fh=_fbHistGuias[p.guia];
    if(fh&&(fh.notas.length||fh.eventos.length)){
      const tn=fh.notas.length, te=fh.eventos.length;
      const ultima=tn>0?[...fh.notas].sort((a,b)=>(b.ts||0)-(a.ts||0))[0]:null;
      const resumen=(tn>0?tn+' nota'+(tn>1?'s':''):'')+(tn>0&&te>0?' · ':'')+(te>0?te+' acción'+(te>1?'es':''):'');
      html+=
        '<div onclick="event.stopPropagation();_verHistorialCliente(\''+p.guia.replace(/'/g,"\\'")+'\')" '+
        'style="font-size:.67rem;background:var(--bg-inset);border:1px solid var(--border);border-radius:6px;padding:5px 9px;margin-top:6px;color:var(--text-2);cursor:pointer;display:flex;align-items:center;gap:6px;">'+
          '<span>📋</span>'+
          '<span style="flex:1;min-width:0;">'+resumen+(ultima?' — <em style="color:var(--text-2)">'+ultima.texto.slice(0,40)+(ultima.texto.length>40?'...':'')+'</em>':'')+'</span>'+
          '<span style="opacity:.5;font-size:.6rem;flex-shrink:0;">ver historial →</span>'+
        '</div>';
    }
  }

  let _accUrgente='';
  if(est.key==='oficina'||p.dias!==null){
    if(false&&est.key==='oficina'){
      // Badge de días vencidos y link "Validar dónde está" desactivados en la card de Oficina
      const d=p.diasSinMov!=null?p.diasSinMov:(p.dias||0);
      const rest=5-d;
      let cls='d-verde',txt='';
      if(rest<=0){cls='d-rojo';txt='🚨 '+d+' dias — VENCIDO';}
      else if(d>=3){cls='d-amarillo';txt='⏳ '+d+' dias — '+rest+' restantes';}
      else{cls='d-verde';txt='📅 '+d+' dias — '+rest+' dias restantes';}
      html+='<div class="dias-badge '+cls+'">'+txt+'</div>';
      if(rest<=0){
        _accUrgente+='<a href="http://reportes.interrapidisimo.com/Reportes/ExploradorEnvios/ExploradorEnvios.aspx" target="_blank" '+
          'style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:7px;'+
          'background:var(--danger-soft);color:var(--danger);border:1px solid rgba(230,57,70,.35);padding:7px 10px;border-radius:8px;font-size:.73rem;font-weight:700;text-decoration:none;">'+
          '\uD83D\uDD0D Validar dónde está realmente el paquete</a>';
      }
    } else if(est.key==='reparto'){
      if(p.diasSinMov==null){
        html+='<div class="dias-badge" style="background:var(--bg-inset);color:var(--text-3);">📅 Sin dato de movimiento</div>';
      } else {
      const dRep = p.diasSinMov;
      let clsR,txtR;
      if(dRep>=3){clsR='d-rojo';txtR='🚨 '+dRep+(dRep===1?' día':' días')+' en guía generada — ESCALAR';}
      else if(dRep>=2){clsR='d-amarillo';txtR='⚠️ '+dRep+' días en guía generada — revisar';}
      else if(dRep===1){clsR='d-amarillo';txtR='📦 1 día en guía generada';}
      else{clsR='d-verde';txtR='🚚 Entró en Guía Generada hoy';}
      html+='<div class="dias-badge '+clsR+'">'+txtR+'</div>';
      // Aviso CAS si lleva +3 días en reparto
      if(dRep>=3){
        const casIdR='cas-rep-'+p.id;
        _accUrgente+='<div style="background:var(--bg-hover);border:1px solid rgba(230,181,57,.3);border-radius:8px;padding:8px 10px;margin-top:6px;">'+
          '<div style="font-size:.7rem;font-weight:700;color:var(--warning);margin-bottom:5px;">📋 Abrir caso en Dropi → CAS</div>'+
          '<div style="font-size:.68rem;color:var(--text-2);margin-bottom:6px;font-style:italic;">Órdenes sin movimiento</div>'+
          '<button class="btn-cas" id="'+casIdR+'" onclick="casCopiar(CAS_SIN_MOVIMIENTO(),this.id)">📋 Copiar texto para CAS</button>'+
        '</div>';
      }
      } // cierre else diasSinMov
    } else if(false&&est.key==='transito'&&(p.dias||0)>=4){
      // Badge de días de urgencia en tránsito desactivado
      const cls=p.dias>=7?'d-rojo':'d-amarillo';
      const txt=p.dias>=7?'🔴 '+p.dias+' dias — urgente':'🟡 '+p.dias+' dias en transito';
      html+='<div class="dias-badge '+cls+'">'+txt+'</div>';
      const diasHist=histDiasDesde(p.guia);
      if(diasHist!==null&&diasHist<2){
        html+='<div class="dias-badge" style="background:var(--warning-soft);color:var(--warning);margin-left:4px">\uD83D\uDCE8 Enviado hace '+diasHist+(diasHist===1?' dia':' dias')+'</div>';
      }
    }
  }

  // ── ZONA DE GESTIÓN (oculta hasta expandir la card) ──
  html+='<div class="card-gestion">';
  html+=_accUrgente;
  // El aviso CAS de tránsito vive ahora en el bloque de los dos botones, más
  // abajo: acá salía además del de allá y la card mostraba "Copiar texto para
  // CAS" dos veces.

  if(esGest&&!editando){
    const _ultG=getUltimaNota(p.id);
    if(_ultG){
      html+='<div style="margin-top:8px;padding:6px 10px;background:var(--bg-hover);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;font-size:.73rem;">'+
        '<span style="color:var(--accent);margin-right:4px;">📝</span>'+
        '<span style="color:var(--text-3);">'+(_ultG.fecha||'')+'&nbsp;·&nbsp;</span>'+
        '<span style="color:var(--text-1);word-break:break-word;">'+_ultG.texto.replace(/</g,'&lt;')+'</span>'+
      '</div>';
    }
    if(est.key!=='rechazado'){
      html+='<button class="btn-dev" onclick="marcarDevolucion('+p.id+')" style="width:100%;margin-top:8px;padding:7px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid '+(g.devolucion?'var(--danger)':'var(--border-strong)')+';background:'+(g.devolucion?'var(--danger)':'transparent')+';color:'+(g.devolucion?'white':'var(--text-2)')+';cursor:pointer;">'+
        (g.devolucion?'🔄 Marcado para devolución — clic para desmarcar':'🔄 Pedido para devolución')+'</button>';
    }
    html+='<div style="display:flex;gap:8px;margin-top:8px;">'+
      '<button onclick="editarGestion('+p.id+')" style="flex:1;padding:8px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer;">✏️ Editar gestión</button>'+
      '<button onclick="eliminarGestion('+p.id+')" style="flex:1;padding:8px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid rgba(230,57,70,.4);background:transparent;color:var(--danger);cursor:pointer;">🗑️ Eliminar y devolver</button>'+
    '</div>';
    html+=_btnHistHtml(p);
  }

  if(!esGest||editando){
    if(editando){
      html+='<div style="font-size:.7rem;font-weight:700;color:var(--accent);background:var(--bg-hover);border-radius:6px;padding:5px 8px;margin-bottom:6px;">✏️ Editando gestión — este pedido sigue en Gestionadas</div>';
    }
    // Tránsito queda fuera: su banner decía "Enviar WhatsApp de seguimiento" y
    // en esta sección ya no se contacta al cliente, se reporta en el CAS.
    if(est.key!=='pendiente_sin_guia'&&est.key!=='oficina'&&est.key!=='transito') html+=queSigueBanner(p,est.key);
    html+='<div class="acciones">';
    if(est.key==='pendiente_sin_guia'){
      const p_ok2  =pendientes.filter(p=>(horasDesde(p.fechaOrden)||0)<24);
      const p_warn2=pendientes.filter(p=>{const h=horasDesde(p.fechaOrden)||0;return h>=24&&h<48;});
      const p_urg2 =pendientes.filter(p=>(horasDesde(p.fechaOrden)||0)>=48);
      const antigBox2=document.createElement('div');
      antigBox2.style.cssText='display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 14px;';
      const mkA=(emoji,label,count,bg,color)=>{
        if(!count)return;
        const d=document.createElement('div');
        d.style.cssText='flex:1;min-width:130px;background:'+bg+';border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:3px;';
        d.innerHTML='<span style="font-size:1.5rem;font-weight:800;color:'+color+'">'+count+'</span>'+
          '<span style="font-size:.72rem;font-weight:700;color:'+color+'">'+emoji+' '+label+'</span>';
        antigBox2.appendChild(d);
      };
      mkA('🟢','Menos de 1 día',  p_ok2.length,  'var(--bg-inset)','var(--text-2)');
      mkA('⚠️','1 día — Revisar',p_warn2.length,'var(--warning-soft)','var(--warning)');
      mkA('🚨','Más de 2 días — Escalar YA',p_urg2.length,'var(--danger-soft)','var(--danger)');
      sec.appendChild(antigBox2);
      // ── Resumen por producto ──
      const byProd2={};
      pendientes.forEach(p=>{
        const prod=getProductoSimple(p.productos)||'Sin producto';
        const h=horasDesde(p.fechaOrden)||0;
        if(!byProd2[prod])byProd2[prod]={total:0,ok:0,warn:0,urg:0};
        byProd2[prod].total++;
        if(h<24)byProd2[prod].ok++;
        else if(h<48)byProd2[prod].warn++;
        else byProd2[prod].urg++;
      });
      const prodTitle2=document.createElement('div');
      prodTitle2.style.cssText='font-size:.74rem;font-weight:700;color:var(--text-2);margin-bottom:7px;text-transform:uppercase;letter-spacing:.4px;';
      prodTitle2.textContent='Por producto';
      sec.appendChild(prodTitle2);
      const tbl2=document.createElement('table');
      tbl2.style.cssText='width:100%;border-collapse:collapse;font-size:.78rem;background:var(--bg-card);border-radius:10px;overflow:hidden;border:1px solid var(--border);';
      tbl2.innerHTML='<thead><tr style="background:var(--bg-hover)">'+
        '<th style="padding:8px 12px;text-align:left;color:var(--text-1);font-weight:700;border-bottom:1px solid var(--border)">Producto</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--text-1);font-weight:700;border-bottom:1px solid var(--border)">Total</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--text-2);font-weight:700;border-bottom:1px solid var(--border)">🟢 Hoy</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--warning);font-weight:700;border-bottom:1px solid var(--border)">⚠️ 1 día</th>'+
        '<th style="padding:8px 10px;text-align:center;color:var(--danger);font-weight:700;border-bottom:1px solid var(--border)">🚨 +2 días</th>'+
      '</tr></thead>';
      const tbody2=document.createElement('tbody');
      Object.entries(byProd2).sort((a,b)=>b[1].urg-a[1].urg||b[1].warn-a[1].warn).forEach(([prod,v],i)=>{
        const tr=document.createElement('tr');
        tr.style.cssText='background:'+(i%2===0?'var(--bg-card)':'var(--bg-hover)')+';';
        tr.innerHTML='<td style="padding:7px 12px;color:var(--text-1);font-weight:500">'+prod+'</td>'+
          '<td style="padding:7px 10px;text-align:center;font-weight:700;color:var(--text-1)">'+v.total+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--text-2);font-weight:600">'+(v.ok||'—')+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--warning);font-weight:600">'+(v.warn||'—')+'</td>'+
          '<td style="padding:7px 10px;text-align:center;color:var(--danger);font-weight:'+(v.urg?'700':'400')+'">'+((v.urg?v.urg:'—'))+'</td>';
        tbody2.appendChild(tr);
      });
      tbl2.appendChild(tbody2);
      sec.appendChild(tbl2);
      const btnExp=document.createElement('button');
      btnExp.style.cssText='margin-top:12px;background:#131920;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;';
      btnExp.innerHTML='\uD83D\uDCE4 Exportar por proveedor para escalar';
      btnExp.onclick=exportarPendientes;
      sec.appendChild(btnExp);
    } else if(est.key==='transito'){
      // Estos pedidos NO se gestionan hablando con el cliente: se reportan en
      // el CAS, que es otra plataforma. Por eso la card queda con dos botones y
      // nada más — antes tenía desplegable de contacto, botón de WhatsApp, nota
      // y desplegable de resultado, todo para un flujo que acá no aplica.
      // "Gestionado" marca transito_gestionado, que es lo que ya cuenta como
      // gestión del día (ver estaCompleta).
      const casIdTr='cas-tr-'+p.id;
      const dMovTr=(p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);
      html+='<div style="display:flex;flex-direction:column;gap:8px;">'+
        '<div style="font-size:.7rem;font-weight:700;color:var(--warning-strong);">📋 Abrir caso en Dropi → CAS</div>'+
        (dMovTr?'<div style="font-size:.68rem;color:var(--text-2);font-style:italic;margin-top:-4px;">Sin movimiento · '+dMovTr+(dMovTr===1?' día':' días')+' parado</div>':'')+
        '<button class="btn-cas" id="'+casIdTr+'" style="margin:0;" onclick="casCopiar(CAS_SIN_MOVIMIENTO(),this.id)">📋 Copiar texto para CAS</button>'+
        // Verde sólido con texto blanco: sobre --success-soft el texto quedaba
        // en 4,3:1 en tema claro. Este #15803D es el mismo tono ya validado
        // para los estados de Anticipos.
        '<button id="btn-trg-'+p.id+'" onclick="marcarTransitoGestionado('+p.id+',this)" '+
          'style="width:100%;padding:10px 6px;border-radius:8px;font-size:.76rem;font-weight:700;border:none;'+
          'background:#15803D;color:#fff;cursor:pointer;font-family:inherit;">✅ Gestionado</button>'+
      '</div>';
    } else if(est.key==='rechazado'){
      html+=notaWidgetHtml(p.id);
      html+='<div style="display:flex;gap:8px;margin-top:8px;">'+
        '<button id="btn-rg-'+p.id+'" onclick="marcarRechazadoGestionado('+p.id+',this)" style="flex:1;padding:9px 6px;border-radius:8px;font-size:.74rem;font-weight:700;border:2px solid #16a34a;background:transparent;color:var(--success);cursor:pointer;transition:all .25s;">✅ Pedido gestionado</button>'+
        '<button id="btn-rsg-'+p.id+'" onclick="marcarRechazadoSinGestion('+p.id+',this)" style="flex:1;padding:9px 6px;border-radius:8px;font-size:.74rem;font-weight:700;border:2px solid #be123c;background:transparent;color:var(--danger);cursor:pointer;transition:all .25s;">🚫 Rechazado sin gestión</button>'+
      '</div>'+
      '<button onclick="copiarDatosCliente('+p.id+')" style="width:100%;padding:8px;border-radius:8px;font-size:.74rem;font-weight:700;border:2px solid #7c3aed;background:transparent;color:#7c3aed;cursor:pointer;margin-top:6px;">📋 Copiar datos del cliente</button>';
    } else if(est.key==='oficina'){
      // Rediseño en 3 pasos: 1) cómo fue el contacto (dropdown)  2) nota  3) resultado (dropdown, incluye finalizar)
      const wi=getWAInfo(p,est.key);
      const contactoActual=g.contacto_metodo||(g.llamada_ofic?'llamada':g.chatepro?'chatepro':g.wa_enviado?'whatsapp':'');
      const resultadoActual=g.gestion_final?'finalizar':(g.resultado_gestion||(g.devolucion?'devolver':g.mensajes_listos?'fondo':''));
      const contactoOpts=[{value:'',label:'— Selecciona —'},{value:'llamada',label:'📞 Llamada'},{value:'chatepro',label:'💬 ChateaPro'},{value:'whatsapp',label:'📲 WhatsApp'}];
      const puedeFinalizar=!!contactoActual&&tieneNotaHoy(p.id);
      const resultadoOpts=[
        {value:'',label:'— Selecciona —'},
        {value:'fondo',label:'⏬ Pasar al fondo'},
        {value:'devolver',label:'🔄 Devolver pedido'},
        {value:'finalizar',label:g.gestion_final?'✅ Gestión finalizada':'☑️ Finalizar gestión',disabled:!puedeFinalizar,hint:'Selecciona cómo fue el contacto y guarda una nota de hoy primero'}
      ];

      html+='<div style="font-size:.68rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">📋 ¿Cómo fue el contacto?</div>';
      html+=_fselHtml('of-contacto-'+p.id,contactoOpts,contactoActual,'_ofSetContacto('+p.id+',this.value)');
      html+='<div style="margin-top:6px;">'+waBoton(p,est.key,wi,g.wa_enviado)+'</div>';

      if(!g.gestion_final){
        html+='<div style="font-size:.72rem;color:#f59e0b;margin-top:12px;padding:4px 6px;background:#1c1400;border-radius:4px;">📝 ¿Qué dijo el cliente? Escribe una nota — es obligatoria</div>';
      }
      html+='<div class="notas-wrap" style="margin-top:6px;">'+notaInputRowHtml(p.id)+'</div>';

      html+='<div style="font-size:.68rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;margin:12px 0 6px;">➡️ Resultado de la gestión</div>';
      html+=_fselHtml('of-resultado-'+p.id,resultadoOpts,resultadoActual,'_ofSetResultado('+p.id+',this.value)');
    } else if(est.key==='reparto'){
      // Mismo patrón de Oficina/Tránsito/Novedad: 1) cómo fue el contacto (dropdown)  2) nota  3) resultado (dropdown)
      const wi=getWAInfo(p,est.key);
      const contactoActualRep=g.contacto_metodo||(g.chatepro?'chatepro':g.wa_enviado?'whatsapp':'');
      const resultadoActualRep=g.guia_reportada?'reportada':(g.guia_generada_hoy?'generada_hoy':(g.devolucion?'devolver':g.mensajes_listos?'fondo':(g.resultado_gestion||'')));
      const contactoOptsRep=[{value:'',label:'— Selecciona —'},{value:'llamada',label:'📞 Llamada'},{value:'chatepro',label:'💬 ChateaPro'},{value:'whatsapp',label:'📲 WhatsApp'}];
      const resultadoOptsRep=[
        {value:'',label:'— Selecciona —'},
        {value:'fondo',label:'⏬ Pasar al fondo'},
        {value:'reportada',label:g.guia_reportada?'✅ Guía Reportada/Gestionada':'📋 Guía Reportada/Gestionada'},
        {value:'generada_hoy',label:g.guia_generada_hoy&&!g.guia_reportada?'📦 Guía generada hoy — marcada':'📦 Guía generada hoy'},
        {value:'devolver',label:'🔄 Devolver pedido'}
      ];

      html+='<div style="font-size:.68rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">📋 ¿Cómo fue el contacto?</div>';
      html+=_fselHtml('rep-contacto-'+p.id,contactoOptsRep,contactoActualRep,'_repSetContacto('+p.id+',this.value)');
      html+='<div style="margin-top:6px;">'+waBoton(p,est.key,wi,g.wa_enviado)+'</div>';

      html+='<div class="notas-wrap" style="margin-top:12px;">'+notaInputRowHtml(p.id)+'</div>';

      html+='<div style="font-size:.68rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;margin:12px 0 6px;">➡️ Resultado de la gestión</div>';
      html+=_fselHtml('rep-resultado-'+p.id,resultadoOptsRep,resultadoActualRep,'_repSetResultado('+p.id+',this.value)');
    } else {
      // Flujo unificado (sin botones de llamada): WhatsApp + nota + finalizar — telemercadeo (legado)
      const wi=getWAInfo(p,est.key);
      html+=waBoton(p,est.key,wi,g.wa_enviado);
      if(est.key==='telemercadeo'){
        html+='<div class="checks-wrap"><div class="check-row">'+
          '<input type="checkbox" id="ne_'+p.id+'" '+(g.nueva_entrega?'checked':'')+' onchange="setCheck('+p.id+',\'nueva_entrega\',this.checked)"/>'+
          '<label for="ne_'+p.id+'">📅 Nueva entrega coordinada</label>'+
          '</div></div>';
      }
      html+='<div class="checks-wrap">'+
        '<div class="check-row">'+
          '<input type="checkbox" id="cp_'+p.id+'" '+(g.chatepro?'checked':'')+' onchange="setCheck('+p.id+',\'chatepro\',this.checked)"/>'+
          '<label for="cp_'+p.id+'">💬 Contactado por ChateaPro</label>'+
        '</div></div>';
      html+=notaWidgetHtml(p.id);
      if(!g.mensajes_listos&&!g.gestion_final){
        html+='<button style="width:100%;padding:8px;border-radius:8px;font-size:.76rem;font-weight:700;border:none;cursor:pointer;background:#1A2230;color:white;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px;" onclick="marcarMensajesListos('+p.id+')">⏬ Pasar al fondo</button>';
      }
      html+='<button class="btn-finalizar" onclick="marcarFinalizado('+p.id+')" style="margin-top:4px">'+
        (g.gestion_final?'✅ Gestión finalizada':'☑️ Marcar gestión finalizada')+'</button>';
    }
    // Botón devolución — visible en todas las categorías excepto rechazados, oficina, tránsito y reparto (ya va dentro de "Resultado de la gestión")
    if(est.key!=='rechazado'&&est.key!=='oficina'&&est.key!=='transito'&&est.key!=='reparto'){
      html+='<button class="btn-dev" onclick="marcarDevolucion('+p.id+')" style="width:100%;margin-top:8px;padding:7px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid '+(g.devolucion?'var(--danger)':'var(--border-strong)')+';background:'+(g.devolucion?'var(--danger)':'transparent')+';color:'+(g.devolucion?'white':'var(--text-2)')+';cursor:pointer;">'+
        (g.devolucion?'🔄 Marcado para devolución — clic para desmarcar':'🔄 Pedido para devolución')+'</button>';
    }
    if(editando){
      html+='<div style="display:flex;gap:8px;margin-top:8px;">'+
        '<button onclick="terminarEdicionGestion('+p.id+')" style="flex:1;padding:8px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid var(--success);background:transparent;color:var(--success);cursor:pointer;">✅ Terminar edición</button>'+
        '<button onclick="eliminarGestion('+p.id+')" style="flex:1;padding:8px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid rgba(230,57,70,.4);background:transparent;color:var(--danger);cursor:pointer;">🗑️ Eliminar y devolver</button>'+
      '</div>';
    }
    if(est.key!=='oficina'&&est.key!=='transito'&&est.key!=='reparto') html+=_btnHistHtml(p);
    html+='</div>';
  }
  html+='</div>';
  html+= (esGest&&!editando)
    ? '<div class="card-expand-hint" style="gap:8px;cursor:default;">'+
      '<button onclick="event.stopPropagation();editarGestion('+p.id+')" style="flex:1;background:transparent;border:1px solid var(--accent);color:var(--accent);border-radius:6px;padding:5px 8px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit;">✏️ Editar gestión</button>'+
      '<button onclick="event.stopPropagation();_cardToggle('+p.id+')" style="flex:0 0 auto;background:transparent;border:1px solid var(--border-strong);color:var(--text-2);border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit;"><span class="ceh-open">▾ Más</span><span class="ceh-close">▴ Cerrar</span></button>'+
      '</div>'
    : '<div class="card-expand-hint" onclick="event.stopPropagation();_cardToggle('+p.id+')"><span class="ceh-open">▾ Gestionar</span><span class="ceh-close">▴ Ocultar gestión</span></div>';
  card.innerHTML=html;
  return card;
}

// ── CARD NOVEDAD ────────────────────────────────────────────────────────
function formatFechaNov(val){
  if(!val)return null;
  let d;
  if(typeof val==='number'){d=new Date(Math.round((val-25569)*86400*1000));}
  else{const s=String(val).trim(),p=s.split(/[\/\-\.]/);
    if(p.length===3){d=p[0].length===4?new Date(p[0],p[1]-1,p[2]):new Date(p[2],p[1]-1,p[0]);}
    else{d=new Date(s);}
  }
  if(!d||isNaN(d))return null;
  return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
}

const NOV_SOLUCION_DEFAULT={
  coordinar: 'CLIENTE {nombre} COORDINA ENTREGA PARA EL DÍA {dia_siguiente}, HACER ENTREGA EFECTIVA, LLAMAR AL CLIENTE {telefono}',
  norecibe:  'CLIENTE {nombre} INDICA QUE DESEA RECIBIR, SE COORDINA PARA DÍA {dia_siguiente} LLAMAR AL CLIENTE {telefono}',
  direccion: 'CLIENTE {nombre} INDICA DIRECCIÓN ES CORRECTA, SE RECOMIENDA OFRECER EL DIA {dia_siguiente} Y LLAMAR AL CLIENTE {telefono}',
  nopaga:    'CLIENTE {nombre} INDICA QUE DESEA RECIBIR, SE COORDINA PARA DÍA {dia_siguiente} LLAMAR AL CLIENTE {telefono}',
  rehusa:    'CLIENTE {nombre} INDICA QUE DESEA RECIBIR, SE COORDINA PARA DÍA {dia_siguiente} LLAMAR AL CLIENTE {telefono}',
  otra:      'CLIENTE {nombre} INDICA QUE DESEA RECIBIR, SE COORDINA PARA DÍA {dia_siguiente} LLAMAR AL CLIENTE {telefono}',
};

function getDiaSiguiente(){
  const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const d=new Date(Date.now()+86400000);
  return d.getDate()+' DE '+MESES[d.getMonth()];
}

function getNovSolucionTexto(p){
  const cat=clasificarNovedad(p.tipoNovedad||p.novedad);
  const src=CFG.novSolucion||NOV_SOLUCION_DEFAULT;
  const tpl=src[cat]||src.otra||NOV_SOLUCION_DEFAULT[cat];
  const nombre=(p.nombre||'').split(' ')[0].toUpperCase();
  const telefono=(p.telefono||'').replace(/^57/,'');
  return tpl
    .replace(/{nombre}/gi,nombre)
    .replace(/{telefono}/gi,telefono)
    .replace(/{dia_siguiente}/gi,getDiaSiguiente());
}

function copiarSolucionNov(p, btnId){
  const texto=getNovSolucionTexto(p);
  _copiar(texto,()=>toast('📋 Texto de solución copiado — pégalo en Dropi', 3000));
  const btn=document.getElementById(btnId);
  if(btn){
    const orig=btn.innerHTML;
    btn.innerHTML='✅ Copiado';
    btn.style.background='#16a34a';
    btn.style.borderColor='#16a34a';
    btn.style.color='white';
    setTimeout(()=>{btn.innerHTML=orig;btn.style.background='';btn.style.borderColor='';btn.style.color='';},2000);
  }
}

function getMsgNovedad(p){
  const cat=clasificarNovedad(p.tipoNovedad||p.novedad);
  const custom=(CFG.waNov||{})[cat]||'';
  if(custom.trim()) return _aplicarVarsWA(custom,p);
  const msgs=WA_NOV[cat]||WA_NOV.otra;
  const g=gestiones[p.id]||{};
  const idx=(g.wa_nov_idx||0)%msgs.length;
  return _aplicarVarsWA(msgs[idx]||'',p);
}

function crearCardNovedad(p){
  const card=document.createElement('div');
  card.className='card';
  card.dataset.dias=_diasCard(p);
  card.id='card-'+p.id;
  const g=gestiones[p.id]||{};
  const cat=clasificarNovedad(p.tipoNovedad||p.novedad);
  const cfg=NOV_CONFIG[cat];
  card.style.borderLeftColor=cfg.color;
  const tiendaColor=getTiendaColor(p.tienda);
  if(p.tienda==='Al Natural')card.style.background='#e6f6fd';
  else if(p.tienda==='Importados')card.style.background='#f3e8ff';
  const telDisplay=(p.telefono||'').replace(/^57/,'');
  const fechaNov=formatFechaNov(p.fechaNovedad);
  const msg=getMsgNovedad(p);
  const waUrl='https://wa.me/'+p.telefono+'?text='+encodeURIComponent(msg);
  const esGest=!!(g.gestion_final);
  const editando=_editandoGestion.has(p.id);

  let html='';
  // Header
  html+='<div class="card-top">'+
    '<div style="flex:1;min-width:0">'+
      (p.guia?'<div class="card-guia copiable" data-val="'+p.guia+'" onclick="event.stopPropagation();copiarTexto(this.dataset.val)" title="Copiar guía">\uD83D\uDE9A '+p.guia+'</div>':
               '<div class="card-guia">🧾 Orden: '+p.dropiId+'</div>')+
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px">'+
        '<div class="card-name">'+esc(p.nombre)+'</div>'+
        (p.tienda?'<span style="font-size:.62rem;font-weight:700;padding:1px 7px;border-radius:6px;background:'+tiendaColor+';color:white">'+p.tienda+'</span>':'')+
      '</div>'+
      (telDisplay?'<div class="card-phone" onclick="event.stopPropagation();copiarTel(this.dataset.tel)" data-tel="'+p.telefono+'" style="cursor:pointer">📞 '+telDisplay+' <span class="copy-hint">copiar</span></div>':'')+
    '</div>'+

  '</div>';
  // Meta
  html+='<div class="card-meta">'+
    (p.ciudad?'<span class="meta-chip ciudad">\u{1F4CD} '+p.ciudad+(p.depto?', '+p.depto:'')+'</span>':'')+
    (p.transportadora?'<span class="meta-chip transp">📮 '+p.transportadora+'</span>':'')+
  '</div>';
  // Producto
  const prod=getProductoSimple(p.productos);
  if(prod)html+='<div class="card-producto"><span class="ico">🛍️</span> '+prod+'</div>';
  if(p.valor){const vf=formatValor(p.valor);if(vf)html+='<div style="font-size:.78rem;font-weight:800;color:var(--success);font-family:var(--f-mono);margin-top:5px;display:inline-block"><span class="ico">💰</span> '+vf+'</div>';}
  // Badge historial — igual que en Oficina/Tránsito: emoji siempre visible, con punto rojo si hay historial
  if(!esGest||editando){
    const hInfoNov=histGetInfo(p.guia);
    const partesNov=[];
    if(hInfoNov){
      if(hInfoNov.wa){
        const dwN=Math.floor((Date.now()-hInfoNov.wa.ts)/86400000);
        partesNov.push('📨 WA '+(dwN===0?'hoy':'hace '+dwN+(dwN===1?' dia':' dias')));
      }
      if(hInfoNov.fin){
        const dfN=Math.floor((Date.now()-hInfoNov.fin.ts)/86400000);
        partesNov.push('✅ Gestionado '+(dfN===0?'hoy':'hace '+dfN+(dfN===1?' dia':' dias')));
      }
    }
    const hayHistNov=_histTieneRegistros(p);
    const izqTxtNov=partesNov.length
      ? partesNov.map(pt=>'<span>'+pt+'</span>').join('<span style="opacity:.4">&middot;</span>')
      : (_ultimoMovimientoTxt(p)||(hayHistNov?'':'<span style="opacity:.55;">Sin historial</span>'));
    html+='<div style="font-size:.67rem;background:var(--bg-inset);border-radius:6px;padding:4px 8px;margin-top:6px;color:var(--text-2);display:flex;flex-wrap:wrap;align-items:center;gap:6px;">'+
      '<span style="flex:1;display:flex;flex-wrap:wrap;gap:6px;min-width:0;">'+izqTxtNov+'</span>'+
      '<span onclick="event.stopPropagation();abrirHistorial('+p.id+',this)" title="Ver historial del cliente" style="cursor:pointer;font-size:.85rem;flex-shrink:0;position:relative;">'+
        '<span>&#128337;</span>'+
        (hayHistNov?'<span style="position:absolute;top:-3px;right:-6px;width:8px;height:8px;border-radius:50%;background:#ef4444;border:1.5px solid var(--bg-inset);"></span>':'')+
      '</span>'+
    '</div>';
  }
  // Badge novedad
  const tipoLabel=(p.tipoNovedad||p.novedad||'Novedad').toUpperCase();
  html+='<div class="nov-badge" style="background:'+cfg.bg+';color:'+cfg.color+'">'+cfg.icon+' '+tipoLabel+'</div>';
  if(fechaNov)html+='<div class="nov-fecha">📅 Novedad: '+fechaNov+'</div>';
  // Botón CAS si lleva +3 días (la alerta visual de días fue removida)
  const _diasNov=diasDesde(p.fechaNovedad);
  // ── ZONA DE GESTIÓN (oculta hasta expandir la card) ──
  html+='<div class="card-gestion">';
  if(!esGest||editando){
    html+='<div style="font-size:.68rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;margin:6px 0 8px;">⚡ Acciones rápidas</div>';
  }
  if(_diasNov!==null && _diasNov>=3 && !g.gestion_final){
    const casId='cas-nov-'+p.id;
    html+='<button class="btn-cas" id="'+casId+'" style="margin-top:0;margin-bottom:8px;" onclick="casCopiar(CAS_NOVEDAD(),this.id)">📋 Copiar texto CAS — Informar Novedad</button>';
  }

  if(esGest&&!editando){
    html+='<div style="display:flex;gap:8px;margin-top:8px;">'+
      '<button onclick="editarGestion('+p.id+')" style="flex:1;padding:8px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer;">✏️ Editar gestión</button>'+
      '<button onclick="eliminarGestion('+p.id+')" style="flex:1;padding:8px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid rgba(230,57,70,.4);background:transparent;color:var(--danger);cursor:pointer;">🗑️ Eliminar y devolver</button>'+
    '</div>';
  }
  if(!esGest||editando){
    if(editando){
      html+='<div style="font-size:.7rem;font-weight:700;color:var(--accent);background:var(--bg-hover);border-radius:6px;padding:5px 8px;margin-bottom:6px;">✏️ Editando gestión — este pedido sigue en Gestionadas</div>';
    }
    // Botón copiar solución para Dropi
    const btnSolId='btn-sol-nov-'+p.id;
    html+='<button id="'+btnSolId+'" onclick="copiarSolucionNov(pedidos.find(x=>x.id==='+p.id+'),\''+btnSolId+'\')" style="width:100%;padding:8px 12px;border-radius:8px;font-size:.76rem;font-weight:700;border:1.5px solid #6366f1;background:var(--bg-card);color:var(--accent);cursor:pointer;margin-bottom:8px;transition:all .2s;">📝 Copiar solución de novedad</button>';
    if(p.telefono){
      html+='<a class="btn-wa" href="'+waUrl+'" target="_blank" onclick="marcarWANov('+p.id+')" style="margin-bottom:10px;">'+
        (g.wa_nov_enviado?'✅ WhatsApp enviado':'<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L.057 23.882l6.208-1.448A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.865 0-3.618-.485-5.145-1.335l-.369-.217-3.684.859.925-3.574-.24-.381A9.932 9.932 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg> Enviar WhatsApp')+
      '</a>';
    }
    html+='<div class="acciones">';

    {
      // Mismo patrón de Oficina/Tránsito: 1) cómo fue el contacto (dropdown)  2) nota  3) resultado (dropdown)
      const contactoActualNov=g.contacto_metodo||(g.chatepro?'chatepro':g.wa_nov_enviado?'whatsapp':'');
      const resultadoActualNov=g.gestion_final?'solucion_dropi':(g.resultado_gestion||(g.devolucion?'devolver':g.mensajes_listos?'fondo':''));
      const contactoOptsNov=[{value:'',label:'— Selecciona —'},{value:'llamada',label:'📞 Llamada'},{value:'chatepro',label:'💬 ChateaPro'},{value:'whatsapp',label:'📲 WhatsApp'}];
      const tieneSolsNov=!!(g.gdNovKey&&g.gdTieneSols);
      const faltantesNov=[];
      if(!contactoActualNov)faltantesNov.push('el tipo de contacto');
      if(!tieneNotaHoy(p.id))faltantesNov.push('la nota');
      if(!tieneSolsNov)faltantesNov.push('la evidencia');
      const puedeFinalizarNov=faltantesNov.length===0;
      const resultadoOptsNov=[
        {value:'',label:'— Selecciona —'},
        {value:'solucion_dropi',label:g.gestion_final?'✅ Gestión finalizada':'✅ Solución en Dropi',disabled:!puedeFinalizarNov,hint:'Falta: '+faltantesNov.join(', ')},
        {value:'fondo',label:'⏬ Pasar al fondo'},
        {value:'devolver',label:'🔄 Devolver pedido'}
      ];

      html+='<div style="font-size:.68rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">📋 ¿Cómo fue el contacto?</div>';
      html+=_fselHtml('nov-contacto-'+p.id,contactoOptsNov,contactoActualNov,'_novSetContacto('+p.id+',this.value)');

      html+='<div class="notas-wrap" style="margin-top:14px;">'+notaInputRowHtml(p.id)+'</div>';

      // Botón evidencia — siempre visible en novedades
      const tieneSols=g.gdNovKey&&g.gdTieneSols;
      html+='<button onclick="_novEvidenciaModal('+p.id+')" style="width:100%;margin-top:10px;padding:8px;border-radius:8px;font-size:.75rem;font-weight:700;border:1.5px solid #7c3aed;background:'+(tieneSols?'#7c3aed':'transparent')+';color:'+(tieneSols?'white':'#7c3aed')+';cursor:pointer;font-family:inherit;">'+(tieneSols?'📸 Ver / agregar evidencias':'📸 Agregar evidencia')+'</button>';

      html+='<div style="font-size:.68rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;margin:12px 0 6px;">➡️ Resultado de la gestión</div>';
      html+=_fselHtml('nov-resultado-'+p.id,resultadoOptsNov,resultadoActualNov,'_novSetResultado('+p.id+',this.value)');
    }

    if(editando){
      html+='<div style="display:flex;gap:8px;margin-top:8px;">'+
        '<button onclick="terminarEdicionGestion('+p.id+')" style="flex:1;padding:8px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid var(--success);background:transparent;color:var(--success);cursor:pointer;">✅ Terminar edición</button>'+
        '<button onclick="eliminarGestion('+p.id+')" style="flex:1;padding:8px;border-radius:8px;font-size:.73rem;font-weight:700;border:1px solid rgba(230,57,70,.4);background:transparent;color:var(--danger);cursor:pointer;">🗑️ Eliminar y devolver</button>'+
      '</div>';
    }
    html+='</div>';
  }
  html+='</div>';
  html+= (esGest&&!editando)
    ? '<div class="card-expand-hint" style="gap:8px;cursor:default;">'+
      '<button onclick="event.stopPropagation();editarGestion('+p.id+')" style="flex:1;background:transparent;border:1px solid var(--accent);color:var(--accent);border-radius:6px;padding:5px 8px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit;">✏️ Editar gestión</button>'+
      '<button onclick="event.stopPropagation();_cardToggle('+p.id+')" style="flex:0 0 auto;background:transparent;border:1px solid var(--border-strong);color:var(--text-2);border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit;"><span class="ceh-open">▾ Más</span><span class="ceh-close">▴ Cerrar</span></button>'+
      '</div>'
    : '<div class="card-expand-hint" onclick="event.stopPropagation();_cardToggle('+p.id+')"><span class="ceh-open">▾ Gestionar</span><span class="ceh-close">▴ Ocultar gestión</span></div>';
  card.innerHTML=html;
  return card;
}

function copiarNotaNov(id){
  const g=gestiones[id]||{};
  if(!g.nota){toast('Sin nota para copiar');return;}
  _copiar(g.nota,()=>toast('\uD83D\uDCCB Nota copiada'));
}

function marcarWANov(id){ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].wa_nov_enviado=true;
  gestiones[id].wa_nov_idx=(gestiones[id].wa_nov_idx||0)+1;
  guardar();_actualizarCard(id);
}

// ── CARD PENDIENTE SIN GUÍA ──────────────────────────────────────────
function crearCardPendiente(p,color){
  const card=document.createElement('div');
  card.className='card';
  card.style.borderLeftColor=color;
  const tiendaColor=getTiendaColor(p.tienda);
  if(p.tienda==='Al Natural')card.style.background='#e6f6fd';
  else if(p.tienda==='Importados')card.style.background='#f3e8ff';
  const horas=horasDesde(p.fechaOrden);
  const telDisplay=(p.telefono||'').replace(/^57/,'');

  let urgTxt='', urgStyle='';
  if(horas===null){urgTxt='Sin fecha';urgStyle='background:var(--bg-inset);color:var(--text-2)';}
  else if(horas<24){urgTxt='🟢 Hoy — normal';urgStyle='background:var(--bg-inset);color:var(--text-2)';}
  else if(horas<48){urgTxt='⚠️ 1 día — revisar';urgStyle='background:var(--bg-inset);color:var(--text-2)';}
  else{const dias=Math.floor(horas/24);urgTxt='🚨 '+dias+' día'+(dias===1?'':'s')+' — escalar YA';urgStyle='background:var(--danger-soft);color:var(--danger);font-weight:700';}

  const prodSimple=getProductoSimple(p.productos);

  card.innerHTML=
    '<div class="card-top">'+
      '<div style="flex:1;min-width:0">'+
        '<div class="card-guia copiable" data-val="'+p.dropiId+'" onclick="event.stopPropagation();copiarTexto(this.dataset.val)" title="Copiar ID orden">'+
          '🧾 Orden: '+p.dropiId+' <span style="font-size:.58rem;color:var(--text-3)">copiar</span>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px">'+
          '<div class="card-name">'+esc(p.nombre)+'</div>'+
          (p.tienda?'<span style="font-size:.62rem;font-weight:700;padding:1px 7px;border-radius:6px;background:'+tiendaColor+';color:white">'+p.tienda+'</span>':'')+
        '</div>'+
        (telDisplay?'<div class="card-phone" onclick="event.stopPropagation();copiarTel(this.dataset.tel)" data-tel="'+p.telefono+'" style="cursor:pointer">📞 '+telDisplay+' <span class="copy-hint">copiar</span></div>':'')+
      '</div>'+
      '<div style="text-align:right">'+
        '<span class="dias-badge" style="'+urgStyle+'">'+urgTxt+'</span>'+
      '</div>'+
    '</div>'+
    '<div class="card-meta">'+
      (p.ciudad?'<span class="meta-chip ciudad">\u{1F4CD} '+p.ciudad+(p.depto?', '+p.depto:'')+'</span>':'')+
      (p.transportadora?'<span class="meta-chip transp">📮 '+p.transportadora+'</span>':'')+
    '</div>'+
    (prodSimple?'<div class="card-producto">🛍️ '+prodSimple+'</div>':'')+
    (p.valor?(()=>{const vf=formatValor(p.valor);return vf?'<div style="font-size:.78rem;font-weight:800;color:var(--success);font-family:var(--f-mono);margin-top:5px;display:inline-block"><span class="ico">💰</span> '+vf+'</div>':'';})():'')+
    (p.direccion?'<div class="card-addr">\u{1F4CD} '+p.direccion+'</div>':'')+
    (p.novedad?'<div class="card-nov">⚠️ '+p.novedad+'</div>':'')+
    (!gestiones[p.id]?.mensajes_listos?
      '<div class="acciones"><button style="width:100%;padding:8px;border-radius:8px;font-size:.76rem;font-weight:700;border:none;cursor:pointer;background:#1A2230;color:white;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px;" onclick="marcarMensajesListos('+p.id+')">⏬ Pasar al fondo</button></div>'
      :'');
  // Agregar nota widget después de asignar innerHTML (necesita que card exista en DOM)
  const notaDiv=document.createElement('div');
  notaDiv.innerHTML=notaWidgetHtml(p.id);
  card.appendChild(notaDiv.firstChild||notaDiv);
  return card;
}

// ── EXPORTAR PENDIENTES POR PROVEEDOR ─────────────────────────────────
function exportarPendientes(){
  const pends=pedidos.filter(p=>p.estadoKey==='pendiente');
  if(!pends.length){toast('No hay pendientes');return;}
  const hoy=new Date().toLocaleDateString('es-CO').replace(/\//g,'-');
  const wb=XLSX.utils.book_new();

  // Agrupar por producto principal
  const porProducto=new Map();
  pends.forEach(p=>{
    const prod=getProductoSimple(p.productos)||'Sin producto';
    if(!porProducto.has(prod))porProducto.set(prod,[]);
    porProducto.get(prod).push(p);
  });

  // Una hoja por proveedor/producto
  porProducto.forEach((lista,prod)=>{
    const filas=lista.map(p=>({
      'ID Orden':p.dropiId,
      'Cliente':p.nombre,
      'Telefono':p.telefono?p.telefono.replace(/^57/,''):'',
      'Ciudad':p.ciudad,'Departamento':p.depto,
      'Direccion':p.direccion,
      'Producto':getProductoSimple(p.productos),
      'Tienda':p.tienda,
      'Días sin guía':Math.floor((horasDesde(p.fechaOrden)||0)/24),
      'Urgencia':( (horasDesde(p.fechaOrden)||0)<24?'Normal':
                   (horasDesde(p.fechaOrden)||0)<48?'Revisar':'ESCALAR YA'),
      'Novedad':p.novedad||'',
    }));
    // Ordenar de más urgente a menos
    filas.sort((a,b)=>(b['Días sin guía']||0)-(a['Días sin guía']||0));
    const ws=XLSX.utils.json_to_sheet(filas);
    ws['!cols']=[14,22,13,16,14,28,24,12,14,12,20].map(w=>({wch:w}));
    // Nombre de hoja máx 31 chars
    const sheetName=prod.substring(0,28).replace(/[:\/?*\[\]]/g,'');
    XLSX.utils.book_append_sheet(wb,ws,sheetName||'Producto');
  });

  // Hoja resumen
  const resumen=[];
  porProducto.forEach((lista,prod)=>{
    const urg=lista.filter(p=>(horasDesde(p.fechaOrden)||0)>=48).length;
    const warn=lista.filter(p=>{const h=horasDesde(p.fechaOrden)||0;return h>=24&&h<48;}).length;
    resumen.push({'Producto':prod,'Total':lista.length,'Urgente (+48h)':urg,'Revisar (24-48h)':warn,'Normal (<24h)':lista.length-urg-warn});
  });
  const wsRes=XLSX.utils.json_to_sheet(resumen);
  wsRes['!cols']=[30,8,14,16,10].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,wsRes,'RESUMEN');

  XLSX.writeFile(wb,'Pendientes_Sin_Guia_'+hoy+'.xlsx');
  toast('\uD83D\uDCE4 Exportado por proveedor');
}

// ── WHATSAPP ───────────────────────────────────────────────────────────
function getMesSiguiente(){
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const d=new Date();d.setMonth(d.getMonth()+1);
  return meses[d.getMonth()];
}
function _aplicarVarsWA(tpl,p){
  const nombre=p.nombre.split(' ')[0];
  const prod=getProductoWA(p.productos);
  const telTienda=cfgGetTel(p.tienda);
  const tienda=(window.getLoginTienda?window.getLoginTienda():'')||p.tienda||'nuestra tienda';
  const asesor=(window.getLoginAsesor?window.getLoginAsesor():'')||'el equipo';
  const transportadora=p.transportadora
    ?p.transportadora.charAt(0).toUpperCase()+p.transportadora.slice(1).toLowerCase()
    :'la transportadora';
  return tpl
    .replace(/{nombre}/gi,nombre)
    .replace(/{tienda}/gi,tienda)
    .replace(/{asesor}/gi,asesor)
    .replace(/{producto}/gi,prod)
    .replace(/{tel_tienda}/gi,telTienda)
    .replace(/{transportadora}/gi,transportadora)
    .replace(/{mes_siguiente}/gi,getMesSiguiente());
}
function getWAInfo(p,estadoKey){
  const custom=(CFG.waMsgs||{})[estadoKey]||'';
  if(custom.trim()){
    return{msg:_aplicarVarsWA(custom,p),idx:0};
  }
  const msgs=WA_MSGS[estadoKey]||[];
  const idx=Math.floor(Math.random()*msgs.length);
  return{msg:_aplicarVarsWA(msgs[idx]||'',p),idx};
}

const ICWA='<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

function waBoton(p,estadoKey,waInfo,yaEnviado){
  if(!p.telefono)return'<div style="font-size:.74rem;color:var(--text-3);text-align:center;padding:4px">Sin número de teléfono</div>';
  const url='https://wa.me/'+p.telefono+'?text='+encodeURIComponent(waInfo.msg);
  const preview=waInfo.msg.length>120?waInfo.msg.substring(0,120)+'...':waInfo.msg;
  return'<a class="btn-wa" href="'+url+'" target="_blank" onclick="marcarWA('+p.id+',\''+estadoKey+'\')">'+(yaEnviado?'✅ WhatsApp enviado':ICWA+' Enviar WhatsApp')+'</a>';
}

// ── ANIMACIÓN COMPLETADO ───────────────────────────────────────────────
function animarCompletado(id, callback, emoji='✅'){
  const card=document.getElementById('card-'+id);
  if(!card){if(callback)callback();return;}
  // Evitar doble animación
  if(card.dataset.animating)return;
  card.dataset.animating='1';

  const sweep=document.createElement('div');
  sweep.className='card-sweep';
  const check=document.createElement('div');
  check.className='card-check-pop';
  check.textContent=emoji;
  const border=document.createElement('div');
  border.className='card-border-flash';

  card.appendChild(sweep);
  card.appendChild(check);
  card.appendChild(border);
  card.classList.add('completing');

  setTimeout(()=>{
    sweep.remove();check.remove();border.remove();
    delete card.dataset.animating;
    if(callback)callback();
  },820);
}

// ── ACCIONES ───────────────────────────────────────────────────────────
function registrarClick(id){if(!gestiones[id])gestiones[id]={};gestiones[id].intentos=(gestiones[id].intentos||0)+1;guardar();}

// Versión de setLlamada para novedades: exige nota antes de marcar
function setLlamadaNov(id,resultado){
  const g=gestiones[id]||{};
  // Si está deshaciendo la selección actual, siempre permitir
  if(g.llamada===resultado){setLlamada(id,resultado);return;}
  // Verificar que haya una nota registrada hoy
  const hoy=new Date().toLocaleDateString('es-CO');
  const notas=g.notas||(g.nota?[{texto:g.nota,fecha:hoy}]:[]);
  const hayNota=notas.some(n=>n.fecha===hoy&&(n.texto||'').trim().length>2);
  if(!hayNota){
    const ta=document.querySelector('#card-'+id+' .nota-input-row textarea');
    if(ta){ta.classList.add('nota-req-shake');ta.focus();const o=ta.placeholder;ta.placeholder='✏️ Escribe la novedad antes de marcar...';setTimeout(()=>{ta.classList.remove('nota-req-shake');ta.placeholder=o;},1600);}
    toast('📝 Debes registrar una nota de la novedad antes de marcar la llamada');
    return;
  }
  setLlamada(id,resultado);
}

function llamadaRowNovHtml(id){
  const g=gestiones[id]||{};
  const hoy=new Date().toLocaleDateString('es-CO');
  const fecha=g.llamada_fecha||'';
  const esMismoDia=fecha===hoy;
  const fechaLabel=fecha?(esMismoDia?'hoy':'el '+fecha):'';
  const labelC='✔ Contestó'+(g.llamada==='contestó'&&fechaLabel?' · '+fechaLabel:'');
  const labelNC='📵 No contestó'+(g.llamada==='no_contestó'&&fechaLabel?' · '+fechaLabel:'');
  return '<div class="llamada-row">'+
    '<button class="btn-a ba-c'+(g.llamada==='contestó'?' sel':'')+'" onclick="setLlamadaNov('+id+',\'contestó\')">'+labelC+'</button>'+
    '<button class="btn-a ba-nc'+(g.llamada==='no_contestó'?' sel':'')+'" onclick="setLlamadaNov('+id+',\'no_contestó\')">'+labelNC+'</button>'+
  '</div>';
}

function setLlamada(id,resultado){ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  if(gestiones[id].llamada===resultado){
    gestiones[id].llamada=null;
    delete gestiones[id].llamada_fecha;
    delete gestiones[id].wa_enviado;delete gestiones[id].nueva_entrega;
    delete gestiones[id].chatepro;delete gestiones[id].gestion_final;
    delete gestiones[id].mensajes_listos;
    guardar();_fbSyncGestion(id);_actualizarCard(id);
  } else {
    gestiones[id].llamada=resultado;
    gestiones[id].llamada_fecha=new Date().toLocaleDateString('es-CO');
    gestiones[id].llamada_ts=Date.now();
    // Al marcar no_contestó limpiamos mensajes_listos para que no se auto-vaya al fondo
    if(resultado==='no_contestó') delete gestiones[id].mensajes_listos;
    const p=_pedidoMap.get(id);
    if(p&&p.guia)histRegistrarContacto(p.guia,resultado);
    guardar();_fbSyncGestion(id);_roSyncFromGestion(id);
    if(resultado==='contestó'){
      const p=_pedidoMap.get(id);
      if(p&&p.estadoKey==='oficina'){
        if(tieneNotaHoy(id)){
          // Ya tiene nota → gestionar normal con animación
          animarCompletado(id,()=>_completarYLimpiar(id),'✅');
        } else {
          // Sin nota → quedarse en lugar y pedir nota
          const est=ESTADOS.find(e=>e.key===p.estadoKey);
          const oldCard=document.getElementById('card-'+id);
          if(oldCard&&est) oldCard.replaceWith(crearCard(p,est,false));
          setTimeout(()=>{
            const ta=document.getElementById('nota-inp-'+id);
            if(ta){
              ta.classList.remove('nota-req-shake');
              void ta.offsetWidth;
              ta.classList.add('nota-req-shake');
              ta.focus();
              const orig=ta.placeholder;
              ta.placeholder='✏️ ¿Qué dijo el cliente?';
              setTimeout(()=>{ta.classList.remove('nota-req-shake');ta.placeholder=orig;},1400);
            }
            toast('📝 Escribe lo que dijo el cliente antes de finalizar');
          },150);
        }
      } else {
        animarCompletado(id,()=>_completarYLimpiar(id),'✅');
      }
    } else {
      renderAll();
    }
  }
}

function setCheck(id,campo,valor){ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id][campo]=valor;
  guardar();_fbSyncGestion(id);
  // Sincronizar estado "solucionada en Dropi" con el registro GD
  if(campo==='nov_solucionada') _novSyncSolucionadaGD(id, valor);
  // Actualizar solo el ícono de la fila sin re-renderizar toda la pantalla
  const p=_pedidoMap.get(id);
  if(p){
    const icoEl=document.querySelector('#card-'+id+' .cf-gest-ico, .cf-wrap .cf-gest-ico');
    const g=gestiones[id]||{};
    const ico=g.guia_reportada?'✅':g.guia_generada_hoy?'📦':g.transito_gestionado?'✅':g.transito_sin_gestion?'🚚':g.rechazado_gestionado?'✅':g.rechazado_sin_gestion?'🚫':estaCompleta(p)?'✅':(g.llamada?'📋':'·');
    // Actualizar ícono en fila si está visible
    const wrap=document.getElementById('card-'+id);
    if(wrap){const fi=wrap.previousElementSibling?.querySelector('.cf-gest-ico');if(fi)fi.textContent=ico;}
  }
  renderResumen();renderProgress();
}

async function _novSyncSolucionadaGD(id, solucionada){
  if(typeof _db==='undefined'||!window._currentUsername)return;
  const g=gestiones[id]||{};
  const p=_pedidoMap.get(id);

  const mes=_getMesCargado();
  // _gdTK() (empresaId), no el slug del nombre: Gestiones Diarias lee por
  // empresaId, así que escribir en la clave vieja dejaba estas novedades y
  // estos contadores invisibles para GD en cuanto el mes estaba migrado.
  const tk=_gdTK();
  const ak=(typeof _gdKey==='function'?_gdKey:_gdKeyFallback)(window.getLoginAsesor?window.getLoginAsesor():'_');
  const novBasePath='novedades/'+tk+'/'+mes;
  const gdDiasPath='gestiones_diarias/'+tk+'/'+mes+'/'+ak+'/dias';
  const dia=new Date().getDate();
  // Migrar el mes si todavía vive en la clave vieja, antes de escribir: si no,
  // el nodo nuevo nacería con un registro suelto y escondería el resto.
  await _leerTienda(t=>'novedades/'+t+'/'+mes).catch(()=>{});
  await _leerTienda(t=>'gestiones_diarias/'+t+'/'+mes+'/'+ak).catch(()=>{});

  // Si no hay registro GD aún, crearlo ahora
  if(!g.gdNovKey && p && p.guia){
    // Verificar si ya existe por guía
    const existSnap=await _db.ref(novBasePath).orderByChild('guia').equalTo(p.guia).once('value');
    if(existSnap.exists()){
      const key=Object.keys(existSnap.val())[0];
      gestiones[id].gdNovKey=key;
      guardar();_fbSyncGestion(id);
    } else {
      const novData={guia:p.guia,fecha:p.fechaNovedad||new Date().toLocaleDateString('es-CO'),
        asesor:window.getLoginAsesor?window.getLoginAsesor():'',
        tipoNovedad:p.tipoNovedad||p.novedad||'',dia,ts:Date.now(),fromLogistica:true};
      const newRef=await _db.ref(novBasePath).push(novData);
      gestiones[id].gdNovKey=newRef.key;
      guardar();_fbSyncGestion(id);
    }
  }
  if(!gestiones[id]?.gdNovKey)return;
  const gdNovKey=gestiones[id].gdNovKey;

  // Leer el registro GD para obtener el día real
  const novSnap=await _db.ref(novBasePath+'/'+gdNovKey).once('value');
  const novData=novSnap.val()||{};
  const diaReal=novData.dia||dia;

  if(solucionada){
    const today=new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit'});
    // Sin asesor propio, esta gestión se acreditaba a quien REGISTRÓ la novedad
    // (por el nombre suelto, o sea el slug) y no a quien la marcó como resuelta.
    // El día se mantiene en el de la novedad, que es el que reconta después
    // _novRecontarDiaGD(diaReal).
    const gestorNom=window.getLoginAsesor?window.getLoginAsesor():'';
    const solObj={estado:'solucionada',tipo:'txt',val:'✅ Solucionada en Dropi',fechaLabel:today,ts:Date.now(),fromLogistica:true,
      asesor:gestorNom, asesorUid:_gdAK(), dia:diaReal};
    await _db.ref(novBasePath+'/'+gdNovKey+'/soluciones').push(solObj);
    await _db.ref(novBasePath+'/'+gdNovKey).update({solucionadaDropi:true});
  } else {
    const solsSnap=await _db.ref(novBasePath+'/'+gdNovKey+'/soluciones').once('value');
    const updates={};
    (solsSnap.val()?Object.entries(solsSnap.val()):[]).forEach(([k,s])=>{
      if(s.fromLogistica) updates[k]=null;
    });
    if(Object.keys(updates).length) await _db.ref(novBasePath+'/'+gdNovKey+'/soluciones').update(updates);
    await _db.ref(novBasePath+'/'+gdNovKey+'/solucionadaDropi').remove();
  }

  await _novRecontarDiaGD(diaReal);
  toast(solucionada?'✅ Novedad marcada como solucionada en GD':'↩️ Novedad desmarcada en GD',2500);
}

// ── Sincronización en vivo: novedades ya gestionadas por otra vía ────────
// Una misma novedad se puede trabajar desde tres lados, y todos escriben en el
// mismo lugar —novedades/{tienda}/{mes}/{id}/soluciones/{key}—:
//   · Gestiones Diarias, cuando el asesor registra la novedad con su evidencia;
//   · la extensión "REDKING Herramientas" (novedades-content.js, panel en
//     app.dropi.co/dashboard/novelties);
//   · el propio Gestor Logístico.
// Este listener no mira quién la escribió: cruza por número de guía y, si la
// última evidencia dice que quedó solucionada, mueve la card a Gestionadas sin
// exigir el flujo manual de contacto+nota. Así, al cargar el Excel del día, una
// novedad que ya se gestionó por otra ruta aparece resuelta en vez de volver a
// pedir trabajo que ya se hizo.
// Se escuchan DOS meses, no uno. Los dos lados guardan la novedad en un mes
// distinto y hasta ahora solo se miraba uno:
//   · el Gestor Logístico usa el mes del EXCEL (_getMesCargado, o sea el mes más
//     frecuente entre las fechas de orden). Un tablero con novedades del 27 al
//     31 de julio da "2026-07" aunque hoy sea 4 de agosto;
//   · Gestiones Diarias usa el mes que tiene abierto, que es el ACTUAL.
// Con un solo listener, el asesor gestionaba hoy la novedad de un pedido viejo y
// la card seguía pendiente: se escuchaba julio mientras la evidencia se escribía
// en agosto. Cuando los dos meses coinciden queda un solo listener.
let _novExtListenerPaths=[];
function _iniciarEscuchaNovedadesExt(){
  if(typeof _db==='undefined'||!window._currentUsername)return;
  const tk=_gdTK();
  const paths=[...new Set([_getMesCargado(), _hoyLocal().slice(0,7)])]
    .map(m=>'novedades/'+tk+'/'+m);
  if(_novExtListenerPaths.join('|')===paths.join('|'))return;
  _novExtListenerPaths.forEach(p=>_db.ref(p).off('value',_procesarNovedadesExt));
  _novExtListenerPaths=paths;
  paths.forEach(p=>_db.ref(p).on('value',_procesarNovedadesExt));
}
function _procesarNovedadesExt(snap){
  const data=snap.val()||{};
  const porGuia=new Map();
  // _novNormGuia y no trim(): las dos puntas escriben la guía por su lado y no
  // siempre igual —un cero de más, un guion, un espacio— y comparándolas crudas
  // el cruce se perdía en silencio, dejando la card pidiendo una gestión que ya
  // estaba hecha. Es la misma regla con la que Gestiones Diarias decide si una
  // guía ya tiene novedad registrada.
  pedidos.forEach(p=>{ if(p.estadoKey==='novedad'&&p.guia) porGuia.set(_novNormGuia(p.guia),p); });
  if(!porGuia.size)return;

  Object.values(data).forEach(n=>{
    const guia=_novNormGuia(n.guia);
    if(!guia)return;
    const p=porGuia.get(guia);
    if(!p)return; // esa guía no está entre las novedades cargadas ahora mismo
    const g=gestiones[p.id]||{};
    if(g.gestion_final||g.devolucion)return; // ya resuelto — evita reprocesar

    const sols=_novGetSols(n);
    const ultima=[...sols].sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
    if(!ultima)return;

    if(ultima.estado==='solucionada'){
      if(!gestiones[p.id])gestiones[p.id]={};
      gestiones[p.id].resultado_gestion='solucion_dropi';
      gestiones[p.id].nov_solucionada=true;
      if(!gestiones[p.id].contacto_metodo)gestiones[p.id].contacto_metodo='chatepro';
      _novSyncSolucionadaGD(p.id,true);
      marcarFinalizado(p.id);
      // Se muestra la guía del pedido, no la normalizada: esa es para comparar.
      toast('✅ Guía '+p.guia+' ya estaba gestionada — movida a Gestionadas');
    } else if(ultima.estado==='devuelta'){
      if(!gestiones[p.id])gestiones[p.id]={};
      gestiones[p.id].devolucion=true;
      gestiones[p.id].devolucion_razon=ultima.tipo==='txt'?ultima.val:'Producto devuelto (registrado desde la extensión)';
      guardar();_fbSyncGestion(p.id);_roSyncFromGestion(p.id);
      animarCompletado(p.id,()=>_completarYLimpiar(p.id),'🔄');
      toast('🔄 Guía '+p.guia+' ya estaba marcada como devuelta');
    }
  });
}

function marcarWA(id,estadoKey){ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].wa_enviado=true;
  waCounters[estadoKey]=(waCounters[estadoKey]||0)+1;
  const p=_pedidoMap.get(id);
  if(p&&p.guia)histRegistrar(p.guia);
  guardar();_fbSyncGestion(id);
  // En tránsito, enviar WA = gestión completa → animar
  if(estadoKey==='transito'){
    animarCompletado(id,()=>_completarYLimpiar(id),'\uD83D\uDCE8');
  } else {
    _actualizarCard(id);
  }
}

function marcarMensajesListos(id){ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].mensajes_listos=true;
  guardar();renderAll();toast('\uD83D\uDCE8 Movido al fondo — mensajes enviados');
}

function marcarGuiaReportada(id, btn){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].guia_reportada=true;
  gestiones[id].guia_generada_hoy=true;
  gestiones[id]._ts=Date.now();
  guardar();_fbSyncGestion(id);
  animarCompletado(id,()=>_completarYLimpiar(id),'✅');
  toast('✅ Guía reportada y gestionada');
}

function marcarGuiaGeneradaHoy(id, btn){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].guia_generada_hoy=true;
  gestiones[id]._ts=Date.now();
  guardar();_fbSyncGestion(id);
  animarCompletado(id,()=>_completarYLimpiar(id),'📦');
  toast('📦 Guía generada hoy — movida a gestionados');
}

// ── CARD REPARTO: checklist de contacto + resultado (dropdowns, igual que Oficina/Tránsito) ──
function _repRefrescarCard(id){
  const p=_pedidoMap.get(id);
  const est=ESTADOS.find(e=>e.key==='reparto');
  const old=document.getElementById('card-'+id);
  if(p&&est&&old) old.replaceWith(crearCard(p,est,false));
}
function _repSetContacto(id, valor){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].contacto_metodo=valor||'';
  guardar();_fbSyncGestion(id);
  _repRefrescarCard(id);
}
function _repSetResultado(id, valor){
  if(valor==='fondo'){marcarMensajesListos(id);return;}
  if(valor==='reportada'){marcarGuiaReportada(id);return;}
  if(valor==='generada_hoy'){marcarGuiaGeneradaHoy(id);return;}
  if(valor==='devolver'){marcarDevolucion(id);return;}
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].resultado_gestion=valor||'';
  guardar();_fbSyncGestion(id);
  _repRefrescarCard(id);
}

function marcarTransitoGestionado(id, btn){
  if(btn){ btn.disabled=true; btn.style.opacity='0.5'; }
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].transito_gestionado=true;
  delete gestiones[id].transito_sin_gestion;
  gestiones[id]._ts=Date.now();
  guardar();_fbSyncGestion(id);
  animarCompletado(id,()=>_completarYLimpiar(id),'✅');
}

function marcarTransitoSinGestion(id, btn){
  if(btn){
    btn.disabled=true;
    btn.innerHTML='✅ Listo';
    btn.style.background='#0e7490';
    btn.style.color='white';
    btn.style.borderColor='#0e7490';
    btn.style.transform='scale(1.04)';
    setTimeout(()=>{
      btn.style.transform='scale(1)';
      btn.style.opacity='0';
      setTimeout(()=>{
        if(!gestiones[id])gestiones[id]={};
        gestiones[id].transito_sin_gestion=true;
        gestiones[id]._ts=Date.now();
        guardar();_fbSyncGestion(id);_completarYLimpiar(id);
        toast('🚚 En tránsito sin novedad — no cuenta como gestionado');
      },200);
    },380);
    return;
  }
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].transito_sin_gestion=true;
  gestiones[id]._ts=Date.now();
  guardar();_fbSyncGestion(id);_completarYLimpiar(id);
  toast('🚚 En tránsito sin novedad — no cuenta como gestionado');
}

// ── CARD TRÁNSITO: checklist de contacto + resultado (dropdowns, igual que Oficina) ──
function _trRefrescarCard(id){
  const p=_pedidoMap.get(id);
  const est=ESTADOS.find(e=>e.key==='transito');
  const old=document.getElementById('card-'+id);
  if(p&&est&&old) old.replaceWith(crearCard(p,est,false));
}
function _trSetContacto(id, valor){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].contacto_metodo=valor||'';
  guardar();_fbSyncGestion(id);
  _trRefrescarCard(id);
}
function _trSetResultado(id, valor){
  if(valor==='fondo'){marcarMensajesListos(id);return;}
  if(valor==='gestionado'){marcarTransitoGestionado(id);return;}
  if(valor==='sin_novedad'){marcarTransitoSinGestion(id);return;}
  if(valor==='devolver'){marcarDevolucion(id);return;}
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  guardar();_fbSyncGestion(id);
  _trRefrescarCard(id);
}

function _animarBtnRechazo(btn, color, cb){
  btn.disabled=true;
  btn.innerHTML='✅ Listo';
  btn.style.background=color;
  btn.style.color='white';
  btn.style.borderColor=color;
  btn.style.transform='scale(1.04)';
  setTimeout(()=>{
    btn.style.transform='scale(1)';
    btn.style.opacity='0';
    setTimeout(cb, 200);
  }, 380);
}

function marcarRechazadoGestionado(id, btn){
  const _do=()=>{
    if(!gestiones[id])gestiones[id]={};
    gestiones[id].rechazado_gestionado=true;
    delete gestiones[id].rechazado_sin_gestion;
    gestiones[id]._ts=Date.now();
    guardar();_fbSyncGestion(id);_fbGuardarRechazado(id);_completarYLimpiar(id);
    toast('✅ Rechazado gestionado — contará en las métricas');
  };
  if(btn) _animarBtnRechazo(btn,'#16a34a',_do); else _do();
}

function marcarRechazadoSinGestion(id, btn){
  const _do=()=>{
    if(!gestiones[id])gestiones[id]={};
    gestiones[id].rechazado_sin_gestion=true;
    delete gestiones[id].rechazado_gestionado;
    gestiones[id]._ts=Date.now();
    guardar();_fbSyncGestion(id);_fbGuardarRechazado(id);_completarYLimpiar(id);
    toast('🚫 Marcado como rechazado sin gestión');
  };
  if(btn) _animarBtnRechazo(btn,'#be123c',_do); else _do();
}

function copiarDatosCliente(id){
  const p=_pedidoMap.get(id);
  if(!p)return;
  const tel=(p.telefono||'').replace(/^57/,'');
  const partes=[
    p.nombre||'',
    p.ciudad||'',
    p.depto||'',
    p.direccion||'',
    tel,
  ].filter(Boolean);
  _copiar(partes.join('\n'),()=>toast('📋 Datos del cliente copiados'));
}

function _histTieneRegistros(p){
  try{
    const lsN=JSON.parse(localStorage.getItem(LS_NOTES)||'{}');
    if(p.guia&&lsN[p.guia]&&lsN[p.guia].length)return true;
    const lsH=JSON.parse(localStorage.getItem(LS_HIST)||'{}');
    if(p.guia&&lsH[p.guia]&&lsH[p.guia].length)return true;
  }catch(e){}
  const g=gestiones[p.id]||{};
  return !!(g.notas&&g.notas.length);
}
// Texto corto del ultimo movimiento registrado (nota o evento), para mostrar
// junto al boton de historial cuando no hay pildoras de llamada/WA/gestionado
function _ultimoMovimientoTxt(p){
  const candidatos=[];
  const u=getUltimaNota(p.id);
  if(u&&u.texto)candidatos.push({ts:u.ts||0,texto:'&#128221; '+u.texto});
  const fh=p.guia?_fbHistGuias[p.guia]:null;
  if(fh){
    if(fh.notas&&fh.notas.length){
      const un=[...fh.notas].sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
      if(un&&un.texto)candidatos.push({ts:un.ts||0,texto:'&#128221; '+un.texto});
    }
    if(fh.eventos&&fh.eventos.length){
      const ue=[...fh.eventos].sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
      if(ue){
        const iconos={llamada_contestada:'&#128222;',llamada_no_contestada:'&#128245;',wa_enviado:'&#128232;',finalizado:'&#127937;',devolucion:'&#128230;'};
        const etiq={llamada_contestada:'Llamada contestada',llamada_no_contestada:'No contesto',wa_enviado:'WA enviado',finalizado:'Gestionado',devolucion:'Devolucion'};
        candidatos.push({ts:ue.ts||0,texto:(iconos[ue.tipo]||'&bull;')+' '+(etiq[ue.tipo]||ue.tipo||'Evento')});
      }
    }
  }
  if(!candidatos.length)return '';
  candidatos.sort((a,b)=>b.ts-a.ts);
  const txt=candidatos[0].texto;
  return txt.length>50?txt.slice(0,50)+'...':txt;
}
function _btnHistHtml(p){
  const hay=_histTieneRegistros(p);
  const badge=hay?'<span class="hist-dot">● Tiene historial</span>':'';
  return '<button class="btn-ver-hist" style="margin-top:6px;" onclick="abrirHistorial('+p.id+',this)">🕐 Ver historial del cliente'+badge+'</button>';
}
function _renderHistorial(todasNotas, todosEvt){
  const iconos={llamada_contestada:'📞✅',llamada_no_contestada:'📞❌',wa_enviado:'💬',finalizado:'🏁',devolucion:'📦'};
  const etiq={llamada_contestada:'Llamada contestada',llamada_no_contestada:'No contestó',wa_enviado:'WA enviado',finalizado:'Gestionado/Finalizado',devolucion:'Devolución registrada'};
  let html='';
  if(todasNotas.length){
    html+='<div class="hist-sec-title">Notas registradas</div>';
    todasNotas.forEach(n=>{
      html+='<div class="hist-nota-item">';
      html+='<div class="hist-nota-fecha">'+(n.fecha||'')+'</div>';
      html+='<div class="hist-nota-texto">'+(n.texto||'').replace(/</g,'&lt;')+'</div>';
      html+='</div>';
    });
  }
  if(todosEvt.length){
    html+='<div class="hist-sec-title">Historial de contacto</div>';
    todosEvt.forEach(ev=>{
      html+='<div class="hist-evento">';
      html+='<span class="hist-evento-ico">'+(iconos[ev.tipo]||'•')+'</span>';
      html+='<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.75rem;">'+(etiq[ev.tipo]||ev.tipo||'Evento')+'</div>';
      if(ev.fecha)html+='<div style="font-size:.63rem;color:var(--text-3);">'+ev.fecha+'</div>';
      html+='</div></div>';
    });
  }
  if(!todasNotas.length&&!todosEvt.length){
    html='<div class="hist-vacio">Sin notas ni historial registrado para este cliente.</div>';
  }
  document.getElementById('hist-body').innerHTML=html;
  _posicionarHistBox(_histAnchorEl);
}
let _histAnchorEl=null;
// Posiciona la "nube" del historial siempre hacia arriba-derecha del elemento donde se
// hizo clic, con la colita en la esquina inferior izquierda conectando hacia el emoji
function _posicionarHistBox(anchorEl){
  const box=document.querySelector('.hist-box');
  const tail=document.getElementById('hist-tail');
  if(!box)return;
  if(!anchorEl){
    box.style.top='10px';box.style.left='';box.style.right='10px';box.style.maxHeight='';
    if(tail)tail.style.display='none';
    return;
  }
  if(tail)tail.style.display='';
  const margin=10, gap=12, tailOffset=22, boxW=box.offsetWidth||330;
  const r=anchorEl.getBoundingClientRect();

  // El box se abre hacia arriba y hacia la derecha desde el ancla
  let left=r.left-tailOffset;
  left=Math.max(margin,Math.min(left,window.innerWidth-boxW-margin));
  box.style.right='auto';
  box.style.left=left+'px';

  const espacioArriba=r.top-gap-margin;
  const boxH=box.offsetHeight||300;
  box.style.maxHeight=Math.max(180,espacioArriba)+'px';
  const top=Math.max(margin,r.top-gap-Math.min(boxH,espacioArriba));
  box.style.top=top+'px';

  if(tail){
    tail.className='hist-tail tail-bottom';
    let tailLeft=r.left+r.width/2-left-9;
    tailLeft=Math.max(14,Math.min(tailLeft,boxW-14-18));
    tail.style.left=tailLeft+'px';
    tail.style.marginLeft='0';
  }
}
function abrirHistorial(id, anchorEl){
  const p=_pedidoMap.get(id);
  if(!p)return;
  const g=gestiones[id]||{};
  const guia=p.guia||'';
  document.getElementById('hist-title').textContent='📋 Historial: '+(p.nombre||p.guia||'Cliente');
  document.getElementById('hist-sub').textContent=(guia?'Guía: '+guia:'')+(p.ciudad?' · '+p.ciudad:'');
  document.getElementById('hist-body').innerHTML='<div style="padding:28px;text-align:center;color:var(--text-3);font-size:.78rem;">Cargando historial...</div>';
  document.getElementById('historial-modal').classList.add('open');
  _histAnchorEl=anchorEl||null;
  _posicionarHistBox(_histAnchorEl);
  // Datos locales (fallback si no hay Firebase)
  let notasLocal=[];
  try{
    const lsN=JSON.parse(localStorage.getItem(LS_NOTES)||'{}');
    notasLocal=guia?(lsN[guia]||[]):[];
  }catch(e){}
  [...(g.notas||[])].forEach(n=>{notasLocal.push(n);});
  let evtLocal=[];
  try{
    const lsH=JSON.parse(localStorage.getItem(LS_HIST)||'{}');
    const hg=guia?lsH[guia]||{}:{};
    if(hg.wa)evtLocal.push({tipo:'wa_enviado',ts:hg.wa.ts,fecha:hg.wa.fecha});
    if(hg.llamada){const t=hg.llamada.resultado==='contestó'?'llamada_contestada':'llamada_no_contestada';evtLocal.push({tipo:t,ts:hg.llamada.ts,fecha:hg.llamada.fecha});}
    if(hg.fin)evtLocal.push({tipo:'finalizado',ts:hg.fin.ts,fecha:hg.fin.fecha});
  }catch(e){}
  if(typeof _db==='undefined'||!window._currentUsername||!guia){
    const mn={};notasLocal.forEach(n=>{const k=(n.fecha||'')+'|'+(n.texto||'').trim();if(k!=='|')mn[k]=n;});
    _renderHistorial(Object.values(mn).sort((a,b)=>(b.ts||0)-(a.ts||0)),evtLocal.sort((a,b)=>(b.ts||0)-(a.ts||0)));
    return;
  }
  // Fetch desde gestiones_sync (fuente única)
  _db.ref('gestiones_sync/'+_gsKey()).once('value').then(snap=>{
    const data=snap.val()||{};
    const notasFb=[];const evtFb=[];
    Object.values(data).forEach(g=>{
      if(g._guia!==guia)return;
      if(g.notas&&Array.isArray(g.notas)) g.notas.forEach(n=>notasFb.push(n));
      if(g.eventos) Object.values(g.eventos).forEach(e=>evtFb.push(e));
    });
    const mn={};
    [...notasLocal,...notasFb].forEach(n=>{const k=(n.fecha||'')+'|'+(n.texto||'').trim();if(k!=='|')mn[k]=n;});
    const todasNotas=Object.values(mn).sort((a,b)=>(b.ts||0)-(a.ts||0));
    const me={};
    [...evtLocal,...evtFb].forEach(ev=>{const k=(ev.tipo||'')+'|'+(ev.fecha||'')+'|'+(ev.ts||'');me[k]=ev;});
    const todosEvt=Object.values(me).sort((a,b)=>(b.ts||0)-(a.ts||0));
    _renderHistorial(todasNotas,todosEvt);
  }).catch(()=>{
    const mn={};notasLocal.forEach(n=>{const k=(n.fecha||'')+'|'+(n.texto||'').trim();if(k!=='|')mn[k]=n;});
    _renderHistorial(Object.values(mn).sort((a,b)=>(b.ts||0)-(a.ts||0)),evtLocal.sort((a,b)=>(b.ts||0)-(a.ts||0)));
  });
}
function cerrarHistorial(){
  document.getElementById('historial-modal').classList.remove('open');
}

function marcarFinalizado(id){ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].gestion_final=!gestiones[id].gestion_final;
  if(gestiones[id].gestion_final){
    const p=_pedidoMap.get(id);
    if(p&&p.guia)histRegistrarFin(p.guia);
    guardar();_fbSyncGestion(id);
    animarCompletado(id,()=>_completarYLimpiar(id),'✅');
  } else {
    guardar();_fbSyncGestion(id);_actualizarCard(id);
  }
}

function marcarDevolucion(id){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  if(gestiones[id].devolucion){
    // Ya está marcado → pedir confirmación para desmarcar
    _mConfirm('¿Quitar devolución?','¿Seguro que quieres quitar la marca de devolución para este pedido?',()=>{
      gestiones[id].devolucion=false;
      delete gestiones[id].devolucion_razon;
      guardar();_fbSyncGestion(id);_actualizarCard(id);
      toast('↩️ Devolución desmarcada');
    });
    return;
  }
  // Validar que haya una nota de HOY
  if(!tieneNotaHoy(id)){_pedirNotaHoy(id);return;}
  // Marcar devolución usando la última nota como justificación
  const notas=gestiones[id].notas||(gestiones[id].nota?[{texto:gestiones[id].nota}]:[]);
  gestiones[id].devolucion=true;
  gestiones[id].devolucion_razon=notas[notas.length-1].texto;
  guardar();_fbSyncGestion(id);_roSyncFromGestion(id);
  // Si el pedido tiene novedad en GD, dejarla marcada como devuelta: es el
  // único camino que la cuenta en la columna DEVUELTO de Gestiones Diarias.
  // Antes esto solo se lograba eligiendo "Devuelta" en el modal de evidencia,
  // que ya no decide estados.
  _novMarcarDevueltaGD(id, notas[notas.length-1].texto);
  animarCompletado(id,()=>_completarYLimpiar(id),'🔄');
}

// Recuenta las gestiones de novedades de UN asesor en UN día y actualiza su fila
// de Gestiones Diarias. Misma regla que _novSyncGD: cada evidencia es una
// gestión y suma a quien la hizo, el día que la hizo (ver _novGestionesDe en
// app-shared.js). `ak` por defecto es el asesor de la sesión.
//
// Ya no se puede filtrar la consulta por `dia` de la novedad: la gestión puede
// ser de otro día que aquel en que se registró, así que hay que mirar el mes
// completo y agrupar por las evidencias.
async function _novRecontarDiaGD(dia, asesorKey){
  if(typeof _db==='undefined'||!dia) return;
  const mes=_getMesCargado();
  // El nodo se escribe con el uid, que es la clave canónica desde la migración
  // de identidad. Antes acá se usaba el slug del nombre y este recuento habría
  // ido a parar a una carpeta que ya nadie lee.
  const ak=asesorKey||_gdAK();
  const novBasePath=_novGDBasePath();
  const gdDiasPath='gestiones_diarias/'+_gdTK()+'/'+mes+'/'+ak+'/dias';

  const mesNovsSnap=await _db.ref(novBasePath).once('value');
  // Se cuentan las dos claves de la persona: las evidencias viejas se guardaron
  // con el nombre y las nuevas con el uid.
  const claves = asesorKey ? ak : _clavesAsesorSesion();
  const {soluc, devuelt}=_novContarDia(mesNovsSnap.val()||{}, claves, dia, mes);

  // Leer el día actual de GD para no pisar las otras columnas
  const diaSnap=await _db.ref(gdDiasPath+'/'+dia).once('value');
  const diaData=diaSnap.val()||{};
  diaData.soluc=soluc; diaData.devuelt=devuelt;
  delete diaData.gestion; // campo retirado: se limpia al recalcular el día
  await _db.ref(gdDiasPath+'/'+dia).set(diaData);

  // Si Gestiones Diarias está cargado en memoria, refrescar también su UI.
  // Solo cuando se recalculó el nodo del asesor de la sesión: la tabla en
  // pantalla es la suya, y pintarle ahí el conteo de otro sería mentirle.
  if(ak===_gdAK() && typeof _gdData!=='undefined'&&_gdData){
    if(!_gdData[dia]) _gdData[dia]={};
    Object.assign(_gdData[dia],{soluc,devuelt});
    delete _gdData[dia].gestion;
    if(document.getElementById('gd-soluc-'+dia)) document.getElementById('gd-soluc-'+dia).textContent=soluc||'';
    if(document.getElementById('gd-devuelt-'+dia)) document.getElementById('gd-devuelt-'+dia).textContent=devuelt||'';
    if(typeof _gdCalc==='function'){
      const t=_gdCalc();
      if(document.getElementById('gdt-soluc')) document.getElementById('gdt-soluc').textContent=t.soluc;
      if(document.getElementById('gdt-devuelt')) document.getElementById('gdt-devuelt').textContent=t.devuelt;
      if(document.getElementById('gdt-gral')) document.getElementById('gdt-gral').textContent=t.gral;
    }
    if(typeof _gdRenderResumen==='function') _gdRenderResumen();
  }
}

// Registra en la novedad de GD que el pedido se devolvió, y recalcula los
// contadores del día. Sin esto, "🔄 Devolver pedido" marcaba el pedido pero
// dejaba la novedad como pendiente, y nunca aparecía en DEVUELTO.
async function _novMarcarDevueltaGD(id, razon){
  try{
    if(typeof _db==='undefined'||!window._currentUsername) return;
    const g=gestiones[id]||{};
    if(!g.gdNovKey) return; // el pedido no tiene novedad registrada en GD
    await _novGDMigrarMes();
    const base=_novGDBasePath();
    const novSnap=await _db.ref(base+'/'+g.gdNovKey).once('value');
    const nov=novSnap.val();
    if(!nov) return; // la novedad ya no existe
    const yaDevuelta=Object.values(nov.soluciones||{}).some(s=>s&&s.estado==='devuelta');
    // Devolver el pedido es una gestión, y suma a quien la hace hoy — aunque la
    // novedad la haya registrado otro asesor otro día. Por eso la evidencia
    // lleva su propio asesor/dia/mes (fecha local, nunca toISOString).
    const hoy=new Date();
    const gestorNom=window.getLoginAsesor?window.getLoginAsesor():'';
    const akGestor=(typeof _gdKey==='function'?_gdKey:_gdKeyFallback)(gestorNom||'_');
    const diaGestion=hoy.getDate();
    const mesGestion=hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0');
    if(!yaDevuelta){
      await _db.ref(base+'/'+g.gdNovKey+'/soluciones').push({
        estado:'devuelta', tipo:'txt',
        val: razon||'Producto devuelto',
        fechaLabel: hoy.toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'}),
        ts: Date.now(), fromLogistica:true,
        // asesorUid además del nombre: sin él esta gestión se acreditaba al slug
        // del nombre y no al uid, así que la misma persona quedaba partida en
        // dos carpetas de gestiones_diarias y salía dos veces en el consolidado.
        asesor: gestorNom, asesorUid: _gdAK(), dia: diaGestion, mes: mesGestion
      });
    }
    // Una novedad devuelta ya no está solucionada en Dropi
    await _db.ref(base+'/'+g.gdNovKey+'/solucionadaDropi').remove();
    gestiones[id].gdTieneSols=true;
    await _novRecontarDiaGD(diaGestion, akGestor);
  }catch(e){ console.warn('[NOV] no se pudo marcar la devolución en GD',e); }
}

// ── CARD OFICINA: checklist de contacto + resultado (dropdowns) ────────
function _ofRefrescarCard(id){
  const p=_pedidoMap.get(id);
  const est=ESTADOS.find(e=>e.key==='oficina');
  const old=document.getElementById('card-'+id);
  if(p&&est&&old) old.replaceWith(crearCard(p,est,false));
}
function _ofSetContacto(id, valor){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].contacto_metodo=valor||'';
  guardar();_fbSyncGestion(id);
  _ofRefrescarCard(id);
}
function _ofSetResultado(id, valor){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  if(valor==='finalizar'){
    gestiones[id].resultado_gestion='finalizar';
    marcarFinalizadoOficina(id); // valida nota de hoy internamente
    return;
  }
  gestiones[id].resultado_gestion=valor||'';
  if(valor==='fondo'){marcarMensajesListos(id);return;}
  if(valor==='devolver'){marcarDevolucion(id);return;}
  guardar();_fbSyncGestion(id);
  _ofRefrescarCard(id);
}

// Escribe la gestión completa en Firebase con set() — a diferencia de
// _fbSyncGestion (update), elimina remotamente los flags que ya no existen
function _fbSetGestion(id){
  if(typeof _db==='undefined'||!window._currentUsername)return;
  const p=_pedidoMap.get(id);
  if(!p||!p.dropiId)return;
  const _tk=_gsKeyEscritura();
  if(!_tk) return;
  const ref=_db.ref('gestiones_sync/'+_tk+'/'+_fbKey(p.dropiId));
  const g0=gestiones[id];
  if(!g0||!Object.keys(g0).length){ref.remove();return;}
  const g=Object.assign({},g0);
  delete g.mensajes_listos;
  g._ts=Date.now();
  if(p.guia)g._guia=p.guia;
  if(p.nombre)g._nombre=p.nombre;
  if(p.telefono)g._tel=p.telefono.replace(/^57/,'');
  if(p.ciudad)g._ciudad=p.ciudad;
  const _a=window.getLoginAsesor?window.getLoginAsesor():'';
  if(_a)g._asesor=_a;
  ref.set(g);
}

// Habilita la edición de una gestión ya finalizada SIN mover el pedido de
// columna: conserva todos los flags de completitud (por eso sigue contando
// como gestionado) y solo despliega el formulario completo en su lugar.
// El pedido únicamente sale de Gestionadas con eliminarGestion().
function editarGestion(id){
  _editandoGestion.add(id);
  _cardFloatClose();
  _actualizarCard(id);
  _cardToggle(id);
  toast('✏️ Edición habilitada — los cambios se guardan sin salir de esta columna');
}

// Cierra el modo edición de una gestión ya finalizada; el pedido permanece
// en Gestionadas salvo que la edición haya quitado todos sus flags de
// completitud (p.ej. desmarcar devolución sin volver a finalizar)
function terminarEdicionGestion(id){
  _editandoGestion.delete(id);
  guardar();
  _fbSetGestion(id);
  _cardFloatClose();
  renderAll();
  toast('✅ Edición guardada');
}

// Elimina por completo la gestión y devuelve el pedido a pendientes
function eliminarGestion(id){
  _mConfirm('¿Eliminar la gestión?','Se borrará todo lo registrado en esta sesión para este pedido y volverá a la columna de pendientes. Esta acción no se puede deshacer.',()=>{
    _editandoGestion.delete(id);
    delete gestiones[id];
    guardar();
    _fbSetGestion(id);
    _cardFloatClose();
    renderAll();
    toast('🗑️ Gestión eliminada — el pedido volvió a pendientes');
  },'danger');
}

// _getMesCargado vive en shared/app-shared.js

// ── Sync novedad Logística → GD ─────────────────────────────────────────
// Clave por empresaId (_gdTK), igual que la que usa Gestiones Diarias para
// leer. Con el slug del nombre, las novedades creadas desde Gestión Logística
// caían en otra ruta y GD dejaba de verlas apenas migraba el mes.
function _novGDBasePath(){
  return 'novedades/'+_gdTK()+'/'+_getMesCargado();
}
// Migra el mes de novedades si aún vive en la clave vieja. Hay que llamarla
// antes de la primera escritura para no crear el nodo nuevo con un registro
// suelto y esconder el historial anterior.
function _novGDMigrarMes(){
  const mes=_getMesCargado();
  return _leerTienda(t=>'novedades/'+t+'/'+mes).catch(()=>{});
}

// _novIncrGDCounter() se eliminó junto con el bucket "gestionadas": era su
// único uso. Además escribía con _gdKey(nombreTienda) en vez de _gdTK(), o sea
// en la clave vieja, así que había quedado desalineada del cambio de identidad
// de tienda. Los contadores del día los recalcula _novSyncGD/_novSyncSolucionadaGD
// contando las novedades reales, que es más fiable que ir sumando de a uno.

function _syncNovToGD(id){
  if(typeof _db==='undefined'||!window._currentUsername)return;
  const p=_pedidoMap.get(id);
  if(!p||!p.guia)return;
  const g=gestiones[id]||{};
  if(g.gdNovKey){return;} // ya sincronizado
  const base=_novGDBasePath();
  // Evitar duplicados por guía (tras migrar el mes, para que la búsqueda vea
  // también las novedades que aún estuvieran bajo la clave vieja de tienda)
  _novGDMigrarMes().then(()=>
  _db.ref(base).orderByChild('guia').equalTo(p.guia).once('value',snap=>{
    if(snap.exists()){
      // Ya existe — guardar key referencia
      const key=Object.keys(snap.val())[0];
      gestiones[id].gdNovKey=key;
      guardar();_fbSyncGestion(id);
      return;
    }
    const novData={
      guia:p.guia,
      fecha:p.fechaNovedad||new Date().toLocaleDateString('es-CO'),
      asesor:window.getLoginAsesor?window.getLoginAsesor():'',
      tipoNovedad:p.tipoNovedad||p.novedad||'',
      dia:new Date().getDate(),
      ts:Date.now(),
      fromLogistica:true,
      sol1:null,sol2:null,sol3:null
    };
    const ref=_db.ref(base).push(novData);
    gestiones[id].gdNovKey=ref.key;
    guardar();_fbSyncGestion(id);
    toast('🔗 Novedad registrada en Gestiones Diarias');
    // Una novedad recién registrada no está resuelta ni devuelta: queda
    // pendiente y no suma en la tabla de GD hasta que se le cargue una solución.
  }));
}

// ── Modal evidencia ──────────────────────────────────────────────────────
let _novEvId=null, _novEvTipoActivo='img';

function _novEvidenciaModal(id){
  _novEvId=id;
  const p=_pedidoMap.get(id);
  const g=gestiones[id]||{};
  if(!p)return;
  // Si aún no tiene gdNovKey, sincronizar primero
  if(!g.gdNovKey){
    _syncNovToGD(id);
    // Esperar brevemente y reabrir
    setTimeout(()=>_novEvidenciaModal(id),800);
    toast('🔗 Creando registro en GD...');
    return;
  }
  document.getElementById('nov-ev-guia-lbl').textContent='Guía: '+p.guia+' · '+((p.tipoNovedad||p.novedad||'Novedad').toUpperCase());
  // Mostrar soluciones existentes (migrando antes el mes: gdNovKey puede
  // apuntar a un registro que todavía viva bajo la clave vieja de tienda)
  const base=_novGDBasePath();
  _novGDMigrarMes().then(()=>
  _db.ref(base+'/'+g.gdNovKey).once('value',snap=>{
    const d=snap.val()||{};
    const sols=_novGetSols?_novGetSols(d):[];
    const solsEl=document.getElementById('nov-ev-sols');
    solsEl.innerHTML='';
    if(!sols.length){solsEl.innerHTML='<div style="font-size:.7rem;color:var(--text-3);text-align:center;padding:8px;">Sin evidencias aún</div>';}
    sols.forEach((s,i)=>{
      const color=s.estado==='solucionada'?'#16a34a':s.estado==='devuelta'?'#d97706':'#0891b2';
      // El tercer caso solo aparece en soluciones guardadas antes de retirar el
      // estado "en gestión"; ya no se puede elegir al registrar.
      const label=s.estado==='solucionada'?'✅ Solucionada':s.estado==='devuelta'?'🔄 Devuelta':'📋 Pendiente';
      let content=s.tipo==='img'
        ?'<img src="'+s.val+'" style="width:100%;border-radius:6px;margin-top:4px;max-height:100px;object-fit:cover;">'
        :'<div style="font-size:.72rem;color:var(--text-1);margin-top:4px;">'+s.val+'</div>';
      solsEl.innerHTML+='<div style="border:1.5px solid '+color+'30;border-radius:8px;padding:7px 9px;background:'+color+'10;">'
        +'<div style="display:flex;justify-content:space-between;"><span style="font-size:.62rem;font-weight:700;color:'+color+';">'+label+'</span>'
        +'<span style="font-size:.58rem;color:var(--text-3);">'+(s.fechaLabel||'')+'</span></div>'
        +content+'</div>';
    });
    // Siempre mostrar form — sin límite
    document.getElementById('nov-ev-form').style.display='block';
    // Precargar fecha de hoy
    document.getElementById('nov-ev-fecha').value=_hoyLocal();
  }));
  _novEvTipo('img');
  document.getElementById('nov-ev-modal').style.display='flex';
  _novEvPasteOn();   // Ctrl+V carga la captura en el campo de imagen
}

// ── Pegar una captura desde el portapapeles ──────────────────────────
// Mismo criterio que en Gestiones Diarias: el listener va en el documento y
// solo actúa con el modal abierto y si lo pegado es una imagen, así pegar
// texto en la evidencia escrita sigue funcionando. Acá además se cambia al
// modo Imagen, porque este modal sí obliga a elegir entre foto y texto.
let _novEvPasteHandler=null;

function _novEvPasteOn(){
  if(_novEvPasteHandler) return;
  _novEvPasteHandler=ev=>{
    const modal=document.getElementById('nov-ev-modal');
    if(!modal || modal.style.display!=='flex') return;
    const items=(ev.clipboardData && ev.clipboardData.items) || [];
    let file=null;
    for(const it of items){
      if(it.kind==='file' && /^image\//.test(it.type)){ file=it.getAsFile(); break; }
    }
    if(!file) return;
    ev.preventDefault();
    const inp=document.getElementById('nov-ev-img');
    if(!inp) return;
    try{
      const dt=new DataTransfer();
      const base=(file.name && file.name!=='image.png') ? file.name : ('captura-'+_hoyLocal()+'.png');
      dt.items.add(new File([file], base, {type:file.type||'image/png'}));
      inp.files=dt.files;
    }catch(e){
      toast('⚠️ Este navegador no permite pegar la imagen; usá el selector de archivo',5000);
      return;
    }
    _novEvTipo('img');
    _novEvPreview(inp);
    toast('📋 Captura pegada');
  };
  document.addEventListener('paste',_novEvPasteHandler);
}

function _novEvPasteOff(){
  if(!_novEvPasteHandler) return;
  document.removeEventListener('paste',_novEvPasteHandler);
  _novEvPasteHandler=null;
}

function _novEvCerrar(){
  _novEvPasteOff();
  document.getElementById('nov-ev-modal').style.display='none';
  document.getElementById('nov-ev-img').value='';
  document.getElementById('nov-ev-txt').value='';
  // Mismo texto que el HTML, incluido el recordatorio de Ctrl+V: si acá se
  // deja el viejo, el aviso desaparece en cuanto se cierra y se reabre el modal.
  document.getElementById('nov-ev-preview').innerHTML='Toca para tomar foto o seleccionar imagen'+
    '<div style="font-size:.68rem;color:var(--info-strong);font-weight:600;margin-top:6px;">📋 o pegá una captura con Ctrl+V</div>';
  document.getElementById('nov-ev-preview').style.background='';
  _novEvId=null;
}

function _novEvTipo(tipo){
  _novEvTipoActivo=tipo;
  document.getElementById('nov-ev-img-wrap').style.display=tipo==='img'?'block':'none';
  document.getElementById('nov-ev-txt-wrap').style.display=tipo==='txt'?'block':'none';
  document.getElementById('nov-ev-btn-img').style.background=tipo==='img'?'#7c3aed':'white';
  document.getElementById('nov-ev-btn-img').style.color=tipo==='img'?'white':'#64748b';
  document.getElementById('nov-ev-btn-img').style.borderColor=tipo==='img'?'#7c3aed':'#e2e8f0';
  document.getElementById('nov-ev-btn-txt').style.background=tipo==='txt'?'#7c3aed':'white';
  document.getElementById('nov-ev-btn-txt').style.color=tipo==='txt'?'white':'#64748b';
  document.getElementById('nov-ev-btn-txt').style.borderColor=tipo==='txt'?'#7c3aed':'#e2e8f0';
}

function _novEvPreview(input){
  if(!input.files.length)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('nov-ev-preview');
    prev.innerHTML='<img src="'+e.target.result+'" style="max-width:100%;max-height:160px;border-radius:6px;object-fit:contain;">';
    prev.style.background='#f8fafc';
    prev.style.padding='8px';
  };
  reader.readAsDataURL(input.files[0]);
}

async function _novEvGuardar(){
  if(!_novEvId)return;
  const g=gestiones[_novEvId]||{};
  if(!g.gdNovKey){toast('⚠️ Error: sin referencia GD');return;}
  const btn=document.getElementById('nov-ev-save');
  btn.textContent='Guardando...';btn.disabled=true;
  try{
    // Este modal SOLO adjunta evidencia (imagen o texto): no decide si la
    // novedad quedó solucionada o devuelta. Eso lo define el dropdown
    // "Resultado de la gestión" de la card, que además exige la evidencia como
    // requisito. Antes había aquí un <select> de estado cuyo primer valor era
    // "En gestión"; al quedar la lista en solo dos opciones, el default pasó a
    // "Solucionada" y guardar una evidencia daba la novedad por resuelta.
    const estado='';
    const evFechaVal=document.getElementById('nov-ev-fecha')?.value;
    const evFechaBase=evFechaVal?new Date(evFechaVal+'T12:00:00'):new Date();
    const fechaLabel=evFechaBase.toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});
    // Identidad de quien adjunta, igual que en Gestiones Diarias. Hoy esta
    // evidencia nace con estado '' y por eso no suma como gestión, pero si
    // después se le define resultado tiene que acreditarse a su uid y no al
    // slug del nombre, que es lo que partía a una persona en dos carpetas.
    const evMeta={asesor:window.getLoginAsesor?window.getLoginAsesor():'', asesorUid:_gdAK(),
      dia:evFechaBase.getDate(),
      mes:evFechaBase.getFullYear()+'-'+String(evFechaBase.getMonth()+1).padStart(2,'0')};
    let solObj=null;
    if(_novEvTipoActivo==='img'){
      const fi=document.getElementById('nov-ev-img');
      if(!fi.files.length){toast('⚠️ Selecciona una imagen');btn.textContent='Guardar';btn.disabled=false;return;}
      // Reusar _novResizeImg si está disponible, si no usar FileReader directo
      let val;
      if(typeof _novResizeImg==='function'){val=await _novResizeImg(fi.files[0],800,.72);}
      else{val=await new Promise(r=>{const fr=new FileReader();fr.onload=e=>r(e.target.result);fr.readAsDataURL(fi.files[0]);});}
      solObj={estado,tipo:'img',val,fechaLabel,ts:Date.now(),...evMeta};
    } else {
      const txt=document.getElementById('nov-ev-txt').value.trim();
      if(!txt){toast('⚠️ Escribe la evidencia');btn.textContent='Guardar';btn.disabled=false;return;}
      solObj={estado,tipo:'txt',val:txt,fechaLabel,ts:Date.now(),...evMeta};
    }
    await _novGDMigrarMes(); // el registro puede seguir bajo la clave vieja
    const base=_novGDBasePath();
    const novRef=_db.ref(base+'/'+g.gdNovKey);
    // Siempre push a soluciones/ — sin límite. La imagen va FUERA del registro
    // (ver _novImgPath en app-shared.js): dentro, leer las novedades arrastraba
    // todas las fotos aunque no se mostraran.
    const solRef=novRef.child('soluciones').push();
    if(solObj.tipo==='img' && solObj.val && String(solObj.val).startsWith('data:')){
      const binario=solObj.val;
      solObj.val=''; solObj.img=true;
      await _db.ref(_novImgPath(_gdTK(), _getMesCargado(), g.gdNovKey, solRef.key)).set(binario);
    }
    await solRef.set(solObj);
    gestiones[_novEvId].gdTieneSols=true;
    guardar();_fbSyncGestion(_novEvId);
    toast('✅ Evidencia guardada en Gestiones Diarias');
    _novEvCerrar();
    renderAll();
  }catch(e){toast('⚠️ Error: '+e.message);}
  btn.textContent='Guardar';btn.disabled=false;
}

// Pasar al fondo en Novedad: anima la card, la cierra si estaba expandida y la
// mueve a la columna PENDIENTE, dejando libre la pantalla para seguir con las demás
function _novPasarAlFondo(id){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].mensajes_listos=true;
  guardar();_fbSyncGestion(id);
  animarCompletado(id,()=>{
    _cardFloatClose();
    renderAll();
    toast('⏬ Movida a Pendiente');
  },'⏬');
}

function marcarFinalizadoNov(id){
  ultimaGestion=Date.now();
  const g=gestiones[id]||{};
  if(g.gestion_final){marcarFinalizado(id);return;}
  if(!tieneNotaHoy(id)){_pedirNotaHoy(id);return;}
  marcarFinalizado(id);
  _syncNovToGD(id);
}

// ── CARD NOVEDAD: checklist de contacto + resultado (dropdowns, igual que Oficina/Tránsito) ──
function _novRefrescarCard(id){
  const p=_pedidoMap.get(id);
  const old=document.getElementById('card-'+id);
  if(p&&old) old.replaceWith(crearCardNovedad(p));
}
function _novSetContacto(id, valor){
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].contacto_metodo=valor||'';
  guardar();_fbSyncGestion(id);
  _novRefrescarCard(id);
}
function _novSetResultado(id, valor){
  if(valor==='solucion_dropi'){
    ultimaGestion=Date.now();
    if(!gestiones[id])gestiones[id]={};
    gestiones[id].resultado_gestion='solucion_dropi';
    gestiones[id].nov_solucionada=true;
    _novSyncSolucionadaGD(id,true);
    marcarFinalizadoNov(id); // valida nota de hoy y marca gestion_final (mueve a Gestionadas)
    return;
  }
  if(valor==='fondo'){_novPasarAlFondo(id);return;}
  if(valor==='devolver'){marcarDevolucion(id);return;}
  ultimaGestion=Date.now();
  if(!gestiones[id])gestiones[id]={};
  gestiones[id].resultado_gestion=valor||'';
  guardar();_fbSyncGestion(id);
  _novRefrescarCard(id);
}

function marcarFinalizadoOficina(id){
  ultimaGestion=Date.now();
  const g=gestiones[id]||{};
  if(g.gestion_final){marcarFinalizado(id);return;}
  if(!tieneNotaHoy(id)){_pedirNotaHoy(id);return;}
  marcarFinalizado(id);
  _roSyncFromGestion(id);
}

function setNota(id, texto){
  ultimaGestion=Date.now();
  texto=(texto||'').trim();
  if(!texto)return;
  if(!gestiones[id])gestiones[id]={};
  // Migrar nota antigua (string) a array si existe
  if(gestiones[id].nota&&!gestiones[id].notas){
    gestiones[id].notas=[{texto:gestiones[id].nota,fecha:new Date().toLocaleDateString('es-CO'),ts:Date.now()-1}];
    delete gestiones[id].nota;
  }
  if(!gestiones[id].notas)gestiones[id].notas=[];
  // No duplicar si el texto es idéntico a la última nota del mismo día
  const hoy=new Date().toLocaleDateString('es-CO');
  const ult=gestiones[id].notas[gestiones[id].notas.length-1];
  if(ult&&ult.texto===texto&&ult.fecha===hoy){guardar();return;}
  gestiones[id].notas.push({texto,fecha:hoy,ts:Date.now()});
  guardar();_fbSyncGestion(id);_roSyncFromGestion(id);
  // Guardar nota también en almacén estable por guía (sobrevive cambios de Excel)
  try{
    const _pN=pedidos.find(p=>p.id===id);
    if(_pN&&_pN.guia){
      const _lsN=JSON.parse(localStorage.getItem(LS_NOTES)||'{}');
      if(!_lsN[_pN.guia])_lsN[_pN.guia]=[];
      _lsN[_pN.guia].push({texto,fecha:hoy,ts:Date.now()});
      localStorage.setItem(LS_NOTES,JSON.stringify(_lsN));
    }
  }catch(e){}
  // Las notas se sincronizan a Firebase via _fbSyncGestion (gestiones_sync)
  // Oficina, Tránsito, Reparto y Novedad usan el widget de nota recortado (sin historial en línea) — refrescar la card entera
  const _pNota=pedidos.find(p=>p.id===id);
  if(_pNota&&_pNota.estadoKey==='novedad'){
    const _oldCardNov=document.getElementById('card-'+id);
    if(_oldCardNov) _oldCardNov.replaceWith(crearCardNovedad(_pNota));
  } else if(_pNota&&(_pNota.estadoKey==='oficina'||_pNota.estadoKey==='transito'||_pNota.estadoKey==='reparto')){
    const _estNota=ESTADOS.find(e=>e.key===_pNota.estadoKey);
    const _oldCard=document.getElementById('card-'+id);
    if(_oldCard&&_estNota) _oldCard.replaceWith(crearCard(_pNota,_estNota,false));
  } else {
    // Para otras categorías, refrescar solo el widget de notas
    const wrap=document.querySelector('#card-'+id+' .notas-wrap');
    if(wrap)wrap.outerHTML=notaWidgetHtml(id);
  }
  toast('📝 Nota guardada');
}

function tieneNotaHoy(id){
  const hoy=new Date().toLocaleDateString('es-CO');
  const g=gestiones[id]||{};
  const notas=g.notas||(g.nota?[{texto:g.nota,fecha:''}]:[]);
  return notas.some(n=>n.fecha===hoy);
}

function _pedirNotaHoy(id){
  const ta=document.getElementById('nota-inp-'+id);
  if(ta){
    ta.classList.remove('nota-req-shake');
    void ta.offsetWidth;
    ta.classList.add('nota-req-shake');
    ta.focus();
    const orig=ta.placeholder;
    ta.placeholder='✏️ Escribe una nota de hoy antes de continuar...';
    setTimeout(()=>{ta.classList.remove('nota-req-shake');ta.placeholder=orig;},1600);
  }
  toast('📝 La nota debe ser de hoy para poder gestionar este pedido');
}

function getUltimaNota(id){
  const g=gestiones[id]||{};
  // compatibilidad con nota antigua
  if(g.nota)return{texto:g.nota,fecha:''};
  if(g.notas&&g.notas.length)return g.notas[g.notas.length-1];
  // Fallback: buscar en almacén estable por guía
  try{
    const p=_pedidoMap.get(id);
    if(p&&p.guia){
      const lsN=JSON.parse(localStorage.getItem(LS_NOTES)||'{}');
      const arr=lsN[p.guia];
      if(arr&&arr.length){
        // Sincronizar de vuelta a gestiones para esta sesión
        if(!g.notas)gestiones[id].notas=arr;
        return arr[arr.length-1];
      }
    }
  }catch(e){}
  return null;
}

function btnLlamarHtml(id, telefono){
  if(!telefono) return '';
  return '<div class="btn-llamar-wrap">'+
    '<button class="btn-llamar" id="btn-iris-'+id+'" onclick="registrarClick('+id+');llamarIRIS(\''+telefono+'\',\'btn-iris-'+id+'\')"><span class="ico">📞</span> Llamada IRIS</button>'+
    '<button class="btn-llamar-talkyria" disabled title="Próximamente">📲 Talkyria<span class="talkyria-prox">Próximamente</span></button>'+
  '</div>';
}

function llamarIRIS(telefono, btnId){
  const btn=document.getElementById(btnId);
  const copiar=()=>{
    _copiar(telefono,()=>toast('📋 Número copiado — ve a IRIS y realiza la llamada', 3500));
    if(btn){
      btn.textContent='✅ Copiado';
      btn.style.background='#16a34a';
      btn.style.transform='scale(1.04)';
      btn.style.transition='all .2s';
      setTimeout(()=>{
        btn.style.transform='scale(1)';
        setTimeout(()=>{btn.innerHTML='<span class="ico">📞</span> Llamada IRIS';btn.style.background='';btn.style.transition='';},400);
      },1800);
    }
  };
  copiar();
}

function llamadaRowHtml(id){
  const g=gestiones[id]||{};
  const hoy=new Date().toLocaleDateString('es-CO');
  const fecha=g.llamada_fecha||'';
  const esMismoDia=fecha===hoy;
  const fechaLabel=fecha?(esMismoDia?'hoy':'el '+fecha):'';
  const labelC='✔ Contestó'+(g.llamada==='contestó'&&fechaLabel?' · '+fechaLabel:'');
  const labelNC='📵 No contestó'+(g.llamada==='no_contestó'&&fechaLabel?' · '+fechaLabel:'');
  return '<div class="llamada-row">'+
    '<button class="btn-a ba-c'+(g.llamada==='contestó'?' sel':'')+'" onclick="setLlamada('+id+',\'contestó\')">'+labelC+'</button>'+
    '<button class="btn-a ba-nc'+(g.llamada==='no_contestó'?' sel':'')+'" onclick="setLlamada('+id+',\'no_contestó\')">'+labelNC+'</button>'+
  '</div>';
}

// Migra la nota antigua (string suelto) al array notas[] para que edición
// y borrado por índice tengan siempre un array estable donde apuntar
function _migrarNotaLegacy(id){
  const g=gestiones[id];
  if(g&&g.nota&&!g.notas){
    g.notas=[{texto:g.nota,fecha:new Date().toLocaleDateString('es-CO'),ts:Date.now()-1}];
    delete g.nota;
  }
}

function notaWidgetHtml(id){
  _migrarNotaLegacy(id);
  const g=gestiones[id]||{};
  const notas=g.notas||[];
  let hist='';
  if(notas.length){
    hist='<div class="notas-hist">'+
      notas.map((n,idx)=>({n,idx})).slice().reverse().map(({n,idx})=>
        '<div class="nota-item" id="nota-item-'+id+'-'+idx+'">'+
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">'+
            '<div style="min-width:0;display:flex;flex-direction:column;gap:1px;">'+
              (n.fecha?'<span class="nota-fecha">'+n.fecha+(n._editado?' · editada':'')+'</span>':'')+
              '<span class="nota-texto">'+n.texto.replace(/</g,'&lt;')+'</span>'+
            '</div>'+
            '<div style="display:flex;gap:2px;flex-shrink:0;">'+
              '<button type="button" title="Editar nota" onclick="event.stopPropagation();editarNotaInline('+id+','+idx+')" style="background:none;border:none;cursor:pointer;font-size:.72rem;padding:1px 3px;opacity:.7;">✏️</button>'+
              '<button type="button" title="Eliminar nota" onclick="event.stopPropagation();eliminarNota('+id+','+idx+')" style="background:none;border:none;cursor:pointer;font-size:.72rem;padding:1px 3px;opacity:.7;">🗑️</button>'+
            '</div>'+
          '</div>'+
        '</div>'
      ).join('')+
    '</div>';
  }
  return '<div class="notas-wrap">'+hist+notaInputRowHtml(id)+'</div>';
}

// Solo el textarea + botón Guardar, sin el historial de notas anteriores
// (usado en la card de Oficina, donde el historial se ve aparte con "Ver historial")
function notaInputRowHtml(id){
  return '<div class="nota-input-row">'+
    '<textarea id="nota-inp-'+id+'" placeholder="📝 Escribe una nota..." rows="2"></textarea>'+
    '<button class="btn-nota-guardar" onclick="setNota('+id+',document.getElementById(\'nota-inp-'+id+'\').value);document.getElementById(\'nota-inp-'+id+'\').value=\'\'">Guardar</button>'+
  '</div>';
}

// Convierte una nota del historial en un textarea editable en su lugar
function editarNotaInline(id, idx){
  const g=gestiones[id]||{};
  const n=(g.notas||[])[idx];
  if(!n)return;
  const el=document.getElementById('nota-item-'+id+'-'+idx);
  if(!el)return;
  el.innerHTML=
    '<textarea id="nota-edit-inp-'+id+'-'+idx+'" rows="2" style="width:100%;">'+n.texto.replace(/</g,'&lt;')+'</textarea>'+
    '<div style="display:flex;gap:6px;margin-top:4px;">'+
      '<button type="button" onclick="event.stopPropagation();guardarNotaEditada('+id+','+idx+')" style="flex:1;padding:5px;border-radius:6px;font-size:.68rem;font-weight:700;border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer;">Guardar</button>'+
      '<button type="button" onclick="event.stopPropagation();_actualizarCard('+id+')" style="flex:1;padding:5px;border-radius:6px;font-size:.68rem;font-weight:700;border:1px solid var(--border-strong);background:transparent;color:var(--text-2);cursor:pointer;">Cancelar</button>'+
    '</div>';
  document.getElementById('nota-edit-inp-'+id+'-'+idx).focus();
}

// Guarda la corrección de una nota existente (para arreglar errores de tipeo)
function guardarNotaEditada(id, idx){
  const inp=document.getElementById('nota-edit-inp-'+id+'-'+idx);
  if(!inp)return;
  const texto=inp.value.trim();
  if(!texto){toast('⚠️ La nota no puede quedar vacía — usa 🗑️ para eliminarla');return;}
  const g=gestiones[id];
  if(!g||!g.notas||!g.notas[idx])return;
  g.notas[idx].texto=texto;
  g.notas[idx]._editado=true;
  guardar();_fbSyncGestion(id);_roSyncFromGestion(id);
  _actualizarCard(id);
  toast('📝 Nota corregida');
}

// Elimina una nota mal hecha del historial de gestión
function eliminarNota(id, idx){
  const g=gestiones[id];
  if(!g||!g.notas||!g.notas[idx])return;
  _mConfirm('¿Eliminar esta nota?','Esta acción no se puede deshacer.',()=>{
    g.notas.splice(idx,1);
    guardar();_fbSyncGestion(id);_roSyncFromGestion(id);
    _actualizarCard(id);
    toast('🗑️ Nota eliminada');
  },'danger');
}

// ── PROGRESS / RESUMEN ─────────────────────────────────────────────────
function renderProgress(){
  // Excluir pendiente sin guia: no tienen flujo de gestión, no deben contar en el progreso
  const accionables=pedidos.filter(p=>!sinAccion(p)&&p.estadoKey!=='pendiente');
  const total=accionables.length;
  const done=accionables.filter(p=>estaCompleta(p)).length;
  const autoOk=pedidos.filter(p=>sinAccion(p)).length;
  const pct=total?Math.round(done/total*100):0;
  document.getElementById('prog-label').textContent=
    done+' de '+total+' gestionados ('+pct+'%)'+(autoOk?' · '+autoOk+' en transito sin novedad':'');
  document.getElementById('prog-fill').style.width=pct+'%';
}

function renderResumen(){
  // "accionables" = los que deben gestionarse (excluye sinAccion)
  const cats=ESTADOS.filter(e=>e.key!=='pendiente_sin_guia');
  const rows=cats.map(est=>{
    const accionables=pedidos.filter(p=>p.estadoKey===est.key&&!sinAccion(p));
    if(!accionables.length)return null;
    const gestionados=accionables.filter(p=>estaCompleta(p)).length;
    return '<div class="rrow">'+
      '<span><span class="rdot" style="background:'+est.color+'"></span>'+est.label+'</span>'+
      '<strong>'+gestionados+'<span style="opacity:.45;font-weight:400"> /'+accionables.length+'</span></strong>'+
    '</div>';
  }).filter(Boolean);
  const totalAcc=pedidos.filter(p=>p.estadoKey!=='pendiente'&&!sinAccion(p)).length;
  const totalGest=pedidos.filter(p=>p.estadoKey!=='pendiente'&&!sinAccion(p)&&estaCompleta(p)).length;
  document.getElementById('res-body').innerHTML=
    (rows.length?rows.join(''):'<div style="opacity:.5;font-size:.73rem">Sin pedidos cargados</div>')+
    '<hr style="border:none;border-top:1px solid rgba(255,255,255,.1);margin:5px 0">'+
    '<div class="rrow rtotal"><span>Gestionados</span><strong>'+totalGest+'<span style="opacity:.45;font-weight:400"> /'+totalAcc+'</span></strong></div>';
  renderProgress();
}

// ── MODO RAPIDO ────────────────────────────────────────────────────────
let rapidQueue=[], rapidIdx=0;

function actualizarBtnRapid(){
  const btn=document.getElementById('btn-rapid');if(!btn)return;
  const pend=pedidos.filter(p=>p.estadoKey==='transito'&&!p.novedad&&(p.dias||0)>=4&&!gestiones[p.id]?.wa_enviado&&p.telefono&&histPuedeMensaje(p.guia));
  btn.style.display=pend.length?'flex':'none';
  btn.textContent='\u26A1 Tránsito ('+pend.length+')';
}

function iniciarModoRapido(){
  rapidQueue=pedidos.filter(p=>p.estadoKey==='transito'&&!p.novedad&&(p.dias||0)>=4&&!gestiones[p.id]?.wa_enviado&&p.telefono&&histPuedeMensaje(p.guia));
  if(!rapidQueue.length){toast('No hay pedidos de tránsito pendientes');return;}
  rapidIdx=0;
  document.getElementById('rapid-modal').classList.add('open');
  rapMostrar();
}

function rapMostrar(){
  if(rapidIdx>=rapidQueue.length){rapTerminado();return;}
  const p=rapidQueue[rapidIdx];
  const wi=getWAInfo(p,'transito');
  document.getElementById('rap-counter').textContent=(rapidIdx+1)+' de '+rapidQueue.length;
  document.getElementById('rap-nombre').textContent=p.nombre;
  document.getElementById('rap-tel').textContent='📞 '+p.telefono.replace(/^57/,'');
  document.getElementById('rap-prod').textContent='🛍️ '+getProductoSimple(p.productos);
  document.getElementById('rap-msg').textContent=wi.msg;
  document.getElementById('rap-wa-btn').href='https://wa.me/'+p.telefono+'?text='+encodeURIComponent(wi.msg);
  document.getElementById('rap-prog').style.width=Math.round(rapidIdx/rapidQueue.length*100)+'%';
}

function rapEnviado(){
  const p=rapidQueue[rapidIdx];
  if(!gestiones[p.id])gestiones[p.id]={};
  gestiones[p.id].wa_enviado=true;
  waCounters['transito']=(waCounters['transito']||0)+1;
  if(p.guia)histRegistrar(p.guia);
  guardar();
  setTimeout(()=>rapSiguiente(true),1200);
}

function rapSiguiente(enviado){
  if(!enviado)waCounters['transito']=(waCounters['transito']||0)+1;
  rapidIdx++;
  if(rapidIdx>=rapidQueue.length){rapTerminado();return;}
  rapMostrar();
}

function rapTerminado(){
  const enviados=rapidQueue.filter(p=>gestiones[p.id]?.wa_enviado).length;
  document.getElementById('rap-body').innerHTML=
    '<div class="rapid-done">'+
      '<h3>✅ Listo!</h3>'+
      '<p>'+rapidQueue.length+' pedidos procesados</p>'+
      '<p style="margin-top:6px;color:var(--text-2);font-weight:600">'+enviados+' mensajes enviados</p>'+
      '<button class="rapid-done-btn" onclick="cerrarRapid()">Cerrar</button>'+
    '</div>';
  renderAll();
}

function cerrarRapid(){
  document.getElementById('rapid-modal').classList.remove('open');
  setTimeout(()=>{
    document.getElementById('rap-body').innerHTML=
      '<div class="rapid-body">'+
        '<div class="rapid-progress"><div class="rapid-prog-fill" id="rap-prog"></div></div>'+
        '<div class="rapid-cliente" id="rap-nombre"></div>'+
        '<div class="rapid-tel" id="rap-tel"></div>'+
        '<div class="rapid-prod" id="rap-prod"></div>'+
        '<div class="rapid-msg" id="rap-msg"></div>'+
        '<div class="rapid-actions">'+
          '<a class="btn-rap-send" id="rap-wa-btn" href="#" target="_blank" onclick="rapEnviado()">Abrir WhatsApp y enviar</a>'+
          '<button class="btn-rap-skip" onclick="rapSiguiente(false)">Omitir</button>'+
          '<button class="btn-rap-stop" onclick="cerrarRapid()">Detener</button>'+
        '</div>'+
      '</div>';
    renderAll();
  },300);
}

// ── EXPORTAR ───────────────────────────────────────────────────────────

function exportar(){
  if(!pedidos.length){toast('No hay datos');return;}
  const hoy=new Date().toLocaleDateString('es-CO').replace(/\//g,'-');
  const filas=pedidos.map(p=>{
    const g=gestiones[p.id]||{};
    const est=ESTADOS.find(e=>e.key===p.estadoKey);
    return{'Guia':p.guia,'Cliente':p.nombre,'Telefono':p.telefono?p.telefono.replace(/^57/,''):'',
      'Ciudad':p.ciudad,'Transportadora':p.transportadora,'Estado':est?.label||p.estadoKey,
      'Dias':p.dias!==null?p.dias:'','Producto':getProductoSimple(p.productos),'Tienda':p.tienda,
      'Llamada':g.llamada||'Sin gestión','Intentos':g.intentos||0,
      'WA':g.wa_enviado?'Sí':'No','Bot':g.chatepro?'Sí':'No',
      'Nueva entrega':g.nueva_entrega?'Sí':'No','Gestion final':g.gestion_final?'Sí':'No',
      'Gestionado':estaCompleta(p)?'Sí':'No',
      'Nota':(()=>{const u=getUltimaNota(p.id);return u?u.fecha+': '+u.texto:'';})(),
      'Novedad':p.novedad};
  });
  filas.sort((a,b)=>{const pA=ESTADOS.find(e=>e.label===a['Estado'])?.p||99,pB=ESTADOS.find(e=>e.label===b['Estado'])?.p||99;return pA-pB;});
  const ws=XLSX.utils.json_to_sheet(filas);
  ws['!cols']=[14,22,13,16,14,14,8,22,12,14,8,6,9,12,10,10,22,20].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Logistica '+hoy);
  XLSX.writeFile(wb,'Logistica_Dropi_'+hoy+'.xlsx');toast('\uD83D\uDCE5 Excel exportado');
}

// ── PDF ────────────────────────────────────────────────────────────────
function fmtMin(ms){
  if(!ms||ms<0)return'—';
  const m=Math.round(ms/60000);
  return m<60?m+' min':Math.floor(m/60)+'h '+(m%60)+'m';
}


// ── INFORME INICIAL ─────────────────────────────────────────────────────
function abrirInformeInicial(){
  if(!pedidos.length)return;
  generarInformeInicial();
  document.getElementById('inf-inicial').classList.add('open');
}
function cerrarInformeInicial(){
  document.getElementById('inf-inicial').classList.remove('open');
}
function volverACargar(){
  document.getElementById('inf-inicial').classList.remove('open');
  pedidos=[];gestiones={};
  localStorage.removeItem(LS_KEY);
  document.getElementById('upload-zone').style.display='flex';
  document.getElementById('main').style.display='none';document.body.classList.remove('data-loaded');
  document.getElementById('file-input').value='';
  toast('📂 Carga un nuevo archivo Excel');
}



async function copiarInformeFinalImagen(){
  const btn=document.getElementById('btn-copiar-pdf');
  btn.disabled=true;btn.textContent='Generando...';
  try{
    const box=document.querySelector('.pdf-box');
    const btns=box.querySelector('.pdf-btns');
    btns.style.display='none';
    const canvas=await html2canvas(box,{
      scale:2,
      backgroundColor:'#ffffff',
      useCORS:true,
      logging:false
    });
    btns.style.display='';
    canvas.toBlob(async blob=>{
      try{
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        btn.textContent='Copiado!';
        btn.style.background='#15803d';
        setTimeout(()=>{btn.disabled=false;btn.textContent='Copiar imagen';btn.style.background='';},2200);
      }catch(e){
        const url=URL.createObjectURL(blob);
        window.open(url,'_blank');
        btn.disabled=false;btn.textContent='Copiar imagen';
        toast('Imagen abierta en nueva pestaña — guarda y comparte');
      }
    },'image/png');
  }catch(e){
    btn.disabled=false;btn.textContent='Copiar imagen';
    toast('Error al generar imagen');
  }
}

async function copiarInformeImagen(){
  const btn=document.getElementById('btn-copiar-inf');
  btn.disabled=true;btn.textContent='Generando...';
  try{
    const box=document.querySelector('.inf-box');
    // Temporarily hide the buttons row
    const btns=box.querySelector('.inf-btns');
    btns.style.display='none';
    const canvas=await html2canvas(box,{
      scale:2,
      backgroundColor:'#ffffff',
      useCORS:true,
      logging:false
    });
    btns.style.display='';
    canvas.toBlob(async blob=>{
      try{
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        btn.textContent='Copiado!';
        btn.style.background='#15803d';
        setTimeout(()=>{btn.disabled=false;btn.textContent='Copiar imagen';btn.style.background='';},2200);
      }catch(e){
        // Fallback: open in new tab so user can save manually
        const url=URL.createObjectURL(blob);
        window.open(url,'_blank');
        btn.disabled=false;btn.textContent='Copiar imagen';
        toast('Imagen abierta en nueva pestaña — guarda y comparte');
      }
    },'image/png');
  }catch(e){
    btn.disabled=false;btn.textContent='Copiar imagen';
    toast('Error al generar imagen');
    console.error(e);
  }
}

function generarInformeInicial(){
  const ahora=new Date();
  const fecha=ahora.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const hora=ahora.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
  const tienda=window.getLoginTienda?window.getLoginTienda():'';
  const asesor=window.getLoginAsesor?window.getLoginAsesor():'';
  document.getElementById('inf-sub').innerHTML=
    fecha+' · Reporte generado a las '+hora+
    (tienda||asesor?'<br><span style="font-size:.78rem;color:var(--text-1);font-weight:600;">🏪 '+tienda+'&nbsp;&nbsp;·&nbsp;&nbsp;👤 Asesor: '+asesor+'</span>':'');

  const accionables=pedidos.filter(p=>!sinAccion(p)&&p.estadoKey!=='pendiente'&&!estadosDesactivados.has(p.estadoKey));
  const total=accionables.length;
  const sinGuia=pedidos.filter(p=>p.estadoKey==='pendiente_sin_guia').length;
  const transito_ok=pedidos.filter(p=>sinAccion(p)).length;

  // Por estado
  const secRows=ESTADOS.filter(e=>e.key!=='pendiente_sin_guia'&&!estadosDesactivados.has(e.key)).map(est=>{
    const cnt=pedidos.filter(p=>p.estadoKey===est.key&&!sinAccion(p)).length;
    return cnt>0?`<div class="inf-row">
      <span class="est-label"><span class="inf-dot" style="background:${est.color}"></span>${est.icon} ${est.label}</span>
      <span class="est-cnt" style="color:${est.color}">${cnt}</span>
    </div>`:''}).join('');

  // Por transportadora
  const transpMap={};
  accionables.forEach(p=>{
    if(p.transportadora){
      const t=p.transportadora.trim();
      transpMap[t]=(transpMap[t]||0)+1;
    }
  });
  const transpRows=Object.entries(transpMap)
    .sort((a,b)=>b[1]-a[1])
    .map(([t,n])=>`<div class="inf-transp-row"><span>${t}</span><strong>${n}</strong></div>`).join('');

  // Por tienda
  const tiendaMap={};
  accionables.forEach(p=>{
    if(p.tienda){tiendaMap[p.tienda]=(tiendaMap[p.tienda]||0)+1;}
  });
  const tiendaRows=Object.entries(tiendaMap)
    .sort((a,b)=>b[1]-a[1])
    .map(([t,n])=>`<div class="inf-transp-row"><span>${t}</span><strong>${n}</strong></div>`).join('');

  document.getElementById('inf-body').innerHTML=`
    <div class="inf-section">
      <h3>Resumen general</h3>
      <div class="inf-grid" style="grid-template-columns:1fr;">
        <div class="inf-stat"><div class="val">${total}</div><div class="lbl">Pedidos para gestionar</div></div>
      </div>
    </div>
    <div class="inf-section">
      <h3>Pedidos por estado</h3>
      ${secRows||'<div style="font-size:.78rem;color:var(--text-3)">Sin pedidos activos</div>'}
    </div>
    ${transpRows?`<div class="inf-section"><h3>Por transportadora</h3>${transpRows}</div>`:''}
    ${tiendaRows?`<div class="inf-section"><h3>Por tienda</h3>${tiendaRows}</div>`:''}
  `;
}

function generarPDF(){
  if(!pedidos.length)return;
  const ahora=Date.now();
  // Tiempo real trabajado = total transcurrido − tiempo pausado acumulado
  const pausadoAcumulado=totalPausadoMs+(pausaActiva&&pausaInicio?ahora-pausaInicio:0);
  const durTotal=sesionInicio?Math.max(0,(ahora-sesionInicio)-pausadoAcumulado):0;
  const hoy=new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const horaInicio=sesionInicio?new Date(sesionInicio).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}):'—';
  const horaFin=new Date(ahora).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
  const accionables=pedidos.filter(p=>!sinAccion(p)&&p.estadoKey!=='pendiente');
  const total=accionables.length;
  const gestionados=accionables.filter(p=>estaCompleta(p)).length;
  const contestaron=pedidos.filter(p=>gestiones[p.id]?.llamada==='contestó').length;
  const noContestaron=pedidos.filter(p=>gestiones[p.id]?.llamada==='no_contestó').length;
  const waEnviados=pedidos.filter(p=>gestiones[p.id]?.wa_enviado).length;
  const chatepro=pedidos.filter(p=>gestiones[p.id]?.chatepro).length;
  const finalizados=pedidos.filter(p=>gestiones[p.id]?.gestion_final).length;
  const autoSinNovedad=pedidos.filter(p=>sinAccion(p)).length;
  const pct=total?Math.round(gestionados/total*100):0;
  const secStats=ESTADOS.filter(est=>est.key!=='pendiente_sin_guia'&&est.key!=='pendiente'&&!estadosDesactivados.has(est.key)).map(est=>{
    const gr=pedidos.filter(p=>p.estadoKey===est.key&&!sinAccion(p));
    const gest=gr.filter(p=>estaCompleta(p));
    const nc=gr.filter(p=>gestiones[p.id]?.llamada==='no_contestó').length;
    const t=tiemposPorSeccion[est.key];
    const dur=t&&t.fin?(t.fin-t.inicio):t?(ahora-t.inicio):null;
    return{est,total:gr.length,gestionados:gest.length,nc,dur};
  }).filter(s=>s.total>0);

  document.getElementById('pdf-sub').textContent=hoy+' · '+horaInicio+' a '+horaFin+' ('+fmtMin(durTotal)+')';
  document.getElementById('pdf-body').innerHTML=`
    <div class="pdf-section"><h3>Resumen general</h3>
      <div class="pdf-stat-grid">
        <div class="pdf-stat"><div class="val" style="color:var(--text-1)">${total}</div><div class="lbl">Total pedidos</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-1)">${gestionados}</div><div class="lbl">Gestionados</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--danger)">${total-gestionados}</div><div class="lbl">Pendientes</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-1)">${pct}%</div><div class="lbl">Completado</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-1)">${contestaron}</div><div class="lbl">Contestaron</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-2)">${noContestaron}</div><div class="lbl">No contestaron</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-1)">${waEnviados}</div><div class="lbl">WA enviados</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-1)">${chatepro}</div><div class="lbl">${CFG.bot||'Bot'}</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-1)">${finalizados}</div><div class="lbl">NC Finalizados</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-2)">${autoSinNovedad}</div><div class="lbl">Transito OK</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--text-1)">${fmtMin(durTotal)}</div><div class="lbl">Tiempo activo</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--warning)">${contadorPausas}</div><div class="lbl">Pausas usadas</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--warning)">${fmtMin(totalPausadoMs+(pausaActiva&&pausaInicio?Date.now()-pausaInicio:0))}</div><div class="lbl">Tiempo pausado</div></div>
        <div class="pdf-stat"><div class="val" style="color:var(--warning)">${contadorAlertasInactividad}</div><div class="lbl">Alertas inactividad</div></div>
      </div>
    </div>
    <div class="pdf-section"><h3>Resultados por estado</h3>
      <table class="pdf-table">
        <thead><tr><th>Estado</th><th>Pedidos</th><th>Gestionados</th><th>% Completado</th><th>No contestó</th><th>Tiempo</th></tr></thead>
        <tbody>${secStats.map(s=>`<tr>
          <td>${s.est.icon} ${s.est.label}</td>
          <td>${s.total}</td>
          <td>${s.gestionados}</td>
          <td><strong style="color:${s.total&&s.gestionados/s.total>=.8?'#15803d':s.total&&s.gestionados/s.total>=.5?'#92400e':'#b91c1c'}">${s.total?Math.round(s.gestionados/s.total*100):0}%</strong></td>
          <td>${s.nc}</td>
          <td>${fmtMin(s.dur)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
`;
  document.getElementById('pdf-modal').classList.add('open');
}

function cerrarPDF(){document.getElementById('pdf-modal').classList.remove('open');}

function resetApp(){
  if(pedidos.length){
    document.getElementById('reset-modal').style.display='flex';
    return;
  }
  limpiarApp();
}
function _resetCancelar(){document.getElementById('reset-modal').style.display='none';}
function _resetConPDF(){
  document.getElementById('reset-modal').style.display='none';
  generarPDF();
}
function _resetSinPDF(){
  document.getElementById('reset-modal').style.display='none';
  limpiarApp();
}
function _guardarNubeDesdePDF(){
  if(typeof _db==='undefined'||!window._currentUsername){
    toast('⚠️ Debes estar conectado para guardar en la nube');return;
  }
  let total=0;
  pedidos.forEach(p=>{
    if(gestiones[p.id]&&Object.keys(gestiones[p.id]).length){_fbSyncGestion(p.id);total++;}
  });
  toast('☁️ '+total+' gestiones guardadas — volviendo al inicio...');
  setTimeout(()=>{ cerrarPDF(); limpiarApp(); }, 1500);
}
function _resetGuardarNube(){
  document.getElementById('reset-modal').style.display='none';
  if(typeof _db==='undefined'||!window._currentUsername){
    toast('⚠️ Debes estar conectado para guardar en la nube');
    return;
  }
  // Sincronizar todas las gestiones activas a Firebase
  let total=0;
  pedidos.forEach(p=>{
    if(gestiones[p.id]&&Object.keys(gestiones[p.id]).length){
      _fbSyncGestion(p.id);
      total++;
    }
  });
  toast('☁️ '+total+' gestiones guardadas en la nube');
  setTimeout(()=>limpiarApp(), 1200);
}

function limpiarApp(){
  _fbGuardarInformeSesion();
  localStorage.removeItem(LS_KEY);
  pedidos=[];gestiones={};filtroActivo=null;filtrosSeccion={};filtroTiendas=[];
  waCounters={reparto:0,oficina:0,transito:0,novedad:0,rechazado:0};
  sesionInicio=null;tiemposPorSeccion={};
  ultimaGestion=Date.now();contadorAlertasInactividad=0;
  estadosDesactivados=new Set();ordenSecciones=[];
  _cardFocus=null;document.getElementById('kb-hint')?.classList.remove('show');
  if(_inactTimer){clearInterval(_inactTimer);_inactTimer=null;}
  pausaActiva=false;pausaInicio=null;totalPausadoMs=0;contadorPausas=0;
  const btnP=document.getElementById('btn-pausa');
  if(btnP){btnP.style.background='rgba(245,158,11,.25)';btnP.style.borderColor='rgba(245,158,11,.4)';btnP.style.color='#fcd34d';btnP.textContent='⏸ Pausa';}
  document.getElementById('upload-zone').style.display='none';
  document.getElementById('main').style.display='none';document.body.classList.remove('data-loaded');
  document.getElementById('right-panel').style.display='none';
  document.getElementById('file-input').value='';
  document.getElementById('save-st').textContent='';
  cerrarPDF();
  const _gdA=window.getLoginAsesor?window.getLoginAsesor():'';
  window._gdMostrarModeSelect(_gdA);
}

// ── MENÚ REPORTES ─────────────────────────────────────────────────────
function toggleReportesMenu(){
  const menu=document.getElementById('reportes-menu');
  const wrap=document.getElementById('btn-reportes-wrap');
  if(!menu||!wrap)return;
  const abierto=menu.style.display==='block';
  if(abierto){menu.style.display='none';return;}
  // position:fixed escapa del overflow-y:auto de la sidebar (que recortaba
  // el desplegable absoluto y parecía que el botón no hacía nada)
  const r=wrap.getBoundingClientRect();
  menu.style.position='fixed';
  menu.style.left=(r.right+10)+'px';
  menu.style.top=Math.max(8,Math.min(r.top,window.innerHeight-180))+'px';
  menu.style.right='auto';
  menu.style.zIndex='300';
  menu.style.display='block';
}
document.addEventListener('click',function(e){
  const wrap=document.getElementById('btn-reportes-wrap');
  if(wrap&&!wrap.contains(e.target)){
    const menu=document.getElementById('reportes-menu');
    if(menu)menu.style.display='none';
  }
});

// ── BUSCADOR ───────────────────────────────────────────────────────────
function toggleBuscador(){
  const bar=document.getElementById('search-bar');
  const res=document.getElementById('search-results');
  const ct=document.getElementById('content');
  const visible=bar.style.display==='flex';
  bar.style.display=visible?'none':'flex';
  if(visible){res.style.display='none';ct.style.display='block';document.getElementById('search-input').value='';document.getElementById('search-count').textContent='';}
  else{setTimeout(()=>document.getElementById('search-input').focus(),100);}
}

function limpiarBusqueda(){
  document.getElementById('search-input').value='';
  document.getElementById('search-results').style.display='none';
  document.getElementById('content').style.display='block';
  document.getElementById('search-count').textContent='';
}

function buscar(q){
  const query=q.trim().replace(/\D/g,'').length>=4?q.trim().replace(/\D/g,''):q.trim().toLowerCase();
  const ct=document.getElementById('content');
  const res=document.getElementById('search-results');
  if(!query||query.length<3){res.style.display='none';ct.style.display='block';document.getElementById('search-count').textContent='';return;}

  const isNum=q.trim().replace(/\D/g,'').length>=4;
  const matches=pedidos.filter(p=>{
    if(isNum){const t=(p.telefono||'').replace(/^57/,'');return t.includes(query)||p.telefono===query||('57'+query)===p.telefono;}
    return norm(p.nombre).includes(norm(q.trim()));
  });

  ct.style.display='none';
  res.style.display='block';
  document.getElementById('search-count').textContent=matches.length===0?'Sin resultados':matches.length+' resultado'+(matches.length>1?'s':'');

  if(!matches.length){res.innerHTML='<div class="empty-s" style="padding:40px">No se encontraron pedidos con ese dato.</div>';return;}

  res.innerHTML='';
  const grid=document.createElement('div');
  grid.className='cards-grid';
  grid.style.cssText='padding:16px;';
  matches.forEach(p=>{
    const est=ESTADOS.find(e=>e.key===p.estadoKey);
    let card;
    if(p.estadoKey==='novedad') card=crearCardNovedad(p);
    else if(p.estadoKey==='pendiente_sin_guia') card=crearCardPendiente(p,est?est.color:'#dc2626');
    else card=crearCard(p,est,false);
    grid.appendChild(card);
  });
  res.appendChild(grid);
}

// Aviso nativo de "¿seguro que quieres salir?" si hay pedidos cargados sin cerrar sesión.
// OJO: antes esto también disparaba generarPDF() (abre un modal pesado con toda la
// info del día) como efecto secundario de CUALQUIER "unload" — incluyendo cuando Chrome
// descarga la pestaña por ahorro de memoria (no solo al cerrar el tab a propósito).
// Si la recarga automática ocurre a mitad de esa generación, la página queda en un
// estado roto (pantalla en blanco). Se quitó esa llamada; el aviso nativo no tiene ese riesgo.
window.addEventListener('beforeunload'
,e=>{if(window._navegandoInterno)return;if(!pedidos.length)return;e.preventDefault();e.returnValue='';});
// ── ALERTA INACTIVIDAD ─────────────────────────────────────────────────
function resetInactividad(){
  ultimaGestion=Date.now();
  document.getElementById('alerta-inac').classList.remove('show');
}
function iniciarTimerInactividad(){
  if(_inactTimer)clearInterval(_inactTimer);
  _inactTimer=setInterval(()=>{
    if(!pedidos.length)return;
    if(pausaActiva)return; // ← no alertar si está en pausa
    const mins=Math.round((Date.now()-ultimaGestion)/60000);
    if(mins>=10){
      contadorAlertasInactividad++;
      ultimaGestion=Date.now();
      const el=document.getElementById('alerta-inac');
      document.getElementById('alerta-inac-cnt').textContent=
        'Alerta #'+contadorAlertasInactividad+' · '+mins+' min sin actividad';
      el.classList.add('show');
      setTimeout(()=>el.classList.remove('show'),30000);
    }
  },60000);
}
// Resetear inactividad con cualquier interacción en la página
(function(){
  let _lastInteract=0;
  function _onInteract(){
    const now=Date.now();
    if(now-_lastInteract<30000)return; // throttle: máximo una actualización cada 30s
    _lastInteract=now;
    if(pedidos.length&&!pausaActiva)ultimaGestion=now;
  }
  document.addEventListener('click',_onInteract,true);
  document.addEventListener('keydown',_onInteract,true);
  document.addEventListener('scroll',_onInteract,true);
})();

// ── PAUSA DE ACTIVIDAD ─────────────────────────────────────────────────
function togglePausa(){
  const btn=document.getElementById('btn-pausa');
  if(!pausaActiva){
    pausaActiva=true;
    pausaInicio=Date.now();
    contadorPausas++;
    btn.style.background='rgba(220,38,38,.35)';
    btn.style.borderColor='rgba(220,38,38,.5)';
    btn.style.color='#fca5a5';
    btn.textContent='▶ Reanudar';
    document.getElementById('alerta-inac').classList.remove('show');
    toast('⏸ Actividad pausada — no se registrarán alertas de inactividad');
  } else {
    pausaActiva=false;
    if(pausaInicio){totalPausadoMs+=Date.now()-pausaInicio;pausaInicio=null;}
    ultimaGestion=Date.now();
    btn.style.background='rgba(245,158,11,.25)';
    btn.style.borderColor='rgba(245,158,11,.4)';
    btn.style.color='#fcd34d';
    btn.textContent='⏸ Pausa';
    toast('▶ Actividad reanudada');
  }
}
cfgCheckPrimerUso();

// ── ORDENAMIENTO POR URGENCIA ──────────────────────────────────────────
function urgenciaScore(p){
  const g=gestiones[p.id]||{};
  let s=0;
  if(!g.llamada)s+=100;
  else if(g.llamada==='no_contestó'){
    // Reparto y oficina: mismo score que sin llamada → el orden no cambia al presionar el botón
    if(p.estadoKey==='reparto'||p.estadoKey==='oficina')s+=100;
    else s+=40;
  }
  s+=(g.intentos||0)*8;
  if(p.estadoKey==='novedad'){
    // Novedad: prioridad basada exclusivamente en FECHA DE NOVEDAD
    const dn=diasDesde(p.fechaNovedad);
    s+=(dn!=null?dn:0)*5;
  } else {
    // Resto de categorías: diasSinMov primero, sino dias (desde guía)
    const _d=p.diasSinMov!=null?p.diasSinMov:(p.dias||0);
    s+=_d*3;
  }
  return s;
}

// ── INDICADOR "QUÉ SIGUE" ──────────────────────────────────────────────
function queSigueBanner(p, estKey){
  const g=gestiones[p.id]||{};
  if(estKey==='transito'){
    if(!g.wa_enviado)return'<div class="que-sigue qs-wa">\uD83D\uDCE8 Enviar WhatsApp de seguimiento</div>';
    return'<div class="que-sigue qs-listo">✅ Mensaje enviado — sin acción requerida</div>';
  }
  if(estKey==='novedad'){
    const notasN=g.notas||(g.nota?[g.nota]:[]);
    if(!g.wa_nov_enviado&&!notasN.length)return'<div class="que-sigue qs-wa">📲 Enviar WhatsApp o registrar nota de la novedad</div>';
    if(!g.gestion_final)return'<div class="que-sigue qs-fin">☑️ Marcar gestión finalizada</div>';
    return'<div class="que-sigue qs-listo">✅ Gestión finalizada</div>';
  }
  // Reparto / Telemercadeo / Oficina
  if(estKey==='oficina'){
    const notasO=g.notas||(g.nota?[g.nota]:[]);
    if(!notasO.length)return'<div class="que-sigue qs-nota">📝 ¿Qué dijo el cliente? Escribe una nota — es obligatoria</div>';
    if(!g.gestion_final)return'<div class="que-sigue qs-fin">☑️ Marcar gestión finalizada</div>';
    return'<div class="que-sigue qs-listo">✅ Gestión finalizada</div>';
  }
  if(!g.wa_enviado){
    const _nqs0=g.notas||(g.nota?[g.nota]:[]);
    if(!_nqs0.length)return'<div class="que-sigue qs-wa">📲 Enviar WhatsApp o registrar nota</div>';
  }
  if(!g.gestion_final)return'<div class="que-sigue qs-fin">☑️ Marcar gestión finalizada</div>';
  return'<div class="que-sigue qs-listo">✅ Gestión finalizada</div>';
}

// ── ATAJOS DE TECLADO ─────────────────────────────────────────────────
let _cardFocus=null;

function _setFocusCard(id){
  // Quitar foco anterior
  document.querySelectorAll('.card.kb-focus').forEach(c=>c.classList.remove('kb-focus'));
  _cardFocus=id;
  if(id===null){document.getElementById('kb-hint').classList.remove('show');return;}
  const card=document.getElementById('card-'+id);
  if(card){
    card.classList.add('kb-focus');
    card.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  document.getElementById('kb-hint').classList.add('show');
}

function _focusableCards(){
  // Tarjetas visibles que tienen llamadaRow (reparto, telemercadeo, oficina, novedad)
  return [...document.querySelectorAll('.card[id^="card-"]:not(.gest)')]
    .filter(c=>c.querySelector('.llamada-row')&&c.offsetParent!==null);
}




// ── MODAL MENSAJES WA ─────────────────────────────────────────────────
let _wamTabActual='reparto'; // 'reparto'|'telemercadeo'|'oficina'|'transito'|'novedad'
let _wamNovActual='coordinar';
const _WA_VARS=['{nombre}','{tienda}','{asesor}','{producto}','{tel_tienda}','{transportadora}','{mes_siguiente}'];

function abrirWAMsgs(){
  if(!CFG.waMsgs)CFG.waMsgs={};
  if(!CFG.waNov)CFG.waNov={};
  _wamTabActual='reparto';
  _wamNovActual='coordinar';
  // Renderizar tabs
  const tabs=document.getElementById('wam-tabs');
  tabs.innerHTML=[...WA_CATS,{key:'novedad',label:'Novedad'}].map(c=>
    '<button class="wam-tab'+(c.key===_wamTabActual?' activo':'')+'" data-tab="'+c.key+'" onclick="wamCambiarTab(\''+c.key+'\')">'+c.label+'</button>'
  ).join('');
  // Renderizar variables
  const vars=document.getElementById('wam-vars');
  vars.innerHTML=_WA_VARS.map(v=>'<span class="wam-var" onclick="wamInsertarVar(\''+v+'\')" title="Clic para insertar">'+v+'</span>').join('');
  // Select de novedad
  const sel=document.getElementById('wam-nov-sel');
  sel.innerHTML=WA_NOV_CATS.map(c=>'<option value="'+c.key+'">'+c.label+'</option>').join('');
  wamActualizarVista();
  document.getElementById('wa-msgs-modal').classList.add('open');
}

function cerrarWAMsgs(){
  document.getElementById('wa-msgs-modal').classList.remove('open');
}

function wamCambiarTab(key){
  // Guardar textarea actual antes de cambiar
  wamGuardarActual();
  _wamTabActual=key;
  if(key!=='novedad')_wamNovActual=WA_NOV_CATS[0].key;
  document.querySelectorAll('.wam-tab').forEach(b=>b.classList.toggle('activo',b.dataset.tab===key));
  wamActualizarVista();
}

function wamCambiarNov(key){
  wamGuardarActual();
  _wamNovActual=key;
  wamActualizarVista();
}

function wamGuardarActual(){
  const val=(document.getElementById('wam-textarea')?.value||'');
  if(_wamTabActual==='novedad'){
    CFG.waNov[_wamNovActual]=val;
  } else {
    CFG.waMsgs[_wamTabActual]=val;
  }
}

function _wamDefault(tab,nov){
  if(tab==='novedad'){
    const msgs=WA_NOV[nov]||WA_NOV.otra;
    return msgs[0]||'';
  }
  const msgs=WA_MSGS[tab]||[];
  return msgs[0]||'';
}
function wamActualizarVista(){
  const esNov=_wamTabActual==='novedad';
  document.getElementById('wam-nov-wrap').style.display=esNov?'block':'none';
  if(esNov) document.getElementById('wam-nov-sel').value=_wamNovActual;
  const guardado=esNov?(CFG.waNov[_wamNovActual]||''):(CFG.waMsgs[_wamTabActual]||'');
  // Si no hay mensaje personalizado, cargar el default para que el usuario lo vea y edite
  document.getElementById('wam-textarea').value=guardado||_wamDefault(_wamTabActual,_wamNovActual);
}

function wamInsertarVar(v){
  const ta=document.getElementById('wam-textarea');
  const s=ta.selectionStart,e=ta.selectionEnd;
  ta.value=ta.value.slice(0,s)+v+ta.value.slice(e);
  ta.selectionStart=ta.selectionEnd=s+v.length;
  ta.focus();
}

function wamResetActual(){
  if(_wamTabActual==='novedad') CFG.waNov[_wamNovActual]='';
  else CFG.waMsgs[_wamTabActual]='';
  document.getElementById('wam-textarea').value=_wamDefault(_wamTabActual,_wamNovActual);
  toast('Mensaje restaurado al original');
}

function guardarWAMsgs(){
  wamGuardarActual();
  cfgGuardarLS();
  cerrarWAMsgs();
  toast('Mensajes guardados ✅');
}

// ── TEXTOS CAS DROPI ─────────────────────────────────────────────────
// Los textos viven en CFG para ser editables. Estos getters los exponen globalmente.
function CAS_SIN_MOVIMIENTO(){return CFG.casSinMovimiento||CAS_DEFAULT_SIN_MOVIMIENTO;}
function CAS_NOVEDAD(){return CFG.casNovedad||CAS_DEFAULT_NOVEDAD;}

function casCopiar(texto, btnId){
  _copiar(texto, ok=>{
    const btn=document.getElementById(btnId);
    if(!btn)return;
    const orig=btn.innerHTML;
    if(ok){
      btn.innerHTML='✅ Texto copiado';
      btn.style.background='var(--success-soft)';
      btn.style.borderColor='var(--success)';
      btn.style.color='var(--success)';
    }else{
      btn.innerHTML='⚠️ No se pudo copiar — intenta de nuevo';
      btn.style.borderColor='var(--danger)';
      btn.style.color='var(--danger)';
      toast('⚠️ El navegador bloqueó la copia. Haz clic de nuevo.',3000);
    }
    setTimeout(()=>{btn.innerHTML=orig;btn.style.background='';btn.style.borderColor='';btn.style.color='';},2200);
  });
}

// ── SEGUIMIENTO A TRANSPORTADORAS ────────────────────────────────────
// Clasifica el estado crudo de Dropi (columna ESTADO) en dos grupos:
// "recomendar" = en movimiento normal, solo hay que tranquilizar al cliente
// "reportar"   = estancado / requiere reportar a la transportadora o CAS
const TRANSP_ESTADOS_RECOMENDAR=['EN REPARTO','EN DISTRIBUCION','EN BODEGA DESTINO','NOVEDAD SOLUCIONADA','EN PROCESAMIENTO','EN ZONA DE DISTRIBUCIÓN','EN TERMINAL DESTINO','TRANSITO URBANO','REPARTO','EN DISTRIBUCIN URBANA','DISTRIBUCIN','DISTRIBUCION','EN PROCESO','BODEGA DESTINO','EN CAMINO'].map(norm);
const TRANSP_ESTADOS_REPORTAR=['PREPARADO PARA TRANSPORTADORA','ENTREGADO A TRANSPORTADORA','EN BODEGA DROPI','RECOGIDO POR DROPI','EN SALIDA DE CIUDAD INTERMEDIA','ENTRADA BODEGA LOCAL','EN TRANSITO CIUDAD INTERMEDIA','SALIO A CIUDAD DESTINO','SALIDA A BODEGA LOCAL','INGRESO AL CENTRO LOGISTICO','SIN MOVIMIENTOS','GENERADA','PRODUCIDA','DESPACHADA','EN TRANSITO','DESPACHADA DE TRANSITO','EN ESPERA DE RX','EN ESPERA DE RUTA DOMESTICA','TELEMERCADEO','EN RUTA','EN BODEGA ORIGEN','RECOLECCION'].map(norm);
const TRANSP_GRUPOS = {
  recomendar:{label:'Guías para recomendar', dias:3, icon:'📢', border:'#0891b2', bg:'#cffafe', color:'#0e7490', cas:false},
  reportar:  {label:'Guías para reportar',   dias:2, icon:'🚩', border:'#dc2626', bg:'#fee2e2', color:'#b91c1c', cas:true},
};

function _transpGrupoDe(p){
  const e=norm(p.estadoRaw);
  if(TRANSP_ESTADOS_RECOMENDAR.includes(e))return 'recomendar';
  if(TRANSP_ESTADOS_REPORTAR.includes(e))return 'reportar';
  return null;
}

function _transpPedidos(){
  const grupos={recomendar:[],reportar:[]};
  pedidos.forEach(p=>{
    const g=_transpGrupoDe(p);
    if(!g)return;
    // diasSinMov = días desde fecha último movimiento (si existe), sino dias (desde guía)
    const d=(p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);
    if(d!=null && d>=TRANSP_GRUPOS[g].dias) grupos[g].push(p);
  });
  return grupos;
}

function _transpTotal(){
  const g = _transpPedidos();
  return Object.values(g).reduce((s,arr)=>s+arr.length, 0);
}

// Sincroniza a Firebase las guías de esta tienda que caen en "recomendar" o
// "reportar", para que el admin pueda consolidar el reporte de todas las
// tiendas en un solo Excel (ver _admCargarReportes / logistica_guias).
// OJO: no usa _gsKey() a secas — si _currentTiendaId todavía no se ha
// resuelto (carrera típica justo después del login) NO hay que sincronizar
// bajo el username, porque el admin lee por empresaId y nunca lo vería.
function _syncGuiasReporteAdmin(){
  if(typeof _db==='undefined')return;
  const tiendaNombre=(window.getLoginTienda?window.getLoginTienda():'')||'';
  const escribir=(tKey)=>{
    if(!tKey)return;
    const grupos=_transpPedidos();
    const guias={};
    ['recomendar','reportar'].forEach(g=>{
      (grupos[g]||[]).forEach(p=>{
        if(!p.guia)return;
        guias[p.guia]={
          guia:p.guia,
          transportadora:p.transportadora||'',
          estatus:p.estadoRaw||'',
          fechaMov:p.fechaMov?_fmtFecha(p.fechaMov):'',
          // Los días se guardan calculados, no solo la fecha: el admin filtra
          // por "más de N días sin movimiento" y así no depende de reparsear el
          // texto dd/mm/aaaa. Se conserva el fallback por fecha para las guías
          // que se sincronizaron antes de que existiera este campo.
          diasSinMov:(p.diasSinMov!=null)?p.diasSinMov:(p.dias!=null?p.dias:null),
          grupo:g
        };
      });
    });
    console.log('[Reportes admin] sincronizando '+Object.keys(guias).length+' guías bajo tienda "'+tKey+'"');
    _db.ref('logistica_guias/'+tKey).set({tienda:tiendaNombre,actualizado:Date.now(),guias})
      .then(()=>console.log('[Reportes admin] sincronizado OK bajo logistica_guias/'+tKey))
      .catch(e=>console.error('[Reportes admin] ERROR sincronizando:', e));
  };
  if(window._currentTiendaId){ escribir(window._currentTiendaId); return; }
  // _currentTiendaId aún no resuelto: buscarlo por nombre de tienda (igual
  // que hace el login) antes de sincronizar, para no escribir bajo una
  // clave que el admin nunca va a leer.
  if(!tiendaNombre){ console.warn('[Reportes admin] Sin nombre de tienda en sesión — no se sincronizó.'); return; }
  _db.ref('empresas').once('value').then(snapE=>{
    const emps=snapE.val()||{};
    const match=Object.entries(emps).find(([,e])=>(e.nombre||'').trim().toLowerCase()===tiendaNombre.trim().toLowerCase());
    if(match){
      window._currentTiendaId=match[0];
      escribir(match[0]);
    } else {
      console.warn('[Reportes admin] No se pudo resolver el ID de la tienda "'+tiendaNombre+'" — no se sincronizó.');
    }
  }).catch(e=>console.error('[Reportes admin] Error resolviendo empresaId:', e));
}

function actualizarBtnTransp(){
  const total = _transpTotal();
  const badge = document.getElementById('transp-badge');
  if(badge) badge.textContent = total;
  _actualizarReportesBadge();
}
function _actualizarReportesBadge(){
  const tSeg = (()=>{const {pend,guiaGen}=_segPedidos();return pend.length+guiaGen.length;})();
  const tTransp = _transpTotal();
  const tSinGuia = _sinGuiaPedidos().length;
  const wrap = document.getElementById('btn-reportes-wrap');
  const badgeTotal = document.getElementById('reportes-badge-total');
  if(!wrap) return;
  const total = tSeg + tTransp + tSinGuia;
  if(total > 0){
    wrap.style.display = 'inline-flex';
    if(badgeTotal) badgeTotal.textContent = total;
  } else {
    wrap.style.display = 'none';
  }
}

function abrirTransp(){
  const grupos = _transpPedidos();
  const body = document.getElementById('transp-body');
  body.innerHTML = '';

  let hayAlgo = false;

  Object.entries(TRANSP_GRUPOS).forEach(([key, cfg])=>{
    const lista = grupos[key];
    const sec = document.createElement('div');
    sec.className = 'seg-section';
    const title = document.createElement('div');
    title.className = 'seg-section-title';
    title.style.borderColor = cfg.border;
    title.innerHTML = cfg.icon+' '+cfg.label+' — más de '+cfg.dias+' días parado'+
      ' <span style="background:'+cfg.bg+';color:'+cfg.color+';padding:2px 8px;border-radius:8px;font-size:.72rem;margin-left:6px">'+lista.length+' pedidos</span>';
    sec.appendChild(title);

    if(!lista.length){
      const emp = document.createElement('div'); emp.className='seg-empty';
      emp.textContent = '✅ Sin pedidos en este grupo';
      sec.appendChild(emp);
    } else {
      hayAlgo = true;
      // Pills
      const umbral = cfg.dias;
      const crit = lista.filter(p=>{
        const d = (p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);
        return d!=null && d >= umbral+2;
      });
      const warn = lista.filter(p=>{
        const d = (p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);
        return d!=null && d >= umbral && d < umbral+2;
      });
      const pills = document.createElement('div'); pills.className='seg-resumen-pills';
      if(warn.length) pills.innerHTML += '<div class="seg-pill"><span class="sp-val seg-warn">'+warn.length+'</span><span class="sp-lbl">⚠️ '+umbral+'–'+(umbral+1)+' días</span></div>';
      if(crit.length) pills.innerHTML += '<div class="seg-pill"><span class="sp-val seg-urg">'+crit.length+'</span><span class="sp-lbl">🚨 +'+(umbral+2)+'d — Escalar</span></div>';
      sec.appendChild(pills);
      sec.appendChild(_transpTabla(lista, umbral, cfg.cas));
    }
    body.appendChild(sec);
  });

  if(!hayAlgo){
    const all = document.createElement('div'); all.className='seg-empty';
    all.style.padding='32px';
    all.textContent='✅ Todo en orden — ningún pedido parado';
    body.appendChild(all);
  }

  document.getElementById('transp-modal').classList.add('open');
}

function _transpTabla(lista, umbral, mostrarCas){
  const wrap = document.createElement('div'); wrap.style.cssText='overflow-x:auto;';
  const tbl = document.createElement('table'); tbl.className='seg-table';
  tbl.innerHTML='<thead><tr>'+
    '<th>Guía / ID</th>'+
    '<th>Cliente</th>'+
    '<th>Teléfono</th>'+
    '<th>Producto</th>'+
    '<th>Transportadora</th>'+
    '<th>Ciudad</th>'+
    '<th>Estado</th>'+
    '<th>Días parado</th>'+
    '<th>Urgencia</th>'+
    (mostrarCas?'<th>CAS Dropi</th>':'')+
  '</tr></thead>';
  const tbody = document.createElement('tbody');
  const sorted = [...lista].sort((a,b)=>{
    const da = (a.diasSinMov!=null)?a.diasSinMov:(a.dias||0);
    const db = (b.diasSinMov!=null)?b.diasSinMov:(b.dias||0);
    return db-da;
  });
  sorted.forEach(p=>{
    const d = (p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);
    const urgClass = d>=umbral+2 ? 'seg-urg' : 'seg-warn';
    const urgLabel = d>=umbral+2 ? '🚨 ESCALAR YA' : '⚠️ Monitorear';
    const casRowId='cas-tr-'+p.id;
    const tr = document.createElement('tr');
    tr.innerHTML=
      '<td style="font-family:monospace;font-size:.73rem;cursor:pointer;" onclick="copiarTexto(\''+(p.guia||p.dropiId)+'\')" title="Copiar">'+(p.guia||p.dropiId)+' 📋</td>'+
      '<td style="font-weight:600;color:var(--text-1)">'+esc(p.nombre)+'</td>'+
      '<td style="cursor:pointer" onclick="copiarTel(\''+p.telefono+'\')">'+(p.telefono?p.telefono.replace(/^57/,''):'—')+'</td>'+
      '<td>'+getProductoSimple(p.productos)+'</td>'+
      '<td>'+(p.transportadora||'—')+'</td>'+
      '<td>'+(p.ciudad||'—')+'</td>'+
      '<td style="font-size:.68rem;color:var(--text-2);">'+(p.estadoRaw||'—')+'</td>'+
      '<td style="text-align:center;font-weight:700">'+d+'d</td>'+
      '<td class="'+urgClass+'">'+urgLabel+'</td>'+
      (mostrarCas?'<td><button class="btn-cas" id="'+casRowId+'" style="width:auto;padding:5px 10px;font-size:.68rem;white-space:nowrap;" onclick="casCopiar(CAS_SIN_MOVIMIENTO(),this.id)">📋 Copiar texto CAS</button></td>':'');
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  return wrap;
}

function cerrarTransp(){
  document.getElementById('transp-modal').classList.remove('open');
}

function exportarTransp(){
  const grupos = _transpPedidos();
  const total = Object.values(grupos).reduce((s,a)=>s+a.length,0);
  if(!total){ toast('No hay pedidos parados'); return; }
  const minDias = parseInt(document.getElementById('transp-min-dias').value)||1;
  const hoy = new Date().toLocaleDateString('es-CO').replace(/\//g,'-');
  const wb = XLSX.utils.book_new();
  const nombresHoja = {
    recomendar:'Guías para recomendar +'+minDias+'d',
    reportar:  'Guías para reportar +'+minDias+'d',
  };
  const resFilas = [];
  Object.entries(grupos).forEach(([key, lista])=>{
    const listaFilt = lista.filter(p=>{
      const d=(p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);
      return d>=minDias;
    });
    if(!listaFilt.length) return;
    const umbral = TRANSP_GRUPOS[key].dias;
    const filas = [...listaFilt]
      .sort((a,b)=>{
        const da=(a.diasSinMov!=null)?a.diasSinMov:(a.dias||0);
        const db=(b.diasSinMov!=null)?b.diasSinMov:(b.dias||0);
        return db-da;
      })
      .map(p=>{
        const d=(p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);
        return {
          'Guía':p.guia||'',
          'ID Orden':p.dropiId,
          'Cliente':p.nombre,
          'Teléfono':p.telefono?p.telefono.replace(/^57/,''):'',
          'Producto':getProductoSimple(p.productos),
          'Transportadora':p.transportadora||'',
          'Ciudad':p.ciudad||'',
          'Departamento':p.depto||'',
          'Dirección':p.direccion||'',
          'Estado':p.estadoRaw||'',
          'Fecha último movimiento':p.fechaMov?_fmtFecha(p.fechaMov):'',
          'Días parado':d,
          'Urgencia':d>=umbral+2?'ESCALAR YA':'Monitorear',
        };
      });
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols']=[14,14,24,13,26,16,16,16,32,22,16,10,12].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, nombresHoja[key]);
    const urg=listaFilt.filter(p=>{const d=(p.diasSinMov!=null)?p.diasSinMov:(p.dias||0);return d>=umbral+2;}).length;
    resFilas.push({'Grupo':TRANSP_GRUPOS[key].label,'Total':listaFilt.length,'🚨 Escalar':urg,'⚠️ Monitorear':listaFilt.length-urg});
  });
  const wsRes=XLSX.utils.json_to_sheet(resFilas);
  wsRes['!cols']=[28,8,12,14].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,wsRes,'RESUMEN');
  XLSX.writeFile(wb,'Seguimiento_Transportadoras_'+hoy+'.xlsx');
  toast('📤 Exportado: Seguimiento_Transportadoras_'+hoy+'.xlsx');
}


// ── PIN PROVEEDORES ───────────────────────────────────────────────────
const _PIN = '1212';
let _pinVal = '';

function abrirPin(){
  _pinVal = '';
  _pinActualizar();
  document.getElementById('pin-error').textContent = '';
  document.getElementById('pin-modal').classList.add('open');
}

function cerrarPin(){
  document.getElementById('pin-modal').classList.remove('open');
  _pinVal = '';
  _pinActualizar();
}

function pinKey(d){
  if(_pinVal.length >= 4) return;
  _pinVal += d;
  _pinActualizar();
  if(_pinVal.length === 4) setTimeout(_pinVerificar, 120);
}

function pinDel(){
  _pinVal = _pinVal.slice(0,-1);
  _pinActualizar();
  document.getElementById('pin-error').textContent = '';
}

function pinClear(){
  _pinVal = '';
  _pinActualizar();
  document.getElementById('pin-error').textContent = '';
}

function _pinActualizar(){
  for(let i=0;i<4;i++){
    document.getElementById('pd'+i).classList.toggle('filled', i < _pinVal.length);
  }
}

function _pinVerificar(){
  if(_pinVal === _PIN){
    document.getElementById('pin-modal').classList.remove('open');
    _pinVal = '';
    _pinActualizar();
    abrirSeguimiento();
  } else {
    document.getElementById('pin-error').textContent = '❌ PIN incorrecto';
    // Vibrar dots en rojo brevemente
    for(let i=0;i<4;i++){
      const d=document.getElementById('pd'+i);
      d.style.background='#dc2626';
      setTimeout(()=>{d.style.background='';d.classList.remove('filled');},500);
    }
    setTimeout(()=>{ _pinVal=''; _pinActualizar(); },520);
  }
}

// Soporte teclado físico para el PIN
document.addEventListener('keydown', e=>{
  if(!document.getElementById('pin-modal').classList.contains('open')) return;
  if(e.key>='0'&&e.key<='9') pinKey(e.key);
  else if(e.key==='Backspace') pinDel();
  else if(e.key==='Escape') cerrarPin();
});

// ── SEGUIMIENTO A PROVEEDORES ─────────────────────────────────────────

function _segPedidos(){
  // PENDIENTE >24h: estadoKey === 'pendiente_sin_guia' con más de 24h desde fecha orden
  const pend = pedidos.filter(p => p.estadoKey==='pendiente_sin_guia' && (horasDesde(p.fechaOrden)||0) >= 24);
  // GUIA_GENERADA >24h: estadoRaw === 'GUIA_GENERADA' con más de 24h desde fecha guía generada (dias >= 1)
  const guiaGen = pedidos.filter(p => p.estadoRaw==='GUIA_GENERADA' && (p.dias||0) >= 1);
  return {pend, guiaGen};
}

// ── SIN GUÍA ─────────────────────────────────────────────────────────
function _sinGuiaPedidos(){
  return pedidos.filter(p=>p.estadoKey==='pendiente_sin_guia');
}

function abrirSinGuia(){
  const lista = _sinGuiaPedidos();
  const body = document.getElementById('singuia-body');
  body.innerHTML = '';
  if(!lista.length){
    body.innerHTML='<div class="seg-empty">✅ No hay pedidos sin guía</div>';
    document.getElementById('singuia-modal').classList.add('open');
    return;
  }
  const ok   = lista.filter(p=>(horasDesde(p.fechaOrden)||0)<24);
  const warn = lista.filter(p=>{const h=horasDesde(p.fechaOrden)||0;return h>=24&&h<48;});
  const urg  = lista.filter(p=>(horasDesde(p.fechaOrden)||0)>=48);

  // Resumen pills
  const resumen = document.createElement('div');
  resumen.style.cssText='display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;';
  const mkPill=(emoji,label,count,bg,color)=>{
    if(!count)return;
    const d=document.createElement('div');
    d.style.cssText='flex:1;min-width:120px;background:'+bg+';border-radius:10px;padding:12px 16px;';
    d.innerHTML='<div style="font-size:1.5rem;font-weight:800;color:'+color+'">'+count+'</div>'+
      '<div style="font-size:.72rem;font-weight:700;color:'+color+'">'+emoji+' '+label+'</div>';
    resumen.appendChild(d);
  };
  mkPill('🟢','Menos de 1 día',ok.length,'#f3f4f6','#525252');
  mkPill('⚠️','1 día — Revisar',warn.length,'#fefce8','#a16207');
  mkPill('🚨','Más de 2 días — Escalar',urg.length,'#fef2f2','#b91c1c');
  body.appendChild(resumen);

  // Tabla
  const sorted=[...lista].sort((a,b)=>(horasDesde(b.fechaOrden)||0)-(horasDesde(a.fechaOrden)||0));
  const wrap=document.createElement('div');wrap.style.cssText='overflow-x:auto;';
  const tbl=document.createElement('table');tbl.className='seg-table';
  tbl.innerHTML='<thead><tr>'+
    '<th>ID Orden</th><th>Cliente</th><th>Teléfono</th><th>Producto</th><th>Tienda</th><th>Ciudad</th><th>Días sin guía</th><th>Urgencia</th>'+
  '</tr></thead>';
  const tbody=document.createElement('tbody');
  sorted.forEach(p=>{
    const h=horasDesde(p.fechaOrden)||0;
    const urgClass=h>=48?'seg-urg':'seg-warn';
    const urgLabel=h>=48?'🚨 ESCALAR YA':'⚠️ Revisar';
    const tr=document.createElement('tr');
    tr.innerHTML=
      '<td style="font-family:monospace;font-size:.73rem;cursor:pointer;" onclick="copiarTexto(\''+p.dropiId+'\')" title="Copiar">'+p.dropiId+' 📋</td>'+
      '<td style="font-weight:600;color:var(--text-1)">'+esc(p.nombre)+'</td>'+
      '<td style="cursor:pointer" onclick="copiarTel(\''+p.telefono+'\')">'+(p.telefono?p.telefono.replace(/^57/,''):'—')+'</td>'+
      '<td>'+getProductoSimple(p.productos)+'</td>'+
      '<td>'+(p.tienda||'—')+'</td>'+
      '<td>'+(p.ciudad||'—')+'</td>'+
      '<td style="text-align:center;font-weight:700">'+(h<24?'Hoy':Math.floor(h/24)+(Math.floor(h/24)===1?' día':' días'))+'</td>'+
      '<td class="'+urgClass+'">'+urgLabel+'</td>';
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  body.appendChild(wrap);
  document.getElementById('singuia-modal').classList.add('open');
}

function cerrarSinGuia(){
  document.getElementById('singuia-modal').classList.remove('open');
}

function exportarSinGuia(){
  const lista = _sinGuiaPedidos();
  if(!lista.length){toast('No hay pedidos sin guía');return;}
  const minDias=parseInt(document.getElementById('singuia-min-horas').value)||1;
  const filtrada=lista.filter(p=>Math.floor((horasDesde(p.fechaOrden)||0)/24)>=minDias);
  if(!filtrada.length){toast('No hay pedidos con '+minDias+'+ días sin guía');return;}
  const hoy=new Date().toLocaleDateString('es-CO').replace(/\//g,'-');
  const filas=[...filtrada].sort((a,b)=>(horasDesde(b.fechaOrden)||0)-(horasDesde(a.fechaOrden)||0)).map(p=>{
    const h=horasDesde(p.fechaOrden)||0;
    const d=Math.floor(h/24);
    return {
      'ID Orden':p.dropiId,
      'Cliente':p.nombre,
      'Teléfono':p.telefono?p.telefono.replace(/^57/,''):'',
      'Producto':getProductoSimple(p.productos),
      'Producto ID':p.productos&&p.productos[0]?p.productos[0].id||'':'',
      'Tienda':p.tienda||'',
      'Ciudad':p.ciudad||'',
      'Departamento':p.depto||'',
      'Dirección':p.direccion||'',
      'Días sin guía':d,
      'Urgencia':d>=2?'ESCALAR YA':'Revisar',
    };
  });
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.json_to_sheet(filas);
  ws['!cols']=[14,24,13,26,14,14,16,16,32,12,12].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'Sin Guía +'+minDias+'d');
  XLSX.writeFile(wb,'SinGuia_'+hoy+'.xlsx');
  toast('📤 Exportado: SinGuia_'+hoy+'.xlsx');
}

function actualizarBadgeSinGuia(){
  const total=_sinGuiaPedidos().length;
  const badge=document.getElementById('singuia-badge');
  if(badge)badge.textContent=total;
  _actualizarReportesBadge();
}

function actualizarBtnSeguimiento(){
  const {pend, guiaGen} = _segPedidos();
  const total = pend.length + guiaGen.length;
  const badge = document.getElementById('seg-badge');
  if(badge) badge.textContent = total;
  _actualizarReportesBadge();
}

function abrirSeguimiento(){
  const {pend, guiaGen} = _segPedidos();
  const body = document.getElementById('seg-body');
  body.innerHTML = '';

  // ── SECCIÓN 1: PENDIENTES >24h ────────────────────────────────────
  const sec1 = document.createElement('div');
  sec1.className = 'seg-section';
  const t1 = document.createElement('div');
  t1.className = 'seg-section-title';
  t1.style.borderColor = '#dc2626';
  t1.innerHTML = '⏳ Pendientes sin guía — más de 24h <span style="background:var(--danger-soft);color:var(--danger);padding:2px 8px;border-radius:8px;font-size:.72rem;margin-left:6px">'+pend.length+' pedidos</span>';
  sec1.appendChild(t1);

  if(!pend.length){
    const emp = document.createElement('div'); emp.className='seg-empty';
    emp.textContent = '✅ No hay pendientes con más de 24h';
    sec1.appendChild(emp);
  } else {
    // Pills resumen
    const urg = pend.filter(p=>(horasDesde(p.fechaOrden)||0)>=48);
    const warn = pend.filter(p=>{const h=horasDesde(p.fechaOrden)||0;return h>=24&&h<48;});
    const pills = document.createElement('div'); pills.className='seg-resumen-pills';
    if(warn.length) pills.innerHTML += '<div class="seg-pill"><span class="sp-val seg-warn">'+warn.length+'</span><span class="sp-lbl">⚠️ 24–48h</span></div>';
    if(urg.length)  pills.innerHTML += '<div class="seg-pill"><span class="sp-val seg-urg">'+urg.length+'</span><span class="sp-lbl">🚨 +48h — Escalar</span></div>';
    sec1.appendChild(pills);
    // Tabla
    sec1.appendChild(_segTabla(pend, 'pendiente'));
  }
  body.appendChild(sec1);

  // ── SECCIÓN 2: GUIA GENERADA >24h ────────────────────────────────
  const sec2 = document.createElement('div');
  sec2.className = 'seg-section';
  const t2 = document.createElement('div');
  t2.className = 'seg-section-title';
  t2.style.borderColor = '#f59e0b';
  t2.innerHTML = '📦 Guía generada — más de 24h sin movimiento <span style="background:var(--warning-soft);color:var(--warning);padding:2px 8px;border-radius:8px;font-size:.72rem;margin-left:6px">'+guiaGen.length+' pedidos</span>';
  sec2.appendChild(t2);

  if(!guiaGen.length){
    const emp = document.createElement('div'); emp.className='seg-empty';
    emp.textContent = '✅ No hay guías generadas sin movimiento';
    sec2.appendChild(emp);
  } else {
    const urg2 = guiaGen.filter(p=>(p.dias||0)>=3);
    const warn2 = guiaGen.filter(p=>{const d=p.dias||0;return d>=1&&d<3;});
    const pills2 = document.createElement('div'); pills2.className='seg-resumen-pills';
    if(warn2.length) pills2.innerHTML += '<div class="seg-pill"><span class="sp-val seg-warn">'+warn2.length+'</span><span class="sp-lbl">⚠️ 1–2 días</span></div>';
    if(urg2.length)  pills2.innerHTML += '<div class="seg-pill"><span class="sp-val seg-urg">'+urg2.length+'</span><span class="sp-lbl">🚨 +3 días — Escalar</span></div>';
    sec2.appendChild(pills2);
    sec2.appendChild(_segTabla(guiaGen, 'guia_generada'));
  }
  body.appendChild(sec2);

  document.getElementById('seg-modal').classList.add('open');
}

function _segTabla(lista, tipo){
  const wrap = document.createElement('div');
  wrap.style.cssText = 'overflow-x:auto;';
  const tbl = document.createElement('table');
  tbl.className = 'seg-table';
  const esPend = tipo === 'pendiente';
  tbl.innerHTML = '<thead><tr>'+
    '<th>ID Orden</th>'+
    '<th>Cliente</th>'+
    '<th>Teléfono</th>'+
    '<th>Producto</th>'+
    '<th>Tienda</th>'+
    '<th>Ciudad</th>'+
    (esPend ? '<th>Horas sin guía</th><th>Urgencia</th>' : '<th>Días sin mov.</th><th>Urgencia</th>')+
  '</tr></thead>';
  const tbody = document.createElement('tbody');
  // Ordenar más urgentes primero
  const sorted = [...lista].sort((a,b) => {
    const va = esPend ? (horasDesde(a.fechaOrden)||0) : (a.dias||0);
    const vb = esPend ? (horasDesde(b.fechaOrden)||0) : (b.dias||0);
    return vb - va;
  });
  sorted.forEach(p => {
    const val = esPend ? (horasDesde(p.fechaOrden)||0) : (p.dias||0);
    let urgClass, urgLabel;
    if(esPend){
      urgClass = val>=48 ? 'seg-urg' : 'seg-warn';
      urgLabel = val>=48 ? '🚨 ESCALAR YA' : '⚠️ Revisar';
    } else {
      urgClass = val>=3 ? 'seg-urg' : 'seg-warn';
      urgLabel = val>=3 ? '🚨 ESCALAR YA' : '⚠️ Revisar';
    }
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span style="cursor:pointer;font-family:monospace;font-size:.74rem;" onclick="copiarTexto(\''+p.dropiId+'\')" title="Copiar ID">'+p.dropiId+' 📋</span></td>'+
      '<td style="font-weight:600;color:var(--text-1)">'+esc(p.nombre)+'</td>'+
      '<td><span style="cursor:pointer;" onclick="copiarTel(\''+p.telefono+'\')" title="Copiar teléfono">'+(p.telefono?p.telefono.replace(/^57/,''):'—')+'</span></td>'+
      '<td>'+getProductoSimple(p.productos)+'</td>'+
      '<td>'+( p.tienda||'—')+'</td>'+
      '<td>'+(p.ciudad||'—')+'</td>'+
      '<td style="text-align:center;font-weight:700">'+(esPend ? val+'h' : val+'d')+'</td>'+
      '<td class="'+urgClass+'">'+urgLabel+'</td>';
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  return wrap;
}

function cerrarSeguimiento(){
  document.getElementById('seg-modal').classList.remove('open');
}

function exportarSeguimiento(){
  const {pend, guiaGen} = _segPedidos();
  if(!pend.length && !guiaGen.length){ toast('No hay pedidos para escalar'); return; }
  const minDias = parseInt(document.getElementById('seg-min-dias').value)||1;
  const pendFilt = pend.filter(p=>(horasDesde(p.fechaOrden)||0) >= minDias*24);
  const guiaFilt = guiaGen.filter(p=>(p.diasSinMov!=null?p.diasSinMov:(p.dias||0)) >= minDias);
  if(!pendFilt.length && !guiaFilt.length){ toast('No hay pedidos con '+minDias+'+ días para exportar'); return; }
  const hoy = new Date().toLocaleDateString('es-CO').replace(/\//g,'-');
  const wb = XLSX.utils.book_new();

  function _hojaLista(lista, esPend){
    const filas = lista
      .sort((a,b)=>{
        const va=esPend?(horasDesde(a.fechaOrden)||0):(a.dias||0);
        const vb=esPend?(horasDesde(b.fechaOrden)||0):(b.dias||0);
        return vb-va;
      })
      .map(p=>{
        const val = esPend?(horasDesde(p.fechaOrden)||0):(p.dias||0);
        const urg = esPend?(val>=48?'ESCALAR YA':'Revisar'):(val>=3?'ESCALAR YA':'Revisar');
        return {
          'ID Orden': p.dropiId,
          'Cliente': p.nombre,
          'Telefono': p.telefono?p.telefono.replace(/^57/,''):'',
          'Producto': getProductoSimple(p.productos),
          'Producto ID': p.productos&&p.productos[0]?p.productos[0].id||'':'',
          'Número Guía': p.guia||'',
          'Ciudad': p.ciudad||'',
          'Departamento': p.depto||'',
          'Dirección': p.direccion||'',
          'Estado original': p.estadoRaw||'',
          'Fecha último movimiento': p.fechaMov?_fmtFecha(p.fechaMov):'',
          [esPend?'Horas sin guía':'Días sin movimiento']: val,
          'Urgencia': urg,
        };
      });
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [14,24,13,26,14,16,16,16,32,20,16,14,14].map(w=>({wch:w}));
    return ws;
  }

  if(pendFilt.length){
    XLSX.utils.book_append_sheet(wb, _hojaLista(pendFilt, true), 'Pendientes +'+minDias+'d');
  }
  if(guiaFilt.length){
    XLSX.utils.book_append_sheet(wb, _hojaLista(guiaFilt, false), 'Guia Generada +'+minDias+'d');
  }

  // Hoja resumen
  const resFilas = [];
  if(pendFilt.length){
    const urg=pendFilt.filter(p=>(horasDesde(p.fechaOrden)||0)>=48).length;
    const warn=pendFilt.filter(p=>{const h=horasDesde(p.fechaOrden)||0;return h>=24&&h<48;}).length;
    resFilas.push({'Tipo':'Pendiente sin guía','Total':pendFilt.length,'🚨 Escalar (+48h)':urg,'⚠️ Revisar (24-48h)':warn});
  }
  if(guiaFilt.length){
    const urg=guiaFilt.filter(p=>(p.diasSinMov!=null?p.diasSinMov:(p.dias||0))>=3).length;
    const warn=guiaFilt.filter(p=>{const d=p.diasSinMov!=null?p.diasSinMov:(p.dias||0);return d>=1&&d<3;}).length;
    resFilas.push({'Tipo':'Guía generada sin movimiento','Total':guiaFilt.length,'🚨 Escalar (+3 días)':urg,'⚠️ Revisar (1-2 días)':warn});
  }
  const wsRes = XLSX.utils.json_to_sheet(resFilas);
  wsRes['!cols'] = [26,8,18,18].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsRes, 'RESUMEN');

  XLSX.writeFile(wb, 'Seguimiento_Proveedores_'+hoy+'.xlsx');
  toast('📤 Exportado: Seguimiento_Proveedores_'+hoy+'.xlsx');
}

checkSesion();
iniciarTimerInactividad();

// ===== MODE SELECT =====
function _ocultarTodosModos(){
  document.getElementById('upload-zone').style.display='none';
  document.getElementById('gd-panel').style.display='none';
  document.getElementById('cf-panel').style.display='none';
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
function _modoLogistica(){
  _ocultarTodosModos();
  document.getElementById('mode-select-screen').style.display='none';
  // Volver a la pantalla de carga es empezar de cero: si no se limpia, el
  // tablero del archivo anterior queda detrás y se ven sus gestiones y sus
  // contadores mientras se está pidiendo un archivo nuevo. No se pierde nada:
  // checkSesion() ofrece restaurar lo guardado en localStorage.
  pedidos=[]; gestiones={};
  filtroActivo=null; filtrosSeccion={}; filtroTiendas=[];
  document.getElementById('main').style.display='none';
  document.body.classList.remove('data-loaded');
  const _rp=document.getElementById('right-panel');
  if(_rp) _rp.style.display='none';
  document.getElementById('upload-zone').style.display='flex';
  checkSesion();
}
function _modoDiaria(){
  // Gestiones Diarias ahora vive en su propia página (ver plan de split en 3
  // páginas) — navegación real, no toggle interno.
  window._navegandoInterno=true;
  location.href='gestiones-diarias.html';
}
function _modoFinanciero(){
  // Control Financiero ahora vive en su propia página (ver plan de split en 3
  // páginas) — navegación real, no toggle interno. _navegandoInterno evita que
  // el beforeunload de más abajo muestre el diálogo nativo de salida.
  window._navegandoInterno=true;
  location.href='control-financiero.html';
}

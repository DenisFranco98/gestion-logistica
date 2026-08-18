// Prueba los handlers REALES de carritos contra un Firebase simulado en memoria.
// Mismo enfoque que test/endpoints.js: se interceptan los require antes de cargar
// index.js, así corre exactamente lo que se va a desplegar.
//
// Lo que verifica y no se puede comprobar leyendo: que el emparejamiento por
// telefono + id_carrito funcione en los dos sentidos, que un carrito NO cambie de
// mes al recuperarse, que actualizar no pise datos buenos con vacíos, y que la
// autenticación aísle las tiendas.
//
//   node test/carritos.js
const Module = require('module');

let store = {};
const get = p => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
const set = (p, v) => {
  const ks = p.split('/');
  let o = store;
  ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
  o[ks[ks.length - 1]] = v;
};
const fakeAdmin = {
  apps: [{}],
  credential: { cert: () => ({}) },
  initializeApp: () => {},
  database: () => ({
    ref: p => ({
      once: async () => ({ val: () => { const v = get(p); return v === undefined ? null : v; } }),
      set: async v => set(p, v),
      update: async v => set(p, Object.assign({}, get(p) || {}, v))
    })
  })
};
const fakeFunctions = { onRequest: (opts, fn) => (fn || opts) };
const orig = Module._load;
Module._load = function (request) {
  if (request === 'firebase-admin') return fakeAdmin;
  if (request === 'firebase-functions/v2/https') return fakeFunctions;
  return orig.apply(this, arguments);
};

const H = require('../index.js')._handlers;
const postCarrito = H.carritos, postRecuperado = H.recuperado, getExiste = H.carritoExiste;

function llamar(handler, { method = 'POST', body = null, query = {}, headers = {} }) {
  return new Promise(resolve => {
    const req = { method, body, query, headers };
    const res = {
      _status: 200, headersSent: false,
      status(c) { this._status = c; return this; },
      setHeader() {},
      end() { this.headersSent = true; resolve({ status: this._status, json: null }); },
      json(j) { this.headersSent = true; resolve({ status: this._status, json: j }); }
    };
    handler(req, res);
  });
}

let ok = 0, fail = 0;
function eq(actual, esperado, titulo) {
  const bien = JSON.stringify(actual) === JSON.stringify(esperado);
  bien ? ok++ : fail++;
  console.log((bien ? '  ok   ' : '  FALLA') + '  ' + titulo +
    (bien ? '' : '\n           esperaba ' + JSON.stringify(esperado) + ' y dio ' + JSON.stringify(actual)));
}

const KEY = 'clave-secreta-de-prueba';
const HDR = { 'x-api-key': KEY };
const ID = '1344229114102';

// Payload 1: los títulos tal como salen del Excel de datos completos.
const completos = {
  workspace: 'WS-3D-001',
  'NOMBRES': 'María', 'APELLIDOS': 'Gómez Ruiz',
  'DIRECCIÓN Y BARRIO': 'Cra 45 #12-30, Laureles',
  'DEPARTAMENTO': 'Antioquia', 'CIUDAD': 'Medellín',
  'TELÉFONO': '+57 300 111 2233',
  'CANTIDAD': 2,
  'PRECIO TOTAL (SIN PUNTOS NI COMAS)': '89000',
  'NOTA': 'CEPILLO BAMBU',
  id_carrito: ID
};

// Payload 2: los títulos del Excel de recuperados.
const recuperado = {
  workspace: 'WS-3D-001',
  'Fecha': '2026-08-18',
  'Nombre del usuario': 'María Gómez',
  'Numero de telefono': '3001112233',
  'Ciudad': 'Medellín', 'Departamento': 'Antioquia',
  'Producto': 'CEPILLO BAMBU', 'Cantidad': 2, 'Valor': '89000',
  'ESTADO DE LA ORDEN': '',
  id_carrito: ID
};

const CLAVE = '3001112233_' + ID;

(async () => {
  const limpiar = () => {
    store = {
      bot_workspaces: {
        'WS-3D-001': { apiKey: KEY, empresaId: '-Oz9bT', nombre: '3D Company', activo: true },
        'WS-OFF': { apiKey: KEY, empresaId: '-Oz9bT', activo: false },
        'WS-OTRA': { apiKey: 'clave-de-la-otra-tienda', empresaId: '-OtraEmpresa', activo: true }
      }
    };
  };

  console.log('\nAUTENTICACIÓN');
  limpiar();
  eq((await llamar(postCarrito, { body: completos, headers: {} })).status, 401, 'sin API key → 401');
  eq((await llamar(postCarrito, { body: completos, headers: { 'x-api-key': 'otra' } })).status, 401, 'API key incorrecta → 401');
  eq((await llamar(postCarrito, { body: Object.assign({}, completos, { workspace: 'WS-OFF' }), headers: HDR })).status, 403, 'workspace desactivado → 403');
  eq((await llamar(postRecuperado, { body: Object.assign({}, recuperado, { workspace: 'WS-OTRA' }), headers: HDR })).status, 401, 'key de una tienda + workspace de otra → 401');
  eq(get('carritos_bot/-OtraEmpresa'), undefined, 'no escribió nada en la otra tienda');

  console.log('\nDATOS OBLIGATORIOS');
  limpiar();
  const sinId = await llamar(postCarrito, { body: Object.assign({}, completos, { id_carrito: '' }), headers: HDR });
  eq(sinId.status, 400, 'sin id_carrito → 400');
  eq(sinId.json.error.includes('id_carrito'), true, 'y dice que falta el id');
  eq(get('carritos_bot/-Oz9bT'), undefined, 'no guardó nada a medias');
  const sinTel = await llamar(postCarrito, { body: Object.assign({}, completos, { 'TELÉFONO': '' }), headers: HDR });
  eq(sinTel.status, 400, 'sin teléfono → 400');
  eq(sinTel.json.error.includes('telefono'), true, 'y dice que falta el teléfono');

  console.log('\nALTA — payload de DATOS COMPLETOS');
  limpiar();
  const alta = await llamar(postCarrito, { body: completos, headers: HDR });
  eq(alta.json.ok, true, 'responde ok');
  eq(alta.json.duplicado, false, 'no es duplicado');
  eq(alta.json.id, CLAVE, 'la clave es telefono_idCarrito');
  eq(alta.json.estado, 'DATOS COMPLETOS', 'estado por defecto de este payload');
  const mes = alta.json.mes;
  const c = get('carritos_bot/-Oz9bT/' + mes + '/' + CLAVE);
  eq(c.telefono, '3001112233', 'teléfono normalizado');
  eq(c.id_carrito, ID, 'id del carrito guardado como texto');
  eq(c.nombre, 'María Gómez Ruiz', 'nombre armado de NOMBRES + APELLIDOS');
  eq(c.nombres, 'María', 'y las partes por separado');
  eq(c.apellidos, 'Gómez Ruiz', 'apellidos');
  eq(c.direccion, 'Cra 45 #12-30, Laureles', 'dirección y barrio');
  eq(c.producto, 'CEPILLO BAMBU', 'la NOTA se guardó como producto');
  eq(c.cantidad, 2, 'cantidad');
  eq(c.valor, 89000, 'precio total como número');
  eq(!!c._raw, true, 'guarda el payload crudo');
  eq(get('carritos_bot_idx/-Oz9bT/' + CLAVE).estado, 'DATOS COMPLETOS', 'el índice queda escrito');

  console.log('\nEL VALOR SIN COMILLAS (el bug de los miles)');
  limpiar();
  await llamar(postCarrito, { body: Object.assign({}, completos, { 'PRECIO TOTAL (SIN PUNTOS NI COMAS)': 89.990 }), headers: HDR });
  const cv = get('carritos_bot/-Oz9bT/' + (await llamar(getExiste, { method: 'GET', query: { workspace: 'WS-3D-001', telefono: '3001112233', id_carrito: ID }, headers: HDR })).json.mes + '/' + CLAVE);
  eq(cv.valor, 89990, '89.990 sin comillas se reconstruye a 89990, no 89');

  console.log('\nRECUPERACIÓN — el mismo carrito se ACTUALIZA');
  limpiar();
  const a1 = await llamar(postCarrito, { body: completos, headers: HDR });
  const r1 = await llamar(postRecuperado, { body: recuperado, headers: HDR });
  eq(r1.json.duplicado, true, 'reconoce que el carrito ya existía');
  eq(r1.json.id, CLAVE, 'misma clave');
  eq(r1.json.estado_actualizado, true, 'cambió el estado');
  eq(r1.json.estado, 'CARRITO RECUPERADO', 'a CARRITO RECUPERADO');
  eq(r1.json.mes, a1.json.mes, 'NO cambió de mes');
  eq(Object.keys(get('carritos_bot/-Oz9bT/' + a1.json.mes)).length, 1, 'sigue habiendo UN solo carrito');
  const c2 = get('carritos_bot/-Oz9bT/' + a1.json.mes + '/' + CLAVE);
  eq(c2.estado, 'CARRITO RECUPERADO', 'el estado se actualizó');
  eq(c2.historial_estado.length, 1, 'quedó el historial');
  eq([c2.historial_estado[0].de, c2.historial_estado[0].a], ['DATOS COMPLETOS', 'CARRITO RECUPERADO'], 'de → a');
  eq(c2.direccion, 'Cra 45 #12-30, Laureles', 'la dirección NO se perdió (el payload 2 no la trae)');
  eq(c2.apellidos, 'Gómez Ruiz', 'los apellidos tampoco');
  eq(c2.fecha, '20260818', 'la fecha del payload de recuperación sí se guardó');
  eq(get('carritos_bot_idx/-Oz9bT/' + CLAVE).estado, 'CARRITO RECUPERADO', 'el índice también');

  console.log('\nRECUPERACIÓN DE UN CARRITO QUE NUNCA SE VIO ANTES');
  limpiar();
  const solo = await llamar(postRecuperado, { body: recuperado, headers: HDR });
  eq(solo.json.duplicado, false, 'entra como nuevo');
  eq(solo.json.estado, 'CARRITO RECUPERADO', 'y queda como recuperado');
  const cs = get('carritos_bot/-Oz9bT/2026-08/' + CLAVE);
  eq(cs.nombre, 'María Gómez', 'con el nombre del payload');
  // Estos cuatro faltaban en el test y por eso pasó a producción un fallo real:
  // el flujo mandaba "Ciudad"/"Departamento"/"Cantidad" capitalizados, la lista
  // solo tenía 'ciudad' y 'CIUDAD', y esos campos se perdían sin que nada avisara.
  eq(cs.ciudad, 'Medellín', 'CIUDAD guardada');
  eq(cs.departamento, 'Antioquia', 'DEPARTAMENTO guardado');
  eq(cs.cantidad, 2, 'CANTIDAD guardada');
  eq(cs.valor, 89000, 'VALOR guardado');

  console.log('\nLOS NOMBRES DE CAMPO NO DISTINGUEN MAYÚSCULAS');
  // El payload EXACTO que mandó ChateaPro en la prueba de Frankaro, sacado del
  // _raw del carrito que quedó mal guardado.
  limpiar();
  const real = {
    workspace: 'WS-3D-001',
    'Cantidad': 2, 'Ciudad': 'Medellín', 'Departamento': 'Antioquia',
    'ESTADO DE LA ORDEN': '', 'Fecha': '2026-08-18',
    'Nombre del usuario': 'María Gómez', 'Numero de telefono': '3001112233',
    'Producto': 'CEPILLO BAMBU', 'Valor': '89000', id_carrito: ID
  };
  await llamar(postRecuperado, { body: real, headers: HDR });
  const cr = get('carritos_bot/-Oz9bT/2026-08/' + CLAVE);
  eq(cr.ciudad, 'Medellín', 'con el payload REAL: ciudad');
  eq(cr.departamento, 'Antioquia', 'con el payload REAL: departamento');
  eq(cr.cantidad, 2, 'con el payload REAL: cantidad');
  eq(cr.producto, 'CEPILLO BAMBU', 'con el payload REAL: producto');
  eq(cr.valor, 89000, 'con el payload REAL: valor');
  eq(cr.telefono, '3001112233', 'con el payload REAL: teléfono');
  // Y da igual cómo se escriban: tres variantes del mismo campo dan lo mismo.
  limpiar();
  await llamar(postCarrito, { body: { workspace:'WS-3D-001', id_carrito:'A1', 'TELÉFONO':'3001112233', 'ciudad':'Cali', 'DePaRtAmEnTo':'Valle', 'Cantidad':'5' }, headers: HDR });
  const cm = get('carritos_bot/-Oz9bT/' + Object.keys(get('carritos_bot/-Oz9bT'))[0] + '/3001112233_A1');
  eq([cm.ciudad, cm.departamento, cm.cantidad], ['Cali', 'Valle', 5], 'minúsculas, MAYÚSCULAS y MeZcLaDo dan lo mismo');

  console.log('\nEL ESTADO QUE MANDA EL BOT SE RESPETA');
  limpiar();
  await llamar(postCarrito, { body: completos, headers: HDR });
  const conEstado = await llamar(postRecuperado, { body: Object.assign({}, recuperado, { 'ESTADO DE LA ORDEN': 'CONFIRMADO' }), headers: HDR });
  eq(conEstado.json.estado, 'CONFIRMADO', 'usa el estado del payload, no el por defecto');

  console.log('\nDOS CARRITOS DEL MISMO CLIENTE');
  limpiar();
  const p1 = await llamar(postCarrito, { body: completos, headers: HDR });
  const otroId = '9988776655443';
  const p2 = await llamar(postCarrito, { body: Object.assign({}, completos, { id_carrito: otroId, 'NOTA': 'TERMO ACERO' }), headers: HDR });
  eq(p2.json.duplicado, false, 'el segundo id entra como carrito nuevo');
  eq(Object.keys(get('carritos_bot/-Oz9bT/' + p1.json.mes)).length, 2, 'hay dos carritos del mismo teléfono');
  // Y recuperar uno no toca al otro.
  await llamar(postRecuperado, { body: recuperado, headers: HDR });
  eq(get('carritos_bot/-Oz9bT/' + p1.json.mes + '/' + CLAVE).estado, 'CARRITO RECUPERADO', 'se recuperó el primero');
  eq(get('carritos_bot/-Oz9bT/' + p1.json.mes + '/3001112233_' + otroId).estado, 'DATOS COMPLETOS', 'el otro sigue igual');

  console.log('\nREINTENTO (el bot manda dos veces lo mismo)');
  limpiar();
  const re1 = await llamar(postCarrito, { body: completos, headers: HDR });
  const re2 = await llamar(postCarrito, { body: completos, headers: HDR });
  eq(re2.status, 200, 'responde 200, no error');
  eq(re2.json.duplicado, true, 'avisa que ya estaba');
  eq(re2.json.estado_actualizado, false, 'no cambió el estado');
  eq(Object.keys(get('carritos_bot/-Oz9bT/' + re1.json.mes)).length, 1, 'sigue habiendo UNO');

  console.log('\nCONSULTA DE EXISTENCIA');
  limpiar();
  await llamar(postCarrito, { body: completos, headers: HDR });
  const ex1 = await llamar(getExiste, { method: 'GET', query: { workspace: 'WS-3D-001', telefono: '3001112233', id_carrito: ID }, headers: HDR });
  eq(ex1.json.existe, true, 'encuentra el carrito');
  eq(ex1.json.estado, 'DATOS COMPLETOS', 'devuelve el estado');
  const ex2 = await llamar(getExiste, { method: 'GET', query: { workspace: 'WS-3D-001', telefono: '3001112233', id_carrito: '0000' }, headers: HDR });
  eq(ex2.json.existe, false, 'otro id del mismo cliente → no existe');
  const ex3 = await llamar(getExiste, { method: 'POST', body: { workspace: 'WS-3D-001', telefono: '+57 300 111 2233', id_carrito: ID }, headers: HDR });
  eq(ex3.json.existe, true, 'lo encuentra con el teléfono escrito distinto');
  const ex4 = await llamar(getExiste, { method: 'GET', query: { workspace: 'WS-OTRA', telefono: '3001112233', id_carrito: ID }, headers: HDR });
  eq(ex4.status, 401, 'no se puede consultar en otra tienda');

  console.log('\n' + (fail ? 'FALLARON ' + fail + ' de ' + (ok + fail) : 'Pasaron las ' + ok) + '\n');
  process.exit(fail ? 1 : 0);
})();

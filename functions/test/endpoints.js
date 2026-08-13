// Prueba los handlers REALES de index.js contra un Firebase simulado en memoria.
//
// No se toca el código de producción: se interceptan los require de
// 'firebase-admin' y 'firebase-functions' antes de cargarlo, así corre exactamente lo que se va a
// desplegar. Verifica lo que no se puede comprobar leyendo: que un reintento no
// duplique, que un cambio de estado se registre, y que la autenticación corte.
//
//   node test/endpoints.js
const Module = require('module');

// ── Firebase en memoria ──────────────────────────────────────────────────
let store = {};
const get = p => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
const set = (p, v) => {
  const ks = p.split('/');
  let o = store;
  ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
  o[ks[ks.length - 1]] = v;
};
const fakeAdmin = {
  apps: [{}],                       // ya inicializado: evita pedir credenciales
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
// firebase-functions tampoco hace falta instalarlo: onRequest solo tiene que
// devolver el handler para que el test lo llame directo.
const fakeFunctions = { onRequest: (opts, fn) => (fn || opts) };
const orig = Module._load;
Module._load = function (request) {
  if (request === 'firebase-admin') return fakeAdmin;
  if (request === 'firebase-functions/v2/https') return fakeFunctions;
  return orig.apply(this, arguments);
};

const { ventas: postVenta, existe: getExiste } = require('../index.js')._handlers;

// ── Utilidades ───────────────────────────────────────────────────────────
function llamar(handler, { method = 'POST', body = null, query = {}, headers = {} }) {
  return new Promise(resolve => {
    const req = { method, body, query, headers };
    const res = {
      _status: 200,
      status(c) { this._status = c; return this; },
      setHeader() {},
      end() { resolve({ status: this._status, json: null }); },
      json(j) { resolve({ status: this._status, json: j }); }
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
const H = { 'x-api-key': KEY };
const base = {
  workspace: 'WS-3D-001', tienda: '3D Company',
  telefono: '+57 300 111 2233', fecha_compra: '2026-08-13',
  fecha_registro: '2026-08-13 09:12', nombre: 'Cliente Prueba',
  ciudad: 'Medellín', departamento: 'Antioquia',
  order: '2 CEPILLOS DE BAMBU', producto: 'CEPILLO BAMBU',
  cantidad: 2, valor: '89.000', estado_orden: 'CONFIRMADO',
  id_anuncio: '120312345678'
};

(async () => {
  store = {
    bot_workspaces: {
      'WS-3D-001': { apiKey: KEY, empresaId: '-Oz9bT', nombre: '3D Company', activo: true },
      'WS-OFF': { apiKey: KEY, empresaId: '-Oz9bT', activo: false }
    }
  };

  console.log('\nAUTENTICACIÓN');
  eq((await llamar(postVenta, { body: base, headers: {} })).status, 401, 'sin API key → 401');
  eq((await llamar(postVenta, { body: base, headers: { 'x-api-key': 'otra' } })).status, 401, 'API key incorrecta → 401');
  eq((await llamar(postVenta, { body: Object.assign({}, base, { workspace: 'NO-EXISTE' }), headers: H })).status, 401, 'workspace inexistente → 401');
  eq((await llamar(postVenta, { body: Object.assign({}, base, { workspace: 'WS-OFF' }), headers: H })).status, 403, 'workspace desactivado → 403');
  const conBearer = await llamar(postVenta, { body: base, headers: { authorization: 'Bearer ' + KEY } });
  eq(conBearer.status, 200, 'la key también se acepta como Bearer');

  console.log('\nAISLAMIENTO ENTRE TIENDAS — una key no puede escribir en otra tienda');
  store.bot_workspaces['WS-OTRA'] = { apiKey: 'clave-de-la-otra-tienda', empresaId: '-OtraEmpresa', activo: true };
  store.ventas_bot = {}; store.ventas_bot_idx = {};
  // La key de 3D Company apuntando al workspace de la otra tienda.
  const cruzado = await llamar(postVenta, { body: Object.assign({}, base, { workspace: 'WS-OTRA' }), headers: H });
  eq(cruzado.status, 401, 'key de la tienda A + workspace de la tienda B → 401');
  eq(get('ventas_bot/-OtraEmpresa'), undefined, 'no escribió nada en la otra tienda');
  // Y al revés.
  const cruzado2 = await llamar(postVenta, { body: base, headers: { 'x-api-key': 'clave-de-la-otra-tienda' } });
  eq(cruzado2.status, 401, 'key de la tienda B + workspace de la tienda A → 401');
  // La consulta tampoco deja espiar otra tienda.
  const espiar = await llamar(getExiste, { method: 'GET', query: { workspace: 'WS-OTRA', telefono: '3001112233', fecha_compra: '2026-08-13' }, headers: H });
  eq(espiar.status, 401, 'tampoco se puede consultar la existencia en otra tienda');
  // Cada key escribe solo en SU empresaId, aunque el payload diga otra cosa.
  const conTiendaFalsa = await llamar(postVenta, { body: Object.assign({}, base, { tienda: 'Tienda Ajena', empresaId: '-OtraEmpresa' }), headers: H });
  eq(conTiendaFalsa.status, 200, 'el payload puede mentir sobre la tienda...');
  eq(!!get('ventas_bot/-Oz9bT/2026-08/3001112233_20260813'), true, '...pero la venta cae en la tienda de la key');
  eq(get('ventas_bot/-OtraEmpresa'), undefined, 'y no en la que decía el payload');

  console.log('\nDATOS OBLIGATORIOS');
  store.ventas_bot = {}; store.ventas_bot_idx = {};
  const sinTel = await llamar(postVenta, { body: Object.assign({}, base, { telefono: '' }), headers: H });
  eq(sinTel.status, 400, 'sin teléfono → 400');
  eq(sinTel.json.error.includes('telefono'), true, 'y dice cuál falta');
  const malaFecha = await llamar(postVenta, { body: Object.assign({}, base, { fecha_compra: 'ayer' }), headers: H });
  eq(malaFecha.json.error.includes('fecha_compra'), true, 'fecha inválida → dice fecha_compra');

  console.log('\nALTA');
  store.ventas_bot = {}; store.ventas_bot_idx = {};
  const alta = await llamar(postVenta, { body: base, headers: H });
  eq(alta.json.ok, true, 'responde ok');
  eq(alta.json.duplicado, false, 'no es duplicado');
  eq(alta.json.id, '3001112233_20260813', 'la clave es telefono_fecha normalizados');
  eq(alta.json.mes, '2026-08', 'el mes sale de la fecha de compra');
  const v = get('ventas_bot/-Oz9bT/2026-08/3001112233_20260813');
  eq(v.valor, 89000, '"89.000" se guardó como número');
  eq(v.cantidad, 2, 'cantidad');
  eq(v.telefono, '3001112233', 'teléfono normalizado');
  eq(v.fecha_compra, '20260813', 'fecha normalizada');
  eq(v.producto, 'CEPILLO BAMBU', 'producto');
  eq(v.order, '2 CEPILLOS DE BAMBU', 'order es la orden completa');
  eq(!!v._raw, true, 'guarda el payload crudo');
  eq(get('ventas_bot_idx/-Oz9bT/3001112233_20260813').estado, 'CONFIRMADO', 'el índice queda escrito');

  console.log('\nCONSULTA DE EXISTENCIA');
  const ex1 = await llamar(getExiste, { method: 'GET', query: { workspace: 'WS-3D-001', telefono: '3001112233', fecha_compra: '2026-08-13' }, headers: H });
  eq(ex1.json.existe, true, 'encuentra la venta que se acaba de crear');
  eq(ex1.json.estado, 'CONFIRMADO', 'devuelve el estado');
  const ex2 = await llamar(getExiste, { method: 'GET', query: { workspace: 'WS-3D-001', telefono: '3009998877', fecha_compra: '2026-08-13' }, headers: H });
  eq(ex2.json.existe, false, 'otro cliente el mismo día → no existe');
  const ex3 = await llamar(getExiste, { method: 'POST', body: { workspace: 'WS-3D-001', telefono: '57 300 111 2233', fecha_compra: '13/08/2026' }, headers: H });
  eq(ex3.json.existe, true, 'lo encuentra con el teléfono y la fecha escritos distinto');

  console.log('\nREINTENTO (el bot manda dos veces lo mismo)');
  const re = await llamar(postVenta, { body: base, headers: H });
  eq(re.status, 200, 'responde 200, no error');
  eq(re.json.duplicado, true, 'avisa que ya estaba');
  eq(re.json.estado_actualizado, false, 'no cambió el estado');
  eq(Object.keys(get('ventas_bot/-Oz9bT/2026-08')).length, 1, 'sigue habiendo UNA sola venta');

  console.log('\nCAMBIO DE ESTADO');
  const cambio = await llamar(postVenta, { body: Object.assign({}, base, { estado_orden: 'CANCELADO', nombre: 'INTENTO DE PISAR' }), headers: H });
  eq(cambio.json.estado_actualizado, true, 'detecta el cambio');
  eq(cambio.json.estado, 'CANCELADO', 'devuelve el estado nuevo');
  const v2 = get('ventas_bot/-Oz9bT/2026-08/3001112233_20260813');
  eq(v2.estado_orden, 'CANCELADO', 'el estado se actualizó');
  eq(v2.nombre, 'Cliente Prueba', 'el resto de los campos NO se pisó');
  eq(v2.historial_estado.length, 1, 'quedó el historial del cambio');
  eq([v2.historial_estado[0].de, v2.historial_estado[0].a], ['CONFIRMADO', 'CANCELADO'], 'de → a');
  eq(get('ventas_bot_idx/-Oz9bT/3001112233_20260813').estado, 'CANCELADO', 'el índice también se actualizó');

  console.log('\nOTRA VENTA DEL MISMO CLIENTE, OTRO DÍA');
  const otra = await llamar(postVenta, { body: Object.assign({}, base, { fecha_compra: '2026-08-14' }), headers: H });
  eq(otra.json.duplicado, false, 'entra como venta nueva');
  eq(Object.keys(get('ventas_bot/-Oz9bT/2026-08')).length, 2, 'ahora hay dos ventas en el mes');

  console.log('\n' + (fail ? 'FALLARON ' + fail + ' de ' + (ok + fail) : 'Pasaron las ' + ok) + '\n');
  process.exit(fail ? 1 : 0);
})();

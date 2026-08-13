// Núcleo compartido por los endpoints. Acá vive todo lo que no es HTTP:
// conexión a Firebase, autenticación del bot, y la normalización de teléfono y
// fecha de la que depende la clave de cada venta.
// ── Firebase ──────────────────────────────────────────────────────────────
// Se usa el Admin SDK con una cuenta de servicio, no las claves del navegador:
// este proceso escribe del lado del servidor y no pasa por las reglas de
// seguridad, así que la credencial NUNCA puede estar en el código. Va en la
// variable de entorno FIREBASE_SERVICE_ACCOUNT (el JSON completo de la cuenta
// de servicio, en una sola línea).
//
// El require va acá dentro y no arriba a propósito: así este módulo se puede
// cargar (y testear la normalización, que es lo que decide la clave de cada
// venta) sin necesidad de la dependencia ni de credenciales. De paso, una
// petición que falla antes de tocar la base no paga el costo de cargar el SDK.
//
// Vercel reutiliza el proceso entre invocaciones: initializeApp explota si se
// llama dos veces, por eso el guard sobre admin.apps.length.
function db() {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('Falta la variable FIREBASE_SERVICE_ACCOUNT');
    let cred;
    try { cred = JSON.parse(raw); }
    catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT no es un JSON válido'); }
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      databaseURL: process.env.FIREBASE_DB_URL
    });
  }
  return require('firebase-admin').database();
}

// ── Normalización de la clave ────────────────────────────────────────────
// La identidad de una venta es teléfono + fecha de compra (decidido con el
// usuario el 2026-08-13). Las dos partes tienen que normalizarse o el mismo
// pedido generaría claves distintas según cómo lo escriba el bot, y la
// validación de duplicados no serviría de nada.

// Se queda con los últimos 10 dígitos: el bot puede mandar el mismo número como
// "3001112233", "+57 300 111 2233" o "57-3001112233", y los tres son el mismo
// cliente. 10 es el largo de un celular colombiano sin indicativo de país.
function normTelefono(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (!d) return '';
  return d.length > 10 ? d.slice(-10) : d;
}

// Devuelve YYYYMMDD. Acepta lo que suelen mandar los bots: ISO (2026-08-13,
// con o sin hora), dd/mm/aaaa y dd-mm-aaaa. Se prioriza el formato local
// (día primero) porque es lo que usa el equipo; ISO se detecta por el guion
// después de 4 dígitos, que es inconfundible.
//
// Nunca se usa new Date(texto) a secas: interpreta "13/08/2026" como inválido y
// "2026-08-13" como UTC, y en Colombia (UTC-5) eso corre la fecha un día.
function normFecha(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // 2026-08-13[ ...]
  if (m) return m[1] + p2(m[2]) + p2(m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);          // 13/08/2026
  if (m) return m[3] + p2(m[2]) + p2(m[1]);
  return '';
}
function p2(n) { return String(n).padStart(2, '0'); }

// Clave del registro y del índice. Sin teléfono o sin fecha no hay identidad
// posible: se devuelve vacío y el endpoint responde 400 en vez de inventar una.
function claveVenta(telefono, fechaCompra) {
  const t = normTelefono(telefono);
  const f = normFecha(fechaCompra);
  return (t && f) ? t + '_' + f : '';
}

// Mes YYYY-MM al que pertenece la venta, sacado de la fecha de COMPRA. Es como
// se organiza todo lo demás en REDKING (gestiones, novedades, anticipos), para
// que la pestaña nueva no sea la excepción.
function mesDe(fechaCompra) {
  const f = normFecha(fechaCompra);
  return f ? f.slice(0, 4) + '-' + f.slice(4, 6) : '';
}

// ── Autenticación del bot ────────────────────────────────────────────────
// El WORKSPACE dice a qué tienda va la venta, pero no prueba quién la manda:
// viaja en el payload y cualquiera que lo descubra podría inyectar ventas. Por
// eso además se exige una API key, que se compara contra la guardada para ese
// workspace.
//
// La key se acepta por header (lo correcto) o por query string, porque no todas
// las plataformas dejan configurar headers. En query queda escrita en los logs
// del proveedor, así que se prefiere el header cuando se puede.
function leerApiKey(req) {
  const h = req.headers || {};
  const auth = String(h.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (h['x-api-key']) return String(h['x-api-key']).trim();
  const q = (req.query || {});
  if (q.api_key) return String(q.api_key).trim();
  if (q.key) return String(q.key).trim();
  return '';
}

// Resuelve el workspace contra bot_workspaces/{workspace} y valida la key.
// Devuelve { ok, empresaId, nombre, error, status }.
//
// La comparación de la key es en tiempo constante: comparar con === filtra el
// secreto por el tiempo de respuesta, carácter a carácter.
async function autenticar(req, workspace) {
  const ws = String(workspace || '').trim();
  if (!ws) return { ok: false, status: 400, error: 'Falta workspace' };
  const key = leerApiKey(req);
  if (!key) return { ok: false, status: 401, error: 'Falta la API key' };

  const snap = await db().ref('bot_workspaces/' + fbKey(ws)).once('value');
  const cfg = snap.val();
  // Mismo mensaje para "no existe" y "key incorrecta": distinguirlos permitiría
  // adivinar qué workspaces existen probando nombres.
  if (!cfg || !cfg.apiKey) return { ok: false, status: 401, error: 'Workspace o API key inválidos' };
  if (!igualSeguro(String(cfg.apiKey), key)) return { ok: false, status: 401, error: 'Workspace o API key inválidos' };
  if (cfg.activo === false) return { ok: false, status: 403, error: 'Workspace desactivado' };
  if (!cfg.empresaId) return { ok: false, status: 500, error: 'El workspace no tiene tienda asignada' };

  return { ok: true, empresaId: cfg.empresaId, nombre: cfg.nombre || '' };
}

function igualSeguro(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

// Firebase no admite . # $ [ ] / en las claves de un nodo.
function fbKey(s) { return String(s == null ? '' : s).replace(/[.#$[\]/]/g, '_'); }

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Api-Key');
}

// El body llega parseado en Vercel, pero si el bot manda el JSON sin
// Content-Type correcto llega como string. Se cubren los dos casos.
function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}

// Los bots suelen mandar el importe como "89.000" o "$ 89.000". Se guarda como
// número o el total de la tabla no podría sumarse.
function aNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10);
  return isFinite(n) ? n : 0;
}

module.exports = {
  db, cors, body, autenticar, fbKey,
  normTelefono, normFecha, claveVenta, mesDe, aNumero
};

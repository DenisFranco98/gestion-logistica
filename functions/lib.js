// Núcleo compartido por los endpoints. Acá vive todo lo que no es HTTP:
// conexión a Firebase, autenticación del bot, y la normalización de teléfono y
// fecha de la que depende la clave de cada venta.
// ── Firebase ──────────────────────────────────────────────────────────────
// Corriendo dentro de Cloud Functions, initializeApp() sin argumentos toma las
// credenciales del propio proyecto: no hace falta cuenta de servicio, ni clave
// privada que guardar y rotar, ni variables de entorno. Es la ventaja concreta
// de estar en el mismo proyecto que la base.
//
// Escribe con permisos de administrador, así que NO pasa por las reglas de
// seguridad: la validación de quién puede escribir qué la hace este código, no
// las reglas. Por eso las reglas dejan ventas_bot en solo lectura.
//
// El require va acá dentro y no arriba a propósito: así este módulo se puede
// cargar (y testear la normalización, que es lo que decide la clave de cada
// venta) sin necesidad de la dependencia. De paso, una petición que falla antes
// de tocar la base no paga el costo de cargar el SDK.
//
// La instancia se reutiliza entre invocaciones en caliente: initializeApp
// explota si se llama dos veces, por eso el guard sobre admin.apps.length.
function db() {
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
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

// ── Identidad de un CARRITO ──────────────────────────────────────────────
// Un carrito se identifica por teléfono + id de carrito, no por teléfono +
// fecha como las ventas. La razón: el id lo genera ChateaPro y es la identidad
// REAL del carrito, así que el mismo cliente puede tener varios carritos abiertos
// sin que se pisen, y "recuperar" uno es encontrarlo exacto sin depender de
// cuándo llegue el aviso.
//
// El id se trata como TEXTO aunque parezca un número (1344229114102): con 13
// dígitos ya roza el límite donde JSON.parse empieza a perder precisión, y un id
// redondeado apuntaría a otro carrito. Se le quita todo lo que no sea dígito o
// guión por si el bot lo manda con espacios o prefijos.
function normIdCarrito(v) {
  return String(v == null ? '' : v).trim().replace(/[^\w-]/g, '');
}

// Sin teléfono o sin id no hay identidad posible: se devuelve vacío y el endpoint
// responde 400 en vez de inventar una clave que después nadie podría emparejar.
function claveCarrito(telefono, idCarrito) {
  const t = normTelefono(telefono);
  const i = normIdCarrito(idCarrito);
  return (t && i) ? t + '_' + i : '';
}

// Fecha de HOY en formato YYYYMMDD, hora de Colombia. La usa el payload de datos
// completos, que no trae fecha: hace falta una para saber en qué mes guardar el
// carrito. Se calcula sobre UTC-5 y no con toISOString() porque en UTC, a partir
// de las 19:00 en Colombia, ya es el día siguiente — el mismo error que documenta
// _hoyLocal() en el front.
function hoyColombia() {
  const ahora = new Date(Date.now() - 5 * 3600 * 1000);
  return ahora.getUTCFullYear() + p2(ahora.getUTCMonth() + 1) + p2(ahora.getUTCDate());
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

// ── Leer un campo del payload ────────────────────────────────────────────
// Busca el primer nombre que venga con algo, SIN distinguir mayúsculas.
//
// Lo de ignorar mayúsculas no es comodidad: es lo que evita el bug que ya pasó.
// El flujo mandaba "Ciudad", "Departamento" y "Cantidad" capitalizados; la lista
// tenía 'ciudad' y 'CIUDAD' pero no 'Ciudad', y esos tres campos se perdieron en
// silencio —el carrito se guardaba igual, solo que sin ciudad—. Con una
// comparación exacta hay que acertar la variante de cada campo, y la primera vez
// que no se acierta el dato desaparece sin que nada avise.
//
// Se ignoran también los espacios de sobra, porque un título copiado de un Excel
// suele traerlos.
function tomar(d, ...nombres) {
  if (!d || typeof d !== 'object') return '';
  // Índice minúsculas → valor, armado una sola vez por llamada.
  const idx = {};
  for (const k of Object.keys(d)) {
    const norm = String(k).trim().toLowerCase();
    // El primero gana: si el payload trae "ciudad" y "CIUDAD", se respeta el orden
    // en que llegaron en vez de que dependa de cuál se recorra último.
    if (!(norm in idx)) idx[norm] = d[k];
  }
  for (const n of nombres) {
    const v = idx[String(n).trim().toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

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

// Importes en pesos colombianos. Se guarda como número entero o el total de la
// tabla no podría sumarse.
//
// El caso difícil es cuando el bot manda el importe SIN comillas en el JSON:
// "valor": 99.990 no es noventa y nueve mil, es el decimal 99,99 — el punto de
// miles se lee como coma decimal y el valor queda dividido por mil. Pasó de
// verdad: 43 de las primeras 109 ventas entraron así.
//
// Como texto no hay ambigüedad ("99.990" se limpia y da 99990), así que lo ideal
// es que el bot lo mande entre comillas. Pero no se puede depender de eso, y un
// importe mal grabado no se nota hasta que los totales no cuadran.
//
// La regla: un precio de venta menor a $1.000 no existe en este negocio —los
// productos van de decenas de miles para arriba—, así que un valor por debajo de
// ese umbral es un separador de miles mal interpretado y se reconstruye.
// Si alguna vez se vende algo de menos de $1.000, este umbral hay que revisarlo.
const VALOR_MINIMO_REAL = 1000;

// Entero pelado, sin nada de lo anterior. Es para CANTIDADES, que no llevan
// separador de miles y donde 2 significa 2: pasarlas por aNumero las convertía
// en 2000. Se separan a propósito — la corrección de miles solo tiene sentido
// en importes.
function aEntero(v) {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v) : 0;
  const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10);
  return isFinite(n) ? n : 0;
}

function aNumero(v) {
  // Texto: se queda con los dígitos. "99.990", "$ 99.990" y "99990" dan lo mismo.
  if (typeof v !== 'number') {
    const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10);
    return isFinite(n) ? n : 0;
  }
  if (!isFinite(v) || v <= 0) return 0;
  // Número: si quedó por debajo del mínimo, el punto era de miles.
  //   99.99 -> 99990 · 69.9 -> 69900 · 117 -> 117000
  if (v < VALOR_MINIMO_REAL) return Math.round(v * 1000);
  // Por encima del umbral se respeta lo que llegó; los centavos se redondean
  // porque el resto de la app trabaja con enteros.
  return Math.round(v);
}

module.exports = {
  db, cors, body, autenticar, fbKey, tomar,
  normTelefono, normFecha, claveVenta, mesDe, aNumero, aEntero,
  normIdCarrito, claveCarrito, hoyColombia
};

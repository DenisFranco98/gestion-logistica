// Config y helpers compartidos entre popup.js y content.js.
// DB_URL, API_KEY y la normalización de clave deben coincidir exactamente con index.html
// (ver _fbApp / _gdKey) para que la extensión lea/escriba en la misma base y ruta que el panel.
const DB_URL = 'https://gestion-logistica-86fd7-default-rtdb.firebaseio.com';
const API_KEY = 'AIzaSyA9Ae7Zt7TwKsg7h7TOD9PTfeEaYhkoLVE';
const STORAGE_KEY = 'antChateaproTienda'; // { nombre, key }
const AUTH_KEY = 'antChateaproAuth'; // { idToken, refreshToken, expiresAt, email, uid }

function gdKey(s) {
  return (s || '').trim().toLowerCase()
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u').replace(/ñ/g, 'n')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || '_';
}

function mesActual() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

// ── Autenticación (Firebase requiere sesión — auth != null — para leer/escribir) ──
async function loginConCorreo(email, password) {
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(mensajeErrorAuth(data));
  const auth = {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000,
    email: data.email,
    uid: data.localId
  };
  await new Promise(resolve => chrome.storage.local.set({ [AUTH_KEY]: auth }, resolve));
  return auth;
}

function mensajeErrorAuth(data) {
  const code = data && data.error && data.error.message;
  if (code === 'EMAIL_NOT_FOUND' || code === 'INVALID_LOGIN_CREDENTIALS' || code === 'INVALID_PASSWORD') return 'Correo o contraseña incorrectos';
  if (code === 'USER_DISABLED') return 'Cuenta deshabilitada';
  return 'No se pudo iniciar sesión' + (code ? ' (' + code + ')' : '');
}

async function refrescarToken(auth) {
  const resp = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Sesión expirada');
  const nuevo = {
    ...auth,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000
  };
  await new Promise(resolve => chrome.storage.local.set({ [AUTH_KEY]: nuevo }, resolve));
  return nuevo;
}

async function getAuthValido() {
  const res = await new Promise(resolve => chrome.storage.local.get(AUTH_KEY, resolve));
  let auth = res[AUTH_KEY];
  if (!auth) return null;
  if (Date.now() > auth.expiresAt - 60000) {
    try { auth = await refrescarToken(auth); }
    catch (e) { await new Promise(resolve => chrome.storage.local.remove(AUTH_KEY, resolve)); return null; }
  }
  return auth;
}

function cerrarSesion() {
  return new Promise(resolve => chrome.storage.local.remove(AUTH_KEY, resolve));
}

// ── Datos ────────────────────────────────────────────────────────────────
async function leerDB(path, auth) {
  const resp = await fetch(`${DB_URL}/${path}.json?auth=${auth.idToken}`);
  const data = await resp.json();
  if (!resp.ok) throw new Error((data && data.error) || 'No se pudo leer ' + path);
  return data;
}

function escribirDB(path, auth, valor) {
  return fetch(`${DB_URL}/${path}.json?auth=${auth.idToken}`, { method: 'PUT', body: JSON.stringify(valor) })
    .then(async resp => {
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'No se pudo guardar ' + path);
      return data;
    });
}

function agregarDB(path, auth, valor) {
  return fetch(`${DB_URL}/${path}.json?auth=${auth.idToken}`, { method: 'POST', body: JSON.stringify(valor) })
    .then(async resp => {
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || 'No se pudo guardar ' + path);
      return data.name; // id generado por Firebase (push key)
    });
}

function borrarDB(path, auth) {
  return fetch(`${DB_URL}/${path}.json?auth=${auth.idToken}`, { method: 'DELETE' })
    .then(resp => { if (!resp.ok) throw new Error('No se pudo borrar ' + path); });
}

// ── FRENO CONTRA GESTIONES EN LOTE ───────────────────────────────────────
// Portado de _puedeRegistrarGestion() en shared/app-shared.js, con los mismos
// números. Ninguna persona registra decenas de gestiones en un par de segundos:
// cuando eso pasa es un bucle acreditándole trabajo a quien tiene la pantalla
// abierta (en el panel llegó a sumarle 102 gestiones en el mismo segundo a una
// asesora que no había gestionado nada).
//
// La extensión escribe los MISMOS contadores que el panel, así que necesita la
// misma red: si algún día algo llama en bucle a guardarEvidencia, se topa con
// esto en vez de ensuciar meses de datos en silencio. No frena el trabajo real,
// el límite está muy por encima del ritmo humano posible.
const GEST_MAX = 12;        // gestiones permitidas...
const GEST_VENTANA = 6000;  // ...en esta ventana de tiempo (ms)
let _gestSellos = [];

// Llamar SIEMPRE justo antes de crear una evidencia con resultado
// (solucionada/devuelta), que es lo que suma al día.
function puedeRegistrarGestion(motivo) {
  const ahora = Date.now();
  _gestSellos = _gestSellos.filter(t => ahora - t < GEST_VENTANA);
  if (_gestSellos.length >= GEST_MAX) {
    console.error('[FRENO gestiones] bloqueadas por ritmo imposible. Intentos en los últimos ' +
      (GEST_VENTANA / 1000) + 's: ' + (_gestSellos.length + 1) + (motivo ? ' · origen: ' + motivo : '') +
      '. Si esto se repite, hay un bucle registrando gestiones que nadie hizo.');
    return false;
  }
  _gestSellos.push(ahora);
  return true;
}

// Solo las tiendas asociadas a la cuenta logueada (igual que hace index.html):
// admin → admin_empresas/{uid}; dueño/asesor → user_tiendas/{uid}; si ninguna
// existe, la cuenta puede traer el nombre de tienda directo en users/{uid}.tienda.
// Devuelve [{id, nombre}]: el id (empresaId) es lo que se usa como clave de
// datos. Antes se devolvía solo el nombre y se derivaba la clave con gdKey(),
// pero los nombres se repiten entre negocios distintos y eso hacía que dos
// tiendas homónimas compartieran ruta.
async function listarTiendasDelUsuario(auth) {
  const [admin, user, userTiendas, adminEmpresas] = await Promise.all([
    leerDB('admins/' + auth.uid, auth),
    leerDB('users/' + auth.uid, auth),
    leerDB('user_tiendas/' + auth.uid, auth),
    leerDB('admin_empresas/' + auth.uid, auth)
  ]);

  const empresaIds = Object.keys(admin ? (adminEmpresas || {}) : (userTiendas || {}));

  if (!empresaIds.length) {
    // Cuenta sin empresa asociada: solo queda el nombre suelto, sin id.
    return user && user.tienda ? [{ id: '', nombre: user.tienda }] : [];
  }

  const empresas = await leerDB('empresas', auth) || {};
  return empresaIds
    .map(id => ({ id, nombre: (empresas[id] && empresas[id].nombre) || '' }))
    .filter(t => t.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Perfil users/{uid}: trae .asesor (nombre a mostrar como "Asesor encargado") y .rol.
async function obtenerPerfilUsuario(auth) {
  return await leerDB('users/' + auth.uid, auth) || {};
}

function getTiendaGuardada() {
  return new Promise(resolve => {
    chrome.storage.sync.get(STORAGE_KEY, res => resolve(res[STORAGE_KEY] || null));
  });
}

// key = empresaId: es la clave con la que el panel guarda novedades, anticipos
// y gestiones diarias. keyLegacy queda solo como referencia de dónde vivían los
// datos cuando la clave se derivaba del nombre.
function guardarTienda(id, nombre) {
  const tienda = { id, nombre, key: id || gdKey(nombre), keyLegacy: gdKey(nombre) };
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEY]: tienda }, () => resolve(tienda));
  });
}

// La tienda pudo guardarse con el formato viejo ({nombre, key:slug}, sin id),
// que apunta a una ruta que el panel ya no lee. Si el nombre identifica sin
// ambigüedad una tienda de la cuenta, se reescribe con su empresaId; si hay
// varias homónimas no se adivina y se pide reelegirla desde el popup.
async function resolverTiendaGuardada(auth) {
  const t = await getTiendaGuardada();
  if (!t || t.id) return t;
  if (!auth) return t;
  try {
    const tiendas = await listarTiendasDelUsuario(auth);
    const iguales = tiendas.filter(x => gdKey(x.nombre) === gdKey(t.nombre) && x.id);
    if (iguales.length === 1) return await guardarTienda(iguales[0].id, iguales[0].nombre);
    return Object.assign({}, t, { requiereReseleccion: true });
  } catch (e) {
    return t;
  }
}

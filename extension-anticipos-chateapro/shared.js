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
// Solo las tiendas asociadas a la cuenta logueada (igual que hace index.html):
// admin → admin_empresas/{uid}; dueño/asesor → user_tiendas/{uid}; si ninguna
// existe, la cuenta puede traer el nombre de tienda directo en users/{uid}.tienda.
async function listarTiendasDelUsuario(auth) {
  const q = id => `${DB_URL}/${id}.json?auth=${auth.idToken}`;
  const leer = async id => {
    const resp = await fetch(q(id));
    const data = await resp.json();
    if (!resp.ok) throw new Error((data && data.error) || 'No se pudo leer ' + id);
    return data;
  };

  const [admin, user, userTiendas, adminEmpresas] = await Promise.all([
    leer('admins/' + auth.uid),
    leer('users/' + auth.uid),
    leer('user_tiendas/' + auth.uid),
    leer('admin_empresas/' + auth.uid)
  ]);

  const empresaIds = Object.keys(admin ? (adminEmpresas || {}) : (userTiendas || {}));

  if (!empresaIds.length) {
    return user && user.tienda ? [user.tienda] : [];
  }

  const empresas = await leer('empresas') || {};
  return empresaIds
    .map(id => (empresas[id] && empresas[id].nombre) || '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function getTiendaGuardada() {
  return new Promise(resolve => {
    chrome.storage.sync.get(STORAGE_KEY, res => resolve(res[STORAGE_KEY] || null));
  });
}

function guardarTienda(nombre) {
  const tienda = { nombre, key: gdKey(nombre) };
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEY]: tienda }, () => resolve(tienda));
  });
}

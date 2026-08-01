const loginSection = document.getElementById('loginSection');
const tiendaSection = document.getElementById('tiendaSection');
const loginStatus = document.getElementById('loginStatus');
const sesionActualEl = document.getElementById('sesionActual');
const actualEl = document.getElementById('actual');
const selEl = document.getElementById('tiendaSel');
const manualEl = document.getElementById('tiendaManual');
const statusEl = document.getElementById('status');
let _tiendasCache = []; // [{id, nombre}] de la cuenta, para resolver id al guardar

function pintarActual(tienda) {
  if (tienda && tienda.nombre) {
    actualEl.textContent = 'Tienda activa: ' + tienda.nombre;
    actualEl.classList.add('set');
  } else {
    actualEl.textContent = 'Sin tienda configurada todavía';
    actualEl.classList.remove('set');
  }
}

async function mostrarSesion(auth) {
  loginSection.style.display = 'none';
  tiendaSection.style.display = 'block';
  sesionActualEl.textContent = 'Sesión: ' + auth.email;

  // resolverTiendaGuardada reescribe con su empresaId las tiendas guardadas en
  // el formato viejo (clave derivada del nombre), que apuntan a una ruta que el
  // panel ya no lee.
  const tienda = await resolverTiendaGuardada(auth);
  pintarActual(tienda);
  if (tienda && tienda.requiereReseleccion) {
    statusEl.textContent = 'Tienes varias tiendas con este nombre: vuelve a elegirla en la lista para dejarla bien vinculada.';
    statusEl.className = 'err';
  }

  try {
    _tiendasCache = await listarTiendasDelUsuario(auth);
    // value = empresaId (clave real de datos), texto = nombre visible
    selEl.innerHTML = _tiendasCache.length
      ? '<option value="">Selecciona una tienda...</option>' + _tiendasCache.map(t => `<option value="${t.id}">${t.nombre.replace(/</g, '&lt;')}</option>`).join('')
      : '<option value="">Tu cuenta no tiene tiendas asociadas</option>';
    if (tienda && tienda.id && _tiendasCache.some(t => t.id === tienda.id)) selEl.value = tienda.id;
  } catch (e) {
    selEl.innerHTML = '<option value="">No se pudo cargar la lista</option>';
    statusEl.textContent = e.message;
    statusEl.className = 'err';
  }
}

function mostrarLogin() {
  loginSection.style.display = 'block';
  tiendaSection.style.display = 'none';
}

async function init() {
  const auth = await getAuthValido();
  if (auth) mostrarSesion(auth);
  else mostrarLogin();
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (!email || !pass) { loginStatus.textContent = 'Ingresa correo y contraseña.'; return; }
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Ingresando...';
  loginStatus.textContent = '';
  try {
    const auth = await loginConCorreo(email, pass);
    await mostrarSesion(auth);
  } catch (e) {
    loginStatus.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Iniciar sesión';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await cerrarSesion();
  document.getElementById('loginPass').value = '';
  mostrarLogin();
});

selEl.addEventListener('change', () => {
  if (selEl.value) manualEl.value = '';
});

document.getElementById('guardarBtn').addEventListener('click', async () => {
  const manual = manualEl.value.trim();
  let elegida = null;

  if (manual) {
    // El nombre escrito a mano ya no basta: la clave de datos es el empresaId,
    // así que tiene que corresponder a una tienda real de la cuenta.
    const iguales = _tiendasCache.filter(t => gdKey(t.nombre) === gdKey(manual));
    if (!iguales.length) {
      statusEl.textContent = 'No encontramos "' + manual + '" entre tus tiendas. Elígela de la lista.';
      statusEl.className = 'err';
      return;
    }
    if (iguales.length > 1) {
      statusEl.textContent = 'Tienes varias tiendas con ese nombre. Elígela de la lista para saber cuál es.';
      statusEl.className = 'err';
      return;
    }
    elegida = iguales[0];
  } else if (selEl.value) {
    elegida = _tiendasCache.find(t => t.id === selEl.value) || null;
  }

  if (!elegida) {
    statusEl.textContent = 'Elige una tienda de la lista.';
    statusEl.className = 'err';
    return;
  }

  const tienda = await guardarTienda(elegida.id, elegida.nombre);
  pintarActual(tienda);
  statusEl.textContent = 'Guardado ✓';
  statusEl.className = 'ok';
});

chrome.storage.onChanged.addListener(changes => {
  if (changes[AUTH_KEY] && changes[AUTH_KEY].newValue) mostrarSesion(changes[AUTH_KEY].newValue);
  else if (changes[AUTH_KEY] && !changes[AUTH_KEY].newValue) mostrarLogin();
});

init();

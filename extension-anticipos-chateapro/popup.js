const loginSection = document.getElementById('loginSection');
const tiendaSection = document.getElementById('tiendaSection');
const loginStatus = document.getElementById('loginStatus');
const sesionActualEl = document.getElementById('sesionActual');
const actualEl = document.getElementById('actual');
const selEl = document.getElementById('tiendaSel');
const manualEl = document.getElementById('tiendaManual');
const statusEl = document.getElementById('status');

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

  const tienda = await getTiendaGuardada();
  pintarActual(tienda);

  try {
    const tiendas = await listarTiendasDelUsuario(auth);
    selEl.innerHTML = tiendas.length
      ? '<option value="">Selecciona una tienda...</option>' + tiendas.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('')
      : '<option value="">Tu cuenta no tiene tiendas asociadas</option>';
    if (tienda && tiendas.includes(tienda.nombre)) selEl.value = tienda.nombre;
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
  const nombre = (manualEl.value.trim() || selEl.value).trim();
  if (!nombre) {
    statusEl.textContent = 'Elige o escribe el nombre de la tienda.';
    statusEl.className = 'err';
    return;
  }
  const tienda = await guardarTienda(nombre);
  pintarActual(tienda);
  statusEl.textContent = 'Guardado ✓';
  statusEl.className = 'ok';
});

chrome.storage.onChanged.addListener(changes => {
  if (changes[AUTH_KEY] && changes[AUTH_KEY].newValue) mostrarSesion(changes[AUTH_KEY].newValue);
  else if (changes[AUTH_KEY] && !changes[AUTH_KEY].newValue) mostrarLogin();
});

init();

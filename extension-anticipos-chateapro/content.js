(function () {
  let tienda = null; // { nombre, key }
  let comprobanteData = null; // dataURL ya redimensionado

  // ── Botón flotante ──────────────────────────────────────────────────────
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'antcp-toggle';
  toggleBtn.type = 'button';
  toggleBtn.title = 'Cargar anticipo';
  toggleBtn.textContent = '💰';
  document.documentElement.appendChild(toggleBtn);

  const panel = document.createElement('div');
  panel.id = 'antcp-panel';
  panel.innerHTML = `
    <div id="antcp-head">
      <span id="antcp-title">💰 Nuevo anticipo</span>
      <button id="antcp-close" type="button" title="Cerrar">✕</button>
    </div>
    <div id="antcp-body">
      <div id="antcp-sesion"></div>
      <div id="antcp-tienda"></div>

      <div id="antcp-drop" title="Arrastra aquí la imagen del comprobante, o haz clic para elegir un archivo">
        <span id="antcp-drop-txt">📎 Arrastra aquí el comprobante de pago</span>
        <img id="antcp-preview" style="display:none;">
        <button id="antcp-drop-clear" type="button" style="display:none;" title="Quitar imagen">✕</button>
      </div>
      <input type="file" id="antcp-file" accept="image/*" style="display:none;">

      <label>Cliente</label>
      <input type="text" id="antcp-cliente" placeholder="Arrastra el nombre o escríbelo">

      <label>Teléfono</label>
      <input type="text" id="antcp-telefono" placeholder="Arrastra el número o escríbelo">

      <label>Motivo del anticipo</label>
      <textarea id="antcp-motivo" placeholder="¿Por qué se registra este anticipo?" rows="2"></textarea>

      <div id="antcp-msg"></div>
      <button id="antcp-guardar" type="button">Guardar anticipo</button>
      <div id="antcp-brand">REDKING · Gestión Logística</div>
    </div>
  `;
  document.documentElement.appendChild(panel);

  const $ = sel => panel.querySelector(sel);
  const dropZone = $('#antcp-drop');
  const preview = $('#antcp-preview');
  const dropTxt = $('#antcp-drop-txt');
  const clearBtn = $('#antcp-drop-clear');
  const fileInput = $('#antcp-file');
  const clienteInp = $('#antcp-cliente');
  const telefonoInp = $('#antcp-telefono');
  const motivoInp = $('#antcp-motivo');
  const msgEl = $('#antcp-msg');
  const guardarBtn = $('#antcp-guardar');
  const tiendaEl = $('#antcp-tienda');
  const sesionEl = $('#antcp-sesion');

  function pintarTienda() {
    if (tienda && tienda.nombre) {
      tiendaEl.textContent = 'Tienda: ' + tienda.nombre;
      tiendaEl.classList.remove('warn');
    } else {
      tiendaEl.textContent = 'Configura la tienda desde el ícono 💰 de la extensión (barra de Chrome)';
      tiendaEl.classList.add('warn');
    }
  }

  function pintarSesion(auth) {
    if (auth && auth.email) {
      sesionEl.textContent = 'Sesión: ' + auth.email;
      sesionEl.classList.remove('warn');
    } else {
      sesionEl.textContent = 'Sin sesión — inicia sesión desde el ícono 💰 de la extensión';
      sesionEl.classList.add('warn');
    }
  }

  getTiendaGuardada().then(t => { tienda = t; pintarTienda(); });
  getAuthValido().then(pintarSesion);
  chrome.storage.onChanged.addListener(changes => {
    if (changes[STORAGE_KEY]) { tienda = changes[STORAGE_KEY].newValue; pintarTienda(); }
    if (changes[AUTH_KEY]) pintarSesion(changes[AUTH_KEY].newValue);
  });

  // ── Abrir / cerrar panel ────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) getAuthValido().then(pintarSesion);
  });
  $('#antcp-close').addEventListener('click', () => panel.classList.remove('open'));

  // ── Arrastrar el panel por su cabecera ─────────────────────────────────
  (function makeDraggable() {
    const head = $('#antcp-head');
    let dragging = false, offX = 0, offY = 0;
    head.addEventListener('mousedown', e => {
      if (e.target.closest('#antcp-close')) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = Math.max(0, e.clientX - offX) + 'px';
      panel.style.top = Math.max(0, e.clientY - offY) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  })();

  // ── Utilidades de imagen ────────────────────────────────────────────────
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('No se pudo leer el archivo'));
      r.readAsDataURL(blob);
    });
  }

  function resizeDataUrl(dataUrl, maxW, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.src = dataUrl;
    });
  }

  function fetchImageViaBackground(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'ANTCP_FETCH_IMAGE', url }, resp => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!resp || !resp.ok) { reject(new Error((resp && resp.error) || 'No se pudo descargar la imagen')); return; }
        resolve(resp.dataUrl);
      });
    });
  }

  async function extraerComprobante(dataTransfer) {
    if (dataTransfer.files && dataTransfer.files.length) {
      const file = [...dataTransfer.files].find(f => f.type.startsWith('image/'));
      if (file) {
        const raw = await blobToDataURL(file);
        return resizeDataUrl(raw, 800, 0.72);
      }
    }
    let src = '';
    const html = dataTransfer.getData('text/html');
    if (html) {
      const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) src = m[1];
    }
    if (!src) src = dataTransfer.getData('text/uri-list') || '';
    if (!src) src = dataTransfer.getData('text/plain') || '';
    src = src.trim();
    if (!src) return null;
    if (src.startsWith('data:')) return resizeDataUrl(src, 800, 0.72);
    if (/^https?:\/\//i.test(src)) {
      // El fetch cross-origin lo hace el service worker (background.js) porque el
      // fetch de un content script queda sujeto al CORS del sitio donde corre.
      const raw = await fetchImageViaBackground(src);
      return resizeDataUrl(raw, 800, 0.72);
    }
    return null;
  }

  function setComprobante(dataUrl) {
    comprobanteData = dataUrl;
    preview.src = dataUrl;
    preview.style.display = 'block';
    dropTxt.style.display = 'none';
    clearBtn.style.display = 'flex';
  }

  function limpiarComprobante() {
    comprobanteData = null;
    preview.src = '';
    preview.style.display = 'none';
    dropTxt.style.display = 'block';
    clearBtn.style.display = 'none';
    fileInput.value = '';
  }

  clearBtn.addEventListener('click', e => { e.stopPropagation(); limpiarComprobante(); });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const raw = await blobToDataURL(file);
      setComprobante(await resizeDataUrl(raw, 800, 0.72));
    } catch (e) {
      mostrarMsg(e.message, true);
    }
  });

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('over');
    try {
      dropTxt.textContent = '⏳ Procesando imagen...';
      dropTxt.style.display = comprobanteData ? 'none' : 'block';
      const dataUrl = await extraerComprobante(e.dataTransfer);
      if (!dataUrl) throw new Error('No se reconoció ninguna imagen en lo que arrastraste');
      setComprobante(dataUrl);
    } catch (err) {
      dropTxt.textContent = '📎 Arrastra aquí el comprobante de pago';
      mostrarMsg(err.message, true);
    }
  });

  // ── Drop de texto (nombre / teléfono) ──────────────────────────────────
  function habilitarDropTexto(input, transform) {
    input.addEventListener('dragover', e => { e.preventDefault(); input.classList.add('over'); });
    input.addEventListener('dragleave', () => input.classList.remove('over'));
    input.addEventListener('drop', e => {
      e.preventDefault();
      input.classList.remove('over');
      const texto = (e.dataTransfer.getData('text/plain') || '').trim();
      if (texto) input.value = transform ? transform(texto) : texto;
    });
  }
  habilitarDropTexto(clienteInp);
  habilitarDropTexto(telefonoInp, texto => {
    const soloDigitos = texto.replace(/[^\d+]/g, '');
    return soloDigitos.length >= 7 ? soloDigitos : texto;
  });

  // ── Guardar ─────────────────────────────────────────────────────────────
  function mostrarMsg(texto, esError) {
    msgEl.textContent = texto;
    msgEl.className = esError ? 'err' : 'ok';
  }

  function fechaHoyCO() {
    return new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  guardarBtn.addEventListener('click', async () => {
    if (!tienda || !tienda.key) { mostrarMsg('Configura primero la tienda desde el ícono de la extensión.', true); return; }
    const cliente = clienteInp.value.trim();
    const telefono = telefonoInp.value.trim();
    const motivo = motivoInp.value.trim();
    if (!cliente && !telefono) { mostrarMsg('Ingresa al menos el cliente o el teléfono.', true); return; }
    if (!motivo) { mostrarMsg('Escribe el motivo del anticipo.', true); return; }

    guardarBtn.disabled = true;
    guardarBtn.textContent = 'Guardando...';
    try {
      const auth = await getAuthValido();
      pintarSesion(auth);
      if (!auth) throw new Error('Inicia sesión desde el ícono 💰 de la extensión.');
      const registro = {
        fecha: fechaHoyCO(),
        cliente, telefono,
        transporte: '', motivo, producto: '',
        entrega: false,
        comprobante: comprobanteData || '',
        ts: Date.now()
      };
      const url = `${DB_URL}/anticipos/${tienda.key}/${mesActual()}/con.json?auth=${auth.idToken}`;
      const resp = await fetch(url, { method: 'POST', body: JSON.stringify(registro) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) throw new Error(data.error || ('Error al guardar (' + resp.status + ')'));
      mostrarMsg('✓ Anticipo guardado en Guías con Anticipo', false);
      clienteInp.value = ''; telefonoInp.value = ''; motivoInp.value = '';
      limpiarComprobante();
    } catch (err) {
      mostrarMsg(err.message, true);
    } finally {
      guardarBtn.disabled = false;
      guardarBtn.textContent = 'Guardar anticipo';
    }
  });
})();

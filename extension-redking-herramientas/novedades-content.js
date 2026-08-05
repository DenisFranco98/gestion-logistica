(function () {
  let tienda = null; // { nombre, key }
  let auth = null;
  let asesorNombre = '';
  let guiaActual = '';
  let matches = []; // novedades existentes para la guía buscada (todas las tiendas/meses), más reciente primero
  let target = null; // match elegido para agregar evidencia, o null si se va a crear una novedad nueva
  let modo = 'nueva'; // 'nueva' | 'evidencia'
  let estadoActivo = 'solucionada';
  let tipoActivo = 'img';

  // ── Botón flotante ──────────────────────────────────────────────────────
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'nvcp-toggle';
  toggleBtn.type = 'button';
  toggleBtn.title = 'Novedades — Gestión Logística';
  toggleBtn.textContent = '📝';
  document.documentElement.appendChild(toggleBtn);

  const panel = document.createElement('div');
  panel.id = 'nvcp-panel';
  panel.innerHTML = `
    <div id="nvcp-head">
      <span id="nvcp-title">📝 Novedades</span>
      <button id="nvcp-close" type="button" title="Cerrar">✕</button>
    </div>
    <div id="nvcp-body">
      <div id="nvcp-sesion"></div>
      <div id="nvcp-tienda"></div>

      <!-- Pantalla 1: buscar guía -->
      <div id="nvcp-screen-buscar">
        <label>Número de guía</label>
        <input type="text" id="nvcp-guia-input" placeholder="Ej: 64108612927">
        <button id="nvcp-buscar-btn" type="button">Buscar historial</button>
        <div id="nvcp-buscar-msg"></div>
      </div>

      <!-- Pantalla 2: historial encontrado -->
      <div id="nvcp-screen-resultado" style="display:none;">
        <button id="nvcp-volver-btn" type="button" class="nvcp-link-btn">← Cambiar guía</button>
        <div id="nvcp-guia-lbl"></div>
        <div id="nvcp-historial"></div>
        <button id="nvcp-nueva-btn" type="button"></button>
      </div>

      <!-- Pantalla 3: formulario (igual al modal "Nueva Novedad" de la plataforma) -->
      <div id="nvcp-screen-form" style="display:none;">
        <div id="nvcp-form-title"></div>

        <div id="nvcp-meta">
          <label>Fecha de la novedad</label>
          <input type="date" id="nvcp-m-fecha" class="nvcp-input">
          <label>Número de guía</label>
          <input type="text" id="nvcp-m-guia" class="nvcp-input">
          <label>Asesor encargado</label>
          <input type="text" id="nvcp-m-asesor" class="nvcp-input">
          <hr class="nvcp-hr">
        </div>

        <div id="nvcp-sol-label" class="nvcp-section-lbl">Solución 1 (opcional)</div>

        <label>Fecha de la gestión</label>
        <input type="date" id="nvcp-sol-fecha" class="nvcp-input">

        <label style="margin-top:10px;">Modo de solución</label>
        <select id="nvcp-sol-modo" class="nvcp-input">
          <option value="">Selecciona...</option>
          <option value="Llamada Talkyria">Llamada Talkyria</option>
          <option value="Solución Chateapro">Solución Chateapro</option>
          <option value="Solución Llamada asesor">Solución Llamada asesor</option>
          <option value="Contacto Wpp asesor">Contacto Wpp asesor</option>
          <option value="Otro">Otro</option>
        </select>

        <label style="margin-top:10px;">Resultado de la gestión</label>
        <div class="nvcp-tipo-row">
          <button type="button" class="nvcp-tipo-btn active" id="nvcp-estado-sol">✅ Novedad solucionada</button>
          <button type="button" class="nvcp-tipo-btn" id="nvcp-estado-dev">📦 Producto devuelto</button>
        </div>

        <div id="nvcp-tipo-wrap">
          <div class="nvcp-tipo-row">
            <button type="button" class="nvcp-tipo-btn active" id="nvcp-tipo-img">📷 Imagen de evidencia</button>
            <button type="button" class="nvcp-tipo-btn" id="nvcp-tipo-txt">✍️ Texto descriptivo</button>
          </div>
        </div>
        <div id="nvcp-img-wrap">
          <div id="nvcp-img-preview-wrap" style="display:none;">
            <img id="nvcp-img-preview" class="nvcp-ev-img">
            <button type="button" id="nvcp-img-quitar" class="nvcp-link-btn">✕ Quitar imagen</button>
          </div>
          <div id="nvcp-img-opciones">
            <button type="button" id="nvcp-capturar-btn" class="nvcp-btn-capture">📸 Capturar pantalla</button>
            <input type="file" id="nvcp-m-img" accept="image/*" class="nvcp-input" style="margin-top:6px;">
          </div>
          <div class="nvcp-hint-sm">Se comprimirá automáticamente · Tamaño máximo recomendado: 5 MB</div>
        </div>
        <div id="nvcp-txt-wrap" style="display:none;">
          <textarea id="nvcp-m-txt" class="nvcp-input" rows="3" placeholder="Describe la gestión realizada..."></textarea>
        </div>

        <div id="nvcp-form-msg"></div>
        <div class="nvcp-form-actions">
          <button type="button" id="nvcp-cancelar-btn" class="nvcp-btn-secondary">Cancelar</button>
          <button type="button" id="nvcp-guardar-btn" class="nvcp-btn-primary">Guardar</button>
        </div>
      </div>

      <div id="nvcp-brand">REDKING · Gestión Logística</div>
    </div>
  `;
  document.documentElement.appendChild(panel);

  const $ = sel => panel.querySelector(sel);
  const sesionEl = $('#nvcp-sesion');
  const tiendaEl = $('#nvcp-tienda');
  const screenBuscar = $('#nvcp-screen-buscar');
  const screenResultado = $('#nvcp-screen-resultado');
  const screenForm = $('#nvcp-screen-form');
  const guiaInput = $('#nvcp-guia-input');
  const buscarMsg = $('#nvcp-buscar-msg');
  const guiaLbl = $('#nvcp-guia-lbl');
  const historialEl = $('#nvcp-historial');
  const nuevaBtn = $('#nvcp-nueva-btn');
  const formTitle = $('#nvcp-form-title');
  const metaEl = $('#nvcp-meta');
  const solLabelEl = $('#nvcp-sol-label');
  const mFecha = $('#nvcp-m-fecha');
  const mGuia = $('#nvcp-m-guia');
  const mAsesor = $('#nvcp-m-asesor');
  const solFecha = $('#nvcp-sol-fecha');
  const solModo = $('#nvcp-sol-modo');
  const tipoWrap = $('#nvcp-tipo-wrap');
  const imgWrap = $('#nvcp-img-wrap');
  const txtWrap = $('#nvcp-txt-wrap');
  const mImg = $('#nvcp-m-img');
  const mTxt = $('#nvcp-m-txt');
  const formMsg = $('#nvcp-form-msg');
  const guardarBtn = $('#nvcp-guardar-btn');
  const imgPreviewWrap = $('#nvcp-img-preview-wrap');
  const imgPreview = $('#nvcp-img-preview');
  const imgOpciones = $('#nvcp-img-opciones');
  const capturarBtn = $('#nvcp-capturar-btn');
  const imgQuitarBtn = $('#nvcp-img-quitar');
  let imgEvidenciaData = null; // dataURL ya redimensionado, de archivo subido o de captura de pantalla

  function pintarTienda() {
    if (tienda && tienda.requiereReseleccion) {
      tiendaEl.textContent = 'Tienda "' + tienda.nombre + '" sin vincular — vuelve a elegirla desde el ícono 🧰';
      tiendaEl.classList.add('warn');
    } else if (tienda && tienda.nombre) {
      tiendaEl.textContent = 'Tienda: ' + tienda.nombre;
      tiendaEl.classList.remove('warn');
    } else {
      tiendaEl.textContent = 'Configura la tienda desde el ícono 🧰 de la extensión';
      tiendaEl.classList.add('warn');
    }
  }

  function pintarSesion(a) {
    auth = a;
    if (auth && auth.email) {
      sesionEl.textContent = 'Sesión: ' + auth.email;
      sesionEl.classList.remove('warn');
      obtenerPerfilUsuario(auth).then(p => { asesorNombre = p.asesor || auth.email; }).catch(() => { asesorNombre = auth.email; });
    } else {
      sesionEl.textContent = 'Sin sesión — inicia sesión desde el ícono 🧰 de la extensión';
      sesionEl.classList.add('warn');
    }
  }

  // resolverTiendaGuardada (no getTiendaGuardada) para reescribir con su
  // empresaId las tiendas guardadas con la clave vieja: escribir bajo esa clave
  // dejaba las novedades en una ruta que el panel ya no lee.
  getAuthValido().then(auth => {
    pintarSesion(auth);
    return resolverTiendaGuardada(auth);
  }).then(t => { tienda = t; pintarTienda(); });
  chrome.storage.onChanged.addListener(changes => {
    if (changes[STORAGE_KEY]) { tienda = changes[STORAGE_KEY].newValue; pintarTienda(); }
    if (changes[AUTH_KEY]) pintarSesion(changes[AUTH_KEY].newValue);
  });

  // ── Abrir / cerrar panel ────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) getAuthValido().then(pintarSesion);
  });
  $('#nvcp-close').addEventListener('click', () => panel.classList.remove('open'));

  // ── Arrastrar el panel por su cabecera ─────────────────────────────────
  (function makeDraggable() {
    const head = $('#nvcp-head');
    let dragging = false, offX = 0, offY = 0;
    head.addEventListener('mousedown', e => {
      if (e.target.closest('#nvcp-close')) return;
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

  // ── Utilidades ──────────────────────────────────────────────────────────
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

  // ── Imagen de evidencia: archivo subido o captura de pantalla ──────────
  function mostrarPreviewImg() {
    imgPreview.src = imgEvidenciaData;
    imgPreviewWrap.style.display = 'block';
    imgOpciones.style.display = 'none';
  }

  function ocultarPreviewImg() {
    imgEvidenciaData = null;
    imgPreview.src = '';
    imgPreviewWrap.style.display = 'none';
    imgOpciones.style.display = 'block';
    mImg.value = '';
  }

  imgQuitarBtn.addEventListener('click', ocultarPreviewImg);

  mImg.addEventListener('change', async () => {
    const file = mImg.files[0];
    if (!file) return;
    try {
      const raw = await blobToDataURL(file);
      imgEvidenciaData = await resizeDataUrl(raw, 800, 0.72);
      mostrarPreviewImg();
    } catch (e) {
      formMsg.textContent = e.message;
      formMsg.className = 'err';
    }
  });

  function cargarImagen(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la captura'));
      img.src = src;
    });
  }

  function capturarTabVisible() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'NVCP_CAPTURE' }, resp => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!resp || !resp.ok) { reject(new Error((resp && resp.error) || 'No se pudo capturar la pantalla')); return; }
        resolve(resp.dataUrl);
      });
    });
  }

  async function capturarRegion(rect) {
    try {
      const dataUrl = await capturarTabVisible();
      const img = await cargarImagen(dataUrl);
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.getContext('2d').drawImage(
        img,
        Math.round(rect.left * dpr), Math.round(rect.top * dpr), canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height
      );
      imgEvidenciaData = await resizeDataUrl(canvas.toDataURL('image/png'), 800, 0.72);
      mostrarPreviewImg();
    } catch (e) {
      formMsg.textContent = e.message;
      formMsg.className = 'err';
    }
  }

  // Overlay de selección de área: oculta el panel (para que no salga en la
  // captura), deja arrastrar un recuadro sobre la página y recorta esa zona.
  function iniciarCaptura() {
    const estabaAbierto = panel.classList.contains('open');
    panel.classList.remove('open');

    const overlay = document.createElement('div');
    overlay.id = 'nvcp-capture-overlay';
    const box = document.createElement('div');
    box.id = 'nvcp-capture-box';
    const hint = document.createElement('div');
    hint.id = 'nvcp-capture-hint';
    hint.textContent = 'Arrastra para seleccionar el área a capturar · Esc para cancelar';
    overlay.appendChild(box);
    overlay.appendChild(hint);
    document.documentElement.appendChild(overlay);

    let startX = 0, startY = 0, seleccionando = false;

    function onDown(e) {
      seleccionando = true;
      startX = e.clientX; startY = e.clientY;
      box.style.left = startX + 'px'; box.style.top = startY + 'px';
      box.style.width = '0px'; box.style.height = '0px';
      box.style.display = 'block';
    }
    function onMove(e) {
      if (!seleccionando) return;
      const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.width = w + 'px'; box.style.height = h + 'px';
    }
    function onUp() {
      if (!seleccionando) return;
      seleccionando = false;
      const rect = box.getBoundingClientRect();
      cleanup();
      if (rect.width < 6 || rect.height < 6) { if (estabaAbierto) panel.classList.add('open'); return; }
      capturarRegion(rect).finally(() => { if (estabaAbierto) panel.classList.add('open'); });
    }
    function onKey(e) {
      if (e.key === 'Escape') { cleanup(); if (estabaAbierto) panel.classList.add('open'); }
    }
    function cleanup() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }

    overlay.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey);
  }

  capturarBtn.addEventListener('click', iniciarCaptura);

  function fmtFecha(v) {
    if (!v) return '';
    const d = new Date(v + 'T12:00:00');
    return isNaN(d) ? v : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function hoyISO() { return new Date().toISOString().slice(0, 10); }

  // Compatible con estructura vieja sol1/2/3 y nueva soluciones/{key}, igual que _novGetSols en index.html.
  function obtenerSoluciones(n) {
    if (n.soluciones && Object.keys(n.soluciones).length) {
      return Object.entries(n.soluciones).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0)).map(([k, s]) => ({ ...s, _key: k }));
    }
    return [n.sol1, n.sol2, n.sol3].filter(Boolean);
  }

  // ── Pantalla 1: Buscar ──────────────────────────────────────────────────
  async function buscar() {
    const guia = guiaInput.value.trim();
    if (!guia) { buscarMsg.textContent = 'Ingresa el número de guía.'; buscarMsg.className = 'err'; return; }
    if (!tienda || !tienda.key) { buscarMsg.textContent = 'Configura primero la tienda desde el ícono de la extensión.'; buscarMsg.className = 'err'; return; }
    auth = await getAuthValido();
    if (!auth) { buscarMsg.textContent = 'Inicia sesión desde el ícono 🧰 de la extensión.'; buscarMsg.className = 'err'; return; }

    const btn = $('#nvcp-buscar-btn');
    btn.disabled = true; btn.textContent = 'Buscando...';
    buscarMsg.textContent = ''; buscarMsg.className = '';
    try {
      const data = await leerDB('novedades/' + tienda.key, auth);
      const guiaNorm = guia.trim();
      // Se compara ignorando espacios, guiones y mayúsculas — igual que
      // _novNormGuia en gestiones-diarias.js. La guía se pega desde Dropi y un
      // espacio de más creaba un registro duplicado de la misma guía.
      const norm = g => String(g || '').replace(/[\s-]+/g, '').toLowerCase();
      const guiaCmp = norm(guiaNorm);
      const encontradas = [];
      Object.entries(data || {}).forEach(([mes, entradas]) => {
        Object.entries(entradas || {}).forEach(([id, n]) => {
          if (norm(n.guia) === guiaCmp) encontradas.push({ mes, id, ...n });
        });
      });
      encontradas.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      guiaActual = guiaNorm;
      matches = encontradas;
      target = encontradas[0] || null;
      mostrarResultado();
    } catch (e) {
      buscarMsg.textContent = e.message;
      buscarMsg.className = 'err';
    } finally {
      btn.disabled = false; btn.textContent = 'Buscar historial';
    }
  }
  $('#nvcp-buscar-btn').addEventListener('click', buscar);
  guiaInput.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

  // ── Pantalla 2: Resultado / historial ──────────────────────────────────
  function renderEvidencia(s) {
    const color = s.estado === 'solucionada' ? '#39E67A' : s.estado === 'devuelta' ? '#E6B539' : '#3971E6';
    const label = s.estado === 'solucionada' ? '✅ Solucionada' : s.estado === 'devuelta' ? '📦 Devuelta' : '📋 En gestión';
    let cuerpo = '';
    if (s.tipo === 'img') {
      cuerpo = `<img src="${s.val}" class="nvcp-ev-img">`;
    } else {
      cuerpo = `<div class="nvcp-ev-txt">${(s.val || '').replace(/</g, '&lt;')}</div>`;
    }
    return `<div class="nvcp-ev-card" style="border-color:${color}55;">
      <div class="nvcp-ev-hdr" style="background:${color}22;color:${color};">
        <span>${label}</span><span>${s.fechaLabel || ''}</span>
      </div>
      ${cuerpo}
    </div>`;
  }

  function mostrarResultado() {
    screenBuscar.style.display = 'none';
    screenForm.style.display = 'none';
    screenResultado.style.display = 'block';
    guiaLbl.textContent = 'Guía: ' + guiaActual;

    if (!matches.length) {
      historialEl.innerHTML = '<div class="nvcp-vacio">Sin novedades previas registradas para esta guía.</div>';
      nuevaBtn.textContent = '+ Registrar nueva novedad';
    } else {
      historialEl.innerHTML = matches.map(n => {
        const sols = obtenerSoluciones(n);
        const evid = sols.length ? sols.map(renderEvidencia).join('') : '<div class="nvcp-vacio-sm">Sin evidencias todavía.</div>';
        return `<div class="nvcp-nov-card">
          <div class="nvcp-nov-hdr"><span>${n.fecha || '—'}</span><span class="nvcp-nov-asesor">${n.asesor || '—'}</span></div>
          ${evid}
        </div>`;
      }).join('');
      nuevaBtn.textContent = '+ Agregar evidencia a esta novedad';
    }
  }

  $('#nvcp-volver-btn').addEventListener('click', () => {
    screenResultado.style.display = 'none';
    screenBuscar.style.display = 'block';
  });

  // ── Pantalla 3: Formulario ──────────────────────────────────────────────
  function setEstado(estado) {
    estadoActivo = estado;
    $('#nvcp-estado-sol').classList.toggle('active', estado === 'solucionada');
    $('#nvcp-estado-dev').classList.toggle('active', estado === 'devuelta');
    if (estado === 'devuelta') { tipoWrap.style.display = 'none'; setTipo('txt'); }
    else { tipoWrap.style.display = 'block'; setTipo('img'); }
  }

  function setTipo(tipo) {
    tipoActivo = tipo;
    $('#nvcp-tipo-img').classList.toggle('active', tipo === 'img');
    $('#nvcp-tipo-txt').classList.toggle('active', tipo === 'txt');
    imgWrap.style.display = tipo === 'img' ? 'block' : 'none';
    txtWrap.style.display = tipo === 'txt' ? 'block' : 'none';
  }

  $('#nvcp-estado-sol').addEventListener('click', () => setEstado('solucionada'));
  $('#nvcp-estado-dev').addEventListener('click', () => setEstado('devuelta'));
  $('#nvcp-tipo-img').addEventListener('click', () => setTipo('img'));
  $('#nvcp-tipo-txt').addEventListener('click', () => setTipo('txt'));

  nuevaBtn.addEventListener('click', () => {
    modo = target ? 'evidencia' : 'nueva';
    screenResultado.style.display = 'none';
    screenForm.style.display = 'block';
    formMsg.textContent = ''; formMsg.className = '';
    ocultarPreviewImg(); mTxt.value = '';
    solFecha.value = hoyISO();
    solModo.value = '';
    setEstado('solucionada');

    if (modo === 'evidencia') {
      const n = target;
      const numEvid = obtenerSoluciones(n).length + 1;
      formTitle.textContent = 'Evidencia ' + numEvid + ' — Guía ' + guiaActual;
      metaEl.style.display = 'none';
      solLabelEl.textContent = 'Evidencia ' + numEvid;
    } else {
      formTitle.textContent = 'Nueva Novedad';
      metaEl.style.display = 'block';
      solLabelEl.textContent = 'Solución 1 (opcional)';
      mFecha.value = hoyISO();
      mGuia.value = guiaActual;
      mAsesor.value = asesorNombre;
    }
  });

  $('#nvcp-cancelar-btn').addEventListener('click', () => {
    screenForm.style.display = 'none';
    screenResultado.style.display = 'block';
  });

  // Recalcula los contadores (soluc/devuelt) de UN asesor en UN día. Tiene que
  // dar exactamente lo mismo que _novGestionesDe/_novContarDia en
  // shared/app-shared.js — está duplicado acá porque la extensión no puede
  // cargar ese archivo. Si cambia la regla allá, cambiala también acá.
  //
  // Regla: los contadores son de CADA asesor, no de la tienda. Cada evidencia es
  // una gestión y suma a quien la hizo, el día que la hizo. Una novedad
  // trabajada por dos personas cuenta una vez para cada una.
  //
  // Compatibilidad: las evidencias viejas no traen asesor/dia, así que caen al
  // asesor y al día de la novedad — si no, recalcular un día viejo lo dejaría en
  // cero y borraría historial.
  //
  // Esta función ya se desalineó dos veces del panel: primero mandando todo a
  // `gestion` (bucket retirado que nadie suma), y después contando las novedades
  // de toda la tienda en la fila de un solo asesor. Como el guardado es un PUT
  // del día completo, un cálculo mal hecho acá pisa lo que el panel contó bien.
  function gestionesDe(n, mes) {
    return obtenerSoluciones(n || {})
      .filter(s => s && (s.estado === 'solucionada' || s.estado === 'devuelta'))
      .filter(s => !mes || !s.mes || s.mes === mes)
      .map(s => ({
        estado: s.estado,
        asesorKey: gdKey(s.asesor || (n || {}).asesor || ''),
        dia: s.dia || (n || {}).dia || 0
      }));
  }
  // Guarda una evidencia dejando la imagen FUERA del registro, en
  // nov_img/{tienda}/{mes}/{novedadId}/{solKey}. Dentro, cada foto quedaba
  // incrustada en la novedad y leer novedades/{tienda} arrastraba todas: eran
  // 16 MB contra 0,26 MB de datos reales. Tiene que coincidir con _novImgPath
  // de shared/app-shared.js.
  async function guardarEvidencia(mes, novedadId, solObj) {
    const base = 'novedades/' + tienda.key + '/' + mes + '/' + novedadId + '/soluciones';
    const esImg = solObj.tipo === 'img' && solObj.val && String(solObj.val).startsWith('data:');
    if (!esImg) return agregarDB(base, auth, solObj);
    const binario = solObj.val;
    solObj.val = ''; solObj.img = true;
    // La evidencia se crea primero para conocer su clave, y recién ahí se sabe
    // dónde guardar la imagen.
    const solKey = await agregarDB(base, auth, solObj);
    await escribirDB('nov_img/' + tienda.key + '/' + mes + '/' + novedadId + '/' + solKey, auth, binario);
    return solKey;
  }

  async function sincronizarGD(mes, dia, asesorKeyForzado) {
    const asesorKey = asesorKeyForzado || gdKey(asesorNombre);
    const [novedadesMes, dayDataActual] = await Promise.all([
      leerDB('novedades/' + tienda.key + '/' + mes, auth).then(d => d || {}),
      leerDB('gestiones_diarias/' + tienda.key + '/' + mes + '/' + asesorKey + '/dias/' + dia, auth).then(d => d || {})
    ]);
    let soluc = 0, devuelt = 0;
    Object.values(novedadesMes).forEach(n => {
      gestionesDe(n, mes).forEach(g => {
        if (g.dia !== dia || g.asesorKey !== asesorKey) return;
        if (g.estado === 'devuelta') devuelt++; else soluc++;
      });
    });
    dayDataActual.soluc = soluc; dayDataActual.devuelt = devuelt;
    delete dayDataActual.gestion; // campo retirado: se limpia al recalcular el día
    await escribirDB('gestiones_diarias/' + tienda.key + '/' + mes + '/' + asesorKey + '/dias/' + dia, auth, dayDataActual);
  }

  // Agrega el modo de solución como nota a la gestión de esa guía en gestiones_sync
  // (misma estructura que setNota() en index.html: {texto, fecha, ts}). La gestión
  // se busca por _guia porque gestiones_sync está indexado por dropiId, que la
  // extensión no conoce. Si el pedido no tiene gestión registrada todavía, no hay
  // dónde escribir la nota — se avisa pero no bloquea el guardado de la novedad.
  async function agregarNotaGestion(guia, texto) {
    const data = await leerDB('gestiones_sync/' + tienda.key, auth) || {};
    const entry = Object.entries(data).find(([, g]) => (g._guia || '').toString().trim() === guia);
    if (!entry) return false;
    const [key, g] = entry;
    const notas = Array.isArray(g.notas) ? g.notas.slice() : [];
    notas.push({ texto, fecha: new Date().toLocaleDateString('es-CO'), ts: Date.now() });
    await escribirDB('gestiones_sync/' + tienda.key + '/' + key + '/notas', auth, notas);
    return true;
  }

  async function guardar() {
    auth = await getAuthValido();
    if (!auth) { formMsg.textContent = 'Inicia sesión desde el ícono 🧰 de la extensión.'; formMsg.className = 'err'; return; }
    // Resguardo: si se guarda muy rápido tras abrir el panel, el perfil (asesor)
    // puede no haber cargado todavía — sincronizarGD() depende de asesorNombre.
    if (!asesorNombre) {
      try { const p = await obtenerPerfilUsuario(auth); asesorNombre = p.asesor || auth.email; }
      catch (e) { asesorNombre = auth.email; }
    }

    guardarBtn.disabled = true; guardarBtn.textContent = 'Guardando...';
    formMsg.textContent = ''; formMsg.className = '';
    try {
      // Construir la evidencia (opcional si es novedad nueva, obligatoria si es evidencia adicional).
      // Cada evidencia es una gestión y suma a quien la hizo, el día que la
      // hizo: por eso lleva su propio asesor/dia/mes. El día sale de la fecha
      // elegida en el formulario, no de Date.now(), igual que en el panel.
      const fSol = solFecha.value ? new Date(solFecha.value + 'T12:00:00') : new Date();
      const solMeta = {
        asesor: asesorNombre,
        // El uid es la identidad que cuenta: sin él, la gestión se acredita al
        // slug del nombre y la misma persona termina con DOS carpetas en
        // gestiones_diarias —la del uid y la del nombre—, apareciendo dos veces
        // en el consolidado del admin con las gestiones repartidas entre ambas.
        asesorUid: auth.uid,
        dia: fSol.getDate(),
        mes: fSol.getFullYear() + '-' + String(fSol.getMonth() + 1).padStart(2, '0')
      };
      let solObj = null;
      if (tipoActivo === 'img') {
        if (imgEvidenciaData) {
          solObj = { estado: estadoActivo, tipo: 'img', val: imgEvidenciaData, fechaLabel: fmtFecha(solFecha.value), ts: Date.now(), ...solMeta };
        }
      } else {
        const txt = mTxt.value.trim();
        if (txt) solObj = { estado: estadoActivo, tipo: 'txt', val: txt, fechaLabel: fmtFecha(solFecha.value), ts: Date.now(), ...solMeta };
      }
      const modoSolucion = solModo.value;
      if (solObj && !modoSolucion) throw new Error('Selecciona el modo de solución.');

      let guiaParaNota = guiaActual;
      if (modo === 'nueva') {
        const guia = mGuia.value.trim();
        if (!guia) throw new Error('Ingresa el número de guía.');
        const mes = mesActual();
        const dia = new Date().getDate();
        const novData = { guia, fecha: fmtFecha(mFecha.value) || mFecha.value, asesor: mAsesor.value.trim(), dia, ts: Date.now() };
        const id = await agregarDB('novedades/' + tienda.key + '/' + mes, auth, novData);
        if (solObj) await guardarEvidencia(mes, id, solObj);
        // Día de la GESTIÓN, mes del NODO: las novedades y el contador viven en
        // 'novedades/{tienda}/{mes}', así que hay que leer ahí para encontrarla.
        // Sin evidencia no hubo gestión y no hay nada que recontar.
        if (solObj) await sincronizarGD(mes, solObj.dia);
        guiaActual = guia;
        guiaParaNota = guia;
      } else {
        if (!solObj) throw new Error('Agrega una imagen o un texto de evidencia.');
        await guardarEvidencia(target.mes, target.id, solObj);
        await sincronizarGD(target.mes, solObj.dia);
      }

      // Si hay evidencia, deja constancia del modo de solución en las notas de la
      // gestión de esa guía (mismo lugar donde index.html guarda las notas manuales).
      let notaGuardada = null;
      if (solObj) {
        const estadoLabel = estadoActivo === 'solucionada' ? 'Novedad solucionada' : 'Producto devuelto';
        let notaTexto = estadoLabel + ' — Modo de solución: ' + modoSolucion;
        if (tipoActivo === 'txt' && mTxt.value.trim()) notaTexto += ': ' + mTxt.value.trim();
        try { notaGuardada = await agregarNotaGestion(guiaParaNota, notaTexto); }
        catch (e) { notaGuardada = false; }
      }

      // Vuelve a la pantalla de búsqueda para encadenar la siguiente guía.
      ocultarPreviewImg();
      screenForm.style.display = 'none';
      screenResultado.style.display = 'none';
      screenBuscar.style.display = 'block';
      guiaInput.value = '';
      guiaInput.focus();
      buscarMsg.textContent = '✓ Novedad guardada correctamente.' +
        (notaGuardada === false ? ' (No se encontró la gestión de esta guía en el panel — la nota de la solución no quedó registrada ahí.)' : '');
      buscarMsg.className = 'ok';
    } catch (e) {
      formMsg.textContent = e.message;
      formMsg.className = 'err';
    } finally {
      guardarBtn.disabled = false; guardarBtn.textContent = 'Guardar';
    }
  }
  guardarBtn.addEventListener('click', guardar);
})();

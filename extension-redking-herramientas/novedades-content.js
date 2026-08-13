(function () {
  let tienda = null; // { nombre, key }
  let auth = null;
  let asesorNombre = '';
  let guiaActual = '';
  let matches = []; // novedades existentes para la guía buscada (todas las tiendas/meses), más reciente primero
  let target = null; // match elegido para agregar evidencia, o null si se va a crear una novedad nueva
  let modo = 'nueva'; // 'nueva' | 'evidencia'
  let estadoActivo = 'solucionada';

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

        <!-- Imagen y nota son campos independientes y SIEMPRE visibles, valga el
             resultado que valga: se puede adjuntar la foto, escribir la nota o
             las dos cosas, y todo queda como UNA sola evidencia (= una gestión).
             Igual que el modal "Nueva Novedad" del panel. Antes había un selector
             "Imagen / Texto" que obligaba a elegir, y encima una devolución solo
             admitía texto. -->
        <div id="nvcp-img-wrap">
          <label style="margin-top:10px;">Imagen de evidencia (opcional)</label>
          <div id="nvcp-img-preview-wrap" style="display:none;">
            <img id="nvcp-img-preview" class="nvcp-ev-img">
            <button type="button" id="nvcp-img-quitar" class="nvcp-link-btn">✕ Quitar imagen</button>
          </div>
          <div id="nvcp-img-opciones">
            <input type="file" id="nvcp-m-img" accept="image/*" class="nvcp-input">
            <div id="nvcp-paste-hint">📋 o pegá una captura con <b>Ctrl + V</b></div>
          </div>
          <div class="nvcp-hint-sm">Se comprimirá automáticamente · Tamaño máximo recomendado: 5 MB</div>
        </div>
        <div id="nvcp-txt-wrap">
          <label style="margin-top:10px;">Nota de la gestión (opcional)</label>
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
  const imgWrap = $('#nvcp-img-wrap');
  const txtWrap = $('#nvcp-txt-wrap');
  const mImg = $('#nvcp-m-img');
  const mTxt = $('#nvcp-m-txt');
  const formMsg = $('#nvcp-form-msg');
  const guardarBtn = $('#nvcp-guardar-btn');
  const imgPreviewWrap = $('#nvcp-img-preview-wrap');
  const imgPreview = $('#nvcp-img-preview');
  const imgOpciones = $('#nvcp-img-opciones');
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

  // Pegar una captura con Ctrl+V. Reemplaza al botón "Capturar pantalla", que
  // fotografiaba la pestaña visible: solo servía si la evidencia estaba en la
  // propia página de Dropi, y las novedades se resuelven desde varios lados
  // (WhatsApp, Chateapro, la web de la transportadora, una llamada).
  //
  // Mismo patrón que _novPasteOn en gestiones-diarias.js: el listener va en el
  // `document` y no en el input —así se pega sin tener que enfocar nada— y solo
  // actúa si el panel está abierto, se está en el formulario y lo pegado es una
  // imagen. Si no lo es, NO se llama a preventDefault y pegar texto en el campo
  // de evidencia sigue funcionando normal.
  document.addEventListener('paste', async ev => {
    if (!panel.classList.contains('open')) return;
    if (screenForm.style.display === 'none') return;
    const items = (ev.clipboardData && ev.clipboardData.items) || [];
    let file = null;
    for (const it of items) {
      if (it.kind === 'file' && /^image\//.test(it.type)) { file = it.getAsFile(); break; }
    }
    if (!file) return;
    ev.preventDefault();
    try {
      const raw = await blobToDataURL(file);
      imgEvidenciaData = await resizeDataUrl(raw, 800, 0.72);
      mostrarPreviewImg();
      formMsg.textContent = '📋 Captura pegada';
      formMsg.className = 'ok';
    } catch (e) {
      formMsg.textContent = 'No se pudo leer la imagen pegada.';
      formMsg.className = 'err';
    }
  });

  function fmtFecha(v) {
    if (!v) return '';
    const d = new Date(v + 'T12:00:00');
    return isNaN(d) ? v : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Fecha YYYY-MM-DD en la zona horaria del equipo. Nunca toISOString(): devuelve
  // UTC, y en Colombia (UTC-5) a partir de las 19:00 ya informa el día siguiente,
  // así que una novedad cargada de noche quedaba con fecha de mañana y su gestión
  // sumaba al día equivocado. Mismo criterio que _hoyLocal() en app-shared.js.
  function hoyISO(d) {
    const f = d || new Date();
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
  }

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
    const escapar = t => String(t || '').replace(/</g, '&lt;');
    let cuerpo = '';
    if (s.tipo === 'img') {
      // Una evidencia de tipo imagen puede traer nota: van juntas desde el mismo
      // guardado y son una sola gestión. Sin pintarla, la explicación quedaba
      // guardada pero invisible en el historial.
      cuerpo = `<img src="${s.val}" class="nvcp-ev-img">`;
      if (s.nota && String(s.nota).trim()) cuerpo += `<div class="nvcp-ev-txt">${escapar(s.nota)}</div>`;
    } else {
      cuerpo = `<div class="nvcp-ev-txt">${escapar(s.val)}</div>`;
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
  // El resultado (solucionada / devuelta) no condiciona qué evidencia se puede
  // adjuntar: los dos admiten imagen, nota o ambas. Antes una devolución solo
  // dejaba escribir texto.
  function setEstado(estado) {
    estadoActivo = estado;
    $('#nvcp-estado-sol').classList.toggle('active', estado === 'solucionada');
    $('#nvcp-estado-dev').classList.toggle('active', estado === 'devuelta');
  }

  $('#nvcp-estado-sol').addEventListener('click', () => setEstado('solucionada'));
  $('#nvcp-estado-dev').addEventListener('click', () => setEstado('devuelta'));

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
  //
  // `mesNodo` es el mes bajo el que vive la novedad, y solo se usa de respaldo:
  // el mes que vale es el de la evidencia, porque una gestión suma el día en que
  // se hizo aunque la novedad sea de meses atrás. Las evidencias viejas no traen
  // `mes` y caen al del nodo, que es donde se contaban hasta ahora.
  function gestionesDe(n, mesNodo) {
    return obtenerSoluciones(n || {})
      .filter(s => s && (s.estado === 'solucionada' || s.estado === 'devuelta'))
      .map(s => ({
        estado: s.estado,
        // El uid manda, igual que en _novGestionesDe de la app. Las evidencias
        // anteriores no lo traen y caen al slug del nombre, que es la clave con
        // la que se guardaron en su momento.
        asesorKey: s.asesorUid || gdKey(s.asesor || (n || {}).asesor || ''),
        dia: s.dia || (n || {}).dia || 0,
        mes: s.mes || mesNodo || ''
      }));
  }
  // Guarda una evidencia dejando la imagen FUERA del registro, en
  // nov_img/{tienda}/{mes}/{novedadId}/{solKey}. Dentro, cada foto quedaba
  // incrustada en la novedad y leer novedades/{tienda} arrastraba todas: eran
  // 16 MB contra 0,26 MB de datos reales. Tiene que coincidir con _novImgPath
  // de shared/app-shared.js.
  async function guardarEvidencia(mes, novedadId, solObj) {
    // Mismo freno que _novGuardarSol en gestiones-diarias.js, y en el mismo
    // punto: justo antes de crear una evidencia con resultado, que es lo que
    // suma al día. Las de estado vacío no son gestión y no consumen cupo.
    if (solObj && (solObj.estado === 'solucionada' || solObj.estado === 'devuelta')
        && !puedeRegistrarGestion('registrar evidencia de novedad (extensión)')) {
      throw new Error('Se frenó el registro: se intentaron demasiadas gestiones en pocos segundos. No se guardó nada — avisá a soporte.');
    }
    const base = 'novedades/' + tienda.key + '/' + mes + '/' + novedadId + '/soluciones';
    const esImg = solObj.tipo === 'img' && solObj.val && String(solObj.val).startsWith('data:');
    if (!esImg) return agregarDB(base, auth, solObj);
    const binario = solObj.val;
    // La evidencia se crea SIN la marca `img` porque con REST la clave solo se
    // conoce después del POST, y hasta que la foto no esté guardada no puede
    // decir que la tiene. Si se marcara antes y fallara la subida, quedaría una
    // evidencia apuntando a una imagen inexistente: se ve rota en el historial y
    // encima cuenta como gestión. El panel no puede caer en ese estado porque
    // reserva la clave con push() sin escribir; acá se compensa deshaciendo.
    solObj.val = '';
    const solKey = await agregarDB(base, auth, solObj);
    try {
      await escribirDB('nov_img/' + tienda.key + '/' + mes + '/' + novedadId + '/' + solKey, auth, binario);
      await escribirDB(base + '/' + solKey + '/img', auth, true);
      solObj.img = true;
    } catch (e) {
      // Sin imagen, la evidencia no debe quedar sumando una gestión vacía.
      await borrarDB(base + '/' + solKey, auth).catch(() => {});
      throw new Error('No se pudo guardar la imagen de la evidencia. No se registró nada: volvé a intentarlo.');
    }
    return solKey;
  }

  // `mesGestion`/`dia` son los de la GESTIÓN, no los de la novedad: si hoy, 12 de
  // agosto, se soluciona una novedad creada en junio, el trabajo suma al 12 de
  // agosto. Por eso se recorren TODOS los meses de novedades/{tienda} y no solo
  // uno: la evidencia que hay que contar vive en el nodo de junio pero lleva
  // mes:'2026-08' propio. Leyendo un solo mes, esa gestión no la contaba nadie —
  // ni junio (la descartaba por mes distinto) ni agosto (donde no está la
  // novedad). El nodo completo pesa poco porque las imágenes viven aparte, en
  // nov_img/ (ver guardarEvidencia).
  async function sincronizarGD(mesGestion, dia, asesorKeyForzado) {
    // El contador se escribe en la carpeta del uid, que es la clave canónica.
    // Antes iba a la del slug del nombre: eso le abría a la misma persona una
    // SEGUNDA carpeta en gestiones_diarias, y como además solo se contaban las
    // evidencias de esa clave, sus gestiones del día quedaban repartidas entre
    // las dos. En el consolidado del admin salía dos veces, con números
    // distintos. Ver _novRecontarDiaGD en gestion-logistica.js, que hace esto
    // mismo desde la app.
    const asesorKey = asesorKeyForzado || auth.uid;
    // Se cuentan las DOS claves de la persona: las evidencias viejas se
    // guardaron con el nombre y las nuevas con el uid.
    const claves = asesorKeyForzado ? [asesorKeyForzado]
                                    : [auth.uid, gdKey(asesorNombre)].filter(Boolean);
    const [todasLasNovedades, dayDataActual] = await Promise.all([
      leerDB('novedades/' + tienda.key, auth).then(d => d || {}),
      leerDB('gestiones_diarias/' + tienda.key + '/' + mesGestion + '/' + asesorKey + '/dias/' + dia, auth).then(d => d || {})
    ]);
    let soluc = 0, devuelt = 0;
    Object.entries(todasLasNovedades).forEach(([mesNodo, entradas]) => {
      Object.values(entradas || {}).forEach(n => {
        gestionesDe(n, mesNodo).forEach(g => {
          if (g.mes !== mesGestion || g.dia !== dia || claves.indexOf(g.asesorKey) < 0) return;
          if (g.estado === 'devuelta') devuelt++; else soluc++;
        });
      });
    });
    dayDataActual.soluc = soluc; dayDataActual.devuelt = devuelt;
    delete dayDataActual.gestion; // campo retirado: se limpia al recalcular el día
    await escribirDB('gestiones_diarias/' + tienda.key + '/' + mesGestion + '/' + asesorKey + '/dias/' + dia, auth, dayDataActual);
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
      // Foto y nota de la misma gestión van en UNA sola evidencia, igual que en
      // _novGuardar del panel. Si se guardaran por separado contarían 2 en el
      // contador del día y pintarían 2 cuadros, como si fueran dos trabajos
      // distintos sobre la misma novedad.
      //   · foto (+ nota si la hay) → {tipo:'img', val:<imagen>, nota:'...'}
      //   · solo nota               → {tipo:'txt', val:'...'}
      let solObj = null;
      const txt = mTxt.value.trim();
      if (imgEvidenciaData || txt) {
        solObj = { estado: estadoActivo, fechaLabel: fmtFecha(solFecha.value), ts: Date.now(), ...solMeta };
        if (imgEvidenciaData) {
          solObj.tipo = 'img';
          solObj.val = imgEvidenciaData;
          if (txt) solObj.nota = txt;
        } else {
          solObj.tipo = 'txt';
          solObj.val = txt;
        }
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
        // Mes y día de la GESTIÓN, no los de la novedad: el contador que cambia
        // es el del día en que se hizo el trabajo. Sin evidencia no hubo gestión
        // y no hay nada que recontar.
        if (solObj) await sincronizarGD(solObj.mes, solObj.dia);
        guiaActual = guia;
        guiaParaNota = guia;
      } else {
        if (!solObj) throw new Error('Agrega una imagen o un texto de evidencia.');
        // La evidencia se cuelga de la novedad donde esté (target.mes), pero el
        // contador que se recalcula es el del mes/día en que se gestionó. Son
        // distintos cada vez que se trabaja una novedad de un mes anterior.
        await guardarEvidencia(target.mes, target.id, solObj);
        await sincronizarGD(solObj.mes, solObj.dia);
      }

      // Si hay evidencia, deja constancia del modo de solución en las notas de la
      // gestión de esa guía (mismo lugar donde index.html guarda las notas manuales).
      let notaGuardada = null;
      if (solObj) {
        const estadoLabel = estadoActivo === 'solucionada' ? 'Novedad solucionada' : 'Producto devuelto';
        let notaTexto = estadoLabel + ' — Modo de solución: ' + modoSolucion;
        // La nota entra vaya sola o acompañando a una foto: antes solo se
        // copiaba cuando la evidencia era de tipo texto, así que al adjuntar
        // imagen la explicación se perdía para quien mira la gestión.
        if (txt) notaTexto += ': ' + txt;
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

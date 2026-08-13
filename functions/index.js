// Endpoints para que el bot de ChateaPro registre ventas en REDKING.
//
// Corren como Cloud Functions dentro del mismo proyecto de Firebase que la base,
// así que el Admin SDK se autentica solo: no hay cuenta de servicio que generar
// ni credencial que guardar.
//
// Se exportan dos funciones y cada una queda en su propia URL:
//   .../ventas         POST      registra la venta
//   .../ventasExiste   GET|POST  consulta si el pedido ya está
//
// Se dejan como dos funciones sueltas en vez de una con enrutador para no sumar
// Express: son dos caminos que no comparten nada más que lib.js.
const { onRequest } = require('firebase-functions/v2/https');
const {
  db, cors, body, autenticar, fbKey,
  claveVenta, mesDe, normTelefono, normFecha, aNumero
} = require('./lib');

// La misma región que la base de datos. Cruzar de región le sumaría a cada
// escritura un viaje de ida y vuelta entre continentes, y esto se llama en cada
// conversación del bot.
const REGION = 'us-central1';

// Se aceptan varias formas de nombrar cada campo: los nombres del usuario
// ("Numero de telefono"), su versión en snake_case y algún alias obvio. Así el
// flujo del bot puede mandar lo que le quede cómodo sin tocar esto.
function tomar(d, ...nombres) {
  for (const n of nombres) {
    if (d[n] !== undefined && d[n] !== null && String(d[n]).trim() !== '') return d[n];
  }
  return '';
}

// ── POST /ventas ──────────────────────────────────────────────────────────
// Escribe en dos lugares, siempre juntos:
//   ventas_bot/{empresaId}/{mes}/{clave}   la venta (la que pinta la tabla)
//   ventas_bot_idx/{empresaId}/{clave}     { mes, ts, estado } para /ventasExiste
//
// La clave es telefono + fecha_compra. Al ser determinística, un reintento del
// bot cae sobre el mismo registro en vez de crear otro: por eso NO se usa push().
//
// Si la venta ya existe se ACTUALIZA EL ESTADO y nada más, y el cambio queda en
// historial_estado: una orden puede pasar de CONFIRMADO a CANCELADO, y perder
// ese recorrido dejaría la tabla contando solo el final de la historia.
//
// Nunca devuelve error por duplicado. Un 4xx haría que ChateaPro siga
// reintentando algo que ya está bien guardado.
async function handlerVentas(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Usá POST' });

  try {
    const d = body(req);
    const workspace = tomar(d, 'workspace', 'WORKSPACE');

    const auth = await autenticar(req, workspace);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const telefono = tomar(d, 'telefono', 'TELEFONO', 'numero_de_telefono', 'Numero de telefono');
    const fechaCompra = tomar(d, 'fecha_compra', 'FECHA_COMPRA', 'Fecha de compra', 'fecha');

    const clave = claveVenta(telefono, fechaCompra);
    if (!clave) {
      // Se dice cuál de los dos falta: es el error más probable al configurar el
      // flujo en el bot, y "datos inválidos" a secas no ayuda a corregirlo.
      const falta = !normTelefono(telefono) ? 'telefono' : 'fecha_compra';
      return res.status(400).json({
        ok: false,
        error: 'Falta o es inválido: ' + falta,
        ayuda: 'fecha_compra acepta 2026-08-13 o 13/08/2026'
      });
    }

    const mes = mesDe(fechaCompra);
    const empresaId = fbKey(auth.empresaId);
    const refVenta = db().ref('ventas_bot/' + empresaId + '/' + mes + '/' + clave);
    const refIdx = db().ref('ventas_bot_idx/' + empresaId + '/' + clave);

    const estado = String(tomar(d, 'estado_orden', 'ESTADO_ORDEN', 'ESTADO DE LA ORDEN', 'estado')).trim();
    const ahora = Date.now();
    const previa = (await refVenta.once('value')).val();

    if (previa) {
      const estadoAnterior = String(previa.estado_orden || '');
      const cambia = estado && estado !== estadoAnterior;
      if (cambia) {
        const historial = Array.isArray(previa.historial_estado) ? previa.historial_estado.slice() : [];
        historial.push({ de: estadoAnterior, a: estado, ts: ahora });
        await refVenta.update({ estado_orden: estado, historial_estado: historial, actualizado: ahora });
        await refIdx.update({ estado: estado, ts_actualizado: ahora });
      }
      return res.status(200).json({
        ok: true, duplicado: true, id: clave, mes,
        estado_actualizado: !!cambia,
        estado: cambia ? estado : estadoAnterior
      });
    }

    const venta = {
      telefono: normTelefono(telefono),
      fecha_compra: normFecha(fechaCompra),
      fecha_registro: String(tomar(d, 'fecha_registro', 'FECHA_REGISTRO', 'Fecha de registro ingreso', 'fecha_ingreso')),
      nombre: String(tomar(d, 'nombre', 'NOMBRE', 'Nombre del usuario', 'nombre_usuario')),
      ciudad: String(tomar(d, 'ciudad', 'CIUDAD')),
      departamento: String(tomar(d, 'departamento', 'DEPARTAMENTO')),
      // `order` es la orden completa tal como la arma el bot ("2 CEPILLOS DE
      // BAMBU"); `producto` es solo el nombre, sin cantidades ("CEPILLO BAMBU").
      order: String(tomar(d, 'order', 'ORDER', 'orden')),
      producto: String(tomar(d, 'producto', 'PRODUCTO', 'PRODUCTO ESCOGIDO', 'producto_escogido')),
      cantidad: aNumero(tomar(d, 'cantidad', 'CANTIDAD')),
      // El valor es el TOTAL de la orden, no el precio unitario.
      valor: aNumero(tomar(d, 'valor', 'VALOR', 'total')),
      estado_orden: estado,
      id_anuncio: String(tomar(d, 'id_anuncio', 'ID_ANUNCIO', 'ID DEL ANUNCIO', 'ad_id')),
      tienda: String(tomar(d, 'tienda', 'TIENDA')),
      workspace: String(workspace),
      ts: ahora,
      // El payload tal cual llegó. Ocupa poco y salva de tener que pedir que se
      // vuelvan a disparar las ventas si mañana aparece un campo que no se
      // estaba mapeando: se reprocesa desde acá.
      _raw: d
    };

    await refVenta.set(venta);
    await refIdx.set({ mes, ts: ahora, estado: venta.estado_orden });

    return res.status(200).json({ ok: true, duplicado: false, id: clave, mes });
  } catch (e) {
    console.error('[ventas]', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

// ── GET|POST /ventasExiste ────────────────────────────────────────────────
// Lo llama el bot ANTES de registrar, para no reenviar un pedido que ya está.
// Lee SOLO el índice: preguntar esto leyendo las ventas completas traería el mes
// entero en cada mensaje del bot.
async function handlerExiste(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Usá GET o POST' });
  }

  try {
    const d = req.method === 'GET' ? (req.query || {}) : body(req);
    const workspace = d.workspace || d.WORKSPACE || '';

    const auth = await autenticar(req, workspace);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const telefono = d.telefono || d.TELEFONO || d['numero_de_telefono'] || '';
    const fechaCompra = d.fecha_compra || d.FECHA_COMPRA || d.fecha || '';

    const clave = claveVenta(telefono, fechaCompra);
    if (!clave) {
      const falta = !normTelefono(telefono) ? 'telefono' : 'fecha_compra';
      return res.status(400).json({
        ok: false,
        error: 'Falta o es inválido: ' + falta,
        ayuda: 'fecha_compra acepta 2026-08-13 o 13/08/2026'
      });
    }

    const snap = await db().ref('ventas_bot_idx/' + fbKey(auth.empresaId) + '/' + clave).once('value');
    const idx = snap.val();
    if (!idx) return res.status(200).json({ ok: true, existe: false });

    return res.status(200).json({
      ok: true, existe: true,
      estado: idx.estado || '',
      mes: idx.mes || '',
      registrado: idx.ts || null
    });
  } catch (e) {
    console.error('[ventasExiste]', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

// maxInstances acota el gasto: si algo entra en bucle, el tope es el techo de la
// factura. 10 instancias simultáneas sobran para el volumen de un bot de ventas.
const OPCIONES = { region: REGION, maxInstances: 10, memory: '256MiB', timeoutSeconds: 30 };

exports.ventas = onRequest(OPCIONES, handlerVentas);
exports.ventasExiste = onRequest(OPCIONES, handlerExiste);

// Se exportan también los handlers para que los tests los llamen directo, sin
// levantar el emulador.
exports._handlers = { ventas: handlerVentas, existe: handlerExiste };

// Endpoints para que el bot de ChateaPro registre CARRITOS en REDKING.
//
// Van aparte de las ventas —otro nodo, otra pestaña— porque son otra cosa: una
// venta ya ocurrió; un carrito es una intención que todavía puede recuperarse o
// perderse. Mezclarlos habría hecho que los totales de ventas contaran cosas que
// nadie compró.
//
//   .../carritos             POST      carrito con los datos completos
//   .../carritosRecuperado   POST      el carrito se recuperó
//   .../carritosExiste       GET|POST  consulta previa, para no reenviar
//
// LA IDENTIDAD ES telefono + id_carrito, no telefono + fecha como en ventas. El
// id lo genera ChateaPro, así que es la identidad real del carrito: el mismo
// cliente puede tener varios abiertos sin que se pisen, y recuperar uno es
// encontrarlo exacto sin depender de cuándo llegue el aviso. Los dos payloads
// mandan el id, y sin id se responde 400: emparejar por teléfono a secas dejaría
// carritos duplicados en cuanto alguien abandone dos.
//
// Estados: DATOS COMPLETOS (falta confirmar con el cliente) y CARRITO RECUPERADO.
// El payload de recuperación puede traer su propio estado y se respeta, así que
// mañana pueden aparecer otros sin tocar esto.
const {
  db, cors, body, autenticar, fbKey, tomar,
  claveCarrito, normIdCarrito, normTelefono, normFecha, hoyColombia,
  aNumero, aEntero
} = require('./lib');

const EST_COMPLETOS = 'DATOS COMPLETOS';
const EST_RECUPERADO = 'CARRITO RECUPERADO';

// `tomar` vive en lib.js y NO distingue mayúsculas: se aceptan varias formas de
// nombrar cada campo, incluidos los títulos tal como salen del Excel, escritos
// como quiera el flujo del bot.

// El nombre puede llegar partido en dos columnas (NOMBRES / APELLIDOS) o entero
// en una sola ("Nombre del usuario"). Se guardan las partes por separado cuando
// vienen, y además el nombre completo ya armado, que es lo que pinta la tabla.
function armarNombre(d) {
  const nombres = String(tomar(d, 'nombres', 'NOMBRES', 'nombre', 'NOMBRE', 'Nombre del usuario', 'nombre_usuario')).trim();
  const apellidos = String(tomar(d, 'apellidos', 'APELLIDOS')).trim();
  return {
    nombres,
    apellidos,
    nombre: (nombres + ' ' + apellidos).trim()
  };
}

// Resuelve la clave y corta con 400 si falta algo, diciendo QUÉ falta: es el error
// más probable al configurar el flujo en ChateaPro, y "datos inválidos" a secas no
// ayuda a arreglarlo.
function resolverClave(d, res) {
  const telefono = tomar(d, 'telefono', 'TELEFONO', 'TELÉFONO', 'numero_de_telefono', 'Numero de telefono', 'Número de teléfono');
  const idCarrito = tomar(d, 'id_carrito', 'ID_CARRITO', 'idCarrito', 'ID DEL CARRITO', 'id', 'ID');
  const clave = claveCarrito(telefono, idCarrito);
  if (!clave) {
    const falta = !normTelefono(telefono) ? 'telefono' : 'id_carrito';
    res.status(400).json({
      ok: false,
      error: 'Falta o es inválido: ' + falta,
      ayuda: 'La identidad de un carrito es telefono + id_carrito. El id es el que genera ChateaPro, por ejemplo 1344229114102.'
    });
    return null;
  }
  return { clave, telefono, idCarrito };
}

// Campos que los dos payloads comparten. Solo se devuelven los que llegaron con
// algo: al actualizar un carrito no se puede pisar un dato bueno con un vacío.
function camposComunes(d) {
  const out = {};
  const n = armarNombre(d);
  if (n.nombre) { out.nombre = n.nombre; }
  if (n.nombres) out.nombres = n.nombres;
  if (n.apellidos) out.apellidos = n.apellidos;

  const dir = String(tomar(d, 'direccion', 'DIRECCION', 'DIRECCIÓN', 'DIRECCIÓN Y BARRIO', 'direccion_y_barrio', 'Dirección y barrio')).trim();
  if (dir) out.direccion = dir;

  const ciu = String(tomar(d, 'ciudad', 'CIUDAD')).trim();
  if (ciu) out.ciudad = ciu;
  const dep = String(tomar(d, 'departamento', 'DEPARTAMENTO')).trim();
  if (dep) out.departamento = dep;

  // El producto llega como NOTA en el Excel de datos completos —ahí la nota ES el
  // nombre del producto— y como Producto en el de recuperados.
  const prod = String(tomar(d, 'producto', 'PRODUCTO', 'NOTA', 'nota', 'Producto')).trim();
  if (prod) out.producto = prod;

  // cantidad y valor van por caminos distintos a propósito: aEntero para las
  // cantidades (2 significa 2) y aNumero para los importes, que corrige el
  // separador de miles cuando el bot manda el número sin comillas. Ver lib.js.
  const cant = tomar(d, 'cantidad', 'CANTIDAD');
  if (cant !== '') out.cantidad = aEntero(cant);
  const val = tomar(d, 'valor', 'VALOR', 'precio_total', 'PRECIO TOTAL', 'PRECIO TOTAL (SIN PUNTOS NI COMAS)', 'total', 'Valor');
  if (val !== '') out.valor = aNumero(val);

  return out;
}

// YYYYMMDD → YYYY-MM. Es el único sitio donde se decide en qué mes vive un
// carrito, y lo usan tanto la creación como el movimiento: con dos cuentas por
// separado, un arreglo entraría en una sola y volverían a discrepar.
function mesDeFecha(yyyymmdd) {
  const f = String(yyyymmdd || '');
  return f.length === 8 ? f.slice(0, 4) + '-' + f.slice(4, 6) : '';
}

// Lee DÓNDE ESTÁ HOY el carrito. Devuelve { mes, datos } o null.
//
// El mes sale del ÍNDICE y no del payload: como la clave NO lleva la fecha, hay
// que preguntarle a alguien dónde vive el registro antes de tocarlo. Escribir a
// ciegas en el mes que sugiera el payload dejaría el carrito duplicado —una copia
// en cada mes— sin que nada avise.
//
// Eso es para ENCONTRARLO. En qué mes debe QUEDAR lo decide la fecha, y si no
// coinciden el carrito se mueve — ver la rama `mesDestino` en registrar().
async function buscarCarrito(empresaId, clave) {
  const idx = (await db().ref('carritos_bot_idx/' + empresaId + '/' + clave).once('value')).val();
  if (!idx || !idx.mes) return null;
  const datos = (await db().ref('carritos_bot/' + empresaId + '/' + idx.mes + '/' + clave).once('value')).val();
  if (!datos) return null;
  return { mes: idx.mes, datos };
}

// Aplica un cambio de estado dejando rastro. Una misma orden puede pasar de DATOS
// COMPLETOS a CARRITO RECUPERADO y de ahí a lo que venga, y perder ese recorrido
// dejaría la tabla contando solo el final de la historia.
function conHistorial(previa, estadoNuevo, ahora) {
  const anterior = String(previa.estado || '');
  if (!estadoNuevo || estadoNuevo === anterior) return null;
  const historial = Array.isArray(previa.historial_estado) ? previa.historial_estado.slice() : [];
  historial.push({ de: anterior, a: estadoNuevo, ts: ahora });
  return { estado: estadoNuevo, historial_estado: historial };
}

// Núcleo compartido por los dos POST. `estadoPorDefecto` es lo que se pone cuando
// el payload no trae estado, y es la única diferencia real entre los dos caminos.
async function registrar(req, res, estadoPorDefecto) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Usá POST' });

  const d = body(req);
  const workspace = tomar(d, 'workspace', 'WORKSPACE');

  const auth = await autenticar(req, workspace);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const ids = resolverClave(d, res);
  if (!ids) return;                       // resolverClave ya respondió el 400
  const { clave } = ids;

  const empresaId = fbKey(auth.empresaId);
  const ahora = Date.now();

  // La fecha: el payload de recuperación la trae; el de datos completos no, y ahí
  // se usa la de recepción. Se guardan en campos distintos para no hacerlas pasar
  // por lo mismo — una es cuándo ocurrió, la otra cuándo nos enteramos.
  const fechaPayload = normFecha(tomar(d, 'fecha', 'FECHA', 'Fecha', 'fecha_carrito'));
  const fecha = fechaPayload || hoyColombia();
  const estado = String(tomar(d, 'estado', 'ESTADO', 'estado_orden', 'ESTADO DE LA ORDEN', 'Estado de la orden')).trim() || estadoPorDefecto;

  const previo = await buscarCarrito(empresaId, clave);

  if (previo) {
    // Existe: se actualiza la información que venga con algo y el estado.
    // _raw se REGRABA con el último envío. Antes solo se guardaba al crear, así que
    // al depurar mostraba el primer payload mientras los campos venían de otro
    // posterior — y eso hizo perder tiempo persiguiendo un importe que "el mismo
    // texto" guardaba distinto en dos carritos. El último envío es el que explica
    // lo que hay guardado.
    const cambios = Object.assign({}, camposComunes(d), { actualizado: ahora, _raw: d });
    if (fechaPayload) cambios.fecha = fechaPayload;
    const hist = conHistorial(previo.datos, estado, ahora);
    if (hist) Object.assign(cambios, hist);

    // EL MES LO MANDA LA FECHA, también al actualizar. Antes el registro se
    // quedaba donde estaba: se guardaba la fecha nueva pero no se movía, y un
    // carrito con Fecha de junio aparecía en la pestaña de agosto. Pasó de verdad
    // —110 carritos de 171— cuando el flujo empezó a mandar `Fecha` y se
    // reenviaron carritos creados antes sin ella, que habían caído en el mes de
    // recepción.
    const mesDestino = fechaPayload ? mesDeFecha(fechaPayload) : '';

    if (mesDestino && mesDestino !== previo.mes) {
      // Mover, no copiar. Las tres escrituras van en UN update multi-ruta desde la
      // raíz: RTDB lo aplica entero o nada, así que el carrito no puede quedar
      // duplicado en los dos meses ni desaparecer entre medio — que es justo lo
      // que se quería evitar cuando se decidió que el mes saliera del índice.
      const upd = {};
      upd['carritos_bot/' + empresaId + '/' + mesDestino + '/' + clave] =
        Object.assign({}, previo.datos, cambios);
      upd['carritos_bot/' + empresaId + '/' + previo.mes + '/' + clave] = null;
      upd['carritos_bot_idx/' + empresaId + '/' + clave + '/mes'] = mesDestino;
      upd['carritos_bot_idx/' + empresaId + '/' + clave + '/ts_actualizado'] = ahora;
      if (hist) upd['carritos_bot_idx/' + empresaId + '/' + clave + '/estado'] = estado;
      await db().ref().update(upd);

      return res.status(200).json({
        ok: true, duplicado: true, id: clave, mes: mesDestino,
        movido_desde: previo.mes,
        estado_actualizado: !!hist,
        estado: hist ? estado : String(previo.datos.estado || '')
      });
    }

    await db().ref('carritos_bot/' + empresaId + '/' + previo.mes + '/' + clave).update(cambios);
    if (hist) {
      await db().ref('carritos_bot_idx/' + empresaId + '/' + clave)
        .update({ estado: estado, ts_actualizado: ahora });
    }
    return res.status(200).json({
      ok: true, duplicado: true, id: clave, mes: previo.mes,
      estado_actualizado: !!hist,
      estado: hist ? estado : String(previo.datos.estado || '')
    });
  }

  // Nuevo. Un carrito recuperado que nunca pasó por "datos completos" se registra
  // igual: es lo que pidió el usuario, y perderlo por no haberlo visto antes
  // dejaría el conteo de recuperados por debajo de la realidad.
  const mes = mesDeFecha(fecha);
  const carrito = Object.assign({
    telefono: normTelefono(ids.telefono),
    id_carrito: normIdCarrito(ids.idCarrito),
    fecha: fecha,
    fecha_recepcion: hoyColombia(),
    estado: estado,
    workspace: String(workspace),
    tienda: String(tomar(d, 'tienda', 'TIENDA')),
    ts: ahora,
    // El payload tal cual llegó: ocupa poco y salva de tener que pedir que se
    // vuelvan a disparar los carritos si mañana aparece un campo sin mapear.
    _raw: d
  }, camposComunes(d));

  await db().ref('carritos_bot/' + empresaId + '/' + mes + '/' + clave).set(carrito);
  await db().ref('carritos_bot_idx/' + empresaId + '/' + clave).set({ mes, ts: ahora, estado: estado });

  return res.status(200).json({ ok: true, duplicado: false, id: clave, mes, estado });
}

// ── POST /carritos ────────────────────────────────────────────────────────
// Carrito con todos los datos listos; solo falta confirmar con el cliente.
async function handlerCarritos(req, res) {
  try {
    return await registrar(req, res, EST_COMPLETOS);
  } catch (e) {
    console.error('[carritos]', e);
    if (!res.headersSent) return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

// ── POST /carritosRecuperado ──────────────────────────────────────────────
// El carrito se recuperó. Si el cliente ya estaba registrado se actualiza su
// información y su estado; si no estaba, entra directamente como recuperado.
async function handlerCarritoRecuperado(req, res) {
  try {
    return await registrar(req, res, EST_RECUPERADO);
  } catch (e) {
    console.error('[carritosRecuperado]', e);
    if (!res.headersSent) return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

// ── GET|POST /carritosExiste ──────────────────────────────────────────────
// Lo llama el bot ANTES de registrar. Lee SOLO el índice: preguntar esto sobre los
// carritos completos traería el mes entero en cada mensaje del bot.
async function handlerCarritoExiste(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Usá GET o POST' });
  }
  try {
    const d = req.method === 'GET' ? (req.query || {}) : body(req);
    const auth = await autenticar(req, d.workspace || d.WORKSPACE || '');
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const ids = resolverClave(d, res);
    if (!ids) return;

    const idx = (await db().ref('carritos_bot_idx/' + fbKey(auth.empresaId) + '/' + ids.clave).once('value')).val();
    if (!idx) return res.status(200).json({ ok: true, existe: false });

    return res.status(200).json({
      ok: true, existe: true,
      estado: idx.estado || '',
      mes: idx.mes || '',
      registrado: idx.ts || null
    });
  } catch (e) {
    console.error('[carritosExiste]', e);
    if (!res.headersSent) return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

module.exports = {
  handlerCarritos, handlerCarritoRecuperado, handlerCarritoExiste,
  EST_COMPLETOS, EST_RECUPERADO
};

// POST /api/ventas — registra una venta del bot.
//
// Escribe en dos lugares, siempre juntos:
//   ventas_bot/{empresaId}/{mes}/{clave}   la venta completa (la que pinta la tabla)
//   ventas_bot_idx/{empresaId}/{clave}     { mes, ts, estado } para /existe
//
// La clave es telefono + fecha_compra (decidido con el usuario el 2026-08-13).
// Al ser determinística, un reintento del bot cae sobre el mismo registro en vez
// de crear uno nuevo: por eso NO se usa push().
//
// Si la venta ya existe, se ACTUALIZA EL ESTADO y nada más. El resto de los
// campos queda como entró la primera vez y el cambio se anota en historial: una
// orden puede pasar de CONFIRMADO a CANCELADO, y perder ese recorrido dejaría
// la tabla diciendo solo el final de la historia.
//
// Nunca devuelve error por duplicado. Un 4xx haría que ChateaPro siga
// reintentando algo que ya está bien guardado.
const { db, cors, body, autenticar, fbKey, claveVenta, mesDe, normTelefono, normFecha, aNumero } = require('../_lib');

// Se aceptan varias formas de nombrar cada campo: los nombres del usuario
// ("Numero de telefono"), su versión en snake_case y algún alias obvio. Así el
// flujo del bot puede mandar lo que le quede cómodo sin que haya que tocar esto.
function tomar(d, ...nombres) {
  for (const n of nombres) {
    if (d[n] !== undefined && d[n] !== null && String(d[n]).trim() !== '') return d[n];
  }
  return '';
}

module.exports = async (req, res) => {
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
      // Ya estaba: solo el estado puede cambiar.
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

    // Alta.
    const venta = {
      // Identidad
      telefono: normTelefono(telefono),
      fecha_compra: normFecha(fechaCompra),
      // Datos del pedido
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
      // Contexto
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
};

// GET|POST /api/ventas/existe
//
// Lo llama ChateaPro ANTES de registrar, para no reenviar un pedido que ya está.
// Se acepta por GET (query) y por POST (body) porque no todas las plataformas
// dejan elegir el método.
//
//   GET  /api/ventas/existe?workspace=WS-1&telefono=3001112233&fecha_compra=2026-08-13
//   POST /api/ventas/existe   { workspace, telefono, fecha_compra }
//
//   → 200 { existe: true,  estado: "CONFIRMADO", mes: "2026-08", registrado: 1765... }
//   → 200 { existe: false }
//
// Responde leyendo SOLO el índice (ventas_bot_idx), que es un nodo plano de una
// línea por venta. Leer las ventas completas para esto sería traer todo el mes
// entero en cada mensaje del bot.
const { db, cors, body, autenticar, fbKey, claveVenta, normTelefono, normFecha } = require('../_lib');

module.exports = async (req, res) => {
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
      // Se dice cuál de los dos falta: es el error más probable al configurar el
      // flujo en el bot, y "datos inválidos" a secas no ayuda a corregirlo.
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
      ok: true,
      existe: true,
      estado: idx.estado || '',
      mes: idx.mes || '',
      registrado: idx.ts || null
    });
  } catch (e) {
    console.error('[existe]', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
};

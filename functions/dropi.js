// Conexión DIRECTA de la plataforma con Dropi por su servidor MCP.
// No pasa por Claude ni por ningún cliente de IA: acá el cliente es REDKING.
//
//   GET  /dropiConectar   arranca la autorización (una sola vez, con un humano)
//   GET  /dropiCallback   Dropi vuelve acá con el código y se guardan los tokens
//   POST /dropiMcp        llama al MCP con el token vigente. Esto es lo que se usa.
//
// POR QUÉ HACE FALTA AUTORIZAR UNA VEZ. Se consultó el servidor de Dropi:
// `grant_types_supported` es ["authorization_code","refresh_token"] — NO incluye
// client_credentials, que es el que permitiría a un backend autenticarse solo. Así
// que alguien tiene que aprobar el acceso desde un navegador la primera vez. Desde
// ahí manda el refresh_token y ya no vuelve a hacer falta nadie.
//
// El token NUNCA llega al navegador: vive en Firebase y solo lo leen estas
// funciones con el Admin SDK. El frontend llama a /dropiMcp, no a Dropi.
const crypto = require('crypto');
const { db, cors, body } = require('./lib');

const AS = 'https://integrations.dropi.co';          // servidor de autorización
const AUTORIZAR = 'https://oauth.dropi.co/oauth/authorize';
const MCP = 'https://mcp.dropi.co/mcp';
const NODO = 'dropi_oauth/cuenta';                   // una sola conexión, es una prueba

// El registro del cliente lo hace el propio servidor de Dropi cuando se le pide
// (registro dinámico, verificado el 2026-08-24). Se guarda para no repetirlo.
async function clienteRegistrado(redirectUri) {
  const snap = await db().ref(NODO + '/cliente').once('value');
  const guardado = snap.val();
  if (guardado && guardado.client_id && guardado.redirect_uri === redirectUri) return guardado;

  const r = await fetch(AS + '/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'REDKING',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp'
    })
  });
  if (!r.ok) throw new Error('No se pudo registrar el cliente en Dropi (HTTP ' + r.status + ')');
  const j = await r.json();
  const cli = { client_id: j.client_id, client_secret: j.client_secret || '', redirect_uri: redirectUri, ts: Date.now() };
  await db().ref(NODO + '/cliente').set(cli);
  return cli;
}

const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ── 1. Arranque de la autorización ───────────────────────────────────────
async function handlerConectar(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const base = 'https://' + req.get('host');
    const redirectUri = base + '/dropiCallback';
    const cli = await clienteRegistrado(redirectUri);

    // PKCE: el servidor de Dropi exige S256. El verifier se guarda para el
    // callback — sin él no se puede canjear el código.
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    await db().ref(NODO + '/pendiente').set({ verifier, state, ts: Date.now() });

    const url = AUTORIZAR + '?' + new URLSearchParams({
      response_type: 'code',
      client_id: cli.client_id,
      redirect_uri: redirectUri,
      scope: 'mcp',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });
    res.redirect(302, url);
  } catch (e) {
    res.status(500).send('No se pudo iniciar la conexión con Dropi: ' + e.message);
  }
}

// ── 2. Vuelta de Dropi con el código ─────────────────────────────────────
async function handlerCallback(req, res) {
  const pagina = (titulo, detalle, ok) => `<!doctype html><meta charset="utf-8">
    <body style="font-family:system-ui;background:#0b0f14;color:#e2eaf4;display:flex;
    align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
    <div><div style="font-size:2.5rem">${ok ? '✅' : '⚠️'}</div>
    <h2 style="margin:10px 0 6px">${titulo}</h2>
    <p style="color:#8b9db5;font-size:.9rem;max-width:420px">${detalle}</p>
    <p style="color:#8b9db5;font-size:.8rem">Ya podés cerrar esta pestaña.</p></div>`;
  try {
    const { code, state, error, error_description } = req.query || {};
    if (error) return res.status(400).send(pagina('Dropi rechazó la conexión', String(error_description || error), false));
    if (!code) return res.status(400).send(pagina('Falta el código', 'Dropi no devolvió el código de autorización.', false));

    const pend = (await db().ref(NODO + '/pendiente').once('value')).val();
    // El state ata esta respuesta a la petición que salió de acá: sin comprobarlo,
    // cualquiera podría mandarnos un código suyo y dejarnos conectados a su cuenta.
    if (!pend || pend.state !== state) {
      return res.status(400).send(pagina('La autorización no coincide', 'Volvé a empezar desde el panel.', false));
    }

    const cli = (await db().ref(NODO + '/cliente').once('value')).val();
    const r = await fetch(AS + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: cli.redirect_uri,
        client_id: cli.client_id,
        code_verifier: pend.verifier
      })
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) {
      return res.status(400).send(pagina('Dropi no entregó el token', String(j.error_description || j.error || ('HTTP ' + r.status)), false));
    }

    await db().ref(NODO + '/token').set({
      access_token: j.access_token,
      refresh_token: j.refresh_token || '',
      expira: Date.now() + ((parseInt(j.expires_in, 10) || 3600) * 1000),
      ts: Date.now()
    });
    await db().ref(NODO + '/pendiente').remove();

    res.status(200).send(pagina('Conectado con Dropi',
      j.refresh_token
        ? 'La plataforma ya puede consultar a Dropi por su cuenta. No hay que volver a autorizar.'
        : 'Dropi no mandó refresh_token: la conexión va a vencer y habrá que autorizar de nuevo.', true));
  } catch (e) {
    res.status(500).send(pagina('Error al conectar', e.message, false));
  }
}

// Devuelve un access token vigente, renovándolo si hace falta. Es lo que hace que
// la conexión funcione sola después de la única autorización.
async function tokenVigente() {
  const t = (await db().ref(NODO + '/token').once('value')).val();
  if (!t || !t.access_token) throw new Error('Todavía no hay conexión con Dropi. Entrá a /dropiConectar una vez.');
  // Un minuto de margen: renovar justo en el límite deja peticiones a medio camino
  // con un token que vence mientras viajan.
  if (Date.now() < (t.expira || 0) - 60000) return t.access_token;
  if (!t.refresh_token) throw new Error('El token venció y Dropi no dio refresh_token: hay que autorizar de nuevo.');

  const cli = (await db().ref(NODO + '/cliente').once('value')).val();
  const r = await fetch(AS + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
      client_id: cli.client_id
    })
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('No se pudo renovar el token: ' + (j.error_description || j.error || r.status));
  await db().ref(NODO + '/token').update({
    access_token: j.access_token,
    // Dropi puede rotar el refresh_token; si manda uno nuevo, el viejo deja de
    // servir y guardar el anterior dejaría la conexión muerta al siguiente vencimiento.
    refresh_token: j.refresh_token || t.refresh_token,
    expira: Date.now() + ((parseInt(j.expires_in, 10) || 3600) * 1000),
    ts: Date.now()
  });
  return j.access_token;
}

// ── 3. Llamada al MCP ────────────────────────────────────────────────────
// Habla JSON-RPC con el servidor de Dropi. MCP está pensado para clientes de IA,
// pero por debajo es JSON-RPC sobre HTTP y un backend lo habla igual.
async function llamarMcp(metodo, params, token) {
  const r = await fetch(MCP, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      // El servidor puede contestar en SSE; se aceptan las dos formas.
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: metodo, params: params || {} })
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('MCP respondió ' + r.status + ': ' + txt.slice(0, 300));
  // Si vino como event-stream, el JSON está en la línea que empieza con "data:".
  const crudo = txt.trim().startsWith('{') ? txt
    : (txt.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).pop() || '');
  if (!crudo) throw new Error('Respuesta vacía del MCP');
  return JSON.parse(crudo);
}

// Punto de entrada del frontend. Nunca se le pasa el token al navegador: se le
// pide una acción y se le devuelve el resultado.
async function handlerMcp(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const d = body(req);
    const metodo = String(d.metodo || d.method || 'tools/list');
    const token = await tokenVigente();

    // El handshake es obligatorio antes de cualquier otra llamada: sin él, el
    // servidor responde que la sesión no está inicializada.
    await llamarMcp('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'REDKING', version: '1.0' }
    }, token);

    const out = await llamarMcp(metodo, d.params || {}, token);
    if (out.error) return res.status(200).json({ ok: false, error: out.error.message || out.error, detalle: out.error });
    return res.status(200).json({ ok: true, resultado: out.result });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}

module.exports = { handlerConectar, handlerCallback, handlerMcp, tokenVigente, llamarMcp };

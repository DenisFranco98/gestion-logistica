// El fetch() de un content script queda sujeto al CORS del sitio donde corre
// (chateapro.app), así que servidores como Backblaze B2 lo bloquean. El service
// worker de la extensión sí puede hacer fetch cross-origin gracias a host_permissions,
// así que aquí se descarga la imagen y se devuelve ya convertida a data URL.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ANTCP_FETCH_IMAGE') {
    fetchImageAsDataUrl(msg.url)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // respuesta async
  }
});
// Acá vivía NVCP_CAPTURE, que fotografiaba la pestaña visible para la evidencia
// de Novedades. Se retiró: solo servía si la evidencia estaba en la propia
// página de Dropi, y las novedades se resuelven desde varios sitios. Ahora la
// imagen se sube desde el PC o se pega con Ctrl+V, que no necesitan el service
// worker. El permiso "tabs" del manifest se mantiene porque lo usa el popup de
// Duplicados (chrome.tabs.query/sendMessage en popup-dropi.js).

async function fetchImageAsDataUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('No se pudo descargar la imagen (' + resp.status + ')');
  const blob = await resp.blob();
  if (!blob.type.startsWith('image/')) throw new Error('El elemento arrastrado no es una imagen');
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  return `data:${blob.type};base64,${base64}`;
}

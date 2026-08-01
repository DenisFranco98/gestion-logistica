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
  if (msg && msg.type === 'NVCP_CAPTURE') {
    // chrome.tabs.captureVisibleTab solo se puede llamar desde el service worker,
    // no desde un content script — por eso viaja por mensaje hasta acá.
    const windowId = sender.tab && sender.tab.windowId;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, dataUrl => {
      if (chrome.runtime.lastError) { sendResponse({ ok: false, error: chrome.runtime.lastError.message }); return; }
      sendResponse({ ok: true, dataUrl });
    });
    return true; // respuesta async
  }
});

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

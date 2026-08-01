// Corre en el "isolated world" (contexto de la extensión) sobre redking-tulogistica.com.
// Recibe la sesión que reenvía inject-auth.js y la guarda donde la lee shared.js
// (AUTH_KEY), para que popup.js y content.js la usen sin pedir login manual.
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || !data.__antcp) return;

  if (data.type === 'ANTCP_AUTH') {
    chrome.storage.local.set({
      [AUTH_KEY]: {
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        email: data.email,
        uid: data.uid
      }
    });
  } else if (data.type === 'ANTCP_AUTH_CLEAR') {
    chrome.storage.local.remove(AUTH_KEY);
  }
});

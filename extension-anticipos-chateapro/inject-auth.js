// Se ejecuta en el "MAIN world" (contexto real de la página redking-tulogistica.com),
// donde vive el objeto global `firebase` que carga index.html. Reenvía la sesión de
// Firebase Auth a auth-bridge.js (extensión) vía postMessage cada vez que cambia,
// para que la extensión de Chateapro quede logueada sola sin pedir correo/contraseña.
(function () {
  function post(type, payload) {
    window.postMessage(Object.assign({ __antcp: true, type }, payload || {}), window.location.origin);
  }

  function attach() {
    if (!window.firebase || !firebase.apps || !firebase.apps.length) return false;
    firebase.auth().onAuthStateChanged(async user => {
      if (!user) { post('ANTCP_AUTH_CLEAR'); return; }
      try {
        const res = await user.getIdTokenResult();
        post('ANTCP_AUTH', {
          idToken: res.token,
          refreshToken: user.refreshToken,
          expiresAt: new Date(res.expirationTime).getTime(),
          email: user.email || '',
          uid: user.uid
        });
      } catch (e) { /* silencioso: no se pudo leer el token */ }
    });
    return true;
  }

  if (!attach()) {
    const iv = setInterval(() => { if (attach()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();

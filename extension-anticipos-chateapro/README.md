# ⛔ DESCONTINUADA — no instalar

**Usá `extension-redking-herramientas`, que ya incluye Anticipos** además de duplicados Dropi y novedades.

Esta extensión quedó fuera de uso el 2026-08-01 por dos motivos:

1. **Guarda con la clave de tienda vieja** (el slug del nombre). Los anticipos terminaban en `anticipos/{slug}/{mes}/con`, una ruta que el panel ya no lee: desde el cambio a `empresaId`, dos tiendas con el mismo nombre compartían datos y por eso se migró todo. Ver la nota de identidad de tienda del proyecto.
2. **Se pisa con REDKING Herramientas.** Las dos corren en `chateapro.app` y usan las mismas claves de `chrome.storage` (`antChateaproTienda` y `antChateaproAuth`), así que con ambas instaladas aparecen dos paneles y la configuración de tienda de una sobrescribe la de la otra.

Se conserva solo como referencia del código. Si alguna vez hiciera falta revivirla, hay que corregir esos dos puntos antes.

---

# Anticipos Chateapro → Gestión Logística

Extensión de Chrome que agrega un botón flotante 💰 en Chateapro para cargar comprobantes de anticipo directo en **Guías con Anticipo** (pestaña Anticipos de Gestiones Diarias), sin salir del chat.

## Instalación (modo desarrollador)

1. Abre Chrome y ve a `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Clic en **Cargar descomprimida** y selecciona esta carpeta (`extension-anticipos-chateapro`).
4. Entra y loguéate normalmente en `redking-tulogistica.com` (la plataforma de Gestión Logística) — la extensión detecta esa sesión sola y queda lista, sin pedir correo/contraseña aparte. Si prefieres no depender de eso, también puedes abrir el ícono 💰 de la extensión e iniciar sesión ahí manualmente con la misma cuenta.
5. Clic en el ícono 💰 de la extensión y selecciona tu tienda de la lista (solo aparecen las tiendas asociadas a tu cuenta), o escribe el nombre exacto si no aparece. Queda guardada y no hay que repetirla.

## Uso

1. Entra a `chateapro.app` y abre la conversación del cliente.
2. Clic en el botón flotante 💰 (esquina inferior derecha) — se abre el panel "Nuevo anticipo". Se puede arrastrar por su cabecera a cualquier parte de la pantalla.
3. **Comprobante**: arrastra la imagen del comprobante desde el chat al recuadro punteado, o haz clic en el recuadro para elegir un archivo.
4. **Cliente**: selecciona el nombre en el chat y arrástralo al campo, o escríbelo.
5. **Teléfono**: selecciona el número en el chat y arrástralo al campo (se limpia automáticamente si viene con texto alrededor, ej. "Tel: 300 123 4567"), o escríbelo.
6. **Motivo**: escribe por qué se hace el anticipo.
7. Clic en **Guardar anticipo** — el registro aparece de inmediato en Guías con Anticipo, dentro de la pestaña Anticipos de Gestiones Diarias, para la tienda y el mes actual.

## Diseño

El panel y el popup usan el mismo sistema visual que `index.html` (REDKING): tipografías Syne (títulos) y DM Sans (texto), fondo oscuro `#0D1117`, acento rojo `#E63946` (identidad de marca / cabecera, igual que la franja "GUÍAS CON ANTICIPO") y acento azul `#3971E6` en gradiente para la acción principal (igual que el botón de login de la plataforma).

- El selector de tienda del popup solo lista las tiendas asociadas a la cuenta logueada: para un admin, las de `admin_empresas/{uid}`; para dueño/asesor, las de `user_tiendas/{uid}` (o el nombre directo en `users/{uid}.tienda` si la cuenta no tiene ese nodo). No se muestra el listado completo de tiendas del sistema.

## Notas técnicas

- Requiere sesión de Firebase Auth porque la base de datos exige `auth != null` para leer y escribir. La extensión obtiene esa sesión de dos formas:
  1. **Automática**: `inject-auth.js` corre en el "MAIN world" de `redking-tulogistica.com` (mismo contexto JS que `index.html`, donde vive `firebase.auth()`), y cada vez que cambia el estado de sesión le pasa el `idToken`/`refreshToken` a `auth-bridge.js` (contexto de la extensión) vía `postMessage` restringido al mismo origen. `auth-bridge.js` los guarda en `chrome.storage.local`.
  2. **Manual**: si no has entrado a la plataforma en ese navegador, el popup permite loguearse directo vía la API REST de Identity Toolkit con la misma `apiKey` de `index.html`.
  En ambos casos el token se renueva solo antes de expirar (`refrescarToken` en `shared.js`).
- Escribe directamente en Firebase Realtime Database (mismo proyecto que usa `index.html`), en `anticipos/{tienda}/{YYYY-MM}/con`, igual que el botón "+ Agregar guía" del panel.
- La clave de tienda se calcula igual que `_gdKey` en `index.html` (nombre normalizado sin tildes/espacios), así que el nombre elegido en el popup debe coincidir con el nombre real de la tienda en el sistema.
- El comprobante se redimensiona a máx. 800px de ancho en JPEG (calidad .72) antes de guardarse, igual que en `index.html`.
- La descarga de la imagen del comprobante (cuando se arrastra desde el chat, no como archivo) la hace `background.js` (el service worker de la extensión) y no el content script, porque un `fetch()` hecho desde el content script queda sujeto al CORS del sitio donde corre (chateapro.app) y servidores como Backblaze B2 lo bloquean con "Failed to fetch". El service worker sí puede hacer fetch cross-origin gracias a `host_permissions`.
- Si aun así el comprobante no se puede descargar automáticamente, usa el clic en el recuadro para adjuntarlo como archivo (guarda la imagen primero con clic derecho → Guardar imagen).
- Requiere permiso amplio de host (`<all_urls>`) porque las imágenes del chat suelen estar alojadas en un dominio distinto a `chateapro.app` (su CDN de medios) y hay que poder descargarlas para convertirlas a base64.
- Campo nuevo: `cliente` se agregó al esquema de Anticipos en `index.html` (columna "CLIENTE" en ambas tablas, con y sin anticipo) para poder guardar el nombre que arrastra la extensión.

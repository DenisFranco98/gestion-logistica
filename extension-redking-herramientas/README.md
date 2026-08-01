# REDKING Herramientas — Gestión Logística

Una sola extensión de Chrome con las herramientas que antes vivían por separado (o no existían):

- **💰 Anticipos Chateapro** (antes `extension-anticipos-chateapro`): botón flotante en Chateapro para arrastrar el comprobante y el nombre del cliente y guardarlos directo en Guías con Anticipo.
- **🔁 Duplicados Dropi** (antes `extension-duplicados-dropi`): resalta pedidos duplicados (mismo teléfono) en la tabla de Mis Pedidos de Dropi.
- **📝 Novedades Dropi** (nueva): botón flotante en la página de Novedades de Dropi para buscar el historial de una guía en la plataforma antes de gestionarla, y registrar la evidencia (igual al modal "Nueva Novedad" de `index.html`) sin salir de Dropi.

Cada una sigue funcionando de forma independiente en su propio sitio (`chateapro.app` / `app.dropi.co/dashboard/orders` / `app.dropi.co/dashboard/novelties`); lo único que se comparte es la instalación, la sesión/tienda configuradas una sola vez, y el ícono de la barra de Chrome, cuyo popup tiene una pestaña por herramienta con ajustes propios (Novedades no necesita ajustes propios — usa la misma sesión y tienda de Anticipos).

## Instalación (modo desarrollador)

1. Abre Chrome y ve a `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Clic en **Cargar descomprimida** y selecciona esta carpeta (`extension-redking-herramientas`).
4. Si tenías instaladas `extension-anticipos-chateapro` y/o `extension-duplicados-dropi` por separado, puedes quitarlas de `chrome://extensions` — quedaron reemplazadas por esta.
5. Clic en el ícono 🧰 de la extensión: pestaña **💰 Anticipos** para configurar la tienda (o entra a redking-tulogistica.com y se loguea sola), pestaña **🔁 Duplicados Dropi** para ver el resumen de duplicados de la pestaña activa.

## Uso

- **Anticipos**: igual que antes — botón flotante 💰 en Chateapro, arrastra comprobante/cliente/teléfono, escribe el motivo, Guardar. Ver detalle en el README original de `extension-anticipos-chateapro`.
- **Duplicados Dropi**: entra a `app.dropi.co/dashboard/orders`, las filas con el mismo teléfono quedan resaltadas automáticamente; el popup (pestaña Duplicados Dropi) lista los grupos y permite marcarlos como revisados o ubicarlos en la tabla.
- **Novedades Dropi**: entra a `app.dropi.co/dashboard/novelties`, clic en el botón flotante 📝.
  1. Escribe el número de guía y **Buscar historial** — busca en todos los meses guardados de la tienda y muestra las novedades y evidencias ya registradas para esa guía (si las hay).
  2. Según el resultado, el botón cambia a **+ Registrar nueva novedad** (si es la primera vez) o **+ Agregar evidencia a esta novedad** (si ya existía — no se duplica el registro, se suma como nueva evidencia, igual que hace la plataforma).
  3. Completa el formulario (igual al modal "Nueva Novedad" de `index.html`: fecha, guía, asesor, resultado de la gestión, imagen o texto de evidencia) y **Guardar**. Para la imagen, en vez de subir un archivo puedes usar **📸 Capturar pantalla**: oculta el panel, arrastra un recuadro sobre la parte de la pantalla que quieras (ej. el chat o la pantalla de Dropi mostrando la solución), y ese recorte queda cargado directo como evidencia — Esc cancela la selección.
     - Si registras una evidencia (imagen o texto), también debes elegir el **Modo de solución**: Llamada Talkyria, Solución Chateapro, Solución Llamada asesor, Contacto Wpp asesor u Otro. Ese dato queda registrado como una nota nueva en la gestión de esa guía (mismo lugar donde `index.html` guarda las notas manuales) — si la guía todavía no tiene una gestión creada en el panel, la novedad se guarda igual pero se avisa que la nota no pudo enlazarse.
  4. Al guardar, también se recalculan los contadores diarios (solucionadas/gestión/devueltas) de la pestaña **Gestión** de Gestiones Diarias para el día en que se creó esa novedad — mismo cálculo que usa `index.html` (`_novSyncGD`), para que no queden desactualizados por haberse cargado desde aquí en vez de la plataforma.

## Estructura de archivos

```
manifest.json          — content_scripts + permisos de las tres herramientas
shared.js               — auth Firebase + helpers compartidos (tienda, perfil, lectura/escritura DB)
inject-auth.js          — lee la sesión de Firebase en redking-tulogistica.com (MAIN world)
auth-bridge.js          — recibe esa sesión y la guarda para la extensión
background.js           — fetch de imágenes cross-origin para Anticipos (evita CORS)
anticipos-content.js    — panel flotante en Chateapro
anticipos-styles.css    — estilos del panel (paleta REDKING)
dropi-content.js        — detector de duplicados en Dropi
dropi-styles.css        — resaltado de filas duplicadas
novedades-content.js    — panel flotante de búsqueda + registro de novedades en Dropi
novedades-styles.css    — estilos del panel (réplica del modal "Nueva Novedad")
popup.html/css          — popup con pestañas
popup-tabs.js            — cambia entre pestañas
popup-anticipos.js      — lógica de la pestaña Anticipos
popup-dropi.js           — lógica de la pestaña Duplicados Dropi
```

## Notas técnicas

- Ver `extension-anticipos-chateapro/README.md` para el detalle de autenticación Firebase, filtrado de tiendas por usuario y el motivo del proxy de imágenes en `background.js` — todo eso se mantiene igual aquí, solo cambiaron los nombres de archivo.
- **Novedades** reutiliza la misma sesión/tienda de Anticipos (no tiene pestaña propia en el popup): usa `novedades/{tienda}/{mes}/{id}` — cada guía puede tener varias evidencias, en `soluciones/{key}` (estructura nueva) o `sol1/sol2/sol3` (estructura vieja, solo lectura para el historial).
- La sincronización de contadores (`sincronizarGD` en `novedades-content.js`) escribe en `gestiones_diarias/{tienda}/{mes}/{asesorKey}/dias/{dia}`, bajo la clave del asesor de la cuenta logueada en la extensión (no la de quien originalmente creó la novedad) — mismo comportamiento que tiene `_novSyncGD` dentro de `index.html`.

# API de ventas del bot — REDKING

Dos Cloud Functions para que el bot de **ChateaPro** registre ventas en REDKING y
consulte si un pedido ya está registrado.

El flujo es de **una sola vía**: ChateaPro manda, REDKING guarda. Nada vuelve
hacia el bot más allá de la respuesta, y REDKING nunca le consulta nada.

```
ChateaPro ──POST──► ventas         ──► ventas_bot/{empresaId}/{mes}/{clave}
          ──GET───► ventasExiste   ──► ventas_bot_idx/{empresaId}/{clave}
```

Corren **dentro del mismo proyecto de Firebase** que la base, así que el Admin
SDK se autentica solo: no hay cuenta de servicio que generar, ni clave privada
que guardar o rotar, ni variables de entorno.

Las ventas quedan al lado de gestiones, novedades y anticipos, con las mismas
tiendas.

## Los dos endpoints

Después de desplegar, las URLs son:

```
https://us-central1-<TU-PROYECTO>.cloudfunctions.net/ventas
https://us-central1-<TU-PROYECTO>.cloudfunctions.net/ventasExiste
```

### 1. Consultar si el pedido ya existe

Se llama **antes** de registrar, para no reenviar algo que ya está.

```
GET  /ventasExiste?workspace=WS-1&telefono=3001112233&fecha_compra=2026-08-13
POST /ventasExiste   { "workspace": "...", "telefono": "...", "fecha_compra": "..." }
```

```json
{ "ok": true, "existe": true, "estado": "CONFIRMADO", "mes": "2026-08", "registrado": 1765432100000 }
{ "ok": true, "existe": false }
```

Acepta GET y POST porque no todas las plataformas dejan elegir el método.

### 2. Registrar la venta

```
POST /ventas
```

```json
{
  "workspace":      "WS-3D-COMPANY",
  "tienda":         "3D Company",
  "fecha_compra":   "2026-08-13",
  "fecha_registro": "2026-08-13 09:12",
  "nombre":         "Nombre Apellido",
  "telefono":       "3001112233",
  "ciudad":         "Medellín",
  "departamento":   "Antioquia",
  "order":          "2 CEPILLOS DE BAMBU",
  "producto":       "CEPILLO BAMBU",
  "cantidad":       2,
  "valor":          89000,
  "estado_orden":   "CONFIRMADO",
  "id_anuncio":     "120312345678"
}
```

```json
{ "ok": true, "duplicado": false, "id": "3001112233_20260813", "mes": "2026-08" }
{ "ok": true, "duplicado": true,  "id": "...", "estado_actualizado": true, "estado": "CANCELADO" }
```

**Nunca devuelve error por duplicado.** Un `4xx` haría que ChateaPro siga
reintentando algo que ya está bien guardado.

Cada campo acepta varias formas de nombrarse (`telefono`, `TELEFONO`,
`Numero de telefono`…), así que el flujo del bot puede mandar lo que le quede
cómodo.

## Cómo se identifica un pedido

La clave es **teléfono + fecha de compra**, normalizados:

```
"+57 300 111 2233" + "13/08/2026"  ─┐
"3001112233"       + "2026-08-13"  ─┴─►  3001112233_20260813
```

Al ser determinística, un reintento del bot cae sobre el mismo registro en vez
de crear uno nuevo. **`order` no sirve como identificador**: es la orden en
texto ("2 CEPILLOS DE BAMBU") y se repite entre clientes distintos.

**Limitación aceptada:** si el mismo cliente compra dos veces el mismo día, la
segunda se toma como repetida y solo actualiza el estado de la primera. Si eso
empieza a pasar seguido, la salida es que el bot mande un identificador propio y
usarlo como clave.

## Si el pedido ya existía

Solo se actualiza el **estado**. El resto de los campos queda como entró la
primera vez, y el cambio se anota en `historial_estado`: una orden puede pasar
de CONFIRMADO a CANCELADO, y perder ese recorrido dejaría la tabla contando solo
el final de la historia.

## Puesta en marcha

Requiere el plan **Blaze** (pago por uso). Para el volumen de un bot de ventas
el costo real es cero o centavos, pero Cloud Functions no corre en el plan
gratuito.

### 1. Reglas de Firebase

Pegar los tres bloques de `reglas-firebase.json` dentro de las reglas que ya
existen. **No publicar ese archivo tal cual**: no es el set completo y borraría
todo lo demás.

Sin esto, la pestaña de Ventas Bot en REDKING muestra "No se pudieron leer las
ventas del bot".

### 2. Desplegar

```bash
cd functions
npm install
cd ..
npx firebase deploy --only functions
```

La primera vez pide habilitar las APIs de Cloud Functions y Artifact Registry; el
CLI lo ofrece solo.

### 3. Conectar la tienda desde el panel

**Centro de Operaciones → 🔌 Integraciones** → elegí la tienda → *Conectar
tienda*. Genera el código (`WS-3D-COMPANY`) y una clave de 48 hex, y los deja en
`bot_workspaces/{codigo}`. Desde ahí también se **revoca** (el bot deja de poder
escribir sin borrar las ventas ya registradas) y se **genera una clave nueva** si
la actual se filtró.

El selector solo ofrece las tiendas del admin logueado: un workspace apuntando a
una empresa ajena dejaría entrar ventas donde no corresponde.

### 4. Configurar ChateaPro

**La documentación para pegar en el bot está en el panel**, dentro de la tarjeta
de cada tienda: botón *📄 Cómo conectarlo*. Sale con el workspace de esa tienda
ya puesto y con botón de copiar en cada bloque — evita el error más común, que es
pegar el ejemplo genérico y olvidarse de reemplazar el código. La clave no se
escribe ahí a propósito: se copia con el botón 📋 de arriba.

Lo mismo, en resumen: apuntar el webhook a la URL de `ventas`, con la clave en un
header:

```
X-Api-Key: <la clave>
```

Si ChateaPro no deja poner headers, se acepta también `?api_key=<clave>` en la
URL — pero ahí queda escrita en los logs del proveedor, así que es la opción de
último recurso.

Para la validación previa, apuntar a `ventasExiste` con los mismos datos.

## Probar

```bash
npm test    # 78 pruebas, sin tocar Firebase ni levantar el emulador
```

Cubren la normalización (teléfono, fecha, clave, valor) y los handlers reales
contra una base en memoria: autenticación, aislamiento entre tiendas, alta,
consulta, reintento sin duplicar y cambio de estado sin pisar el resto.

Contra el servicio ya desplegado:

```bash
curl -X POST https://us-central1-<PROYECTO>.cloudfunctions.net/ventas \
  -H "Content-Type: application/json" -H "X-Api-Key: <clave>" \
  -d '{"workspace":"WS-3D-COMPANY","telefono":"3001112233","fecha_compra":"2026-08-13","valor":89000,"producto":"CEPILLO BAMBU","cantidad":2,"estado_orden":"CONFIRMADO"}'
```

Y en local, sin desplegar:

```bash
npx firebase emulators:start --only functions
```

## Seguridad

El **workspace** dice a qué tienda va la venta, pero viaja en el payload y no
prueba nada: cualquiera que lo descubra podría inyectar ventas falsas. Por eso se
exige además una **API key por tienda**, que se busca **dentro** del nodo de ese
workspace — una clave sirve solo para su tienda, y hay pruebas que lo verifican
en los dos sentidos.

Las funciones escriben con permisos de administrador y **no pasan por las reglas
de seguridad**: la validación de quién puede escribir qué la hace este código. Por
eso las reglas dejan `ventas_bot` en solo lectura, y `bot_workspaces` —donde vive
la clave— solo para admins.

`maxInstances: 10` acota el gasto: si algo entra en bucle, ese es el techo.

## Qué se guarda

```
ventas_bot/{empresaId}/{mes}/{clave}
  telefono, fecha_compra, fecha_registro, nombre, ciudad, departamento,
  order, producto, cantidad, valor, estado_orden, id_anuncio,
  tienda, workspace, ts,
  historial_estado[]   ← cada cambio de estado, con su fecha
  _raw                 ← el payload tal como llegó

ventas_bot_idx/{empresaId}/{clave}
  { mes, ts, estado }  ← para que ventasExiste responda sin leer el mes entero
```

`_raw` guarda el payload original a propósito: si mañana aparece un campo que no
se estaba mapeando, se reprocesa desde ahí en vez de pedir que se vuelvan a
disparar las ventas. El `{mes}` sale de la **fecha de compra**, igual que se
organiza todo lo demás en REDKING.

## Dónde se ve

**Gestiones Diarias → 🤖 Ventas Bot**: tabla del mes con buscador, filtros por
estado y totales. Es solo lectura — el nodo lo escriben estas funciones.

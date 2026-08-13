# API de ventas del bot — REDKING

Dos endpoints para que el bot de **ChateaPro** registre ventas en REDKING y
consulte si un pedido ya está registrado.

El flujo es de **una sola vía**: ChateaPro manda, REDKING guarda. Nada vuelve
hacia el bot más allá de la respuesta, y REDKING nunca le consulta nada.

```
ChateaPro ──POST──► Vercel /api/ventas ──► Firebase  ventas_bot/{empresaId}/{mes}/{clave}
          ──GET───► Vercel /api/ventas/existe        ventas_bot_idx/{empresaId}/{clave}
```

Corre en Vercel pero escribe en el Firebase de siempre, así que las ventas
quedan al lado de gestiones, novedades y anticipos, con las mismas tiendas.

## Los dos endpoints

### 1. Consultar si el pedido ya existe

Se llama **antes** de registrar, para no reenviar algo que ya está.

```
GET  /api/ventas/existe?workspace=WS-1&telefono=3001112233&fecha_compra=2026-08-13
POST /api/ventas/existe   { "workspace": "...", "telefono": "...", "fecha_compra": "..." }
```

```json
{ "ok": true, "existe": true, "estado": "CONFIRMADO", "mes": "2026-08", "registrado": 1765432100000 }
{ "ok": true, "existe": false }
```

Acepta GET y POST porque no todas las plataformas dejan elegir el método.

### 2. Registrar la venta

```
POST /api/ventas
```

```json
{
  "workspace":      "WS-3D-001",
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

### 1. Cuenta de servicio de Firebase

Consola de Firebase → ⚙️ Configuración del proyecto → **Cuentas de servicio** →
*Generar nueva clave privada*. Descarga un JSON.

**Ese archivo no va al repo ni se le pasa a nadie.** Da acceso total a la base,
salteándose las reglas de seguridad.

### 2. Variables de entorno en Vercel

| Variable | Valor |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | El JSON completo del paso 1, en una sola línea |
| `FIREBASE_DB_URL` | `https://gestion-logistica-86fd7-default-rtdb.firebaseio.com` |

### 3. Reglas de Firebase

Pegar los tres bloques de `reglas-firebase.json` dentro de las reglas que ya
existen. **No publicar ese archivo tal cual**: no es el set completo y borraría
todo lo demás.

### 4. Desplegar

```bash
cd api-ventas-bot
npm install
npx vercel        # preview
npx vercel --prod # producción
```

### 5. Conectar la tienda desde el panel

**Centro de Operaciones → 🤖 Bot de ventas** → elegí la tienda → *Conectar
tienda*. Genera el código (`WS-3D-COMPANY`) y una clave de 48 hex, y los deja
guardados en `bot_workspaces/{codigo}`. Desde ahí también se **revoca** (el bot
deja de poder escribir sin borrar las ventas ya registradas) y se **genera una
clave nueva** si la actual se filtró.

El selector solo ofrece las tiendas del admin logueado: un workspace apuntando a
una empresa ajena dejaría entrar ventas donde no corresponde.

El **workspace** dice a qué tienda va la venta; la **API key** prueba que quien
manda es tu bot. Hacen falta las dos: el workspace viaja en el payload y no es
un secreto.

### 6. Configurar ChateaPro

La API key va en un header, que es lo correcto:

```
X-Api-Key: <la clave>
```

Si ChateaPro no deja poner headers, se acepta también `?api_key=<clave>` en la
URL — pero ahí queda escrita en los logs del proveedor, así que es la opción de
último recurso.

## Probar

```bash
npm test    # normalización de teléfono, fecha, clave y valor — no toca Firebase
```

Contra el servicio ya desplegado:

```bash
curl -X POST https://<tu-deploy>.vercel.app/api/ventas \
  -H "Content-Type: application/json" -H "X-Api-Key: <clave>" \
  -d '{"workspace":"WS-3D-001","telefono":"3001112233","fecha_compra":"2026-08-13","valor":89000,"producto":"CEPILLO BAMBU","cantidad":2,"estado_orden":"CONFIRMADO"}'

curl "https://<tu-deploy>.vercel.app/api/ventas/existe?workspace=WS-3D-001&telefono=3001112233&fecha_compra=2026-08-13" \
  -H "X-Api-Key: <clave>"
```

## Qué se guarda

```
ventas_bot/{empresaId}/{mes}/{clave}
  telefono, fecha_compra, fecha_registro, nombre, ciudad, departamento,
  order, producto, cantidad, valor, estado_orden, id_anuncio,
  tienda, workspace, ts,
  historial_estado[]   ← cada cambio de estado, con su fecha
  _raw                 ← el payload tal como llegó

ventas_bot_idx/{empresaId}/{clave}
  { mes, ts, estado }  ← para que /existe responda sin leer el mes entero
```

`_raw` guarda el payload original a propósito: si mañana aparece un campo que no
se estaba mapeando, se reprocesa desde ahí en vez de pedir que se vuelvan a
disparar las ventas. El `{mes}` sale de la **fecha de compra**, igual que se
organiza todo lo demás en REDKING.

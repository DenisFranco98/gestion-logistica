# Detector de Pedidos Duplicados — Dropi

Extensión de Chrome que revisa la tabla de "Mis Pedidos" en `app.dropi.co/dashboard/orders` y resalta pedidos duplicados.

## Cómo detecta duplicados

- **⛔ Rojo — Duplicado exacto**: mismo cliente (nombre) y mismo producto en 2+ filas.
- **🔁 Amarillo — Cliente repetido**: mismo nombre de cliente en 2+ filas (distintos productos).
- **📞 Contorno azul — Mismo teléfono**: mismo número de teléfono (extraído del texto "Tel: ...") en 2+ filas, aunque el nombre esté escrito distinto.

El resultado se recalcula solo cuando la tabla cambia (orden, filtro, etc.) y también se puede forzar desde el popup con "Volver a escanear".

## Instalación (modo desarrollador)

1. Abre Chrome y ve a `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Clic en **Cargar descomprimida** y selecciona esta carpeta (`extension-duplicados-dropi`).
4. Entra a `https://app.dropi.co/dashboard/orders` — las filas duplicadas se resaltan automáticamente.
5. Clic en el ícono de la extensión para ver el resumen de duplicados encontrados.

## Notas

- La extracción del nombre y el teléfono se basa en el patrón de texto de la celda "Cliente" (nombre en la primera línea, teléfono tras "Tel:"). Si Dropi cambia ese formato, habría que ajustar `extractClienteInfo` en `content.js`.
- Solo se activa en `app.dropi.co`.

# Cartoon Pizza · Web

Front-end del sistema de gestión de **Cartoon Pizza**. Son cuatro módulos según el rol de quien inicia sesión:

| Rol | Pantalla | Qué hace |
|---|---|---|
| Mesero | `mesas.html` | Elige mesa, arma el pedido y lo envía a cocina |
| Cocina | `cocina.html` | Ve los pedidos en tiempo real y los pasa a preparando, listo y servido |
| Caja | `caja.html` | Cobra los pedidos (efectivo, tarjeta o transferencia), controla mesas y ventas |
| Administrador | `admin.html` | Panel de ventas de los últimos 7 días, estadísticas del negocio (comparación de periodos, productos más vendidos, ventas por categoría, desempeño por mesero y por mesa, exportables a Excel y PDF) y gestión de usuarios (roles, activar/desactivar, restablecer contraseña), menú (con subida de fotos de los productos) y mesas. Desde su menú «Ir a» —visible en todas las pantallas cuando quien entró es admin— se mueve entre su panel y las de mesero, cocina y caja |

El reporte de ventas de Caja también se puede exportar a Excel y PDF.

El login admite correo/contraseña y Google. Todo lo que ocurre en una pantalla se refleja en las demás por WebSocket, sin recargar.

Es un sitio **estático** (HTML + Bootstrap + JavaScript sin build). El back-end vive en otro repositorio: **[cartoon-pizza-api](https://github.com/Sofira28/cartoon-pizza-api)**.

## Estructura

```
├── index.html               # Login y registro
├── registro-google.html     # Elegir rol tras entrar con Google por primera vez
├── auth-callback.html       # Punto de retorno del login con Google
├── mesas.html · cocina.html · caja.html · admin.html
└── assets/
    ├── css/styles.css
    ├── images/
    └── js/
        ├── config.js        # URL de la API (lo único que hay que editar al desplegar)
        ├── api.js           # Cliente de la API + sesión (JWT)
        ├── main.js          # Utilidades compartidas, conexión Socket.IO y el menú "Ir a" del admin
        ├── export.js        # Exportar reportes a Excel (SheetJS) y PDF (jsPDF), todo en el navegador
        └── login.js · registro-google.js · auth-callback.js · mesas.js · cocina.js · caja.js · admin.js
```

## Desarrollo local

1. Levanta la API (ver el README de `cartoon-pizza-api`), por defecto en `http://localhost:3001`.
2. Sirve este directorio en el puerto **5500** (es el origen que la API permite por defecto):

   ```bash
   npm run dev
   ```

3. Abre <http://localhost:5500>.

Si tu API corre en otra URL, cambia `API_URL` en `assets/js/config.js`.

## Despliegue

Al ser estático se puede publicar tal cual en GitHub Pages, Netlify, Vercel o Cloudflare Pages:

1. En `assets/js/config.js` pon `API_URL` con la URL pública de la API.
2. En la API, define `FRONTEND_URL` (y `CORS_ORIGINS` si hace falta) con la URL donde quedó publicado este front. Si no, el navegador bloqueará las peticiones por CORS.
3. Para el login con Google, la URI de redirección autorizada en Google Cloud es la de la **API** (`.../api/auth/google/callback`), no la del front.

## Notas de seguridad

- La sesión es un JWT guardado en `localStorage` y enviado como `Authorization: Bearer`. Todo el texto que escribe un usuario (observaciones, nombres) se escapa antes de pintarlo en pantalla.
- Este repositorio es público por naturaleza: **no pongas secretos en `config.js`**. Solo contiene la URL de la API.
- Los permisos reales los aplica la API; las redirecciones por rol en el front son solo comodidad.

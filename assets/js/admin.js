// Módulo de administración. Todo lo que se muestra viene de la API:
//   /users                    usuarios (crear, editar, cambiar rol, desactivar, restablecer contraseña)
//   /products?all=true        menú completo, incluidos los productos desactivados
//   /tables                   mesas (crear, editar, eliminar)
//   /reports/summary · /sales cifras del panel principal

let usuarioActual = null;
let usuarios = [];
let productos = [];
let mesas = [];
let resumen = null;
let ventasPorDia = [];

let usuarioEditando = null;   // null = creando
let productoEditando = null;
let imagenProducto = '';      // valor de "image" que se guardará (URL de la API, nombre antiguo o vacío)
let archivoImagen = null;     // imagen elegida que todavía no se ha subido
let imagenSubida = null;      // URL de la imagen ya subida (se reutiliza si hay que reintentar el guardado)
let mesaEditando = null;

const ZONA_HORARIA = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DIAS_PANEL = 7;

const ROLES = {
    admin: 'Administrador',
    mesero: 'Mesero',
    cocina: 'Cocina',
    caja: 'Caja'
};

const CATEGORIAS = ['Pizzas', 'Pizzetas', 'Hamburguesas', 'Perros Calientes', 'Bebidas', 'Postres'];

// Las fotos se reducen en el navegador antes de subirlas (el límite de la API es de 2 MB)
const IMAGEN_LADO_MAXIMO = 1200;
const IMAGEN_BYTES_MAXIMOS = 2 * 1024 * 1024;
const IMAGEN_TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const UBICACIONES = { interior: 'Interior', terraza: 'Terraza', barra: 'Barra' };

const ESTADOS_MESA = {
    available: { texto: 'Disponible', clase: 'status-available' },
    occupied: { texto: 'Ocupada', clase: 'status-occupied' },
    reserved: { texto: 'Reservada', clase: 'status-reserved' },
    maintenance: { texto: 'En mantenimiento', clase: 'status-maintenance' }
};

const METODOS_PAGO = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', unspecified: 'Sin especificar' };

document.addEventListener('DOMContentLoaded', function() {
    inicializarModuloAdmin();
});

async function inicializarModuloAdmin() {
    usuarioActual = await cargarDatosUsuario(['admin']);
    document.getElementById('nombreUsuario').textContent = usuarioActual.name;

    configurarNavegacion();
    prepararFormularios();
    configurarFiltros();
    configurarListenersSocket();

    await Promise.all([cargarPanel(), cargarUsuarios(), cargarProductos(), cargarMesas()]);
}

// ===== Utilidades =====

function mostrarAviso(mensaje, tipo = 'danger') {
    const aviso = document.createElement('div');
    aviso.className = `alert alert-${tipo} position-fixed top-0 start-50 translate-middle-x mt-3 z-3`;
    aviso.setAttribute('role', 'alert');
    aviso.textContent = mensaje;
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 4000);
}

function conAvisoDeError(promesa, mensaje) {
    return promesa.catch(error => {
        console.error(mensaje, error);
        mostrarAviso(`${mensaje}: ${error.message}`);
        return null;
    });
}

function mostrarErrorModal(idAlerta, mensaje) {
    const alerta = document.getElementById(idAlerta);
    alerta.textContent = mensaje;
    alerta.classList.toggle('d-none', !mensaje);
}

function abrirModal(idModal) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById(idModal)).show();
}

function cerrarModal(idModal) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById(idModal)).hide();
}

// Deshabilita el botón de guardar mientras la petición está en curso (evita duplicados por doble clic)
async function conBotonOcupado(idBoton, accion) {
    const boton = document.getElementById(idBoton);
    boton.disabled = true;
    try {
        return await accion();
    } finally {
        boton.disabled = false;
    }
}

// Hoy y hace (dias - 1) días, en hora local, en el formato ISO que espera la API
function rangoUltimosDias(dias) {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - (dias - 1));
    const fin = new Date();
    fin.setHours(23, 59, 59, 999);
    return { from: inicio.toISOString(), to: fin.toISOString() };
}

// "YYYY-MM-DD" en hora local (mismo formato con el que la API agrupa las ventas por día)
function claveDia(fecha) {
    return fecha.toLocaleDateString('en-CA');
}

// ===== Panel principal =====

// "Mar, 15 de sept": el navegador lo entrega en minúsculas
function etiquetaDia(fecha) {
    const texto = fecha.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

async function cargarPanel() {
    const hoy = rangoUltimosDias(1);
    const semana = rangoUltimosDias(DIAS_PANEL);
    const consulta = ({ from, to }) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const resultado = await conAvisoDeError(
        Promise.all([
            Api.get(`/reports/summary?${consulta(hoy)}`),
            Api.get(`/reports/sales?${consulta(semana)}&timezone=${encodeURIComponent(ZONA_HORARIA)}`)
        ]),
        'No se pudo cargar el panel'
    );
    if (!resultado) return;

    [resumen, ventasPorDia] = resultado;
    renderizarPanel();
}

function renderizarPanel() {
    document.getElementById('ventasHoy').textContent = formatearPesos(resumen.sales);
    document.getElementById('ticketPromedio').textContent = formatearPesos(resumen.averageTicket);
    document.getElementById('pedidosPorCobrar').textContent = resumen.pendingBilling;

    // Todos los días del rango, también los que no tuvieron ventas
    const porDia = new Map(ventasPorDia.map(dia => [dia.date, dia]));
    const dias = [];
    for (let i = DIAS_PANEL - 1; i >= 0; i--) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - i);
        const datos = porDia.get(claveDia(fecha)) || { total: 0, orders: 0 };
        dias.push({ fecha, ...datos });
    }
    const maximo = Math.max(...dias.map(dia => dia.total), 1);

    document.getElementById('tablaVentasDia').innerHTML = dias.map(dia => `
        <tr>
            <td>${escaparHtml(etiquetaDia(dia.fecha))}</td>
            <td>${dia.orders}</td>
            <td>${formatearPesos(dia.total)}</td>
            <td class="admin-col-barra"><div class="barra-ventas" style="width: ${Math.round((dia.total / maximo) * 100)}%"></div></td>
        </tr>
    `).join('');

    document.getElementById('tablaMetodosPago').innerHTML = Object.entries(METODOS_PAGO)
        .filter(([metodo]) => metodo !== 'unspecified' || resumen.byPaymentMethod.unspecified > 0)
        .map(([metodo, etiqueta]) => `
            <tr>
                <td>${etiqueta}</td>
                <td class="text-end fw-bold">${formatearPesos(resumen.byPaymentMethod[metodo] || 0)}</td>
            </tr>
        `).join('');
}

// Cifras que salen de las listas de usuarios, menú y mesas
function renderizarResumenNegocio() {
    const ocupadas = mesas.filter(mesa => mesa.status === 'occupied').length;
    document.getElementById('mesasOcupadas').textContent = `${ocupadas}/${mesas.length}`;

    const activos = usuarios.filter(usuario => usuario.active).length;
    const productosActivos = productos.filter(producto => producto.active).length;
    const filas = [
        ['Usuarios activos', `${activos} de ${usuarios.length}`],
        ['Productos en el menú', `${productosActivos} de ${productos.length}`],
        ['Mesas', mesas.length],
        ['Capacidad total', `${mesas.reduce((suma, mesa) => suma + mesa.capacity, 0)} personas`]
    ];
    document.getElementById('listaResumen').innerHTML = filas.map(([etiqueta, valor]) => `
        <li class="list-group-item d-flex justify-content-between">
            <span>${etiqueta}</span><strong>${valor}</strong>
        </li>
    `).join('');
}

// ===== Usuarios =====

async function cargarUsuarios() {
    const lista = await conAvisoDeError(Api.get('/users'), 'No se pudieron cargar los usuarios');
    if (!lista) return;
    usuarios = lista;
    renderizarUsuarios();
    renderizarResumenNegocio();
}

function usuariosFiltrados() {
    const texto = document.getElementById('busquedaUsuarios').value.trim().toLowerCase();
    const rol = document.getElementById('filtroRolUsuarios').value;
    const estado = document.getElementById('filtroEstadoUsuarios').value;

    return usuarios.filter(usuario =>
        (!texto || usuario.name.toLowerCase().includes(texto) || usuario.email.toLowerCase().includes(texto)) &&
        (!rol || usuario.role === rol) &&
        (!estado || String(usuario.active) === estado)
    );
}

function renderizarUsuarios() {
    const tabla = document.getElementById('tablaUsuarios');
    const lista = usuariosFiltrados();

    if (lista.length === 0) {
        tabla.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No hay usuarios que coincidan</td></tr>';
        return;
    }

    tabla.innerHTML = lista.map(usuario => {
        const esYo = usuario._id === usuarioActual._id;
        return `
            <tr class="${usuario.active ? '' : 'text-muted'}">
                <td>
                    ${escaparHtml(usuario.name)}${esYo ? ' <span class="badge bg-dark">Tú</span>' : ''}
                    ${usuario.hasGoogle ? '<i class="bi bi-google ms-1" title="Cuenta de Google"></i>' : ''}
                </td>
                <td>${escaparHtml(usuario.email)}</td>
                <td>${ROLES[usuario.role] || escaparHtml(usuario.role)}</td>
                <td>
                    <span class="badge badge-status ${usuario.active ? 'status-available' : 'status-maintenance'}">
                        ${usuario.active ? 'Activo' : 'Desactivado'}
                    </span>
                </td>
                <td class="text-nowrap">
                    <button class="btn btn-sm btn-outline-primary" onclick="abrirModalUsuario('${usuario._id}')" aria-label="Editar ${escaparHtml(usuario.name)}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm ${usuario.active ? 'btn-outline-danger' : 'btn-outline-success'}"
                            onclick="alternarUsuario('${usuario._id}')" ${esYo ? 'disabled title="No puedes desactivar tu propia cuenta"' : ''}>
                        ${usuario.active ? 'Desactivar' : 'Activar'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function abrirModalUsuario(id) {
    usuarioEditando = id ? usuarios.find(usuario => usuario._id === id) : null;
    const editando = Boolean(usuarioEditando);
    const esYo = editando && usuarioEditando._id === usuarioActual._id;

    document.getElementById('formUsuario').reset();
    mostrarErrorModal('errorUsuario', '');
    document.getElementById('tituloModalUsuario').textContent = editando ? 'Editar usuario' : 'Nuevo usuario';
    document.getElementById('ayudaClaveUsuario').textContent = editando
        ? 'Déjala vacía para conservar la actual. Si escribes una, reemplaza a la anterior.'
        : 'Mínimo 8 caracteres.';

    if (editando) {
        document.getElementById('usuarioNombre').value = usuarioEditando.name;
        document.getElementById('usuarioCorreo').value = usuarioEditando.email;
        document.getElementById('usuarioRol').value = usuarioEditando.role;
    }
    // Un admin no puede quitarse a sí mismo el rol (la API también lo impide)
    document.getElementById('usuarioRol').disabled = esYo;

    abrirModal('modalUsuario');
}

async function guardarUsuario(evento) {
    evento.preventDefault();
    const datos = {
        name: document.getElementById('usuarioNombre').value.trim(),
        email: document.getElementById('usuarioCorreo').value.trim(),
        role: document.getElementById('usuarioRol').value
    };
    const clave = document.getElementById('usuarioClave').value;

    if (!usuarioEditando && !clave) return mostrarErrorModal('errorUsuario', 'La contraseña es obligatoria');
    if (clave) datos.password = clave;

    await conBotonOcupado('guardarUsuario', async () => {
        try {
            if (usuarioEditando) {
                // Solo se envía lo que cambió. Un usuario de Google sin rol elegido siempre lleva el rol,
                // porque asignárselo es lo que le permite entrar.
                const cambios = {};
                for (const campo of ['name', 'email', 'password']) {
                    if (datos[campo] !== undefined && datos[campo] !== usuarioEditando[campo]) cambios[campo] = datos[campo];
                }
                if (datos.role !== usuarioEditando.role || usuarioEditando.needsRegistration) cambios.role = datos.role;
                if (document.getElementById('usuarioRol').disabled) delete cambios.role;

                if (Object.keys(cambios).length > 0) await Api.put(`/users/${usuarioEditando._id}`, cambios);
            } else {
                await Api.post('/users', datos);
            }
            cerrarModal('modalUsuario');
            mostrarAviso(usuarioEditando ? 'Usuario actualizado' : 'Usuario creado', 'success');
            await cargarUsuarios();
        } catch (error) {
            mostrarErrorModal('errorUsuario', error.message);
        }
    });
}

async function alternarUsuario(id) {
    const usuario = usuarios.find(item => item._id === id);
    if (!usuario) return;

    if (usuario.active && !confirm(`¿Desactivar a ${usuario.name}? Se le cerrará la sesión y no podrá volver a entrar hasta que lo actives.`)) return;

    try {
        await Api.put(`/users/${id}`, { active: !usuario.active });
        mostrarAviso(usuario.active ? 'Usuario desactivado' : 'Usuario activado', 'success');
        await cargarUsuarios();
    } catch (error) {
        mostrarAviso(error.message);
    }
}

// ===== Menú =====

async function cargarProductos() {
    const lista = await conAvisoDeError(Api.get('/products?all=true'), 'No se pudo cargar el menú');
    if (!lista) return;
    productos = lista;
    renderizarProductos();
    renderizarResumenNegocio();
}

function productosFiltrados() {
    const texto = document.getElementById('busquedaProductos').value.trim().toLowerCase();
    const categoria = document.getElementById('filtroCategoriaProductos').value;

    return productos.filter(producto =>
        (!texto || producto.name.toLowerCase().includes(texto)) &&
        (!categoria || producto.category === categoria)
    );
}

function renderizarProductos() {
    const tabla = document.getElementById('tablaProductos');
    const lista = productosFiltrados();

    if (lista.length === 0) {
        tabla.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay productos que coincidan</td></tr>';
        return;
    }

    tabla.innerHTML = lista.map(producto => `
        <tr class="${producto.active ? '' : 'text-muted'}">
            <td><img src="${escaparHtml(urlImagen(producto.image))}" alt="" class="miniatura-producto"></td>
            <td>
                <strong>${escaparHtml(producto.name)}</strong>
                <div class="small text-muted">${escaparHtml(producto.description)}</div>
            </td>
            <td>${escaparHtml(producto.category)}</td>
            <td>${formatearPesos(producto.price)}</td>
            <td>
                <span class="badge badge-status ${producto.active ? 'status-available' : 'status-maintenance'}">
                    ${producto.active ? 'En el menú' : 'Retirado'}
                </span>
            </td>
            <td class="text-nowrap">
                <button class="btn btn-sm btn-outline-primary" onclick="abrirModalProducto('${producto._id}')" aria-label="Editar ${escaparHtml(producto.name)}">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm ${producto.active ? 'btn-outline-danger' : 'btn-outline-success'}" onclick="alternarProducto('${producto._id}')">
                    ${producto.active ? 'Retirar' : 'Reactivar'}
                </button>
            </td>
        </tr>
    `).join('');
}

function llenarOpciones(idSelect, opciones, seleccionado) {
    const select = document.getElementById(idSelect);
    select.innerHTML = opciones
        .map(([valor, texto]) => `<option value="${escaparHtml(valor)}">${escaparHtml(texto)}</option>`)
        .join('');
    select.value = seleccionado;
}

function abrirModalProducto(id) {
    productoEditando = id ? productos.find(producto => producto._id === id) : null;
    const editando = Boolean(productoEditando);

    document.getElementById('formProducto').reset();
    mostrarErrorModal('errorProducto', '');
    document.getElementById('tituloModalProducto').textContent = editando ? 'Editar producto' : 'Nuevo producto';

    llenarOpciones('productoCategoria', CATEGORIAS.map(categoria => [categoria, categoria]), editando ? productoEditando.category : CATEGORIAS[0]);

    imagenProducto = editando ? productoEditando.image || '' : '';
    archivoImagen = null;
    imagenSubida = null;
    mostrarVistaPrevia(urlImagen(imagenProducto));

    if (editando) {
        document.getElementById('productoNombre').value = productoEditando.name;
        document.getElementById('productoDescripcion').value = productoEditando.description;
        document.getElementById('productoPrecio').value = productoEditando.price;
    }

    abrirModal('modalProducto');
}

function mostrarVistaPrevia(url) {
    document.getElementById('vistaPreviaImagen').src = url;
}

function elegirImagen(evento) {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    if (!IMAGEN_TIPOS.includes(archivo.type)) {
        evento.target.value = '';
        return mostrarErrorModal('errorProducto', 'La imagen debe ser PNG, JPG, WebP o GIF');
    }
    mostrarErrorModal('errorProducto', '');
    archivoImagen = archivo;
    imagenSubida = null;
    mostrarVistaPrevia(URL.createObjectURL(archivo));
}

function quitarImagen() {
    imagenProducto = '';
    archivoImagen = null;
    imagenSubida = null;
    document.getElementById('productoImagen').value = '';
    mostrarVistaPrevia(urlImagen(''));
}

// Reduce la imagen si es muy grande o pesada (los GIF se dejan tal cual para no perder la animación)
async function prepararImagen(archivo) {
    if (archivo.type === 'image/gif') return archivo;

    let bitmap;
    try {
        bitmap = await createImageBitmap(archivo);
    } catch {
        throw new Error('No se pudo leer la imagen. Prueba con otro archivo.');
    }

    const escala = Math.min(1, IMAGEN_LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && archivo.size <= IMAGEN_BYTES_MAXIMOS) {
        bitmap.close();
        return archivo;
    }

    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    const contexto = lienzo.getContext('2d');
    const tipo = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
    if (tipo === 'image/jpeg') {
        // JPEG no tiene transparencia: sin esto, las zonas transparentes saldrían negras
        contexto.fillStyle = '#ffffff';
        contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    }
    contexto.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close();

    const reducida = await new Promise(resolver => lienzo.toBlob(resolver, tipo, 0.85));
    if (!reducida || reducida.size > IMAGEN_BYTES_MAXIMOS) throw new Error('La imagen es demasiado pesada (máximo 2 MB)');
    return reducida;
}

// Devuelve el valor de "image" para guardar; si se eligió un archivo nuevo, lo sube primero
async function resolverImagenProducto() {
    if (!archivoImagen) return imagenProducto;
    if (!imagenSubida) {
        const { url } = await Api.upload('/images', await prepararImagen(archivoImagen));
        imagenSubida = url;
    }
    return imagenSubida;
}

async function guardarProducto(evento) {
    evento.preventDefault();
    const precio = document.getElementById('productoPrecio').value;
    if (precio === '' || Number(precio) < 0) return mostrarErrorModal('errorProducto', 'Precio inválido');

    const datos = {
        name: document.getElementById('productoNombre').value.trim(),
        description: document.getElementById('productoDescripcion').value.trim(),
        price: Number(precio),
        category: document.getElementById('productoCategoria').value
    };

    await conBotonOcupado('guardarProducto', async () => {
        try {
            // Al editar solo se envía la imagen si cambió: así un producto con imagen en formato antiguo
            // ("/images/pizza.jpg") se puede editar sin tocarla
            const imagen = await resolverImagenProducto();
            if (!productoEditando || imagen !== (productoEditando.image || '')) datos.image = imagen;
            if (productoEditando) {
                await Api.put(`/products/${productoEditando._id}`, datos);
            } else {
                await Api.post('/products', datos);
            }
            cerrarModal('modalProducto');
            mostrarAviso(productoEditando ? 'Producto actualizado' : 'Producto creado', 'success');
            await cargarProductos();
        } catch (error) {
            mostrarErrorModal('errorProducto', error.message);
        }
    });
}

// Los productos no se borran: se retiran del menú y los pedidos antiguos conservan su nombre y precio
async function alternarProducto(id) {
    const producto = productos.find(item => item._id === id);
    if (!producto) return;

    try {
        await Api.put(`/products/${id}`, { active: !producto.active });
        mostrarAviso(producto.active ? 'Producto retirado del menú' : 'Producto de nuevo en el menú', 'success');
        await cargarProductos();
    } catch (error) {
        mostrarAviso(error.message);
    }
}

// ===== Mesas =====

async function cargarMesas() {
    const lista = await conAvisoDeError(Api.get('/tables'), 'No se pudieron cargar las mesas');
    if (!lista) return;
    mesas = lista;
    renderizarMesas();
    renderizarResumenNegocio();
}

function renderizarMesas() {
    const tabla = document.getElementById('tablaMesas');

    if (mesas.length === 0) {
        tabla.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Aún no hay mesas</td></tr>';
        return;
    }

    tabla.innerHTML = mesas.map(mesa => {
        const estado = ESTADOS_MESA[mesa.status] || { texto: mesa.status, clase: '' };
        return `
            <tr>
                <td><strong>Mesa ${mesa.number}</strong></td>
                <td>${mesa.capacity} personas</td>
                <td>${UBICACIONES[mesa.location] || escaparHtml(mesa.location)}</td>
                <td><span class="badge badge-status ${estado.clase}">${estado.texto}</span></td>
                <td class="text-nowrap">
                    <button class="btn btn-sm btn-outline-primary" onclick="abrirModalMesa('${mesa._id}')" aria-label="Editar mesa ${mesa.number}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarMesa('${mesa._id}')" aria-label="Eliminar mesa ${mesa.number}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function abrirModalMesa(id) {
    mesaEditando = id ? mesas.find(mesa => mesa._id === id) : null;
    const editando = Boolean(mesaEditando);

    document.getElementById('formMesa').reset();
    mostrarErrorModal('errorMesa', '');
    document.getElementById('tituloModalMesa').textContent = editando ? `Editar mesa ${mesaEditando.number}` : 'Nueva mesa';

    if (editando) {
        document.getElementById('mesaNumero').value = mesaEditando.number;
        document.getElementById('mesaCapacidad').value = mesaEditando.capacity;
        document.getElementById('mesaUbicacion').value = mesaEditando.location;
    } else {
        // Propone el siguiente número libre
        document.getElementById('mesaNumero').value = Math.max(0, ...mesas.map(mesa => mesa.number)) + 1;
        document.getElementById('mesaCapacidad').value = 4;
    }

    abrirModal('modalMesa');
}

async function guardarMesa(evento) {
    evento.preventDefault();
    const datos = {
        number: Number(document.getElementById('mesaNumero').value),
        capacity: Number(document.getElementById('mesaCapacidad').value),
        location: document.getElementById('mesaUbicacion').value
    };

    await conBotonOcupado('guardarMesa', async () => {
        try {
            if (mesaEditando) {
                await Api.put(`/tables/${mesaEditando._id}`, datos);
            } else {
                await Api.post('/tables', datos);
            }
            cerrarModal('modalMesa');
            mostrarAviso(mesaEditando ? 'Mesa actualizada' : 'Mesa creada', 'success');
            await cargarMesas();
        } catch (error) {
            mostrarErrorModal('errorMesa', error.message);
        }
    });
}

async function eliminarMesa(id) {
    const mesa = mesas.find(item => item._id === id);
    if (!mesa || !confirm(`¿Eliminar la mesa ${mesa.number}?`)) return;

    try {
        await Api.delete(`/tables/${id}`);
        mostrarAviso('Mesa eliminada', 'success');
        await cargarMesas();
    } catch (error) {
        mostrarAviso(error.message);
    }
}

// ===== Eventos =====

function prepararFormularios() {
    document.getElementById('formUsuario').addEventListener('submit', guardarUsuario);
    document.getElementById('formProducto').addEventListener('submit', guardarProducto);
    document.getElementById('formMesa').addEventListener('submit', guardarMesa);
    document.getElementById('productoImagen').addEventListener('change', elegirImagen);
    document.getElementById('quitarImagen').addEventListener('click', quitarImagen);

    const filtroCategoria = document.getElementById('filtroCategoriaProductos');
    CATEGORIAS.forEach(categoria => filtroCategoria.add(new Option(categoria, categoria)));
}

function configurarFiltros() {
    ['busquedaUsuarios', 'filtroRolUsuarios', 'filtroEstadoUsuarios'].forEach(id =>
        document.getElementById(id).addEventListener('input', renderizarUsuarios));
    ['busquedaProductos', 'filtroCategoriaProductos'].forEach(id =>
        document.getElementById(id).addEventListener('input', renderizarProductos));
}

// Varios eventos seguidos provocan una sola recarga
let temporizadorRefresco = null;
function programarRefresco() {
    clearTimeout(temporizadorRefresco);
    temporizadorRefresco = setTimeout(() => Promise.all([cargarPanel(), cargarMesas()]), 250);
}

function configurarListenersSocket() {
    socket.on('orderStatusUpdate', programarRefresco);
    socket.on('newOrder', programarRefresco);
    socket.on('tableStatusUpdate', programarRefresco);
}

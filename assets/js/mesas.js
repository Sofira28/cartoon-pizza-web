let pedidoActual = [];
let mesaActual = null;
let usuarioActual = null;
let productosMenu = [];
let productoSeleccionado = null;
let cantidadActual = 1;

// Items que la mesa ya tiene pedidos (solo lectura); pedidoActual contiene únicamente los nuevos
let pedidoExistente = [];
let mesaActualNumero = null;

const ESTADOS_MESA = {
    available: 'Libre',
    occupied: 'Ocupada',
    reserved: 'Reservada',
    maintenance: 'En mantenimiento'
};

// Inicialización del módulo mesas
document.addEventListener('DOMContentLoaded', function() {
    inicializarModuloMesas();
});

async function inicializarModuloMesas() {
    usuarioActual = await cargarDatosUsuario(['mesero']);
    configurarNavegacionAdmin(usuarioActual);
    document.getElementById('nombreUsuario').textContent = usuarioActual.name;
    
    await cargarMesas();
    await cargarMenu();
    configurarListenersSocketMesas();
    configurarEventListenersMesas();
}

// Cargar mesas desde la API
async function cargarMesas() {
    try {
        renderizarMesas(await Api.get('/tables'));
    } catch (error) {
        console.error('Error cargando mesas:', error);
        mostrarNotificacion('No se pudieron cargar las mesas: ' + error.message, 'error');
    }
}

// Renderizar mesas en grid 2x5
function renderizarMesas(mesas) {
    const contenedor = document.getElementById('contenedorMesas');
    contenedor.innerHTML = '';
    
    // Ordenar mesas por número
    mesas.sort((a, b) => a.number - b.number);
    
    // Crear contenedor grid
    const contenedorGrid = document.createElement('div');
    contenedorGrid.className = 'tables-grid';
    
    mesas.forEach(mesa => {
        const botonMesa = document.createElement('button');
        let claseBoton = 'btn table-btn ';
        
        if (mesa.status === 'occupied') {
            claseBoton += 'occupied-table';
        } else if (mesa.status === 'reserved') {
            claseBoton += 'reserved-table';
        } else if (mesa.status === 'maintenance') {
            claseBoton += 'maintenance-table';
        } else if (mesa._id === mesaActual) {
            claseBoton += 'active-table';
        } else {
            claseBoton += 'btn-outline-primary';
        }

        // La mesa seleccionada siempre se distingue, sea cual sea su estado
        if (mesa._id === mesaActual) {
            claseBoton += ' selected-table';
        }
        
        botonMesa.className = claseBoton;
        botonMesa.textContent = mesa.number;
        botonMesa.title = `Mesa ${mesa.number} - ${mesa.capacity} personas - ${ESTADOS_MESA[mesa.status] || mesa.status}`;
        if (mesa.status === 'maintenance') {
            botonMesa.disabled = true;
        } else {
            botonMesa.onclick = () => seleccionarMesa(mesa._id, mesa.number);
        }
        contenedorGrid.appendChild(botonMesa);
    });
    
    contenedor.appendChild(contenedorGrid);
}

// Cargar menú desde la API
async function cargarMenu() {
    try {
        productosMenu = await Api.get('/products');
    } catch (error) {
        console.error('Error cargando menú:', error);
        mostrarNotificacion('No se pudo cargar el menú: ' + error.message, 'error');
        productosMenu = [];
    }
    renderizarCategorias();
    renderizarProductos(productosMenu);
}

// Renderizar categorías
function renderizarCategorias() {
    const categorias = [...new Set(productosMenu.map(p => p.category))];
    const contenedor = document.getElementById('contenedorCategorias');
    
    contenedor.innerHTML = '<button class="btn category-btn active" onclick="filtrarPorCategoria(\'Todas\')">Todas</button>';
    
    categorias.forEach(categoria => {
        const boton = document.createElement('button');
        boton.className = 'btn category-btn';
        boton.textContent = categoria;
        boton.onclick = () => filtrarPorCategoria(categoria);
        contenedor.appendChild(boton);
    });
}

// Renderizar productos
function renderizarProductos(productos) {
    const contenedor = document.getElementById('contenedorProductos');
    contenedor.innerHTML = '';
    
    const categorias = [...new Set(productos.map(p => p.category))];
    
    categorias.forEach(categoria => {
        const productosCategoria = productos.filter(p => p.category === categoria);
        
        const tituloCategoria = document.createElement('h5');
        tituloCategoria.className = 'category-title';
        tituloCategoria.textContent = categoria;
        contenedor.appendChild(tituloCategoria);
        
        const fila = document.createElement('div');
        fila.className = 'product-grid';
        
        productosCategoria.forEach(producto => {
            const columna = document.createElement('div');
            
            columna.innerHTML = `
                <div class="card product-card">
                    <img src="${escaparHtml(urlImagen(producto.image))}" class="card-img-top" alt="${escaparHtml(producto.name)}">
                    <div class="card-body">
                        <h5 class="card-title">${escaparHtml(producto.name)}</h5>
                        <p class="card-text">${escaparHtml(producto.description)}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="product-price">${formatearPesos(producto.price)}</span>
                            <button class="btn add-to-order-btn" data-product-id="${producto._id}">
                                <i class="bi bi-plus-lg me-1"></i>Agregar
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            fila.appendChild(columna);
        });
        
        contenedor.appendChild(fila);
    });
}

// Seleccionar mesa
async function seleccionarMesa(idMesa, numeroMesa) {
    mesaActual = idMesa;
    document.getElementById('badgeMesaActual').textContent = `Mesa: ${numeroMesa}`;
    mesaActualNumero = numeroMesa;
    actualizarBarraPedido();
    
    // Actualizar visualización de mesas
    cargarMesas();
    await cargarPedidoExistente();
}

// Carga lo que la mesa seleccionada ya tiene pedido (pedidos abiertos, aún sin pagar)
async function cargarPedidoExistente() {
    if (!mesaActual) return;

    try {
        const pedidosAbiertos = await Api.get(`/orders?table=${mesaActual}&active=true&sort=asc`);
        pedidoExistente = pedidosAbiertos.flatMap(pedido => pedido.items);
    } catch (error) {
        console.error('Error cargando pedido:', error);
        pedidoExistente = [];
    }
    actualizarVisualizacionPedido();
}

// Configurar listeners de Socket.IO para mesas
function configurarListenersSocketMesas() {
    socket.on('orderStatusUpdate', (datos) => {
        cargarMesas();
        if (mesaActual && datos.tableId === mesaActual) {
            cargarPedidoExistente();
        }
    });

    socket.on('tableStatusUpdate', () => cargarMesas());
}

// Configurar event listeners específicos de mesas
function configurarEventListenersMesas() {
    // Buscador de productos
    document.getElementById('botonBuscar').addEventListener('click', buscarProductos);
    document.getElementById('buscarProducto').addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            buscarProductos();
        }
    });

    // Delegación de eventos para botones de agregar
    document.getElementById('contenedorProductos').addEventListener('click', function(e) {
        if (e.target.closest('.add-to-order-btn')) {
            const boton = e.target.closest('.add-to-order-btn');
            const idProducto = boton.getAttribute('data-product-id');
            abrirModalPersonalizar(idProducto);
        }
    });

    // Confirmar agregar al pedido
    document.getElementById('confirmarAgregar').addEventListener('click', agregarAlPedido);
}

// Función para cambiar cantidad
function cambiarCantidad(cambio) {
    cantidadActual += cambio;
    
    // Validar que no sea menor a 1
    if (cantidadActual < 1) {
        cantidadActual = 1;
    }
    
    // Actualizar display
    document.getElementById('displayCantidad').textContent = cantidadActual;
    document.getElementById('cantidadProducto').value = cantidadActual;
    
    // Actualizar subtotal
    actualizarSubtotal();
}

// Función para actualizar subtotal
function actualizarSubtotal() {
    if (!productoSeleccionado) return;
    
    const subtotal = productoSeleccionado.price * cantidadActual;
    document.getElementById('subtotalProducto').textContent = formatearPesos(subtotal);
}

// Función para obtener observaciones seleccionadas
function obtenerObservacionesSeleccionadas() {
    const checkboxes = document.querySelectorAll('.observaciones-grid .form-check-input:checked');
    const observaciones = Array.from(checkboxes).map(cb => cb.value);
    const notasPersonalizadas = document.getElementById('notasProducto').value;
    
    let todasLasObservaciones = observaciones;
    
    if (notasPersonalizadas.trim() !== '') {
        todasLasObservaciones.push(notasPersonalizadas);
    }
    
    return todasLasObservaciones.join(', ');
}

// Función para limpiar el modal
function limpiarModalPersonalizar() {
    // Limpiar checkboxes
    document.querySelectorAll('.observaciones-grid .form-check-input').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Limpiar textarea
    document.getElementById('notasProducto').value = '';
    
    // Resetear cantidad
    cantidadActual = 1;
    document.getElementById('displayCantidad').textContent = '1';
    document.getElementById('cantidadProducto').value = '1';
}

// Abrir modal de personalización
function abrirModalPersonalizar(idProducto) {
    if (!mesaActual) {
        alert('Por favor, selecciona una mesa primero');
        return;
    }

    productoSeleccionado = productosMenu.find(p => p._id === idProducto);
    if (!productoSeleccionado) return;

    document.getElementById('nombreProductoModal').textContent = productoSeleccionado.name;
    document.getElementById('precioProductoModal').textContent = formatearPesos(productoSeleccionado.price);
    
    // Limpiar modal
    limpiarModalPersonalizar();
    
    // Actualizar subtotal inicial
    actualizarSubtotal();

    const modal = new bootstrap.Modal(document.getElementById('modalPersonalizar'));
    modal.show();
}

// Agregar producto al pedido
function agregarAlPedido() {
    if (!productoSeleccionado || !mesaActual) return;

    const observaciones = obtenerObservacionesSeleccionadas();
    const cantidad = parseInt(document.getElementById('cantidadProducto').value);

    const itemPedido = {
        product: productoSeleccionado._id,
        productName: productoSeleccionado.name,
        price: productoSeleccionado.price,
        quantity: cantidad,
        notes: observaciones
    };

    pedidoActual.push(itemPedido);
    actualizarVisualizacionPedido();

    // Mostrar confirmación
    mostrarNotificacion(` ${cantidad}x ${productoSeleccionado.name} agregado al pedido`);

    // Cerrar modal
    bootstrap.Modal.getInstance(document.getElementById('modalPersonalizar')).hide();
    productoSeleccionado = null;
}

// Nueva función para mostrar modal de confirmación
function mostrarConfirmacionEnvio() {
    if (!mesaActual) {
        alert('Por favor, selecciona una mesa');
        return;
    }

    if (pedidoActual.length === 0) {
        alert('No hay productos en el pedido');
        return;
    }

    // Calcular total
    let total = 0;
    pedidoActual.forEach(item => {
        total += item.price * item.quantity;
    });

    // Actualizar modal de confirmación
    document.getElementById('mesaConfirmacion').textContent = document.getElementById('badgeMesaActual').textContent.replace('Mesa: ', '');
    document.getElementById('totalConfirmacion').textContent = formatearPesos(total);

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalConfirmarEnvio'));
    modal.show();
}


function enviarACocina() {
    mostrarConfirmacionEnvio();
}


async function confirmarEnvioACocina() {
    const notasPedido = document.getElementById('notasPedido').value;
    
    try {
        // El servidor toma el mesero del token y los precios de la base de datos
        await Api.post('/orders', {
            tableId: mesaActual,
            notes: notasPedido,
            items: pedidoActual.map(({ product, quantity, notes }) => ({ product, quantity, notes }))
        });

        mostrarNotificacion('¡Pedido enviado a cocina exitosamente!');
        
        // Limpiar pedido actual
        pedidoActual = [];
        document.getElementById('notasPedido').value = '';
        bootstrap.Modal.getInstance(document.getElementById('modalConfirmarEnvio')).hide();

        // Refrescar lo pedido en la mesa y el estado de las mesas
        cargarMesas();
        await cargarPedidoExistente();
    } catch (error) {
        console.error('Error enviando pedido:', error);
        alert('Error al enviar el pedido: ' + error.message);
    }
}
// Función auxiliar para mostrar notificaciones
function mostrarNotificacion(mensaje, tipo = 'success') {
    const notificacion = document.createElement('div');
    notificacion.className = `alert alert-${tipo === 'error' ? 'danger' : 'success'} position-fixed top-0 start-50 translate-middle-x mt-3 z-3`;
    notificacion.style.minWidth = '300px';
    notificacion.style.textAlign = 'center';
    notificacion.innerHTML = `
        <i class="bi bi-${tipo === 'error' ? 'exclamation-triangle' : 'check-circle'} me-2"></i>
        ${escaparHtml(mensaje)}
    `;
    
    document.body.appendChild(notificacion);
    
    // Remover después de 3 segundos
    setTimeout(() => {
        notificacion.remove();
    }, 3000);
}

// Cancelar pedido
function cancelarPedido() {
    if (pedidoActual.length === 0) {
        alert('No hay productos por enviar para cancelar');
        return;
    }

    if (confirm('¿Descartar los productos que aún no se han enviado a cocina?')) {
        pedidoActual = [];
        actualizarVisualizacionPedido();
    }
}

// Actualizar la visualización del pedido
function actualizarVisualizacionPedido() {
    const contenedorPedidos = document.getElementById('pedidosActuales');
    const elementoTotal = document.getElementById('totalPedido');
    
    // El total incluye lo que la mesa ya pidió y lo nuevo
    const total = [...pedidoExistente, ...pedidoActual]
        .reduce((suma, item) => suma + item.price * item.quantity, 0);
    elementoTotal.textContent = formatearPesos(total);
    actualizarBarraPedido();
    
    contenedorPedidos.innerHTML = '';
    
    if (pedidoExistente.length === 0 && pedidoActual.length === 0) {
        contenedorPedidos.innerHTML = '<p class="text-center text-muted">No hay productos en el pedido</p>';
        return;
    }

    if (pedidoExistente.length > 0) {
        const titulo = document.createElement('small');
        titulo.className = 'text-muted fw-bold d-block mb-1';
        titulo.textContent = 'Ya pedido';
        contenedorPedidos.appendChild(titulo);

        pedidoExistente.forEach(item => {
            const elementoItem = document.createElement('div');
            elementoItem.className = 'order-item';
            elementoItem.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <span class="fw-bold">${escaparHtml(item.productName)} x${item.quantity}</span>
                    <span class="text-success fw-bold">${formatearPesos(item.price * item.quantity)}</span>
                </div>
                <small class="text-muted">${escaparHtml(item.notes) || 'Sin observaciones'}</small>
            `;
            contenedorPedidos.appendChild(elementoItem);
        });
    }

    if (pedidoActual.length > 0) {
        const titulo = document.createElement('small');
        titulo.className = 'text-muted fw-bold d-block mt-2 mb-1';
        titulo.textContent = 'Por enviar';
        contenedorPedidos.appendChild(titulo);
    }
    
    pedidoActual.forEach((item, indice) => {
        const elementoItem = document.createElement('div');
        elementoItem.className = 'order-item';
        elementoItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span class="fw-bold">${escaparHtml(item.productName)} x${item.quantity}</span>
                <span class="text-success fw-bold">${formatearPesos(item.price * item.quantity)}</span>
            </div>
            <small class="text-muted">${escaparHtml(item.notes) || 'Sin observaciones'}</small>
            <div class="d-flex justify-content-end mt-1">
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarDelPedido(${indice})">
                    <i class="bi bi-trash"></i> Eliminar
                </button>
            </div>
        `;
        contenedorPedidos.appendChild(elementoItem);
    });
}

// Barra fija inferior (móvil y tablet): mesa, cantidad y total de lo que falta por enviar
function actualizarBarraPedido() {
    const cantidad = pedidoActual.reduce((suma, item) => suma + item.quantity, 0);
    const total = pedidoActual.reduce((suma, item) => suma + item.price * item.quantity, 0);

    document.getElementById('barraMesa').textContent = mesaActualNumero
        ? `Mesa ${mesaActualNumero} · ${cantidad} por enviar`
        : 'Selecciona una mesa';
    document.getElementById('barraTotal').textContent = formatearPesos(total);
}

// Lleva al panel del pedido (útil en pantallas pequeñas, donde queda arriba del menú)
function verPanelPedido() {
    document.getElementById('panelPedido').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Eliminar item del pedido
function eliminarDelPedido(indice) {
    pedidoActual.splice(indice, 1);
    actualizarVisualizacionPedido();
}

// Filtrar por categoría
function filtrarPorCategoria(categoria) {
    // Actualizar botones activos
    document.querySelectorAll('.category-btn').forEach(boton => {
        boton.classList.remove('active');
    });
    event.target.classList.add('active');

    if (categoria === 'Todas') {
        renderizarProductos(productosMenu);
        return;
    }

    const productosFiltrados = productosMenu.filter(p => p.category === categoria);
    renderizarProductos(productosFiltrados);
}

// Buscar productos
function buscarProductos() {
    const terminoBusqueda = document.getElementById('buscarProducto').value.toLowerCase().trim();
    
    if (terminoBusqueda === '') {
        renderizarProductos(productosMenu);
        return;
    }

    const productosFiltrados = productosMenu.filter(producto => 
        producto.name.toLowerCase().includes(terminoBusqueda) ||
        producto.description.toLowerCase().includes(terminoBusqueda) ||
        producto.category.toLowerCase().includes(terminoBusqueda)
    );

    renderizarProductos(productosFiltrados);
}

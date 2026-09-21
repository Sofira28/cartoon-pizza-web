let pedidos = [];
let usuarioActual = null;
let filtrosActuales = {
    estado: 'all'
};
let temporizadores = {};


document.addEventListener('DOMContentLoaded', function() {
    inicializarModuloCocina();
});

async function inicializarModuloCocina() {
    usuarioActual = await cargarDatosUsuario(['cocina']);
    document.getElementById('nombreUsuario').textContent = usuarioActual.name;
    
    await cargarPedidos();
    configurarListenersSocketCocina();
    configurarEventListenersCocina();
    
    setInterval(cargarPedidos, 10000);
}


async function cargarPedidos() {
    try {
        pedidos = await Api.get('/orders?status=pending,preparing,ready&sort=asc');
        
        renderizarPedidos();
        actualizarEstadisticas();
        
    } catch (error) {
        console.error('Error cargando pedidos:', error);
        mostrarNotificacion('Error al cargar pedidos: ' + error.message, 'error');
    }
}


function configurarListenersSocketCocina() {
    
    socket.on('newOrder', (datosPedido) => {
        console.log('Nuevo pedido recibido:', datosPedido);
        mostrarNotificacion(`Nuevo pedido - Mesa ${datosPedido.tableNumber}`, 'info');
        cargarPedidos();
    });

    socket.on('orderStatusUpdate', (datos) => {
        console.log('Actualización de pedido:', datos);
        cargarPedidos();
    });
}


function configurarEventListenersCocina() {
    
    document.querySelectorAll('.filter-btn').forEach(boton => {
        boton.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            filtrosActuales.estado = this.dataset.status;
            renderizarPedidos();
        });
    });
}


function renderizarPedidos() {
    const contenedor = document.getElementById('contenedorPedidos');
    contenedor.innerHTML = '';
    
    const pedidosFiltrados = pedidos.filter(pedido => {
        if (filtrosActuales.estado === 'all') return true;
        return pedido.status === filtrosActuales.estado;
    });
    
    if (pedidosFiltrados.length === 0) {
        contenedor.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-check2-all" style="font-size: 3rem; color: #ccc;"></i>
                <p class="mt-3 text-muted">No hay pedidos ${obtenerTextoEstado(filtrosActuales.estado)}</p>
            </div>
        `;
        return;
    }
    
    pedidosFiltrados.forEach(pedido => {
        const elementoPedido = document.createElement('div');
        elementoPedido.className = `col-md-6 col-lg-4`;
        elementoPedido.dataset.id = pedido._id;
        
        const claseEstado = obtenerClaseEstado(pedido.status);
        const textoEstado = obtenerTextoEstado(pedido.status);
        const tiempoTranscurrido = obtenerTiempoTranscurrido(new Date(pedido.createdAt));
        
        elementoPedido.innerHTML = `
            <div class="order-card">
                <div class="order-header d-flex justify-content-between align-items-center ${obtenerClaseEncabezadoEstado(pedido.status)}">
                    <div>
                        <span class="badge status-badge ${claseEstado}">${textoEstado}</span>
                    </div>
                    <div class="timer">${formatearTiempo(tiempoTranscurrido)}</div>
                </div>
                <div class="order-body">
                    <h5 class="card-title" style="color: var(--color-red); font-family: 'Bangers', cursive;">Mesa ${pedido.tableNumber}</h5>
                    <p class="text-muted small">Pedido #${pedido._id.toString().slice(-4)}</p>
                    <p class="text-muted small">Mesero: ${escaparHtml(pedido.waiterName)}</p>
                    
                    ${pedido.notes ? `
                    <div class="order-item mb-2" style="background-color: #fff3cd; border-left: 4px solid #ffc107;">
                        <i class="bi bi-chat-dots me-1"></i><strong>Observaciones del Pedido:</strong> ${escaparHtml(pedido.notes)}
                    </div>
                    ` : ''}
                    
                    <div class="order-items">
                        ${pedido.items.map(item => `
                            <div class="order-item">
                                <div class="d-flex justify-content-between">
                                    <span class="fw-bold">${item.quantity}x ${escaparHtml(item.productName)}</span>
                                    <span class="text-success">${formatearPesos(item.price * item.quantity)}</span>
                                </div>
                                ${item.notes ? `
                                    <div class="observaciones-item mt-1">
                                        <small class="text-muted">
                                            <i class="bi bi-tag me-1"></i>
                                            <strong>Preparar:</strong> ${escaparHtml(item.notes)}
                                        </small>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <span class="fw-bold text-primary">Total: ${formatearPesos(pedido.total)}</span>
                        <div>
                            ${pedido.status === 'pending' ? `
                                <button class="btn btn-sm btn-kitchen btn-start iniciar-pedido" data-id="${pedido._id}">
                                    <i class="bi bi-play-circle me-1"></i>Preparar
                                </button>
                            ` : ''}
                            
                            ${pedido.status === 'preparing' ? `
                                <button class="btn btn-sm btn-kitchen btn-complete completar-pedido" data-id="${pedido._id}">
                                    <i class="bi bi-check2-circle me-1"></i>Terminar
                                </button>
                            ` : ''}
                            
                            ${pedido.status === 'ready' ? `
                                <button class="btn btn-sm btn-kitchen btn-delete eliminar-pedido" data-id="${pedido._id}">
                                    <i class="bi bi-check-lg me-1"></i>Entregado
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        contenedor.appendChild(elementoPedido);
    });
    
    adjuntarEventListenersCocina();
}


function adjuntarEventListenersCocina() {
    document.querySelectorAll('.iniciar-pedido').forEach(boton => {
        boton.addEventListener('click', function() {
            const idPedido = this.dataset.id;
            actualizarEstadoPedido(idPedido, 'preparing');
        });
    });
    
    document.querySelectorAll('.completar-pedido').forEach(boton => {
        boton.addEventListener('click', function() {
            const idPedido = this.dataset.id;
            actualizarEstadoPedido(idPedido, 'ready');
        });
    });
    
    document.querySelectorAll('.eliminar-pedido').forEach(boton => {
        boton.addEventListener('click', function() {
            const idPedido = this.dataset.id;
            actualizarEstadoPedido(idPedido, 'served');
        });
    });
}

// Actualizar el estado de un pedido (el servidor avisa a mesas y caja por Socket.IO)
async function actualizarEstadoPedido(idPedido, nuevoEstado) {
    try {
        await Api.put(`/orders/${idPedido}/status`, { status: nuevoEstado });
        mostrarNotificacion(`Pedido actualizado a: ${obtenerTextoEstado(nuevoEstado)}`, 'success');
        cargarPedidos();
    } catch (error) {
        console.error('Error actualizando pedido:', error);
        mostrarNotificacion('Error: ' + error.message, 'error');
    }
}

// Marcar todos los pedidos en preparación como listos
async function marcarTodosListos() {
    if (!confirm('¿Estás seguro de que deseas marcar TODOS los pedidos como listos?')) {
        return;
    }

    const pedidosPreparacion = pedidos.filter(pedido => pedido.status === 'preparing');

    try {
        for (const pedido of pedidosPreparacion) {
            await Api.put(`/orders/${pedido._id}/status`, { status: 'ready' });
        }
        mostrarNotificacion(`${pedidosPreparacion.length} pedidos marcados como listos`, 'success');
    } catch (error) {
        console.error('Error marcando pedidos como listos:', error);
        mostrarNotificacion('Error al marcar pedidos como listos: ' + error.message, 'error');
    }
    cargarPedidos();
}

// Actualizar estadísticas
function actualizarEstadisticas() {
    const contadorPendientes = pedidos.filter(p => p.status === 'pending').length;
    const contadorPreparacion = pedidos.filter(p => p.status === 'preparing').length;
    const contadorListos = pedidos.filter(p => p.status === 'ready').length;
    
    document.getElementById('contadorPendientes').textContent = contadorPendientes;
    document.getElementById('contadorPreparacion').textContent = contadorPreparacion;
    document.getElementById('contadorListos').textContent = contadorListos;
    
    const ahora = new Date();
    const tiempoPromedio = pedidos.length > 0 ? 
        Math.floor(pedidos.reduce((acumulador, pedido) => {
            return acumulador + ((ahora - new Date(pedido.createdAt)) / 60000);
        }, 0) / pedidos.length) : 0;
    
    document.getElementById('tiempoPromedio').textContent = `${Math.round(tiempoPromedio)}m`;
}

// Mostrar notificación
function mostrarNotificacion(mensaje, tipo = 'info') {
    const contenedorNotificaciones = document.getElementById('contenedorNotificaciones');
    const claseAlerta = tipo === 'error' ? 'alert-warning-kitchen' : 
                      tipo === 'success' ? 'alert-info-kitchen' : 'alert-info-kitchen';
    
    const notificacion = document.createElement('div');
    notificacion.className = `alert-kitchen ${claseAlerta}`;
    notificacion.innerHTML = `<small><i class="bi bi-${tipo === 'error' ? 'exclamation-triangle' : 'info-circle'} me-1"></i>${escaparHtml(mensaje)}</small>`;
    
    contenedorNotificaciones.insertBefore(notificacion, contenedorNotificaciones.firstChild);
    
    while (contenedorNotificaciones.children.length > 5) {
        contenedorNotificaciones.removeChild(contenedorNotificaciones.lastChild);
    }
    
    setTimeout(() => {
        if (notificacion.parentNode) {
            notificacion.parentNode.removeChild(notificacion);
        }
    }, 5000);
}

// Funciones auxiliares para estados
function obtenerClaseEstado(estado) {
    const clases = {
        'pending': 'status-pending',
        'preparing': 'status-preparing',
        'ready': 'status-ready',
        'served': 'status-completed',
        'paid': 'status-paid',
        'cancelled': 'status-cancelled'
    };
    return clases[estado] || 'status-pending';
}

function obtenerClaseEncabezadoEstado(estado) {
    const clases = {
        'pending': 'status-pending',
        'preparing': 'status-preparing',
        'ready': 'status-ready',
        'served': 'status-completed'
    };
    return clases[estado] || 'status-pending';
}

function obtenerTextoEstado(estado) {
    const textos = {
        'all': 'en ningún estado',
        'pending': 'pendientes',
        'preparing': 'en preparación',
        'ready': 'listos',
        'served': 'servidos',
        'paid': 'pagados',
        'cancelled': 'cancelados'
    };
    return textos[estado] || 'pendientes';
}

function obtenerTiempoTranscurrido(fecha) {
    const ahora = new Date();
    const diferencia = ahora - fecha;
    return Math.floor(diferencia / 60000); // minutos
}

function formatearTiempo(minutos) {
    if (minutos < 60) {
        return `${minutos}m`;
    } else {
        const horas = Math.floor(minutos / 60);
        const mins = minutos % 60;
        return `${horas}h ${mins}m`;
    }
}

function formatearPesos(valor) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(valor);
}

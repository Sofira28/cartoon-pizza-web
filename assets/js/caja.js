
let usuarioActual = null;
let pedidos = [];
let mesas = [];
let pedidoActual = null;

// Método de pago (valor que entiende la API) -> radio y panel del modal de facturación
const METODOS_PAGO = {
    cash: { radio: 'metodoEfectivo', panel: 'pagoEfectivo' },
    card: { radio: 'metodoTarjeta', panel: 'pagoTarjeta' },
    transfer: { radio: 'metodoTransferencia', panel: 'pagoTransferencia' }
};


document.addEventListener('DOMContentLoaded', function() {
    inicializarModuloCaja();
});

async function inicializarModuloCaja() {
    usuarioActual = await cargarDatosUsuario(['caja']);
    document.getElementById('nombreUsuario').textContent = usuarioActual.name;
    
    await cargarPedidos();
    await cargarMesas();
    configurarListenersSocket();
    configurarEventListenersCaja();
    
    // Actualizar datos cada 30 segundos
    setInterval(cargarPedidos, 30000);
    setInterval(cargarMesas, 30000);
}

// El back devuelve la mesa poblada ({ _id, number, ... }); esto obtiene su id en cualquier caso
function idMesaDePedido(pedido) {
    return pedido.table?._id || pedido.table;
}

// Mostrar un error visible sin bloquear la pantalla
function mostrarError(mensaje) {
    const aviso = document.createElement('div');
    aviso.className = 'alert alert-danger position-fixed top-0 start-50 translate-middle-x mt-3 z-3';
    aviso.textContent = mensaje;
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 4000);
}

// Cargar pedidos desde la API
async function cargarPedidos() {
    try {
        pedidos = await Api.get('/orders?limit=200');
        actualizarPanelPrincipal();
        actualizarSeccionFacturacion();
        actualizarSeccionMesas();
    } catch (error) {
        console.error('Error cargando pedidos:', error);
        mostrarError('No se pudieron cargar los pedidos: ' + error.message);
    }
}

// Cargar mesas desde la API
async function cargarMesas() {
    try {
        mesas = await Api.get('/tables');
        actualizarSeccionMesas();
        actualizarSelectorMesas();
    } catch (error) {
        console.error('Error cargando mesas:', error);
        mostrarError('No se pudieron cargar las mesas: ' + error.message);
    }
}

// Configurar listeners de Socket.IO para caja
function configurarListenersSocket() {
    socket.on('orderStatusUpdate', (datos) => {
        console.log('Actualización de pedido recibida:', datos);
        cargarPedidos();
    });

    socket.on('newOrder', (datosPedido) => {
        console.log('Nuevo pedido recibido:', datosPedido);
        cargarPedidos();
    });

    socket.on('tableStatusUpdate', (datosMesa) => {
        console.log('Actualización de mesa recibida:', datosMesa);
        actualizarMesaEspecifica(datosMesa.tableId, datosMesa.status);
        cargarMesas();
    });
}

//
function configurarEventListenersCaja() {
    configurarNavegacion();
    
    // Métodos de pago
    document.querySelectorAll('.payment-method').forEach(opcion => {
        opcion.addEventListener('click', function() {
            document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
            this.classList.add('selected');
            
            const metodo = METODOS_PAGO[this.getAttribute('data-method')];
            document.getElementById(metodo.radio).checked = true;
            
            // Mostrar solo el formulario del método elegido
            Object.values(METODOS_PAGO).forEach(m => {
                document.getElementById(m.panel).style.display = m === metodo ? 'block' : 'none';
            });
        });
    });
    
    // Calcular cambio al modificar monto recibido
    document.getElementById('montoRecibido').addEventListener('input', function() {
        calcularCambio();
    });

    // Formatear automáticamente el monto recibido
    document.getElementById('montoRecibido').addEventListener('blur', function() {
        const valor = desformatearNumero(this.value);
        this.value = formatearNumero(valor);
        calcularCambio();
    });

    // Solo numeros en monto recibido
    document.getElementById('montoRecibido').addEventListener('keypress', function(e) {
        const charCode = e.which ? e.which : e.keyCode;
        if (charCode > 31 && (charCode < 48 || charCode > 57)) {
            e.preventDefault();
        }
    });
}

// Actualizar panel principal
function actualizarPanelPrincipal() {
    const hoy = new Date().toDateString();
    const pedidosHoy = pedidos.filter(pedido => 
        new Date(pedido.createdAt).toDateString() === hoy
    );
    
    const ventasTotales = pedidosHoy
        .filter(pedido => pedido.status === 'paid')
        .reduce((suma, pedido) => suma + pedido.total, 0);
    
    const pedidosPendientes = pedidos.filter(pedido => 
        pedido.status === 'ready' || pedido.status === 'served'
    ).length;
    
    const pedidosCompletados = pedidos.filter(pedido => 
        pedido.status === 'paid'
    ).length;
    
    const mesasOcupadas = mesas.filter(mesa => 
        mesa.status === 'occupied'
    ).length;

    document.getElementById('ventasTotales').textContent = formatearPesos(ventasTotales);
    document.getElementById('mesasOcupadas').textContent = `${mesasOcupadas}/${mesas.length}`;
    document.getElementById('pedidosPendientes').textContent = pedidosPendientes;
    document.getElementById('pedidosCompletados').textContent = pedidosCompletados;

    // Actualizar tabla de pedidos recientes
    const tablaPedidosRecientes = document.getElementById('tablaPedidosRecientes');
    tablaPedidosRecientes.innerHTML = '';
    
    const pedidosRecientes = pedidos
        .filter(pedido => pedido.status !== 'paid' && pedido.status !== 'cancelled')
        .slice(0, 5);
    
    pedidosRecientes.forEach(pedido => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${pedido._id.toString().slice(-4)}</td>
            <td>${pedido.tableNumber}</td>
            <td>${escaparHtml(pedido.waiterName)}</td>
            <td>${formatearPesos(pedido.total)}</td>
            <td><span class="badge badge-status ${obtenerClaseEstado(pedido.status)}">${obtenerTextoEstado(pedido.status)}</span></td>
            <td>${new Date(pedido.createdAt).toLocaleTimeString()}</td>
            <td>
                <button class="btn btn-sm btn-cash btn-process" onclick="abrirModalFacturacion('${pedido._id}')">
                    Facturar
                </button>
            </td>
        `;
        tablaPedidosRecientes.appendChild(fila);
    });
}

// Actualizar sección de facturación
function actualizarSeccionFacturacion() {
    const pedidosFacturacion = pedidos.filter(pedido => 
        pedido.status === 'ready' || pedido.status === 'served'
    );
    
    const tablaFacturacion = document.getElementById('tablaPedidosFacturacion');
    tablaFacturacion.innerHTML = '';
    
    pedidosFacturacion.forEach(pedido => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${pedido.tableNumber}</td>
            <td>${pedido._id.toString().slice(-4)}</td>
            <td>${escaparHtml(pedido.waiterName)}</td>
            <td>${formatearPesos(pedido.total)}</td>
            <td><span class="badge badge-status ${obtenerClaseEstado(pedido.status)}">${obtenerTextoEstado(pedido.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-cash btn-process" onclick="abrirModalFacturacion('${pedido._id}')">
                    Facturar
                </button>
            </td>
        `;
        tablaFacturacion.appendChild(fila);
    });

    // Actualizar estadísticas de caja
    actualizarEstadisticasCaja();
}

// Actualizar estadísticas de caja
function actualizarEstadisticasCaja() {
    const hoy = new Date().toDateString();
    const pedidosPagadosHoy = pedidos.filter(pedido => 
        pedido.status === 'paid' && 
        new Date(pedido.createdAt).toDateString() === hoy
    );
    
    const ventasTotales = pedidosPagadosHoy.reduce((suma, pedido) => suma + pedido.total, 0);
    const facturasHoy = pedidosPagadosHoy.length;
    const ticketPromedio = facturasHoy > 0 ? ventasTotales / facturasHoy : 0;
    const pendientesFacturacion = pedidos.filter(pedido => 
        pedido.status === 'ready' || pedido.status === 'served'
    ).length;

    document.getElementById('ventasDiarias').textContent = formatearPesos(ventasTotales);
    document.getElementById('facturasHoy').textContent = facturasHoy;
    document.getElementById('ticketPromedio').textContent = formatearPesos(ticketPromedio);
    document.getElementById('pendientesFacturacion').textContent = pendientesFacturacion;
    document.getElementById('totalFacturado').textContent = formatearPesos(ventasTotales);
}

// Actualizar sección de mesas
function actualizarSeccionMesas() {
    const contenedorMesas = document.getElementById('contenedorMesas');
    contenedorMesas.innerHTML = '';
    
    mesas.forEach(mesa => {
        const pedidosMesa = pedidos.filter(pedido => 
            idMesaDePedido(pedido) === mesa._id && 
            (pedido.status === 'pending' || pedido.status === 'preparing' || pedido.status === 'ready' || pedido.status === 'served')
        );
        
        const columna = document.createElement('div');
        columna.className = 'col-md-3 mb-3';
        columna.innerHTML = `
            <div class="card cartoon-shadow">
                <div class="card-header ${mesa.status === 'occupied' ? 'status-occupied' : 'status-available'}">
                    <h5 class="card-title mb-0">Mesa ${mesa.number}</h5>
                </div>
                <div class="card-body">
                    <p class="card-text">
                        <strong>Estado:</strong> ${mesa.status === 'occupied' ? 'Ocupada' : 'Disponible'}<br>
                        <strong>Capacidad:</strong> ${mesa.capacity} personas<br>
                        <strong>Pedidos activos:</strong> ${pedidosMesa.length}
                    </p>
                    ${pedidosMesa.length > 0 ? `
                        <button class="btn btn-sm btn-cash btn-process w-100" onclick="verPedidosMesa('${mesa._id}')">
                            Ver Pedidos
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        contenedorMesas.appendChild(columna);
    });
}

// Actualizar una mesa específica 
function actualizarMesaEspecifica(idMesa, nuevoEstado) {
    const mesaIndex = mesas.findIndex(mesa => mesa._id === idMesa);
    if (mesaIndex !== -1) {
        mesas[mesaIndex].status = nuevoEstado;
        actualizarSeccionMesas();
    }
}

// Actualizar selector de mesas
function actualizarSelectorMesas() {
    const selectorMesa = document.getElementById('selectorMesa');
    selectorMesa.innerHTML = '<option value="">Seleccionar mesa...</option>';
    
    mesas.forEach(mesa => {
        const opcion = document.createElement('option');
        opcion.value = mesa._id;
        opcion.textContent = `Mesa ${mesa.number}`;
        selectorMesa.appendChild(opcion);
    });
}

// Abrir modal de facturación
async function abrirModalFacturacion(idPedido) {
    const pedido = pedidos.find(p => p._id === idPedido);
    if (!pedido) return;
    
    pedidoActual = pedido;
    
    document.getElementById('numeroMesaModal').textContent = pedido.tableNumber;
    document.getElementById('idPedidoModal').textContent = pedido._id.toString().slice(-4);
    document.getElementById('meseroModal').textContent = pedido.waiterName;
    document.getElementById('horaModal').textContent = new Date(pedido.createdAt).toLocaleTimeString();
    
    // Calcular impuestos y total
    const subtotal = pedido.total;
    const impuestos = subtotal * 0.10;
    const total = subtotal + impuestos;
    
    document.getElementById('subtotalModal').textContent = formatearPesos(subtotal);
    document.getElementById('impuestosModal').textContent = formatearPesos(impuestos);
    document.getElementById('totalModal').textContent = formatearPesos(total);
    
    // Llenar tabla de items
    const tablaItems = document.getElementById('tablaItemsModal');
    tablaItems.innerHTML = '';
    
    pedido.items.forEach(item => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${escaparHtml(item.productName)}</td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-end">${formatearPesos(item.price)}</td>
            <td class="text-end">${formatearPesos(item.price * item.quantity)}</td>
        `;
        tablaItems.appendChild(fila);
    });
    
    // Resetear formulario de pago
    document.getElementById('montoRecibido').value = formatearNumero(total);
    calcularCambio();
    
    const modal = new bootstrap.Modal(document.getElementById('modalFacturacion'));
    modal.show();
}

// Calcular cambio
function calcularCambio() {
    const total = parseFloat(document.getElementById('totalModal').textContent.replace(/[^\d]/g, '')) || 0;
    const recibido = desformatearNumero(document.getElementById('montoRecibido').value);
    const cambio = recibido - total;
    
    const displayCambio = document.getElementById('displayCambio');
    if (cambio >= 0) {
        displayCambio.innerHTML = `<strong>Cambio:</strong> ${formatearPesos(cambio)}`;
        displayCambio.style.color = 'var(--color-red)';
    } else {
        displayCambio.innerHTML = `<strong style="color: var(--color-red);">Faltan:</strong> ${formatearPesos(Math.abs(cambio))}`;
        displayCambio.style.color = 'var(--color-red)';
    }
}

// Procesar pago. El servidor marca el pedido como pagado, libera la mesa si no tiene más pedidos abiertos
// y avisa por Socket.IO a los demás módulos.
async function procesarPago() {
    if (!pedidoActual) return;
    
    const metodoPago = document.querySelector('input[name="metodoPago"]:checked').value;
    const montoRecibido = desformatearNumero(document.getElementById('montoRecibido').value);
    const total = parseFloat(document.getElementById('totalModal').textContent.replace(/[^\d]/g, '')) || 0;
    
    if (metodoPago === 'cash' && montoRecibido < total) {
        alert('El monto recibido es menor al total a pagar');
        return;
    }
    
    try {
        await Api.put(`/orders/${pedidoActual._id}/status`, { status: 'paid', paymentMethod: metodoPago });

        alert('Pago procesado correctamente');
        bootstrap.Modal.getInstance(document.getElementById('modalFacturacion')).hide();
        pedidoActual = null;

        await Promise.all([cargarPedidos(), cargarMesas()]);
    } catch (error) {
        console.error('Error procesando pago:', error);
        alert('No se pudo procesar el pago: ' + error.message);
    }
}

// Imprimir factura
function imprimirFactura() {
    window.print();
}

// Buscar pedido
function buscarPedido() {
    const terminoBusqueda = document.getElementById('buscarPedido').value.trim();
    if (!terminoBusqueda) return;
    
    const pedido = pedidos.find(p => p._id.toString().includes(terminoBusqueda));
    if (pedido) {
        abrirModalFacturacion(pedido._id);
    } else {
        alert('Pedido no encontrado');
    }
}

// Generar reporte de ventas a partir de los pedidos pagados que hay cargados
function generarReporteVentas() {
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    
    if (!fechaInicio || !fechaFin) {
        alert('Por favor selecciona ambas fechas');
        return;
    }

    // Fecha local del pedido en formato YYYY-MM-DD (comparable con los inputs de fecha)
    const diaLocal = (fecha) => new Date(fecha).toLocaleDateString('en-CA');

    const ventasPorDia = {};
    pedidos
        .filter(pedido => pedido.status === 'paid')
        .forEach(pedido => {
            const dia = diaLocal(pedido.paidAt || pedido.updatedAt || pedido.createdAt);
            if (dia < fechaInicio || dia > fechaFin) return;
            ventasPorDia[dia] = ventasPorDia[dia] || { total: 0, cantidad: 0 };
            ventasPorDia[dia].total += pedido.total;
            ventasPorDia[dia].cantidad += 1;
        });

    const dias = Object.keys(ventasPorDia).sort();
    const tablaReporte = document.getElementById('tablaReporteVentas');

    if (dias.length === 0) {
        tablaReporte.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay ventas en ese rango</td></tr>';
        return;
    }

    tablaReporte.innerHTML = dias.map(dia => `
        <tr>
            <td>${dia}</td>
            <td>${formatearPesos(ventasPorDia[dia].total)}</td>
            <td>${ventasPorDia[dia].cantidad}</td>
            <td>${formatearPesos(ventasPorDia[dia].total / ventasPorDia[dia].cantidad)}</td>
            <td></td>
        </tr>
    `).join('');
}

// Generar corte de caja
function generarCorteCaja() {
    const hoy = new Date().toLocaleDateString();
    const ventasDiarias = desformatearNumero(document.getElementById('ventasDiarias').textContent);
    const facturasHoy = document.getElementById('facturasHoy').textContent;
    const ticketPromedio = desformatearNumero(document.getElementById('ticketPromedio').textContent);
    
    const datosReporte = `
        CORTE DE CAJA - ${hoy}
        ========================
        Ventas del día: ${formatearPesos(ventasDiarias)}
        Facturas emitidas: ${facturasHoy}
        Ticket promedio: ${formatearPesos(ticketPromedio)}
        ========================
        Generado por: ${document.getElementById('nombreUsuario').textContent}
        Hora: ${new Date().toLocaleTimeString()}
    `;
    
    alert('Corte de caja generado:\n\n' + datosReporte);
}

// Ver pedidos de una mesa
function verPedidosMesa(idMesa) {
    const pedidosMesa = pedidos.filter(pedido => 
        idMesaDePedido(pedido) === idMesa && 
        (pedido.status === 'ready' || pedido.status === 'served')
    );
    
    if (pedidosMesa.length === 0) {
        alert('No hay pedidos pendientes para esta mesa');
        return;
    }
    
    if (pedidosMesa.length === 1) {
        abrirModalFacturacion(pedidosMesa[0]._id);
    } else {
        let mensaje = 'Pedidos pendientes para esta mesa:\n\n';
        pedidosMesa.forEach(pedido => {
            mensaje += `• Pedido ${pedido._id.toString().slice(-4)} - ${formatearPesos(pedido.total)}\n`;
        });
        mensaje += '\nSelecciona un pedido para facturar.';
        alert(mensaje);
    }
}
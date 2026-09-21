// Módulo de caja. Todo lo que se muestra viene de la API:
//   /orders?active=true   pedidos abiertos
//   /tables               mesas
//   /reports/summary      cifras del día (ventas, facturas, método de pago)
//   /reports/sales        ventas por día (reporte)
//   /config               datos del negocio para la factura

let usuarioActual = null;
let pedidos = [];      // pedidos abiertos: pendientes, en cocina, listos y servidos
let mesas = [];
let resumen = null;    // cifras de hoy calculadas por el servidor
let negocio = null;    // datos del negocio (config de la API)
let pedidoActual = null;

// Método de pago (valor que entiende la API) -> radio y panel del modal de facturación
const METODOS_PAGO = {
    cash: { radio: 'metodoEfectivo', panel: 'pagoEfectivo', etiqueta: 'Efectivo' },
    card: { radio: 'metodoTarjeta', panel: 'pagoTarjeta', etiqueta: 'Tarjeta' },
    transfer: { radio: 'metodoTransferencia', panel: 'pagoTransferencia', etiqueta: 'Transferencia' }
};

const ESTADOS_MESA = {
    available: { texto: 'Disponible', clase: 'status-available' },
    occupied: { texto: 'Ocupada', clase: 'status-occupied' },
    reserved: { texto: 'Reservada', clase: 'status-reserved' },
    maintenance: { texto: 'En mantenimiento', clase: 'status-maintenance' }
};

const ZONA_HORARIA = Intl.DateTimeFormat().resolvedOptions().timeZone;

document.addEventListener('DOMContentLoaded', function() {
    inicializarModuloCaja();
});

async function inicializarModuloCaja() {
    usuarioActual = await cargarDatosUsuario(['caja']);
    document.getElementById('nombreUsuario').textContent = usuarioActual.name;

    configurarEventListenersCaja();
    establecerFechasReporte();
    configurarListenersSocket();

    await Promise.all([cargarNegocio(), refrescarTodo()]);

    // Respaldo por si se pierde algún evento en tiempo real
    setInterval(refrescarTodo, 30000);
}

// ===== Carga de datos =====

// Rango "hoy" en la hora local del navegador, en formato ISO para la API
function rangoHoy() {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(inicio);
    fin.setHours(23, 59, 59, 999);
    return { from: inicio.toISOString(), to: fin.toISOString() };
}

// Carga pedidos, mesas y resumen a la vez y dibuja todo junto (así nada se pinta con datos a medias)
async function refrescarTodo() {
    const { from, to } = rangoHoy();
    try {
        [pedidos, mesas, resumen] = await Promise.all([
            Api.get('/orders?active=true&sort=desc&limit=200'),
            Api.get('/tables'),
            Api.get(`/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        ]);
        renderizarTodo();
    } catch (error) {
        console.error('Error cargando datos de caja:', error);
        mostrarError('No se pudieron cargar los datos: ' + error.message);
    }
}

async function cargarNegocio() {
    try {
        negocio = (await Api.get('/config')).business;
    } catch (error) {
        console.error('Error cargando datos del negocio:', error);
        negocio = { name: 'Cartoon Pizza' };
    }
}

// Varios eventos seguidos (pedido pagado + mesa liberada) provocan una sola recarga
let temporizadorRefresco = null;
function programarRefresco() {
    clearTimeout(temporizadorRefresco);
    temporizadorRefresco = setTimeout(refrescarTodo, 250);
}

function configurarListenersSocket() {
    socket.on('orderStatusUpdate', programarRefresco);
    socket.on('newOrder', programarRefresco);
    socket.on('tableStatusUpdate', programarRefresco);
}

// ===== Utilidades =====

// El back devuelve la mesa poblada ({ _id, number, ... }); esto obtiene su id en cualquier caso
function idMesaDePedido(pedido) {
    return pedido.table?._id || pedido.table;
}

function pedidosPorCobrar() {
    return pedidos.filter(pedido => pedido.status === 'ready' || pedido.status === 'served');
}

function pedidosActivosDeMesa(idMesa) {
    return pedidos.filter(pedido => idMesaDePedido(pedido) === idMesa);
}

function codigoPedido(pedido) {
    return pedido._id.toString().slice(-4);
}

// Mostrar un error visible sin bloquear la pantalla
function mostrarError(mensaje) {
    const aviso = document.createElement('div');
    aviso.className = 'alert alert-danger position-fixed top-0 start-50 translate-middle-x mt-3 z-3';
    aviso.textContent = mensaje;
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 4000);
}

// ===== Dibujado =====

function renderizarTodo() {
    actualizarPanelPrincipal();
    actualizarSelectorMesas();
    actualizarSeccionFacturacion();
    actualizarSeccionMesas();
    actualizarResumenCaja();
}

function actualizarPanelPrincipal() {
    const mesasOcupadas = mesas.filter(mesa => mesa.status === 'occupied').length;

    document.getElementById('ventasTotales').textContent = formatearPesos(resumen.sales);
    document.getElementById('mesasOcupadas').textContent = `${mesasOcupadas}/${mesas.length}`;
    document.getElementById('pedidosPendientes').textContent = resumen.pendingBilling;
    document.getElementById('pedidosCompletados').textContent = resumen.paidOrders;

    const tabla = document.getElementById('tablaPedidosRecientes');
    tabla.innerHTML = '';

    const recientes = pedidos.slice(0, 5);
    if (recientes.length === 0) {
        tabla.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay pedidos abiertos</td></tr>';
        return;
    }

    recientes.forEach(pedido => {
        const cobrable = pedido.status === 'ready' || pedido.status === 'served';
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${codigoPedido(pedido)}</td>
            <td>${pedido.tableNumber}</td>
            <td>${escaparHtml(pedido.waiterName)}</td>
            <td>${formatearPesos(pedido.total)}</td>
            <td><span class="badge badge-status ${obtenerClaseEstado(pedido.status)}">${obtenerTextoEstado(pedido.status)}</span></td>
            <td>${new Date(pedido.createdAt).toLocaleTimeString()}</td>
            <td>${cobrable ? `
                <button class="btn btn-sm btn-cash btn-process" onclick="abrirModalFacturacion('${pedido._id}')">
                    Facturar
                </button>` : '<span class="text-muted small">En cocina</span>'}
            </td>
        `;
        tabla.appendChild(fila);
    });
}

function actualizarSeccionFacturacion() {
    const mesaFiltrada = document.getElementById('selectorMesa').value;
    const lista = pedidosPorCobrar()
        .filter(pedido => !mesaFiltrada || idMesaDePedido(pedido) === mesaFiltrada);

    const tabla = document.getElementById('tablaPedidosFacturacion');
    tabla.innerHTML = '';

    if (lista.length === 0) {
        tabla.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay pedidos por cobrar</td></tr>';
        return;
    }

    lista.forEach(pedido => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${pedido.tableNumber}</td>
            <td>${codigoPedido(pedido)}</td>
            <td>${escaparHtml(pedido.waiterName)}</td>
            <td>${formatearPesos(pedido.total)}</td>
            <td><span class="badge badge-status ${obtenerClaseEstado(pedido.status)}">${obtenerTextoEstado(pedido.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-cash btn-process" onclick="abrirModalFacturacion('${pedido._id}')">
                    Facturar
                </button>
            </td>
        `;
        tabla.appendChild(fila);
    });
}

// Tarjetas de "Resumen de Caja" y "Estadísticas Rápidas" (cifras del servidor)
function actualizarResumenCaja() {
    const porMetodo = resumen.byPaymentMethod;

    document.getElementById('ventasDiarias').textContent = formatearPesos(resumen.sales);
    document.getElementById('ventasEfectivo').textContent = formatearPesos(porMetodo.cash);
    document.getElementById('ventasTarjeta').textContent = formatearPesos(porMetodo.card);
    document.getElementById('ventasTransferencia').textContent = formatearPesos(porMetodo.transfer);
    document.getElementById('totalFacturado').textContent = formatearPesos(resumen.sales);

    // Ventas de pedidos antiguos que se cobraron sin registrar el método de pago
    document.getElementById('filaOtros').classList.toggle('d-none', porMetodo.unspecified === 0);
    document.getElementById('ventasOtros').textContent = formatearPesos(porMetodo.unspecified);

    document.getElementById('facturasHoy').textContent = resumen.paidOrders;
    document.getElementById('ticketPromedio').textContent = formatearPesos(resumen.averageTicket);
    document.getElementById('pendientesFacturacion').textContent = resumen.pendingBilling;
}

function actualizarSeccionMesas() {
    const contenedor = document.getElementById('contenedorMesas');
    contenedor.innerHTML = '';

    if (mesas.length === 0) {
        contenedor.innerHTML = '<p class="text-muted">No hay mesas registradas.</p>';
        return;
    }

    mesas.forEach(mesa => {
        const estado = ESTADOS_MESA[mesa.status] || { texto: mesa.status, clase: '' };
        const abiertos = pedidosActivosDeMesa(mesa._id).length;
        const porCobrar = pedidosPorCobrar().filter(pedido => idMesaDePedido(pedido) === mesa._id).length;

        const columna = document.createElement('div');
        columna.className = 'col-sm-6 col-lg-4 col-xxl-3 mb-3';
        columna.innerHTML = `
            <div class="card cartoon-shadow h-100">
                <div class="card-header ${estado.clase}">
                    <h5 class="card-title mb-0">Mesa ${mesa.number}</h5>
                </div>
                <div class="card-body">
                    <p class="card-text">
                        <strong>Estado:</strong> ${estado.texto}<br>
                        <strong>Capacidad:</strong> ${mesa.capacity} personas<br>
                        <strong>Ubicación:</strong> ${escaparHtml(mesa.location)}<br>
                        <strong>Pedidos abiertos:</strong> ${abiertos}
                    </p>
                    ${porCobrar > 0 ? `
                        <button class="btn btn-sm btn-cash btn-process w-100" onclick="verPedidosMesa('${mesa._id}')">
                            Cobrar (${porCobrar})
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        contenedor.appendChild(columna);
    });
}

// Selector de mesa de la sección de facturación (conserva la mesa elegida al recargar)
function actualizarSelectorMesas() {
    const selector = document.getElementById('selectorMesa');
    const seleccionada = selector.value;
    selector.innerHTML = '<option value="">Todas las mesas</option>';

    mesas.forEach(mesa => {
        const opcion = document.createElement('option');
        opcion.value = mesa._id;
        opcion.textContent = `Mesa ${mesa.number}`;
        selector.appendChild(opcion);
    });
    selector.value = seleccionada;
}

// Lleva a la sección de facturación filtrada por la mesa
function verPedidosMesa(idMesa) {
    document.getElementById('selectorMesa').value = idMesa;
    actualizarSeccionFacturacion();
    document.querySelector('.sidebar .nav-link[data-section="billing"]').click();
}

// ===== Eventos de la pantalla =====

function configurarEventListenersCaja() {
    configurarNavegacion();

    document.getElementById('selectorMesa').addEventListener('change', actualizarSeccionFacturacion);

    // Métodos de pago
    document.querySelectorAll('.payment-method').forEach(opcion => {
        opcion.addEventListener('click', function() {
            seleccionarMetodoPago(this.getAttribute('data-method'));
        });
    });

    const montoRecibido = document.getElementById('montoRecibido');
    montoRecibido.addEventListener('input', calcularCambio);

    // Formatear automáticamente el monto recibido
    montoRecibido.addEventListener('blur', function() {
        this.value = formatearNumero(desformatearNumero(this.value));
        calcularCambio();
    });

    // Solo números en monto recibido
    montoRecibido.addEventListener('keypress', function(e) {
        const codigo = e.which ? e.which : e.keyCode;
        if (codigo > 31 && (codigo < 48 || codigo > 57)) {
            e.preventDefault();
        }
    });
}

function seleccionarMetodoPago(metodo) {
    document.querySelectorAll('.payment-method').forEach(opcion => {
        opcion.classList.toggle('selected', opcion.getAttribute('data-method') === metodo);
    });
    document.getElementById(METODOS_PAGO[metodo].radio).checked = true;

    // Mostrar solo el formulario del método elegido
    Object.entries(METODOS_PAGO).forEach(([clave, datos]) => {
        document.getElementById(datos.panel).style.display = clave === metodo ? 'block' : 'none';
    });
}

// ===== Facturación =====

function abrirModalFacturacion(idPedido) {
    const pedido = pedidos.find(p => p._id === idPedido);
    if (!pedido) return;

    if (pedido.status !== 'ready' && pedido.status !== 'served') {
        alert('Este pedido todavía no está listo para cobrar.');
        return;
    }

    pedidoActual = pedido;

    document.getElementById('numeroMesaModal').textContent = pedido.tableNumber;
    document.getElementById('idPedidoModal').textContent = codigoPedido(pedido);
    document.getElementById('meseroModal').textContent = pedido.waiterName;
    document.getElementById('horaModal').textContent = new Date(pedido.createdAt).toLocaleTimeString();
    document.getElementById('totalModal').textContent = formatearPesos(pedido.total);
    dibujarDatosNegocio();

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

    // Formulario de pago limpio
    seleccionarMetodoPago('cash');
    document.getElementById('montoRecibido').value = formatearNumero(pedido.total);
    calcularCambio();

    new bootstrap.Modal(document.getElementById('modalFacturacion')).show();
}

// Muestra solo los datos del negocio que estén configurados en la API
function dibujarDatosNegocio() {
    const datos = negocio || { name: 'Cartoon Pizza' };
    const lineas = [
        datos.address,
        datos.phone && `Tel: ${datos.phone}`,
        datos.taxId && `NIT: ${datos.taxId}`
    ].filter(Boolean);

    document.getElementById('datosNegocio').innerHTML = `
        <h6 style="font-family: 'Bangers', cursive; color: var(--color-red);">${escaparHtml(datos.name)}</h6>
        ${lineas.map(linea => `<p class="mb-1">${escaparHtml(linea)}</p>`).join('')}
    `;
}

function calcularCambio() {
    const total = pedidoActual ? pedidoActual.total : 0;
    const recibido = desformatearNumero(document.getElementById('montoRecibido').value);
    const cambio = recibido - total;

    const displayCambio = document.getElementById('displayCambio');
    if (cambio >= 0) {
        displayCambio.innerHTML = `<strong>Cambio:</strong> ${formatearPesos(cambio)}`;
    } else {
        displayCambio.innerHTML = `<strong>Faltan:</strong> ${formatearPesos(Math.abs(cambio))}`;
    }
}

// Procesar pago. El servidor marca el pedido como pagado, libera la mesa si no tiene más pedidos abiertos
// y avisa por Socket.IO a los demás módulos.
async function procesarPago() {
    if (!pedidoActual) return;

    const metodoPago = document.querySelector('input[name="metodoPago"]:checked').value;
    const montoRecibido = desformatearNumero(document.getElementById('montoRecibido').value);

    if (metodoPago === 'cash' && montoRecibido < pedidoActual.total) {
        alert('El monto recibido es menor al total a pagar');
        return;
    }

    try {
        await Api.put(`/orders/${pedidoActual._id}/status`, { status: 'paid', paymentMethod: metodoPago });

        bootstrap.Modal.getInstance(document.getElementById('modalFacturacion')).hide();
        pedidoActual = null;
        await refrescarTodo();
        alert('Pago procesado correctamente');
    } catch (error) {
        console.error('Error procesando pago:', error);
        alert('No se pudo procesar el pago: ' + error.message);
    }
}

function imprimirFactura() {
    window.print();
}

// Buscar pedido por su número (los últimos caracteres del identificador)
function buscarPedido() {
    const termino = document.getElementById('buscarPedido').value.trim().toLowerCase();
    if (!termino) return;

    const pedido = pedidos.find(p => p._id.toString().toLowerCase().includes(termino));
    if (!pedido) {
        alert('No hay un pedido abierto con ese número');
    } else if (pedido.status === 'ready' || pedido.status === 'served') {
        abrirModalFacturacion(pedido._id);
    } else {
        alert(`El pedido ${codigoPedido(pedido)} todavía no está listo para cobrar (estado: ${obtenerTextoEstado(pedido.status)}).`);
    }
}

// ===== Reportes =====

// Las fechas del reporte arrancan en el día de hoy
function establecerFechasReporte() {
    const hoy = new Date().toLocaleDateString('en-CA');
    document.getElementById('fechaInicio').value = hoy;
    document.getElementById('fechaFin').value = hoy;
}

async function generarReporteVentas() {
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;

    if (!fechaInicio || !fechaFin) {
        alert('Por favor selecciona ambas fechas');
        return;
    }

    // Los días completos, en la hora local
    const desde = new Date(`${fechaInicio}T00:00:00`);
    const hasta = new Date(`${fechaFin}T23:59:59.999`);
    const tabla = document.getElementById('tablaReporteVentas');

    try {
        const dias = await Api.get(
            `/reports/sales?from=${encodeURIComponent(desde.toISOString())}&to=${encodeURIComponent(hasta.toISOString())}` +
            `&timezone=${encodeURIComponent(ZONA_HORARIA)}`
        );

        if (dias.length === 0) {
            tabla.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay ventas en ese rango</td></tr>';
            return;
        }

        const total = dias.reduce((suma, dia) => suma + dia.total, 0);
        const facturas = dias.reduce((suma, dia) => suma + dia.orders, 0);

        tabla.innerHTML = dias.map(dia => `
            <tr>
                <td>${dia.date.split('-').reverse().join('/')}</td>
                <td>${formatearPesos(dia.total)}</td>
                <td>${dia.orders}</td>
                <td>${formatearPesos(dia.averageTicket)}</td>
            </tr>
        `).join('') + `
            <tr class="fw-bold table-warning">
                <td>Total</td>
                <td>${formatearPesos(total)}</td>
                <td>${facturas}</td>
                <td>${formatearPesos(Math.round(total / facturas))}</td>
            </tr>
        `;
    } catch (error) {
        console.error('Error generando reporte:', error);
        alert('No se pudo generar el reporte: ' + error.message);
    }
}

// Corte de caja con las cifras del día que calcula el servidor
function generarCorteCaja() {
    if (!resumen) return;

    const porMetodo = resumen.byPaymentMethod;
    const lineas = [
        `CORTE DE CAJA - ${new Date().toLocaleDateString()}`,
        '========================',
        `Ventas del día: ${formatearPesos(resumen.sales)}`,
        `   Efectivo: ${formatearPesos(porMetodo.cash)}`,
        `   Tarjeta: ${formatearPesos(porMetodo.card)}`,
        `   Transferencia: ${formatearPesos(porMetodo.transfer)}`,
        ...(porMetodo.unspecified ? [`   Sin método registrado: ${formatearPesos(porMetodo.unspecified)}`] : []),
        `Facturas emitidas: ${resumen.paidOrders}`,
        `Ticket promedio: ${formatearPesos(resumen.averageTicket)}`,
        `Pedidos por cobrar: ${resumen.pendingBilling}`,
        '========================',
        `Generado por: ${usuarioActual.name}`,
        `Hora: ${new Date().toLocaleTimeString()}`
    ];

    alert(lineas.join('\n'));
}

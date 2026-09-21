// Conexión en tiempo real con el back (se autentica con el mismo token de la API).
// Si no hay sesión o el cliente de Socket.IO no cargó, se usa un objeto vacío para que las pantallas no fallen.
let socket = { on() {}, emit() {} };
if (typeof io !== 'undefined' && Auth.getToken()) {
    socket = io(APP_CONFIG.API_URL, { auth: { token: Auth.getToken() } });
    socket.on('connect_error', (error) => console.warn('Tiempo real no disponible:', error.message));
}

// Escapa texto de usuario antes de insertarlo con innerHTML (evita inyección de HTML/JS)
function escaparHtml(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (caracter) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[caracter]));
}

// Imagen de un producto: las subidas desde el panel de administración viven en la API ("/api/images/<id>");
// las de productos antiguos son archivos de assets/images ("pizza.jpg" o "/images/pizza.jpg")
function urlImagen(imagen) {
    const valor = String(imagen || '');
    if (valor.startsWith('/api/images/')) return `${APP_CONFIG.API_URL}${valor}`;
    const archivo = valor.split('/').pop();
    return archivo ? `assets/images/${archivo}` : 'assets/images/LogoPizza.png';
}

// Función para formatear números como pesos colombianos
function formatearPesos(monto) {
    if (typeof monto !== 'number') {
        monto = parseFloat(monto) || 0;
    }
    
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(monto);
}

// Función para formatear números con separadores de miles (para inputs)
function formatearNumero(monto) {
    if (typeof monto !== 'number') {
        monto = parseFloat(monto) || 0;
    }
    
    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(monto);
}

// Función para convertir string formateado a número
function desformatearNumero(texto) {
    if (!texto) return 0;
    return parseFloat(texto.replace(/[^\d]/g, '')) || 0;
}

// Funciones auxiliares para estados
function obtenerClaseEstado(estado) {
    switch(estado) {
        case 'pending': return 'status-pending';
        case 'preparing': return 'status-pending';
        case 'ready': return 'status-pending';
        case 'served': return 'status-pending';
        case 'paid': return 'status-paid';
        case 'cancelled': return 'status-cancelled';
        default: return '';
    }
}

function obtenerTextoEstado(estado) {
    switch(estado) {
        case 'pending': return 'Pendiente';
        case 'preparing': return 'En Cocina';
        case 'ready': return 'Listo';
        case 'served': return 'Servido';
        case 'paid': return 'Pagado';
        case 'cancelled': return 'Cancelado';
        default: return estado;
    }
}

// Funciones auxiliares para cocina
function obtenerClaseEncabezadoEstado(estado) {
    switch(estado) {
        case 'pending': return 'status-pending';
        case 'preparing': return 'status-preparing';
        case 'ready': return 'status-ready';
        case 'served': return 'status-completed';
        default: return '';
    }
}

function obtenerTiempoTranscurrido(tiempoInicio) {
    return new Date() - tiempoInicio;
}

function formatearTiempo(milisegundos) {
    const segundos = Math.floor(milisegundos / 1000);
    const minutos = Math.floor(segundos / 60);
    const horas = Math.floor(minutos / 60);
    
    return [
        horas.toString().padStart(2, '0'),
        (minutos % 60).toString().padStart(2, '0'),
        (segundos % 60).toString().padStart(2, '0')
    ].join(':');
}

// Cerrar sesión
function cerrarSesion() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        Auth.logout();
    }
}

// Configuración de navegación por secciones
function configurarNavegacion() {
    document.querySelectorAll('.sidebar .nav-link').forEach(enlace => {
        enlace.addEventListener('click', function(e) {
            e.preventDefault();
            
           
            document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
          
            const sectionId = this.getAttribute('data-section');
            document.querySelectorAll('.content-section').forEach(seccion => {
                seccion.classList.remove('active');
            });
            document.getElementById(`${sectionId}-section`).classList.add('active');
        });
    });
}

// Exige sesión (y rol) para la pantalla actual y devuelve los datos del usuario
function cargarDatosUsuario(rolesPermitidos) {
    return Auth.requireSession(rolesPermitidos);
}

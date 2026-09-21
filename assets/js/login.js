// ===== FUNCIONES GLOBALES PARA GOOGLE =====
function iniciarSesionGoogle() {
    window.location.href = `${APP_CONFIG.API_URL}/api/auth/google`;
}

function registrarConGoogle() {
    window.location.href = `${APP_CONFIG.API_URL}/api/auth/google`;
}

document.addEventListener('DOMContentLoaded', function () {
    redirigirSiHaySesion();
    configurarEventListenersLogin();
});

// Si ya hay una sesión válida, ir directo a la pantalla del rol
async function redirigirSiHaySesion() {
    if (!Auth.getToken()) return;
    try {
        const usuario = await Api.get('/auth/me');
        window.location.replace(Auth.homeFor(usuario));
    } catch {
        Auth.clear();
    }
}

function mostrarAlerta(elemento, mensaje) {
    elemento.textContent = mensaje;
    elemento.classList.remove('d-none');
}

// Envía credenciales al endpoint indicado, guarda el token y redirige
async function autenticar(ruta, datos, elementoAlerta) {
    try {
        const { token, user } = await Api.post(ruta, datos, { auth: false });
        Auth.setToken(token);
        window.location.href = Auth.homeFor(user);
    } catch (error) {
        mostrarAlerta(elementoAlerta, error.message);
    }
}

function configurarEventListenersLogin() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', function (e) {
        e.preventDefault();

        autenticar('/auth/login', {
            email: document.getElementById('loginEmail').value,
            password: document.getElementById('loginPassword').value
        }, document.getElementById('loginAlert'));
    });

    // Registro
    document.getElementById('registerForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const role = document.getElementById('registerRole').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        const alerta = document.getElementById('registerAlert');

        if (password !== confirmPassword) {
            return mostrarAlerta(alerta, 'Las contraseñas no coinciden');
        }
        if (password.length < 8) {
            return mostrarAlerta(alerta, 'La contraseña debe tener al menos 8 caracteres');
        }
        if (!role) {
            return mostrarAlerta(alerta, 'Por favor selecciona un rol');
        }

        autenticar('/auth/register', { name, email, password, role }, alerta);
    });

    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.getElementById('loginAlert').classList.add('d-none');
            document.getElementById('registerAlert').classList.add('d-none');
        });
    });

    // Mensaje de error enviado por el back (por ejemplo, tras un fallo con Google)
    const error = new URLSearchParams(window.location.search).get('error');
    if (error) {
        mostrarAlerta(document.getElementById('loginAlert'), error);
    }
}

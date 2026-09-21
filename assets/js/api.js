// Cliente de la API y manejo de sesión (JWT guardado en localStorage).

class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

const Auth = {
    TOKEN_KEY: 'cartoonpizza.token',

    // Pantalla inicial de cada rol
    HOME_BY_ROLE: {
        mesero: 'mesas.html',
        cocina: 'cocina.html',
        caja: 'caja.html',
        admin: 'caja.html'
    },

    getToken() {
        try {
            return localStorage.getItem(this.TOKEN_KEY);
        } catch {
            return null;
        }
    },

    setToken(token) {
        localStorage.setItem(this.TOKEN_KEY, token);
    },

    clear() {
        try {
            localStorage.removeItem(this.TOKEN_KEY);
        } catch {
            // sin acceso a localStorage: no hay nada que limpiar
        }
    },

    logout() {
        this.clear();
        window.location.replace('index.html');
    },

    homeFor(user) {
        if (user.needsRegistration) return 'registro-google.html';
        return this.HOME_BY_ROLE[user.role] || 'index.html';
    },

    // Protege una pantalla: exige sesión válida y, opcionalmente, uno de los roles indicados (el admin entra a todo).
    // Si no se cumple, redirige y devuelve una promesa que nunca se resuelve para detener la carga de la página.
    async requireSession(rolesPermitidos) {
        if (!this.getToken()) {
            window.location.replace('index.html');
            return new Promise(() => {});
        }

        const user = await Api.get('/auth/me');

        const rolOk = !rolesPermitidos || user.role === 'admin' || rolesPermitidos.includes(user.role);
        if (user.needsRegistration || !rolOk) {
            window.location.replace(this.homeFor(user));
            return new Promise(() => {});
        }
        return user;
    }
};

const Api = {
    async request(method, path, body, { auth = true } = {}) {
        const headers = { 'Content-Type': 'application/json' };
        const token = Auth.getToken();
        if (auth && token) headers.Authorization = `Bearer ${token}`;

        let response;
        try {
            response = await fetch(`${APP_CONFIG.API_URL}/api${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        } catch {
            throw new ApiError('No se pudo conectar con el servidor', 0);
        }

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            // Token vencido o inválido: volver al login
            if (response.status === 401 && auth) {
                Auth.logout();
                return new Promise(() => {});
            }
            throw new ApiError(data?.error || 'Error del servidor', response.status);
        }
        return data;
    },

    get: (path, options) => Api.request('GET', path, undefined, options),
    post: (path, body, options) => Api.request('POST', path, body, options),
    put: (path, body, options) => Api.request('PUT', path, body, options)
};

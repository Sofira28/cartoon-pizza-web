// Punto de retorno del login con Google: el back redirige aquí con el token en el fragmento (#token=...).
(async function () {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Quitar el token de la barra de direcciones y del historial
    window.history.replaceState(null, '', window.location.pathname);

    if (!token) {
        window.location.replace('index.html?error=' + encodeURIComponent('No se recibió la sesión de Google'));
        return;
    }

    Auth.setToken(token);
    try {
        const user = await Api.get('/auth/me');
        window.location.replace(Auth.homeFor(user));
    } catch (error) {
        Auth.clear();
        window.location.replace('index.html?error=' + encodeURIComponent(error.message));
    }
})();

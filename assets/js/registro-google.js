// Segundo paso del registro con Google: elegir el rol
document.addEventListener('DOMContentLoaded', async function () {
    const form = document.getElementById('completeRegistrationForm');
    const alerta = document.getElementById('registrationAlert');

    if (!Auth.getToken()) {
        window.location.replace('index.html');
        return;
    }

    try {
        const usuario = await Api.get('/auth/me');
        if (!usuario.needsRegistration) {
            window.location.replace(Auth.homeFor(usuario));
            return;
        }
        document.getElementById('userName').textContent = usuario.name;
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        return;
    }

    document.querySelectorAll('.role-option').forEach(option => {
        option.addEventListener('click', function () {
            this.querySelector('input[type="radio"]').checked = true;

            document.querySelectorAll('.role-option').forEach(opt => {
                opt.style.backgroundColor = '';
                opt.style.borderColor = '#dee2e6';
            });

            this.style.backgroundColor = 'rgba(252, 163, 17, 0.1)';
            this.style.borderColor = 'var(--color-orange)';
            this.style.borderRadius = '8px';
        });
    });

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const role = new FormData(form).get('role');
        if (!role) {
            alerta.textContent = 'Por favor selecciona un rol';
            alerta.classList.remove('d-none');
            return;
        }

        try {
            const { user } = await Api.post('/auth/complete-registration', { role });
            window.location.href = Auth.homeFor(user);
        } catch (error) {
            alerta.textContent = error.message;
            alerta.classList.remove('d-none');
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    const loginCard = document.getElementById('loginCard');
    const adminCard = document.getElementById('adminCard');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    function showLoggedIn(username) {
        loginCard.hidden = true;
        adminCard.hidden = false;
        document.getElementById('adminName').textContent = username;
        const link = document.getElementById('navLogin');
        if (link) link.textContent = 'Admin';
    }

    function showLogin() {
        adminCard.hidden = true;
        loginCard.hidden = false;
        const link = document.getElementById('navLogin');
        if (link) link.textContent = 'Log In';
    }

    fetch('/api/admin/me', { credentials: 'same-origin' })
        .then(response => response.ok ? response.json() : null)
        .then(data => { if (data?.username) showLoggedIn(data.username); })
        .catch(() => {});

    loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        const button = loginForm.querySelector('button[type="submit"]');
        const label = button.querySelector('span');
        button.disabled = true;
        label.textContent = 'Signing in…';
        loginError.textContent = '';
        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
                body: JSON.stringify({
                    username: document.getElementById('username').value.trim(),
                    password: document.getElementById('password').value
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(response.status === 401 ? 'Username or password is incorrect.' : (data.detail || 'Could not sign in. Please try again.'));
            loginForm.reset();
            showLoggedIn(data.username);
        } catch (error) {
            loginError.textContent = error.message || 'Could not reach the server. Please try again.';
        } finally {
            button.disabled = false;
            label.textContent = 'Sign in';
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
        } finally {
            showLogin();
        }
    });
});

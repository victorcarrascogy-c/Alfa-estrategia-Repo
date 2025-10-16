// ===== Login page script ======================================================
// This script handles the login form:
// - reads user input (RUT + password)
// - calls the backend /auth/login endpoint
// - stores the returned JWT on success
// - shows inline status/error messages
// - redirects to dashboard after successful login
// ============================================================================

// Cache the main DOM elements we interact with
const form = document.querySelector('form');
const $rut = document.getElementById('rut');
const $password = document.getElementById('password');
const $msg = document.getElementById('loginMsg');
const $submit = document.getElementById('submit');

/**
 * Set and style the inline feedback message.
 * @param {string} t - Text to display.
 * @param {'error'|'ok'|'info'} [type='error'] - Message intent that controls styling.
 */
function showMsg(t, type = 'error') {
  $msg.textContent = t;
  $msg.className = `msg ${type === 'ok' ? 'msg--ok'
      : type === 'info' ? 'msg--info'
        : 'msg--error'
    }`;
}

/**
 * Main submit handler:
 * - Prevent default page refresh
 * - Validate fields exist
 * - Disable submit to avoid double clicks
 * - POST credentials to the API
 * - If OK: save token and redirect
 * - If not OK: show the server-provided reason (or a generic one)
 * - Always re-enable the button at the end
 */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Read inputs (trim RUT because it may include spaces)
  const rut = $rut.value.trim();
  const password = $password.value;

  // Minimal client-side validation
  if (!rut || !password) {
    showMsg('Ingresa RUT y contraseña.');
    return;
  }

  // Lock UI and inform the user
  $submit.disabled = true;
  showMsg('Validando credenciales...', 'info');

  try {
    // Call the authentication endpoint
    const res = await fetch('http://127.0.0.1:8000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rut, password })
    });

    // On HTTP errors, try to surface API's message
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showMsg(data.detail || 'Credenciales inválidas');
      return;
    }

    // On success: persist token and move to the app
    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    showMsg('Ingreso exitoso. Redirigiendo…', 'ok');

    // Small delay so the user can read the success message
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 600);
  } catch {
    // Network/connection error (server unreachable, CORS, etc.)
    showMsg('No se pudo conectar con el servidor.');
  } finally {
    // Always re-enable the submit button
    $submit.disabled = false;
  }
});
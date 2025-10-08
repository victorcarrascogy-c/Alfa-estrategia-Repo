const form = document.querySelector('form');
const $rut = document.getElementById('rut');
const $password = document.getElementById('password');
const $msg = document.getElementById('loginMsg');
const $submit = document.getElementById('submit');

function showMsg(t, type='error'){
  $msg.textContent = t;
  $msg.className = `msg ${type === 'ok' ? 'msg--ok' : type === 'info' ? 'msg--info' : 'msg--error'}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const rut = $rut.value.trim();
  const password = $password.value;

  if (!rut || !password) {
    showMsg('Ingresa RUT y contraseña.');
    return;
  }

  $submit.disabled = true;
  showMsg('Validando credenciales...', 'info');

  try {
    const res = await fetch('http://127.0.0.1:8000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rut, password })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showMsg(data.detail || 'Credenciales inválidas');
      return;
    }

    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    showMsg('Ingreso exitoso. Redirigiendo…', 'ok');
    setTimeout(() => (window.location.href = 'dashboard.html'), 600);
  } catch {
    showMsg('No se pudo conectar con el servidor.');
  } finally {
    $submit.disabled = false;
  }
});

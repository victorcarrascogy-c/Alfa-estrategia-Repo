// --- Elementos del DOM ---
// (Seleccionamos todos los elementos, incluyendo los nuevos para los efectos visuales)
const form = document.querySelector('form');
const $rut = document.getElementById('rut');
const $password = document.getElementById('password');
const $submit   = document.getElementById('submit');
const $msg      = document.getElementById('loginMsg');
const $toggle   = document.getElementById('ShowPassword'); // (Elemento nuevo)
const $statusBar = document.getElementById('progressBar');  // (Elemento nuevo)
const $statusIcon = document.getElementById('statusIcon'); // (Elemento nuevo)

// --- Función de Feedback (de tu script original) ---
/**
 * Muestra un mensaje de texto simple en el elemento $msg.
 * @param {string} t - Texto a mostrar.
 * @param {'error'|'ok'|'info'} [type='error'] - Tipo de mensaje para el estilo.
 */
function showMsg(t, type = 'error') {
  if (!$msg) return; // (Asegurarse de que $msg exista)
  $msg.textContent = t;
  $msg.className = `msg ${
    type === 'ok' ? 'msg--ok'
    : type === 'info' ? 'msg--info'
    : 'msg--error'
  }`;
}

// --- Nueva Función de Estado Visual (de tu nuevo script) ---
/**
 * Actualiza la barra de progreso y el ícono de estado.
 * @param {('loading'|'success'|'error'|'initial')} state
 * @param {string} iconText 
 */
function updateStatus(state, iconText = '') {
    // (Asegurarse de que los elementos existan antes de usarlos)
    if (!$statusBar || !$statusIcon) return; 

    $statusBar.className = 'progress-bar';
    $statusIcon.className = 'status-icon';
    $statusIcon.textContent = iconText;
    $statusIcon.style.opacity = '0';
    $statusBar.style.width = '0%';

    switch (state) {
        case 'loading':
            $statusBar.classList.add('progress-bar--loading');
            break;
        case 'success':
            $statusBar.classList.add('progress-bar--success');
            $statusIcon.classList.add('status-icon--success');
            setTimeout(() => { $statusIcon.style.opacity = '1'; }, 700); 
            break;
        case 'error':
            $statusBar.classList.add('progress-bar--error');
            $statusIcon.classList.add('status-icon--error');
            setTimeout(() => { $statusIcon.style.opacity = '1'; }, 700); 
            break;
        case 'initial':
        default:
            break;
    }
}

// --- Lógica del Toggle de Contraseña (de tu nuevo script) ---
if ($toggle) {
    $toggle.addEventListener('change', () => {
        const type = $password.getAttribute('type') === 'password' ? 'text' : 'password';
        $password.setAttribute('type', type);
    });
}

// --- Reseteo de Estado al Escribir (de tu nuevo script) ---
if ($rut) $rut.addEventListener('input', () => updateStatus('initial'));
if ($password) $password.addEventListener('input', () => updateStatus('initial'));

// --- Evento Principal de Submit (Híbrido) ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const rut = $rut.value.trim();
  const password = $password.value;

  if (!rut || !password) {
    showMsg('Ingresa RUT y contraseña.', 'error');
    return;
  }

  $submit.disabled = true;
  updateStatus('loading'); // (Nuevo feedback visual)
  showMsg('Validando...', 'info'); // (Feedback de texto)

  try {
    // --- INICIO DE LA ADAPTACIÓN ---
    // (Cambiamos de 'x-www-form-urlencoded' a 'json' para que coincida con seba.py)
    const res = await fetch('http://127.0.0.1:8000/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json' // (Cambiado)
      },
      // (Enviamos un JSON con 'rut', no 'username')
      body: JSON.stringify({ 
        rut: rut, 
        password: password 
      }) 
    });
    // --- FIN DE LA ADAPTACIÓN ---

    if (!res.ok) {
      // (Intentamos leer el error específico del backend)
      const data = await res.json().catch(() => ({}));
      const errorMsg = data.detail || 'Credenciales inválidas';
      
      showMsg(errorMsg, 'error'); // (Mostramos error de texto)
      updateStatus('error', 'X'); // (Mostramos error visual)
      return;
    }

    // (Éxito)
    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    
    showMsg('Ingreso exitoso. Redirigiendo…', 'ok'); // (Mensaje de texto)
    updateStatus('success', '✓'); // (Efecto visual)
    
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
  
  } catch (err) {
    console.error('Error de login:', err);
    showMsg('No se pudo conectar con el servidor.', 'error');
    updateStatus('error', 'X');
  } finally {
    // (Damos tiempo a que termine la animación antes de reactivar el botón)
    setTimeout(() => { $submit.disabled = false; }, 1200);
  }
});
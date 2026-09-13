const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyR8AZriUCm7F32JvSWBkOAAQwD98Od1IWjnsEC3pUNeom5jCgL_NkOf-wbiLt6Z9yw/exec"; 

let registrosGlobales = [];
let editMode = false;

window.onload = async function() {
  await cargarListaHojas();
};

async function cargarListaHojas() {
  const select = document.getElementById('sheetSelect');
  try {
    const url = `${SCRIPT_URL}?action=getSheets&_t=${Date.now()}`;
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    if (!response.ok) throw new Error("Error en la red");

    const hojas = await response.json();

    if (hojas.error) {
      alert("Error desde Google Apps Script: " + hojas.error);
      select.innerHTML = '<option value="">Error al cargar apiarios</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Selecciona un Apiario --</option>';
    hojas.forEach(hoja => {
      const option = document.createElement('option');
      option.value = hoja;
      option.textContent = hoja;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("Detalle del error al obtener hojas:", err);
    select.innerHTML = '<option value="">Error al cargar apiarios</option>';
  }
}

async function cargarDatos() {
  const sheetName = document.getElementById('sheetSelect').value;
  const lista = document.getElementById('listaRegistros');
  const infoSection = document.getElementById('infoSection');

  if (!sheetName) {
    infoSection.style.display = 'none';
    lista.innerHTML = "";
    ocultarFormulario();
    return;
  }

  lista.innerHTML = "<p style='text-align:center; padding:1.5rem; color:#64748b;'>Cargando registros del apiario...</p>";

  try {
    const url = `${SCRIPT_URL}?hoja=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    console.log("🔍 Consultando URL:", url);

    const response = await fetch(url, { method: 'GET', redirect: 'follow' });

    if (!response.ok) throw new Error("Error en la respuesta de la red");

    const data = await response.json();

    // IMPRIMIR LA RESPUESTA COMPLETA EN CONSOLA
    console.log("📦 DATOS RECIBIDOS DESDE GOOGLE APPS SCRIPT:", data);
    console.log("📏 Tipo de dato:", typeof data, " | Es Array?:", Array.isArray(data));

    if (data.error) {
      alert("Error reportado por el backend: " + data.error);
      lista.innerHTML = "";
      return;
    }

    registrosGlobales = Array.isArray(data) ? data : (data.registros || data.datos || []);
    console.log("📊 Registros procesados finales:", registrosGlobales);

    infoSection.style.display = 'block';
    document.getElementById('apiarioNombre').innerText = "📌 Apiario: " + sheetName;
    
    renderLista(registrosGlobales);
  } catch (err) {
    console.error("❌ Detalle del error al cargar:", err);
    alert("Error al cargar los datos del apiario. Reintenta la selección.");
    lista.innerHTML = "";
  }
}

function renderLista(registros) {
  const lista = document.getElementById('listaRegistros');
  lista.innerHTML = "";

  if (!registros || registros.length === 0) {
    lista.innerHTML = "<div class='card' style='text-align:center; color:#64748b; padding:2rem;'>Sin registros en este apiario. Presiona <strong>'➕ Agregar Nueva Tarea'</strong> para comenzar.</div>";
    return;
  }

  registros.forEach((item) => {
    // Si viene como array o como objeto mapeado
    const fecha = item.fecha || (Array.isArray(item) ? item[0] : '') || 'Sin fecha';
    const colmenas = item.colmenas !== undefined ? item.colmenas : (Array.isArray(item) ? item[1] : 0);
    const nucleos = item.nucleos !== undefined ? item.nucleos : (Array.isArray(item) ? item[2] : 0);
    const tarea = item.tarea || (Array.isArray(item) ? item[3] : '') || 'Sin especificar';
    const obs = item.obs || (Array.isArray(item) ? item[4] : '') || '';

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; font-weight:700; color:#d97706;">
        <span>📅 ${fecha}</span>
      </div>
      <div style="display:flex; gap:1rem; font-size:0.9rem; background:#f8fafc; padding:0.5rem 0.75rem; border-radius:6px; margin-bottom:0.5rem;">
        <span>🐝 Colmenas: <strong>${colmenas}</strong></span>
        <span>📦 Núcleos: <strong>${nucleos}</strong></span>
      </div>
      <div style="font-size:0.95rem; font-weight:600; margin-bottom:0.25rem;">📝 Tarea: ${tarea}</div>
      ${obs ? `<div style="font-size:0.85rem; color:#64748b; margin-top:0.25rem;">${obs}</div>` : ''}
      <div style="display:flex; gap:0.5rem; margin-top:0.85rem; border-top:1px solid #f1f5f9; padding-top:0.5rem;">
        <button class="btn btn-secondary btn-edit-card" style="padding:0.35rem 0.75rem; font-size:0.8rem;">✏️ Editar</button>
        <button class="btn btn-danger btn-delete-card" style="padding:0.35rem 0.75rem; font-size:0.8rem;">🗑️ Eliminar</button>
      </div>
    `;

    card.querySelector('.btn-edit-card').onclick = () => prepararEdicion(item);
    card.querySelector('.btn-delete-card').onclick = () => eliminarRegistro(fecha);

    lista.appendChild(card);
  });
}

function prepararEdicionDirecta(fecha, colmenas, nucleos, tarea, obs) {
  editMode = true;
  registroEditandoFecha = fecha;
  
  document.getElementById('formTitle').innerText = "Editar Registro";
  document.getElementById('inputFecha').value = fecha;
  document.getElementById('inputFecha').disabled = true; 
  document.getElementById('inputColmenas').value = colmenas || 0;
  document.getElementById('inputNucleos').value = nucleos || 0;
  document.getElementById('inputTarea').value = tarea || "";
  document.getElementById('inputObs').value = obs || "";
  
  document.getElementById('formRegistro').style.display = 'block';
  document.getElementById('formRegistro').scrollIntoView({ behavior: 'smooth' });
}

function filtrarRegistros() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  
  if (!query) {
    renderLista(registrosGlobales);
    return;
  }

  const filtrados = registrosGlobales.filter(item => {
    const fecha = String(item.Fecha || '').toLowerCase();
    const tarea = String(item.Tarea || '').toLowerCase();
    const obs = String(item.Observaciones || '').toLowerCase();
    const colmenas = String(item.Colmenas || '');
    const nucleos = String(item.Núcleos || '');

    return fecha.includes(query) || 
           tarea.includes(query) || 
           obs.includes(query) ||
           colmenas.includes(query) ||
           nucleos.includes(query);
  });

  renderLista(filtrados);
}

function mostrarFormulario() {
  editMode = false;
  document.getElementById('formTitle').innerText = "Nuevo Registro";
  document.getElementById('inputFecha').disabled = false;
  limpiarFormulario();
  document.getElementById('formRegistro').style.display = 'block';
}

function ocultarFormulario() {
  document.getElementById('formRegistro').style.display = 'none';
}

function limpiarFormulario() {
  document.getElementById('inputFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('inputColmenas').value = "0";
  document.getElementById('inputNucleos').value = "0";
  document.getElementById('inputTarea').value = "";
  document.getElementById('inputObs').value = "";
}

function prepararEdicion(item) {
  editMode = true;
  
  const getVal = (...keys) => {
    for (const k of keys) {
      if (item[k] !== undefined && item[k] !== null) return item[k];
    }
    return "";
  };

  const fecha = getVal('Fecha', 'fecha');
  
  registroEditandoFecha = fecha;
  document.getElementById('formTitle').innerText = "Editar Registro";
  document.getElementById('inputFecha').value = fecha;
  document.getElementById('inputFecha').disabled = true; 
  document.getElementById('inputColmenas').value = getVal('Colmenas', 'colmenas') || 0;
  document.getElementById('inputNucleos').value = getVal('Núcleos', 'Nucleos', 'núcleos', 'nucleos') || 0;
  document.getElementById('inputTarea').value = getVal('Tarea', 'tarea') || "";
  document.getElementById('inputObs').value = getVal('Observaciones', 'observaciones', 'obs') || "";
  
  document.getElementById('formRegistro').style.display = 'block';
  document.getElementById('formRegistro').scrollIntoView({ behavior: 'smooth' });
}

async function guardarRegistro() {
  const hoja = document.getElementById('sheetSelect').value;
  const payload = {
    hoja: hoja,
    action: editMode ? "edit" : "add",
    Fecha: document.getElementById('inputFecha').value,
    Colmenas: document.getElementById('inputColmenas').value,
    Núcleos: document.getElementById('inputNucleos').value,
    Tarea: document.getElementById('inputTarea').value,
    Observaciones: document.getElementById('inputObs').value
  };

  if (!payload.Fecha) return alert("Selecciona una fecha válida");

  await enviarPeticion(payload);
}

async function eliminarRegistro(fecha) {
  if (!confirm(`¿Seguro que deseas eliminar el registro de la fecha ${fecha}?`)) return;

  const hoja = document.getElementById('sheetSelect').value;
  const payload = {
    hoja: hoja,
    action: "delete",
    Fecha: fecha
  };

  await enviarPeticion(payload);
}

async function enviarPeticion(payload) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.error) {
      alert("Error: " + result.error);
    } else {
      alert(result.message || "Operación realizada correctamente");
      ocultarFormulario();
      cargarDatos();
    }
  } catch (err) {
    console.error("Error en enviarPeticion:", err);
    alert("Error de conexión o al procesar la respuesta.");
  }
}

// --- REGISTRO DE SERVICE WORKER (Sólo en servidor HTTP/HTTPS) ---
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker registrado correctamente.'))
      .catch((err) => console.error('Error al registrar Service Worker:', err));
  });
}

let deferredPrompt;
const btnInstall = document.getElementById('btnInstall');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (btnInstall) btnInstall.style.display = 'block';
});

if (btnInstall) {
  btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        btnInstall.style.display = 'none';
      }
      deferredPrompt = null;
    }
  });
}

// --- FUNCIONES DE GESTIÓN DE APIARIOS ---
function pedirTextoModal(titulo, valorInicial, callback) {
  const modal = document.getElementById('modalInput');
  const titleEl = document.getElementById('modalTitle');
  const inputEl = document.getElementById('modalTextVal');
  const btnAceptar = document.getElementById('btnModalAceptar');

  titleEl.innerText = titulo;
  inputEl.value = valorInicial || '';
  modal.style.display = 'flex';

  btnAceptar.onclick = async () => {
    const val = inputEl.value.trim();
    modal.style.display = 'none';
    if (val) await callback(val);
  };
}

function cerrarModalPrompt() {
  document.getElementById('modalInput').style.display = 'none';
}

async function crearApiario() {
  pedirTextoModal("Ingresa el nombre del nuevo Apiario:", "", async (nombre) => {
    const payload = {
      action: "addSheet",
      nombreApiario: nombre
    };
    await enviarPeticionGenerica(payload, async () => {
      await cargarListaHojas();
      document.getElementById('sheetSelect').value = nombre;
      cargarDatos();
    });
  });
}

async function renombrarApiario() {
  const sheetSelect = document.getElementById('sheetSelect');
  const actual = sheetSelect.value;

  if (!actual) {
    alert("Selecciona primero un apiario para renombrar.");
    return;
  }

  pedirTextoModal(`Nuevo nombre para "${actual}":`, actual, async (nuevoNombre) => {
    if (nuevoNombre === actual) return;
    const payload = {
      action: "renameSheet",
      hoja: actual,
      nuevoNombre: nuevoNombre
    };
    await enviarPeticionGenerica(payload, async () => {
      await cargarListaHojas();
      sheetSelect.value = nuevoNombre;
      cargarDatos();
    });
  });
}

async function eliminarApiario() {
  const sheetSelect = document.getElementById('sheetSelect');
  const actual = sheetSelect.value;

  if (!actual) {
    alert("Selecciona un apiario para eliminar.");
    return;
  }

  if (!confirm(`¿Estás seguro de que deseas ELIMINAR el apiario "${actual}" y todos sus registros? Esta acción no se puede deshacer.`)) {
    return;
  }

  const payload = {
    action: "deleteSheet",
    hoja: actual
  };

  await enviarPeticionGenerica(payload, async () => {
    await cargarListaHojas();
    document.getElementById('infoSection').style.display = 'none';
    document.getElementById('listaRegistros').innerHTML = '';
  });
}

async function enviarPeticionGenerica(payload, onSuccess) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (result.error) {
      alert("Error: " + result.error);
    } else {
      alert(result.message || "Operación realizada con éxito");
      if (onSuccess) await onSuccess();
    }
  } catch (err) {
    console.error("Error en la petición:", err);
    alert("Ocurrió un error al procesar la solicitud.");
  }
}

let listaHojasOriginal = [];
let ordenPersonalizado = [];

async function cargarListaHojas() {
  const select = document.getElementById('sheetSelect');
  try {
    const url = `${SCRIPT_URL}?action=getSheets&_t=${Date.now()}`;
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });

    if (!response.ok) throw new Error("Error en la red");

    const data = await response.json();
    listaHojasOriginal = data.sheets || [];
    ordenPersonalizado = data.customOrder || [];

    // Aplicar el criterio de orden seleccionado actualmente
    const criterio = document.getElementById('sortSelect')?.value || 'custom';
    aplicarOrdenYRenderizar(criterio);

  } catch (err) {
    console.error("Detalle del error al obtener hojas:", err);
    select.innerHTML = '<option value="">Error al cargar apiarios</option>';
  }
}

function aplicarOrdenYRenderizar(criterio) {
  const select = document.getElementById('sheetSelect');
  const valorSeleccionado = select.value;
  let hojasOrdenadas = [...listaHojasOriginal];

  if (criterio === 'alpha-asc') {
    hojasOrdenadas.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } else if (criterio === 'alpha-desc') {
    hojasOrdenadas.sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' }));
  } else if (criterio === 'custom' && ordenPersonalizado.length > 0) {
    hojasOrdenadas.sort((a, b) => {
      let idxA = ordenPersonalizado.indexOf(a);
      let idxB = ordenPersonalizado.indexOf(b);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }

  select.innerHTML = '<option value="">-- Selecciona un Apiario --</option>';
  hojasOrdenadas.forEach(hoja => {
    const option = document.createElement('option');
    option.value = hoja;
    option.textContent = hoja;
    select.appendChild(option);
  });

  if (valorSeleccionado && hojasOrdenadas.includes(valorSeleccionado)) {
    select.value = valorSeleccionado;
  }
}

function cambiarOrdenApiarios(criterio) {
  aplicarOrdenYRenderizar(criterio);
}

// --- MODAL Y LOGICA DE REORDENAMIENTO MANUAL ---

function abrirModalOrden() {
  const lista = document.getElementById('listaOrdenable');
  lista.innerHTML = '';

  const criterio = document.getElementById('sortSelect').value;
  let hojasActuales = [...listaHojasOriginal];

  if (criterio === 'custom' && ordenPersonalizado.length > 0) {
    hojasActuales.sort((a, b) => {
      let idxA = ordenPersonalizado.indexOf(a);
      let idxB = ordenPersonalizado.indexOf(b);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }

  hojasActuales.forEach((hoja) => {
    const li = document.createElement('li');
    li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem; border-bottom:1px solid #eee;";
    li.dataset.nombre = hoja;
    li.innerHTML = `
      <span>📌 ${hoja}</span>
      <div>
        <button class="btn" style="padding:0.2rem 0.4rem; font-size:0.75rem;" onclick="moverElemento(this, -1)">▲</button>
        <button class="btn" style="padding:0.2rem 0.4rem; font-size:0.75rem;" onclick="moverElemento(this, 1)">▼</button>
      </div>
    `;
    lista.appendChild(li);
  });

  document.getElementById('modalReordenar').style.display = 'flex';
}

function cerrarModalOrden() {
  document.getElementById('modalReordenar').style.display = 'none';
}

function moverElemento(btn, direccion) {
  const li = btn.closest('li');
  if (direccion === -1 && li.previousElementSibling) {
    li.parentNode.insertBefore(li, li.previousElementSibling);
  } else if (direccion === 1 && li.nextElementSibling) {
    li.parentNode.insertBefore(li.nextElementSibling, li);
  }
}

async function guardarOrdenManual() {
  const items = document.querySelectorAll('#listaOrdenable li');
  const nuevoOrden = Array.from(items).map(li => li.dataset.nombre);

  ordenPersonalizado = nuevoOrden;
  document.getElementById('sortSelect').value = 'custom';
  aplicarOrdenYRenderizar('custom');
  cerrarModalOrden();

  // Guardar en Apps Script
  await enviarPeticionGenerica({
    action: "saveSheetsOrder",
    order: nuevoOrden
  });
}
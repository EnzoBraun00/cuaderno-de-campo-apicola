const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyR8AZriUCm7F32JvSWBkOAAQwD98Od1IWjnsEC3pUNeom5jCgL_NkOf-wbiLt6Z9yw/exec"; 

let registrosGlobales = [];
let editMode = false;
let registroEditandoFecha = null;
let listaHojasOriginal = [];
let ordenPersonalizado = [];

// ==========================================
// INICIALIZACIÓN
// ==========================================
window.onload = async function() {
  await cargarListaHojas();
};

document.addEventListener('DOMContentLoaded', () => {
  const btnToggle = document.getElementById('btnToggleOffline');
  const seccionOffline = document.getElementById('seccionOffline');

  if (btnToggle && seccionOffline) {
    btnToggle.addEventListener('click', () => {
      if (seccionOffline.style.display === 'none' || seccionOffline.style.display === '') {
        seccionOffline.style.display = 'block';
        btnToggle.innerHTML = "❌ <span>Ocultar Entrada Manual</span>";
      } else {
        seccionOffline.style.display = 'none';
        btnToggle.innerHTML = "📝 <span>Abrir Entrada Manual / Offline</span>";
      }
    });
  }

  const btnGuardar = document.getElementById('btnGuardarNota');
  if (btnGuardar) btnGuardar.addEventListener('click', procesarONoGuardarNota);

  const btnSincro = document.getElementById('btnSincronizar');
  if (btnSincro) btnSincro.addEventListener('click', sincronizarNotasPendientes);

  actualizarContadorPendientes();
  activarGuardadoEnTiempoReal();

  window.addEventListener('online', () => {
    console.log("📶 Conexión restablecida. Sincronizando notas pendientes...");
    sincronizarNotasPendientes();
  });
});

// ==========================================
// CONSULTA Y RENDERIZADO DE REGISTROS
// ==========================================
async function cargarDatos() {
  const sheetName = getApiarioSeleccionado();
  const lista = document.getElementById('listaRegistros');
  const infoSection = document.getElementById('infoSection');

  if (!sheetName) {
    if (infoSection) infoSection.style.display = 'none';
    if (lista) lista.innerHTML = "";
    ocultarFormulario();
    return;
  }

  if (lista) lista.innerHTML = "<p style='text-align:center; padding:1.5rem; color:#64748b;'>Cargando registros del apiario...</p>";

  try {
    const url = `${SCRIPT_URL}?hoja=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });

    if (!response.ok) throw new Error("Error en la respuesta de la red");

    const data = await response.json();

    if (data.error) {
      alert("Error reportado por el backend: " + data.error);
      if (lista) lista.innerHTML = "";
      return;
    }

    registrosGlobales = Array.isArray(data) ? data : (data.registros || data.datos || []);

    if (infoSection) infoSection.style.display = 'block';
    const titleEl = document.getElementById('apiarioNombre');
    if (titleEl) titleEl.innerText = "📌 Apiario: " + sheetName;
    
    renderLista(registrosGlobales);
  } catch (err) {
    console.error("❌ Detalle del error al cargar:", err);
    alert("Error al cargar los datos del apiario. Reintenta la selección.");
    if (lista) lista.innerHTML = "";
  }
}

function renderLista(registros) {
  const lista = document.getElementById('listaRegistros');
  if (!lista) return;

  lista.innerHTML = "";

  if (!registros || registros.length === 0) {
    lista.innerHTML = "<div class='card' style='text-align:center; color:#64748b; padding:2rem;'>Sin registros en este apiario. Presiona <strong>'➕ Agregar Nueva Tarea'</strong> para comenzar.</div>";
    return;
  }

  registros.forEach((item) => {
    const fecha = item.fecha || item.Fecha || (Array.isArray(item) ? item[1] : '') || 'Sin fecha';
    const colmenas = item.colmenas !== undefined ? item.colmenas : (item.Colmenas !== undefined ? item.Colmenas : (Array.isArray(item) ? item[2] : 0));
    const nucleos = item.nucleos !== undefined ? item.nucleos : (item.Núcleos !== undefined ? item.Núcleos : (Array.isArray(item) ? item[3] : 0));
    const tarea = item.tarea || item.Tarea || (Array.isArray(item) ? item[4] : '') || 'Sin especificar';
    const obs = item.obs || item.Observaciones || item.observaciones || (Array.isArray(item) ? item[5] : '') || '';

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

function filtrarRegistros() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  
  if (!query) {
    renderLista(registrosGlobales);
    return;
  }

  const filtrados = registrosGlobales.filter(item => {
    const fecha = String(item.Fecha || item.fecha || '').toLowerCase();
    const tarea = String(item.Tarea || item.tarea || '').toLowerCase();
    const obs = String(item.Observaciones || item.obs || '').toLowerCase();
    const colmenas = String(item.Colmenas || item.colmenas || '');
    const nucleos = String(item.Núcleos || item.nucleos || '');

    return fecha.includes(query) || 
           tarea.includes(query) || 
           obs.includes(query) ||
           colmenas.includes(query) ||
           nucleos.includes(query);
  });

  renderLista(filtrados);
}

// ==========================================
// ABM DE REGISTROS (FORMULARIO)
// ==========================================
function mostrarFormulario() {
  editMode = false;
  document.getElementById('formTitle').innerText = "Nuevo Registro";
  document.getElementById('inputFecha').disabled = false;
  limpiarFormulario();
  document.getElementById('formRegistro').style.display = 'block';
}

function ocultarFormulario() {
  const form = document.getElementById('formRegistro');
  if (form) form.style.display = 'none';
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
  
  const fecha = item.fecha || item.Fecha || "";
  
  registroEditandoFecha = fecha;
  document.getElementById('formTitle').innerText = "Editar Registro";
  document.getElementById('inputFecha').value = fecha;
  document.getElementById('inputFecha').disabled = true; 
  document.getElementById('inputColmenas').value = item.colmenas !== undefined ? item.colmenas : (item.Colmenas || 0);
  document.getElementById('inputNucleos').value = item.nucleos !== undefined ? item.nucleos : (item.Núcleos || 0);
  document.getElementById('inputTarea').value = item.tarea || item.Tarea || "";
  document.getElementById('inputObs').value = item.obs || item.Observaciones || "";
  
  document.getElementById('formRegistro').style.display = 'block';
  document.getElementById('formRegistro').scrollIntoView({ behavior: 'smooth' });
}

let enviandoRegistro = false;

async function guardarRegistro() {
  if (enviandoRegistro) return;

  const hoja = getApiarioSeleccionado();
  const fecha = document.getElementById('inputFecha').value;

  if (!hoja) return alert("Por favor, selecciona un apiario.");
  if (!fecha) return alert("Selecciona una fecha válida.");

  if (typeof timerAutoGuardado !== 'undefined' && timerAutoGuardado) {
    clearTimeout(timerAutoGuardado);
  }

  const payload = {
    hoja: hoja,
    action: editMode ? "edit" : "add",
    Fecha: fecha,
    Colmenas: document.getElementById('inputColmenas').value,
    Núcleos: document.getElementById('inputNucleos').value,
    Tarea: document.getElementById('inputTarea').value,
    Observaciones: document.getElementById('inputObs').value
  };

  enviandoRegistro = true;
  const btnGuardar = document.querySelector('#formRegistro .btn-primary');
  let textoOriginal = "";
  if (btnGuardar) {
    textoOriginal = btnGuardar.innerText;
    btnGuardar.disabled = true;
    btnGuardar.innerText = "⏳ Guardando...";
  }

  try {
    await enviarPeticion(payload);
  } finally {
    enviandoRegistro = false;
    if (btnGuardar) {
      btnGuardar.disabled = false;
      btnGuardar.innerText = textoOriginal;
    }
  }
}

async function eliminarRegistro(fecha) {
  if (!confirm(`¿Seguro que deseas eliminar el registro de la fecha ${fecha}?`)) return;

  const hoja = getApiarioSeleccionado();
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
      headers: { "Content-Type": "text/plain;charset=utf-8" },
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

// ==========================================
// OBTENER APIARIO ACTIVO
// ==========================================
function getApiarioSeleccionado() {
  const select = document.getElementById('sheetSelect');
  
  if (select && select.value) {
    return select.value;
  }
  
  const triggerSpan = document.querySelector('#customSelectHeader span');
  if (triggerSpan) {
    const textoHeader = triggerSpan.textContent
      .replace('- ', '')
      .replace('-- Seleccionar Apiario --', '')
      .trim();
    if (textoHeader) return textoHeader;
  }

  if (listaHojasOriginal && listaHojasOriginal.length > 0) {
    return ordenPersonalizado.length > 0 ? ordenPersonalizado[0] : listaHojasOriginal[0];
  }

  return "";
}

function seleccionarApiarioCustom(val, texto) {
  const selectOculto = document.getElementById('sheetSelect');
  const triggerHeader = document.querySelector('#customSelectHeader span');

  if (selectOculto) {
    selectOculto.value = val;
    if (triggerHeader) triggerHeader.textContent = texto;
    toggleCustomDropdown();
    cargarDatos();
  }
}

function toggleCustomDropdown() {
  const optionsDiv = document.getElementById('customSelectOptions');
  if (optionsDiv) {
    optionsDiv.style.display = optionsDiv.style.display === 'none' ? 'block' : 'none';
  }
}

// ==========================================
// RENDERIZADO Y AUTO-SELECCIÓN INICIAL
// ==========================================
function aplicarOrdenYRenderizar(criterio) {
  const selectOculto = document.getElementById('sheetSelect');
  const customOptions = document.getElementById('customSelectOptions');
  if (!selectOculto || !customOptions || !listaHojasOriginal || listaHojasOriginal.length === 0) return;

  let valorSeleccionado = selectOculto.value;
  let hojasOrdenadas = [...listaHojasOriginal];

  if (criterio === 'alpha-asc') {
    hojasOrdenadas.sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
  } else if (criterio === 'alpha-desc') {
    hojasOrdenadas.sort((a, b) => b.localeCompare(a, 'es', { numeric: true, sensitivity: 'base' }));
  } else if (criterio === 'custom' && ordenPersonalizado.length > 0) {
    hojasOrdenadas.sort((a, b) => {
      let idxA = ordenPersonalizado.indexOf(a);
      let idxB = ordenPersonalizado.indexOf(b);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }

  selectOculto.innerHTML = '';
  customOptions.innerHTML = '';

  if (!valorSeleccionado && hojasOrdenadas.length > 0) {
    valorSeleccionado = hojasOrdenadas[0];
  }

  hojasOrdenadas.forEach((hoja, index) => {
    const optionObj = document.createElement('option');
    optionObj.value = hoja;
    optionObj.textContent = hoja;
    selectOculto.appendChild(optionObj);

    const div = document.createElement('div');
    const claseColor = (index % 2 === 0) ? 'opcion-amarilla' : 'opcion-azul';
    div.className = `custom-option ${claseColor}`;
    div.textContent = ` ${hoja}`;
    div.onclick = () => seleccionarApiarioCustom(hoja, ` ${hoja}`);

    customOptions.appendChild(div);
  });

  if (valorSeleccionado && hojasOrdenadas.includes(valorSeleccionado)) {
    selectOculto.value = valorSeleccionado;
    const triggerHeader = document.querySelector('#customSelectHeader span');
    if (triggerHeader) triggerHeader.textContent = ` ${valorSeleccionado}`;
  }
}

// ==========================================
// NOTAS Y ENTRADA MANUAL / OFFLINE
// ==========================================
async function procesarONoGuardarNota() {
  const inputTexto = document.getElementById('txtNotaOffline');
  const btnGuardarNota = document.getElementById('btnGuardarNota');
  const texto = inputTexto ? inputTexto.value.trim() : '';
  const hoja = getApiarioSeleccionado();

  if (!hoja) return alert("Selecciona primero un apiario.");
  if (!texto) return alert("Escribe o dicta una nota antes de guardar.");

  if (!navigator.onLine) {
    guardarEnLocalStorage(texto, hoja);
    if (inputTexto) inputTexto.value = "";
    alert("📶 Sin conexión: Guardado localmente.");
    return;
  }

  setCargando(btnGuardarNota, true, "⏳ Enviando...");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "addFromVoice", texto: texto, hoja: hoja })
    });

    const res = await response.json();

    if (res.error) {
      alert("⚠️ " + res.error);
    } else {
      alert(res.message || "Nota procesada correctamente.");
      if (inputTexto) inputTexto.value = "";
      if (typeof cargarDatos === "function") cargarDatos();
    }
  } catch (err) {
    guardarEnLocalStorage(texto, hoja);
    if (inputTexto) inputTexto.value = "";
    alert("⚠️ Fallo de conexión. Guardado en el dispositivo.");
  } finally {
    setCargando(btnGuardarNota, false);
  }
}

function guardarEnLocalStorage(texto, hoja) {
  const pendientes = JSON.parse(localStorage.getItem('notas_apiario_pendientes') || '[]');
  pendientes.push({
    texto: texto,
    hoja: hoja,
    fechaRegistro: new Date().toISOString()
  });
  localStorage.setItem('notas_apiario_pendientes', JSON.stringify(pendientes));
  actualizarContadorPendientes();
}

async function sincronizarNotasPendientes() {
  const pendientes = JSON.parse(localStorage.getItem('notas_apiario_pendientes') || '[]');
  const btnSincro = document.getElementById('btnSincronizar');

  if (pendientes.length === 0) {
    alert("No hay notas pendientes por sincronizar.");
    return;
  }

  if (!navigator.onLine) {
    alert("Aún no tienes conexión a internet para sincronizar.");
    return;
  }

  if (btnSincro) {
    btnSincro.disabled = true;
    btnSincro.innerText = "⏳ Sincronizando...";
  }

  let exitosos = 0;
  const restantes = [];

  for (const nota of pendientes) {
    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ 
          action: "addFromVoice", 
          texto: nota.texto,
          hoja: nota.hoja || getApiarioSeleccionado()
        })
      });

      const textResponse = await response.text();
      let res;
      try {
        res = JSON.parse(textResponse);
      } catch (e) {
        console.error("El servidor devolvió HTML en lugar de JSON:", textResponse);
        throw new Error("Respuesta no válida del servidor.");
      }
      if (!res.error) {
        exitosos++;
      } else {
        restantes.push(nota);
      }
    } catch (err) {
      console.error("Error sincronizando nota individual:", err);
      restantes.push(nota);
    }
  }

  localStorage.setItem('notas_apiario_pendientes', JSON.stringify(restantes));
  actualizarContadorPendientes();

  if (btnSincro) {
    btnSincro.disabled = false;
    btnSincro.innerHTML = `🔄 Sincronizar (<span id="cantPendientes">${restantes.length}</span>)`;
  }

  alert(`🔄 Sincronización completada: ${exitosos} notas enviadas con éxito.`);
  if (typeof cargarDatos === "function" && getApiarioSeleccionado()) {
    cargarDatos();
  }
}

function actualizarContadorPendientes() {
  const pendientes = JSON.parse(localStorage.getItem('notas_apiario_pendientes') || '[]');
  const cantSpan = document.getElementById('cantPendientes');
  if (cantSpan) {
    cantSpan.innerText = pendientes.length;
  }
}

// ==========================================
// REGISTRO DE SERVICE WORKER E INSTALACIÓN PWA
// ==========================================
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

// ==========================================
// AUTO-GUARDADO EN TIEMPO REAL (DEBOUNCE)
// ==========================================
let timerAutoGuardado = null;

function activarGuardadoEnTiempoReal() {
  const campos = ['inputFecha', 'inputColmenas', 'inputNucleos', 'inputTarea', 'inputObs'];

  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const fecha = document.getElementById('inputFecha').value;
        const tarea = document.getElementById('inputTarea').value.trim();

        if (!fecha) return;

        mostrarEstadoGuardado("✍️ Escribiendo...");
        clearTimeout(timerAutoGuardado);

        timerAutoGuardado = setTimeout(async () => {
          if (tarea || editMode) {
            mostrarEstadoGuardado("⏳ Guardando cambios...");
            await guardarRegistroSilencioso();
          }
        }, 1200);
      });
    }
  });
}

async function guardarRegistroSilencioso() {
  const hoja = getApiarioSeleccionado();
  if (!hoja) return;

  const payload = {
    hoja: hoja,
    action: editMode ? "edit" : "add",
    Fecha: document.getElementById('inputFecha').value,
    Colmenas: document.getElementById('inputColmenas').value,
    Núcleos: document.getElementById('inputNucleos').value,
    Tarea: document.getElementById('inputTarea').value,
    Observaciones: document.getElementById('inputObs').value
  };

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!result.error) {
      mostrarEstadoGuardado("✅ Guardado automáticamente");
      cargarDatosSilencioso();
    } else {
      mostrarEstadoGuardado("⚠️ Error al auto-guardar");
    }
  } catch (err) {
    console.error("Error en auto-guardado:", err);
    mostrarEstadoGuardado("📶 Sin conexión (no guardado)");
  }
}

async function cargarDatosSilencioso() {
  const sheetName = getApiarioSeleccionado();
  if (!sheetName) return;

  try {
    const url = `${SCRIPT_URL}?hoja=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!response.ok) return;

    const data = await response.json();
    if (!data.error) {
      registrosGlobales = Array.isArray(data) ? data : (data.registros || data.datos || []);
      renderLista(registrosGlobales);
    }
  } catch (err) {
    console.error("Error cargando lista en segundo plano:", err);
  }
}   

function mostrarEstadoGuardado(mensaje) {
  let statusEl = document.getElementById('autoSaveStatus');
  if (!statusEl) {
    statusEl = document.createElement('span');
    statusEl.id = 'autoSaveStatus';
    statusEl.style.cssText = "font-size: 0.8rem; color: #65a30d; margin-left: 0.5rem; font-weight: 500;";
    const header = document.querySelector('#formRegistro .form-header');
    if (header) header.appendChild(statusEl);
  }
  statusEl.innerText = mensaje;
}

// ==========================================
// CARGA Y GESTIÓN DE HOJAS / APIARIOS
// ==========================================
async function cargarListaHojas() {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getSheets`);
    const text = await response.text();
    
    if (text.trim().startsWith("<")) {
      console.error("Respuesta no válida del servidor:", text);
      throw new Error("El script devolvió HTML. Verifica los permisos de la Web App en Google Apps Script.");
    }

    const data = JSON.parse(text);

    if (data.error) {
      throw new Error(data.error);
    }

    if (Array.isArray(data.sheets)) {
      listaHojasOriginal = data.sheets;

      const ordenGuardado = JSON.parse(localStorage.getItem('orden_apiarios_custom') || '[]');
      
      if (ordenGuardado.length > 0) {
        const hojasSet = new Set(listaHojasOriginal);
        const apiariosValidos = ordenGuardado.filter(hoja => hojasSet.has(hoja));
        const apiariosNuevos = listaHojasOriginal.filter(hoja => !ordenGuardado.includes(hoja));
        
        ordenPersonalizado = [...apiariosValidos, ...apiariosNuevos];
      } else {
        ordenPersonalizado = [...listaHojasOriginal];
      }

      const sortSelect = document.getElementById('sortSelect');
      const criterioActual = sortSelect ? sortSelect.value : 'custom';

      aplicarOrdenYRenderizar(criterioActual);
      cargarDatos();
    }
  } catch (error) {
    console.error("Detalle del error al obtener hojas:", error);
  }
}

// ==========================================
// REORDENAMIENTO MANUAL DE APIARIOS
// ==========================================
function reordenarHojas() {
  const modal = document.getElementById('modalReordenar');
  const lista = document.getElementById('listaOrdenable');

  if (!listaHojasOriginal || listaHojasOriginal.length === 0) {
    alert("No hay apiarios cargados para reordenar.");
    return;
  }

  lista.innerHTML = '';
  const listaParaMostrar = ordenPersonalizado.length > 0 ? ordenPersonalizado : listaHojasOriginal;

  listaParaMostrar.forEach((hoja) => {
    const li = document.createElement('li');
    li.dataset.nombre = hoja;
    li.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.6rem; margin-bottom: 0.4rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;";
    
    li.innerHTML = `
      <span style="font-weight: 600; color: #334155;">📌 ${hoja}</span>
      <div style="display: flex; gap: 0.25rem;">
        <button type="button" class="btn" style="padding: 0.2rem 0.5rem; background: #cbd5e1;" onclick="moverElemento(this, -1)">⬆️</button>
        <button type="button" class="btn" style="padding: 0.2rem 0.5rem; background: #cbd5e1;" onclick="moverElemento(this, 1)">⬇️</button>
      </div>
    `;
    lista.appendChild(li);
  });

  if (modal) modal.style.display = 'flex';
}

function moverElemento(btn, direccion) {
  const li = btn.closest('li');
  if (direccion === -1 && li.previousElementSibling) {
    li.parentNode.insertBefore(li, li.previousElementSibling);
  } else if (direccion === 1 && li.nextElementSibling) {
    li.parentNode.insertBefore(li.nextElementSibling, li);
  }
}

function cerrarModalOrden() {
  const modal = document.getElementById('modalReordenar');
  if (modal) modal.style.display = 'none';
}

async function guardarOrdenManual() {
  const items = document.querySelectorAll('#listaOrdenable li');
  const nuevoOrden = Array.from(items).map(li => li.dataset.nombre);

  if (nuevoOrden.length === 0) return;

  ordenPersonalizado = nuevoOrden;
  listaHojasOriginal = [...nuevoOrden];

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.value = 'custom';
  
  aplicarOrdenYRenderizar('custom');
  cerrarModalOrden();

  localStorage.setItem('orden_apiarios_custom', JSON.stringify(nuevoOrden));

  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveSheetsOrder", order: nuevoOrden })
    });
  } catch (e) {
    console.log("Orden guardado localmente en el dispositivo.");
  }
}

function setCargando(elemento, cargando, textoCargando = "⏳ Procesando...") {
  if (!elemento) return;
  
  if (cargando) {
    elemento.dataset.originalText = elemento.innerHTML;
    elemento.disabled = true;
    elemento.style.opacity = "0.65";
    elemento.style.cursor = "not-allowed";
    if (elemento.tagName === "BUTTON") {
      elemento.innerHTML = textoCargando;
    }
  } else {
    elemento.disabled = false;
    elemento.style.opacity = "1";
    elemento.style.cursor = "pointer";
    if (elemento.dataset.originalText) {
      elemento.innerHTML = elemento.dataset.originalText;
    }
  }
}
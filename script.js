const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyR8AZriUCm7F32JvSWBkOAAQwD98Od1IWjnsEC3pUNeom5jCgL_NkOf-wbiLt6Z9yw/exec"; 

let registrosGlobales = [];
let editMode = false;
let registroEditandoFecha = null;
let listaHojasOriginal = [];
let ordenPersonalizado = [];
let enviandoRegistro = false; // Flag para prevenir peticiones simultáneas

// ==========================================
// INICIALIZACIÓN
// ==========================================
window.onload = async function() {
  await cargarListaHojas();
};

document.addEventListener('DOMContentLoaded', () => {
  // Manejo de la entrada manual / offline
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

  // Eventos para guardar y sincronizar notas
  const btnGuardar = document.getElementById('btnGuardarNota');
  if (btnGuardar) btnGuardar.addEventListener('click', (e) => {
    e.preventDefault();
    procesarONoGuardarNota();
  });

  const btnSincro = document.getElementById('btnSincronizar');
  if (btnSincro) btnSincro.addEventListener('click', (e) => {
    e.preventDefault();
    sincronizarNotasPendientes();
  });

  // Inicialización de selector de ordenamiento de apiarios
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      aplicarOrdenYRenderizar(e.target.value);
    });
  }

  // Control para abrir / cerrar el menú selector personalizado
  const trigger = document.getElementById('customSelectTrigger');
  const customOptions = document.getElementById('customSelectOptions');
  
  if (trigger && customOptions) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const estaActivo = customOptions.style.display === 'block' || customOptions.classList.contains('active');
      if (estaActivo) {
        customOptions.style.display = 'none';
        customOptions.classList.remove('active');
      } else {
        customOptions.style.display = 'block';
        customOptions.classList.add('active');
      }
    });

    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target) && !customOptions.contains(e.target)) {
        customOptions.style.display = 'none';
        customOptions.classList.remove('active');
      }
    });
  }

  actualizarContadorPendientes();
  activarGuardadoEnTiempoReal();

  window.addEventListener('online', () => {
    console.log("📶 Conexión restablecida. Sincronizando notas pendientes...");
    sincronizarNotasPendientes();
  });
});

// ==========================================
// FUNCIÓN PRINCIPAL DE GUARDADO (INVENTADA / CORREGIDA)
// ==========================================
async function guardarRegistro(event) {
  if (event) event.preventDefault();

  if (enviandoRegistro) return;

  const hoja = getApiarioSeleccionado();
  const fecha = document.getElementById('inputFecha').value;
  const colmenas = document.getElementById('inputColmenas').value;
  const nucleos = document.getElementById('inputNucleos').value;
  const tarea = document.getElementById('inputTarea').value.trim();
  const obs = document.getElementById('inputObs').value.trim();

  if (!hoja) return alert("Por favor, selecciona un apiario primero.");
  if (!fecha) return alert("Por favor, selecciona una fecha.");
  if (!tarea) return alert("Por favor, ingresa el detalle de la tarea.");

  const payload = {
    hoja: hoja,
    action: editMode ? "edit" : "add",
    Fecha: fecha,
    Colmenas: colmenas,
    Núcleos: nucleos,
    Tarea: tarea,
    Observaciones: obs
  };

  const btnGuardar = document.querySelector('#formRegistro .btn-primary');
  setCargando(btnGuardar, true, "⏳ Guardando...");

  await enviarPeticion(payload);

  setCargando(btnGuardar, false);
}

// ==========================================
// CONSULTA Y RENDERIZADO DE REGISTROS
// ==========================================
async function cargarDatos(nombreHojaOpcional) {
  const sheetName = nombreHojaOpcional || getApiarioSeleccionado();
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
    if (titleEl) titleEl.innerText = "📌: " + sheetName;
    
    const ultimoEstado = obtenerUltimoEstadoApiario(registrosGlobales);
    const inputColmenas = document.getElementById('inputColmenas');
    const inputNucleos = document.getElementById('inputNucleos');
    
    if (inputColmenas) inputColmenas.value = ultimoEstado.colmenas;
    if (inputNucleos) inputNucleos.value = ultimoEstado.nucleos;

    renderLista(registrosGlobales);
  } catch (err) {
    console.error("❌ Detalle del error al cargar:", err);
    alert("Error al cargar los datos del apiario.");
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

function obtenerUltimoEstadoApiario(registros) {
  if (!registros || registros.length === 0) {
    return { colmenas: 0, nucleos: 0, fecha: null };
  }

  const registrosNormalizados = registros.map(item => {
    const rawFecha = item.fecha || item.Fecha || (Array.isArray(item) ? item[1] : '') || '';
    const colmenas = item.colmenas !== undefined ? item.colmenas : (item.Colmenas !== undefined ? item.Colmenas : (Array.isArray(item) ? item[2] : 0));
    const nucleos = item.nucleos !== undefined ? item.nucleos : (item.Núcleos !== undefined ? item.Núcleos : (Array.isArray(item) ? item[3] : 0));

    let timestamp = 0;
    if (rawFecha) {
      const fechaParseable = String(rawFecha).includes('T') ? rawFecha : String(rawFecha).replace(/-/g, '/');
      timestamp = new Date(fechaParseable).getTime() || 0;
    }

    return {
      fechaStr: rawFecha,
      timestamp: timestamp,
      colmenas: parseInt(colmenas || 0, 10),
      nucleos: parseInt(nucleos || 0, 10)
    };
  });

  registrosNormalizados.sort((a, b) => b.timestamp - a.timestamp);
  const ultimoRegistro = registrosNormalizados[0];

  return {
    colmenas: isNaN(ultimoRegistro.colmenas) ? 0 : ultimoRegistro.colmenas,
    nucleos: isNaN(ultimoRegistro.nucleos) ? 0 : ultimoRegistro.nucleos,
    fecha: ultimoRegistro.fechaStr
  };
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
  
  const ultimoEstado = obtenerUltimoEstadoApiario(registrosGlobales);
  document.getElementById('inputColmenas').value = ultimoEstado.colmenas;
  document.getElementById('inputNucleos').value = ultimoEstado.nucleos;
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

async function eliminarRegistro(fecha) {
  if (enviandoRegistro) return;
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
  if (enviandoRegistro) return;
  enviandoRegistro = true;

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
  } finally {
    enviandoRegistro = false;
  }
}

// ==========================================
// OBTENER Y SELECCIONAR APIARIO ACTIVO
// ==========================================
function getApiarioSeleccionado() {
  const select = document.getElementById('sheetSelect');
  
  if (select && select.value) {
    return select.value;
  }
  
  const selectText = document.getElementById('selectText');
  if (selectText) {
    const textoHeader = selectText.textContent.trim();
    if (textoHeader && !textoHeader.includes('Cargando') && !textoHeader.includes('Error')) {
      return textoHeader;
    }
  }

  if (listaHojasOriginal && listaHojasOriginal.length > 0) {
    return ordenPersonalizado.length > 0 ? ordenPersonalizado[0] : listaHojasOriginal[0];
  }

  return "";
}

function seleccionarApiarioCustom(nombreApiario) {
  const selectOculto = document.getElementById('sheetSelect');
  if (selectOculto) selectOculto.value = nombreApiario;

  const selectText = document.getElementById('selectText');
  if (selectText) {
    selectText.className = '';
    selectText.textContent = nombreApiario;
  }

  const options = document.getElementById('customSelectOptions');
  if (options) {
    options.style.display = 'none';
    options.classList.remove('active');
  }

  cargarDatos(nombreApiario);
}

// ==========================================
// RENDERIZADO DE SELECTOR DE APIARIOS
// ==========================================
function aplicarOrdenYRenderizar(criterio) {
  const selectOculto = document.getElementById('sheetSelect');
  const customOptions = document.getElementById('customSelectOptions');
  if (!selectOculto || !customOptions || !listaHojasOriginal || listaHojasOriginal.length === 0) return;

  // 1. Guardar la selección actual antes de limpiar el DOM
  let valorSeleccionado = (typeof getApiarioSeleccionado === 'function') 
    ? getApiarioSeleccionado() 
    : selectOculto.value;

  let hojasOrdenadas = [...listaHojasOriginal];

  // 2. Ordenar las hojas según el criterio
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

  // 3. Limpiar elementos previos
  selectOculto.innerHTML = '';
  customOptions.innerHTML = '';

  // 4. Crear cabecera móvil con botón de cierre seguro
  const mobileHeader = document.createElement('div');
  mobileHeader.className = 'mobile-select-header';
  mobileHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: #d97706; color: white; border-radius: 4px 4px 0 0;";
  mobileHeader.innerHTML = `
    <span>Seleccionar Apiario</span>
    <button type="button" id="btnCerrarSelectorCustom" style="background:none; border:none; color:white; font-size:1.2rem; cursor:pointer; padding: 0 0.5rem;">✕</button>
  `;
  customOptions.appendChild(mobileHeader);

  // Evento directo de cierre sin recargar nada
  const btnCerrar = mobileHeader.querySelector('#btnCerrarSelectorCustom');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      customOptions.style.display = 'none';
      customOptions.classList.remove('active');
    });
  }

  // 5. Establecer valor por defecto si no había ninguno
  if (!valorSeleccionado && hojasOrdenadas.length > 0) {
    valorSeleccionado = hojasOrdenadas[0];
  }

  // 6. Generar opciones en el select oculto y en el customOptions
  hojasOrdenadas.forEach((hoja, index) => {
    const optionObj = document.createElement('option');
    optionObj.value = hoja;
    optionObj.textContent = hoja;
    selectOculto.appendChild(optionObj);

    const div = document.createElement('div');
    const claseColor = (index % 2 === 0) ? 'opcion-amarilla' : 'opcion-azul';
    div.className = `custom-option ${claseColor}`;
    div.style.cssText = "padding: 0.75rem; cursor: pointer; border-bottom: 1px solid #f1f5f9;";
    div.textContent = hoja;
    div.onclick = () => seleccionarApiarioCustom(hoja);

    customOptions.appendChild(div);
  });

  // 7. Restablecer la selección previa
  if (valorSeleccionado && hojasOrdenadas.includes(valorSeleccionado)) {
    selectOculto.value = valorSeleccionado;
    const selectText = document.getElementById('selectText');
    if (selectText) selectText.textContent = valorSeleccionado;
  }
}

// ==========================================
// NOTAS Y ENTRADA MANUAL / OFFLINE
// ==========================================
async function procesarONoGuardarNota() {
  if (enviandoRegistro) return;

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

  enviandoRegistro = true;
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
    enviandoRegistro = false;
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
  if (enviandoRegistro) return;

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

  enviandoRegistro = true;
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

      const res = await response.json();
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

  enviandoRegistro = false;
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
// AUTO-GUARDADO EN TIEMPO REAL (SOLO EDICIÓN)
// ==========================================
let timerAutoGuardado = null;

function activarGuardadoEnTiempoReal() {
  const campos = ['inputFecha', 'inputColmenas', 'inputNucleos', 'inputTarea', 'inputObs'];

  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        // Solamente guarda de fondo si el usuario está en MODO EDICIÓN
        if (!editMode) return;

        const fecha = document.getElementById('inputFecha').value;
        const tarea = document.getElementById('inputTarea').value.trim();

        if (!fecha || enviandoRegistro) return;

        mostrarEstadoGuardado("✍️ Escribiendo...");
        clearTimeout(timerAutoGuardado);

        timerAutoGuardado = setTimeout(async () => {
          if (tarea) {
            mostrarEstadoGuardado("⏳ Guardando cambios...");
            await guardarRegistroSilencioso();
          }
        }, 1200);
      });
    }
  });
}

async function guardarRegistroSilencioso() {
  if (enviandoRegistro) return;
  const hoja = getApiarioSeleccionado();
  if (!hoja) return;

  enviandoRegistro = true;

  const payload = {
    hoja: hoja,
    action: "edit",
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
    } else {
      mostrarEstadoGuardado("⚠️ Error al auto-guardar");
    }
  } catch (err) {
    console.error("Error en auto-guardado:", err);
    mostrarEstadoGuardado("📶 Sin conexión");
  } finally {
    enviandoRegistro = false;
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
  const selectText = document.getElementById('selectText');
  
  if (selectText) {
    selectText.className = 'select-text-loading';
    selectText.innerHTML = `<span class="spinner"></span> Cargando apiarios...`;
  }

  try {
    const response = await fetch(`${SCRIPT_URL}?action=getSheets`);
    const text = await response.text();
    
    if (text.trim().startsWith("<")) {
      throw new Error("Respuesta no válida del servidor.");
    }

    const data = JSON.parse(text);

    if (data.error) throw new Error(data.error);

    if (Array.isArray(data.sheets) && data.sheets.length > 0) {
      listaHojasOriginal = data.sheets;

      const ordenServidor = Array.isArray(data.customOrder) ? data.customOrder : [];
      const ordenLocal = JSON.parse(localStorage.getItem('orden_apiarios_custom') || '[]');
      const ordenGuardado = ordenServidor.length > 0 ? ordenServidor : ordenLocal;
      
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

      const primerApiario = ordenPersonalizado[0] || data.sheets[0];
      if (selectText) {
        selectText.className = '';
        selectText.textContent = primerApiario;
      }

      cargarDatos(primerApiario);

    } else {
      if (selectText) {
        selectText.className = '';
        selectText.textContent = 'Sin apiarios disponibles';
      }
    }
  } catch (error) {
    console.error("Error al obtener apiarios:", error);
    if (selectText) {
      selectText.className = '';
      selectText.textContent = '⚠️ Error al cargar apiarios';
    }
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

// ==========================================
// UTILIDADES
// ==========================================
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

function cerrarSelectorCustom() {
  const customOptions = document.getElementById('customSelectOptions');
  if (customOptions) {
    customOptions.style.display = 'none';
    customOptions.classList.remove('active');
  }
}
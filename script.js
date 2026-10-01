const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyR8AZriUCm7F32JvSWBkOAAQwD98Od1IWjnsEC3pUNeom5jCgL_NkOf-wbiLt6Z9yw/exec"; 

let registrosGlobales = [];
let editMode = false;
let registroEditandoFecha = null;
let listaHojasOriginal = [];
let ordenPersonalizado = [];
let enviandoRegistro = false; 
let apiarioSeleccionadoGlobal = "";
let categoriaFiltroActual = "todos";

// Cache local para almacenar las métricas de todos los apiarios
let cacheMetricasApiarios = {};

// ==========================================
// INICIALIZACIÓN Y CARGA EN 2 FASES
// ==========================================
window.onload = async function() {
  await cargarListaHojas();
};

async function cargarListaHojas() {
  const container = document.getElementById('beeApiariosContainer');
  
  if (container) {
    container.innerHTML = `
      <div class="bee-loading-state" style="text-align:center; padding:1.5rem; color:#64748b;">
        <span class="spinner"></span> Cargando nombres de apiarios...
      </div>`;
  }

  try {
    // FASE 1: Obtener la lista de nombres de apiarios
    const response = await fetch(`${SCRIPT_URL}?action=getSheets`);
    const text = await response.text();
    
    if (text.trim().startsWith("<")) throw new Error("Respuesta no válida del servidor.");

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

      // Definir apiario seleccionado
      const primerApiario = ordenPersonalizado[0] || data.sheets[0];
      apiarioSeleccionadoGlobal = primerApiario;

      // Renderizar INMEDIATAMENTE los apiarios con valores por defecto/cargando
      const sortSelect = document.getElementById('sortSelect');
      const criterioActual = sortSelect ? sortSelect.value : 'custom';
      aplicarOrdenYRenderizar(criterioActual);

      // Cargar tareas del apiario inicial
      cargarDatos(primerApiario);

      // FASE 2: Buscar métricas en segundo plano mostrando aviso
      await precargarTodasLasMetricasSegundoplano(ordenPersonalizado);

    } else {
      if (container) {
        container.innerHTML = '<div style="text-align:center; color:#64748b; padding:1rem;">Sin apiarios disponibles</div>';
      }
    }
  } catch (error) {
    console.error("Error al obtener apiarios:", error);
    if (container) {
      container.innerHTML = '<div style="text-align:center; color:#ef4444; padding:1rem;">⚠️ Error al cargar apiarios</div>';
    }
  }
}

// Búsqueda de métricas por lotes (evita sobrecargar el servidor)
async function precargarTodasLasMetricasSegundoplano() {
  mostrarAvisoCargaMetricas(true, "Calculando métricas...");
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getAllMetrics`);
    const data = await res.json();
    cacheMetricasApiarios = data;
    Object.keys(data).forEach(hoja => actualizarTarjetaApiarioUI(hoja));
  } catch (e) {
    console.error("Error cargando métricas unificadas", e);
  } finally {
    mostrarAvisoCargaMetricas(false);
  }
}

function mostrarAvisoCargaMetricas(mostrar, mensaje = "") {
  let banner = document.getElementById('beeMetricsBanner');
  const container = document.getElementById('beeApiariosContainer');

  if (!banner && container && container.parentNode) {
    banner = document.createElement('div');
    banner.id = 'beeMetricsBanner';
    banner.className = 'bee-loading-banner';
    container.parentNode.insertBefore(banner, container);
  }

  if (banner) {
    if (mostrar) {
      banner.style.display = 'flex';
      banner.innerHTML = `<span class="spinner-sm"></span> <span>${mensaje}</span>`;
    } else {
      banner.style.display = 'none';
    }
  }
}

function actualizarTarjetaApiarioUI(hoja) {
  const metricas = cacheMetricasApiarios[hoja];
  if (!metricas) return;

  const cards = document.querySelectorAll('.bee-card');
  cards.forEach(card => {
    if (card.dataset.nombreHoja === hoja) {
      const estadoInfo = calcularEstadoApiario(metricas.ultimaFecha);
      card.dataset.estado = estadoInfo.clase;

      // Actualizar valores numéricos en el DOM directamente
      const valColmenas = card.querySelector('.metric-colmenas');
      const valNucleos = card.querySelector('.metric-nucleos');
      const valFecha = card.querySelector('.metric-fecha');
      const badgeEstado = card.querySelector('.bee-status-badge.estado-visita');

      if (valColmenas) valColmenas.innerText = metricas.colmenas;
      if (valNucleos) valNucleos.innerText = metricas.nucleos;
      if (valFecha) valFecha.innerText = metricas.ultimaFecha;
      if (badgeEstado) {
        badgeEstado.className = `bee-status-badge estado-visita ${estadoInfo.clase}`;
        badgeEstado.innerText = estadoInfo.texto;
      }
    }
  });
}

// ==========================================
// RENDERIZADO DE TARJETAS
// ==========================================
function calcularEstadoApiario(fechaStr) {
  if (!fechaStr || fechaStr === 'Sin fecha' || fechaStr === 'Sin registros' || fechaStr === '...') {
    return { texto: '⚠️ Sin registros', clase: 'alert' };
  }

  let fechaVisita;
  if (fechaStr.includes('-')) {
    fechaVisita = new Date(fechaStr + 'T00:00:00');
  } else if (fechaStr.includes('/')) {
    const partes = fechaStr.split('/');
    fechaVisita = new Date(`${partes[2]}-${partes[1]}-${partes[0]}T00:00:00`);
  } else {
    fechaVisita = new Date(fechaStr);
  }

  if (isNaN(fechaVisita.getTime())) {
    return { texto: 'Normal', clase: 'normal' };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fechaVisita.setHours(0, 0, 0, 0);

  const diffTiempo = hoy.getTime() - fechaVisita.getTime();
  const diffDias = Math.floor(diffTiempo / (1000 * 3600 * 24));

  if (diffDias <= 3 && diffDias >= 0) {
    return { texto: '🟢 Recién visto', clase: 'recent' };
  } else if (diffDias > 21) {
    return { texto: '🔴 Hace tiempo', clase: 'alert' };
  } else if (diffDias > 7) {
    return { texto: '🟡 Revisar pronto', clase: 'warning' };
  } else {
    return { texto: '🔵 Al día', clase: 'normal' };
  }
}

function aplicarOrdenYRenderizar(criterio) {
  const selectOculto = document.getElementById('sheetSelect');
  const container = document.getElementById('beeApiariosContainer');
  if (!selectOculto || !container || !listaHojasOriginal || listaHojasOriginal.length === 0) return;

  let valorSeleccionado = apiarioSeleccionadoGlobal || selectOculto.value;
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
  container.innerHTML = '';

  if (!valorSeleccionado && hojasOrdenadas.length > 0) {
    valorSeleccionado = hojasOrdenadas[0];
    apiarioSeleccionadoGlobal = valorSeleccionado;
  }

  hojasOrdenadas.forEach((hoja) => {
    const optionObj = document.createElement('option');
    optionObj.value = hoja;
    optionObj.textContent = hoja;
    selectOculto.appendChild(optionObj);

    const metricas = cacheMetricasApiarios[hoja] || { colmenas: '...', nucleos: '...', ultimaFecha: '...' };
    const estadoInfo = calcularEstadoApiario(metricas.ultimaFecha);
    const esActivo = (hoja === valorSeleccionado);

    const card = document.createElement('div');
    card.className = `bee-card ${esActivo ? 'active apiario-seleccionado-foco' : ''}`;
    card.dataset.nombre = hoja.toLowerCase();
    card.dataset.nombreHoja = hoja;
    card.dataset.estado = estadoInfo.clase;

    card.innerHTML = `
      <div class="bee-card-header">
        <div class="bee-avatar-badge">
          <span class="bee-avatar">🐝</span>
          <span class="bee-title">${hoja}</span>
        </div>
        <div style="display: flex; gap: 0.3rem; align-items: center;">
          ${esActivo ? '<span class="bee-status-badge selected">✓ Seleccionado</span>' : ''}
          <span class="bee-status-badge estado-visita ${estadoInfo.clase}">${estadoInfo.texto}</span>
        </div>
      </div>

      <div class="bee-metrics-grid">
        <div class="bee-metric-item">
          <span class="bee-metric-val metric-colmenas">${metricas.colmenas}</span>
          <span class="bee-metric-lbl">Colmenas</span>
        </div>
        <div class="bee-metric-item">
          <span class="bee-metric-val metric-nucleos">${metricas.nucleos}</span>
          <span class="bee-metric-lbl">Núcleos</span>
        </div>
        <div class="bee-metric-item">
          <span class="bee-metric-val metric-fecha" style="font-size:0.8rem;">${metricas.ultimaFecha}</span>
          <span class="bee-metric-lbl">Última Visita</span>
        </div>
      </div>
    `;

    // ✅ CÓDIGO CORREGIDO:
    card.onclick = () => seleccionarApiario(hoja);
    container.appendChild(card);
  });

  if (valorSeleccionado && hojasOrdenadas.includes(valorSeleccionado)) {
    selectOculto.value = valorSeleccionado;
  }

  filtrarApiariosCards();
}

function filtrarApiariosCards() {
  const searchInput = document.getElementById('beeSearchInput');
  const texto = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const cards = document.querySelectorAll('.bee-card');

  cards.forEach(card => {
    const nombre = card.dataset.nombre || '';
    const estado = card.dataset.estado || '';

    const coincideNombre = nombre.includes(texto);
    let coincideCategoria = true;

    if (categoriaFiltroActual === 'alerta') {
      coincideCategoria = estado.includes('alert') || estado.includes('warning');
    } else if (categoriaFiltroActual === 'alta') {
      coincideCategoria = estado.includes('recent') || estado.includes('normal');
    }

    if (coincideNombre && coincideCategoria) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

function filtrarCategoriaApiarios(categoria, btnElement) {
  categoriaFiltroActual = categoria;
  const chips = document.querySelectorAll('.bee-chip');
  chips.forEach(c => c.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  filtrarApiariosCards();
}

function seleccionarApiario(nombreApiario) {
  if (!nombreApiario) return;

  // 1. Actualizar estado global y select oculto
  apiarioSeleccionadoGlobal = nombreApiario;
  
  const sheetSelect = document.getElementById('sheetSelect');
  if (sheetSelect) {
    sheetSelect.value = nombreApiario;
  }

  // 2. Actualizar bloque/panel superior informativo
  const infoSection = document.getElementById('infoSection');
  const apiarioNombre = document.getElementById('apiarioNombre');

  if (infoSection) {
    infoSection.style.display = 'block';
    infoSection.classList.add('apiario-vista-destacada');
  }

  if (apiarioNombre) {
    apiarioNombre.innerHTML = `📌 Apiario: <strong>${nombreApiario}</strong>`;
  }

  // 3. Actualizar la clase active / selected en todas las tarjetas
  const cards = document.querySelectorAll('.bee-card');
  cards.forEach(card => {
    const esIgual = (card.dataset.nombreHoja === nombreApiario);

    // Ajuste de clases CSS según convenga
    if (esIgual) {
      card.classList.add('active', 'selected', 'apiario-seleccionado-foco');
      
      // Agregar/asegurar el badge "✓ Seleccionado" dentro del header
      let badge = card.querySelector('.bee-status-badge.selected');
      if (!badge) {
        const headerFlex = card.querySelector('.bee-card-header > div:last-child');
        if (headerFlex) {
          const newBadge = document.createElement('span');
          newBadge.className = 'bee-status-badge selected';
          newBadge.innerText = '✓ Seleccionado';
          headerFlex.insertBefore(newBadge, headerFlex.firstChild);
        }
      }
    } else {
      card.classList.remove('active', 'selected', 'apiario-seleccionado-foco');
      const badge = card.querySelector('.bee-status-badge.selected');
      if (badge) badge.remove();
    }
  });

  // 4. Cargar las tareas y registros del apiario seleccionado
  cargarDatos(nombreApiario);
}

function getApiarioSeleccionado() {
  if (apiarioSeleccionadoGlobal) return apiarioSeleccionadoGlobal;
  const select = document.getElementById('sheetSelect');
  if (select && select.value) return select.value;
  if (listaHojasOriginal && listaHojasOriginal.length > 0) {
    return ordenPersonalizado.length > 0 ? ordenPersonalizado[0] : listaHojasOriginal[0];
  }
  return "";
}

// ==========================================
// CONSULTA Y RENDERIZADO DE TAREAS
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

  if (lista) lista.innerHTML = "<p style='text-align:center; padding:1.5rem; color:#64748b;'>Cargando tareas del apiario...</p>";

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
    
    const ultimoEstado = obtenerUltimoEstadoApiario(registrosGlobales);
    const inputColmenas = document.getElementById('inputColmenas');
    const inputNucleos = document.getElementById('inputNucleos');
    
    if (inputColmenas) inputColmenas.value = ultimoEstado.colmenas;
    if (inputNucleos) inputNucleos.value = ultimoEstado.nucleos;

    cacheMetricasApiarios[sheetName] = {
      colmenas: ultimoEstado.colmenas,
      nucleos: ultimoEstado.nucleos,
      ultimaFecha: ultimoEstado.fecha || 'Sin registros'
    };

    actualizarTarjetaApiarioUI(sheetName);
    renderLista(registrosGlobales);

  } catch (err) {
    console.error("Error al cargar tareas:", err);
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
        <button class="btn btn-secondary btn-edit-card" style="padding:0.35rem 0.75rem; font-size:0.8rem;">✏ Editar</button>
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
// ABM Y EVENTOS DOM
// ==========================================
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
  if (btnGuardar) btnGuardar.addEventListener('click', (e) => {
    e.preventDefault();
    procesarONoGuardarNota();
  });

  const btnSincro = document.getElementById('btnSincronizar');
  if (btnSincro) btnSincro.addEventListener('click', (e) => {
    e.preventDefault();
    sincronizarNotasPendientes();
  });

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      aplicarOrdenYRenderizar(e.target.value);
    });
  }

  actualizarContadorPendientes();
  activarGuardadoEnTiempoReal();

  window.addEventListener('online', () => {
    sincronizarNotasPendientes();
  });
});

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

function mostrarFormulario() {
  editMode = false;
  document.getElementById('formTitle').innerText = "Nuevo Registro";
  document.getElementById('inputFecha').disabled = false;
  limpiarFormulario();

  const modal = document.getElementById('modalFormRegistro');
  const form = document.getElementById('formRegistro');
  
  if (modal) modal.style.display = 'flex';
  if (form) form.style.display = 'block';
}

function ocultarFormulario() {
  const modal = document.getElementById('modalFormRegistro');
  const form = document.getElementById('formRegistro');

  if (modal) modal.style.display = 'none';
  if (form) form.style.display = 'none';
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
  
  const modal = document.getElementById('modalFormRegistro');
  const form = document.getElementById('formRegistro');

  if (modal) modal.style.display = 'flex';
  if (form) form.style.display = 'block';
}

function limpiarFormulario() {
  document.getElementById('inputFecha').value = new Date().toISOString().split('T')[0];
  const ultimoEstado = obtenerUltimoEstadoApiario(registrosGlobales);
  document.getElementById('inputColmenas').value = ultimoEstado.colmenas;
  document.getElementById('inputNucleos').value = ultimoEstado.nucleos;
  document.getElementById('inputTarea').value = "";
  document.getElementById('inputObs').value = "";
}

async function eliminarRegistro(fecha) {
  if (enviandoRegistro) return;
  if (!confirm(`¿Seguro que deseas eliminar el registro de la fecha ${fecha}?`)) return;

  const hoja = getApiarioSeleccionado();
  await enviarPeticion({ hoja: hoja, action: "delete", Fecha: fecha });
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
    alert("⚠ Fallo de conexión. Guardado en el dispositivo.");
  } finally {
    enviandoRegistro = false;
    setCargando(btnGuardarNota, false);
  }
}

function guardarEnLocalStorage(texto, hoja) {
  const pendientes = JSON.parse(localStorage.getItem('notas_apiario_pendientes') || '[]');
  pendientes.push({ texto: texto, hoja: hoja, fechaRegistro: new Date().toISOString() });
  localStorage.setItem('notas_apiario_pendientes', JSON.stringify(pendientes));
  actualizarContadorPendientes();
}

async function sincronizarNotasPendientes() {
  if (enviandoRegistro) return;

  const pendientes = JSON.parse(localStorage.getItem('notas_apiario_pendientes') || '[]');
  const btnSincro = document.getElementById('btnSincronizar');

  if (pendientes.length === 0) return alert("No hay notas pendientes por sincronizar.");
  if (!navigator.onLine) return alert("Aún no tienes conexión a internet para sincronizar.");

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
        body: JSON.stringify({ action: "addFromVoice", texto: nota.texto, hoja: nota.hoja || getApiarioSeleccionado() })
      });

      const res = await response.json();
      if (!res.error) exitosos++;
      else restantes.push(nota);
    } catch (err) {
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
  if (cantSpan) cantSpan.innerText = pendientes.length;
}

// ==========================================
// AUTO-GUARDADO Y REORDENAMIENTO
// ==========================================
let timerAutoGuardado = null;

function activarGuardadoEnTiempoReal() {
  const campos = ['inputFecha', 'inputColmenas', 'inputNucleos', 'inputTarea', 'inputObs'];

  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
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
    if (!result.error) mostrarEstadoGuardado("✅ Guardado automáticamente");
    else mostrarEstadoGuardado("⚠️ Error al auto-guardar");
  } catch (err) {
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

function reordenarHojas() {
  const modal = document.getElementById('modalReordenar');
  const lista = document.getElementById('listaOrdenable');

  if (!listaHojasOriginal || listaHojasOriginal.length === 0) return alert("No hay apiarios cargados.");

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
  localStorage.setItem('orden_apiarios_custom', JSON.stringify(ordenPersonalizado));

  // Renderizar la lista con el nuevo orden localmente
  const sortSelect = document.getElementById('sortSelect');
  const criterio = sortSelect ? sortSelect.value : 'custom';
  aplicarOrdenYRenderizar(criterio);

  cerrarModalOrden();

  // Guardar en el backend (Google Apps Script) de forma transparente
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveCustomOrder", order: ordenPersonalizado })
    });
  } catch (e) {
    console.error("Error al guardar orden en servidor:", e);
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
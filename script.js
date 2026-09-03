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
    return;
  }

  lista.innerHTML = "Cargando registros...";

  try {
    const url = `${SCRIPT_URL}?hoja=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    if (!response.ok) throw new Error("Error en la respuesta de la red");

    const data = await response.json();

    if (data.error) {
      alert(data.error);
      lista.innerHTML = "";
      return;
    }

    registrosGlobales = data;
    infoSection.style.display = 'block';
    
    if (data.length > 0 && data[0].Apiario) {
      document.getElementById('apiarioNombre').innerText = "Apiario: " + data[0].Apiario;
    } else {
      document.getElementById('apiarioNombre').innerText = "Apiario: " + sheetName;
    }

    renderLista(registrosGlobales);
  } catch (err) {
    console.error("Detalle del error al cargar:", err);
    alert("Error al cargar los datos del apiario. Reintenta la selección.");
    lista.innerHTML = "";
  }
}

function renderLista(registros) {
  const lista = document.getElementById('listaRegistros');
  lista.innerHTML = "";

  if (registros.length === 0) {
    lista.innerHTML = "<p style='text-align:center; color:#6b7280; padding:1rem;'>No hay registros guardados en esta hoja.</p>";
    return;
  }

  registros.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <span>📅 ${item.Fecha || ''}</span>
      </div>
      <div class="card-stats">
        <span>🐝 Colmenas: <strong>${item.Colmenas || 0}</strong></span>
        <span>📦 Núcleos: <strong>${item.Núcleos || 0}</strong></span>
      </div>
      <div><strong>Tarea:</strong> ${item.Tarea || 'Sin especificar'}</div>
      <div style="font-size: 0.85rem; color: #6b7280; margin-top: 0.25rem;">${item.Observaciones || ''}</div>
      <div class="card-actions">
        <button class="btn btn-edit" style="padding: 0.4rem 0.6rem; font-size: 0.8rem;">Editar</button>
        <button class="btn btn-danger" style="padding: 0.4rem 0.6rem; font-size: 0.8rem;" onclick="eliminarRegistro('${item.Fecha}')">Eliminar</button>
      </div>
    `;

    // Asignación segura del evento para evitar problemas con comillas en las observaciones
    card.querySelector('.btn-edit').onclick = () => prepararEdicion(item);

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
  document.getElementById('formTitle').innerText = "Editar Registro";
  document.getElementById('inputFecha').value = item.Fecha;
  document.getElementById('inputFecha').disabled = true; 
  document.getElementById('inputColmenas').value = item.Colmenas || 0;
  document.getElementById('inputNucleos').value = item.Núcleos || 0;
  document.getElementById('inputTarea').value = item.Tarea || "";
  document.getElementById('inputObs').value = item.Observaciones || "";
  document.getElementById('formRegistro').style.display = 'block';
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
    alert("Operación completada.");
    ocultarFormulario();
    cargarDatos();
  }
}

// --- REGISTRO DE SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
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

// --- FUNCIÓN PARA EXPORTAR A CSV / EXCEL ---
function exportarCSV() {
  // 1. Verificar que existan datos cargados
  if (!registrosGlobales || registrosGlobales.length === 0) {
    alert("No hay registros en pantalla para exportar. Selecciona un apiario primero.");
    return;
  }

  const select = document.getElementById('sheetSelect');
  const sheetName = select.options[select.selectedIndex]?.text || "Apiario";

  // 2. Encabezados del CSV con BOM (\uFEFF) para compatibilidad con Excel (acentos y ñ)
  let csvContent = "\uFEFF";
  csvContent += "Fecha,Colmenas,Núcleos,Tarea,Observaciones\n";

  // 3. Recorrer y formatear cada registro
  registrosGlobales.forEach(item => {
    const fecha = `"${item.Fecha || ''}"`;
    const colmenas = item.Colmenas || 0;
    const nucleos = item.Núcleos || 0;
    const tarea = `"${String(item.Tarea || '').replace(/"/g, '""')}"`;
    const obs = `"${String(item.Observaciones || '').replace(/"/g, '""')}"`;

    csvContent += `${fecha},${colmenas},${nucleos},${tarea},${obs}\n`;
  });

  // 4. Crear el Blob y forzar la descarga
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    const cleanFileName = sheetName.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    link.href = url;
    link.setAttribute('download', `${cleanFileName}_registros.csv`);
    
    document.body.appendChild(link);
    link.click();
    
    // Limpieza
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (err) {
    console.error("Error al exportar CSV:", err);
    alert("Ocurrió un error al generar el archivo Excel/CSV.");
  }
}
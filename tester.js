/**
 * Clase de Depuración y Pruebas Integrales para el Cuaderno de Campo Apícola
 */
class SistemaTester {
  constructor(scriptUrl) {
    this.scriptUrl = scriptUrl || (typeof SCRIPT_URL !== 'undefined' ? SCRIPT_URL : '');
    this.resultados = [];
  }

  // Registra el resultado de cada prueba en la consola
  logTest(nombre, exito, detalle = '') {
    const estado = exito ? '✅ PASS' : '❌ FAIL';
    const mensaje = `[TEST] ${estado} - ${nombre} ${detalle ? `(${detalle})` : ''}`;
    console.log(mensaje);
    this.resultados.push({ nombre, exito, detalle });
  }

  // ==========================================================
  // 1. PRUEBAS DE CONEXIÓN CON APPS SCRIPT (BACKEND)
  // ==========================================================

  async probarObtenerApiarios() {
    console.group('🔍 1. Probando GET Apiarios desde Apps Script...');
    try {
      const response = await fetch(`${this.scriptUrl}?action=getSheets`);
      const text = await response.text();
      const data = JSON.parse(text);

      const exito = Array.isArray(data.sheets) && data.sheets.length > 0;
      this.logTest('Obtener lista de apiarios (sheets)', exito, `Apiarios encontrados: ${data.sheets?.length || 0}`);
      console.groupEnd();
      return exito ? data.sheets[0] : null;
    } catch (err) {
      this.logTest('Obtener lista de apiarios (sheets)', false, err.message);
      console.groupEnd();
      return null;
    }
  }

  async probarCargarRegistros(nombreHoja) {
    if (!nombreHoja) {
      this.logTest('Cargar registros de apiario', false, 'No hay nombre de apiario para probar');
      return;
    }
    console.group(`🔍 2. Probando GET Registros para "${nombreHoja}"...`);
    try {
      const url = `${this.scriptUrl}?hoja=${encodeURIComponent(nombreHoja)}&_t=${Date.now()}`;
      const response = await fetch(url);
      const data = await response.json();

      const esValido = Array.isArray(data) || Array.isArray(data.registros) || Array.isArray(data.datos);
      this.logTest('Cargar registros de apiario', esValido, `Registros recibidos`);
    } catch (err) {
      this.logTest('Cargar registros de apiario', false, err.message);
    }
    console.groupEnd();
  }

  async probarFlujoABMTarea(nombreHoja) {
    if (!nombreHoja) return;
    console.group(`🔍 3. Probando Flujo Completo ABM Tarea en "${nombreHoja}"...`);
    
    const fechaPrueba = "2099-12-31"; // Fecha ficticia para no alterar historial real
    
    // 3a. Alta de Tarea
    try {
      const payloadAdd = {
        hoja: nombreHoja,
        action: "add",
        Fecha: fechaPrueba,
        Colmenas: "99",
        Núcleos: "5",
        Tarea: "TESTING_AUTOMATIZADO",
        Observaciones: "Prueba de depuración de sistema"
      };

      const resAdd = await fetch(this.scriptUrl, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payloadAdd)
      });
      const dataAdd = await resAdd.json();
      this.logTest('Agregar Tarea de Prueba', !dataAdd.error, dataAdd.message || dataAdd.error);

      // 3b. Edición de Tarea
      const payloadEdit = { ...payloadAdd, action: "edit", Tarea: "TESTING_EDITADO" };
      const resEdit = await fetch(this.scriptUrl, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payloadEdit)
      });
      const dataEdit = await resEdit.json();
      this.logTest('Editar Tarea de Prueba', !dataEdit.error, dataEdit.message || dataEdit.error);

      // 3c. Eliminación de Tarea de Prueba
      const payloadDelete = { hoja: nombreHoja, action: "delete", Fecha: fechaPrueba };
      const resDel = await fetch(this.scriptUrl, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payloadDelete)
      });
      const dataDel = await resDel.json();
      this.logTest('Eliminar Tarea de Prueba', !dataDel.error, dataDel.message || dataDel.error);

    } catch (err) {
      this.logTest('Flujo ABM Tarea', false, err.message);
    }
    console.groupEnd();
  }

  // ==========================================================
  // 2. PRUEBAS DE ALMACENAMIENTO Y SINCRONIZACIÓN OFFLINE
  // ==========================================================

  probarLocalStorageYNotas() {
    console.group('🔍 4. Probando Sistema de Almacenamiento Offline (LocalStorage)...');
    
    const clave = 'notas_apiario_pendientes';
    const copiaReserva = localStorage.getItem(clave);

    try {
      // Simular guardado de nota offline
      guardarEnLocalStorage("Nota de prueba automatizada", "H1");
      const pendientes = JSON.parse(localStorage.getItem(clave) || '[]');
      const guardoOk = pendientes.some(n => n.texto === "Nota de prueba automatizada");

      this.logTest('Guardado Offline en LocalStorage', guardoOk);

      // Limpiar datos de prueba y restaurar el estado previo
      const filtrados = pendientes.filter(n => n.texto !== "Nota de prueba automatizada");
      localStorage.setItem(clave, JSON.stringify(filtrados));
      actualizarContadorPendientes();

    } catch (err) {
      this.logTest('Guardado Offline en LocalStorage', false, err.message);
    }
    console.groupEnd();
  }

  // ==========================================================
  // 3. PRUEBAS DE ELEMENTOS DOM / INTERFAZ DE USUARIO
  // ==========================================================

  probarElementosDOM() {
    console.group('🔍 5. Verificando Elementos Clave de la Interfaz (DOM)...');

    const idsRequeridos = [
      'sheetSelect', 'customSelectTrigger', 'customSelectOptions',
      'formRegistro', 'inputFecha', 'inputColmenas', 'inputNucleos',
      'inputTarea', 'inputObs', 'listaRegistros', 'txtNotaOffline', 'btnGuardarNota'
    ];

    let faltantes = [];
    idsRequeridos.forEach(id => {
      if (!document.getElementById(id)) {
        faltantes.push(id);
      }
    });

    const exito = faltantes.length === 0;
    this.logTest('Existencia de elementos HTML en el DOM', exito, exito ? 'Todos presentes' : `Faltan: ${faltantes.join(', ')}`);
    console.groupEnd();
  }

  // ==========================================================
  // EJECUTOR GENERAL DE DEPURACIÓN
  // ==========================================================

  async ejecutarDiagnosticoCompleto() {
    console.clear();
    console.log("%c 🐝 INICIANDO DIAGNÓSTICO COMPLETO DEL SISTEMA APÍCOLA 🐝 ", "background: #f59e0b; color: #fff; font-size: 14px; font-weight: bold; padding: 4px 8px; border-radius: 4px;");

    this.resultados = [];

    // Verificación DOM
    this.probarElementosDOM();

    // Verificación LocalStorage
    this.probarLocalStorageYNotas();

    // Verificación Backend y ABM
    const primerApiario = await this.probarObtenerApiarios();
    if (primerApiario) {
      await this.probarCargarRegistros(primerApiario);
      await this.probarFlujoABMTarea(primerApiario);
    }

    // Resumen Final
    console.group('📊 RESUMEN DEL DIAGNÓSTICO');
    const aprobados = this.resultados.filter(r => r.exito).length;
    const fallidos = this.resultados.filter(r => !r.exito).length;
    
    console.log(`Pruebas Pasadas: ${aprobados} / ${this.resultados.length}`);
    if (fallidos > 0) {
      console.warn(`⚠️ Hubo ${fallidos} prueba(s) con fallos. Revisa el detalle en los grupos anteriores.`);
    } else {
      console.log("%c ¡Todo el sistema funciona correctamente! 🎉 ", "color: #16a34a; font-weight: bold;");
    }
    console.groupEnd();
  }
}
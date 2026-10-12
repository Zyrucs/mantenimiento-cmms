# SistMaint - Software Web de Control de Mantenimiento Industrial (CMMS 4.0)

Sistema web integral para el control de mantenimientos **Correctivo, Preventivo y Predictivo**, diseñado con interfaz móvil y de escritorio, lectura de códigos QR por máquina, formulario de operarios, asignación de técnicos, cronómetro de reparación en tiempo real, registro de tiempos de parada (downtime) y repuestos.

---

## 🚀 Cómo Iniciar el Sistema

1. **Opción Rápida (Windows):**
   - Haz doble clic en el archivo `iniciar_sistema.bat`.

2. **Opción por Terminal:**
   ```bash
   python app.py
   ```

3. **Acceso:**
   - **En la computadora:** Abre tu navegador en [http://localhost:5000](http://localhost:5000).
   - **En celulares / tablets de operarios:** Abre [http://192.168.68.56:5000](http://192.168.68.56:5000) (o la IP que muestre la consola, conectados a la misma red Wi-Fi).

---

## 📱 Flujo de Operación por Código QR

1. **Pegar QR en la Máquina:**
   - En la pestaña **"Máquinas & Códigos QR"**, haz clic en **"Generar & Imprimir QR"** para cualquier máquina o en **"Imprimir Todas las Etiquetas"**.
   - Imprime y pega la etiqueta con el código QR en el chasis o tablero de la máquina.
2. **Escaneo por el Operario:**
   - El operario escanea el QR con la cámara de su celular (o usando el botón **"Escanear QR"** dentro de la app web).
   - El sistema abre instantáneamente el formulario de reporte con la máquina ya preseleccionada.
3. **Casillas del Formulario (Operario):**
   - **Máquina:** Autocompletada según el QR escaneado.
   - **Nombre Completo:** Nombre del operario que reporta.
   - **Fecha y Hora:** Se llenan automáticamente con la fecha y hora actual (editables si es necesario).
   - **Tipo de Mantenimiento:** Correctivo (falla imprevista), Preventivo o Predictivo.
   - **Tipo de Falla:**
     - ⚡ Eléctrica
     - ⚙️ Mecánica
     - ⚡⚙️ Las 2 (Eléctrica y Mecánica)
     - ❓ No sabe / Por determinar
   - **¿Máquina parada o no? (Parada de Línea):**
     - 🔴 **SÍ:** La máquina se detuvo (inicia la medición del Downtime de producción).
     - 🟢 **NO:** La máquina sigue operando con falla leve.
   - **Descripción:** Detalle de los síntomas observados (ruido, fuga, sobrecalentamiento, atasco, etc.).
   - Al presionar **"REGISTRAR"**, se genera automáticamente la Orden de Trabajo (ej: `OT-2026-0004`).

---

## ⏱️ Control de Tiempos del Técnico & Repuestos

1. **Asignación de Técnico:**
   - El supervisor o el técnico asigna la orden a un ingeniero (por defecto: `Ingeniero 1`, `Ingeniero 2`, `Técnico 1`, etc.).
2. **Cronómetro en Tiempo Real:**
   - El técnico pulsa **"Iniciar Cronómetro"**. El sistema registra la hora exacta de inicio y muestra un reloj digital en vivo.
   - Si requiere pausar (por almuerzo o espera de material), puede pausar y reanudar cuando desee.
3. **Casilla de Repuestos:**
   - El técnico puede registrar cada repuesto utilizado (Nombre, Cantidad, Unidad, Código/Referencia y Costo unitario).
   - También cuenta con una casilla de notas rápidas para repuestos e insumos.
4. **Cierre Automático del Tiempo:**
   - Al pulsar **"FINALIZAR MANTENIMIENTO Y PARAR TIEMPO"**:
     - El cronómetro se detiene automáticamente.
     - Se calcula el **tiempo exacto de reparación** (cuánto se demoró el técnico).
     - Si la máquina estuvo parada, calcula el **tiempo total de parada (Downtime)** desde que se reportó la falla hasta que se terminó la reparación.
     - La máquina vuelve automáticamente a estado **OPERATIVA**.

---

## 🏭 Personalización de Nombres de Máquinas

- Están configuradas inicialmente: `Máquina 1`, `Máquina 2`, `Máquina 3`, `Máquina 4`, `Máquina 5`.
- Para personalizar o colocar los nombres definitivos:
  1. Ve a la pestaña **"Máquinas & Códigos QR"**.
  2. Haz clic en **"Editar Nombre"** en cualquier máquina.
  3. Cambia el nombre (ejemplo: "Torno CNC Haas", "Envasadora TetraPak", "Compresor Schulz", etc.) y ubicación.
  4. Guarda los cambios. ¡El código QR y todo el historial se actualizan de inmediato sin perder información!
  5. También puedes agregar más máquinas con el botón **"+ Nueva Máquina"**.

---

## 📊 Panel de Control & Exportación

- **KPIs en Vivo:** Total órdenes, activas, máquinas actualmente paradas, tiempo promedio de reparación (MTTR) y downtime acumulado.
- **Gráficos:**
  - Distribución de fallas (Eléctrica vs Mecánica vs Ambas vs No sabe).
  - Estrategia de mantenimiento (Correctivo vs Preventivo vs Predictivo).
- **Exportar a Excel / CSV:** Botón verde en el panel de control para descargar todas las órdenes con historial, técnicos, tiempos y repuestos.

---

## 📁 Estructura del Proyecto

```
NicoGei/
├── app.py                # Servidor Flask y APIs REST
├── database.py           # Esquema SQLite, migraciones y datos iniciales
├── maintenance.db        # Base de datos persistente SQLite
├── iniciar_sistema.bat   # Acceso directo para Windows
├── requirements.txt      # Dependencias
├── static/
│   ├── css/custom.css    # Estilos y hoja de impresión de etiquetas QR
│   └── js/app.js         # Lógica frontal, escáner cámara, cronómetro y gráficos
└── templates/
    └── index.html        # Aplicación web responsiva (PC y Móvil)
```

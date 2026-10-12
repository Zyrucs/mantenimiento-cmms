/**
 * SistMaint - CMMS 4.0 Industrial Maintenance Web System
 * Front-end Application Controller
 */

// Global State
const state = {
    currentView: 'dashboard',
    machines: [],
    technicians: [],
    orders: [],
    activeOrder: null,
    settings: {
        server_ip: window.location.hostname || '192.168.68.56',
        server_port: window.location.port || '5000',
        company_name: 'Planta Industrial'
    },
    timerInterval: null,
    html5QrCode: null,
    charts: {
        failures: null,
        maintenance: null
    }
};

// -------------------------------------------------------------
// INITIALIZATION & ROUTING
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    setCurrentDateTime();
    await loadSettings();
    await loadMachines();
    await loadTechnicians();
    
    // Handle URL query params (e.g. from scanning QR code with phone camera)
    handleInitialRoute();

    // Start live clock ticking every second for open timers
    setInterval(tickLiveClocks, 1000);
});

function handleInitialRoute() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const urlParams = new URLSearchParams(window.location.search);
    
    const machineId = urlParams.get('machine_id') || urlParams.get('machine');
    const machineCode = urlParams.get('machine_code');

    if (machineId || machineCode || hash.startsWith('report')) {
        navigateTo('report');
        if (machineId) {
            preselectMachine(machineId);
        } else if (machineCode) {
            preselectMachineByCode(machineCode);
        }
    } else if (hash === 'orders') {
        navigateTo('orders');
    } else if (hash === 'machines') {
        navigateTo('machines');
    } else if (hash === 'technicians') {
        navigateTo('technicians');
    } else {
        navigateTo('dashboard');
    }
}

function navigateTo(viewName) {
    state.currentView = viewName;
    window.location.hash = viewName;

    // Hide all view sections
    const views = ['dashboard', 'orders', 'report', 'machines', 'technicians'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');

        const navBtn = document.getElementById(`nav-${v}`);
        if (navBtn) {
            if (v === viewName) {
                navBtn.className = "nav-btn px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 text-white bg-slate-800 shadow";
            } else {
                navBtn.className = "nav-btn px-3.5 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-2";
            }
        }
    });

    // Show target view
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    // Trigger view-specific loads
    if (viewName === 'dashboard') {
        loadDashboardData();
    } else if (viewName === 'orders') {
        loadOrdersList();
    } else if (viewName === 'machines') {
        renderMachinesGrid();
    } else if (viewName === 'technicians') {
        renderTechniciansGrid();
    } else if (viewName === 'report') {
        populateFormDropdowns();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    menu.classList.toggle('hidden');
}

// -------------------------------------------------------------
// DATA LOADING FUNCTIONS
// -------------------------------------------------------------

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            const data = await res.json();
            state.settings = data;
            const detectedEl = document.getElementById('detected-ip-label');
            if (detectedEl) detectedEl.textContent = data.detected_lan_ip;
        }
    } catch (err) {
        console.error("Error loading settings:", err);
    }
}

async function loadMachines() {
    try {
        const res = await fetch('/api/machines');
        if (res.ok) {
            state.machines = await res.json();
            populateFormDropdowns();
            populateFilterMachines();
        }
    } catch (err) {
        console.error("Error loading machines:", err);
    }
}

async function loadTechnicians() {
    try {
        const res = await fetch('/api/technicians');
        if (res.ok) {
            state.technicians = await res.json();
            populateFormDropdowns();
        }
    } catch (err) {
        console.error("Error loading technicians:", err);
    }
}

function populateFormDropdowns() {
    // Populate form machine select
    const mSelect = document.getElementById('form-machine-id');
    if (mSelect) {
        const currentVal = mSelect.value;
        mSelect.innerHTML = '<option value="">-- Selecciona una máquina o escanea el QR --</option>';
        state.machines.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.code} - ${m.name} (${m.location})`;
            mSelect.appendChild(opt);
        });
        if (currentVal) mSelect.value = currentVal;
    }

    // Populate form technician select
    const tSelect = document.getElementById('form-technician-id');
    if (tSelect) {
        const currentVal = tSelect.value;
        tSelect.innerHTML = '<option value="">-- Sin asignar (Técnico disponible tomará la orden) --</option>';
        state.technicians.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.name} (${t.role})`;
            tSelect.appendChild(opt);
        });
        if (currentVal) tSelect.value = currentVal;
    }
}

function populateFilterMachines() {
    const fSelect = document.getElementById('filter-machine');
    if (fSelect) {
        fSelect.innerHTML = '<option value="">Todas las Máquinas</option>';
        state.machines.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.code} - ${m.name}`;
            fSelect.appendChild(opt);
        });
    }
}

function preselectMachine(machineId) {
    const mSelect = document.getElementById('form-machine-id');
    if (mSelect) {
        mSelect.value = machineId;
        const machine = state.machines.find(m => m.id == machineId);
        if (machine) {
            showMachineInfoBadge(machine);
        }
    }
}

function preselectMachineByCode(machineCode) {
    const machine = state.machines.find(m => m.code.toUpperCase() === machineCode.toUpperCase());
    if (machine) {
        preselectMachine(machine.id);
    }
}

function showMachineInfoBadge(machine) {
    const info = document.getElementById('form-machine-info');
    const infoText = document.getElementById('form-machine-info-text');
    if (info && infoText) {
        infoText.textContent = `Código escaneado: ${machine.code} - ${machine.name} (${machine.location})`;
        info.classList.remove('hidden');
    }
}

function setCurrentDateTime() {
    const now = new Date();
    const dateInput = document.getElementById('form-date');
    const timeInput = document.getElementById('form-time');

    if (dateInput) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        dateInput.value = `${year}-${month}-${day}`;
    }

    if (timeInput) {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeInput.value = `${hours}:${minutes}`;
    }
}

// -------------------------------------------------------------
// VIEW 1: DASHBOARD & CHARTS
// -------------------------------------------------------------

async function loadDashboardData() {
    try {
        const res = await fetch('/api/dashboard/stats');
        if (!res.ok) return;
        const data = await res.json();

        // Update KPIs
        const activeCount = data.pending_orders + data.in_progress_orders;
        document.getElementById('kpi-active-orders').textContent = activeCount;
        document.getElementById('badge-active-orders').textContent = activeCount;
        document.getElementById('kpi-pending').textContent = data.pending_orders;
        document.getElementById('kpi-in-progress').textContent = data.in_progress_orders;
        document.getElementById('kpi-stopped-machines').textContent = data.machines_stopped;
        document.getElementById('kpi-avg-repair').textContent = data.avg_repair_minutes;
        document.getElementById('kpi-total-downtime').textContent = data.total_downtime_minutes;

        // Stopped Machines Alert Banner
        const banner = document.getElementById('stopped-machines-banner');
        if (banner) {
            if (data.machines_stopped > 0) {
                banner.classList.remove('hidden');
                document.getElementById('stopped-banner-text').textContent = 
                    `¡ALERTA DE PRODUCCIÓN! Hay ${data.machines_stopped} máquina(s) con parada activa.`;
            } else {
                banner.classList.add('hidden');
            }
        }

        // Render Charts
        renderFailuresChart(data.failures_by_type);
        renderMaintenanceTypeChart(data.maintenance_by_type);

        // Render Recent Orders Table
        renderRecentOrdersTable(data.recent_orders);

    } catch (err) {
        console.error("Error loading dashboard data:", err);
    }
}

function renderFailuresChart(failuresData) {
    const ctx = document.getElementById('failuresChart');
    if (!ctx) return;

    if (state.charts.failures) {
        state.charts.failures.destroy();
    }

    const labels = ['Eléctrica', 'Mecánica', 'Las 2 (Ambas)', 'No sabe'];
    const counts = [
        failuresData['ELECTRICA'] || 0,
        failuresData['MECANICA'] || 0,
        failuresData['AMBAS'] || 0,
        failuresData['NO_SABE'] || 0
    ];

    state.charts.failures = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: [
                    '#f59e0b', // Amber (Electrica)
                    '#3b82f6', // Blue (Mecanica)
                    '#a855f7', // Purple (Ambas)
                    '#64748b'  // Slate (No sabe)
                ],
                borderWidth: 2,
                borderColor: '#0f172a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 11, family: 'Inter' }, padding: 12 }
                }
            },
            cutout: '70%'
        }
    });
}

function renderMaintenanceTypeChart(maintData) {
    const ctx = document.getElementById('maintTypeChart');
    if (!ctx) return;

    if (state.charts.maintenance) {
        state.charts.maintenance.destroy();
    }

    const labels = ['Correctivo', 'Preventivo', 'Predictivo'];
    const counts = [
        maintData['CORRECTIVO'] || 0,
        maintData['PREVENTIVO'] || 0,
        maintData['PREDICTIVO'] || 0
    ];

    state.charts.maintenance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Órdenes',
                data: counts,
                backgroundColor: ['#ef4444', '#10b981', '#8b5cf6'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { size: 11 } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8', stepSize: 1 },
                    grid: { color: '#1e293b' }
                }
            }
        }
    });
}

function renderRecentOrdersTable(orders) {
    const tbody = document.getElementById('recent-orders-tbody');
    if (!tbody) return;

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-8 text-center text-slate-500">No hay órdenes registradas todavía.</td></tr>`;
        return;
    }

    tbody.innerHTML = orders.map(o => {
        const statusBadge = getStatusBadge(o.status);
        const failureBadge = getFailureBadge(o.failure_type);
        const stoppedBadge = o.machine_stopped 
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">🔴 Parada</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">🟢 No</span>`;

        const durationFormatted = formatSeconds(o.repair_duration_seconds || 0);

        return `
            <tr class="hover:bg-slate-800/40 transition-colors">
                <td class="px-4 py-3 font-mono font-bold text-blue-400">${o.order_number}</td>
                <td class="px-4 py-3">
                    <div class="font-bold text-white text-xs">${o.machine_name}</div>
                    <div class="text-[10px] text-slate-400">${o.machine_code}</div>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-1.5">${failureBadge}</div>
                    <div class="text-[10px] text-slate-400 uppercase mt-0.5">${o.maintenance_type}</div>
                </td>
                <td class="px-4 py-3 text-xs text-slate-300">${o.operator_name}</td>
                <td class="px-4 py-3 text-xs text-slate-400">
                    <div>${o.report_date}</div>
                    <div class="text-[10px] text-slate-500">${o.report_time}</div>
                </td>
                <td class="px-4 py-3">${stoppedBadge}</td>
                <td class="px-4 py-3 text-xs">
                    ${o.technician_name ? `<span class="text-cyan-300 font-medium">${o.technician_name}</span>` : `<span class="text-slate-500 italic">Sin Asignar</span>`}
                </td>
                <td class="px-4 py-3">
                    <div>${statusBadge}</div>
                    <div class="text-[10px] font-mono text-slate-400 mt-1">${durationFormatted}</div>
                </td>
                <td class="px-4 py-3 text-right">
                    <button onclick="openOrderDetailModal(${o.id})" class="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 text-xs font-semibold">
                        Ver / Control
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// -------------------------------------------------------------
// VIEW 2: REPORT FORM SUBMISSION (OPERATOR / QR FLOW)
// -------------------------------------------------------------

async function submitIncidentReport(event) {
    event.preventDefault();
    const btn = document.getElementById('btn-submit-report');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registrando orden...`;

    try {
        const machineId = document.getElementById('form-machine-id').value;
        const operatorName = document.getElementById('form-operator-name').value;
        const reportDate = document.getElementById('form-date').value;
        const reportTime = document.getElementById('form-time').value;
        const maintType = document.querySelector('input[name="form-maint-type"]:checked').value;
        const failureType = document.querySelector('input[name="form-failure-type"]:checked').value;
        const machineStopped = document.querySelector('input[name="form-machine-stopped"]:checked').value;
        const technicianId = document.getElementById('form-technician-id').value || null;
        const description = document.getElementById('form-description').value;

        const payload = {
            machine_id: parseInt(machineId),
            operator_name: operatorName,
            report_date: reportDate,
            report_time: reportTime,
            maintenance_type: maintType,
            failure_type: failureType,
            machine_stopped: parseInt(machineStopped),
            technician_id: technicianId ? parseInt(technicianId) : null,
            description: description,
            priority: machineStopped == 1 ? 'ALTA' : 'MEDIA'
        };

        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            showToast(`¡Reporte registrado exitosamente! Orden: ${data.order_number}`, 'success');
            // Reset form
            document.getElementById('incident-form').reset();
            setCurrentDateTime();
            document.getElementById('form-machine-info').classList.add('hidden');

            // Refresh machines status & navigate to orders view or open modal
            await loadMachines();
            navigateTo('orders');
            openOrderDetailModal(data.order_id);
        } else {
            showToast(data.error || 'Ocurrió un error al registrar el reporte', 'error');
        }
    } catch (err) {
        console.error("Error submitting report:", err);
        showToast('Error de conexión al servidor', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-paper-plane text-xl"></i> <span>REGISTRAR Y GENERAR ORDEN DE TRABAJO</span>`;
    }
}

// -------------------------------------------------------------
// VIEW 3: ORDERS MANAGEMENT
// -------------------------------------------------------------

let searchDebounceTimeout = null;
function debounceOrdersSearch() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        loadOrdersList();
    }, 300);
}

function resetOrdersFilters() {
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-failure').value = '';
    document.getElementById('filter-machine').value = '';
    document.getElementById('filter-search').value = '';
    loadOrdersList();
}

function filterOrdersByStopped() {
    navigateTo('orders');
    document.getElementById('filter-status').value = 'EN_PROCESO';
    loadOrdersList();
}

async function loadOrdersList() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    const status = document.getElementById('filter-status').value;
    const failure = document.getElementById('filter-failure').value;
    const machine = document.getElementById('filter-machine').value;
    const search = document.getElementById('filter-search').value;

    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (failure) params.append('failure', failure);
    if (machine) params.append('machine_id', machine);
    if (search) params.append('search', search);

    try {
        const res = await fetch(`/api/orders?${params.toString()}`);
        if (!res.ok) return;
        state.orders = await res.json();

        if (state.orders.length === 0) {
            container.innerHTML = `
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                    <i class="fa-solid fa-clipboard-question text-3xl mb-3 text-slate-600"></i>
                    <p class="font-bold text-slate-400 text-base">No se encontraron órdenes</p>
                    <p class="text-xs text-slate-500 mt-1">Prueba cambiando los filtros o reporta una nueva falla.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = state.orders.map(o => renderOrderCard(o)).join('');

    } catch (err) {
        console.error("Error loading orders:", err);
    }
}

function renderOrderCard(o) {
    const statusBadge = getStatusBadge(o.status);
    const failureBadge = getFailureBadge(o.failure_type);
    
    const isStopped = o.machine_stopped == 1;
    const stoppedIndicator = isStopped
        ? `<div class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
             <i class="fa-solid fa-hand-paper"></i> 
             <span>Máquina Parada (Downtime: <span class="downtime-counter" data-order-id="${o.id}">${o.current_live_downtime_minutes || o.total_downtime_minutes || 0} min</span>)</span>
           </div>`
        : `<div class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/60 text-slate-400 text-xs font-medium">
             <i class="fa-solid fa-check"></i> <span>Máquina Operando</span>
           </div>`;

    const isRunning = o.is_timer_running == 1;
    const timerClass = isRunning ? 'text-emerald-400 pulse-timer font-bold' : 'text-slate-400 font-medium';
    const timerText = formatSeconds(o.current_live_duration_seconds || o.repair_duration_seconds || 0);

    return `
        <div class="bg-slate-900 border ${isRunning ? 'border-blue-500/50 shadow-blue-500/10' : 'border-slate-800'} rounded-2xl p-5 shadow-lg space-y-4 transition-all hover:border-slate-700">
            <!-- Card Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div class="flex items-center gap-3">
                    <span class="font-mono text-base font-black text-blue-400">${o.order_number}</span>
                    <div>${statusBadge}</div>
                    <span class="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-300 uppercase">${o.maintenance_type}</span>
                </div>
                <div class="text-xs text-slate-400">
                    <i class="fa-solid fa-calendar text-slate-500 mr-1"></i> ${o.report_date} a las ${o.report_time}
                </div>
            </div>

            <!-- Card Body -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <!-- Machine Info -->
                <div>
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Máquina</p>
                    <p class="text-base font-extrabold text-white mt-0.5">${o.machine_name}</p>
                    <p class="text-xs text-slate-400"><i class="fa-solid fa-location-dot text-slate-500"></i> ${o.machine_location} (${o.machine_code})</p>
                </div>

                <!-- Operator & Failure -->
                <div>
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reportó Operario</p>
                    <p class="text-sm font-bold text-slate-200 mt-0.5">${o.operator_name}</p>
                    <div class="flex items-center gap-2 mt-1">
                        ${failureBadge}
                    </div>
                </div>

                <!-- Technician & Live Time -->
                <div>
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Técnico / Tiempo de Reparación</p>
                    <p class="text-sm font-bold ${o.technician_name ? 'text-cyan-300' : 'text-slate-500 italic'} mt-0.5">
                        ${o.technician_name || 'Sin Asignar'}
                    </p>
                    <div class="flex items-center gap-2 mt-1 font-mono text-xs ${timerClass}">
                        <i class="fa-solid fa-stopwatch"></i>
                        <span class="live-clock" data-order-id="${o.id}" data-running="${isRunning ? '1' : '0'}" data-seconds="${o.current_live_duration_seconds || o.repair_duration_seconds || 0}">
                            ${timerText}
                        </span>
                        ${isRunning ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-sans">EN VIVO</span>' : ''}
                    </div>
                </div>
            </div>

            <!-- Problem Description Snippet -->
            <div class="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs text-slate-300">
                <span class="font-bold text-slate-400">Descripción:</span> ${o.description}
                ${o.spare_parts_notes ? `<div class="mt-1 text-purple-300 font-semibold"><i class="fa-solid fa-boxes-stacked mr-1"></i> Repuestos: ${o.spare_parts_notes}</div>` : ''}
            </div>

            <!-- Card Footer & Actions -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div>${stoppedIndicator}</div>
                <div class="flex items-center gap-2">
                    <button onclick="openOrderDetailModal(${o.id})" class="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow">
                        <i class="fa-solid fa-screwdriver-wrench"></i>
                        <span>Gestionar Orden / Tiempos</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// -------------------------------------------------------------
// MODAL: ORDER DETAIL, TIMER & SPARE PARTS
// -------------------------------------------------------------

async function openOrderDetailModal(orderId) {
    try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) return;
        state.activeOrder = await res.json();
        const o = state.activeOrder;

        document.getElementById('modal-order-number').textContent = o.order_number;
        document.getElementById('modal-order-status-badge').outerHTML = getStatusBadge(o.status, 'modal-order-status-badge');
        document.getElementById('modal-machine-name').textContent = o.machine_name;
        document.getElementById('modal-machine-location').textContent = `${o.machine_location} (${o.machine_code})`;
        document.getElementById('modal-operator-name').textContent = o.operator_name;
        document.getElementById('modal-report-timestamp').textContent = `${o.report_date} ${o.report_time}`;

        document.getElementById('modal-failure-type').outerHTML = getFailureBadge(o.failure_type, 'modal-failure-type');

        const stoppedBadge = document.getElementById('modal-stopped-badge');
        if (stoppedBadge) {
            stoppedBadge.textContent = o.machine_stopped ? '🔴 MÁQUINA PARADA' : '🟢 EN OPERACIÓN';
            stoppedBadge.className = o.machine_stopped 
                ? 'px-2 py-0.5 rounded text-xs font-bold bg-rose-500/20 text-rose-300' 
                : 'px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300';
        }

        const downtimeEl = document.getElementById('modal-live-downtime');
        if (downtimeEl) {
            if (o.machine_stopped) {
                downtimeEl.textContent = `Downtime acumulado: ${o.current_live_downtime_minutes || o.total_downtime_minutes || 0} min`;
                downtimeEl.classList.remove('hidden');
            } else {
                downtimeEl.classList.add('hidden');
            }
        }

        document.getElementById('modal-description').textContent = o.description;
        document.getElementById('modal-diagnosis').value = o.diagnosis || '';
        document.getElementById('modal-solution').value = o.solution_notes || '';
        document.getElementById('modal-spare-parts-notes').value = o.spare_parts_notes || '';

        // Populate modal technician select
        const techSelect = document.getElementById('modal-technician-select');
        techSelect.innerHTML = '<option value="">-- Sin Asignar --</option>';
        state.technicians.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.name} (${t.role})`;
            techSelect.appendChild(opt);
        });
        techSelect.value = o.technician_id || '';

        // Timer Controls
        updateModalTimerDisplay();

        // Render spare parts list
        renderModalSpareParts(o.parts || []);

        // Show modal
        document.getElementById('order-detail-modal').classList.remove('hidden');

    } catch (err) {
        console.error("Error opening order modal:", err);
    }
}

function closeOrderDetailModal() {
    document.getElementById('order-detail-modal').classList.add('hidden');
    state.activeOrder = null;
    loadOrdersList();
    loadDashboardData();
}

function updateModalTimerDisplay() {
    const o = state.activeOrder;
    if (!o) return;

    const timerDisplay = document.getElementById('modal-timer-display');
    const timerLabel = document.getElementById('modal-timer-state-label');
    const btnStart = document.getElementById('btn-timer-start');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnFinish = document.getElementById('btn-finish-order');

    const totalSeconds = o.current_live_duration_seconds || o.repair_duration_seconds || 0;
    timerDisplay.textContent = formatSeconds(totalSeconds);

    if (o.status === 'FINALIZADO') {
        timerLabel.textContent = `Mantenimiento Finalizado (${formatSeconds(o.repair_duration_seconds)})`;
        timerLabel.className = "text-[11px] text-emerald-400 uppercase font-semibold";
        btnStart.classList.add('hidden');
        btnPause.classList.add('hidden');
        btnFinish.classList.add('hidden');
    } else if (o.is_timer_running) {
        timerLabel.textContent = "Cronómetro Corriendo (En Intervención)";
        timerLabel.className = "text-[11px] text-emerald-400 uppercase font-bold animate-pulse";
        btnStart.classList.add('hidden');
        btnPause.classList.remove('hidden');
        btnFinish.classList.remove('hidden');
    } else {
        timerLabel.textContent = "Cronómetro Pausado / En Espera";
        timerLabel.className = "text-[11px] text-slate-400 uppercase font-semibold";
        btnStart.classList.remove('hidden');
        btnStart.innerHTML = `<i class="fa-solid fa-play"></i> ${totalSeconds > 0 ? 'Reanudar Cronómetro' : 'Iniciar Cronómetro'}`;
        btnPause.classList.add('hidden');
        btnFinish.classList.remove('hidden');
    }
}

async function startModalTimer() {
    if (!state.activeOrder) return;
    const techId = document.getElementById('modal-technician-select').value;
    if (!techId) {
        showToast('Por favor selecciona el Técnico o Ingeniero antes de iniciar el cronómetro', 'warning');
        return;
    }

    try {
        const res = await fetch(`/api/orders/${state.activeOrder.id}/timer/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ technician_id: parseInt(techId) })
        });
        if (res.ok) {
            showToast('Cronómetro de reparación iniciado', 'success');
            await openOrderDetailModal(state.activeOrder.id);
        }
    } catch (err) {
        console.error(err);
    }
}

async function pauseModalTimer() {
    if (!state.activeOrder) return;
    try {
        const res = await fetch(`/api/orders/${state.activeOrder.id}/timer/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            showToast('Cronómetro pausado', 'info');
            await openOrderDetailModal(state.activeOrder.id);
        }
    } catch (err) {
        console.error(err);
    }
}

async function saveOrderProgress() {
    if (!state.activeOrder) return;
    const diagnosis = document.getElementById('modal-diagnosis').value;
    const solution = document.getElementById('modal-solution').value;
    const spareNotes = document.getElementById('modal-spare-parts-notes').value;
    const techId = document.getElementById('modal-technician-select').value;

    try {
        const res = await fetch(`/api/orders/${state.activeOrder.id}/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                diagnosis,
                solution_notes: solution,
                spare_parts_notes: spareNotes,
                technician_id: techId ? parseInt(techId) : null
            })
        });
        showToast('Progreso guardado', 'success');
    } catch (err) {
        console.error(err);
    }
}

async function finishModalOrder() {
    if (!state.activeOrder) return;
    const diagnosis = document.getElementById('modal-diagnosis').value;
    const solution = document.getElementById('modal-solution').value;
    const spareNotes = document.getElementById('modal-spare-parts-notes').value;
    const techId = document.getElementById('modal-technician-select').value;

    if (!confirm('¿Deseas finalizar este mantenimiento? El cronómetro se detendrá automáticamente y se calculará el tiempo de reparación y parada.')) {
        return;
    }

    try {
        const res = await fetch(`/api/orders/${state.activeOrder.id}/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                diagnosis,
                solution_notes: solution,
                spare_parts_notes: spareNotes,
                technician_id: techId ? parseInt(techId) : null
            })
        });

        const data = await res.json();
        if (res.ok) {
            showToast(`¡Mantenimiento Finalizado! Tiempo de reparación: ${data.repair_duration_minutes} min. Máquina 100% operativa.`, 'success');
            closeOrderDetailModal();
            loadDashboardData();
            loadMachines();
        } else {
            showToast(data.error || 'Error al finalizar', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error de conexión', 'error');
    }
}

// -------------------------------------------------------------
// SPARE PARTS (REPUESTOS) MANAGEMENT
// -------------------------------------------------------------

function toggleAddPartForm() {
    const form = document.getElementById('add-part-form');
    form.classList.toggle('hidden');
}

async function saveSparePart() {
    if (!state.activeOrder) return;
    const name = document.getElementById('part-name').value.trim();
    if (!name) {
        showToast('Ingresa el nombre del repuesto', 'warning');
        return;
    }

    const qty = parseFloat(document.getElementById('part-qty').value) || 1;
    const unit = document.getElementById('part-unit').value.trim() || 'unidad';
    const code = document.getElementById('part-code').value.trim();
    const cost = parseFloat(document.getElementById('part-cost').value) || 0;

    try {
        const res = await fetch(`/api/orders/${state.activeOrder.id}/parts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                part_name: name,
                quantity: qty,
                unit: unit,
                part_code: code,
                unit_cost: cost
            })
        });

        if (res.ok) {
            showToast('Repuesto agregado', 'success');
            document.getElementById('part-name').value = '';
            document.getElementById('part-code').value = '';
            document.getElementById('part-cost').value = '';
            toggleAddPartForm();
            // Reload order parts
            const partsRes = await fetch(`/api/orders/${state.activeOrder.id}/parts`);
            const parts = await partsRes.json();
            renderModalSpareParts(parts);
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteSparePart(partId) {
    if (!confirm('¿Eliminar este repuesto?')) return;
    try {
        const res = await fetch(`/api/parts/${partId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Repuesto eliminado', 'info');
            const partsRes = await fetch(`/api/orders/${state.activeOrder.id}/parts`);
            const parts = await partsRes.json();
            renderModalSpareParts(parts);
        }
    } catch (err) {
        console.error(err);
    }
}

function renderModalSpareParts(parts) {
    const container = document.getElementById('modal-parts-container');
    if (!container) return;

    if (!parts || parts.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 italic">No se han registrado repuestos utilizados aún.</p>`;
        return;
    }

    container.innerHTML = parts.map(p => `
        <div class="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-gear text-purple-400"></i>
                <div>
                    <span class="font-bold text-white">${p.part_name}</span>
                    <span class="text-slate-400 ml-1">x${p.quantity} ${p.unit}</span>
                    ${p.part_code ? `<span class="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded ml-1 font-mono">${p.part_code}</span>` : ''}
                </div>
            </div>
            <button onclick="deleteSparePart(${p.id})" class="text-slate-500 hover:text-rose-400 p-1">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `).join('');
}

// -------------------------------------------------------------
// VIEW 4: MACHINES & QR CODE GENERATION
// -------------------------------------------------------------

function renderMachinesGrid() {
    const grid = document.getElementById('machines-grid');
    if (!grid) return;

    if (state.machines.length === 0) {
        grid.innerHTML = `<p class="col-span-3 text-center text-slate-500 py-8">No hay máquinas registradas.</p>`;
        return;
    }

    grid.innerHTML = state.machines.map(m => {
        const isOperative = m.status === 'OPERATIVA';
        const isStopped = m.status === 'PARADA';
        
        let statusBadge = '';
        if (isStopped) {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">🔴 PARADA</span>`;
        } else if (m.status === 'EN_MANTENIMIENTO') {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">🟡 EN MANTENIMIENTO</span>`;
        } else {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🟢 OPERATIVA</span>`;
        }

        return `
            <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-lg flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <span class="font-mono text-xs font-black text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">${m.code}</span>
                        ${statusBadge}
                    </div>

                    <h3 class="text-xl font-black text-white tracking-tight">${m.name}</h3>
                    <p class="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <i class="fa-solid fa-location-dot text-slate-500"></i> ${m.location}
                    </p>
                    ${m.description ? `<p class="text-xs text-slate-500 mt-2 italic">${m.description}</p>` : ''}
                </div>

                <div class="pt-4 border-t border-slate-800 flex flex-col gap-2">
                    <button onclick="openQRModal(${m.id})" class="w-full py-2.5 px-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all">
                        <i class="fa-solid fa-qrcode text-base"></i>
                        <span>Generar & Imprimir QR</span>
                    </button>

                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="openMachineModal(${m.id})" class="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                            <i class="fa-solid fa-pen-to-square"></i> Editar Nombre
                        </button>
                        <button onclick="reportForMachine(${m.id})" class="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow">
                            <i class="fa-solid fa-plus"></i> Reportar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function reportForMachine(machineId) {
    navigateTo('report');
    preselectMachine(machineId);
}

// -------------------------------------------------------------
// QR CODE GENERATOR & PRINTING
// -------------------------------------------------------------

let currentQRDataUrl = '';

function getQrTargetUrl(machineId) {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.hostname.startsWith('192.168.')) {
        return `${window.location.origin}/#report?machine_id=${machineId}`;
    }
    const host = state.settings.server_ip || window.location.hostname;
    const port = state.settings.server_port || '5000';
    return `http://${host}:${port}/#report?machine_id=${machineId}`;
}

function openQRModal(machineId) {
    const machine = state.machines.find(m => m.id == machineId);
    if (!machine) return;

    document.getElementById('qr-modal-machine-name').textContent = machine.name;
    document.getElementById('qr-modal-machine-code').textContent = `CÓDIGO: ${machine.code}`;

    // Target URL when scanned: points to the report page preselecting this machine
    const targetUrl = getQrTargetUrl(machine.id);

    document.getElementById('qr-modal-url').textContent = targetUrl;

    // Clear and generate QR Code using QRCode.js
    const container = document.getElementById('qr-code-container');
    container.innerHTML = '';

    new QRCode(container, {
        text: targetUrl,
        width: 180,
        height: 180,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    // Save for download
    setTimeout(() => {
        const canvas = container.querySelector('canvas');
        if (canvas) {
            currentQRDataUrl = canvas.toDataURL('image/png');
        } else {
            const img = container.querySelector('img');
            if (img) currentQRDataUrl = img.src;
        }
    }, 200);

    document.getElementById('qr-modal').classList.remove('hidden');
}

function closeQRModal() {
    document.getElementById('qr-modal').classList.add('hidden');
}

function downloadQRImage() {
    if (!currentQRDataUrl) return;
    const name = document.getElementById('qr-modal-machine-name').textContent.replace(/\s+/g, '_');
    const a = document.createElement('a');
    a.href = currentQRDataUrl;
    a.download = `QR_${name}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function printSingleQRCard() {
    window.print();
}

function copyQRUrl() {
    const url = document.getElementById('qr-modal-url').textContent;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Enlace directo copiado al portapapapeles', 'info');
    });
}

// Print all stickers sheet modal
function openPrintAllModal() {
    const container = document.getElementById('all-qr-cards-grid');
    container.innerHTML = '';

    state.machines.forEach((m, idx) => {
        const cardId = `print-qr-${m.id}`;
        const targetUrl = getQrTargetUrl(m.id);

        const card = document.createElement('div');
        card.className = "print-qr-sticker bg-white p-5 rounded-2xl border-4 border-slate-900 text-center text-slate-950 shadow-md";
        card.innerHTML = `
            <div class="border-b-2 border-slate-900 pb-1 mb-2 flex items-center justify-center gap-1">
                <i class="fa-solid fa-gears text-blue-600 text-xs"></i>
                <span class="font-black text-xs text-slate-900">SISTEMA MANTENIMIENTO</span>
            </div>
            <h4 class="font-black text-base uppercase text-slate-950">${m.name}</h4>
            <p class="text-[10px] font-bold text-blue-700 uppercase mb-2">CÓDIGO: ${m.code}</p>
            <div id="${cardId}" class="flex justify-center my-2"></div>
            <div class="border-t-2 border-slate-900 pt-1 mt-2">
                <p class="text-[9px] font-black uppercase text-slate-900">ESCANEÉ CON CELULAR PARA REPORTAR FALLA</p>
                <p class="text-[7px] text-slate-600 font-mono mt-0.5">${targetUrl}</p>
            </div>
        `;
        container.appendChild(card);

        // Generate QR code for this sticker
        setTimeout(() => {
            const qrEl = document.getElementById(cardId);
            if (qrEl) {
                new QRCode(qrEl, {
                    text: targetUrl,
                    width: 130,
                    height: 130,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        }, 50 * idx);
    });

    document.getElementById('print-all-modal').classList.remove('hidden');
}

function closePrintAllModal() {
    document.getElementById('print-all-modal').classList.add('hidden');
}

// -------------------------------------------------------------
// MACHINE CRUD MODAL
// -------------------------------------------------------------

function openMachineModal(machineId = null) {
    const title = document.getElementById('machine-modal-title');
    const idInput = document.getElementById('modal-machine-id');
    const codeInput = document.getElementById('machine-code-input');
    const nameInput = document.getElementById('machine-name-input');
    const locInput = document.getElementById('machine-location-input');
    const descInput = document.getElementById('machine-desc-input');

    if (machineId) {
        const m = state.machines.find(item => item.id == machineId);
        title.textContent = 'Editar Máquina';
        idInput.value = m.id;
        codeInput.value = m.code;
        nameInput.value = m.name;
        locInput.value = m.location || '';
        descInput.value = m.description || '';
    } else {
        title.textContent = 'Nueva Máquina';
        idInput.value = '';
        codeInput.value = `MAQ-${String(state.machines.length + 1).padStart(3, '0')}`;
        nameInput.value = `Máquina ${state.machines.length + 1}`;
        locInput.value = 'Planta Principal';
        descInput.value = '';
    }

    document.getElementById('machine-modal').classList.remove('hidden');
}

function closeMachineModal() {
    document.getElementById('machine-modal').classList.add('hidden');
}

async function saveMachine(event) {
    event.preventDefault();
    const id = document.getElementById('modal-machine-id').value;
    const code = document.getElementById('machine-code-input').value.trim();
    const name = document.getElementById('machine-name-input').value.trim();
    const loc = document.getElementById('machine-location-input').value.trim();
    const desc = document.getElementById('machine-desc-input').value.trim();

    const payload = { code, name, location: loc, description: desc };

    try {
        const url = id ? `/api/machines/${id}` : '/api/machines';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            showToast('Máquina guardada exitosamente', 'success');
            closeMachineModal();
            await loadMachines();
            renderMachinesGrid();
        } else {
            showToast(data.error || 'Error al guardar máquina', 'error');
        }
    } catch (err) {
        console.error(err);
    }
}

// -------------------------------------------------------------
// VIEW 5: TECHNICIANS CRUD
// -------------------------------------------------------------

function renderTechniciansGrid() {
    const grid = document.getElementById('technicians-grid');
    if (!grid) return;

    if (state.technicians.length === 0) {
        grid.innerHTML = `<p class="col-span-4 text-center text-slate-500 py-8">No hay técnicos registrados.</p>`;
        return;
    }

    grid.innerHTML = state.technicians.map(t => `
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-lg flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all">
            <div>
                <div class="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xl mb-3">
                    <i class="fa-solid fa-user-gear"></i>
                </div>
                <h3 class="text-lg font-black text-white">${t.name}</h3>
                <p class="text-xs text-cyan-400 font-semibold mt-0.5">${t.role}</p>
                ${t.phone ? `<p class="text-xs text-slate-400 mt-2"><i class="fa-solid fa-phone text-slate-500"></i> ${t.phone}</p>` : ''}
            </div>

            <div class="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Órdenes activas: <strong class="text-white">${t.active_orders || 0}</strong></span>
                <button onclick="openTechnicianModal(${t.id})" class="text-blue-400 hover:text-blue-300 font-semibold">
                    Editar
                </button>
            </div>
        </div>
    `).join('');
}

function openTechnicianModal(techId = null) {
    const title = document.getElementById('technician-modal-title');
    const idInput = document.getElementById('modal-technician-id');
    const nameInput = document.getElementById('tech-name-input');
    const roleInput = document.getElementById('tech-role-input');
    const phoneInput = document.getElementById('tech-phone-input');

    if (techId) {
        const t = state.technicians.find(item => item.id == techId);
        title.textContent = 'Editar Técnico';
        idInput.value = t.id;
        nameInput.value = t.name;
        roleInput.value = t.role || '';
        phoneInput.value = t.phone || '';
    } else {
        title.textContent = 'Nuevo Técnico / Ingeniero';
        idInput.value = '';
        nameInput.value = `Ingeniero ${state.technicians.length + 1}`;
        roleInput.value = 'Ingeniero de Mantenimiento';
        phoneInput.value = '';
    }

    document.getElementById('technician-modal').classList.remove('hidden');
}

function closeTechnicianModal() {
    document.getElementById('technician-modal').classList.add('hidden');
}

async function saveTechnician(event) {
    event.preventDefault();
    const id = document.getElementById('modal-technician-id').value;
    const name = document.getElementById('tech-name-input').value.trim();
    const role = document.getElementById('tech-role-input').value.trim();
    const phone = document.getElementById('tech-phone-input').value.trim();

    const payload = { name, role, phone };

    try {
        const url = id ? `/api/technicians/${id}` : '/api/technicians';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('Técnico guardado exitosamente', 'success');
            closeTechnicianModal();
            await loadTechnicians();
            renderTechniciansGrid();
        }
    } catch (err) {
        console.error(err);
    }
}

// -------------------------------------------------------------
// CAMERA QR SCANNER (HTML5-QRCODE)
// -------------------------------------------------------------

function openCameraScannerModal() {
    document.getElementById('scanner-modal').classList.remove('hidden');

    if (!state.html5QrCode) {
        state.html5QrCode = new Html5Qrcode("qr-reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    state.html5QrCode.start(
        { facingMode: "environment" },
        config,
        onQrCodeSuccess,
        onQrCodeError
    ).catch(err => {
        console.error("Error accessing camera:", err);
        showToast('No se pudo acceder a la cámara. Asegúrate de permitir permisos.', 'error');
    });
}

function onQrCodeSuccess(decodedText) {
    showToast(`¡Código QR detectado!`, 'success');
    closeCameraScannerModal();

    // Check if URL has machine_id or machine_code
    try {
        const url = new URL(decodedText);
        const machineId = url.searchParams.get('machine_id');
        const machineCode = url.searchParams.get('machine_code');

        navigateTo('report');
        if (machineId) {
            preselectMachine(machineId);
        } else if (machineCode) {
            preselectMachineByCode(machineCode);
        }
    } catch (e) {
        // Plain text code (e.g. "MAQ-001")
        navigateTo('report');
        preselectMachineByCode(decodedText);
    }
}

function onQrCodeError(errorMessage) {
    // Ignore frame parsing errors
}

function closeCameraScannerModal() {
    if (state.html5QrCode) {
        state.html5QrCode.stop().then(() => {
            document.getElementById('scanner-modal').classList.add('hidden');
        }).catch(() => {
            document.getElementById('scanner-modal').classList.add('hidden');
        });
    } else {
        document.getElementById('scanner-modal').classList.add('hidden');
    }
}

// -------------------------------------------------------------
// SETTINGS MODAL
// -------------------------------------------------------------

function openSettingsModal() {
    document.getElementById('settings-server-ip').value = state.settings.server_ip;
    document.getElementById('settings-server-port').value = state.settings.server_port || '5000';
    document.getElementById('settings-company-name').value = state.settings.company_name;
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

async function saveSettings(event) {
    event.preventDefault();
    const server_ip = document.getElementById('settings-server-ip').value.trim();
    const server_port = document.getElementById('settings-server-port').value.trim();
    const company_name = document.getElementById('settings-company-name').value.trim();

    try {
        const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ server_ip, server_port, company_name })
        });
        if (res.ok) {
            showToast('Configuración guardada', 'success');
            await loadSettings();
            closeSettingsModal();
        }
    } catch (err) {
        console.error(err);
    }
}

// -------------------------------------------------------------
// LIVE TICK FOR CLOCKS & DOWNTIME
// -------------------------------------------------------------

function tickLiveClocks() {
    // 1. Tick modal clock if open and running
    if (state.activeOrder && state.activeOrder.is_timer_running) {
        state.activeOrder.current_live_duration_seconds = (state.activeOrder.current_live_duration_seconds || 0) + 1;
        const timerDisplay = document.getElementById('modal-timer-display');
        if (timerDisplay) {
            timerDisplay.textContent = formatSeconds(state.activeOrder.current_live_duration_seconds);
        }
    }

    // 2. Tick live clocks on cards in orders list
    const clocks = document.querySelectorAll('.live-clock[data-running="1"]');
    clocks.forEach(el => {
        let sec = parseInt(el.getAttribute('data-seconds') || '0') + 1;
        el.setAttribute('data-seconds', sec);
        el.textContent = formatSeconds(sec);
    });
}

// -------------------------------------------------------------
// UTILITIES & BADGES
// -------------------------------------------------------------

function formatSeconds(totalSec) {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = Math.floor(totalSec % 60);

    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function getStatusBadge(status, idAttr = '') {
    const idStr = idAttr ? `id="${idAttr}"` : '';
    switch (status) {
        case 'PENDIENTE':
            return `<span ${idStr} class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">PENDIENTE</span>`;
        case 'EN_PROCESO':
            return `<span ${idStr} class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">EN PROCESO</span>`;
        case 'PAUSADO':
            return `<span ${idStr} class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700 text-slate-300 border border-slate-600">PAUSADO</span>`;
        case 'FINALIZADO':
            return `<span ${idStr} class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">FINALIZADO</span>`;
        default:
            return `<span ${idStr} class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400">${status}</span>`;
    }
}

function getFailureBadge(failureType, idAttr = '') {
    const idStr = idAttr ? `id="${idAttr}"` : '';
    switch (failureType) {
        case 'ELECTRICA':
            return `<span ${idStr} class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"><i class="fa-solid fa-bolt text-[10px]"></i> Eléctrica</span>`;
        case 'MECANICA':
            return `<span ${idStr} class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30"><i class="fa-solid fa-gear text-[10px]"></i> Mecánica</span>`;
        case 'AMBAS':
            return `<span ${idStr} class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30"><i class="fa-solid fa-bolt text-[10px]"></i><i class="fa-solid fa-gear text-[10px]"></i> Ambas</span>`;
        default:
            return `<span ${idStr} class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700"><i class="fa-solid fa-question text-[10px]"></i> No sabe</span>`;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `p-4 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 transition-all transform translate-y-2 pointer-events-auto border max-w-sm`;

    if (type === 'success') {
        toast.className += ' bg-emerald-950 text-emerald-200 border-emerald-700';
        toast.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400 text-base"></i> <span>${message}</span>`;
    } else if (type === 'error') {
        toast.className += ' bg-rose-950 text-rose-200 border-rose-700';
        toast.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-400 text-base"></i> <span>${message}</span>`;
    } else if (type === 'warning') {
        toast.className += ' bg-amber-950 text-amber-200 border-amber-700';
        toast.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-400 text-base"></i> <span>${message}</span>`;
    } else {
        toast.className += ' bg-slate-900 text-slate-200 border-slate-700';
        toast.innerHTML = `<i class="fa-solid fa-circle-info text-blue-400 text-base"></i> <span>${message}</span>`;
    }

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

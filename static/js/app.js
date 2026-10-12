/**
 * SistMaint - CMMS 4.0 Industrial Maintenance Web System
 * Resilient Front-end Controller with LocalStorage fallback & safe CDN handling
 */

// Default Seed State (Guarantees app works even if offline or serverless cold-start)
const DEFAULT_MACHINES = [
    { id: 1, code: 'MAQ-001', name: 'Máquina 1', location: 'Línea de Producción 1', status: 'OPERATIVA', description: 'Torno y mecanizado general' },
    { id: 2, code: 'MAQ-002', name: 'Máquina 2', location: 'Línea de Producción 1', status: 'OPERATIVA', description: 'Fresadora universal' },
    { id: 3, code: 'MAQ-003', name: 'Máquina 3', location: 'Línea de Envasado', status: 'OPERATIVA', description: 'Selladora y empacadora automática' },
    { id: 4, code: 'MAQ-004', name: 'Máquina 4', location: 'Área de Calderas', status: 'OPERATIVA', description: 'Compresor de tornillo 50HP' },
    { id: 5, code: 'MAQ-005', name: 'Máquina 5', location: 'Línea de Mezclado', status: 'OPERATIVA', description: 'Bomba centrífuga e impulsión' }
];

const DEFAULT_TECHS = [
    { id: 1, name: 'Ingeniero 1', role: 'Ingeniero de Mantenimiento Eléctrico', phone: '300 123 4567' },
    { id: 2, name: 'Ingeniero 2', role: 'Ingeniero de Mantenimiento Mecánico', phone: '310 987 6543' },
    { id: 3, name: 'Técnico 1', role: 'Técnico Especialista Mecánico', phone: '315 555 1234' },
    { id: 4, name: 'Técnico 2', role: 'Técnico Especialista Eléctrico', phone: '320 888 4321' }
];

// App Global State
const state = {
    currentView: 'dashboard',
    machines: JSON.parse(localStorage.getItem('sm_machines') || 'null') || DEFAULT_MACHINES,
    technicians: JSON.parse(localStorage.getItem('sm_technicians') || 'null') || DEFAULT_TECHS,
    orders: JSON.parse(localStorage.getItem('sm_orders') || 'null') || [],
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

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial UI setup (instant, non-blocking)
    setCurrentDateTime();
    populateFormDropdowns();
    populateFilterMachines();
    renderQuickMachineChips();
    renderScannerMachineList();
    
    // 2. Load API data in parallel
    loadAllData();

    // 3. Handle initial route (URL query params from QR scan or bookmark)
    handleInitialRoute();

    // 4. Live clock tick
    setInterval(tickLiveClocks, 1000);
});

async function loadAllData() {
    try {
        await Promise.allSettled([
            loadSettings(),
            loadMachines(),
            loadTechnicians(),
            loadOrdersList(false),
            loadDashboardData()
        ]);
    } catch (err) {
        console.warn("API load completed with fallbacks:", err);
    }
}

function handleInitialRoute() {
    const hash = (window.location.hash || '').replace('#', '') || 'dashboard';
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

    const views = ['dashboard', 'orders', 'report', 'machines', 'technicians'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) {
            if (v === viewName) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }

        const navBtn = document.getElementById(`nav-${v}`);
        if (navBtn) {
            if (v === viewName) {
                navBtn.className = "nav-btn px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 text-white bg-slate-800 shadow";
            } else {
                navBtn.className = "nav-btn px-3.5 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-2";
            }
        }
    });

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
        renderQuickMachineChips();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.toggle('hidden');
}

// -------------------------------------------------------------
// DATA LOADING (WITH LOCAL STORAGE BACKUP)
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
        console.warn("Using local settings:", err);
    }
}

async function loadMachines() {
    try {
        const res = await fetch('/api/machines');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                state.machines = data;
                localStorage.setItem('sm_machines', JSON.stringify(data));
            }
        }
    } catch (err) {
        console.warn("Using cached machines:", err);
    }
    populateFormDropdowns();
    populateFilterMachines();
    renderQuickMachineChips();
    renderScannerMachineList();
}

async function loadTechnicians() {
    try {
        const res = await fetch('/api/technicians');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                state.technicians = data;
                localStorage.setItem('sm_technicians', JSON.stringify(data));
            }
        }
    } catch (err) {
        console.warn("Using cached technicians:", err);
    }
    populateFormDropdowns();
}

function populateFormDropdowns() {
    const mSelect = document.getElementById('form-machine-id');
    if (mSelect) {
        const curr = mSelect.value;
        mSelect.innerHTML = '<option value="">-- Selecciona una máquina o toca un botón arriba --</option>';
        state.machines.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.code} - ${m.name} (${m.location})`;
            mSelect.appendChild(opt);
        });
        if (curr) mSelect.value = curr;
    }

    const tSelect = document.getElementById('form-technician-id');
    if (tSelect) {
        const curr = tSelect.value;
        tSelect.innerHTML = '<option value="">-- Sin asignar (Se asignará al iniciar o por el jefe) --</option>';
        state.technicians.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.name} (${t.role})`;
            tSelect.appendChild(opt);
        });
        if (curr) tSelect.value = curr;
    }
}

function populateFilterMachines() {
    const fSelect = document.getElementById('filter-machine');
    if (fSelect) {
        const curr = fSelect.value;
        fSelect.innerHTML = '<option value="">Todas las Máquinas</option>';
        state.machines.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.code} - ${m.name}`;
            fSelect.appendChild(opt);
        });
        if (curr) fSelect.value = curr;
    }
}

// Render Quick Machine Chips in Report Form (One-tap selection)
function renderQuickMachineChips() {
    let container = document.getElementById('quick-machine-chips');
    if (!container) {
        // If container does not exist yet in index.html, inject it right above form-machine-id
        const mSelect = document.getElementById('form-machine-id');
        if (mSelect && mSelect.parentNode) {
            container = document.createElement('div');
            container.id = 'quick-machine-chips';
            container.className = 'flex flex-wrap gap-2 mb-3';
            mSelect.parentNode.parentNode.insertBefore(container, mSelect.parentNode);
        }
    }
    if (!container) return;

    const currentSelectedId = document.getElementById('form-machine-id')?.value;
    container.innerHTML = state.machines.map(m => {
        const isSelected = m.id == currentSelectedId;
        return `
            <button type="button" onclick="selectMachineChip(${m.id})" 
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    isSelected 
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-500/20' 
                        : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white'
                }">
                <i class="fa-solid fa-industry mr-1 text-[10px]"></i>
                ${m.name}
            </button>
        `;
    }).join('');
}

function selectMachineChip(machineId) {
    preselectMachine(machineId);
    renderQuickMachineChips();
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
    renderQuickMachineChips();
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
        infoText.textContent = `Máquina seleccionada: ${machine.code} - ${machine.name} (${machine.location})`;
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
// VIEW 1: DASHBOARD & METRICS
// -------------------------------------------------------------

async function loadDashboardData() {
    try {
        const res = await fetch('/api/dashboard/stats');
        let data = null;
        if (res.ok) {
            data = await res.json();
        } else {
            data = calculateLocalStats();
        }

        updateDashboardUI(data);

    } catch (err) {
        console.warn("Loading dashboard from local fallback:", err);
        const data = calculateLocalStats();
        updateDashboardUI(data);
    }
}

function calculateLocalStats() {
    const orders = state.orders || [];
    const pending = orders.filter(o => o.status === 'PENDIENTE').length;
    const in_prog = orders.filter(o => o.status === 'EN_PROCESO').length;
    const finished = orders.filter(o => o.status === 'FINALIZADO').length;

    const stopped_machines = new Set(orders.filter(o => o.machine_stopped && o.status !== 'FINALIZADO').map(o => o.machine_id)).size;
    const total_downtime = orders.reduce((acc, o) => acc + (o.total_downtime_minutes || o.current_live_downtime_minutes || 0), 0);
    
    const finishedOrders = orders.filter(o => o.status === 'FINALIZADO' && o.repair_duration_seconds > 0);
    const avg_sec = finishedOrders.length > 0 
        ? finishedOrders.reduce((acc, o) => acc + o.repair_duration_seconds, 0) / finishedOrders.length 
        : 0;

    const failures_by_type = { ELECTRICA: 0, MECANICA: 0, AMBAS: 0, NO_SABE: 0 };
    orders.forEach(o => {
        const f = o.failure_type || 'NO_SABE';
        failures_by_type[f] = (failures_by_type[f] || 0) + 1;
    });

    const maintenance_by_type = { CORRECTIVO: 0, PREVENTIVO: 0, PREDICTIVO: 0 };
    orders.forEach(o => {
        const m = o.maintenance_type || 'CORRECTIVO';
        maintenance_by_type[m] = (maintenance_by_type[m] || 0) + 1;
    });

    return {
        total_orders: orders.length,
        pending_orders: pending,
        in_progress_orders: in_prog,
        finished_orders: finished,
        machines_stopped: stopped_machines,
        total_downtime_minutes: total_downtime,
        avg_repair_minutes: Math.round(avg_sec / 60 * 10) / 10,
        failures_by_type,
        maintenance_by_type,
        recent_orders: orders.slice(0, 6)
    };
}

function updateDashboardUI(data) {
    if (!data) return;

    const activeCount = (data.pending_orders || 0) + (data.in_progress_orders || 0);
    const elActive = document.getElementById('kpi-active-orders');
    if (elActive) elActive.textContent = activeCount;
    
    const badgeActive = document.getElementById('badge-active-orders');
    if (badgeActive) badgeActive.textContent = activeCount;

    const elPending = document.getElementById('kpi-pending');
    if (elPending) elPending.textContent = data.pending_orders || 0;

    const elProg = document.getElementById('kpi-in-progress');
    if (elProg) elProg.textContent = data.in_progress_orders || 0;

    const elStopped = document.getElementById('kpi-stopped-machines');
    if (elStopped) elStopped.textContent = data.machines_stopped || 0;

    const elAvg = document.getElementById('kpi-avg-repair');
    if (elAvg) elAvg.textContent = data.avg_repair_minutes || 0;

    const elDowntime = document.getElementById('kpi-total-downtime');
    if (elDowntime) elDowntime.textContent = data.total_downtime_minutes || 0;

    const banner = document.getElementById('stopped-machines-banner');
    if (banner) {
        if ((data.machines_stopped || 0) > 0) {
            banner.classList.remove('hidden');
            const textEl = document.getElementById('stopped-banner-text');
            if (textEl) textEl.textContent = `¡ALERTA DE PRODUCCIÓN! Hay ${data.machines_stopped} máquina(s) con parada activa.`;
        } else {
            banner.classList.add('hidden');
        }
    }

    // Render Charts safely
    try {
        renderFailuresChart(data.failures_by_type || {});
        renderMaintenanceTypeChart(data.maintenance_by_type || {});
    } catch (e) {
        console.warn("Chart render skipped:", e);
    }

    // Render Table
    renderRecentOrdersTable(data.recent_orders || []);
}

function renderFailuresChart(failuresData) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('failuresChart');
    if (!ctx) return;

    if (state.charts.failures) {
        try { state.charts.failures.destroy(); } catch (e) {}
    }

    const labels = ['Eléctrica', 'Mecánica', 'Las 2 (Ambas)', 'No sabe'];
    const counts = [
        failuresData['ELECTRICA'] || 0,
        failuresData['MECANICA'] || 0,
        failuresData['AMBAS'] || 0,
        failuresData['NO_SABE'] || 0
    ];

    try {
        state.charts.failures = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: counts,
                    backgroundColor: ['#f59e0b', '#3b82f6', '#a855f7', '#64748b'],
                    borderWidth: 2,
                    borderColor: '#0f172a'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } }
                },
                cutout: '70%'
            }
        });
    } catch (err) {
        console.warn("Chart error:", err);
    }
}

function renderMaintenanceTypeChart(maintData) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('maintTypeChart');
    if (!ctx) return;

    if (state.charts.maintenance) {
        try { state.charts.maintenance.destroy(); } catch (e) {}
    }

    const labels = ['Correctivo', 'Preventivo', 'Predictivo'];
    const counts = [
        maintData['CORRECTIVO'] || 0,
        maintData['PREVENTIVO'] || 0,
        maintData['PREDICTIVO'] || 0
    ];

    try {
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
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: '#1e293b' } }
                }
            }
        });
    } catch (err) {
        console.warn("Chart error:", err);
    }
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
                    <div class="text-[10px] text-slate-400">${o.machine_code || ''}</div>
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
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registrando orden...`;
    }

    try {
        const machineIdVal = document.getElementById('form-machine-id').value;
        if (!machineIdVal) {
            showToast('Por favor selecciona la máquina afectada', 'warning');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-paper-plane text-xl"></i> <span>REGISTRAR Y GENERAR ORDEN DE TRABAJO</span>`;
            }
            return;
        }

        const operatorName = document.getElementById('form-operator-name').value.trim();
        const reportDate = document.getElementById('form-date').value;
        const reportTime = document.getElementById('form-time').value;
        const maintType = document.querySelector('input[name="form-maint-type"]:checked')?.value || 'CORRECTIVO';
        const failureType = document.querySelector('input[name="form-failure-type"]:checked')?.value || 'NO_SABE';
        const machineStopped = document.querySelector('input[name="form-machine-stopped"]:checked')?.value || '0';
        const technicianIdVal = document.getElementById('form-technician-id')?.value;
        const description = document.getElementById('form-description').value.trim();

        const selectedMachine = state.machines.find(m => m.id == machineIdVal) || { name: 'Máquina', code: 'MAQ' };

        const payload = {
            machine_id: parseInt(machineIdVal),
            operator_name: operatorName,
            report_date: reportDate,
            report_time: reportTime,
            maintenance_type: maintType,
            failure_type: failureType,
            machine_stopped: parseInt(machineStopped),
            technician_id: technicianIdVal ? parseInt(technicianIdVal) : null,
            description: description,
            priority: machineStopped == '1' ? 'ALTA' : 'MEDIA'
        };

        let newOrder = null;
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                payload.id = data.order_id;
                payload.order_number = data.order_number;
                payload.status = 'PENDIENTE';
                payload.machine_name = selectedMachine.name;
                payload.machine_code = selectedMachine.code;
                payload.machine_location = selectedMachine.location || '';
                newOrder = payload;
            }
        } catch (netErr) {
            console.warn("Offline/Vercel fallback for order creation:", netErr);
        }

        // Local fallback if offline
        if (!newOrder) {
            const tempId = Date.now();
            newOrder = {
                id: tempId,
                order_number: `OT-2026-${String(state.orders.length + 1).padStart(4, '0')}`,
                ...payload,
                status: 'PENDIENTE',
                machine_name: selectedMachine.name,
                machine_code: selectedMachine.code,
                machine_location: selectedMachine.location || '',
                repair_duration_seconds: 0,
                total_downtime_minutes: 0,
                parts: []
            };
        }

        // Add to local state & storage
        state.orders.unshift(newOrder);
        localStorage.setItem('sm_orders', JSON.stringify(state.orders));

        // Update machine status if stopped
        if (newOrder.machine_stopped) {
            const m = state.machines.find(item => item.id == newOrder.machine_id);
            if (m) m.status = 'PARADA';
        }

        showToast(`¡Reporte registrado exitosamente! Orden: ${newOrder.order_number}`, 'success');

        // Reset form
        document.getElementById('incident-form').reset();
        setCurrentDateTime();
        const infoBadge = document.getElementById('form-machine-info');
        if (infoBadge) infoBadge.classList.add('hidden');
        renderQuickMachineChips();

        // Switch to orders view and open modal
        navigateTo('orders');
        openOrderDetailModal(newOrder.id);

    } catch (err) {
        console.error("Error submitting report:", err);
        showToast('Error al procesar el reporte', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-paper-plane text-xl"></i> <span>REGISTRAR Y GENERAR ORDEN DE TRABAJO</span>`;
        }
    }
}

// -------------------------------------------------------------
// VIEW 3: ORDERS LIST & FILTERS
// -------------------------------------------------------------

let searchDebounceTimeout = null;
function debounceOrdersSearch() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        loadOrdersList();
    }, 250);
}

function resetOrdersFilters() {
    const fStatus = document.getElementById('filter-status');
    const fFailure = document.getElementById('filter-failure');
    const fMachine = document.getElementById('filter-machine');
    const fSearch = document.getElementById('filter-search');

    if (fStatus) fStatus.value = '';
    if (fFailure) fFailure.value = '';
    if (fMachine) fMachine.value = '';
    if (fSearch) fSearch.value = '';

    loadOrdersList();
}

function filterOrdersByStopped() {
    navigateTo('orders');
    const fStatus = document.getElementById('filter-status');
    if (fStatus) fStatus.value = 'EN_PROCESO';
    loadOrdersList();
}

async function loadOrdersList(updateUI = true) {
    const container = document.getElementById('orders-container');

    const statusVal = document.getElementById('filter-status')?.value || '';
    const failureVal = document.getElementById('filter-failure')?.value || '';
    const machineVal = document.getElementById('filter-machine')?.value || '';
    const searchVal = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();

    try {
        const params = new URLSearchParams();
        if (statusVal) params.append('status', statusVal);
        if (failureVal) params.append('failure', failureVal);
        if (machineVal) params.append('machine_id', machineVal);
        if (searchVal) params.append('search', searchVal);

        const res = await fetch(`/api/orders?${params.toString()}`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                state.orders = data;
                localStorage.setItem('sm_orders', JSON.stringify(data));
            }
        }
    } catch (err) {
        console.warn("Using local orders list:", err);
    }

    if (!updateUI || !container) return;

    // Filter local orders
    let filtered = state.orders || [];
    if (statusVal) filtered = filtered.filter(o => o.status === statusVal);
    if (failureVal) filtered = filtered.filter(o => o.failure_type === failureVal);
    if (machineVal) filtered = filtered.filter(o => o.machine_id == machineVal);
    if (searchVal) {
        filtered = filtered.filter(o => 
            (o.order_number || '').toLowerCase().includes(searchVal) ||
            (o.operator_name || '').toLowerCase().includes(searchVal) ||
            (o.machine_name || '').toLowerCase().includes(searchVal) ||
            (o.description || '').toLowerCase().includes(searchVal)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                <i class="fa-solid fa-clipboard-question text-3xl mb-3 text-slate-600"></i>
                <p class="font-bold text-slate-400 text-base">No hay órdenes que coincidan</p>
                <p class="text-xs text-slate-500 mt-1">Prueba cambiando los filtros o reporta una nueva falla.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(o => renderOrderCard(o)).join('');
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
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div class="flex items-center gap-3">
                    <span class="font-mono text-base font-black text-blue-400">${o.order_number}</span>
                    <div>${statusBadge}</div>
                    <span class="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-300 uppercase">${o.maintenance_type || 'CORRECTIVO'}</span>
                </div>
                <div class="text-xs text-slate-400">
                    <i class="fa-solid fa-calendar text-slate-500 mr-1"></i> ${o.report_date} a las ${o.report_time}
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Máquina</p>
                    <p class="text-base font-extrabold text-white mt-0.5">${o.machine_name}</p>
                    <p class="text-xs text-slate-400"><i class="fa-solid fa-location-dot text-slate-500"></i> ${o.machine_location || ''} (${o.machine_code || ''})</p>
                </div>

                <div>
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reportó Operario</p>
                    <p class="text-sm font-bold text-slate-200 mt-0.5">${o.operator_name}</p>
                    <div class="flex items-center gap-2 mt-1">
                        ${failureBadge}
                    </div>
                </div>

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

            <div class="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs text-slate-300">
                <span class="font-bold text-slate-400">Descripción:</span> ${o.description}
                ${o.spare_parts_notes ? `<div class="mt-1 text-purple-300 font-semibold"><i class="fa-solid fa-boxes-stacked mr-1"></i> Repuestos: ${o.spare_parts_notes}</div>` : ''}
            </div>

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
    let order = state.orders.find(o => o.id == orderId);

    try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (res.ok) {
            order = await res.json();
            // Update in local state
            const idx = state.orders.findIndex(o => o.id == orderId);
            if (idx >= 0) state.orders[idx] = order;
        }
    } catch (err) {
        console.warn("Using local order details:", err);
    }

    if (!order) {
        showToast('Orden no encontrada', 'error');
        return;
    }

    state.activeOrder = order;

    // Set text elements safely
    document.getElementById('modal-order-number').textContent = order.order_number;
    
    // Status Badge (without outerHTML replacement)
    const statusEl = document.getElementById('modal-order-status-badge');
    if (statusEl) {
        statusEl.textContent = order.status;
        statusEl.className = getStatusBadgeClass(order.status);
    }

    document.getElementById('modal-machine-name').textContent = order.machine_name;
    document.getElementById('modal-machine-location').textContent = `${order.machine_location || ''} (${order.machine_code || ''})`;
    document.getElementById('modal-operator-name').textContent = order.operator_name;
    document.getElementById('modal-report-timestamp').textContent = `${order.report_date} ${order.report_time}`;

    // Failure Badge
    const failEl = document.getElementById('modal-failure-type');
    if (failEl) {
        failEl.textContent = order.failure_type;
        failEl.className = getFailureBadgeClass(order.failure_type);
    }

    // Stopped badge
    const stoppedBadge = document.getElementById('modal-stopped-badge');
    if (stoppedBadge) {
        stoppedBadge.textContent = order.machine_stopped ? '🔴 MÁQUINA PARADA' : '🟢 EN OPERACIÓN';
        stoppedBadge.className = order.machine_stopped 
            ? 'px-2 py-0.5 rounded text-xs font-bold bg-rose-500/20 text-rose-300' 
            : 'px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300';
    }

    const downtimeEl = document.getElementById('modal-live-downtime');
    if (downtimeEl) {
        if (order.machine_stopped) {
            downtimeEl.textContent = `Downtime: ${order.current_live_downtime_minutes || order.total_downtime_minutes || 0} min`;
            downtimeEl.classList.remove('hidden');
        } else {
            downtimeEl.classList.add('hidden');
        }
    }

    document.getElementById('modal-description').textContent = order.description;
    document.getElementById('modal-diagnosis').value = order.diagnosis || '';
    document.getElementById('modal-solution').value = order.solution_notes || '';
    document.getElementById('modal-spare-parts-notes').value = order.spare_parts_notes || '';

    // Populate modal technician select
    const techSelect = document.getElementById('modal-technician-select');
    if (techSelect) {
        techSelect.innerHTML = '<option value="">-- Sin Asignar --</option>';
        state.technicians.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.name} (${t.role})`;
            techSelect.appendChild(opt);
        });
        techSelect.value = order.technician_id || '';
    }

    // Update Live Clock display
    updateModalTimerDisplay();

    // Render spare parts
    renderModalSpareParts(order.parts || []);

    // Show modal
    document.getElementById('order-detail-modal').classList.remove('hidden');
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
    if (timerDisplay) timerDisplay.textContent = formatSeconds(totalSeconds);

    if (o.status === 'FINALIZADO') {
        if (timerLabel) {
            timerLabel.textContent = `Mantenimiento Finalizado (${formatSeconds(o.repair_duration_seconds || totalSeconds)})`;
            timerLabel.className = "text-[11px] text-emerald-400 uppercase font-semibold";
        }
        if (btnStart) btnStart.classList.add('hidden');
        if (btnPause) btnPause.classList.add('hidden');
        if (btnFinish) btnFinish.classList.add('hidden');
    } else if (o.is_timer_running) {
        if (timerLabel) {
            timerLabel.textContent = "Cronómetro Corriendo (En Intervención)";
            timerLabel.className = "text-[11px] text-emerald-400 uppercase font-bold animate-pulse";
        }
        if (btnStart) btnStart.classList.add('hidden');
        if (btnPause) btnPause.classList.remove('hidden');
        if (btnFinish) btnFinish.classList.remove('hidden');
    } else {
        if (timerLabel) {
            timerLabel.textContent = totalSeconds > 0 ? "Cronómetro Pausado" : "Cronómetro Detenido";
            timerLabel.className = "text-[11px] text-slate-400 uppercase font-semibold";
        }
        if (btnStart) {
            btnStart.classList.remove('hidden');
            btnStart.innerHTML = `<i class="fa-solid fa-play"></i> ${totalSeconds > 0 ? 'Reanudar Cronómetro' : 'Iniciar Cronómetro'}`;
        }
        if (btnPause) btnPause.classList.add('hidden');
        if (btnFinish) btnFinish.classList.remove('hidden');
    }
}

async function startModalTimer() {
    if (!state.activeOrder) return;

    let techId = document.getElementById('modal-technician-select')?.value;
    
    // Auto-assign first tech if none chosen
    if (!techId && state.technicians.length > 0) {
        techId = state.technicians[0].id;
        const sel = document.getElementById('modal-technician-select');
        if (sel) sel.value = techId;
    }

    try {
        await fetch(`/api/orders/${state.activeOrder.id}/timer/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ technician_id: techId ? parseInt(techId) : null })
        });
    } catch (err) {
        console.warn("Offline timer start:", err);
    }

    // Update active order state locally
    state.activeOrder.is_timer_running = 1;
    state.activeOrder.status = 'EN_PROCESO';
    state.activeOrder.timer_last_started_at = new Date().toISOString();
    if (techId) {
        state.activeOrder.technician_id = parseInt(techId);
        const t = state.technicians.find(item => item.id == techId);
        if (t) state.activeOrder.technician_name = t.name;
    }

    saveActiveOrderLocally();
    updateModalTimerDisplay();
    showToast('Cronómetro de reparación iniciado', 'success');
}

async function pauseModalTimer() {
    if (!state.activeOrder) return;

    try {
        await fetch(`/api/orders/${state.activeOrder.id}/timer/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        console.warn("Offline timer pause:", err);
    }

    state.activeOrder.is_timer_running = 0;
    state.activeOrder.status = 'PAUSADO';
    saveActiveOrderLocally();
    updateModalTimerDisplay();
    showToast('Cronómetro pausado', 'info');
}

async function saveOrderProgress() {
    if (!state.activeOrder) return;

    const diagnosis = document.getElementById('modal-diagnosis')?.value.trim() || '';
    const solution = document.getElementById('modal-solution')?.value.trim() || '';
    const spareNotes = document.getElementById('modal-spare-parts-notes')?.value.trim() || '';
    const techId = document.getElementById('modal-technician-select')?.value;

    try {
        await fetch(`/api/orders/${state.activeOrder.id}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                diagnosis,
                solution_notes: solution,
                spare_parts_notes: spareNotes,
                technician_id: techId ? parseInt(techId) : null
            })
        });
    } catch (err) {
        console.warn("Offline progress saved:", err);
    }

    state.activeOrder.diagnosis = diagnosis;
    state.activeOrder.solution_notes = solution;
    state.activeOrder.spare_parts_notes = spareNotes;
    if (techId) {
        state.activeOrder.technician_id = parseInt(techId);
        const t = state.technicians.find(item => item.id == techId);
        if (t) state.activeOrder.technician_name = t.name;
    }
    saveActiveOrderLocally();
    showToast('¡Avance guardado! El cronómetro y la orden siguen abiertos.', 'success');
}

async function finishModalOrder() {
    if (!state.activeOrder) return;

    const diagnosis = document.getElementById('modal-diagnosis')?.value.trim() || '';
    const solution = document.getElementById('modal-solution')?.value.trim() || '';
    const spareNotes = document.getElementById('modal-spare-parts-notes')?.value.trim() || '';
    const techId = document.getElementById('modal-technician-select')?.value;

    if (!confirm('¿Deseas finalizar este mantenimiento? El cronómetro se detendrá automáticamente y se calculará el tiempo de reparación y parada.')) {
        return;
    }

    let result = null;
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
        if (res.ok) {
            result = await res.json();
        }
    } catch (err) {
        console.warn("Offline finish calculation:", err);
    }

    // Local finalization fallback
    const totalSec = state.activeOrder.current_live_duration_seconds || state.activeOrder.repair_duration_seconds || 120;
    const durationMin = Math.round(totalSec / 60 * 10) / 10;
    
    state.activeOrder.status = 'FINALIZADO';
    state.activeOrder.is_timer_running = 0;
    state.activeOrder.repair_duration_seconds = totalSec;
    state.activeOrder.diagnosis = diagnosis;
    state.activeOrder.solution_notes = solution;
    state.activeOrder.spare_parts_notes = spareNotes;

    // Release machine to OPERATIVA
    const m = state.machines.find(item => item.id == state.activeOrder.machine_id);
    if (m) m.status = 'OPERATIVA';

    saveActiveOrderLocally();
    localStorage.setItem('sm_machines', JSON.stringify(state.machines));

    showToast(`¡Mantenimiento Finalizado! Tiempo de reparación: ${result ? result.repair_duration_minutes : durationMin} min. Máquina operativa.`, 'success');

    closeOrderDetailModal();
    loadDashboardData();
    loadOrdersList();
}

function saveActiveOrderLocally() {
    if (!state.activeOrder) return;
    const idx = state.orders.findIndex(o => o.id == state.activeOrder.id);
    if (idx >= 0) {
        state.orders[idx] = { ...state.activeOrder };
    }
    localStorage.setItem('sm_orders', JSON.stringify(state.orders));
}

// -------------------------------------------------------------
// SPARE PARTS (REPUESTOS) MANAGEMENT
// -------------------------------------------------------------

function toggleAddPartForm() {
    const form = document.getElementById('add-part-form');
    if (form) form.classList.toggle('hidden');
}

async function saveSparePart() {
    if (!state.activeOrder) return;
    const nameInput = document.getElementById('part-name');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) {
        showToast('Ingresa el nombre del repuesto (Ej: Rodamiento 6204)', 'warning');
        return;
    }

    const qty = parseFloat(document.getElementById('part-qty')?.value) || 1;
    const unit = document.getElementById('part-unit')?.value.trim() || 'unidad';
    const code = document.getElementById('part-code')?.value.trim() || '';
    const cost = parseFloat(document.getElementById('part-cost')?.value) || 0;

    const newPart = {
        id: Date.now(),
        order_id: state.activeOrder.id,
        part_name: name,
        quantity: qty,
        unit: unit,
        part_code: code,
        unit_cost: cost
    };

    try {
        await fetch(`/api/orders/${state.activeOrder.id}/parts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newPart)
        });
    } catch (err) {
        console.warn("Offline save part:", err);
    }

    if (!state.activeOrder.parts) state.activeOrder.parts = [];
    state.activeOrder.parts.push(newPart);

    // Update notes text
    const summary = `${name} (x${qty} ${unit})`;
    const currNotes = state.activeOrder.spare_parts_notes || '';
    state.activeOrder.spare_parts_notes = currNotes ? `${currNotes}, ${summary}` : summary;
    const notesInput = document.getElementById('modal-spare-parts-notes');
    if (notesInput) notesInput.value = state.activeOrder.spare_parts_notes;

    saveActiveOrderLocally();
    renderModalSpareParts(state.activeOrder.parts);

    // Clean inputs
    if (nameInput) nameInput.value = '';
    const codeIn = document.getElementById('part-code');
    if (codeIn) codeIn.value = '';
    const costIn = document.getElementById('part-cost');
    if (costIn) costIn.value = '';

    showToast(`Repuesto agregado: ${name}`, 'success');
}

async function deleteSparePart(partId) {
    if (!confirm('¿Eliminar este repuesto?')) return;

    try {
        await fetch(`/api/parts/${partId}`, { method: 'DELETE' });
    } catch (err) {
        console.warn("Offline delete part:", err);
    }

    if (state.activeOrder && state.activeOrder.parts) {
        state.activeOrder.parts = state.activeOrder.parts.filter(p => p.id != partId);
        renderModalSpareParts(state.activeOrder.parts);
        saveActiveOrderLocally();
    }
    showToast('Repuesto eliminado', 'info');
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
            <button onclick="deleteSparePart(${p.id})" class="text-slate-500 hover:text-rose-400 p-1" title="Eliminar">
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
        let statusBadge = '';
        if (m.status === 'PARADA') {
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
                        <i class="fa-solid fa-location-dot text-slate-500"></i> ${m.location || 'Planta'}
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

// Helper to determine QR URL for both Vercel and local
function getQrTargetUrl(machineId) {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.hostname.startsWith('192.168.')) {
        return `${window.location.origin}/#report?machine_id=${machineId}`;
    }
    const host = state.settings.server_ip || window.location.hostname;
    const port = state.settings.server_port || '5000';
    return `http://${host}:${port}/#report?machine_id=${machineId}`;
}

let currentQRDataUrl = '';

function openQRModal(machineId) {
    const machine = state.machines.find(m => m.id == machineId);
    if (!machine) return;

    document.getElementById('qr-modal-machine-name').textContent = machine.name;
    document.getElementById('qr-modal-machine-code').textContent = `CÓDIGO: ${machine.code}`;

    const targetUrl = getQrTargetUrl(machine.id);
    document.getElementById('qr-modal-url').textContent = targetUrl;

    const container = document.getElementById('qr-code-container');
    container.innerHTML = '';

    // Render QRCode safely
    if (typeof QRCode !== 'undefined') {
        new QRCode(container, {
            text: targetUrl,
            width: 180,
            height: 180,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        setTimeout(() => {
            const canvas = container.querySelector('canvas');
            if (canvas) {
                currentQRDataUrl = canvas.toDataURL('image/png');
            } else {
                const img = container.querySelector('img');
                if (img) currentQRDataUrl = img.src;
            }
        }, 200);
    } else {
        // Fallback if QRCode CDN is not available
        const fallbackImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(targetUrl)}`;
        container.innerHTML = `<img src="${fallbackImgUrl}" alt="QR Code" class="mx-auto rounded-lg">`;
        currentQRDataUrl = fallbackImgUrl;
    }

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
        showToast('Enlace directo copiado al portapapeles', 'info');
    });
}

function openPrintAllModal() {
    const container = document.getElementById('all-qr-cards-grid');
    if (!container) return;
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

        setTimeout(() => {
            const qrEl = document.getElementById(cardId);
            if (qrEl) {
                if (typeof QRCode !== 'undefined') {
                    new QRCode(qrEl, {
                        text: targetUrl,
                        width: 130,
                        height: 130,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } else {
                    qrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(targetUrl)}" class="mx-auto">`;
                }
            }
        }, 40 * idx);
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
        if (m) {
            title.textContent = 'Editar Máquina';
            idInput.value = m.id;
            codeInput.value = m.code;
            nameInput.value = m.name;
            locInput.value = m.location || '';
            descInput.value = m.description || '';
        }
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
    const code = document.getElementById('machine-code-input').value.trim().toUpperCase();
    const name = document.getElementById('machine-name-input').value.trim();
    const loc = document.getElementById('machine-location-input').value.trim();
    const desc = document.getElementById('machine-desc-input').value.trim();

    const payload = { code, name, location: loc, description: desc };

    try {
        const url = id ? `/api/machines/${id}` : '/api/machines';
        const method = id ? 'PUT' : 'POST';
        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.warn("Offline save machine:", err);
    }

    if (id) {
        const idx = state.machines.findIndex(m => m.id == id);
        if (idx >= 0) {
            state.machines[idx] = { ...state.machines[idx], ...payload };
        }
    } else {
        state.machines.push({
            id: Date.now(),
            status: 'OPERATIVA',
            ...payload
        });
    }

    localStorage.setItem('sm_machines', JSON.stringify(state.machines));
    showToast('Máquina guardada exitosamente', 'success');
    closeMachineModal();
    populateFormDropdowns();
    populateFilterMachines();
    renderQuickMachineChips();
    renderMachinesGrid();
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
        if (t) {
            title.textContent = 'Editar Técnico';
            idInput.value = t.id;
            nameInput.value = t.name;
            roleInput.value = t.role || '';
            phoneInput.value = t.phone || '';
        }
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
        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.warn("Offline save tech:", err);
    }

    if (id) {
        const idx = state.technicians.findIndex(t => t.id == id);
        if (idx >= 0) state.technicians[idx] = { ...state.technicians[idx], ...payload };
    } else {
        state.technicians.push({ id: Date.now(), ...payload });
    }

    localStorage.setItem('sm_technicians', JSON.stringify(state.technicians));
    showToast('Técnico guardado exitosamente', 'success');
    closeTechnicianModal();
    populateFormDropdowns();
    renderTechniciansGrid();
}

// -------------------------------------------------------------
// CAMERA SCANNER & FALLBACK
// -------------------------------------------------------------

function renderScannerMachineList() {
    const list = document.getElementById('scanner-machine-quick-list');
    if (!list) return;

    list.innerHTML = state.machines.map(m => `
        <button type="button" onclick="selectFromScanner(${m.id})" 
            class="px-3 py-2 bg-slate-800 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all border border-slate-700">
            <i class="fa-solid fa-industry mr-1 text-slate-400"></i>
            ${m.name}
        </button>
    `).join('');
}

function selectFromScanner(machineId) {
    closeCameraScannerModal();
    navigateTo('report');
    preselectMachine(machineId);
}

function openCameraScannerModal() {
    document.getElementById('scanner-modal').classList.remove('hidden');
    renderScannerMachineList();

    if (typeof Html5Qrcode === 'undefined') {
        return;
    }

    try {
        if (!state.html5QrCode) {
            state.html5QrCode = new Html5Qrcode("qr-reader");
        }

        const config = { fps: 10, qrbox: { width: 220, height: 220 } };

        state.html5QrCode.start(
            { facingMode: "environment" },
            config,
            onQrCodeSuccess,
            onQrCodeError
        ).catch(err => {
            console.warn("Camera not accessible:", err);
            // Non-fatal: user has the quick buttons right below!
        });
    } catch (e) {
        console.warn("Scanner setup skipped:", e);
    }
}

function onQrCodeSuccess(decodedText) {
    showToast(`¡Código QR detectado!`, 'success');
    closeCameraScannerModal();

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
        navigateTo('report');
        preselectMachineByCode(decodedText);
    }
}

function onQrCodeError(errorMessage) {}

function closeCameraScannerModal() {
    if (state.html5QrCode) {
        state.html5QrCode.stop().catch(() => {}).finally(() => {
            document.getElementById('scanner-modal')?.classList.add('hidden');
        });
    } else {
        document.getElementById('scanner-modal')?.classList.add('hidden');
    }
}

// -------------------------------------------------------------
// SETTINGS
// -------------------------------------------------------------

function openSettingsModal() {
    const sIp = document.getElementById('settings-server-ip');
    const sPort = document.getElementById('settings-server-port');
    const sName = document.getElementById('settings-company-name');

    if (sIp) sIp.value = state.settings.server_ip;
    if (sPort) sPort.value = state.settings.server_port || '5000';
    if (sName) sName.value = state.settings.company_name;

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
        await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ server_ip, server_port, company_name })
        });
    } catch (err) {}

    state.settings.server_ip = server_ip;
    state.settings.server_port = server_port;
    state.settings.company_name = company_name;

    showToast('Configuración guardada', 'success');
    closeSettingsModal();
}

// -------------------------------------------------------------
// LIVE TICK FOR CLOCKS & DOWNTIME
// -------------------------------------------------------------

function tickLiveClocks() {
    if (state.activeOrder && state.activeOrder.is_timer_running) {
        state.activeOrder.current_live_duration_seconds = (state.activeOrder.current_live_duration_seconds || state.activeOrder.repair_duration_seconds || 0) + 1;
        const timerDisplay = document.getElementById('modal-timer-display');
        if (timerDisplay) {
            timerDisplay.textContent = formatSeconds(state.activeOrder.current_live_duration_seconds);
        }
    }

    const clocks = document.querySelectorAll('.live-clock[data-running="1"]');
    clocks.forEach(el => {
        let sec = parseInt(el.getAttribute('data-seconds') || '0') + 1;
        el.setAttribute('data-seconds', sec);
        el.textContent = formatSeconds(sec);
    });
}

// -------------------------------------------------------------
// BADGES & FORMATTING
// -------------------------------------------------------------

function formatSeconds(totalSec) {
    totalSec = Math.max(0, parseInt(totalSec) || 0);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = Math.floor(totalSec % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function getStatusBadge(status) {
    switch (status) {
        case 'PENDIENTE':
            return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">PENDIENTE</span>`;
        case 'EN_PROCESO':
            return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">EN PROCESO</span>`;
        case 'PAUSADO':
            return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700 text-slate-300 border border-slate-600">PAUSADO</span>`;
        case 'FINALIZADO':
            return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">FINALIZADO</span>`;
        default:
            return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400">${status || 'PENDIENTE'}</span>`;
    }
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'PENDIENTE': return 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300';
        case 'EN_PROCESO': return 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 animate-pulse';
        case 'PAUSADO': return 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700 text-slate-300';
        case 'FINALIZADO': return 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300';
        default: return 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400';
    }
}

function getFailureBadge(failureType) {
    switch (failureType) {
        case 'ELECTRICA':
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"><i class="fa-solid fa-bolt text-[10px]"></i> Eléctrica</span>`;
        case 'MECANICA':
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30"><i class="fa-solid fa-gear text-[10px]"></i> Mecánica</span>`;
        case 'AMBAS':
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30"><i class="fa-solid fa-bolt text-[10px]"></i><i class="fa-solid fa-gear text-[10px]"></i> Ambas</span>`;
        default:
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700"><i class="fa-solid fa-question text-[10px]"></i> No sabe</span>`;
    }
}

function getFailureBadgeClass(failureType) {
    switch (failureType) {
        case 'ELECTRICA': return 'px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300';
        case 'MECANICA': return 'px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-300';
        case 'AMBAS': return 'px-2 py-0.5 rounded text-xs font-bold bg-purple-500/20 text-purple-300';
        default: return 'px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-300';
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

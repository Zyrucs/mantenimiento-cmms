/**
 * SistMaint CMMS 2.0 - Industrial Maintenance, Machine Dossiers (Hojas de Vida) & Preventive Plan 2027
 * UI Aesthetic: MagicUI Codeforge + Toggl Track Web
 * Features:
 *  - Role-Based Access: Operario (QR), Técnico (No-login damaged machines & timer), Jefe (Login admin)
 *  - Failure Categorization + Subcategories
 *  - Machine Dossiers (Hojas de Vida) with instant Notifications to Jefes & Técnicos
 *  - Maintenance Plans & Interactive 2027 Preventive Matrix (Jan-Dec 2027)
 *  - Real-time Cloud Sync (Phone <-> PC on Vercel & Local)
 */

const CLOUD_OBJECT_ID = 'ff808181a09d98f701a15b90d54134d5';
const CLOUD_API_URL = `https://api.restful-api.dev/objects/${CLOUD_OBJECT_ID}`;
const NTFY_TOPIC = 'sistmaint_cmms_v2_live';
const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// 2-Object Initial Seed Fallback (Matches database.py v2 seed)
const DEFAULT_CATEGORIES = [
    {
        id: 1, code: 'ELECTRICA', name: 'Eléctrica', color: '#f59e0b', icon: 'fa-bolt',
        subcategories_list: ['Motor Eléctrico', 'Tablero / Contactores', 'Sensores / Final de Carrera', 'Cableado / Cortocircuito', 'Alimentación'],
        description: 'Fallas de potencia, tableros, motores y suministro eléctrico'
    },
    {
        id: 2, code: 'MECANICA', name: 'Mecánica', color: '#3b82f6', icon: 'fa-gears',
        subcategories_list: ['Rodamientos / Balineras', 'Correas / Cadenas', 'Ejes / Engranajes', 'Desalineación / Vibración', 'Estructura / Sellos'],
        description: 'Desgaste de piezas móviles, transmisión, rodamientos y ajustes mecánicos'
    },
    {
        id: 3, code: 'HIDRAULICA_NEUMATICA', name: 'Hidráulica / Neumática', color: '#06b6d4', icon: 'fa-droplet',
        subcategories_list: ['Fuga de Aire / Aceite', 'Cilindros / Actuadores', 'Electroválvulas', 'Baja Presión / Compresor', 'Mangueras / Racores'],
        description: 'Sistemas de presión neumática, bombas e hidráulica'
    },
    {
        id: 4, code: 'ELECTRONICA_CONTROL', name: 'Electrónica / PLC', color: '#a855f7', icon: 'fa-microchip',
        subcategories_list: ['Variador de Frecuencia (VFD)', 'PLC / Módulo I/O', 'Pantalla HMI', 'Desconfiguración / Software', 'Paro de Emergencia'],
        description: 'Automatización, sensores inteligentes, variadores y control lógico'
    },
    {
        id: 5, code: 'LUBRICACION', name: 'Lubricación / Térmica', color: '#10b981', icon: 'fa-oil-can',
        subcategories_list: ['Falta de Grasa / Aceite', 'Sobrecalentamiento', 'Filtro Obstruido', 'Degradación de Lubricante'],
        description: 'Problemas de lubricación, fricción y temperatura'
    },
    {
        id: 6, code: 'AMBAS', name: 'Eléctrica y Mecánica (Ambas)', color: '#ec4899', icon: 'fa-screwdriver-wrench',
        subcategories_list: ['Paro Electromecánico General', 'Atasco de Motor y Transmisión'],
        description: 'Falla combinada en sistema eléctrico y mecánico'
    },
    {
        id: 7, code: 'NO_SABE', name: 'Por Diagnosticar / No sabe', color: '#71717a', icon: 'fa-circle-question',
        subcategories_list: ['Ruido Anormal', 'La máquina no inicia', 'Falla intermitente', 'Otro síntoma'],
        description: 'Cuando el operario reporta el síntoma sin identificar el origen exacto'
    }
];

const DEFAULT_MACHINES = [
    {
        id: 1, code: 'MAQ-001', name: 'Máquina 1', location: 'Línea de Producción 1', status: 'EN_MANTENIMIENTO',
        description: 'Centro de mecanizado y torno industrial principal',
        brand: 'Haas Automation', model: 'ST-20Y', serial_number: 'SN-HAAS-88412', install_date: '2023-03-15',
        voltage: '440V Trifásico', power_kw: '15 kW (20 HP)', criticality: 'ALTA', supplier: 'Maquinaria Industrial S.A.',
        critical_parts: 'Rodamiento husillo 6205-2RS, Correa dentada HTD-8M, Contactor Siemens 24VDC, Sellos hidráulicos',
        preventive_interval_days: 30, last_maintenance_date: '2026-09-20', next_maintenance_date: '2026-10-25',
        life_notes: 'Hoja de Vida activa. Requiere verificación mensual de vibración en cabezal y limpieza de circuito de refrigeración.'
    },
    {
        id: 2, code: 'MAQ-002', name: 'Máquina 2', location: 'Línea de Empaque y Sellado', status: 'OPERATIVA',
        description: 'Empacadora y selladora termoformadora automática',
        brand: 'Bosch Packaging', model: 'SVE-2520', serial_number: 'SN-BSH-44901', install_date: '2024-01-10',
        voltage: '220V Trifásico', power_kw: '7.5 kW (10 HP)', criticality: 'ALTA', supplier: 'TecnoPack Andina',
        critical_parts: 'Resistencia térmica 500W, Sensor óptico Omron E3Z, Cilindro neumático Festo DSNU-25, Relevo SSR-40DA',
        preventive_interval_days: 45, last_maintenance_date: '2026-10-01', next_maintenance_date: '2026-11-15',
        life_notes: 'Hoja de Vida al día. Calibrar mordazas de sellado y presión neumática a 6 bar cada 45 días.'
    }
];

const DEFAULT_TECHS = [
    { id: 1, name: 'Ingeniero 1', role: 'Ingeniero Electromecánico Senior', specialty: 'Eléctrica & Control PLC', phone: '300 123 4567' },
    { id: 2, name: 'Ingeniero 2', role: 'Especialista Mecánico & Preventivo', specialty: 'Mecánica & Neumática', phone: '310 987 6543' }
];

const DEFAULT_PLANS = [
    {
        id: 1, plan_code: 'PLAN-2027-001', machine_id: 1, machine_name: 'Máquina 1', machine_code: 'MAQ-001',
        title: 'Plan Preventivo Anual 2027 - Overhaul & Alineación Máquina 1',
        maintenance_type: 'PREVENTIVO', frequency: 'TRIMESTRAL', year: 2027,
        months: [1, 4, 7, 10], scheduled_date: '2027-01-15', estimated_minutes: 120,
        assigned_technician_id: 2, technician_name: 'Ingeniero 2', status: 'PROGRAMADO',
        checklist: [
            { task: 'Verificar holgura y vibración de rodamientos del husillo', done: false },
            { task: 'Cambiar aceite de caja de transmisión y limpiar filtros', done: false },
            { task: 'Reapretar borneras del tablero de fuerza 440V', done: false },
            { task: 'Calibrar ejes X/Y y lubricar guías lineales', done: false }
        ]
    },
    {
        id: 2, plan_code: 'PLAN-2027-002', machine_id: 2, machine_name: 'Máquina 2', machine_code: 'MAQ-002',
        title: 'Plan Preventivo 2027 - Sistema Térmico y Neumático Máquina 2',
        maintenance_type: 'PREVENTIVO', frequency: 'BIMESTRAL', year: 2027,
        months: [2, 4, 6, 8, 10, 12], scheduled_date: '2027-02-10', estimated_minutes: 90,
        assigned_technician_id: 1, technician_name: 'Ingeniero 1', status: 'PROGRAMADO',
        checklist: [
            { task: 'Inspeccionar resistencias de mordaza y termocuplas', done: false },
            { task: 'Purgar unidad de mantenimiento neumático FRL (6 bar)', done: false },
            { task: 'Limpiar y calibrar sensores ópticos y encoder de avance', done: false },
            { task: 'Reemplazar teflón antiadherente en barra de sellado', done: false }
        ]
    }
];

// Global App State
const state = {
    role: localStorage.getItem('sm_v2_role') || 'OPERARIO', // 'OPERARIO' | 'TECNICO' | 'JEFE'
    bossUser: JSON.parse(localStorage.getItem('sm_v2_boss_user') || 'null'),
    currentView: 'report',
    machines: DEFAULT_MACHINES,
    technicians: DEFAULT_TECHS,
    categories: DEFAULT_CATEGORIES,
    orders: [],
    plans: DEFAULT_PLANS,
    notifications: [],
    unreadNotifications: 0,
    activeOrder: null,
    activeDossierMachineId: null,
    selectedPlanMonths: [1, 4, 7, 10],
    settings: {
        server_ip: window.location.hostname || '192.168.68.56',
        server_port: window.location.port || '5000',
        company_name: 'SistMaint CMMS 2.0',
        qr_base_url: window.location.origin
    },
    html5QrCode: null,
    sseConnection: null,
    charts: {
        failures: null,
        maintenance: null
    }
};

// ============================================================================
// INITIALIZATION, ROUTING & ROLE ENFORCEMENT
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    initThemeMode();
    setCurrentDateTime();
    applyRoleUI();
    renderFailureCategorySelector('MECANICA');
    populateFormDropdowns();
    renderQuickMachineChips();

    await loadAllData();
    handleInitialRoute();
    initRealtimeCloudStream();

    setInterval(tickLiveClocks, 1000);
});

function initThemeMode() {
    const savedTheme = localStorage.getItem('sm_v2_theme') || 'dark';
    const isDark = savedTheme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) {
        icon.className = isDark ? 'fa-solid fa-sun text-xs' : 'fa-solid fa-moon text-xs';
    }
}

function toggleThemeMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('sm_v2_theme', isDark ? 'dark' : 'light');
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) {
        icon.className = isDark ? 'fa-solid fa-sun text-xs' : 'fa-solid fa-moon text-xs';
    }
    showToast(isDark ? 'Tema Violet Bloom Dark activado' : 'Tema Violet Bloom Light activado', 'info');
}

async function loadAllData() {
    await Promise.allSettled([
        loadSettings(),
        loadCategories(),
        loadMachines(),
        loadTechnicians(),
        loadOrdersList(false),
        loadPlans(),
        loadNotifications(),
        loadDashboardData()
    ]);
    updateTopTogglTimerBar();
}

function handleInitialRoute() {
    const urlParams = new URLSearchParams(window.location.search);
    const machineId = urlParams.get('machine_id') || urlParams.get('machine');
    const machineCode = urlParams.get('machine_code');
    const hash = (window.location.hash || '').replace('#', '');

    if (machineId || machineCode) {
        navigateTo('report');
        if (machineId) preselectMachine(machineId);
        else if (machineCode) preselectMachineByCode(machineCode);
        return;
    }

    if (state.role === 'OPERARIO') {
        navigateTo('report');
    } else if (state.role === 'TECNICO') {
        if (['orders', 'machines', 'plans', 'report'].includes(hash)) {
            navigateTo(hash);
        } else {
            navigateTo('orders');
        }
    } else if (state.role === 'JEFE') {
        if (['dashboard', 'orders', 'machines', 'plans', 'categories', 'technicians', 'report'].includes(hash)) {
            navigateTo(hash);
        } else {
            navigateTo('dashboard');
        }
    }
}

function handleLogoClick() {
    if (state.role === 'JEFE') navigateTo('dashboard');
    else if (state.role === 'TECNICO') navigateTo('orders');
    else navigateTo('report');
}

function switchRole(targetRole) {
    if (targetRole === 'JEFE') {
        if (!state.bossUser) {
            openLoginModal();
            return;
        }
    }
    state.role = targetRole;
    localStorage.setItem('sm_v2_role', targetRole);
    applyRoleUI();

    if (targetRole === 'OPERARIO') {
        navigateTo('report');
        showToast('Modo Operario activo: Reporte rápido por QR', 'info');
    } else if (targetRole === 'TECNICO') {
        navigateTo('orders');
        showToast('Modo Técnico activo: Visualización de máquinas dañadas, cronómetro y hojas de vida', 'info');
    } else if (targetRole === 'JEFE') {
        navigateTo('dashboard');
        showToast(`Modo Jefe activo (${state.bossUser?.full_name || 'Admin'})`, 'success');
    }
}

function applyRoleUI() {
    const isBoss = state.role === 'JEFE' && !!state.bossUser;
    const isTech = state.role === 'TECNICO';
    const isOp = !isBoss && !isTech;

    if (state.role === 'JEFE' && !state.bossUser) {
        state.role = 'OPERARIO';
    }

    // Update Sidebar Role Badge
    const roleTitle = document.getElementById('sidebar-role-title');
    const roleIcon = document.getElementById('role-avatar-icon');
    if (roleTitle && roleIcon) {
        if (isBoss) {
            roleTitle.textContent = state.bossUser.full_name || 'Jefe de Mantenimiento';
            roleIcon.className = 'w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center justify-center flex-shrink-0 text-xs';
            roleIcon.innerHTML = '<i class="fa-solid fa-crown"></i>';
        } else if (isTech) {
            roleTitle.textContent = 'Técnico de Planta (Sin Cuenta)';
            roleIcon.className = 'w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center flex-shrink-0 text-xs';
            roleIcon.innerHTML = '<i class="fa-solid fa-wrench"></i>';
        } else {
            roleTitle.textContent = 'Operario (Escaneo QR)';
            roleIcon.className = 'w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center flex-shrink-0 text-xs';
            roleIcon.innerHTML = '<i class="fa-solid fa-helmet-safety"></i>';
        }
    }

    // Highlight active role button in top navbar capsule switcher
    ['OPERARIO', 'TECNICO', 'JEFE'].forEach(r => {
        const btn = document.getElementById(`role-btn-${r}`);
        if (!btn) return;
        if (state.role === r) {
            btn.className = 'px-3 py-1 rounded-full text-xs font-semibold vb-btn-primary transition-all flex items-center gap-1.5';
        } else {
            btn.className = 'px-3 py-1 rounded-full text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all flex items-center gap-1.5';
        }
    });

    // Show/hide nav items based on role
    const bossSection = document.getElementById('sidebar-boss-section');
    const logoutBtn = document.getElementById('logout-boss-btn');
    const headerLoginBtn = document.getElementById('header-login-btn');
    const headerNotifBtn = document.getElementById('header-notif-btn');
    const togglWidget = document.getElementById('toggl-live-timer-widget');

    if (bossSection) {
        bossSection.classList.toggle('hidden', !isBoss);
        bossSection.classList.toggle('grid', isBoss);
    }
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !isBoss);
    if (headerNotifBtn) headerNotifBtn.classList.toggle('hidden', isOp);
    if (togglWidget) {
        if (isOp) {
            togglWidget.classList.add('hidden');
            togglWidget.classList.remove('lg:flex');
        } else {
            togglWidget.classList.add('lg:flex');
        }
    }

    if (headerLoginBtn) {
        if (isBoss) {
            headerLoginBtn.innerHTML = `<i class="fa-solid fa-crown text-[11px]"></i><span class="hidden sm:inline">${state.bossUser.full_name || 'Jefe Activo'}</span>`;
            headerLoginBtn.onclick = () => navigateTo('dashboard');
        } else {
            headerLoginBtn.innerHTML = `<i class="fa-solid fa-lock text-[11px]"></i><span class="hidden sm:inline">Acceso Jefe</span>`;
            headerLoginBtn.onclick = () => openLoginModal();
        }
    }

    // Strict Operator form restriction: Hide Maintenance Type & Technician Assignment unless Boss!
    const bossReportBox = document.getElementById('boss-only-report-fields');
    if (bossReportBox) bossReportBox.classList.toggle('hidden', !isBoss);

    // Action buttons in views (only Boss can create/edit machines & plans)
    const btnNewMachine = document.getElementById('btn-new-machine');
    if (btnNewMachine) btnNewMachine.classList.toggle('hidden', !isBoss);

    const btnNewPlan = document.getElementById('btn-new-plan');
    if (btnNewPlan) btnNewPlan.classList.toggle('hidden', !isBoss);

    // Re-render current views to update boss-only buttons
    renderMachinesGrid();
    renderPlansView();
}

function navigateTo(viewName) {
    // If Operario clicks one of the open Técnico tabs (orders, machines, plans), seamlessly switch to Técnico (since Técnico requires no account!)
    if (state.role === 'OPERARIO' && ['orders', 'machines', 'plans'].includes(viewName)) {
        state.role = 'TECNICO';
        localStorage.setItem('sm_v2_role', 'TECNICO');
        applyRoleUI();
    }

    const isBoss = state.role === 'JEFE' && !!state.bossUser;
    const isTech = state.role === 'TECNICO';

    // Guard Boss-only views
    if (!isBoss && ['dashboard', 'categories', 'technicians'].includes(viewName)) {
        showToast('Esa sección requiere cuenta de Jefe de Mantenimiento', 'warning');
        openLoginModal();
        return;
    }

    state.currentView = viewName;
    window.location.hash = viewName;

    const views = ['report', 'orders', 'machines', 'plans', 'categories', 'dashboard', 'technicians'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.toggle('hidden', v !== viewName);

        const navBtn = document.getElementById(`nav-${v}`);
        if (navBtn) {
            navBtn.classList.toggle('active', v === viewName);
        }
    });

    // Update Header Title & Subtitle in the Codeforge window bar
    const titles = {
        report: ['Reportar Falla por QR', 'Formulario rápido de planta para reportar averías en máquinas'],
        orders: ['Máquinas Dañadas & Órdenes de Trabajo', 'Control de tiempos con cronómetro en vivo y estado de planta'],
        machines: ['Hojas de Vida de Máquinas & Códigos QR', 'Ficha técnica, bitácora histórica, alertas y etiquetas QR'],
        plans: ['Planes de Mantenimiento & Preventivo 2027', 'Cronograma anual 2027 y rutinas preventivas/predictivas'],
        categories: ['Categorización de Fallas', 'Catálogo de tipos y subcategorías de fallas técnicas'],
        dashboard: ['Dashboard Ejecutivo de Planta (Jefe)', 'Métricas en tiempo real, MTTR, paros y distribución de fallas'],
        technicians: ['Equipo Técnico e Ingenieros', 'Administración del personal de mantenimiento']
    };
    const [t, sub] = titles[viewName] || ['SistMaint CMMS', ''];
    const titleEl = document.getElementById('header-view-title');
    const subEl = document.getElementById('header-view-subtitle');
    if (titleEl) titleEl.textContent = t;
    if (subEl) subEl.textContent = sub;

    // Trigger view-specific refresh
    if (viewName === 'dashboard') loadDashboardData();
    else if (viewName === 'orders') {
        renderDamagedMachinesBanner();
        loadOrdersList();
    } else if (viewName === 'machines') renderMachinesGrid();
    else if (viewName === 'plans') renderPlansView();
    else if (viewName === 'categories') renderCategoriesGrid();
    else if (viewName === 'technicians') renderTechniciansGrid();
    else if (viewName === 'report') {
        populateFormDropdowns();
        renderQuickMachineChips();
        renderFailureCategorySelector();
    }
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;
    sidebar.classList.toggle('-translate-x-full');
    if (backdrop) backdrop.classList.toggle('hidden');
}

// ============================================================================
// LOGIN & AUTHENTICATION (JEFE)
// ============================================================================

function openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('hidden');
}

function fillDemoLogin(user, pass) {
    document.getElementById('login-username').value = user;
    document.getElementById('login-password').value = pass;
}

async function submitLoginForm(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
            // Fallback demo check if offline
            if ((username.toLowerCase() === 'jefe' && password === '1234') || (username.toLowerCase() === 'admin' && password === 'admin123')) {
                state.bossUser = { username, full_name: 'Jefe de Mantenimiento', role: 'JEFE' };
            } else {
                showToast(data.error || 'Credenciales incorrectas', 'error');
                return;
            }
        } else {
            state.bossUser = data.user;
        }

        localStorage.setItem('sm_v2_boss_user', JSON.stringify(state.bossUser));
        closeLoginModal();
        switchRole('JEFE');
    } catch (err) {
        if ((username.toLowerCase() === 'jefe' && password === '1234') || (username.toLowerCase() === 'admin' && password === 'admin123')) {
            state.bossUser = { username, full_name: 'Jefe de Mantenimiento', role: 'JEFE' };
            localStorage.setItem('sm_v2_boss_user', JSON.stringify(state.bossUser));
            closeLoginModal();
            switchRole('JEFE');
        } else {
            showToast('Error al iniciar sesión', 'error');
        }
    }
}

function logoutBoss() {
    state.bossUser = null;
    localStorage.removeItem('sm_v2_boss_user');
    switchRole('TECNICO');
    showToast('Sesión de Jefe cerrada', 'info');
}

// ============================================================================
// REAL-TIME CLOUD SYNC (SSE + PULL)
// ============================================================================

function initRealtimeCloudStream() {
    try {
        if (state.sseConnection) state.sseConnection.close();
        const sse = new EventSource(`https://ntfy.sh/${NTFY_TOPIC}/sse`);
        sse.onmessage = async (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.event === 'message') {
                    await loadAllData();
                    if (payload.title && payload.title !== 'notif_read') {
                        showToast('☁️ Datos actualizados en tiempo real desde la nube', 'info');
                    }
                }
            } catch (e) {}
        };
        state.sseConnection = sse;
    } catch (err) {
        console.warn('SSE stream fallback:', err);
    }
}

async function syncWithCloud(showFeedback = false) {
    const icon = document.getElementById('cloud-sync-icon');
    if (icon) icon.classList.add('fa-spin');
    try {
        await fetch('/api/cloud/pull', { method: 'POST' });
        await loadAllData();
        if (showFeedback) showToast('☁️ Base de datos sincronizada con la nube', 'success');
    } catch (err) {
        if (showFeedback) showToast('Sincronizado con caché local', 'info');
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
}

async function resetDemoDatabase() {
    if (!confirm('¿Restaurar la base de datos en la nube con los 2 objetos de prueba iniciales (Máquina 1 y Máquina 2)?')) return;
    try {
        const res = await fetch('/api/cloud/reset-demo', { method: 'POST' });
        if (res.ok) {
            await loadAllData();
            showToast('Base de datos restaurada con los 2 objetos de prueba', 'success');
        }
    } catch (err) {
        showToast('Error al restaurar demo', 'error');
    }
}

// ============================================================================
// DATA LOADERS
// ============================================================================

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        if (res.ok) state.settings = await res.json();
    } catch (e) {}
}

async function loadCategories() {
    try {
        const res = await fetch('/api/categories');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                state.categories = data;
            }
        }
    } catch (e) {}
    renderFailureCategorySelector();
    populateFilterCategories();
}

async function loadMachines() {
    try {
        const res = await fetch('/api/machines');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                state.machines = data;
            }
        }
    } catch (e) {}
    populateFormDropdowns();
    populateFilterMachines();
    renderQuickMachineChips();
    renderDamagedMachinesBanner();
    if (state.currentView === 'machines') renderMachinesGrid();
}

async function loadTechnicians() {
    try {
        const res = await fetch('/api/technicians');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                state.technicians = data;
            }
        }
    } catch (e) {}
    populateFormDropdowns();
    if (state.currentView === 'technicians') renderTechniciansGrid();
}

async function loadPlans() {
    try {
        const res = await fetch('/api/plans');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                state.plans = data;
            }
        }
    } catch (e) {}
    if (state.currentView === 'plans') renderPlansView();
}

async function loadNotifications() {
    try {
        const res = await fetch(`/api/notifications?role=${state.role}`);
        if (res.ok) {
            const data = await res.json();
            state.notifications = data.items || [];
            state.unreadNotifications = data.unread_count || 0;
            renderNotificationsDrawer();
        }
    } catch (e) {}
}

// ============================================================================
// FAILURE CATEGORIZATION UI (FORM & CATALOG)
// ============================================================================

function getCategoryMeta(code) {
    const found = state.categories.find(c => c.code === code);
    if (found) return found;
    return { code: code || 'NO_SABE', name: code || 'Por Diagnosticar', color: '#71717a', icon: 'fa-circle-question', subcategories_list: [] };
}

function renderFailureCategorySelector(selectedCode) {
    const hiddenInput = document.getElementById('form-failure-type');
    const currentCode = selectedCode || (hiddenInput ? hiddenInput.value : 'MECANICA');
    if (hiddenInput) hiddenInput.value = currentCode;

    const grid = document.getElementById('form-failure-categories-grid');
    if (!grid) return;

    grid.innerHTML = state.categories.map(cat => {
        const isSelected = cat.code === currentCode;
        return `
            <button type="button" onclick="selectFailureCategory('${cat.code}')"
                class="p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                    isSelected
                        ? 'bg-zinc-900 border-purple-500 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500/40'
                        : 'bg-zinc-950/70 border-white/[0.07] hover:border-white/20'
                }">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs"
                     style="background-color: ${cat.color}22; color: ${cat.color}; border: 1px solid ${cat.color}44;">
                    <i class="fa-solid ${cat.icon || 'fa-tag'}"></i>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${cat.color}"></span>
                        <p class="text-xs font-bold text-white truncate">${cat.name}</p>
                    </div>
                    <p class="text-[10px] text-zinc-400 truncate mt-0.5">${(cat.subcategories_list || []).slice(0, 2).join(', ') || cat.description}</p>
                </div>
            </button>
        `;
    }).join('');

    renderSubcategoryChips(currentCode);
}

function selectFailureCategory(code) {
    const subInput = document.getElementById('form-failure-subcategory');
    if (subInput) subInput.value = '';
    renderFailureCategorySelector(code);
}

function renderSubcategoryChips(code) {
    const cat = getCategoryMeta(code);
    const chipsContainer = document.getElementById('form-subcategory-chips');
    const subInput = document.getElementById('form-failure-subcategory');
    if (!chipsContainer) return;

    const subcats = cat.subcategories_list || [];
    const currentSub = subInput ? subInput.value : '';

    chipsContainer.innerHTML = subcats.map(sub => {
        const active = currentSub === sub;
        return `
            <button type="button" onclick="selectSubcategoryChip('${sub.replace(/'/g, "\\'")}')"
                class="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                    active
                        ? 'bg-purple-600 text-white border-purple-400'
                        : 'bg-zinc-900 text-zinc-300 border-white/10 hover:border-white/25'
                }">
                ${sub}
            </button>
        `;
    }).join('');
}

function selectSubcategoryChip(subName) {
    const subInput = document.getElementById('form-failure-subcategory');
    if (subInput) subInput.value = subName;
    const currentCode = document.getElementById('form-failure-type')?.value || 'MECANICA';
    renderSubcategoryChips(currentCode);
}

function populateFilterCategories() {
    const fSelect = document.getElementById('filter-failure');
    if (fSelect) {
        const curr = fSelect.value;
        fSelect.innerHTML = '<option value="">Todas las Categorías</option>' +
            state.categories.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
        if (curr) fSelect.value = curr;
    }

    const modalCatSelect = document.getElementById('modal-boss-failure-type');
    if (modalCatSelect) {
        modalCatSelect.innerHTML = state.categories.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
    }
}

function renderCategoriesGrid() {
    const grid = document.getElementById('categories-grid');
    if (!grid) return;

    grid.innerHTML = state.categories.map(cat => {
        const subs = (cat.subcategories_list || []).map(s =>
            `<span class="px-2 py-0.5 rounded-md bg-zinc-900 border border-white/[0.07] text-[11px] text-zinc-300">${s}</span>`
        ).join('');

        return `
            <div class="cf-card rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex items-start justify-between gap-2 mb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-base"
                                 style="background-color: ${cat.color}20; color: ${cat.color}; border: 1px solid ${cat.color}40;">
                                <i class="fa-solid ${cat.icon || 'fa-tag'}"></i>
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${cat.color}"></span>
                                    <h3 class="text-sm font-bold text-white">${cat.name}</h3>
                                </div>
                                <span class="text-[10px] font-mono text-zinc-500">${cat.code}</span>
                            </div>
                        </div>
                        <button onclick="openCategoryModal(${cat.id})" class="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                    <p class="text-xs text-zinc-400 mb-3">${cat.description || ''}</p>
                    <div>
                        <p class="text-[10px] uppercase font-bold text-zinc-500 mb-1.5">Subcategorías registradas:</p>
                        <div class="flex flex-wrap gap-1.5">${subs || '<span class="text-xs text-zinc-500">Sin subcategorías</span>'}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openCategoryModal(catId = null) {
    const modal = document.getElementById('category-modal');
    const title = document.getElementById('category-modal-title');
    document.getElementById('category-edit-id').value = catId || '';

    if (catId) {
        const cat = state.categories.find(c => c.id == catId);
        if (cat) {
            title.textContent = `Editar Categoría: ${cat.name}`;
            document.getElementById('category-name-input').value = cat.name;
            document.getElementById('category-color-input').value = cat.color || '#8b5cf6';
            document.getElementById('category-icon-input').value = cat.icon || 'fa-bolt';
            document.getElementById('category-subcats-input').value = (cat.subcategories_list || []).join(', ');
            document.getElementById('category-desc-input').value = cat.description || '';
        }
    } else {
        title.textContent = 'Nueva Categoría de Falla';
        document.getElementById('category-name-input').value = '';
        document.getElementById('category-color-input').value = '#8b5cf6';
        document.getElementById('category-subcats-input').value = '';
        document.getElementById('category-desc-input').value = '';
    }
    if (modal) modal.classList.remove('hidden');
}

function closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) modal.classList.add('hidden');
}

async function saveCategoryForm(e) {
    e.preventDefault();
    const editId = document.getElementById('category-edit-id').value;
    const payload = {
        name: document.getElementById('category-name-input').value.trim(),
        color: document.getElementById('category-color-input').value,
        icon: document.getElementById('category-icon-input').value,
        subcategories: document.getElementById('category-subcats-input').value,
        description: document.getElementById('category-desc-input').value.trim()
    };

    const url = editId ? `/api/categories/${editId}` : '/api/categories';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        closeCategoryModal();
        await loadCategories();
        renderCategoriesGrid();
        showToast('Categoría de falla guardada', 'success');
    } else {
        showToast('Error al guardar categoría', 'error');
    }
}

// ============================================================================
// OPERATOR QR REPORT & CAMERA SCANNER
// ============================================================================

function populateFormDropdowns() {
    const mSelect = document.getElementById('form-machine-id');
    if (mSelect) {
        const curr = mSelect.value;
        mSelect.innerHTML = '<option value="">-- Selecciona o toca una máquina arriba --</option>' +
            state.machines.map(m => `<option value="${m.id}">${m.code} - ${m.name} (${m.location})</option>`).join('');
        if (curr) mSelect.value = curr;
    }

    const tSelect = document.getElementById('form-technician-id');
    if (tSelect) {
        const curr = tSelect.value;
        tSelect.innerHTML = '<option value="">-- Sin asignar aún --</option>' +
            state.technicians.map(t => `<option value="${t.id}">${t.name} (${t.specialty || t.role})</option>`).join('');
        if (curr) tSelect.value = curr;
    }

    const planMachineSelect = document.getElementById('plan-machine-input');
    if (planMachineSelect) {
        planMachineSelect.innerHTML = state.machines.map(m => `<option value="${m.id}">${m.code} - ${m.name}</option>`).join('');
    }

    const planTechSelect = document.getElementById('plan-tech-input');
    if (planTechSelect) {
        planTechSelect.innerHTML = '<option value="">-- Sin asignar --</option>' +
            state.technicians.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
}

function populateFilterMachines() {
    const fSelect = document.getElementById('filter-machine');
    if (fSelect) {
        const curr = fSelect.value;
        fSelect.innerHTML = '<option value="">Todas las Máquinas</option>' +
            state.machines.map(m => `<option value="${m.id}">${m.code} - ${m.name}</option>`).join('');
        if (curr) fSelect.value = curr;
    }
}

function renderQuickMachineChips() {
    const container = document.getElementById('quick-machine-chips');
    if (!container) return;

    const currentSelectedId = document.getElementById('form-machine-id')?.value;
    container.innerHTML = state.machines.map(m => {
        const isSelected = String(m.id) === String(currentSelectedId);
        return `
            <button type="button" onclick="preselectMachine(${m.id})"
                class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                    isSelected
                        ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-500/20'
                        : 'bg-zinc-900/90 text-zinc-300 border-white/10 hover:border-purple-500/40 hover:text-white'
                }">
                <i class="fa-solid fa-industry text-[11px]"></i>
                <span>${m.code}: ${m.name}</span>
            </button>
        `;
    }).join('');
}

function onMachineSelectChange(val) {
    if (val) preselectMachine(val);
    else {
        const info = document.getElementById('form-machine-info');
        if (info) info.classList.add('hidden');
        renderQuickMachineChips();
    }
}

function preselectMachine(machineId) {
    const mSelect = document.getElementById('form-machine-id');
    if (mSelect) {
        mSelect.value = machineId;
        const machine = state.machines.find(m => m.id == machineId);
        if (machine) {
            const info = document.getElementById('form-machine-info');
            const infoText = document.getElementById('form-machine-info-text');
            if (info && infoText) {
                infoText.textContent = `${machine.code} - ${machine.name} (${machine.brand || ''} ${machine.model || ''} • ${machine.location})`;
                info.classList.remove('hidden');
            }
        }
    }
    renderQuickMachineChips();
}

function preselectMachineByCode(machineCode) {
    const machine = state.machines.find(m => m.code.toUpperCase() === machineCode.toUpperCase());
    if (machine) preselectMachine(machine.id);
}

function setCurrentDateTime() {
    const now = new Date();
    const dateInput = document.getElementById('form-date');
    const timeInput = document.getElementById('form-time');
    if (dateInput) {
        dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    if (timeInput) {
        timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
}

function toggleQrScanner() {
    const container = document.getElementById('qr-scanner-container');
    if (!container) return;
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        startQrScanner();
    } else {
        stopQrScanner();
    }
}

function startQrScanner() {
    if (typeof Html5Qrcode === 'undefined') {
        showToast('Librería de cámara no disponible', 'error');
        return;
    }
    state.html5QrCode = new Html5Qrcode("qr-reader");
    state.html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
            stopQrScanner();
            try {
                const url = new URL(decodedText);
                const mId = url.searchParams.get('machine_id') || url.searchParams.get('machine');
                const mCode = url.searchParams.get('machine_code');
                if (mId) preselectMachine(mId);
                else if (mCode) preselectMachineByCode(mCode);
                else preselectMachineByCode(decodedText.trim());
            } catch (e) {
                preselectMachineByCode(decodedText.trim());
            }
            showToast('Código QR de máquina detectado', 'success');
        },
        () => {}
    ).catch(() => {
        showToast('No se pudo acceder a la cámara. Selecciona la máquina en los botones.', 'warning');
    });
}

function stopQrScanner() {
    const container = document.getElementById('qr-scanner-container');
    if (container) container.classList.add('hidden');
    if (state.html5QrCode) {
        state.html5QrCode.stop().then(() => state.html5QrCode.clear()).catch(() => {});
        state.html5QrCode = null;
    }
}

async function submitIncidentReport(e) {
    e.preventDefault();
    const machineId = document.getElementById('form-machine-id').value;
    const operatorName = document.getElementById('form-operator-name').value.trim();
    const reportDate = document.getElementById('form-date').value;
    const reportTime = document.getElementById('form-time').value;
    const failureType = document.getElementById('form-failure-type').value;
    const failureSubcategory = document.getElementById('form-failure-subcategory').value.trim();
    const machineStopped = document.querySelector('input[name="machine_stopped"]:checked')?.value === '1';
    const description = document.getElementById('form-description').value.trim();

    if (!machineId) {
        showToast('Selecciona la máquina afectada', 'error');
        return;
    }

    const isBoss = state.role === 'JEFE' && !!state.bossUser;
    const payload = {
        machine_id: parseInt(machineId),
        operator_name: operatorName,
        report_date: reportDate,
        report_time: reportTime,
        failure_type: failureType,
        failure_subcategory: failureSubcategory,
        machine_stopped: machineStopped,
        description,
        is_boss: isBoss
    };

    if (isBoss) {
        payload.maintenance_type = document.getElementById('form-maintenance-type').value;
        payload.technician_id = document.getElementById('form-technician-id').value || null;
        payload.priority = document.getElementById('form-priority').value;
    }

    const btn = document.getElementById('btn-submit-report');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`✅ Orden ${data.order_number} registrada. Jefes y Técnicos notificados.`, 'success');
            document.getElementById('form-description').value = '';
            document.getElementById('form-failure-subcategory').value = '';
            await loadAllData();
            if (state.role !== 'OPERARIO') {
                navigateTo('orders');
            }
        } else {
            showToast(data.error || 'Error al registrar reporte', 'error');
        }
    } catch (err) {
        showToast('Error de red al enviar reporte', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================================
// VIEW 2: DAMAGED MACHINES BANNER & ORDERS LIST (TÉCNICO & JEFE)
// ============================================================================

function renderDamagedMachinesBanner() {
    const grid = document.getElementById('damaged-machines-grid');
    if (!grid) return;

    const damagedMachines = state.machines.filter(m => m.status !== 'OPERATIVA');
    if (damagedMachines.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3 text-emerald-300 text-xs">
                <i class="fa-solid fa-circle-check text-lg"></i>
                <div>
                    <p class="font-bold">Todas las máquinas están OPERATIVAS en este momento</p>
                    <p class="text-[11px] text-emerald-400/80">No hay equipos reportados como detenidos o en falla activa.</p>
                </div>
            </div>
        `;
        return;
    }

    grid.innerHTML = damagedMachines.map(m => {
        const activeOrder = state.orders.find(o => o.machine_id == m.id && o.status !== 'FINALIZADO');
        const isStopped = m.status === 'PARADA' || (activeOrder && activeOrder.machine_stopped);
        const cat = activeOrder ? getCategoryMeta(activeOrder.failure_type) : null;

        return `
            <div class="p-4 rounded-2xl bg-zinc-950/90 border ${isStopped ? 'border-rose-500/40' : 'border-amber-500/40'} flex flex-col justify-between gap-3">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-200">${m.code}</span>
                            <h3 class="text-sm font-bold text-white">${m.name}</h3>
                        </div>
                        <p class="text-[11px] text-zinc-400 mt-0.5">${m.location} • ${m.brand || ''} ${m.model || ''}</p>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        isStopped ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }">
                        ${isStopped ? '🛑 MÁQUINA PARADA' : '⚠️ EN MANTENIMIENTO'}
                    </span>
                </div>

                ${activeOrder ? `
                    <div class="p-3 rounded-xl bg-zinc-900/90 border border-white/[0.06] text-xs space-y-1">
                        <div class="flex items-center justify-between">
                            <span class="font-mono font-bold text-purple-300">${activeOrder.order_number}</span>
                            <span class="text-[11px]" style="color:${cat?.color || '#a1a1aa'}">
                                ● ${cat?.name || activeOrder.failure_type} ${activeOrder.failure_subcategory ? `(${activeOrder.failure_subcategory})` : ''}
                            </span>
                        </div>
                        <p class="text-zinc-300 line-clamp-2">${activeOrder.description}</p>
                        <div class="flex items-center justify-between pt-1 text-[11px] text-zinc-400">
                            <span>Técnico: <strong class="text-white">${activeOrder.technician_name || 'Sin asignar'}</strong></span>
                            <span class="font-mono text-emerald-400 font-bold order-live-timer" data-order-id="${activeOrder.id}">
                                ${formatSecondsToHHMMSS(activeOrder.current_live_duration_seconds || 0)}
                            </span>
                        </div>
                    </div>
                ` : ''}

                <div class="flex flex-wrap items-center gap-2 pt-1">
                    ${activeOrder ? `
                        <button onclick="openOrderModal(${activeOrder.id})" class="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5">
                            <i class="fa-solid fa-stopwatch"></i> Atender / Cronómetro
                        </button>
                    ` : ''}
                    <button onclick="openMachineDossier(${m.id})" class="py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-semibold flex items-center gap-1.5">
                        <i class="fa-solid fa-book-medical text-purple-400"></i> Hoja de Vida
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadOrdersList(render = true) {
    const status = document.getElementById('filter-status')?.value || '';
    const machineId = document.getElementById('filter-machine')?.value || '';
    const failure = document.getElementById('filter-failure')?.value || '';
    const search = document.getElementById('filter-search')?.value || '';

    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (machineId) params.append('machine_id', machineId);
    if (failure) params.append('failure', failure);
    if (search) params.append('search', search);

    try {
        const res = await fetch(`/api/orders?${params.toString()}`);
        if (res.ok) {
            state.orders = await res.json();
        }
    } catch (e) {}

    const activeCount = state.orders.filter(o => o.status !== 'FINALIZADO').length;
    const badge = document.getElementById('badge-active-orders');
    if (badge) badge.textContent = activeCount;

    if (render) {
        renderOrdersTable('all-orders-tbody', state.orders);
        renderDamagedMachinesBanner();
    }
    updateTopTogglTimerBar();
}

function renderOrdersTable(tbodyId, ordersList) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!ordersList || ordersList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-4 py-8 text-center text-zinc-500 text-xs">
                    No se encontraron órdenes de mantenimiento con los filtros actuales.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = ordersList.map(o => {
        const cat = getCategoryMeta(o.failure_type);
        const isRunning = Boolean(o.is_timer_running);
        const isFinished = o.status === 'FINALIZADO';
        const durSec = o.current_live_duration_seconds || o.repair_duration_seconds || 0;

        return `
            <tr onclick="openOrderModal(${o.id})" class="hover:bg-[#11141c] cursor-pointer transition-colors ${isRunning ? 'bg-[#160d1f]/60 border-l-2 border-l-[#e57cd8]' : ''}">
                <td class="px-5 py-3.5">
                    <div class="flex items-center gap-2">
                        <span class="font-mono font-bold text-[#2CD5FF]">${o.order_number}</span>
                        <span class="text-xs font-semibold text-white truncate max-w-[220px]">${o.description || 'Sin descripción'}</span>
                    </div>
                    <div class="text-[10px] text-zinc-500 font-mono mt-0.5">${o.report_date} • ${o.report_time} • Rep: ${o.operator_name}</div>
                </td>
                <td class="px-4 py-3.5">
                    <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                        <span class="w-2 h-2 rounded-full bg-[#e57cd8]"></span>
                        <span class="font-bold text-white text-xs">${o.machine_name || ''}</span>
                        <span class="text-[10px] font-mono text-zinc-400">${o.machine_code || ''}</span>
                    </div>
                </td>
                <td class="px-4 py-3.5">
                    <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                         style="background-color: ${cat.color}18; color: ${cat.color}; border: 1px solid ${cat.color}35;">
                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${cat.color}"></span>
                        <span>${cat.name}</span>
                    </div>
                    ${o.failure_subcategory ? `<div class="text-[10px] text-zinc-400 mt-0.5 font-mono">${o.failure_subcategory}</div>` : ''}
                </td>
                <td class="px-4 py-3.5">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-900 border border-white/10 text-zinc-300">
                        ${o.maintenance_type || 'CORRECTIVO'}
                    </span>
                </td>
                <td class="px-4 py-3.5">
                    ${o.machine_stopped
                        ? `<span class="text-rose-400 font-bold text-[11px] font-mono flex items-center gap-1"><i class="fa-solid fa-octagon-exclamation"></i> PARADA (${o.current_live_downtime_minutes || o.total_downtime_minutes || 0}m)</span>`
                        : `<span class="text-emerald-400 text-[11px] font-mono">● OPERANDO</span>`
                    }
                </td>
                <td class="px-4 py-3.5">
                    ${o.technician_name
                        ? `<span class="text-zinc-200 font-semibold">${o.technician_name}</span>`
                        : `<span class="text-amber-400/80 text-[11px] italic">Sin asignar</span>`
                    }
                </td>
                <td class="px-4 py-3.5">
                    <div class="flex items-center gap-2">
                        ${getStatusBadgeHTML(o.status)}
                        <span class="font-mono text-sm font-extrabold ${isRunning ? 'text-[#e57cd8]' : 'text-zinc-200'} order-live-timer" data-order-id="${o.id}">
                            ${formatSecondsToHHMMSS(durSec)}
                        </span>
                    </div>
                </td>
                <td class="px-5 py-3.5 text-right" onclick="event.stopPropagation()">
                    <div class="inline-flex items-center gap-2">
                        ${!isFinished ? `
                            <button onclick="quickToggleOrderTimer(${o.id}, ${isRunning})"
                                class="${isRunning ? 'toggl-stop-btn' : 'toggl-play-btn'} !w-8 !h-8"
                                title="${isRunning ? 'Pausar Timer' : 'Iniciar Timer (Toggl)'}">
                                <i class="fa-solid ${isRunning ? 'fa-pause' : 'fa-play'} text-[10px]"></i>
                            </button>
                        ` : ''}
                        <button onclick="openOrderModal(${o.id})" class="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-zinc-200 text-xs font-mono border border-white/10 transition-all">
                            Detalle
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function quickToggleOrderTimer(orderId, currentlyRunning) {
    const endpoint = currentlyRunning ? `/api/orders/${orderId}/timer/pause` : `/api/orders/${orderId}/timer/start`;
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    if (res.ok) {
        showToast(currentlyRunning ? '⏸️ Timer pausado' : '▶️ Timer Toggl iniciado', currentlyRunning ? 'info' : 'success');
        await loadAllData();
    }
}

function getStatusBadgeHTML(status) {
    const map = {
        PENDIENTE: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        EN_PROCESO: 'bg-[#e57cd8]/20 text-[#e57cd8] border-[#e57cd8]/40',
        PAUSADO: 'bg-[#2CD5FF]/15 text-[#2CD5FF] border-[#2CD5FF]/30',
        FINALIZADO: 'bg-zinc-800 text-zinc-400 border-white/10'
    };
    const cls = map[status] || map.PENDIENTE;
    return `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${cls}">${status}</span>`;
}

// ============================================================================
// TOGGL TRACK LIVE TIMER BAR & ORDER MODAL
// ============================================================================

function updateTopTogglTimerBar() {
    const runningOrder = state.orders.find(o => o.is_timer_running);
    const header = document.getElementById('top-header-bar');
    const dot = document.getElementById('toggl-bar-dot');
    const label = document.getElementById('toggl-bar-label');
    const clock = document.getElementById('toggl-bar-clock');
    const btn = document.getElementById('toggl-bar-action-btn');
    const btnIcon = document.getElementById('toggl-bar-btn-icon');

    if (!dot || !label || !clock) return;

    if (runningOrder) {
        if (header) header.classList.add('timer-running');
        dot.className = 'w-2.5 h-2.5 rounded-full bg-[#e57cd8] timer-pulse';
        label.innerHTML = `<strong class="text-[#2CD5FF] font-mono">${runningOrder.order_number}</strong> <span class="text-white font-semibold mx-1">● ${runningOrder.machine_name}</span> <span class="text-zinc-400 text-[11px]">${runningOrder.description || ''}</span>`;
        clock.textContent = formatSecondsToHHMMSS(runningOrder.current_live_duration_seconds || 0);
        clock.className = 'font-mono text-base font-black text-[#e57cd8] tracking-tight';
        if (btn) {
            btn.className = 'toggl-stop-btn !w-8 !h-8';
            btn.dataset.orderId = runningOrder.id;
        }
        if (btnIcon) btnIcon.className = 'fa-solid fa-stop text-xs';
    } else {
        if (header) header.classList.remove('timer-running');
        dot.className = 'w-2.5 h-2.5 rounded-full bg-zinc-600';
        label.textContent = '¿Qué máquina estás interviniendo? — Haz clic en ▶ en una orden para iniciar Timer';
        clock.textContent = '00:00:00';
        clock.className = 'font-mono text-base font-bold text-zinc-500 tracking-tight';
        if (btn) {
            btn.className = 'toggl-play-btn !w-8 !h-8';
            const firstPending = state.orders.find(o => o.status !== 'FINALIZADO');
            btn.dataset.orderId = firstPending ? firstPending.id : '';
        }
        if (btnIcon) btnIcon.className = 'fa-solid fa-play text-xs';
    }
}

function openRunningOrderFromBar() {
    const btn = document.getElementById('toggl-bar-action-btn');
    const orderId = btn?.dataset?.orderId;
    if (orderId) openOrderModal(parseInt(orderId));
}

function tickLiveClocks() {
    state.orders.forEach(o => {
        if (o.is_timer_running) {
            o.current_live_duration_seconds = (o.current_live_duration_seconds || 0) + 1;
            document.querySelectorAll(`.order-live-timer[data-order-id="${o.id}"]`).forEach(el => {
                el.textContent = formatSecondsToHHMMSS(o.current_live_duration_seconds);
            });
        }
    });

    if (state.activeOrder && state.activeOrder.is_timer_running) {
        state.activeOrder.current_live_duration_seconds = (state.activeOrder.current_live_duration_seconds || 0) + 1;
        const modalTimer = document.getElementById('modal-live-timer');
        if (modalTimer) modalTimer.textContent = formatSecondsToHHMMSS(state.activeOrder.current_live_duration_seconds);
    }

    updateTopTogglTimerBar();
}

function formatSecondsToHHMMSS(totalSec) {
    const sec = Math.max(0, Math.floor(totalSec || 0));
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

async function openOrderModal(orderId) {
    try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (res.ok) {
            state.activeOrder = await res.json();
        } else {
            state.activeOrder = state.orders.find(o => o.id == orderId);
        }
    } catch (e) {
        state.activeOrder = state.orders.find(o => o.id == orderId);
    }

    const o = state.activeOrder;
    if (!o) return;

    const isBoss = state.role === 'JEFE' && !!state.bossUser;

    document.getElementById('modal-order-number').textContent = o.order_number;
    document.getElementById('modal-order-status').textContent = o.status;
    document.getElementById('modal-order-status').className = `text-xs px-2.5 py-1 rounded-full font-bold ${
        o.status === 'FINALIZADO' ? 'bg-zinc-800 text-zinc-300' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
    }`;

    document.getElementById('modal-machine-name').textContent = `${o.machine_code || ''} - ${o.machine_name || ''}`;
    document.getElementById('modal-machine-location').textContent = o.machine_location || '';
    document.getElementById('modal-operator').textContent = o.operator_name;
    document.getElementById('modal-datetime').textContent = `${o.report_date} a las ${o.report_time}`;
    document.getElementById('modal-description').textContent = o.description;

    const cat = getCategoryMeta(o.failure_type);
    const failBadge = document.getElementById('modal-failure-badge');
    failBadge.textContent = `${cat.name}${o.failure_subcategory ? ` • ${o.failure_subcategory}` : ''}`;
    failBadge.style.backgroundColor = `${cat.color}25`;
    failBadge.style.color = cat.color;

    const stopBadge = document.getElementById('modal-stopped-badge');
    if (o.machine_stopped) {
        stopBadge.textContent = '🛑 Máquina Parada';
        stopBadge.className = 'text-xs px-2 py-0.5 rounded font-semibold bg-rose-500/20 text-rose-300';
    } else {
        stopBadge.textContent = '▶️ Máquina Operando';
        stopBadge.className = 'text-xs px-2 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-300';
    }

    // Boss classification box vs Technician read-only info
    const bossBox = document.getElementById('modal-boss-classification-box');
    const techReadonly = document.getElementById('modal-tech-readonly-info');
    if (bossBox) bossBox.classList.toggle('hidden', !isBoss);
    if (techReadonly) techReadonly.classList.toggle('hidden', isBoss);

    document.getElementById('modal-readonly-maint-type').textContent = o.maintenance_type || 'CORRECTIVO';
    document.getElementById('modal-readonly-tech-name').textContent = o.technician_name || 'Sin asignar';

    // Populate Boss selects
    const assignSelect = document.getElementById('modal-assign-tech');
    if (assignSelect) {
        assignSelect.innerHTML = '<option value="">-- Sin asignar --</option>' +
            state.technicians.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        assignSelect.value = o.technician_id || '';
    }
    const maintSelect = document.getElementById('modal-boss-maint-type');
    if (maintSelect) maintSelect.value = o.maintenance_type || 'CORRECTIVO';

    const catSelect = document.getElementById('modal-boss-failure-type');
    if (catSelect) {
        catSelect.innerHTML = state.categories.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
        catSelect.value = o.failure_type || 'MECANICA';
    }

    // Timer & Notes
    document.getElementById('modal-live-timer').textContent = formatSecondsToHHMMSS(o.current_live_duration_seconds || o.repair_duration_seconds || 0);
    document.getElementById('modal-spare-parts-notes').value = o.spare_parts_notes || '';
    document.getElementById('modal-diagnosis').value = o.diagnosis || '';
    document.getElementById('modal-solution').value = o.solution_notes || '';

    renderOrderPartsList(o.parts || []);

    const isFinished = o.status === 'FINALIZADO';
    document.getElementById('btn-timer-start').classList.toggle('hidden', isFinished || Boolean(o.is_timer_running));
    document.getElementById('btn-timer-pause').classList.toggle('hidden', isFinished || !o.is_timer_running);
    document.getElementById('btn-finish-order').classList.toggle('hidden', isFinished);

    document.getElementById('order-detail-modal').classList.remove('hidden');
}

function closeOrderModal() {
    document.getElementById('order-detail-modal').classList.add('hidden');
    state.activeOrder = null;
}

async function saveBossOrderClassification() {
    if (!state.activeOrder) return;
    const payload = {
        maintenance_type: document.getElementById('modal-boss-maint-type').value,
        technician_id: document.getElementById('modal-assign-tech').value || null,
        failure_type: document.getElementById('modal-boss-failure-type').value
    };

    const res = await fetch(`/api/orders/${state.activeOrder.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        showToast('Clasificación de Jefe y Técnico guardados', 'success');
        await loadAllData();
        await openOrderModal(state.activeOrder.id);
    }
}

async function startOrderTimer() {
    if (!state.activeOrder) return;
    const res = await fetch(`/api/orders/${state.activeOrder.id}/timer/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    if (res.ok) {
        showToast('⏱️ Cronómetro de reparación iniciado', 'success');
        await loadAllData();
        await openOrderModal(state.activeOrder.id);
    }
}

async function pauseOrderTimer() {
    if (!state.activeOrder) return;
    const res = await fetch(`/api/orders/${state.activeOrder.id}/timer/pause`, { method: 'POST' });
    if (res.ok) {
        showToast('⏸️ Cronómetro pausado', 'info');
        await loadAllData();
        await openOrderModal(state.activeOrder.id);
    }
}

async function saveOrderProgress() {
    if (!state.activeOrder) return;
    const payload = {
        spare_parts_notes: document.getElementById('modal-spare-parts-notes').value,
        diagnosis: document.getElementById('modal-diagnosis').value,
        solution_notes: document.getElementById('modal-solution').value
    };
    const res = await fetch(`/api/orders/${state.activeOrder.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        showToast('Avance técnico guardado en la nube', 'success');
        await loadAllData();
    }
}

async function finishMaintenanceOrder() {
    if (!state.activeOrder) return;
    const payload = {
        spare_parts_notes: document.getElementById('modal-spare-parts-notes').value,
        diagnosis: document.getElementById('modal-diagnosis').value,
        solution_notes: document.getElementById('modal-solution').value
    };
    const res = await fetch(`/api/orders/${state.activeOrder.id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        const data = await res.json();
        showToast(`✅ Orden cerrada. Tiempo total: ${data.repair_duration_minutes} min. Hoja de Vida actualizada.`, 'success');
        closeOrderModal();
        await loadAllData();
    }
}

function renderOrderPartsList(parts) {
    const container = document.getElementById('modal-parts-list');
    if (!container) return;
    if (!parts || parts.length === 0) {
        container.innerHTML = '<p class="text-[11px] text-zinc-500">No se han registrado repuestos individuales aún.</p>';
        return;
    }
    container.innerHTML = parts.map(p => `
        <div class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/5 text-xs">
            <span><strong class="text-white">${p.part_name}</strong> <span class="text-zinc-400 font-mono">x${p.quantity} ${p.unit || ''}</span></span>
            <button type="button" onclick="deleteOrderPart(${p.id})" class="text-rose-400 hover:text-rose-300 text-[11px]">Eliminar</button>
        </div>
    `).join('');
}

async function addPartToOrder() {
    if (!state.activeOrder) return;
    const nameInput = document.getElementById('part-name-input');
    const qtyInput = document.getElementById('part-qty-input');
    const part_name = nameInput.value.trim();
    const quantity = parseFloat(qtyInput.value || 1);
    if (!part_name) return;

    const res = await fetch(`/api/orders/${state.activeOrder.id}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_name, quantity })
    });
    if (res.ok) {
        nameInput.value = '';
        qtyInput.value = '1';
        await openOrderModal(state.activeOrder.id);
    }
}

async function deleteOrderPart(partId) {
    if (!state.activeOrder) return;
    await fetch(`/api/parts/${partId}`, { method: 'DELETE' });
    await openOrderModal(state.activeOrder.id);
}

// ============================================================================
// VIEW 3: MACHINES, HOJAS DE VIDA (DOSSIERS) & QR CODES
// ============================================================================

function renderMachinesGrid() {
    const grid = document.getElementById('all-qr-cards-grid');
    if (!grid) return;

    const isBoss = state.role === 'JEFE' && !!state.bossUser;
    const baseUrl = state.settings.qr_base_url || window.location.origin;

    grid.innerHTML = state.machines.map(m => {
        const statusColors = {
            OPERATIVA: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
            EN_MANTENIMIENTO: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
            PARADA: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
        };
        const stCls = statusColors[m.status] || statusColors.OPERATIVA;

        return `
            <div class="cf-card print-qr-sticker rounded-2xl p-5 flex flex-col justify-between space-y-5">
                <div class="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div class="space-y-2 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="px-2.5 py-0.5 rounded-md font-mono text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">${m.code}</span>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${stCls}">${m.status}</span>
                            <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-400 border border-white/5">Criticidad: ${m.criticality || 'ALTA'}</span>
                        </div>
                        <h3 class="text-lg font-extrabold text-white">${m.name}</h3>
                        <p class="text-xs text-zinc-400"><i class="fa-solid fa-location-dot text-purple-400 mr-1"></i> ${m.location}</p>
                        
                        <!-- Technical Hoja de Vida Preview -->
                        <div class="grid grid-cols-2 gap-2 pt-2 text-[11px] bg-zinc-950/60 p-3 rounded-xl border border-white/[0.05]">
                            <div><span class="text-zinc-500">Marca/Modelo:</span> <strong class="text-zinc-200 block truncate">${m.brand || '-'} ${m.model || ''}</strong></div>
                            <div><span class="text-zinc-500">Serie:</span> <strong class="text-zinc-200 font-mono block truncate">${m.serial_number || '-'}</strong></div>
                            <div><span class="text-zinc-500">Potencia:</span> <strong class="text-zinc-200 block truncate">${m.voltage || ''} ${m.power_kw || ''}</strong></div>
                            <div><span class="text-zinc-500">Próx. Preventivo:</span> <strong class="text-amber-400 font-mono block">${m.next_maintenance_date || 'Ver Plan 2027'}</strong></div>
                        </div>
                    </div>

                    <!-- QR Code Box -->
                    <div class="flex flex-col items-center bg-zinc-950/90 p-3 rounded-2xl border border-white/10 self-center sm:self-start">
                        <div id="qr-box-${m.id}" class="qr-container w-28 h-28 flex items-center justify-center"></div>
                        <span class="text-[10px] font-mono text-zinc-400 mt-1.5">Escanear Falla</span>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="pt-3 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-2 no-print">
                    <div class="flex flex-wrap items-center gap-2">
                        <button onclick="openMachineDossier(${m.id})" class="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-600/20">
                            <i class="fa-solid fa-book-medical"></i> Hoja de Vida
                        </button>
                        <button onclick="quickNotifyFromMachineCard(${m.id})" class="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5" title="Enviar Alerta de Hoja de Vida a Jefes y Técnicos">
                            <i class="fa-solid fa-bell"></i> Alerta
                        </button>
                        <button onclick="downloadMachineQR(${m.id}, '${m.code}')" class="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-semibold">
                            <i class="fa-solid fa-download"></i> QR
                        </button>
                    </div>

                    ${isBoss ? `
                        <div class="flex items-center gap-1.5">
                            <button onclick="openMachineModal(${m.id})" class="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs" title="Editar Máquina y Hoja de Vida">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button onclick="deleteMachine(${m.id})" class="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 text-xs" title="Eliminar Máquina">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Render QR codes
    setTimeout(() => {
        state.machines.forEach(m => {
            const container = document.getElementById(`qr-box-${m.id}`);
            if (container && typeof QRCode !== 'undefined') {
                container.innerHTML = '';
                const qrUrl = `${baseUrl}/?machine_id=${m.id}&machine_code=${encodeURIComponent(m.code)}#report`;
                new QRCode(container, {
                    text: qrUrl,
                    width: 104,
                    height: 104,
                    colorDark: "#09090b",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        });
    }, 60);
}

async function openMachineDossier(machineId) {
    state.activeDossierMachineId = machineId;
    const modal = document.getElementById('machine-dossier-modal');
    if (modal) modal.classList.remove('hidden');

    try {
        const res = await fetch(`/api/machines/${machineId}`);
        if (!res.ok) return;
        const data = await res.json();
        const m = data.machine;
        const kpis = data.kpis || {};

        document.getElementById('dossier-code').textContent = m.code;
        document.getElementById('dossier-name').textContent = `Hoja de Vida: ${m.name}`;
        document.getElementById('dossier-subtitle').textContent = `${m.location} • ${m.description || ''}`;
        document.getElementById('dossier-criticality').textContent = `CRITICIDAD ${m.criticality || 'ALTA'}`;

        document.getElementById('dossier-kpi-orders').textContent = kpis.total_orders || 0;
        document.getElementById('dossier-kpi-downtime').textContent = `${kpis.total_downtime_minutes || 0} min`;
        document.getElementById('dossier-kpi-mttr').textContent = `${kpis.mttr_minutes || 0} min`;
        document.getElementById('dossier-kpi-plans').textContent = kpis.plans_count || 0;

        document.getElementById('dossier-brand').textContent = m.brand || 'No especificado';
        document.getElementById('dossier-model').textContent = m.model || 'No especificado';
        document.getElementById('dossier-serial').textContent = m.serial_number || 'N/A';
        document.getElementById('dossier-install-date').textContent = m.install_date || 'N/A';
        document.getElementById('dossier-voltage').textContent = m.voltage || '220V / 440V';
        document.getElementById('dossier-power').textContent = m.power_kw || 'N/A';
        document.getElementById('dossier-supplier').textContent = m.supplier || 'N/A';
        document.getElementById('dossier-next-maint').textContent = m.next_maintenance_date || 'Ver Plan 2027';
        document.getElementById('dossier-critical-parts').textContent = m.critical_parts || 'Sin repuestos críticos listados';
        document.getElementById('dossier-life-notes').textContent = m.life_notes || m.description || 'Sin observaciones adicionales';

        // Render Plans in Dossier
        const plansEl = document.getElementById('dossier-plans-list');
        if (plansEl) {
            if (!data.plans || data.plans.length === 0) {
                plansEl.innerHTML = '<p class="text-xs text-zinc-500">No hay planes preventivos asociados aún.</p>';
            } else {
                plansEl.innerHTML = data.plans.map(p => `
                    <div class="p-3 rounded-xl bg-zinc-950 border border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div>
                            <span class="font-mono font-bold text-emerald-400 mr-2">${p.plan_code}</span>
                            <strong class="text-white">${p.title}</strong>
                            <span class="text-zinc-400 ml-2">(${p.frequency} • Año ${p.year})</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] font-mono text-zinc-400">Meses: ${(p.months || []).map(m => MONTH_NAMES_SHORT[m - 1]).join(', ')}</span>
                            <span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold text-[10px]">${p.technician_name || 'Sin asignar'}</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Render History in Dossier
        const histEl = document.getElementById('dossier-history-list');
        if (histEl) {
            if (!data.history || data.history.length === 0) {
                histEl.innerHTML = '<p class="text-xs text-zinc-500">Sin intervenciones registradas en la bitácora.</p>';
            } else {
                histEl.innerHTML = data.history.map(h => {
                    const cat = getCategoryMeta(h.failure_type);
                    return `
                        <div class="p-3.5 rounded-xl bg-zinc-950/90 border border-white/[0.07] space-y-1.5 text-xs">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-bold text-purple-400">${h.order_number}</span>
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-200">${h.maintenance_type}</span>
                                    <span class="text-[11px] font-semibold" style="color:${cat.color}">● ${cat.name} ${h.failure_subcategory ? `(${h.failure_subcategory})` : ''}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    ${getStatusBadgeHTML(h.status)}
                                    <span class="font-mono text-zinc-400">${h.report_date} ${h.report_time}</span>
                                </div>
                            </div>
                            <p class="text-zinc-300"><strong>Reporte:</strong> ${h.description}</p>
                            ${h.diagnosis ? `<p class="text-zinc-400"><strong>Diagnóstico:</strong> ${h.diagnosis}</p>` : ''}
                            ${h.solution_notes ? `<p class="text-emerald-300/90"><strong>Solución aplicada:</strong> ${h.solution_notes}</p>` : ''}
                            <div class="flex flex-wrap items-center justify-between pt-1 text-[11px] text-zinc-400 border-t border-white/[0.04]">
                                <span>Técnico: <strong class="text-white">${h.technician_name || 'Sin asignar'}</strong></span>
                                <span>Repuestos: <strong class="text-zinc-200">${h.spare_parts_notes || 'Ninguno'}</strong></span>
                                <span class="font-mono">Duración: <strong class="text-emerald-400">${Math.round((h.repair_duration_seconds || 0) / 60)} min</strong></span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (e) {
        showToast('Error al cargar Hoja de Vida', 'error');
    }
}

function closeDossierModal() {
    document.getElementById('machine-dossier-modal').classList.add('hidden');
}

async function sendDossierNotification() {
    const machineId = state.activeDossierMachineId;
    if (!machineId) return;
    const msgInput = document.getElementById('dossier-alert-message');
    const targetSelect = document.getElementById('dossier-alert-target');
    const message = msgInput.value.trim();
    if (!message) {
        showToast('Escribe el mensaje de la alerta técnica', 'warning');
        return;
    }

    const res = await fetch(`/api/machines/${machineId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            target_role: targetSelect.value,
            severity: 'WARNING'
        })
    });
    if (res.ok) {
        msgInput.value = '';
        await loadNotifications();
        showToast('🔔 Alerta de Hoja de Vida enviada a Jefes y Técnicos', 'success');
    }
}

async function quickNotifyFromMachineCard(machineId) {
    const m = state.machines.find(x => x.id == machineId);
    if (!m) return;
    const msg = prompt(`Enviar alerta desde la Hoja de Vida de ${m.code} - ${m.name} a Jefes y Técnicos:`, `Revisión preventiva o anomalía detectada en ${m.name}`);
    if (!msg) return;

    const res = await fetch(`/api/machines/${machineId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: `🔔 Alerta Hoja de Vida: ${m.code} - ${m.name}`,
            message: msg,
            target_role: 'ALL',
            severity: 'WARNING'
        })
    });
    if (res.ok) {
        await loadNotifications();
        showToast('Notificación enviada a Jefes y Técnicos', 'success');
    }
}

function openMachineModal(machineId = null) {
    const modal = document.getElementById('machine-modal');
    document.getElementById('machine-edit-id').value = machineId || '';
    if (machineId) {
        const m = state.machines.find(x => x.id == machineId);
        if (m) {
            document.getElementById('machine-modal-title').textContent = `Editar Hoja de Vida: ${m.code}`;
            document.getElementById('machine-code-input').value = m.code || '';
            document.getElementById('machine-name-input').value = m.name || '';
            document.getElementById('machine-location-input').value = m.location || '';
            document.getElementById('machine-status-input').value = m.status || 'OPERATIVA';
            document.getElementById('machine-criticality-input').value = m.criticality || 'ALTA';
            document.getElementById('machine-brand-input').value = m.brand || '';
            document.getElementById('machine-model-input').value = m.model || '';
            document.getElementById('machine-serial-input').value = m.serial_number || '';
            document.getElementById('machine-install-input').value = m.install_date || '';
            document.getElementById('machine-voltage-input').value = m.voltage || '';
            document.getElementById('machine-power-input').value = m.power_kw || '';
            document.getElementById('machine-supplier-input').value = m.supplier || '';
            document.getElementById('machine-next-maint-input').value = m.next_maintenance_date || '';
            document.getElementById('machine-parts-input').value = m.critical_parts || '';
            document.getElementById('machine-desc-input').value = m.life_notes || m.description || '';
        }
    } else {
        document.getElementById('machine-modal-title').textContent = 'Nueva Máquina y Hoja de Vida';
        const nextNum = state.machines.length + 1;
        document.getElementById('machine-code-input').value = `MAQ-00${nextNum}`;
        document.getElementById('machine-name-input').value = `Máquina ${nextNum}`;
        document.getElementById('machine-location-input').value = 'Planta Principal';
        document.getElementById('machine-status-input').value = 'OPERATIVA';
        document.getElementById('machine-criticality-input').value = 'ALTA';
        document.getElementById('machine-brand-input').value = '';
        document.getElementById('machine-model-input').value = '';
        document.getElementById('machine-serial-input').value = '';
        document.getElementById('machine-install-input').value = '';
        document.getElementById('machine-voltage-input').value = '220V / 440V';
        document.getElementById('machine-power-input').value = '';
        document.getElementById('machine-supplier-input').value = '';
        document.getElementById('machine-next-maint-input').value = '2027-01-15';
        document.getElementById('machine-parts-input').value = '';
        document.getElementById('machine-desc-input').value = '';
    }
    if (modal) modal.classList.remove('hidden');
}

function closeMachineModal() {
    document.getElementById('machine-modal').classList.add('hidden');
}

async function saveMachineForm(e) {
    e.preventDefault();
    const editId = document.getElementById('machine-edit-id').value;
    const payload = {
        code: document.getElementById('machine-code-input').value.trim(),
        name: document.getElementById('machine-name-input').value.trim(),
        location: document.getElementById('machine-location-input').value.trim(),
        status: document.getElementById('machine-status-input').value,
        criticality: document.getElementById('machine-criticality-input').value,
        brand: document.getElementById('machine-brand-input').value.trim(),
        model: document.getElementById('machine-model-input').value.trim(),
        serial_number: document.getElementById('machine-serial-input').value.trim(),
        install_date: document.getElementById('machine-install-input').value,
        voltage: document.getElementById('machine-voltage-input').value.trim(),
        power_kw: document.getElementById('machine-power-input').value.trim(),
        supplier: document.getElementById('machine-supplier-input').value.trim(),
        next_maintenance_date: document.getElementById('machine-next-maint-input').value,
        critical_parts: document.getElementById('machine-parts-input').value.trim(),
        description: document.getElementById('machine-desc-input').value.trim(),
        life_notes: document.getElementById('machine-desc-input').value.trim()
    };

    const url = editId ? `/api/machines/${editId}` : '/api/machines';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        closeMachineModal();
        await loadAllData();
        renderMachinesGrid();
        showToast('Máquina y Hoja de Vida guardadas', 'success');
    } else {
        const err = await res.json();
        showToast(err.error || 'Error al guardar máquina', 'error');
    }
}

async function deleteMachine(machineId) {
    if (!confirm('¿Eliminar esta máquina y su historial asociado?')) return;
    const res = await fetch(`/api/machines/${machineId}`, { method: 'DELETE' });
    if (res.ok) {
        await loadAllData();
        renderMachinesGrid();
        showToast('Máquina eliminada', 'info');
    }
}

function downloadMachineQR(machineId, code) {
    const container = document.getElementById(`qr-box-${machineId}`);
    if (!container) return;
    const img = container.querySelector('img') || container.querySelector('canvas');
    if (!img) return;
    const src = img.src || img.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = src;
    a.download = `QR_${code}.png`;
    a.click();
}

// ============================================================================
// VIEW 4: MAINTENANCE PLANS & PREVENTIVE PLAN 2027
// ============================================================================

function renderPlansView() {
    const filterYear = document.getElementById('filter-plan-year')?.value || '';
    const isBoss = state.role === 'JEFE' && !!state.bossUser;

    let filteredPlans = state.plans || [];
    if (filterYear) {
        filteredPlans = filteredPlans.filter(p => String(p.year) === String(filterYear));
    }

    // 1. Render 2027 Annual Matrix
    const matrixTbody = document.getElementById('matrix-2027-tbody');
    if (matrixTbody) {
        if (filteredPlans.length === 0) {
            matrixTbody.innerHTML = `<tr><td colspan="13" class="px-4 py-6 text-center text-zinc-500">No hay planes programados para el filtro seleccionado.</td></tr>`;
        } else {
            matrixTbody.innerHTML = filteredPlans.map(p => {
                const monthsArr = p.months || [];
                const monthCells = MONTH_NAMES_SHORT.map((mName, idx) => {
                    const mNum = idx + 1;
                    const active = monthsArr.includes(mNum);
                    return `
                        <td class="px-1.5 py-2.5 text-center">
                            <button type="button"
                                onclick="${isBoss ? `togglePlanMonth2027(${p.id}, ${mNum})` : ''}"
                                class="month-cell w-8 h-7 rounded-lg font-mono text-[10px] font-bold inline-flex items-center justify-center border ${
                                    active
                                        ? 'bg-purple-600 text-white border-purple-400 shadow shadow-purple-500/30'
                                        : 'bg-zinc-900/70 text-zinc-600 border-white/5 hover:border-white/15'
                                } ${isBoss ? 'cursor-pointer' : 'cursor-default'}"
                                title="${mName} ${p.year}: ${active ? 'Programado' : 'Sin programar'}">
                                ${active ? '<i class="fa-solid fa-check"></i>' : '·'}
                            </button>
                        </td>
                    `;
                }).join('');

                return `
                    <tr class="hover:bg-white/[0.02]">
                        <td class="px-3 py-2.5">
                            <div class="font-bold text-white">${p.machine_code || ''} - ${p.machine_name || ''}</div>
                            <div class="text-[10px] text-purple-300 font-mono truncate max-w-[220px]">${p.plan_code}: ${p.title}</div>
                        </td>
                        ${monthCells}
                    </tr>
                `;
            }).join('');
        }
    }

    // 2. Render Plan Cards
    const cardsGrid = document.getElementById('plans-cards-grid');
    if (!cardsGrid) return;

    cardsGrid.innerHTML = filteredPlans.map(p => {
        const checklistHTML = (p.checklist || []).map((item, i) => `
            <label class="flex items-start gap-2 text-xs text-zinc-300 cursor-pointer py-1">
                <input type="checkbox" ${item.done ? 'checked' : ''} onchange="togglePlanChecklistItem(${p.id}, ${i}, this.checked)"
                    class="mt-0.5 rounded bg-zinc-900 border-white/20 text-purple-600 focus:ring-0">
                <span class="${item.done ? 'line-through text-zinc-500' : ''}">${item.task}</span>
            </label>
        `).join('');

        const monthPills = (p.months || []).map(m =>
            `<span class="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-[10px] font-bold">${MONTH_NAMES_SHORT[m - 1]}</span>`
        ).join('');

        return `
            <div class="cf-card rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">${p.plan_code}</span>
                                <span class="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-zinc-800 text-zinc-300">${p.maintenance_type} • ${p.frequency}</span>
                            </div>
                            <h3 class="text-sm sm:text-base font-bold text-white mt-1.5">${p.title}</h3>
                            <p class="text-xs text-purple-300 font-semibold">${p.machine_code} - ${p.machine_name}</p>
                        </div>
                        ${isBoss ? `
                            <div class="flex items-center gap-1">
                                <button onclick="openPlanModal(${p.id})" class="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button onclick="deletePlan(${p.id})" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[10px] uppercase font-bold text-zinc-500 mr-1">Meses ${p.year}:</span>
                        ${monthPills}
                    </div>

                    <div class="p-3 rounded-xl bg-zinc-950/80 border border-white/[0.06] space-y-1">
                        <p class="text-[10px] uppercase font-bold text-zinc-400 mb-1">Checklist de Actividades Preventivas:</p>
                        ${checklistHTML || '<p class="text-xs text-zinc-500">Sin tareas listadas</p>'}
                    </div>
                </div>

                <div class="pt-3 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div class="text-zinc-400">
                        <span>Responsable: <strong class="text-white">${p.technician_name || 'Por asignar'}</strong></span>
                        <span class="mx-1.5">•</span>
                        <span class="font-mono text-amber-400">Próx: ${p.scheduled_date}</span>
                    </div>
                    ${isBoss ? `
                        <button onclick="launchOrderFromPlan(${p.id})" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow">
                            <i class="fa-solid fa-rocket"></i> Lanzar OT
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function togglePlanMonth2027(planId, monthNumber) {
    const plan = state.plans.find(p => p.id == planId);
    if (!plan) return;
    let months = Array.isArray(plan.months) ? [...plan.months] : [];
    if (months.includes(monthNumber)) {
        months = months.filter(m => m !== monthNumber);
    } else {
        months.push(monthNumber);
        months.sort((a, b) => a - b);
    }
    plan.months = months;
    renderPlansView();

    await fetch(`/api/plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months })
    });
    showToast(`Calendario ${plan.year} actualizado para ${plan.machine_name}`, 'info');
}

async function togglePlanChecklistItem(planId, taskIdx, doneState) {
    const plan = state.plans.find(p => p.id == planId);
    if (!plan || !plan.checklist || !plan.checklist[taskIdx]) return;
    plan.checklist[taskIdx].done = doneState;
    renderPlansView();

    await fetch(`/api/plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: plan.checklist })
    });
}

async function launchOrderFromPlan(planId) {
    const res = await fetch(`/api/plans/${planId}/launch-order`, { method: 'POST' });
    if (res.ok) {
        const data = await res.json();
        showToast(`🚀 Orden ${data.order_number} creada y enviada a Técnicos`, 'success');
        await loadAllData();
        navigateTo('orders');
    }
}

function renderPlanModalMonthSelector() {
    const container = document.getElementById('plan-months-selector');
    if (!container) return;
    container.innerHTML = MONTH_NAMES_SHORT.map((mName, idx) => {
        const mNum = idx + 1;
        const active = state.selectedPlanMonths.includes(mNum);
        return `
            <button type="button" onclick="toggleModalMonth(${mNum})"
                class="py-1.5 px-2 rounded-lg font-mono text-[11px] font-bold border transition-all ${
                    active ? 'bg-purple-600 text-white border-purple-400' : 'bg-zinc-950 text-zinc-400 border-white/10'
                }">
                ${mName}
            </button>
        `;
    }).join('');
}

function toggleModalMonth(mNum) {
    if (state.selectedPlanMonths.includes(mNum)) {
        state.selectedPlanMonths = state.selectedPlanMonths.filter(m => m !== mNum);
    } else {
        state.selectedPlanMonths.push(mNum);
        state.selectedPlanMonths.sort((a, b) => a - b);
    }
    renderPlanModalMonthSelector();
}

function openPlanModal(planId = null) {
    populateFormDropdowns();
    document.getElementById('plan-edit-id').value = planId || '';
    if (planId) {
        const p = state.plans.find(x => x.id == planId);
        if (p) {
            document.getElementById('plan-modal-title').textContent = `Editar ${p.plan_code}`;
            document.getElementById('plan-machine-input').value = p.machine_id;
            document.getElementById('plan-year-input').value = p.year || 2027;
            document.getElementById('plan-title-input').value = p.title || '';
            document.getElementById('plan-type-input').value = p.maintenance_type || 'PREVENTIVO';
            document.getElementById('plan-frequency-input').value = p.frequency || 'TRIMESTRAL';
            document.getElementById('plan-date-input').value = p.scheduled_date || '2027-01-15';
            document.getElementById('plan-tech-input').value = p.assigned_technician_id || '';
            document.getElementById('plan-checklist-input').value = (p.checklist || []).map(c => c.task).join('\n');
            state.selectedPlanMonths = [...(p.months || [1, 4, 7, 10])];
        }
    } else {
        document.getElementById('plan-modal-title').textContent = 'Nuevo Plan de Mantenimiento / Preventivo 2027';
        document.getElementById('plan-year-input').value = '2027';
        document.getElementById('plan-title-input').value = '';
        document.getElementById('plan-type-input').value = 'PREVENTIVO';
        document.getElementById('plan-frequency-input').value = 'TRIMESTRAL';
        document.getElementById('plan-date-input').value = '2027-01-15';
        document.getElementById('plan-tech-input').value = '';
        document.getElementById('plan-checklist-input').value = 'Inspección general de rodamientos\nAjuste de borneras eléctricas\nLubricación y limpieza';
        state.selectedPlanMonths = [1, 4, 7, 10];
    }
    renderPlanModalMonthSelector();
    document.getElementById('plan-modal').classList.remove('hidden');
}

function closePlanModal() {
    document.getElementById('plan-modal').classList.add('hidden');
}

async function savePlanForm(e) {
    e.preventDefault();
    const editId = document.getElementById('plan-edit-id').value;
    const payload = {
        machine_id: parseInt(document.getElementById('plan-machine-input').value),
        year: parseInt(document.getElementById('plan-year-input').value),
        title: document.getElementById('plan-title-input').value.trim(),
        maintenance_type: document.getElementById('plan-type-input').value,
        frequency: document.getElementById('plan-frequency-input').value,
        scheduled_date: document.getElementById('plan-date-input').value,
        assigned_technician_id: document.getElementById('plan-tech-input').value || null,
        months: state.selectedPlanMonths,
        checklist: document.getElementById('plan-checklist-input').value
    };

    const url = editId ? `/api/plans/${editId}` : '/api/plans';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        closePlanModal();
        await loadAllData();
        renderPlansView();
        showToast('Plan Preventivo guardado y notificado en Hoja de Vida', 'success');
    }
}

async function deletePlan(planId) {
    if (!confirm('¿Eliminar este plan de mantenimiento?')) return;
    await fetch(`/api/plans/${planId}`, { method: 'DELETE' });
    await loadAllData();
    renderPlansView();
    showToast('Plan eliminado', 'info');
}

// ============================================================================
// NOTIFICATIONS CENTER (JEFES & TÉCNICOS)
// ============================================================================

function toggleNotificationDrawer() {
    const drawer = document.getElementById('notification-drawer');
    if (!drawer) return;
    drawer.classList.toggle('hidden');
    if (!drawer.classList.contains('hidden')) {
        loadNotifications();
    }
}

function renderNotificationsDrawer() {
    const badge = document.getElementById('notif-unread-badge');
    if (badge) {
        if (state.unreadNotifications > 0) {
            badge.textContent = state.unreadNotifications;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const list = document.getElementById('notifications-list');
    if (!list) return;

    if (!state.notifications || state.notifications.length === 0) {
        list.innerHTML = '<p class="text-xs text-zinc-500 text-center py-8">No hay notificaciones registradas.</p>';
        return;
    }

    const sevStyles = {
        CRITICAL: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
        WARNING: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
        SUCCESS: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        INFO: 'border-purple-500/30 bg-purple-500/10 text-purple-300'
    };

    list.innerHTML = state.notifications.map(n => {
        const st = sevStyles[n.severity] || sevStyles.INFO;
        return `
            <div onclick="handleNotificationClick(${n.id}, ${n.machine_id || 'null'}, ${n.order_id || 'null'})"
                 class="p-3.5 rounded-2xl border ${st} ${n.is_read ? 'opacity-65' : ''} cursor-pointer hover:opacity-100 transition-all space-y-1">
                <div class="flex items-start justify-between gap-2">
                    <p class="text-xs font-bold text-white">${n.title}</p>
                    ${!n.is_read ? '<span class="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 mt-1"></span>' : ''}
                </div>
                <p class="text-[11px] text-zinc-300 leading-relaxed">${n.message}</p>
                <div class="flex items-center justify-between pt-1 text-[10px] text-zinc-400 font-mono">
                    <span>${n.category}</span>
                    <span>${n.created_at || ''}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function handleNotificationClick(notifId, machineId, orderId) {
    await fetch(`/api/notifications/${notifId}/read`, { method: 'POST' });
    await loadNotifications();
    toggleNotificationDrawer();
    if (orderId) openOrderModal(orderId);
    else if (machineId) openMachineDossier(machineId);
}

async function markAllNotificationsRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' });
    await loadNotifications();
}

// ============================================================================
// DASHBOARD & TECHNICIANS (JEFE)
// ============================================================================

async function loadDashboardData() {
    try {
        const res = await fetch('/api/dashboard/stats');
        if (res.ok) {
            const data = await res.json();
            updateDashboardUI(data);
        }
    } catch (e) {}
}

function updateDashboardUI(data) {
    if (!data) return;
    const activeCount = (data.pending_orders || 0) + (data.in_progress_orders || 0);
    const elActive = document.getElementById('kpi-active-orders');
    if (elActive) elActive.textContent = activeCount;

    const elBreak = document.getElementById('kpi-Active-breakdown');
    if (elBreak) elBreak.textContent = `${data.pending_orders || 0} pend / ${data.in_progress_orders || 0} en curso`;

    const elStopped = document.getElementById('kpi-stopped-machines');
    if (elStopped) elStopped.textContent = data.machines_stopped || 0;

    const elDowntime = document.getElementById('kpi-total-downtime');
    if (elDowntime) elDowntime.textContent = `${data.total_downtime_minutes || 0}m`;

    const elAvg = document.getElementById('kpi-avg-repair');
    if (elAvg) elAvg.textContent = `${data.avg_repair_minutes || 0} min`;

    const elFin = document.getElementById('kpi-finished-orders');
    if (elFin) elFin.textContent = data.finished_orders || 0;

    const elPlans = document.getElementById('kpi-plans-2027');
    if (elPlans) elPlans.textContent = data.total_plans_2027 ?? state.plans.length;

    renderDashboardCharts(data);
    renderRecentOrdersDashboard(data.recent_orders || []);
}

function renderRecentOrdersDashboard(orders) {
    const tbody = document.getElementById('recent-orders-tbody');
    if (!tbody) return;
    if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-zinc-500">Sin órdenes recientes</td></tr>';
        return;
    }
    tbody.innerHTML = orders.map(o => {
        const cat = getCategoryMeta(o.failure_type);
        return `
            <tr onclick="openOrderModal(${o.id})" class="hover:bg-white/[0.03] cursor-pointer">
                <td class="px-4 py-3 font-mono font-bold text-purple-300">${o.order_number}</td>
                <td class="px-4 py-3 font-semibold text-white">${o.machine_name}</td>
                <td class="px-4 py-3">
                    <span class="text-xs font-semibold" style="color:${cat.color}">● ${cat.name}</span>
                    <span class="text-[10px] font-mono text-zinc-400 ml-1">[${o.maintenance_type}]</span>
                </td>
                <td class="px-4 py-3 text-zinc-300">${o.operator_name}</td>
                <td class="px-4 py-3">${o.machine_stopped ? '<span class="text-rose-400 font-bold">Sí</span>' : '<span class="text-emerald-400">No</span>'}</td>
                <td class="px-4 py-3">${o.technician_name || '<span class="text-amber-400 italic">Asignar</span>'}</td>
                <td class="px-4 py-3">${getStatusBadgeHTML(o.status)}</td>
                <td class="px-4 py-3 text-right"><button class="text-purple-400 hover:underline font-bold">Gestionar</button></td>
            </tr>
        `;
    }).join('');
}

function renderDashboardCharts(data) {
    if (typeof Chart === 'undefined') return;

    const failCtx = document.getElementById('failuresChart');
    if (failCtx) {
        if (state.charts.failures) state.charts.failures.destroy();
        const fMap = data.failures_by_type || {};
        const labels = Object.keys(fMap).map(k => getCategoryMeta(k).name);
        const values = Object.values(fMap);
        const colors = Object.keys(fMap).map(k => getCategoryMeta(k).color);

        state.charts.failures = new Chart(failCtx, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['Sin datos'],
                datasets: [{
                    data: values.length ? values : [1],
                    backgroundColor: colors.length ? colors : ['#27272a'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#d4d4d8', font: { size: 11 } } }
                }
            }
        });
    }

    const maintCtx = document.getElementById('maintenanceTypeChart');
    if (maintCtx) {
        if (state.charts.maintenance) state.charts.maintenance.destroy();
        const mMap = data.maintenance_by_type || {};
        state.charts.maintenance = new Chart(maintCtx, {
            type: 'bar',
            data: {
                labels: ['Correctivo', 'Preventivo', 'Predictivo'],
                datasets: [{
                    label: 'Órdenes',
                    data: [mMap.CORRECTIVO || 0, mMap.PREVENTIVO || 0, mMap.PREDICTIVO || 0],
                    backgroundColor: ['#f43f5e', '#8b5cf6', '#06b6d4'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#71717a', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    x: { ticks: { color: '#d4d4d8' }, grid: { display: false } }
                }
            }
        });
    }
}

function renderTechniciansGrid() {
    const grid = document.getElementById('technicians-grid');
    if (!grid) return;
    grid.innerHTML = state.technicians.map(t => `
        <div class="cf-card rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center font-bold text-base">
                        ${t.name.charAt(0)}
                    </div>
                    <div>
                        <h3 class="text-sm font-bold text-white">${t.name}</h3>
                        <p class="text-xs text-purple-300">${t.role}</p>
                        <p class="text-[11px] text-zinc-400">${t.specialty || ''}</p>
                    </div>
                </div>
                <div class="flex gap-1">
                    <button onclick="openTechnicianModal(${t.id})" class="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white text-xs"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteTechnician(${t.id})" class="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] text-xs">
                <div class="p-2 rounded-xl bg-zinc-950 text-center">
                    <span class="text-[10px] text-zinc-500 block">Activas</span>
                    <strong class="font-mono text-amber-400 text-sm">${t.active_orders || 0}</strong>
                </div>
                <div class="p-2 rounded-xl bg-zinc-950 text-center">
                    <span class="text-[10px] text-zinc-500 block">Finalizadas</span>
                    <strong class="font-mono text-emerald-400 text-sm">${t.finished_orders || 0}</strong>
                </div>
            </div>
        </div>
    `).join('');
}

function openTechnicianModal(techId = null) {
    document.getElementById('tech-edit-id').value = techId || '';
    if (techId) {
        const t = state.technicians.find(x => x.id == techId);
        if (t) {
            document.getElementById('tech-name-input').value = t.name;
            document.getElementById('tech-role-input').value = t.role || '';
            document.getElementById('tech-specialty-input').value = t.specialty || '';
            document.getElementById('tech-phone-input').value = t.phone || '';
        }
    } else {
        document.getElementById('tech-name-input').value = '';
        document.getElementById('tech-role-input').value = 'Especialista de Mantenimiento';
        document.getElementById('tech-specialty-input').value = 'Electromecánica';
        document.getElementById('tech-phone-input').value = '';
    }
    document.getElementById('technician-modal').classList.remove('hidden');
}

function closeTechnicianModal() {
    document.getElementById('technician-modal').classList.add('hidden');
}

async function saveTechnicianForm(e) {
    e.preventDefault();
    const editId = document.getElementById('tech-edit-id').value;
    const payload = {
        name: document.getElementById('tech-name-input').value.trim(),
        role: document.getElementById('tech-role-input').value.trim(),
        specialty: document.getElementById('tech-specialty-input').value.trim(),
        phone: document.getElementById('tech-phone-input').value.trim()
    };
    const url = editId ? `/api/technicians/${editId}` : '/api/technicians';
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        closeTechnicianModal();
        await loadTechnicians();
        showToast('Técnico guardado', 'success');
    }
}

async function deleteTechnician(techId) {
    if (!confirm('¿Desactivar este técnico?')) return;
    await fetch(`/api/technicians/${techId}`, { method: 'DELETE' });
    await loadTechnicians();
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        success: 'border-emerald-500/40 bg-zinc-950/95 text-emerald-300',
        error: 'border-rose-500/40 bg-zinc-950/95 text-rose-300',
        warning: 'border-amber-500/40 bg-zinc-950/95 text-amber-300',
        info: 'border-purple-500/40 bg-zinc-950/95 text-purple-200'
    };

    const el = document.createElement('div');
    el.className = `pointer-events-auto p-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl text-xs font-semibold flex items-center justify-between gap-3 transition-all ${colors[type] || colors.info}`;
    el.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" class="text-zinc-500 hover:text-white">&times;</button>
    `;
    container.appendChild(el);
    setTimeout(() => {
        if (el.parentElement) el.remove();
    }, 4500);
}

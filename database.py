"""
Database management for SistMaint CMMS 2.0
Handles SQLite connection, schema creation, migrations, seed data (2 objects per entity),
and Real-Time Cloud Sync (restful-api.dev + ntfy.sh SSE) so Vercel and multi-device (Phone <-> PC)
stay synchronized without losing state across serverless cold-starts.
"""
import sqlite3
import os
import json
import urllib.request
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_VERCEL = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))

SUPABASE_PROJECT_ID = os.environ.get('SUPABASE_PROJECT_ID', 'yijualgkrcxkqqphpzll')
CLOUD_OBJECT_ID = SUPABASE_PROJECT_ID
SUPABASE_URL = os.environ.get('SUPABASE_URL', f"https://{SUPABASE_PROJECT_ID}.supabase.co/rest/v1")
SUPABASE_KEY = os.environ.get(
    'SUPABASE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpanVhbGdrcmN4a3FxcGhwemxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDAwMDcsImV4cCI6MjEwODExNjAwN30.V5B5yRIZZhKCOTujMCmOCmWZJThQQAv3b3AQBb7wRvg'
)
NTFY_TOPIC = os.environ.get('CMMS_NTFY_TOPIC', 'sistmaint_cmms_v2_live')
NTFY_URL = f"https://ntfy.sh/{NTFY_TOPIC}"

if IS_VERCEL:
    DB_PATH = '/tmp/maintenance_v2.db'
else:
    DB_PATH = os.path.join(BASE_DIR, 'maintenance.db')

_last_cloud_pull = 0.0

def get_db_connection(pull_cloud_if_needed=True):
    global _last_cloud_pull
    parent_dir = os.path.dirname(DB_PATH)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    # Pull latest state from Supabase if older than 3 seconds (keeps Vercel, Phone & PC synced)
    if pull_cloud_if_needed:
        now_ts = datetime.now().timestamp()
        if now_ts - _last_cloud_pull > 3.0:
            try:
                pull_from_cloud(conn)
                _last_cloud_pull = now_ts
            except Exception as e:
                print(f"[SupabaseSync] Pull warning: {e}")
    return conn


def init_db():
    conn = get_db_connection(pull_cloud_if_needed=False)
    cursor = conn.cursor()

    # 1. Table: users (Login & Roles for Jefe / Admin)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'JEFE',
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Table: failure_categories (Categorización de Fallas)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS failure_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#6366f1',
        icon TEXT DEFAULT 'fa-triangle-exclamation',
        subcategories TEXT DEFAULT '[]',
        description TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Table: machines (Máquinas + Hoja de Vida completa)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS machines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        location TEXT DEFAULT 'Planta Principal',
        status TEXT DEFAULT 'OPERATIVA',
        description TEXT DEFAULT '',
        brand TEXT DEFAULT '',
        model TEXT DEFAULT '',
        serial_number TEXT DEFAULT '',
        install_date TEXT DEFAULT '',
        voltage TEXT DEFAULT '220V / 440V',
        power_kw TEXT DEFAULT '',
        criticality TEXT DEFAULT 'ALTA',
        supplier TEXT DEFAULT '',
        critical_parts TEXT DEFAULT '',
        preventive_interval_days INTEGER DEFAULT 30,
        last_maintenance_date TEXT DEFAULT '',
        next_maintenance_date TEXT DEFAULT '',
        life_notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Ensure new columns exist if migrating an older machines table
    existing_machine_cols = [r[1] for r in cursor.execute("PRAGMA table_info(machines)").fetchall()]
    new_machine_cols = {
        'brand': "TEXT DEFAULT ''",
        'model': "TEXT DEFAULT ''",
        'serial_number': "TEXT DEFAULT ''",
        'install_date': "TEXT DEFAULT ''",
        'voltage': "TEXT DEFAULT '220V / 440V'",
        'power_kw': "TEXT DEFAULT ''",
        'criticality': "TEXT DEFAULT 'ALTA'",
        'supplier': "TEXT DEFAULT ''",
        'critical_parts': "TEXT DEFAULT ''",
        'preventive_interval_days': "INTEGER DEFAULT 30",
        'last_maintenance_date': "TEXT DEFAULT ''",
        'next_maintenance_date': "TEXT DEFAULT ''",
        'life_notes': "TEXT DEFAULT ''"
    }
    for col, col_def in new_machine_cols.items():
        if col not in existing_machine_cols:
            try:
                cursor.execute(f"ALTER TABLE machines ADD COLUMN {col} {col_def}")
            except Exception:
                pass

    # 4. Table: technicians
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'Técnico de Mantenimiento',
        specialty TEXT DEFAULT 'Multidisciplinario',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    existing_tech_cols = [r[1] for r in cursor.execute("PRAGMA table_info(technicians)").fetchall()]
    if 'specialty' not in existing_tech_cols:
        try:
            cursor.execute("ALTER TABLE technicians ADD COLUMN specialty TEXT DEFAULT 'Multidisciplinario'")
        except Exception:
            pass

    # 5. Table: maintenance_orders
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS maintenance_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        machine_id INTEGER NOT NULL,
        maintenance_type TEXT NOT NULL DEFAULT 'CORRECTIVO',
        operator_name TEXT NOT NULL,
        report_date TEXT NOT NULL,
        report_time TEXT NOT NULL,
        failure_type TEXT NOT NULL DEFAULT 'NO_SABE',
        failure_subcategory TEXT DEFAULT '',
        machine_stopped INTEGER NOT NULL DEFAULT 0,
        downtime_start DATETIME,
        downtime_end DATETIME,
        total_downtime_minutes INTEGER DEFAULT 0,
        priority TEXT DEFAULT 'MEDIA',
        description TEXT NOT NULL,
        status TEXT DEFAULT 'PENDIENTE',
        technician_id INTEGER,
        plan_id INTEGER,
        repair_start DATETIME,
        repair_end DATETIME,
        repair_duration_seconds INTEGER DEFAULT 0,
        is_timer_running INTEGER DEFAULT 0,
        timer_last_started_at DATETIME,
        spare_parts_notes TEXT DEFAULT '',
        diagnosis TEXT DEFAULT '',
        solution_notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id),
        FOREIGN KEY (technician_id) REFERENCES technicians(id)
    )
    """)
    existing_order_cols = [r[1] for r in cursor.execute("PRAGMA table_info(maintenance_orders)").fetchall()]
    for col, col_def in [('failure_subcategory', "TEXT DEFAULT ''"), ('plan_id', "INTEGER")]:
        if col not in existing_order_cols:
            try:
                cursor.execute(f"ALTER TABLE maintenance_orders ADD COLUMN {col} {col_def}")
            except Exception:
                pass

    # 6. Table: spare_parts_used
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS spare_parts_used (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        part_name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit TEXT DEFAULT 'unidad',
        part_code TEXT DEFAULT '',
        unit_cost REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES maintenance_orders(id) ON DELETE CASCADE
    )
    """)

    # 7. Table: maintenance_plans (Planes de Mantenimiento & Plan Preventivo 2027)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS maintenance_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_code TEXT UNIQUE NOT NULL,
        machine_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        maintenance_type TEXT NOT NULL DEFAULT 'PREVENTIVO',
        frequency TEXT NOT NULL DEFAULT 'MENSUAL',
        year INTEGER NOT NULL DEFAULT 2027,
        months_json TEXT DEFAULT '[]',
        scheduled_date TEXT NOT NULL,
        estimated_minutes INTEGER DEFAULT 60,
        assigned_technician_id INTEGER,
        checklist_json TEXT DEFAULT '[]',
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'PROGRAMADO',
        notify_days_before INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_technician_id) REFERENCES technicians(id)
    )
    """)

    # 8. Table: notifications (Notificaciones para Jefes y Técnicos desde Hojas de Vida / Órdenes / Planes)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_role TEXT NOT NULL DEFAULT 'ALL',
        severity TEXT NOT NULL DEFAULT 'INFO',
        category TEXT NOT NULL DEFAULT 'HOJA_DE_VIDA',
        machine_id INTEGER,
        order_id INTEGER,
        plan_id INTEGER,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 9. Table: settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    conn.commit()

    # Try pulling from Cloud DB first; if cloud is not initialized yet, seed 2 objects per entity and push to cloud
    cloud_loaded = False
    try:
        cloud_loaded = pull_from_cloud(conn)
    except Exception as e:
        print(f"[DB] Cloud check skipped: {e}")

    if not cloud_loaded:
        # Check if we need to reset/seed the v2 2-object test dataset
        v2_seeded = cursor.execute("SELECT value FROM settings WHERE key = 'v2_seeded_2_objects'").fetchone()
        if not v2_seeded:
            seed_v2_data(cursor)
            conn.commit()
            try:
                push_to_cloud(conn)
            except Exception as e:
                print(f"[DB] Initial cloud push skipped: {e}")

    conn.close()
    print(f"[DB] SistMaint v2 Database ready at: {DB_PATH}")


def seed_v2_data(cursor):
    """
    Seeds 2 sample objects per entity (per user request: 'Con 2 objetos para probar la interfaz'),
    initial failure categories, test Jefe accounts, and sample notifications.
    """
    print("[DB] Seeding v2 dataset (2 objects per entity)...")

    # Clear old generic 5-machine data so the user has the exact 2 clean test objects requested
    cursor.execute("DELETE FROM spare_parts_used")
    cursor.execute("DELETE FROM maintenance_orders")
    cursor.execute("DELETE FROM maintenance_plans")
    cursor.execute("DELETE FROM notifications")
    cursor.execute("DELETE FROM machines")
    cursor.execute("DELETE FROM technicians")
    cursor.execute("DELETE FROM failure_categories")
    cursor.execute("DELETE FROM users")

    # Reset SQLite autoincrement counters
    cursor.execute("DELETE FROM sqlite_sequence")

    # 1. Seed Users (Cuentas iniciales de prueba para el Jefe)
    users = [
        ("jefe", "1234", "Jefe de Mantenimiento (Admin)", "JEFE", 1),
        ("admin", "admin123", "Supervisor de Planta", "JEFE", 1)
    ]
    cursor.executemany("""
        INSERT INTO users (username, password, full_name, role, active)
        VALUES (?, ?, ?, ?, ?)
    """, users)

    # 2. Seed Failure Categories (Categorización de Fallas)
    categories = [
        ("ELECTRICA", "Eléctrica", "#f59e0b", "fa-bolt",
         json.dumps(["Motor Eléctrico", "Tablero / Contactores", "Sensores / Final de Carrera", "Cableado / Cortocircuito", "Alimentación"]),
         "Fallas de potencia, tableros, motores y suministro eléctrico"),
        ("MECANICA", "Mecánica", "#3b82f6", "fa-gears",
         json.dumps(["Rodamientos / Balineras", "Correas / Cadenas", "Ejes / Engranajes", "Desalineación / Vibración", "Estructura / Sellos"]),
         "Desgaste de piezas móviles, transmisión, rodamientos y ajustes mecánicos"),
        ("HIDRAULICA_NEUMATICA", "Hidráulica / Neumática", "#06b6d4", "fa-droplet",
         json.dumps(["Fuga de Aire / Aceite", "Cilindros / Actuadores", "Electroválvulas", "Baja Presión / Compresor", "Mangueras / Racores"]),
         "Sistemas de presión neumática, bombas e hidráulica"),
        ("ELECTRONICA_CONTROL", "Electrónica / PLC", "#a855f7", "fa-microchip",
         json.dumps(["Variador de Frecuencia (VFD)", "PLC / Módulo I/O", "Pantalla HMI", "Desconfiguración / Software", "Paro de Emergencia"]),
         "Automatización, sensores inteligentes, variadores y control lógico"),
        ("LUBRICACION", "Lubricación / Térmica", "#10b981", "fa-oil-can",
         json.dumps(["Falta de Grasa / Aceite", "Sobrecalentamiento", "Filtro Obstruido", "Degradación de Lubricante"]),
         "Problemas de lubricación, fricción y temperatura"),
        ("AMBAS", "Eléctrica y Mecánica (Ambas)", "#ec4899", "fa-screwdriver-wrench",
         json.dumps(["Paro Electromecánico General", "Atasco de Motor y Transmisión"]),
         "Falla combinada en sistema eléctrico y mecánico"),
        ("NO_SABE", "Por Diagnosticar / No sabe", "#71717a", "fa-circle-question",
         json.dumps(["Ruido Anormal", "La máquina no inicia", "Falla intermitente", "Otro síntoma"]),
         "Cuando el operario reporta el síntoma sin identificar el origen exacto")
    ]
    cursor.executemany("""
        INSERT INTO failure_categories (code, name, color, icon, subcategories, description)
        VALUES (?, ?, ?, ?, ?, ?)
    """, categories)

    # 3. Seed 2 Machines with complete Hoja de Vida (2 objetos de prueba)
    machines = [
        (
            "MAQ-001", "Máquina 1", "Línea de Producción 1", "EN_MANTENIMIENTO",
            "Centro de mecanizado y torno industrial principal",
            "Haas Automation", "ST-20Y", "SN-HAAS-88412", "2023-03-15",
            "440V Trifásico", "15 kW (20 HP)", "ALTA", "Maquinaria Industrial S.A.",
            "Rodamiento husillo 6205-2RS, Correa dentada HTD-8M, Contactor Siemens 24VDC, Sellos hidráulicos",
            30, "2026-09-20", "2026-10-25",
            "Hoja de Vida activa. Requiere verificación mensual de vibración en cabezal y limpieza de circuito de refrigeración."
        ),
        (
            "MAQ-002", "Máquina 2", "Línea de Empaque y Sellado", "OPERATIVA",
            "Empacadora y selladora termoformadora automática",
            "Bosch Packaging", "SVE-2520", "SN-BSH-44901", "2024-01-10",
            "220V Trifásico", "7.5 kW (10 HP)", "ALTA", "TecnoPack Andina",
            "Resistencia térmica 500W, Sensor óptico Omron E3Z, Cilindro neumático Festo DSNU-25, Relevo estado sólido SSR-40DA",
            45, "2026-10-01", "2026-11-15",
            "Hoja de Vida al día. Calibrar mordazas de sellado y presión neumática a 6 bar cada 45 días."
        )
    ]
    cursor.executemany("""
        INSERT INTO machines (
            code, name, location, status, description,
            brand, model, serial_number, install_date,
            voltage, power_kw, criticality, supplier,
            critical_parts, preventive_interval_days, last_maintenance_date, next_maintenance_date,
            life_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, machines)

    # 4. Seed 2 Technicians (2 objetos de prueba)
    technicians = [
        ("Ingeniero 1", "Ingeniero Electromecánico Senior", "Eléctrica & Control PLC", "300 123 4567", "ingeniero1@planta.com"),
        ("Ingeniero 2", "Especialista Mecánico & Preventivo", "Mecánica & Neumática", "310 987 6543", "ingeniero2@planta.com")
    ]
    cursor.executemany("""
        INSERT INTO technicians (name, role, specialty, phone, email)
        VALUES (?, ?, ?, ?, ?)
    """, technicians)

    # 5. Seed 2 Maintenance Orders (1 Activa en Máquina 1, 1 Finalizada en Máquina 2)
    now = datetime.now()
    one_hour_ago = now - timedelta(minutes=45)
    two_days_ago = now - timedelta(days=2)

    cursor.execute("""
        INSERT INTO maintenance_orders (
            order_number, machine_id, maintenance_type, operator_name,
            report_date, report_time, failure_type, failure_subcategory, machine_stopped,
            downtime_start, priority, description, status, technician_id,
            repair_start, is_timer_running, timer_last_started_at, spare_parts_notes, diagnosis
        ) VALUES (
            'OT-2026-0001', 1, 'CORRECTIVO', 'Carlos Morales',
            ?, ?, 'MECANICA', 'Rodamientos / Balineras', 1,
            ?, 'ALTA', 'Vibración fuerte en el husillo principal y recalentamiento al girar a altas RPM.',
            'EN_PROCESO', 2,
            ?, 1, ?, 'Rodamiento 6205-2RS SKF, Grasa sintética de alta velocidad',
            'Desgaste en pista interna de rodamiento principal.'
        )
    """, (
        now.strftime('%Y-%m-%d'), one_hour_ago.strftime('%H:%M'),
        one_hour_ago.isoformat(),
        one_hour_ago.isoformat(), one_hour_ago.isoformat()
    ))

    cursor.execute("""
        INSERT INTO maintenance_orders (
            order_number, machine_id, maintenance_type, operator_name,
            report_date, report_time, failure_type, failure_subcategory, machine_stopped,
            downtime_start, downtime_end, total_downtime_minutes,
            priority, description, status, technician_id,
            repair_start, repair_end, repair_duration_seconds,
            is_timer_running, spare_parts_notes, diagnosis, solution_notes
        ) VALUES (
            'OT-2026-0002', 2, 'PREVENTIVO', 'Laura Gómez',
            ?, ?, 'ELECTRICA', 'Sensores / Final de Carrera', 0,
            ?, ?, 35,
            'MEDIA', 'Desajuste en sensor óptico de corte de película y revisión de resistencias de sellado.',
            'FINALIZADO', 1,
            ?, ?, 2100,
            0, 'Sensor óptico Omron E3Z (1 unidad), Cinta teflón de alta temperatura',
            'Lente de fotocelda desgastado y teflón de mordaza quemado.',
            'Se reemplazó sensor óptico, se cambió cinta teflón y se calibró temperatura a 165°C.'
        )
    """, (
        two_days_ago.strftime('%Y-%m-%d'), two_days_ago.strftime('%H:%M'),
        two_days_ago.isoformat(), (two_days_ago + timedelta(minutes=35)).isoformat(),
        two_days_ago.isoformat(), (two_days_ago + timedelta(seconds=2100)).isoformat()
    ))
    order2_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO spare_parts_used (order_id, part_name, quantity, unit, part_code, unit_cost, notes)
        VALUES (?, 'Sensor Óptico Omron E3Z', 1, 'unidad', 'OMR-E3Z', 120000, 'Instalado en cabezal de corte')
    """, (order2_id,))

    # 6. Seed 2 Maintenance Plans including Plan Preventivo 2027 (2 objetos de prueba)
    plans = [
        (
            "PLAN-2027-001", 1, "Plan Preventivo Anual 2027 - Overhaul & Alineación Máquina 1",
            "PREVENTIVO", "TRIMESTRAL", 2027,
            json.dumps([1, 4, 7, 10]), "2027-01-15", 120, 2,
            json.dumps([
                {"task": "Verificar holgura y vibración de rodamientos del husillo", "done": False},
                {"task": "Cambiar aceite de caja de transmisión y limpiar filtros", "done": False},
                {"task": "Reapretar borneras del tablero de fuerza 440V", "done": False},
                {"task": "Calibrar ejes X/Y y lubricar guías lineales", "done": False}
            ]),
            "Cronograma preventivo trimestral 2027 registrado en la Hoja de Vida de Máquina 1.",
            "PROGRAMADO", 5
        ),
        (
            "PLAN-2027-002", 2, "Plan Preventivo 2027 - Sistema Térmico y Neumático Máquina 2",
            "PREVENTIVO", "BIMESTRAL", 2027,
            json.dumps([2, 4, 6, 8, 10, 12]), "2027-02-10", 90, 1,
            json.dumps([
                {"task": "Inspeccionar resistencias de mordaza y termocuplas", "done": False},
                {"task": "Purgar unidad de mantenimiento neumático FRL (6 bar)", "done": False},
                {"task": "Limpiar y calibrar sensores ópticos y encoder de avance", "done": False},
                {"task": "Reemplazar teflón antiadherente en barra de sellado", "done": False}
            ]),
            "Plan maestro preventivo 2027 para garantizar cero paros en línea de empaque.",
            "PROGRAMADO", 5
        )
    ]
    cursor.executemany("""
        INSERT INTO maintenance_plans (
            plan_code, machine_id, title, maintenance_type, frequency, year,
            months_json, scheduled_date, estimated_minutes, assigned_technician_id,
            checklist_json, description, status, notify_days_before
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, plans)

    # 7. Seed Initial Notifications for Jefes & Técnicos (linked to Hojas de Vida & Orders)
    notifications = [
        (
            "ALL", "CRITICAL", "FALLA_MAQUINA", 1, 1, None,
            "🚨 Máquina 1 en Mantenimiento (Parada de Línea)",
            "Hoja de Vida MAQ-001: Se reportó falla MECÁNICA (Rodamientos / Balineras) con máquina detenida. Orden OT-2026-0001 asignada a Ingeniero 2.",
            0
        ),
        (
            "ALL", "WARNING", "HOJA_DE_VIDA", 1, None, 1,
            "📋 Alerta Hoja de Vida MAQ-001: Próximo Preventivo",
            "Según la Hoja de Vida de Máquina 1, el próximo control de vibración y lubricación vence el 2026-10-25. Plan 2027 (PLAN-2027-001) activo.",
            0
        ),
        (
            "JEFE", "SUCCESS", "ORDEN_CERRADA", 2, 2, 2,
            "✅ Orden OT-2026-0002 Finalizada en Máquina 2",
            "Ingeniero 1 completó mantenimiento en Máquina 2 en 35 min. Hoja de Vida actualizada con reemplazo de Sensor Óptico Omron E3Z.",
            0
        )
    ]
    cursor.executemany("""
        INSERT INTO notifications (
            target_role, severity, category, machine_id, order_id, plan_id,
            title, message, is_read
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, notifications)

    # 8. Settings
    initial_settings = [
        ("server_ip", "192.168.68.56"),
        ("server_port", "5000"),
        ("company_name", "SistMaint CMMS - Control Industrial"),
        ("v2_seeded_2_objects", "1"),
        ("cloud_object_id", CLOUD_OBJECT_ID)
    ]
    cursor.executemany("""
        INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    """, initial_settings)


# =====================================================================
# CLOUD DATABASE SYNC ENGINE (Phone <-> PC Real-Time Persistence)
# =====================================================================

TABLES_TO_SYNC = [
    'users',
    'failure_categories',
    'machines',
    'technicians',
    'maintenance_orders',
    'spare_parts_used',
    'maintenance_plans',
    'notifications',
    'settings'
]

def export_db_snapshot(conn):
    snapshot = {
        "initialized": True,
        "updated_at": datetime.now().isoformat(),
        "tables": {}
    }
    for table in TABLES_TO_SYNC:
        try:
            rows = conn.execute(f"SELECT * FROM {table}").fetchall()
            snapshot["tables"][table] = [dict(r) for r in rows]
        except Exception as e:
            print(f"[CloudSync] Error exporting {table}: {e}")
            snapshot["tables"][table] = []
    return snapshot


def import_db_snapshot(conn, snapshot):
    if not snapshot or not snapshot.get("initialized") or "tables" not in snapshot:
        return False

    tables = snapshot["tables"]
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = OFF")
    try:
        for table in TABLES_TO_SYNC:
            if table in tables and isinstance(tables[table], list):
                cursor.execute(f"DELETE FROM {table}")
                rows = tables[table]
                if len(rows) > 0:
                    cols = list(rows[0].keys())
                    placeholders = ", ".join(["?"] * len(cols))
                    col_names = ", ".join(cols)
                    values = [tuple(r.get(c) for c in cols) for r in rows]
                    cursor.executemany(
                        f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})",
                        values
                    )
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[CloudSync] Import error: {e}")
        return False
    finally:
        cursor.execute("PRAGMA foreign_keys = ON")


def _sb_headers(prefer=None):
    h = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'User-Agent': 'SistMaint-CMMS/2.0'
    }
    if prefer:
        h['Prefer'] = prefer
    return h


def _sb_get(table_and_query):
    url = f"{SUPABASE_URL}/{table_and_query}"
    req = urllib.request.Request(url, headers=_sb_headers(), method='GET')
    resp = urllib.request.urlopen(req, timeout=6)
    return json.loads(resp.read().decode('utf-8'))


def _sb_upsert_and_prune(table, rows):
    """Upserts rows into a Supabase PostgreSQL table and deletes any remote rows removed locally"""
    if rows:
        url = f"{SUPABASE_URL}/{table}"
        payload = json.dumps(rows, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=payload,
            headers=_sb_headers('resolution=merge-duplicates,return=minimal'),
            method='POST'
        )
        urllib.request.urlopen(req, timeout=7)

        ids_csv = ",".join(str(int(r['id'])) for r in rows if r.get('id') is not None)
        if ids_csv:
            del_url = f"{SUPABASE_URL}/{table}?id=not.in.({ids_csv})"
            del_req = urllib.request.Request(del_url, headers=_sb_headers(), method='DELETE')
            try:
                urllib.request.urlopen(del_req, timeout=5)
            except Exception:
                pass
    else:
        del_url = f"{SUPABASE_URL}/{table}?id=gt.0"
        del_req = urllib.request.Request(del_url, headers=_sb_headers(), method='DELETE')
        try:
            urllib.request.urlopen(del_req, timeout=5)
        except Exception:
            pass


def push_to_cloud(conn, event_type="db_updated", summary=""):
    """Pushes full relational state directly to Supabase PostgreSQL tables"""
    global _last_cloud_pull
    try:
        # 1. users
        users_rows = [
            {
                'id': r['id'],
                'username': r['username'],
                'password': r['password'],
                'full_name': r['full_name'],
                'role': r['role'] or 'JEFE'
            }
            for r in conn.execute("SELECT * FROM users").fetchall()
        ]
        _sb_upsert_and_prune('users', users_rows)

        # 2. failure_categories
        cat_rows = [
            {
                'id': r['id'],
                'code': r['code'],
                'name': r['name'],
                'subcategories': r['subcategories'] or '[]',
                'color': r['color'] or '#8c5cff',
                'icon': r['icon'] or 'fa-triangle-exclamation',
                'description': r['description'] or ''
            }
            for r in conn.execute("SELECT * FROM failure_categories").fetchall()
        ]
        _sb_upsert_and_prune('failure_categories', cat_rows)

        # 3. machines
        mach_rows = [
            {
                'id': r['id'],
                'code': r['code'],
                'name': r['name'],
                'location': r['location'] or 'Planta Principal',
                'status': r['status'] or 'OPERATIVA',
                'description': r['description'] or '',
                'brand': r['brand'] or '',
                'model': r['model'] or '',
                'serial_number': r['serial_number'] or '',
                'install_date': r['install_date'] or '',
                'voltage': r['voltage'] or '220V / 440V',
                'power_kw': r['power_kw'] or '',
                'criticality': r['criticality'] or 'ALTA',
                'supplier': r['supplier'] or '',
                'critical_parts': r['critical_parts'] or '',
                'preventive_interval_days': int(r['preventive_interval_days'] or 30),
                'last_maintenance_date': r['last_maintenance_date'] or '',
                'next_maintenance_date': r['next_maintenance_date'] or '',
                'life_notes': r['life_notes'] or ''
            }
            for r in conn.execute("SELECT * FROM machines").fetchall()
        ]
        _sb_upsert_and_prune('machines', mach_rows)

        # 4. technicians
        tech_rows = [
            {
                'id': r['id'],
                'name': r['name'],
                'role': r['role'] or 'Técnico de Mantenimiento',
                'specialty': r['specialty'] or 'Multidisciplinario',
                'phone': r['phone'] or '',
                'active': bool(r['active'])
            }
            for r in conn.execute("SELECT * FROM technicians").fetchall()
        ]
        _sb_upsert_and_prune('technicians', tech_rows)

        # 5. work_orders (mapped from maintenance_orders + spare_parts_used)
        orders_db = [dict(r) for r in conn.execute("SELECT * FROM maintenance_orders").fetchall()]
        wo_rows = []
        for r in orders_db:
            sp_rows = conn.execute(
                "SELECT part_name, quantity FROM spare_parts_used WHERE order_id = ?",
                (r['id'],)
            ).fetchall()
            sp_str = ", ".join(f"{s['part_name']} (x{int(s['quantity']) if float(s['quantity']).is_integer() else s['quantity']})" for s in sp_rows)
            if not sp_str and r.get('spare_parts_notes'):
                sp_str = r.get('spare_parts_notes')

            rep_iso = r.get('created_at') or f"{r.get('report_date', '')}T{r.get('report_time', '00:00:00')}"
            if rep_iso and ' ' in rep_iso and 'T' not in rep_iso:
                rep_iso = rep_iso.replace(' ', 'T') + 'Z'
            start_iso = r.get('repair_start') or None
            if start_iso and ' ' in start_iso and 'T' not in start_iso:
                start_iso = start_iso.replace(' ', 'T') + 'Z'
            end_iso = r.get('repair_end') or None
            if end_iso and ' ' in end_iso and 'T' not in end_iso:
                end_iso = end_iso.replace(' ', 'T') + 'Z'

            repair_mins = round(float(r.get('repair_duration_seconds') or 0) / 60.0, 2)
            wo_rows.append({
                'id': r['id'],
                'order_number': r['order_number'],
                'machine_id': r['machine_id'],
                'reporter_name': r.get('operator_name') or 'Operario',
                'failure_type': r.get('failure_type') or 'NO_SABE',
                'failure_category': r.get('failure_type') or 'Por Diagnosticar',
                'failure_subcategory': r.get('failure_subcategory') or 'General',
                'maintenance_type': r.get('maintenance_type') or 'CORRECTIVO',
                'priority': r.get('priority') or 'MEDIA',
                'description': r.get('description') or '',
                'assigned_technician_id': r.get('technician_id'),
                'status': r.get('status') or 'PENDIENTE',
                'reported_at': rep_iso,
                'started_at': start_iso,
                'completed_at': end_iso,
                'downtime_minutes': float(r.get('total_downtime_minutes') or 0),
                'repair_minutes': repair_mins,
                'solution_notes': r.get('solution_notes') or '',
                'spare_parts_used': sp_str or ''
            })
        _sb_upsert_and_prune('work_orders', wo_rows)

        # 6. maintenance_plans
        plans_db = [dict(r) for r in conn.execute("SELECT * FROM maintenance_plans").fetchall()]
        plan_rows = [
            {
                'id': r['id'],
                'plan_code': r['plan_code'],
                'machine_id': r['machine_id'],
                'title': r['title'],
                'maintenance_type': r.get('maintenance_type') or 'PREVENTIVO',
                'frequency': r.get('frequency') or 'MENSUAL',
                'year': int(r.get('year') or 2027),
                'months_json': r.get('months_json') or '[]',
                'scheduled_date': r.get('scheduled_date') or '2027-01-15',
                'estimated_minutes': int(r.get('estimated_minutes') or 90),
                'assigned_technician_id': r.get('assigned_technician_id'),
                'checklist_json': r.get('checklist_json') or '[]',
                'status': r.get('status') or 'PROGRAMADO',
                'notes': r.get('description') or ''
            }
            for r in plans_db
        ]
        _sb_upsert_and_prune('maintenance_plans', plan_rows)

        # 7. notifications
        mach_map = {m['id']: m['name'] for m in mach_rows}
        notifs_db = [dict(r) for r in conn.execute("SELECT * FROM notifications").fetchall()]
        notif_rows = [
            {
                'id': r['id'],
                'target_role': r.get('target_role') or 'ALL',
                'machine_id': r.get('machine_id'),
                'machine_name': mach_map.get(r.get('machine_id'), ''),
                'title': r['title'],
                'message': r['message'],
                'notif_type': r.get('category') or 'HOJA_DE_VIDA',
                'severity': r.get('severity') or 'INFO',
                'is_read': bool(r.get('is_read'))
            }
            for r in notifs_db
        ]
        _sb_upsert_and_prune('notifications', notif_rows)

        _last_cloud_pull = datetime.now().timestamp()
        return True
    except Exception as e:
        print(f"[SupabaseSync] Push error: {e}")
        return False


def pull_from_cloud(conn):
    """Pulls latest relational rows from Supabase PostgreSQL tables into local/serverless SQLite"""
    global _last_cloud_pull
    try:
        sb_machines = _sb_get("machines?select=*&order=id.asc")
    except Exception as e:
        print(f"[SupabaseSync] Could not reach Supabase: {e}")
        return False

    # If Supabase is completely empty (e.g., right after creating tables), seed Supabase from local seed!
    if isinstance(sb_machines, list) and len(sb_machines) == 0:
        local_count = conn.execute("SELECT COUNT(*) FROM machines").fetchone()[0]
        if local_count > 0:
            push_to_cloud(conn, event_type="initial_supabase_seed", summary="Seeded 2 objects into Supabase")
        return False

    try:
        sb_users = _sb_get("users?select=*&order=id.asc")
        sb_cats = _sb_get("failure_categories?select=*&order=id.asc")
        sb_techs = _sb_get("technicians?select=*&order=id.asc")
        sb_orders = _sb_get("work_orders?select=*&order=id.asc")
        sb_plans = _sb_get("maintenance_plans?select=*&order=id.asc")
        sb_notifs = _sb_get("notifications?select=*&order=id.asc")

        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = OFF")

        # 1. users
        if isinstance(sb_users, list) and len(sb_users) > 0:
            cursor.execute("DELETE FROM users")
            for u in sb_users:
                cursor.execute("""
                    INSERT INTO users (id, username, password, full_name, role, active)
                    VALUES (?, ?, ?, ?, ?, 1)
                """, (u['id'], u['username'], u['password'], u['full_name'], u.get('role') or 'JEFE'))

        # 2. failure_categories
        if isinstance(sb_cats, list) and len(sb_cats) > 0:
            cursor.execute("DELETE FROM failure_categories")
            for c in sb_cats:
                cursor.execute("""
                    INSERT INTO failure_categories (id, code, name, color, icon, subcategories, description, active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                """, (
                    c['id'], c['code'], c['name'], c.get('color') or '#8c5cff',
                    c.get('icon') or 'fa-triangle-exclamation', c.get('subcategories') or '[]',
                    c.get('description') or ''
                ))

        # 3. machines
        if isinstance(sb_machines, list) and len(sb_machines) > 0:
            cursor.execute("DELETE FROM machines")
            for m in sb_machines:
                cursor.execute("""
                    INSERT INTO machines (
                        id, code, name, location, status, description,
                        brand, model, serial_number, install_date, voltage, power_kw,
                        criticality, supplier, critical_parts, preventive_interval_days,
                        last_maintenance_date, next_maintenance_date, life_notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    m['id'], m['code'], m['name'], m.get('location') or 'Planta Principal',
                    m.get('status') or 'OPERATIVA', m.get('description') or '',
                    m.get('brand') or '', m.get('model') or '', m.get('serial_number') or '',
                    m.get('install_date') or '', m.get('voltage') or '220V / 440V',
                    m.get('power_kw') or '', m.get('criticality') or 'ALTA',
                    m.get('supplier') or '', m.get('critical_parts') or '',
                    int(m.get('preventive_interval_days') or 30),
                    m.get('last_maintenance_date') or '', m.get('next_maintenance_date') or '',
                    m.get('life_notes') or ''
                ))

        # 4. technicians
        if isinstance(sb_techs, list) and len(sb_techs) > 0:
            cursor.execute("DELETE FROM technicians")
            for t in sb_techs:
                cursor.execute("""
                    INSERT INTO technicians (id, name, role, specialty, phone, email, active)
                    VALUES (?, ?, ?, ?, ?, '', ?)
                """, (
                    t['id'], t['name'], t.get('role') or 'Técnico',
                    t.get('specialty') or 'General', t.get('phone') or '',
                    1 if t.get('active', True) else 0
                ))

        # 5. work_orders -> maintenance_orders & spare_parts_used
        if isinstance(sb_orders, list):
            cursor.execute("DELETE FROM spare_parts_used")
            cursor.execute("DELETE FROM maintenance_orders")
            for o in sb_orders:
                rep_at = (o.get('reported_at') or datetime.now().isoformat()).replace('T', ' ').replace('Z', '')[:19]
                parts_dt = rep_at.split(' ')
                rep_date = parts_dt[0] if len(parts_dt) > 0 else datetime.now().strftime('%Y-%m-%d')
                rep_time = parts_dt[1] if len(parts_dt) > 1 else datetime.now().strftime('%H:%M:%S')
                st_time = (o.get('started_at') or '').replace('T', ' ').replace('Z', '')[:19] or None
                end_time = (o.get('completed_at') or '').replace('T', ' ').replace('Z', '')[:19] or None
                rep_secs = int(round(float(o.get('repair_minutes') or 0) * 60.0))
                status_val = o.get('status') or 'PENDIENTE'
                is_running = 1 if status_val == 'EN_PROCESO' and st_time and not end_time else 0
                stopped_flag = 1 if status_val in ('PENDIENTE', 'EN_PROCESO', 'PAUSADA', 'REPORTADA') else 0

                cursor.execute("""
                    INSERT INTO maintenance_orders (
                        id, order_number, machine_id, maintenance_type, operator_name,
                        report_date, report_time, failure_type, failure_subcategory,
                        machine_stopped, downtime_start, downtime_end, total_downtime_minutes,
                        priority, description, status, technician_id,
                        repair_start, repair_end, repair_duration_seconds,
                        is_timer_running, timer_last_started_at,
                        spare_parts_notes, solution_notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    o['id'], o['order_number'], o['machine_id'],
                    o.get('maintenance_type') or 'CORRECTIVO',
                    o.get('reporter_name') or 'Operario',
                    rep_date, rep_time,
                    o.get('failure_type') or 'NO_SABE',
                    o.get('failure_subcategory') or 'General',
                    stopped_flag, rep_at, end_time,
                    int(round(float(o.get('downtime_minutes') or 0))),
                    o.get('priority') or 'MEDIA',
                    o.get('description') or '',
                    status_val,
                    o.get('assigned_technician_id'),
                    st_time, end_time, rep_secs,
                    is_running, st_time if is_running else None,
                    o.get('spare_parts_used') or '',
                    o.get('solution_notes') or '',
                    rep_at
                ))
                sp_used = (o.get('spare_parts_used') or '').strip()
                if sp_used:
                    for item in sp_used.split(','):
                        item = item.strip()
                        if not item:
                            continue
                        qty = 1
                        name = item
                        if '(x' in item and item.endswith(')'):
                            try:
                                name_part, q_part = item.rsplit('(x', 1)
                                name = name_part.strip()
                                qty = int(q_part[:-1])
                            except Exception:
                                pass
                        cursor.execute("""
                            INSERT INTO spare_parts_used (order_id, part_name, quantity)
                            VALUES (?, ?, ?)
                        """, (o['id'], name, qty))

        # 6. maintenance_plans
        if isinstance(sb_plans, list):
            cursor.execute("DELETE FROM maintenance_plans")
            for p in sb_plans:
                cursor.execute("""
                    INSERT INTO maintenance_plans (
                        id, plan_code, machine_id, title, maintenance_type, frequency,
                        year, months_json, scheduled_date, estimated_minutes, assigned_technician_id,
                        status, checklist_json, description
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    p['id'], p['plan_code'], p['machine_id'], p['title'],
                    p.get('maintenance_type') or 'PREVENTIVO',
                    p.get('frequency') or 'MENSUAL',
                    int(p.get('year') or 2027),
                    p.get('months_json') or '[]',
                    p.get('scheduled_date') or '2027-01-15',
                    int(p.get('estimated_minutes') or 90),
                    p.get('assigned_technician_id'),
                    p.get('status') or 'PROGRAMADO',
                    p.get('checklist_json') or '[]',
                    p.get('notes') or ''
                ))

        # 7. notifications
        if isinstance(sb_notifs, list):
            cursor.execute("DELETE FROM notifications")
            for n in sb_notifs:
                created = (n.get('created_at') or datetime.now().isoformat()).replace('T', ' ').replace('Z', '')[:19]
                cursor.execute("""
                    INSERT INTO notifications (
                        id, target_role, severity, category, machine_id, title, message, is_read, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    n['id'], n.get('target_role') or 'ALL',
                    n.get('severity') or 'INFO',
                    n.get('notif_type') or 'HOJA_DE_VIDA',
                    n.get('machine_id'),
                    n['title'], n['message'],
                    1 if n.get('is_read') else 0,
                    created
                ))

        conn.commit()
        cursor.execute("PRAGMA foreign_keys = ON")
        _last_cloud_pull = datetime.now().timestamp()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[SupabaseSync] Import error: {e}")
        return False


def create_notification(conn, title, message, severity="INFO", category="HOJA_DE_VIDA",
                        target_role="ALL", machine_id=None, order_id=None, plan_id=None):
    """Helper to record a notification in the DB for Jefes and Técnicos"""
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO notifications (
            target_role, severity, category, machine_id, order_id, plan_id,
            title, message, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    """, (
        target_role, severity, category, machine_id, order_id, plan_id,
        title, message, datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    ))
    return cursor.lastrowid


if __name__ == '__main__':
    init_db()

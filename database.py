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

CLOUD_OBJECT_ID = os.environ.get('CMMS_CLOUD_ID', 'ff808181a09d98f701a15b90d54134d5')
CLOUD_API_URL = f"https://api.restful-api.dev/objects/{CLOUD_OBJECT_ID}"
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

    # On Vercel, pull latest cloud state if cold or older than 4 seconds
    if pull_cloud_if_needed and IS_VERCEL:
        now_ts = datetime.now().timestamp()
        if now_ts - _last_cloud_pull > 4.0:
            try:
                pull_from_cloud(conn)
                _last_cloud_pull = now_ts
            except Exception as e:
                print(f"[CloudSync] Pull warning: {e}")
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


def push_to_cloud(conn, event_type="db_updated", summary=""):
    """Pushes full SQLite state to Cloud Store (ntfy attachment + restful-api pointer) and broadcasts live event"""
    global _last_cloud_pull
    try:
        snapshot = export_db_snapshot(conn)
        snapshot["event_type"] = event_type
        snapshot["summary"] = summary
        raw_bytes = json.dumps(snapshot, ensure_ascii=False).encode('utf-8')

        # 1. Upload full JSON snapshot to ntfy cloud store (supports up to 15MB & triggers live SSE)
        store_url = f"https://ntfy.sh/{NTFY_TOPIC}"
        req = urllib.request.Request(
            store_url,
            data=raw_bytes,
            headers={
                'User-Agent': 'Mozilla/5.0 (SistMaint-CMMS/2.0)',
                'Filename': 'db_snapshot.json',
                'Title': event_type
            },
            method='PUT'
        )
        resp = urllib.request.urlopen(req, timeout=8)
        meta = json.loads(resp.read().decode('utf-8'))
        att_url = (meta.get('attachment') or {}).get('url', '')

        # 2. Save lightweight pointer in restful-api object store
        if att_url:
            ptr_payload = json.dumps({
                "name": "sistmaint_cmms_v2_cloud_db",
                "data": {
                    "initialized": "true",
                    "snapshot_url": att_url,
                    "updated_at": snapshot["updated_at"],
                    "event_type": event_type
                }
            }).encode('utf-8')
            ptr_req = urllib.request.Request(
                CLOUD_API_URL,
                data=ptr_payload,
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (SistMaint-CMMS/2.0)'
                },
                method='PUT'
            )
            try:
                urllib.request.urlopen(ptr_req, timeout=5)
            except Exception:
                pass

        _last_cloud_pull = datetime.now().timestamp()
        return True
    except Exception as e:
        print(f"[CloudSync] Push error: {e}")
        return False


def pull_from_cloud(conn):
    """Pulls latest snapshot from Cloud Store into local/serverless SQLite"""
    global _last_cloud_pull
    snapshot_url = None

    # 1. Try getting latest attachment from ntfy topic history first
    try:
        hist_url = f"https://ntfy.sh/{NTFY_TOPIC}/json?poll=1&since=12h"
        req = urllib.request.Request(hist_url, headers={'User-Agent': 'Mozilla/5.0 (SistMaint-CMMS/2.0)'}, method='GET')
        resp = urllib.request.urlopen(req, timeout=5)
        lines = resp.read().decode('utf-8').strip().splitlines()
        for line in reversed(lines):
            if not line.strip():
                continue
            msg = json.loads(line)
            att = msg.get('attachment') or {}
            if att.get('url'):
                snapshot_url = att['url']
                break
    except Exception:
        pass

    # 2. Fallback to restful-api pointer
    if not snapshot_url:
        try:
            req = urllib.request.Request(CLOUD_API_URL, headers={'User-Agent': 'Mozilla/5.0 (SistMaint-CMMS/2.0)'}, method='GET')
            resp = urllib.request.urlopen(req, timeout=5)
            body = json.loads(resp.read().decode('utf-8'))
            data = body.get('data') or {}
            if data.get('snapshot_url'):
                snapshot_url = data['snapshot_url']
        except Exception:
            pass

    if not snapshot_url:
        return False

    # 3. Download and import the snapshot JSON
    snap_req = urllib.request.Request(snapshot_url, headers={'User-Agent': 'Mozilla/5.0 (SistMaint-CMMS/2.0)'}, method='GET')
    snap_resp = urllib.request.urlopen(snap_req, timeout=6)
    snap_data = json.loads(snap_resp.read().decode('utf-8'))
    if snap_data.get('initialized') and 'tables' in snap_data:
        ok = import_db_snapshot(conn, snap_data)
        if ok:
            _last_cloud_pull = datetime.now().timestamp()
        return ok
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

"""
Database management for Industrial Maintenance System (CMMS)
Handles SQLite connection, schema creation, seed data and migrations.
Supports both local execution and Vercel serverless environment (using /tmp/ on Vercel).
"""
import sqlite3
import os
import shutil
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_VERCEL = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))

if IS_VERCEL:
    DB_PATH = '/tmp/maintenance.db'
    bundled_db = os.path.join(BASE_DIR, 'maintenance.db')
    if not os.path.exists(DB_PATH) and os.path.exists(bundled_db):
        try:
            shutil.copy2(bundled_db, DB_PATH)
        except Exception as e:
            print(f"[DB] Error copying bundled DB to /tmp: {e}")
else:
    DB_PATH = os.path.join(BASE_DIR, 'maintenance.db')

def get_db_connection():
    # Ensure parent dir exists if in /tmp
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Table: machines
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS machines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        location TEXT DEFAULT 'Planta Principal',
        status TEXT DEFAULT 'OPERATIVA',
        description TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Table: technicians
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'Técnico de Mantenimiento',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Table: maintenance_orders
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
        machine_stopped INTEGER NOT NULL DEFAULT 0,
        downtime_start DATETIME,
        downtime_end DATETIME,
        total_downtime_minutes INTEGER DEFAULT 0,
        priority TEXT DEFAULT 'MEDIA',
        description TEXT NOT NULL,
        status TEXT DEFAULT 'PENDIENTE',
        technician_id INTEGER,
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

    # Table: spare_parts_used
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

    # Table: settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    conn.commit()

    # Check if seed data exists
    cursor.execute("SELECT COUNT(*) FROM machines")
    if cursor.fetchone()[0] == 0:
        seed_data(cursor)
        conn.commit()

    conn.close()
    print(f"[DB] Database initialized successfully at: {DB_PATH}")

def seed_data(cursor):
    print("[DB] Seeding initial generic machines and technicians...")
    
    # Generic machines (per user request: "Por ahora pon nombres genericos [Maquina 1, Maquina 2]")
    initial_machines = [
        ("MAQ-001", "Máquina 1", "Línea de Producción 1", "OPERATIVA", "Torno y mecanizado general"),
        ("MAQ-002", "Máquina 2", "Línea de Producción 1", "OPERATIVA", "Fresadora universal"),
        ("MAQ-003", "Máquina 3", "Línea de Envasado", "OPERATIVA", "Selladora y empacadora automática"),
        ("MAQ-004", "Máquina 4", "Área de Calderas", "OPERATIVA", "Compresor de tornillo 50HP"),
        ("MAQ-005", "Máquina 5", "Línea de Mezclado", "OPERATIVA", "Bomba centrífuga e impulsión")
    ]
    cursor.executemany("""
        INSERT INTO machines (code, name, location, status, description)
        VALUES (?, ?, ?, ?, ?)
    """, initial_machines)

    # Generic technicians (per user request: "Ingeniero 1 Ingeniero 2 etc")
    initial_technicians = [
        ("Ingeniero 1", "Ingeniero de Mantenimiento Eléctrico", "300 123 4567", "ingeniero1@planta.com"),
        ("Ingeniero 2", "Ingeniero de Mantenimiento Mecánico", "310 987 6543", "ingeniero2@planta.com"),
        ("Técnico 1", "Técnico Especialista Mecánico", "315 555 1234", "tecnico1@planta.com"),
        ("Técnico 2", "Técnico Especialista Eléctrico", "320 888 4321", "tecnico2@planta.com")
    ]
    cursor.executemany("""
        INSERT INTO technicians (name, role, phone, email)
        VALUES (?, ?, ?, ?)
    """, initial_technicians)

    # Default settings
    initial_settings = [
        ("server_ip", "192.168.68.56"),
        ("server_port", "5000"),
        ("company_name", "Planta Industrial - Control de Mantenimiento"),
    ]
    cursor.executemany("""
        INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
    """, initial_settings)

    # Seed sample realistic orders
    now = datetime.now()
    two_days_ago = now - timedelta(days=2)
    one_day_ago = now - timedelta(days=1)

    cursor.execute("""
        INSERT INTO maintenance_orders (
            order_number, machine_id, maintenance_type, operator_name,
            report_date, report_time, failure_type, machine_stopped,
            downtime_start, downtime_end, total_downtime_minutes,
            priority, description, status, technician_id,
            repair_start, repair_end, repair_duration_seconds,
            is_timer_running, spare_parts_notes, diagnosis, solution_notes
        ) VALUES (
            'OT-2026-0001', 1, 'CORRECTIVO', 'Carlos Morales (Operario)',
            ?, ?, 'MECANICA', 1,
            ?, ?, 85,
            'ALTA', 'Ruido excesivo y vibración en el cabezal del mandril', 'FINALIZADO', 1,
            ?, ?, 5100,
            0, 'Rodamiento 6205-2RS (1 unidad), Grasa sintética alta temperatura',
            'Desgaste severo en pista de rodamiento por falta de lubricación',
            'Se realizó cambio de rodamiento, alineación de eje y lubricación general.'
        )
    """, (
        two_days_ago.strftime('%Y-%m-%d'), two_days_ago.strftime('%H:%M'),
        two_days_ago.isoformat(), (two_days_ago + timedelta(minutes=85)).isoformat(),
        two_days_ago.isoformat(), (two_days_ago + timedelta(seconds=5100)).isoformat()
    ))
    order1_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO spare_parts_used (order_id, part_name, quantity, unit, part_code, unit_cost, notes)
        VALUES (?, 'Rodamiento 6205-2RS', 1, 'unidad', 'ROD-6205', 45000, 'Marca SKF')
    """, (order1_id,))

    cursor.execute("""
        INSERT INTO maintenance_orders (
            order_number, machine_id, maintenance_type, operator_name,
            report_date, report_time, failure_type, machine_stopped,
            downtime_start, priority, description, status, technician_id,
            repair_start, is_timer_running, timer_last_started_at, spare_parts_notes
        ) VALUES (
            'OT-2026-0002', 3, 'CORRECTIVO', 'Marcela Díaz (Operaria)',
            ?, ?, 'AMBAS', 1,
            ?, 'CRITICA', 'Falla de encendido y olor a recalentamiento en servomotor de sellado', 'EN_PROCESO', 2,
            ?, 1, ?, 'Contactor 24VDC, Relevo térmico'
        )
    """, (
        one_day_ago.strftime('%Y-%m-%d'), one_day_ago.strftime('%H:%M'),
        one_day_ago.isoformat(),
        (now - timedelta(minutes=42)).isoformat(),
        (now - timedelta(minutes=42)).isoformat()
    ))

    cursor.execute("UPDATE machines SET status = 'EN_MANTENIMIENTO' WHERE id = 3")

if __name__ == '__main__':
    init_db()

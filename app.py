"""
SistMaint CMMS 2.0 - Industrial Maintenance Management System
Backend REST API with Flask, SQLite & Real-Time Cloud Sync
Supports Roles (Jefe / Técnico / Operario), Failure Categorization,
Machine Dossiers (Hojas de Vida), Preventive Plans 2027, and Notifications.
"""
import os
import sys
import json
import socket
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_cors import CORS
from database import (
    get_db_connection, init_db, push_to_cloud, pull_from_cloud,
    create_notification, CLOUD_OBJECT_ID, NTFY_TOPIC
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')

app = Flask(
    __name__,
    static_folder=STATIC_DIR,
    template_folder=TEMPLATE_DIR
)
CORS(app)

# Ensure database is initialized
init_db()


def get_local_ip():
    """Detect current local LAN IP address for QR codes accessible via mobile phones"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


def commit_and_sync(conn, event_type="db_updated", summary=""):
    """Commits local SQLite transaction and pushes snapshot to Cloud DB"""
    conn.commit()
    try:
        push_to_cloud(conn, event_type=event_type, summary=summary)
    except Exception as e:
        print(f"[CloudSync] Sync warning: {e}")


def enrich_order_live_timers(item, now=None):
    if now is None:
        now = datetime.now()
    if item.get('is_timer_running') and item.get('timer_last_started_at'):
        try:
            last_start = datetime.fromisoformat(item['timer_last_started_at'])
            live_delta = int((now - last_start).total_seconds())
            item['current_live_duration_seconds'] = (item.get('repair_duration_seconds') or 0) + max(0, live_delta)
        except Exception:
            item['current_live_duration_seconds'] = item.get('repair_duration_seconds') or 0
    else:
        item['current_live_duration_seconds'] = item.get('repair_duration_seconds') or 0

    if item.get('machine_stopped') and item.get('downtime_start'):
        if item.get('status') != 'FINALIZADO':
            try:
                dt_start = datetime.fromisoformat(item['downtime_start'])
                item['current_live_downtime_minutes'] = max(0, int((now - dt_start).total_seconds() / 60))
            except Exception:
                item['current_live_downtime_minutes'] = item.get('total_downtime_minutes') or 0
        else:
            item['current_live_downtime_minutes'] = item.get('total_downtime_minutes') or 0
    else:
        item['current_live_downtime_minutes'] = 0
    return item


# ----------------- WEB PAGES & STATIC ROUTES -----------------

@app.route('/')
@app.route('/api/index.py')
@app.route('/api/index')
def index():
    try:
        return render_template('index.html')
    except Exception:
        html_file = os.path.join(TEMPLATE_DIR, 'index.html')
        with open(html_file, 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'text/html; charset=utf-8'}


@app.route('/static/<path:filename>')
@app.route('/api/index.py/static/<path:filename>')
@app.route('/api/index/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)


@app.errorhandler(404)
def fallback_404(e):
    path = request.path or ''
    if 'static/' in path:
        filename = path.split('static/', 1)[1]
        try:
            return send_from_directory(STATIC_DIR, filename)
        except Exception:
            pass
    try:
        return render_template('index.html'), 200, {'Content-Type': 'text/html; charset=utf-8'}
    except Exception:
        html_file = os.path.join(TEMPLATE_DIR, 'index.html')
        with open(html_file, 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'text/html; charset=utf-8'}


@app.route('/health')
def health():
    return jsonify({
        "status": "ok",
        "version": "2.0",
        "timestamp": datetime.now().isoformat(),
        "is_vercel": bool(os.environ.get('VERCEL')),
        "cloud_id": CLOUD_OBJECT_ID,
        "ntfy_topic": NTFY_TOPIC
    })


# ----------------- AUTHENTICATION (LOGIN JEFE) -----------------

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.json or {}
    username = (data.get('username') or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not username or not password:
        return jsonify({"error": "Ingresa usuario y contraseña"}), 400

    conn = get_db_connection()
    user = conn.execute(
        "SELECT id, username, full_name, role FROM users WHERE LOWER(username) = ? AND password = ? AND active = 1",
        (username, password)
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "Credenciales inválidas. Prueba con usuario: jefe / clave: 1234"}), 401

    return jsonify({
        "message": f"Bienvenido, {user['full_name']}",
        "user": dict(user)
    })


# ----------------- CLOUD SYNC & BOOTSTRAP -----------------

@app.route('/api/cloud/pull', methods=['POST'])
def force_cloud_pull():
    conn = get_db_connection(pull_cloud_if_needed=False)
    ok = False
    try:
        ok = pull_from_cloud(conn)
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500
    conn.close()
    return jsonify({"synced": ok, "timestamp": datetime.now().isoformat()})


@app.route('/api/cloud/reset-demo', methods=['POST'])
def reset_demo_data():
    """Resets DB to the clean 2-object test state and syncs to cloud"""
    from database import seed_v2_data
    conn = get_db_connection(pull_cloud_if_needed=False)
    cursor = conn.cursor()
    seed_v2_data(cursor)
    commit_and_sync(conn, event_type="db_reset", summary="Base de datos reiniciada con los 2 objetos de prueba")
    conn.close()
    return jsonify({"message": "Datos de prueba (2 objetos) restaurados y sincronizados en la nube"})


# ----------------- SETTINGS & NETWORK IP -----------------

@app.route('/api/settings', methods=['GET'])
def get_settings():
    conn = get_db_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings = {row['key']: row['value'] for row in rows}

    current_lan_ip = get_local_ip()
    port = settings.get('server_port', '5000')
    configured_ip = settings.get('server_ip', current_lan_ip)

    if os.environ.get('VERCEL') or (request.host and not request.host.startswith('127.0.0.1') and not request.host.startswith('localhost')):
        qr_base = request.host_url.rstrip('/')
    else:
        qr_base = f"http://{configured_ip}:{port}"

    conn.close()
    return jsonify({
        "server_ip": configured_ip,
        "detected_lan_ip": current_lan_ip,
        "server_port": port,
        "company_name": settings.get('company_name', 'SistMaint CMMS'),
        "qr_base_url": qr_base,
        "cloud_object_id": CLOUD_OBJECT_ID,
        "ntfy_topic": NTFY_TOPIC
    })


@app.route('/api/settings', methods=['PUT'])
def update_settings():
    data = request.json or {}
    conn = get_db_connection()
    for key in ['server_ip', 'server_port', 'company_name']:
        if key in data:
            conn.execute("""
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """, (key, str(data[key])))
    commit_and_sync(conn, event_type="settings_updated", summary="Configuración actualizada")
    conn.close()
    return jsonify({"message": "Configuración guardada y sincronizada en la nube"})


# ----------------- FAILURE CATEGORIES CRUD -----------------

@app.route('/api/categories', methods=['GET'])
def get_categories():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM failure_categories WHERE active = 1 ORDER BY id ASC").fetchall()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d['subcategories_list'] = json.loads(d.get('subcategories') or '[]')
        except Exception:
            d['subcategories_list'] = []
        result.append(d)
    conn.close()
    return jsonify(result)


@app.route('/api/categories', methods=['POST'])
def create_category():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "El nombre de la categoría es obligatorio"}), 400

    code = (data.get('code') or name.upper().replace(' ', '_')).strip().upper()
    color = (data.get('color') or '#6366f1').strip()
    icon = (data.get('icon') or 'fa-tag').strip()
    description = (data.get('description') or '').strip()
    subcats = data.get('subcategories_list') or data.get('subcategories') or []
    if isinstance(subcats, str):
        subcats = [s.strip() for s in subcats.split(',') if s.strip()]

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO failure_categories (code, name, color, icon, subcategories, description, active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        """, (code, name, color, icon, json.dumps(subcats, ensure_ascii=False), description))
        new_id = cursor.lastrowid
        commit_and_sync(conn, event_type="category_created", summary=f"Nueva categoría de falla: {name}")
        conn.close()
        return jsonify({"message": "Categoría de falla creada", "id": new_id}), 201
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Error al crear categoría: {str(e)}"}), 400


@app.route('/api/categories/<int:cat_id>', methods=['PUT'])
def update_category(cat_id):
    data = request.json or {}
    name = (data.get('name') or '').strip()
    color = (data.get('color') or '#6366f1').strip()
    icon = (data.get('icon') or 'fa-tag').strip()
    description = (data.get('description') or '').strip()
    subcats = data.get('subcategories_list') or data.get('subcategories') or []
    if isinstance(subcats, str):
        subcats = [s.strip() for s in subcats.split(',') if s.strip()]

    conn = get_db_connection()
    conn.execute("""
        UPDATE failure_categories
        SET name = ?, color = ?, icon = ?, subcategories = ?, description = ?
        WHERE id = ?
    """, (name, color, icon, json.dumps(subcats, ensure_ascii=False), description, cat_id))
    commit_and_sync(conn, event_type="category_updated", summary=f"Categoría actualizada: {name}")
    conn.close()
    return jsonify({"message": "Categoría actualizada exitosamente"})


@app.route('/api/categories/<int:cat_id>', methods=['DELETE'])
def delete_category(cat_id):
    conn = get_db_connection()
    conn.execute("UPDATE failure_categories SET active = 0 WHERE id = ?", (cat_id,))
    commit_and_sync(conn, event_type="category_deleted", summary="Categoría desactivada")
    conn.close()
    return jsonify({"message": "Categoría eliminada"})


# ----------------- DASHBOARD & METRICS -----------------

@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    conn = get_db_connection()

    total_orders = conn.execute("SELECT COUNT(*) FROM maintenance_orders").fetchone()[0]
    pending_orders = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE status = 'PENDIENTE'").fetchone()[0]
    in_progress_orders = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE status IN ('EN_PROCESO', 'PAUSADO')").fetchone()[0]
    finished_orders = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE status = 'FINALIZADO'").fetchone()[0]

    machines_stopped = conn.execute("""
        SELECT COUNT(*) FROM machines WHERE status IN ('PARADA', 'EN_MANTENIMIENTO')
    """).fetchone()[0]

    total_downtime = conn.execute("""
        SELECT COALESCE(SUM(total_downtime_minutes), 0) FROM maintenance_orders WHERE machine_stopped = 1
    """).fetchone()[0]

    avg_repair_sec = conn.execute("""
        SELECT COALESCE(AVG(repair_duration_seconds), 0) FROM maintenance_orders 
        WHERE status = 'FINALIZADO' AND repair_duration_seconds > 0
    """).fetchone()[0]
    avg_repair_minutes = round(avg_repair_sec / 60, 1)

    failure_counts = conn.execute("""
        SELECT failure_type, COUNT(*) as count 
        FROM maintenance_orders 
        GROUP BY failure_type
    """).fetchall()
    failures_by_type = {row['failure_type']: row['count'] for row in failure_counts}

    maint_counts = conn.execute("""
        SELECT maintenance_type, COUNT(*) as count 
        FROM maintenance_orders 
        GROUP BY maintenance_type
    """).fetchall()
    maintenance_by_type = {row['maintenance_type']: row['count'] for row in maint_counts}

    total_machines = conn.execute("SELECT COUNT(*) FROM machines").fetchone()[0]
    total_technicians = conn.execute("SELECT COUNT(*) FROM technicians WHERE active = 1").fetchone()[0]
    total_plans_2027 = conn.execute("SELECT COUNT(*) FROM maintenance_plans WHERE year = 2027").fetchone()[0]
    unread_notifications = conn.execute("SELECT COUNT(*) FROM notifications WHERE is_read = 0").fetchone()[0]

    recent_rows = conn.execute("""
        SELECT o.*, m.name as machine_name, m.code as machine_code, t.name as technician_name
        FROM maintenance_orders o
        JOIN machines m ON o.machine_id = m.id
        LEFT JOIN technicians t ON o.technician_id = t.id
        ORDER BY o.id DESC LIMIT 8
    """).fetchall()
    now = datetime.now()
    recent_orders = [enrich_order_live_timers(dict(r), now) for r in recent_rows]

    conn.close()

    return jsonify({
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "in_progress_orders": in_progress_orders,
        "finished_orders": finished_orders,
        "machines_stopped": machines_stopped,
        "total_downtime_minutes": total_downtime,
        "avg_repair_minutes": avg_repair_minutes,
        "total_machines": total_machines,
        "total_technicians": total_technicians,
        "total_plans_2027": total_plans_2027,
        "unread_notifications": unread_notifications,
        "failures_by_type": failures_by_type,
        "maintenance_by_type": maintenance_by_type,
        "recent_orders": recent_orders
    })


# ----------------- MACHINES & HOJAS DE VIDA (DOSSIER) -----------------

@app.route('/api/machines', methods=['GET'])
def get_machines():
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT m.*, 
            (SELECT COUNT(*) FROM maintenance_orders WHERE machine_id = m.id AND status IN ('PENDIENTE', 'EN_PROCESO', 'PAUSADO')) as active_orders_count,
            (SELECT COUNT(*) FROM maintenance_orders WHERE machine_id = m.id AND status = 'FINALIZADO') as finished_orders_count,
            (SELECT COUNT(*) FROM maintenance_plans WHERE machine_id = m.id) as plans_count,
            (SELECT COALESCE(SUM(total_downtime_minutes), 0) FROM maintenance_orders WHERE machine_id = m.id) as total_downtime_minutes
        FROM machines m
        ORDER BY m.code ASC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/machines/<int:machine_id>', methods=['GET'])
def get_machine_dossier(machine_id):
    """Returns full Hoja de Vida (Dossier): specs, KPIs, order history, spare parts, plans & notifications"""
    conn = get_db_connection()
    machine = conn.execute("SELECT * FROM machines WHERE id = ?", (machine_id,)).fetchone()
    if not machine:
        conn.close()
        return jsonify({"error": "Máquina no encontrada"}), 404

    history_rows = conn.execute("""
        SELECT o.*, t.name as technician_name, t.role as technician_role
        FROM maintenance_orders o
        LEFT JOIN technicians t ON o.technician_id = t.id
        WHERE o.machine_id = ?
        ORDER BY o.id DESC
    """, (machine_id,)).fetchall()

    now = datetime.now()
    history = []
    total_repair_sec = 0
    finished_count = 0
    total_downtime_min = 0

    for h in history_rows:
        d = enrich_order_live_timers(dict(h), now)
        parts = conn.execute("SELECT * FROM spare_parts_used WHERE order_id = ?", (d['id'],)).fetchall()
        d['parts'] = [dict(p) for p in parts]
        history.append(d)
        total_downtime_min += (d.get('current_live_downtime_minutes') or d.get('total_downtime_minutes') or 0)
        if d.get('status') == 'FINALIZADO' and (d.get('repair_duration_seconds') or 0) > 0:
            total_repair_sec += d['repair_duration_seconds']
            finished_count += 1

    plans_rows = conn.execute("""
        SELECT p.*, t.name as technician_name
        FROM maintenance_plans p
        LEFT JOIN technicians t ON p.assigned_technician_id = t.id
        WHERE p.machine_id = ?
        ORDER BY p.year DESC, p.scheduled_date ASC
    """, (machine_id,)).fetchall()
    plans = []
    for p in plans_rows:
        pd = dict(p)
        try:
            pd['months'] = json.loads(pd.get('months_json') or '[]')
        except Exception:
            pd['months'] = []
        try:
            pd['checklist'] = json.loads(pd.get('checklist_json') or '[]')
        except Exception:
            pd['checklist'] = []
        plans.append(pd)

    notifs_rows = conn.execute("""
        SELECT * FROM notifications WHERE machine_id = ? ORDER BY id DESC LIMIT 15
    """, (machine_id,)).fetchall()

    parts_cost_row = conn.execute("""
        SELECT COALESCE(SUM(sp.quantity * sp.unit_cost), 0)
        FROM spare_parts_used sp
        JOIN maintenance_orders o ON sp.order_id = o.id
        WHERE o.machine_id = ?
    """, (machine_id,)).fetchone()
    total_parts_cost = parts_cost_row[0] if parts_cost_row else 0

    mttr_minutes = round((total_repair_sec / finished_count) / 60, 1) if finished_count > 0 else 0

    conn.close()
    return jsonify({
        "machine": dict(machine),
        "kpis": {
            "total_orders": len(history),
            "finished_orders": finished_count,
            "total_downtime_minutes": total_downtime_min,
            "mttr_minutes": mttr_minutes,
            "total_parts_cost": total_parts_cost,
            "plans_count": len(plans)
        },
        "history": history,
        "plans": plans,
        "notifications": [dict(n) for n in notifs_rows]
    })


@app.route('/api/machines', methods=['POST'])
def create_machine():
    data = request.json or {}
    code = (data.get('code') or '').strip().upper()
    name = (data.get('name') or '').strip()
    location = (data.get('location') or 'Planta Principal').strip()
    description = (data.get('description') or '').strip()
    brand = (data.get('brand') or '').strip()
    model = (data.get('model') or '').strip()
    serial_number = (data.get('serial_number') or '').strip()
    install_date = (data.get('install_date') or '').strip()
    voltage = (data.get('voltage') or '220V / 440V').strip()
    power_kw = (data.get('power_kw') or '').strip()
    criticality = (data.get('criticality') or 'ALTA').strip().upper()
    supplier = (data.get('supplier') or '').strip()
    critical_parts = (data.get('critical_parts') or '').strip()
    preventive_interval_days = int(data.get('preventive_interval_days') or 30)
    last_maintenance_date = (data.get('last_maintenance_date') or '').strip()
    next_maintenance_date = (data.get('next_maintenance_date') or '').strip()
    life_notes = (data.get('life_notes') or '').strip()

    if not code or not name:
        return jsonify({"error": "El código y el nombre de la máquina son obligatorios"}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO machines (
                code, name, location, status, description,
                brand, model, serial_number, install_date,
                voltage, power_kw, criticality, supplier,
                critical_parts, preventive_interval_days, last_maintenance_date, next_maintenance_date,
                life_notes
            ) VALUES (?, ?, ?, 'OPERATIVA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            code, name, location, description,
            brand, model, serial_number, install_date,
            voltage, power_kw, criticality, supplier,
            critical_parts, preventive_interval_days, last_maintenance_date, next_maintenance_date,
            life_notes
        ))
        new_id = cursor.lastrowid

        create_notification(
            conn,
            title=f"📋 Nueva Hoja de Vida Creada: {code} - {name}",
            message=f"Se registró la máquina {name} ({brand} {model}) en {location}. Criticidad: {criticality}.",
            severity="INFO",
            category="HOJA_DE_VIDA",
            target_role="ALL",
            machine_id=new_id
        )

        commit_and_sync(conn, event_type="machine_created", summary=f"Máquina creada: {code} - {name}")
        conn.close()
        return jsonify({"message": "Máquina y Hoja de Vida creadas exitosamente", "id": new_id}), 201
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Error al guardar máquina: {str(e)}"}), 400


@app.route('/api/machines/<int:machine_id>', methods=['PUT'])
def update_machine(machine_id):
    data = request.json or {}
    conn = get_db_connection()
    curr = conn.execute("SELECT * FROM machines WHERE id = ?", (machine_id,)).fetchone()
    if not curr:
        conn.close()
        return jsonify({"error": "Máquina no encontrada"}), 404

    code = (data.get('code') or curr['code']).strip().upper()
    name = (data.get('name') or curr['name']).strip()
    location = (data.get('location') if 'location' in data else curr['location']).strip()
    status = (data.get('status') or curr['status']).strip()
    description = (data.get('description') if 'description' in data else curr['description']).strip()
    brand = (data.get('brand') if 'brand' in data else (curr['brand'] or '')).strip()
    model = (data.get('model') if 'model' in data else (curr['model'] or '')).strip()
    serial_number = (data.get('serial_number') if 'serial_number' in data else (curr['serial_number'] or '')).strip()
    install_date = (data.get('install_date') if 'install_date' in data else (curr['install_date'] or '')).strip()
    voltage = (data.get('voltage') if 'voltage' in data else (curr['voltage'] or '')).strip()
    power_kw = (data.get('power_kw') if 'power_kw' in data else (curr['power_kw'] or '')).strip()
    criticality = (data.get('criticality') if 'criticality' in data else (curr['criticality'] or 'ALTA')).strip()
    supplier = (data.get('supplier') if 'supplier' in data else (curr['supplier'] or '')).strip()
    critical_parts = (data.get('critical_parts') if 'critical_parts' in data else (curr['critical_parts'] or '')).strip()
    preventive_interval_days = int(data.get('preventive_interval_days') or curr['preventive_interval_days'] or 30)
    last_maintenance_date = (data.get('last_maintenance_date') if 'last_maintenance_date' in data else (curr['last_maintenance_date'] or '')).strip()
    next_maintenance_date = (data.get('next_maintenance_date') if 'next_maintenance_date' in data else (curr['next_maintenance_date'] or '')).strip()
    life_notes = (data.get('life_notes') if 'life_notes' in data else (curr['life_notes'] or '')).strip()

    try:
        conn.execute("""
            UPDATE machines 
            SET code = ?, name = ?, location = ?, status = ?, description = ?,
                brand = ?, model = ?, serial_number = ?, install_date = ?,
                voltage = ?, power_kw = ?, criticality = ?, supplier = ?,
                critical_parts = ?, preventive_interval_days = ?,
                last_maintenance_date = ?, next_maintenance_date = ?, life_notes = ?
            WHERE id = ?
        """, (
            code, name, location, status, description,
            brand, model, serial_number, install_date,
            voltage, power_kw, criticality, supplier,
            critical_parts, preventive_interval_days,
            last_maintenance_date, next_maintenance_date, life_notes,
            machine_id
        ))

        if data.get('notify_team', True):
            create_notification(
                conn,
                title=f"📋 Hoja de Vida Actualizada: {code} - {name}",
                message=f"Ficha técnica actualizada ({status}). Próximo preventivo: {next_maintenance_date or 'Por definir'}.",
                severity="WARNING" if status != 'OPERATIVA' else "INFO",
                category="HOJA_DE_VIDA",
                target_role="ALL",
                machine_id=machine_id
            )

        commit_and_sync(conn, event_type="machine_updated", summary=f"Hoja de Vida actualizada: {code}")
        conn.close()
        return jsonify({"message": "Máquina y Hoja de Vida actualizadas correctamente"})
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Error: {str(e)}"}), 400


@app.route('/api/machines/<int:machine_id>/notify', methods=['POST'])
def send_machine_dossier_alert(machine_id):
    """Explicit alert triggered from a Machine's Hoja de Vida to Jefes & Técnicos"""
    data = request.json or {}
    conn = get_db_connection()
    machine = conn.execute("SELECT * FROM machines WHERE id = ?", (machine_id,)).fetchone()
    if not machine:
        conn.close()
        return jsonify({"error": "Máquina no encontrada"}), 404

    title = (data.get('title') or f"⚠️ Alerta de Hoja de Vida: {machine['code']} - {machine['name']}").strip()
    message = (data.get('message') or f"Se requiere revisión técnica en {machine['name']} ({machine['location']}).").strip()
    severity = (data.get('severity') or 'WARNING').upper()
    target_role = (data.get('target_role') or 'ALL').upper()

    notif_id = create_notification(
        conn,
        title=title,
        message=message,
        severity=severity,
        category="HOJA_DE_VIDA",
        target_role=target_role,
        machine_id=machine_id
    )
    commit_and_sync(conn, event_type="dossier_alert", summary=title)
    conn.close()
    return jsonify({"message": "Notificación enviada a Jefes y Técnicos", "id": notif_id}), 201


@app.route('/api/machines/<int:machine_id>', methods=['DELETE'])
def delete_machine(machine_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM spare_parts_used WHERE order_id IN (SELECT id FROM maintenance_orders WHERE machine_id = ?)", (machine_id,))
    conn.execute("DELETE FROM maintenance_orders WHERE machine_id = ?", (machine_id,))
    conn.execute("DELETE FROM maintenance_plans WHERE machine_id = ?", (machine_id,))
    conn.execute("DELETE FROM notifications WHERE machine_id = ?", (machine_id,))
    conn.execute("DELETE FROM machines WHERE id = ?", (machine_id,))
    commit_and_sync(conn, event_type="machine_deleted", summary="Máquina eliminada")
    conn.close()
    return jsonify({"message": "Máquina eliminada exitosamente"})


# ----------------- MAINTENANCE PLANS & PLAN PREVENTIVO 2027 -----------------

@app.route('/api/plans', methods=['GET'])
def get_plans():
    conn = get_db_connection()
    year = request.args.get('year')
    machine_id = request.args.get('machine_id')

    query = """
        SELECT p.*, m.name as machine_name, m.code as machine_code, m.location as machine_location,
               t.name as technician_name, t.specialty as technician_specialty
        FROM maintenance_plans p
        JOIN machines m ON p.machine_id = m.id
        LEFT JOIN technicians t ON p.assigned_technician_id = t.id
        WHERE 1=1
    """
    params = []
    if year:
        query += " AND p.year = ?"
        params.append(int(year))
    if machine_id:
        query += " AND p.machine_id = ?"
        params.append(int(machine_id))

    query += " ORDER BY p.year DESC, p.scheduled_date ASC, p.id DESC"
    rows = conn.execute(query, params).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d['months'] = json.loads(d.get('months_json') or '[]')
        except Exception:
            d['months'] = []
        try:
            d['checklist'] = json.loads(d.get('checklist_json') or '[]')
        except Exception:
            d['checklist'] = []
        result.append(d)
    conn.close()
    return jsonify(result)


@app.route('/api/plans', methods=['POST'])
def create_plan():
    data = request.json or {}
    machine_id = data.get('machine_id')
    title = (data.get('title') or '').strip()
    if not machine_id or not title:
        return jsonify({"error": "Máquina y título del plan son obligatorios"}), 400

    maint_type = (data.get('maintenance_type') or 'PREVENTIVO').upper()
    frequency = (data.get('frequency') or 'MENSUAL').upper()
    year = int(data.get('year') or 2027)
    months = data.get('months') or [1, 4, 7, 10]
    if isinstance(months, str):
        months = [int(x.strip()) for x in months.split(',') if x.strip().isdigit()]

    scheduled_date = (data.get('scheduled_date') or f"{year}-01-15").strip()
    estimated_minutes = int(data.get('estimated_minutes') or 60)
    assigned_tech_id = data.get('assigned_technician_id') or None
    description = (data.get('description') or '').strip()
    checklist = data.get('checklist') or []
    if isinstance(checklist, str):
        checklist = [{"task": line.strip(), "done": False} for line in checklist.splitlines() if line.strip()]

    conn = get_db_connection()
    machine = conn.execute("SELECT * FROM machines WHERE id = ?", (machine_id,)).fetchone()
    if not machine:
        conn.close()
        return jsonify({"error": "Máquina no encontrada"}), 404

    count_row = conn.execute("SELECT COUNT(*) FROM maintenance_plans WHERE year = ?", (year,)).fetchone()
    plan_code = data.get('plan_code') or f"PLAN-{year}-{str(count_row[0] + 1).zfill(3)}"

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO maintenance_plans (
            plan_code, machine_id, title, maintenance_type, frequency, year,
            months_json, scheduled_date, estimated_minutes, assigned_technician_id,
            checklist_json, description, status, notify_days_before
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROGRAMADO', 5)
    """, (
        plan_code, machine_id, title, maint_type, frequency, year,
        json.dumps(months), scheduled_date, estimated_minutes, assigned_tech_id,
        json.dumps(checklist, ensure_ascii=False), description
    ))
    plan_id = cursor.lastrowid

    # Update machine's next_maintenance_date in Hoja de Vida
    cursor.execute("UPDATE machines SET next_maintenance_date = ? WHERE id = ?", (scheduled_date, machine_id))

    create_notification(
        conn,
        title=f"📅 Nuevo Plan {year} ({plan_code}) en {machine['name']}",
        message=f"Se programó '{title}' ({frequency}) en la Hoja de Vida de {machine['code']}. Próxima fecha: {scheduled_date}.",
        severity="INFO",
        category="PLAN_PREVENTIVO",
        target_role="ALL",
        machine_id=machine_id,
        plan_id=plan_id
    )

    commit_and_sync(conn, event_type="plan_created", summary=f"Nuevo Plan {plan_code}: {title}")
    conn.close()
    return jsonify({"message": f"Plan de mantenimiento {plan_code} creado exitosamente", "id": plan_id, "plan_code": plan_code}), 201


@app.route('/api/plans/<int:plan_id>', methods=['PUT'])
def update_plan(plan_id):
    data = request.json or {}
    conn = get_db_connection()
    curr = conn.execute("SELECT * FROM maintenance_plans WHERE id = ?", (plan_id,)).fetchone()
    if not curr:
        conn.close()
        return jsonify({"error": "Plan no encontrado"}), 404

    title = (data.get('title') or curr['title']).strip()
    maint_type = (data.get('maintenance_type') or curr['maintenance_type']).upper()
    frequency = (data.get('frequency') or curr['frequency']).upper()
    year = int(data.get('year') or curr['year'])
    scheduled_date = (data.get('scheduled_date') or curr['scheduled_date']).strip()
    estimated_minutes = int(data.get('estimated_minutes') or curr['estimated_minutes'] or 60)
    assigned_tech_id = data.get('assigned_technician_id') if 'assigned_technician_id' in data else curr['assigned_technician_id']
    status = (data.get('status') or curr['status']).upper()
    description = (data.get('description') if 'description' in data else (curr['description'] or '')).strip()

    if 'months' in data:
        months_json = json.dumps(data['months'])
    else:
        months_json = curr['months_json']

    if 'checklist' in data:
        checklist = data['checklist']
        if isinstance(checklist, str):
            checklist = [{"task": line.strip(), "done": False} for line in checklist.splitlines() if line.strip()]
        checklist_json = json.dumps(checklist, ensure_ascii=False)
    else:
        checklist_json = curr['checklist_json']

    conn.execute("""
        UPDATE maintenance_plans
        SET title = ?, maintenance_type = ?, frequency = ?, year = ?,
            months_json = ?, scheduled_date = ?, estimated_minutes = ?,
            assigned_technician_id = ?, checklist_json = ?, description = ?, status = ?
        WHERE id = ?
    """, (
        title, maint_type, frequency, year,
        months_json, scheduled_date, estimated_minutes,
        assigned_tech_id, checklist_json, description, status, plan_id
    ))
    commit_and_sync(conn, event_type="plan_updated", summary=f"Plan {curr['plan_code']} actualizado")
    conn.close()
    return jsonify({"message": "Plan actualizado correctamente"})


@app.route('/api/plans/<int:plan_id>/launch-order', methods=['POST'])
def launch_order_from_plan(plan_id):
    """Generates a Maintenance Order from a Preventive/Predictive Plan and notifies Technicians"""
    conn = get_db_connection()
    plan = conn.execute("""
        SELECT p.*, m.name as machine_name, m.code as machine_code
        FROM maintenance_plans p
        JOIN machines m ON p.machine_id = m.id
        WHERE p.id = ?
    """, (plan_id,)).fetchone()

    if not plan:
        conn.close()
        return jsonify({"error": "Plan no encontrado"}), 404

    now = datetime.now()
    year = now.strftime('%Y')
    count_row = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE order_number LIKE ?", (f"OT-{year}-%",)).fetchone()
    order_number = f"OT-{year}-{str(count_row[0] + 1).zfill(4)}"

    checklist_items = []
    try:
        checklist_items = [c.get('task', '') for c in json.loads(plan['checklist_json'] or '[]') if c.get('task')]
    except Exception:
        pass
    checklist_str = " | ".join(checklist_items)
    desc = f"[Ejecución {plan['plan_code']}] {plan['title']}. Tareas: {checklist_str or plan['description']}"

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO maintenance_orders (
            order_number, machine_id, maintenance_type, operator_name,
            report_date, report_time, failure_type, failure_subcategory,
            machine_stopped, priority, description, status, technician_id, plan_id
        ) VALUES (?, ?, ?, 'Jefe de Mantenimiento (Plan Programado)', ?, ?, 'MECANICA', 'Mantenimiento Programado', 0, 'MEDIA', ?, 'PENDIENTE', ?, ?)
    """, (
        order_number, plan['machine_id'], plan['maintenance_type'],
        now.strftime('%Y-%m-%d'), now.strftime('%H:%M'),
        desc, plan['assigned_technician_id'], plan_id
    ))
    order_id = cursor.lastrowid

    cursor.execute("UPDATE maintenance_plans SET status = 'EN_PROCESO' WHERE id = ?", (plan_id,))
    cursor.execute("UPDATE machines SET status = 'EN_MANTENIMIENTO' WHERE id = ?", (plan['machine_id'],))

    create_notification(
        conn,
        title=f"🛠️ Orden {order_number} Lanzada desde Plan {plan['plan_code']}",
        message=f"Se activó mantenimiento {plan['maintenance_type']} en {plan['machine_name']} ({plan['title']}).",
        severity="WARNING",
        category="PLAN_PREVENTIVO",
        target_role="ALL",
        machine_id=plan['machine_id'],
        order_id=order_id,
        plan_id=plan_id
    )

    commit_and_sync(conn, event_type="order_from_plan", summary=f"Orden {order_number} generada desde {plan['plan_code']}")
    conn.close()
    return jsonify({
        "message": f"Orden de trabajo {order_number} generada exitosamente",
        "order_id": order_id,
        "order_number": order_number
    }), 201


@app.route('/api/plans/<int:plan_id>', methods=['DELETE'])
def delete_plan(plan_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM maintenance_plans WHERE id = ?", (plan_id,))
    commit_and_sync(conn, event_type="plan_deleted", summary="Plan de mantenimiento eliminado")
    conn.close()
    return jsonify({"message": "Plan eliminado"})


# ----------------- NOTIFICATIONS -----------------

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    conn = get_db_connection()
    role = (request.args.get('role') or 'ALL').upper()

    if role in ['JEFE', 'TECNICO']:
        rows = conn.execute("""
            SELECT n.*, m.name as machine_name, m.code as machine_code
            FROM notifications n
            LEFT JOIN machines m ON n.machine_id = m.id
            WHERE n.target_role IN ('ALL', ?)
            ORDER BY n.id DESC LIMIT 35
        """, (role,)).fetchall()
    else:
        rows = conn.execute("""
            SELECT n.*, m.name as machine_name, m.code as machine_code
            FROM notifications n
            LEFT JOIN machines m ON n.machine_id = m.id
            ORDER BY n.id DESC LIMIT 35
        """).fetchall()

    unread_count = conn.execute("SELECT COUNT(*) FROM notifications WHERE is_read = 0").fetchone()[0]
    conn.close()
    return jsonify({
        "unread_count": unread_count,
        "items": [dict(r) for r in rows]
    })


@app.route('/api/notifications/<int:notif_id>/read', methods=['POST'])
def mark_notification_read(notif_id):
    conn = get_db_connection()
    conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notif_id,))
    commit_and_sync(conn, event_type="notif_read", summary="")
    conn.close()
    return jsonify({"message": "Notificación marcada como leída"})


@app.route('/api/notifications/read-all', methods=['POST'])
def mark_all_notifications_read():
    conn = get_db_connection()
    conn.execute("UPDATE notifications SET is_read = 1")
    commit_and_sync(conn, event_type="notif_read_all", summary="")
    conn.close()
    return jsonify({"message": "Todas las notificaciones marcadas como leídas"})


# ----------------- TECHNICIANS CRUD -----------------

@app.route('/api/technicians', methods=['GET'])
def get_technicians():
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT t.*, 
            (SELECT COUNT(*) FROM maintenance_orders WHERE technician_id = t.id AND status IN ('EN_PROCESO', 'PENDIENTE')) as active_orders,
            (SELECT COUNT(*) FROM maintenance_orders WHERE technician_id = t.id AND status = 'FINALIZADO') as finished_orders
        FROM technicians t
        WHERE t.active = 1
        ORDER BY t.name ASC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/technicians', methods=['POST'])
def create_technician():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    role = (data.get('role') or 'Técnico de Mantenimiento').strip()
    specialty = (data.get('specialty') or 'Multidisciplinario').strip()
    phone = (data.get('phone') or '').strip()
    email = (data.get('email') or '').strip()

    if not name:
        return jsonify({"error": "El nombre del técnico/ingeniero es obligatorio"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO technicians (name, role, specialty, phone, email)
        VALUES (?, ?, ?, ?, ?)
    """, (name, role, specialty, phone, email))
    new_id = cursor.lastrowid
    commit_and_sync(conn, event_type="tech_created", summary=f"Técnico registrado: {name}")
    conn.close()
    return jsonify({"message": "Técnico registrado correctamente", "id": new_id}), 201


@app.route('/api/technicians/<int:tech_id>', methods=['PUT'])
def update_technician(tech_id):
    data = request.json or {}
    name = (data.get('name') or '').strip()
    role = (data.get('role') or '').strip()
    specialty = (data.get('specialty') or 'Multidisciplinario').strip()
    phone = (data.get('phone') or '').strip()
    email = (data.get('email') or '').strip()

    if not name:
        return jsonify({"error": "El nombre es obligatorio"}), 400

    conn = get_db_connection()
    conn.execute("""
        UPDATE technicians 
        SET name = ?, role = ?, specialty = ?, phone = ?, email = ?
        WHERE id = ?
    """, (name, role, specialty, phone, email, tech_id))
    commit_and_sync(conn, event_type="tech_updated", summary=f"Técnico actualizado: {name}")
    conn.close()
    return jsonify({"message": "Técnico actualizado"})


@app.route('/api/technicians/<int:tech_id>', methods=['DELETE'])
def delete_technician(tech_id):
    conn = get_db_connection()
    conn.execute("UPDATE technicians SET active = 0 WHERE id = ?", (tech_id,))
    commit_and_sync(conn, event_type="tech_deleted", summary="Técnico eliminado")
    conn.close()
    return jsonify({"message": "Técnico desactivado"})


# ----------------- MAINTENANCE ORDERS -----------------

@app.route('/api/orders', methods=['GET'])
def get_orders():
    conn = get_db_connection()
    status = request.args.get('status')
    machine_id = request.args.get('machine_id')
    maint_type = request.args.get('type')
    failure_type = request.args.get('failure')
    search = request.args.get('search', '').strip()

    query = """
        SELECT o.*, m.name as machine_name, m.code as machine_code, m.location as machine_location,
               t.name as technician_name, t.role as technician_role
        FROM maintenance_orders o
        JOIN machines m ON o.machine_id = m.id
        LEFT JOIN technicians t ON o.technician_id = t.id
        WHERE 1=1
    """
    params = []

    if status:
        query += " AND o.status = ?"
        params.append(status)
    if machine_id:
        query += " AND o.machine_id = ?"
        params.append(machine_id)
    if maint_type:
        query += " AND o.maintenance_type = ?"
        params.append(maint_type)
    if failure_type:
        query += " AND o.failure_type = ?"
        params.append(failure_type)
    if search:
        query += " AND (o.order_number LIKE ? OR o.operator_name LIKE ? OR o.description LIKE ? OR m.name LIKE ? OR o.failure_subcategory LIKE ?)"
        wild = f"%{search}%"
        params.extend([wild, wild, wild, wild, wild])

    query += " ORDER BY o.id DESC"
    rows = conn.execute(query, params).fetchall()

    now = datetime.now()
    result = [enrich_order_live_timers(dict(row), now) for row in rows]
    conn.close()
    return jsonify(result)


@app.route('/api/orders/<int:order_id>', methods=['GET'])
def get_order(order_id):
    conn = get_db_connection()
    row = conn.execute("""
        SELECT o.*, m.name as machine_name, m.code as machine_code, m.location as machine_location,
               t.name as technician_name, t.role as technician_role, t.phone as technician_phone
        FROM maintenance_orders o
        JOIN machines m ON o.machine_id = m.id
        LEFT JOIN technicians t ON o.technician_id = t.id
        WHERE o.id = ?
    """, (order_id,)).fetchone()

    if not row:
        conn.close()
        return jsonify({"error": "Orden de mantenimiento no encontrada"}), 404

    order = enrich_order_live_timers(dict(row))
    parts = conn.execute("SELECT * FROM spare_parts_used WHERE order_id = ? ORDER BY id ASC", (order_id,)).fetchall()
    order['parts'] = [dict(p) for p in parts]

    conn.close()
    return jsonify(order)


@app.route('/api/orders', methods=['POST'])
def create_order():
    """
    Creates an order from Operator QR Report or Boss panel.
    NOTE: Operator cannot choose maintenance_type or assign technician_id;
    only when is_boss=True are those fields accepted directly.
    """
    data = request.json or {}
    machine_id = data.get('machine_id')
    machine_code = data.get('machine_code')
    is_boss = bool(data.get('is_boss'))

    conn = get_db_connection()

    if not machine_id and machine_code:
        m_row = conn.execute("SELECT id FROM machines WHERE code = ?", (machine_code.strip().upper(),)).fetchone()
        if m_row:
            machine_id = m_row['id']

    if not machine_id:
        conn.close()
        return jsonify({"error": "Debe seleccionar o escanear una máquina válida"}), 400

    m_check = conn.execute("SELECT * FROM machines WHERE id = ?", (machine_id,)).fetchone()
    if not m_check:
        conn.close()
        return jsonify({"error": "La máquina seleccionada no existe"}), 404

    operator_name = (data.get('operator_name') or '').strip()
    if not operator_name:
        conn.close()
        return jsonify({"error": "El nombre completo del reportante/operario es obligatorio"}), 400

    now = datetime.now()
    report_date = data.get('report_date') or now.strftime('%Y-%m-%d')
    report_time = data.get('report_time') or now.strftime('%H:%M')

    # Rule: Only Jefe can specify maintenance_type and technician_id on creation
    if is_boss:
        maint_type = (data.get('maintenance_type') or 'CORRECTIVO').upper()
        if maint_type not in ['CORRECTIVO', 'PREVENTIVO', 'PREDICTIVO']:
            maint_type = 'CORRECTIVO'
        technician_id = data.get('technician_id') or None
        priority = (data.get('priority') or 'MEDIA').upper()
    else:
        maint_type = 'CORRECTIVO'
        technician_id = None
        priority = 'ALTA' if data.get('machine_stopped') in [1, True, '1', 'true', 'si', 'SI'] else 'MEDIA'

    failure_type = (data.get('failure_type') or 'NO_SABE').upper()
    failure_subcategory = (data.get('failure_subcategory') or '').strip()
    machine_stopped = 1 if data.get('machine_stopped') in [1, True, '1', 'true', 'si', 'SI'] else 0
    description = (data.get('description') or '').strip()
    if not description:
        description = f"Reporte de falla ({failure_type} {failure_subcategory}) reportado por {operator_name}"

    year = now.strftime('%Y')
    count_row = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE order_number LIKE ?", (f"OT-{year}-%",)).fetchone()
    next_num = count_row[0] + 1
    order_number = f"OT-{year}-{str(next_num).zfill(4)}"

    downtime_start = now.isoformat() if machine_stopped else None

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO maintenance_orders (
            order_number, machine_id, maintenance_type, operator_name,
            report_date, report_time, failure_type, failure_subcategory, machine_stopped,
            downtime_start, priority, description, status, technician_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
    """, (
        order_number, machine_id, maint_type, operator_name,
        report_date, report_time, failure_type, failure_subcategory, machine_stopped,
        downtime_start, priority, description, technician_id
    ))
    order_id = cursor.lastrowid

    new_machine_status = 'PARADA' if machine_stopped else 'EN_MANTENIMIENTO'
    cursor.execute("UPDATE machines SET status = ? WHERE id = ?", (new_machine_status, machine_id))

    stop_label = "🛑 MÁQUINA PARADA" if machine_stopped else "⚠️ Máquina en Falla"
    sub_label = f" ({failure_subcategory})" if failure_subcategory else ""
    create_notification(
        conn,
        title=f"{stop_label}: {m_check['code']} - {m_check['name']} ({order_number})",
        message=f"Operario {operator_name} reportó falla {failure_type}{sub_label}: '{description}'. Pendiente clasificar/asignar por Jefe.",
        severity="CRITICAL" if machine_stopped else "WARNING",
        category="FALLA_MAQUINA",
        target_role="ALL",
        machine_id=machine_id,
        order_id=order_id
    )

    commit_and_sync(conn, event_type="order_created", summary=f"Nueva orden {order_number} en {m_check['name']}")
    conn.close()

    return jsonify({
        "message": "Reporte de falla registrado y notificado a Jefes y Técnicos",
        "order_id": order_id,
        "order_number": order_number
    }), 201


@app.route('/api/orders/<int:order_id>/assign', methods=['POST', 'PUT'])
def assign_and_classify_order(order_id):
    """
    Boss endpoint to assign Technician, set Maintenance Type (Correctivo/Preventivo/Predictivo),
    Priority, and Failure Category/Subcategory.
    """
    data = request.json or {}
    conn = get_db_connection()
    order = conn.execute("""
        SELECT o.*, m.name as machine_name, m.code as machine_code
        FROM maintenance_orders o
        JOIN machines m ON o.machine_id = m.id
        WHERE o.id = ?
    """, (order_id,)).fetchone()

    if not order:
        conn.close()
        return jsonify({"error": "Orden no encontrada"}), 404

    technician_id = data.get('technician_id') if 'technician_id' in data else order['technician_id']
    maint_type = (data.get('maintenance_type') or order['maintenance_type'] or 'CORRECTIVO').upper()
    priority = (data.get('priority') or order['priority'] or 'MEDIA').upper()
    failure_type = (data.get('failure_type') or order['failure_type'] or 'NO_SABE').upper()
    failure_subcategory = (data.get('failure_subcategory') if 'failure_subcategory' in data else (order['failure_subcategory'] or '')).strip()

    conn.execute("""
        UPDATE maintenance_orders
        SET technician_id = ?,
            maintenance_type = ?,
            priority = ?,
            failure_type = ?,
            failure_subcategory = ?,
            updated_at = ?
        WHERE id = ?
    """, (technician_id, maint_type, priority, failure_type, failure_subcategory, datetime.now().isoformat(), order_id))

    tech_name = "Sin asignar"
    if technician_id:
        t_row = conn.execute("SELECT name FROM technicians WHERE id = ?", (technician_id,)).fetchone()
        if t_row:
            tech_name = t_row['name']

    create_notification(
        conn,
        title=f"🔧 Orden {order['order_number']} Clasificada / Asignada",
        message=f"Jefe clasificó {order['order_number']} ({order['machine_name']}) como {maint_type} [{priority}] y asignó a: {tech_name}.",
        severity="INFO",
        category="ASIGNACION",
        target_role="ALL",
        machine_id=order['machine_id'],
        order_id=order_id
    )

    commit_and_sync(conn, event_type="order_assigned", summary=f"Orden {order['order_number']} asignada a {tech_name}")
    conn.close()
    return jsonify({"message": "Orden clasificada y técnico asignado exitosamente", "technician_name": tech_name})


# ----------------- REPAIR TIMER & LIFECYCLE -----------------

@app.route('/api/orders/<int:order_id>/timer/start', methods=['POST'])
def start_repair_timer(order_id):
    conn = get_db_connection()
    order = conn.execute("SELECT * FROM maintenance_orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"error": "Orden no encontrada"}), 404

    now = datetime.now()
    now_iso = now.isoformat()

    repair_start = order['repair_start'] or now_iso
    technician_id = request.json.get('technician_id') if request.json else None
    if not technician_id:
        technician_id = order['technician_id']

    conn.execute("""
        UPDATE maintenance_orders
        SET status = 'EN_PROCESO',
            technician_id = COALESCE(?, technician_id),
            repair_start = ?,
            is_timer_running = 1,
            timer_last_started_at = ?,
            updated_at = ?
        WHERE id = ?
    """, (technician_id, repair_start, now_iso, now_iso, order_id))

    if not order['machine_stopped']:
        conn.execute("UPDATE machines SET status = 'EN_MANTENIMIENTO' WHERE id = ?", (order['machine_id'],))

    commit_and_sync(conn, event_type="timer_started", summary=f"Cronómetro iniciado en {order['order_number']}")
    conn.close()

    return jsonify({
        "message": "Cronómetro de mantenimiento iniciado",
        "repair_start": repair_start,
        "is_timer_running": True
    })


@app.route('/api/orders/<int:order_id>/timer/pause', methods=['POST'])
def pause_repair_timer(order_id):
    conn = get_db_connection()
    order = conn.execute("SELECT * FROM maintenance_orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"error": "Orden no encontrada"}), 404

    if not order['is_timer_running']:
        conn.close()
        return jsonify({"message": "El cronómetro ya estaba pausado", "duration_seconds": order['repair_duration_seconds']})

    now = datetime.now()
    added_seconds = 0
    if order['timer_last_started_at']:
        try:
            started = datetime.fromisoformat(order['timer_last_started_at'])
            added_seconds = max(0, int((now - started).total_seconds()))
        except Exception:
            pass

    total_seconds = (order['repair_duration_seconds'] or 0) + added_seconds

    conn.execute("""
        UPDATE maintenance_orders
        SET is_timer_running = 0,
            timer_last_started_at = NULL,
            repair_duration_seconds = ?,
            status = 'PAUSADO',
            updated_at = ?
        WHERE id = ?
    """, (total_seconds, now.isoformat(), order_id))
    commit_and_sync(conn, event_type="timer_paused", summary=f"Cronómetro pausado en {order['order_number']}")
    conn.close()

    return jsonify({
        "message": "Cronómetro pausado",
        "repair_duration_seconds": total_seconds,
        "is_timer_running": False
    })


@app.route('/api/orders/<int:order_id>/progress', methods=['POST', 'PUT'])
def save_order_progress(order_id):
    """Save technician notes, diagnosis and spare parts without closing the order"""
    data = request.json or {}
    conn = get_db_connection()
    order = conn.execute("SELECT * FROM maintenance_orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"error": "Orden no encontrada"}), 404

    diagnosis = data.get('diagnosis', order['diagnosis'] or '').strip()
    solution_notes = data.get('solution_notes', order['solution_notes'] or '').strip()
    spare_parts_notes = data.get('spare_parts_notes', order['spare_parts_notes'] or '').strip()
    technician_id = data.get('technician_id') or order['technician_id']

    conn.execute("""
        UPDATE maintenance_orders
        SET diagnosis = ?,
            solution_notes = ?,
            spare_parts_notes = ?,
            technician_id = ?,
            updated_at = ?
        WHERE id = ?
    """, (diagnosis, solution_notes, spare_parts_notes, technician_id, datetime.now().isoformat(), order_id))
    commit_and_sync(conn, event_type="order_progress", summary=f"Avance guardado en {order['order_number']}")
    conn.close()
    return jsonify({"message": "Avance guardado y sincronizado en la nube"})


@app.route('/api/orders/<int:order_id>/finish', methods=['POST'])
def finish_order(order_id):
    data = request.json or {}
    conn = get_db_connection()
    order = conn.execute("""
        SELECT o.*, m.name as machine_name, m.code as machine_code
        FROM maintenance_orders o
        JOIN machines m ON o.machine_id = m.id
        WHERE o.id = ?
    """, (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"error": "Orden no encontrada"}), 404

    now = datetime.now()
    now_iso = now.isoformat()

    added_seconds = 0
    if order['is_timer_running'] and order['timer_last_started_at']:
        try:
            started = datetime.fromisoformat(order['timer_last_started_at'])
            added_seconds = max(0, int((now - started).total_seconds()))
        except Exception:
            pass

    total_repair_seconds = (order['repair_duration_seconds'] or 0) + added_seconds

    if total_repair_seconds == 0 and order['repair_start']:
        try:
            r_start = datetime.fromisoformat(order['repair_start'])
            total_repair_seconds = max(0, int((now - r_start).total_seconds()))
        except Exception:
            pass

    total_downtime_minutes = order['total_downtime_minutes'] or 0
    downtime_end = None
    if order['machine_stopped']:
        downtime_end = now_iso
        if order['downtime_start']:
            try:
                dt_start = datetime.fromisoformat(order['downtime_start'])
                total_downtime_minutes = max(0, int((now - dt_start).total_seconds() / 60))
            except Exception:
                pass

    spare_parts_notes = data.get('spare_parts_notes', order['spare_parts_notes'] or '').strip()
    diagnosis = data.get('diagnosis', order['diagnosis'] or '').strip()
    solution_notes = data.get('solution_notes', order['solution_notes'] or '').strip()
    final_technician_id = data.get('technician_id') or order['technician_id']

    conn.execute("""
        UPDATE maintenance_orders
        SET status = 'FINALIZADO',
            is_timer_running = 0,
            timer_last_started_at = NULL,
            repair_end = ?,
            repair_duration_seconds = ?,
            downtime_end = ?,
            total_downtime_minutes = ?,
            spare_parts_notes = ?,
            diagnosis = ?,
            solution_notes = ?,
            technician_id = COALESCE(?, technician_id),
            updated_at = ?
        WHERE id = ?
    """, (
        now_iso, total_repair_seconds, downtime_end, total_downtime_minutes,
        spare_parts_notes, diagnosis, solution_notes, final_technician_id,
        now_iso, order_id
    ))

    if order['plan_id']:
        conn.execute("UPDATE maintenance_plans SET status = 'COMPLETADO' WHERE id = ?", (order['plan_id'],))

    open_orders_left = conn.execute("""
        SELECT COUNT(*) FROM maintenance_orders 
        WHERE machine_id = ? AND id != ? AND status IN ('PENDIENTE', 'EN_PROCESO', 'PAUSADO')
    """, (order['machine_id'], order_id)).fetchone()[0]

    today_str = now.strftime('%Y-%m-%d')
    if open_orders_left == 0:
        conn.execute("""
            UPDATE machines 
            SET status = 'OPERATIVA', last_maintenance_date = ?
            WHERE id = ?
        """, (today_str, order['machine_id']))
    else:
        conn.execute("UPDATE machines SET last_maintenance_date = ? WHERE id = ?", (today_str, order['machine_id']))

    duration_min = round(total_repair_seconds / 60, 1)
    duration_hrs = round(total_repair_seconds / 3600, 2)

    create_notification(
        conn,
        title=f"✅ Orden {order['order_number']} Finalizada ({order['machine_name']})",
        message=f"Reparación completada en {duration_min} min. Solución: {solution_notes or 'Registrada en Hoja de Vida'}. Repuestos: {spare_parts_notes or 'Ninguno'}.",
        severity="SUCCESS",
        category="ORDEN_CERRADA",
        target_role="ALL",
        machine_id=order['machine_id'],
        order_id=order_id
    )

    commit_and_sync(conn, event_type="order_finished", summary=f"Orden {order['order_number']} finalizada")
    conn.close()

    return jsonify({
        "message": "Orden de mantenimiento finalizada y registrada en la Hoja de Vida",
        "repair_duration_seconds": total_repair_seconds,
        "repair_duration_minutes": duration_min,
        "repair_duration_hours": duration_hrs,
        "machine_stopped": bool(order['machine_stopped']),
        "total_downtime_minutes": total_downtime_minutes,
        "status": "FINALIZADO"
    })


# ----------------- SPARE PARTS (REPUESTOS) -----------------

@app.route('/api/orders/<int:order_id>/parts', methods=['GET'])
def get_order_parts(order_id):
    conn = get_db_connection()
    parts = conn.execute("SELECT * FROM spare_parts_used WHERE order_id = ? ORDER BY id ASC", (order_id,)).fetchall()
    conn.close()
    return jsonify([dict(p) for p in parts])


@app.route('/api/orders/<int:order_id>/parts', methods=['POST'])
def add_order_part(order_id):
    data = request.json or {}
    part_name = (data.get('part_name') or '').strip()
    if not part_name:
        return jsonify({"error": "El nombre del repuesto es obligatorio"}), 400

    quantity = float(data.get('quantity') or 1)
    unit = (data.get('unit') or 'unidad').strip()
    part_code = (data.get('part_code') or '').strip()
    unit_cost = float(data.get('unit_cost') or 0)
    notes = (data.get('notes') or '').strip()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO spare_parts_used (order_id, part_name, quantity, unit, part_code, unit_cost, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (order_id, part_name, quantity, unit, part_code, unit_cost, notes))
    new_id = cursor.lastrowid
    commit_and_sync(conn, event_type="part_added", summary=f"Repuesto agregado: {part_name}")
    conn.close()

    return jsonify({
        "message": "Repuesto agregado correctamente",
        "id": new_id
    }), 201


@app.route('/api/parts/<int:part_id>', methods=['DELETE'])
def delete_order_part(part_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM spare_parts_used WHERE id = ?", (part_id,))
    commit_and_sync(conn, event_type="part_deleted", summary="Repuesto eliminado")
    conn.close()
    return jsonify({"message": "Repuesto eliminado"})


if __name__ == '__main__':
    local_ip = get_local_ip()
    port = int(os.environ.get('PORT', 5000))
    print("=" * 68)
    print("  SISTMAINT CMMS 2.0 - CONTROL INTEGRAL DE PLANTA & PLAN 2027")
    print("=" * 68)
    print(f"  -> Acceso Local (PC):       http://localhost:{port}")
    print(f"  -> Acceso Móvil (QR/WiFi):  http://{local_ip}:{port}")
    print(f"  -> Cloud Sync Topic:        {NTFY_TOPIC}")
    print("=" * 68)
    app.run(host='0.0.0.0', port=port, debug=True)

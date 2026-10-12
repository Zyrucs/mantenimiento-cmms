"""
Industrial Maintenance Management System (CMMS)
Backend REST API with Flask & SQLite
Compatible with local execution and Vercel serverless deployment.
"""
import os
import sys
import socket
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_cors import CORS
from database import get_db_connection, init_db

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

# ----------------- WEB PAGES & STATIC ROUTES -----------------

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

@app.route('/health')
def health():
    return jsonify({
        "status": "ok", 
        "timestamp": datetime.now().isoformat(),
        "is_vercel": bool(os.environ.get('VERCEL'))
    })

# ----------------- SETTINGS & NETWORK IP -----------------

@app.route('/api/settings', methods=['GET'])
def get_settings():
    conn = get_db_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings = {row['key']: row['value'] for row in rows}
    
    current_lan_ip = get_local_ip()
    port = settings.get('server_port', '5000')
    configured_ip = settings.get('server_ip', current_lan_ip)
    
    # If on Vercel or cloud host, prioritize public request origin
    if os.environ.get('VERCEL') or request.host and not request.host.startswith('127.0.0.1') and not request.host.startswith('localhost'):
        qr_base = request.host_url.rstrip('/')
    else:
        qr_base = f"http://{configured_ip}:{port}"

    conn.close()
    return jsonify({
        "server_ip": configured_ip,
        "detected_lan_ip": current_lan_ip,
        "server_port": port,
        "company_name": settings.get('company_name', 'Control de Mantenimiento'),
        "qr_base_url": qr_base
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
    conn.commit()
    conn.close()
    return jsonify({"message": "Configuración guardada exitosamente"})

# ----------------- DASHBOARD & METRICS -----------------

@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    conn = get_db_connection()

    total_orders = conn.execute("SELECT COUNT(*) FROM maintenance_orders").fetchone()[0]
    pending_orders = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE status = 'PENDIENTE'").fetchone()[0]
    in_progress_orders = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE status = 'EN_PROCESO'").fetchone()[0]
    finished_orders = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE status = 'FINALIZADO'").fetchone()[0]

    machines_stopped = conn.execute("""
        SELECT COUNT(DISTINCT machine_id) FROM maintenance_orders 
        WHERE machine_stopped = 1 AND status IN ('PENDIENTE', 'EN_PROCESO')
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

    recent_orders = conn.execute("""
        SELECT o.*, m.name as machine_name, m.code as machine_code, t.name as technician_name
        FROM maintenance_orders o
        JOIN machines m ON o.machine_id = m.id
        LEFT JOIN technicians t ON o.technician_id = t.id
        ORDER BY o.id DESC LIMIT 6
    """).fetchall()

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
        "failures_by_type": failures_by_type,
        "maintenance_by_type": maintenance_by_type,
        "recent_orders": [dict(r) for r in recent_orders]
    })

# ----------------- MACHINES CRUD -----------------

@app.route('/api/machines', methods=['GET'])
def get_machines():
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT m.*, 
            (SELECT COUNT(*) FROM maintenance_orders WHERE machine_id = m.id AND status IN ('PENDIENTE', 'EN_PROCESO')) as active_orders_count,
            (SELECT COUNT(*) FROM maintenance_orders WHERE machine_id = m.id AND status = 'FINALIZADO') as finished_orders_count
        FROM machines m
        ORDER BY m.code ASC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/machines/<int:machine_id>', methods=['GET'])
def get_machine(machine_id):
    conn = get_db_connection()
    machine = conn.execute("SELECT * FROM machines WHERE id = ?", (machine_id,)).fetchone()
    if not machine:
        conn.close()
        return jsonify({"error": "Máquina no encontrada"}), 404

    history = conn.execute("""
        SELECT o.*, t.name as technician_name
        FROM maintenance_orders o
        LEFT JOIN technicians t ON o.technician_id = t.id
        WHERE o.machine_id = ?
        ORDER BY o.id DESC
    """, (machine_id,)).fetchall()

    conn.close()
    return jsonify({
        "machine": dict(machine),
        "history": [dict(h) for h in history]
    })

@app.route('/api/machines', methods=['POST'])
def create_machine():
    data = request.json or {}
    code = data.get('code', '').strip().upper()
    name = data.get('name', '').strip()
    location = data.get('location', 'Planta Principal').strip()
    description = data.get('description', '').strip()

    if not code or not name:
        return jsonify({"error": "El código y el nombre de la máquina son obligatorios"}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO machines (code, name, location, status, description)
            VALUES (?, ?, ?, 'OPERATIVA', ?)
        """, (code, name, location, description))
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()
        return jsonify({"message": "Máquina creada exitosamente", "id": new_id}), 201
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Error al guardar máquina: {str(e)}"}), 400

@app.route('/api/machines/<int:machine_id>', methods=['PUT'])
def update_machine(machine_id):
    data = request.json or {}
    code = data.get('code', '').strip().upper()
    name = data.get('name', '').strip()
    location = data.get('location', '').strip()
    status = data.get('status', 'OPERATIVA').strip()
    description = data.get('description', '').strip()

    if not code or not name:
        return jsonify({"error": "Código y nombre son obligatorios"}), 400

    conn = get_db_connection()
    try:
        conn.execute("""
            UPDATE machines 
            SET code = ?, name = ?, location = ?, status = ?, description = ?
            WHERE id = ?
        """, (code, name, location, status, description, machine_id))
        conn.commit()
        conn.close()
        return jsonify({"message": "Máquina actualizada correctamente"})
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Error: {str(e)}"}), 400

@app.route('/api/machines/<int:machine_id>', methods=['DELETE'])
def delete_machine(machine_id):
    conn = get_db_connection()
    orders_count = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE machine_id = ?", (machine_id,)).fetchone()[0]
    if orders_count > 0:
        conn.close()
        return jsonify({"error": f"No se puede eliminar la máquina porque tiene {orders_count} órdenes asociadas. Puedes cambiar su estado a inactiva."}), 400

    conn.execute("DELETE FROM machines WHERE id = ?", (machine_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Máquina eliminada exitosamente"})

# ----------------- TECHNICIANS CRUD -----------------

@app.route('/api/technicians', methods=['GET'])
def get_technicians():
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT t.*, 
            (SELECT COUNT(*) FROM maintenance_orders WHERE technician_id = t.id AND status = 'EN_PROCESO') as active_orders,
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
    name = data.get('name', '').strip()
    role = data.get('role', 'Técnico de Mantenimiento').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip()

    if not name:
        return jsonify({"error": "El nombre del técnico/ingeniero es obligatorio"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO technicians (name, role, phone, email)
        VALUES (?, ?, ?, ?)
    """, (name, role, phone, email))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({"message": "Técnico registrado correctamente", "id": new_id}), 201

@app.route('/api/technicians/<int:tech_id>', methods=['PUT'])
def update_technician(tech_id):
    data = request.json or {}
    name = data.get('name', '').strip()
    role = data.get('role', '').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip()

    if not name:
        return jsonify({"error": "El nombre es obligatorio"}), 400

    conn = get_db_connection()
    conn.execute("""
        UPDATE technicians 
        SET name = ?, role = ?, phone = ?, email = ?
        WHERE id = ?
    """, (name, role, phone, email, tech_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Técnico actualizado"})

@app.route('/api/technicians/<int:tech_id>', methods=['DELETE'])
def delete_technician(tech_id):
    conn = get_db_connection()
    conn.execute("UPDATE technicians SET active = 0 WHERE id = ?", (tech_id,))
    conn.commit()
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
        query += " AND (o.order_number LIKE ? OR o.operator_name LIKE ? OR o.description LIKE ? OR m.name LIKE ?)"
        wild = f"%{search}%"
        params.extend([wild, wild, wild, wild])

    query += " ORDER BY o.id DESC"
    rows = conn.execute(query, params).fetchall()

    result = []
    now = datetime.now()
    for row in rows:
        item = dict(row)
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

        result.append(item)

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

    order = dict(row)
    now = datetime.now()
    if order.get('is_timer_running') and order.get('timer_last_started_at'):
        try:
            last_start = datetime.fromisoformat(order['timer_last_started_at'])
            live_delta = int((now - last_start).total_seconds())
            order['current_live_duration_seconds'] = (order.get('repair_duration_seconds') or 0) + max(0, live_delta)
        except Exception:
            order['current_live_duration_seconds'] = order.get('repair_duration_seconds') or 0
    else:
        order['current_live_duration_seconds'] = order.get('repair_duration_seconds') or 0

    if order.get('machine_stopped') and order.get('downtime_start'):
        if order.get('status') != 'FINALIZADO':
            try:
                dt_start = datetime.fromisoformat(order['downtime_start'])
                order['current_live_downtime_minutes'] = max(0, int((now - dt_start).total_seconds() / 60))
            except Exception:
                order['current_live_downtime_minutes'] = order.get('total_downtime_minutes') or 0
        else:
            order['current_live_downtime_minutes'] = order.get('total_downtime_minutes') or 0
    else:
        order['current_live_downtime_minutes'] = 0

    parts = conn.execute("SELECT * FROM spare_parts_used WHERE order_id = ? ORDER BY id ASC", (order_id,)).fetchall()
    order['parts'] = [dict(p) for p in parts]

    conn.close()
    return jsonify(order)

@app.route('/api/orders', methods=['POST'])
def create_order():
    data = request.json or {}
    machine_id = data.get('machine_id')
    machine_code = data.get('machine_code')

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

    operator_name = data.get('operator_name', '').strip()
    if not operator_name:
        conn.close()
        return jsonify({"error": "El nombre completo del operario es obligatorio"}), 400

    now = datetime.now()
    report_date = data.get('report_date') or now.strftime('%Y-%m-%d')
    report_time = data.get('report_time') or now.strftime('%H:%M')
    
    maint_type = data.get('maintenance_type', 'CORRECTIVO').upper()
    if maint_type not in ['CORRECTIVO', 'PREVENTIVO', 'PREDICTIVO']:
        maint_type = 'CORRECTIVO'

    failure_type = data.get('failure_type', 'NO_SABE').upper()
    if failure_type not in ['ELECTRICA', 'MECANICA', 'AMBAS', 'NO_SABE']:
        failure_type = 'NO_SABE'

    machine_stopped = 1 if data.get('machine_stopped') in [1, True, '1', 'true', 'si', 'SI'] else 0
    priority = data.get('priority', 'MEDIA').upper()
    description = data.get('description', '').strip()
    if not description:
        description = f"Reporte de falla {failure_type} reportado por {operator_name}"

    technician_id = data.get('technician_id') or None

    year = now.strftime('%Y')
    count_row = conn.execute("SELECT COUNT(*) FROM maintenance_orders WHERE order_number LIKE ?", (f"OT-{year}-%",)).fetchone()
    next_num = count_row[0] + 1
    order_number = f"OT-{year}-{str(next_num).zfill(4)}"

    downtime_start = now.isoformat() if machine_stopped else None

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO maintenance_orders (
            order_number, machine_id, maintenance_type, operator_name,
            report_date, report_time, failure_type, machine_stopped,
            downtime_start, priority, description, status, technician_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
    """, (
        order_number, machine_id, maint_type, operator_name,
        report_date, report_time, failure_type, machine_stopped,
        downtime_start, priority, description, technician_id
    ))
    order_id = cursor.lastrowid

    new_machine_status = 'PARADA' if machine_stopped else 'EN_MANTENIMIENTO'
    cursor.execute("UPDATE machines SET status = ? WHERE id = ?", (new_machine_status, machine_id))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Reporte de incidencia registrado exitosamente",
        "order_id": order_id,
        "order_number": order_number
    }), 201

@app.route('/api/orders/<int:order_id>/assign', methods=['POST'])
def assign_technician(order_id):
    data = request.json or {}
    technician_id = data.get('technician_id')
    if not technician_id:
        return jsonify({"error": "Debe especificar un técnico"}), 400

    conn = get_db_connection()
    conn.execute("UPDATE maintenance_orders SET technician_id = ? WHERE id = ?", (technician_id, order_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Técnico asignado exitosamente"})

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

    conn.commit()
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
    conn.commit()
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
    conn.commit()
    conn.close()
    return jsonify({"message": "Avance guardado exitosamente"})

@app.route('/api/orders/<int:order_id>/finish', methods=['POST'])
def finish_order(order_id):
    data = request.json or {}
    conn = get_db_connection()
    order = conn.execute("SELECT * FROM maintenance_orders WHERE id = ?", (order_id,)).fetchone()
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

    open_orders_left = conn.execute("""
        SELECT COUNT(*) FROM maintenance_orders 
        WHERE machine_id = ? AND id != ? AND status IN ('PENDIENTE', 'EN_PROCESO')
    """, (order['machine_id'], order_id)).fetchone()[0]

    if open_orders_left == 0:
        conn.execute("UPDATE machines SET status = 'OPERATIVA' WHERE id = ?", (order['machine_id'],))

    conn.commit()
    conn.close()

    duration_min = round(total_repair_seconds / 60, 1)
    duration_hrs = round(total_repair_seconds / 3600, 2)

    return jsonify({
        "message": "Orden de mantenimiento finalizada con éxito",
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
    part_name = data.get('part_name', '').strip()
    if not part_name:
        return jsonify({"error": "El nombre del repuesto es obligatorio"}), 400

    quantity = float(data.get('quantity', 1))
    unit = data.get('unit', 'unidad').strip()
    part_code = data.get('part_code', '').strip()
    unit_cost = float(data.get('unit_cost', 0))
    notes = data.get('notes', '').strip()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO spare_parts_used (order_id, part_name, quantity, unit, part_code, unit_cost, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (order_id, part_name, quantity, unit, part_code, unit_cost, notes))
    part_id = cursor.lastrowid

    summary_line = f"{part_name} (x{quantity} {unit})"
    curr_notes = conn.execute("SELECT spare_parts_notes FROM maintenance_orders WHERE id = ?", (order_id,)).fetchone()
    if curr_notes and curr_notes[0]:
        new_summary = curr_notes[0] + ", " + summary_line
    else:
        new_summary = summary_line

    conn.execute("UPDATE maintenance_orders SET spare_parts_notes = ? WHERE id = ?", (new_summary, order_id))
    conn.commit()
    conn.close()

    return jsonify({"message": "Repuesto registrado", "id": part_id}), 201

@app.route('/api/parts/<int:part_id>', methods=['DELETE'])
def delete_part(part_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM spare_parts_used WHERE id = ?", (part_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Repuesto eliminado"})

# ----------------- EXPORT TO CSV -----------------

@app.route('/api/export/orders/csv', methods=['GET'])
def export_orders_csv():
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT o.order_number, m.code as machine_code, m.name as machine_name,
               o.maintenance_type, o.operator_name, o.report_date, o.report_time,
               o.failure_type, 
               CASE WHEN o.machine_stopped = 1 THEN 'SI' ELSE 'NO' END as estuvo_parada,
               o.total_downtime_minutes as parada_minutos,
               o.priority, o.status,
               t.name as tecnico,
               ROUND(o.repair_duration_seconds / 60.0, 1) as reparacion_minutos,
               o.spare_parts_notes as repuestos,
               o.description, o.diagnosis, o.solution_notes
        FROM maintenance_orders o
        JOIN machines m ON o.machine_id = m.id
        LEFT JOIN technicians t ON o.technician_id = t.id
        ORDER BY o.id DESC
    """).fetchall()
    conn.close()

    import io
    import csv
    from flask import Response

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Orden", "Código Máquina", "Máquina", "Tipo Mantenimiento", 
        "Operario", "Fecha", "Hora", "Tipo Falla", "¿Estuvo Parada?", 
        "Parada (Minutos)", "Prioridad", "Estado", "Técnico Asignado", 
        "Tiempo Reparación (Min)", "Repuestos Utilizados", 
        "Descripción Falla", "Diagnóstico Causa Raíz", "Solución Aplicada"
    ])

    for row in rows:
        writer.writerow(list(row))

    csv_data = output.getvalue()
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=control_mantenimientos.csv"}
    )

# Expose wsgi handler for Vercel
app_handler = app

if __name__ == '__main__':
    local_ip = get_local_ip()
    print("=" * 65)
    print("  SISTEMA WEB DE CONTROL DE MANTENIMIENTO INDUSTRIAL (CMMS)")
    print(f"  Acceso Local PC:     http://localhost:5000")
    print(f"  Acceso Móvil / Red:  http://{local_ip}:5000")
    print("  Escanea los códigos QR con cualquier celular conectado al WiFi!")
    print("=" * 65)
    app.run(host='0.0.0.0', port=5000, debug=True)

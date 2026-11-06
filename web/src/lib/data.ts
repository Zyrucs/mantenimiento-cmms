import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

/* ---------- Types (mirror the Supabase tables) ---------- */
export type MachineStatus = 'OPERATIVA' | 'EN_MANTENIMIENTO' | 'PARADA' | string

export interface Machine {
  id: number
  code: string
  name: string
  location: string | null
  status: MachineStatus
  brand: string | null
  model: string | null
}

export interface FailureCategory {
  code: string
  name: string
  color: string | null
  subcategories: string[]
}

export interface Technician {
  id: number
  name: string
  specialty: string | null
  active: boolean | null
}

/* ---------- Queries ---------- */
export function useMachines() {
  return useQuery({
    queryKey: ['machines'],
    queryFn: async (): Promise<Machine[]> => {
      const { data, error } = await supabase
        .from('machines')
        .select('id, code, name, location, status, brand, model')
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

function parseSubcategories(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v.map(String)
    } catch {
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  return []
}

export function useCategories() {
  return useQuery({
    queryKey: ['failure_categories'],
    queryFn: async (): Promise<FailureCategory[]> => {
      const { data, error } = await supabase
        .from('failure_categories')
        .select('code, name, color, subcategories')
        .order('id')
      if (error) throw error
      return (data ?? []).map(c => ({ ...c, subcategories: parseSubcategories(c.subcategories) }))
    },
    staleTime: 5 * 60_000,
  })
}

export function useTechnicians(enabled = true) {
  return useQuery({
    queryKey: ['technicians'],
    enabled,
    queryFn: async (): Promise<Technician[]> => {
      const { data, error } = await supabase
        .from('technicians')
        .select('id, name, specialty, active')
        .order('name')
      if (error) throw error
      return (data ?? []).filter(t => t.active !== false)
    },
  })
}

/* ---------- Work orders ---------- */
export const CLOSED_STATUSES = ['FINALIZADO', 'CERRADA']
export const isOpen = (o: Pick<WorkOrder, 'status'>) => !CLOSED_STATUSES.includes(o.status)

export interface WorkOrder {
  id: number
  order_number: string
  machine_id: number
  reporter_name: string
  failure_type: string | null
  failure_category: string | null
  failure_subcategory: string | null
  maintenance_type: string | null
  priority: string
  description: string
  assigned_technician_id: number | null
  status: string
  reported_at: string
  started_at: string | null
  completed_at: string | null
  downtime_minutes: number | null
  repair_minutes: number | null
  timer_started_at: string | null
  diagnosis: string
  solution_notes: string | null
  spare_parts_used: string | null
}

export function useOrders() {
  return useQuery({
    queryKey: ['work_orders'],
    queryFn: async (): Promise<WorkOrder[]> => {
      const { data, error } = await supabase
        .from('work_orders')
        .select('*')
        .order('reported_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
    refetchInterval: 20_000, // keep timers and statuses fresh across devices
  })
}

/** Seconds worked on an order, including a running timer. */
export function workedSeconds(o: WorkOrder, nowMs = Date.now()) {
  const base = Math.round((Number(o.repair_minutes) || 0) * 60)
  if (!o.timer_started_at) return base
  return base + Math.max(0, Math.floor((nowMs - new Date(o.timer_started_at).getTime()) / 1000))
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const startOrderTimer = (orderId: number) => rpc('start_order_timer', { p_order_id: orderId })
export const pauseOrderTimer = (orderId: number) => rpc('pause_order_timer', { p_order_id: orderId })
export const finishOrder = (orderId: number, diagnosis: string, solution: string, parts: string) =>
  rpc<{ repair_minutes: number; downtime_minutes: number; machine_operative: boolean }>(
    'finish_order', { p_order_id: orderId, p_diagnosis: diagnosis, p_solution: solution, p_parts: parts })
export const markMachineOperational = (machineId: number) =>
  rpc('mark_machine_operational', { p_machine_id: machineId })

/** Save notes without finishing the order. */
export async function saveOrderNotes(orderId: number, fields: { diagnosis: string; solution_notes: string; spare_parts_used: string }) {
  const { error } = await supabase.from('work_orders').update(fields).eq('id', orderId)
  if (error) throw new Error(error.message)
}

/** Jefe: classify / assign an order. */
export async function classifyOrder(orderId: number, fields: {
  maintenance_type: string; priority: string; failure_type: string; failure_subcategory: string
  failure_category: string; assigned_technician_id: number | null
}) {
  const { error } = await supabase.from('work_orders').update(fields).eq('id', orderId)
  if (error) throw new Error(error.message)
}

/* ---------- Mutations ---------- */
export interface ReportFailureInput {
  machineId: number
  reporterName: string
  failureType: string
  failureSubcategory: string
  machineStopped: boolean
  description: string
  reportedAt: string
  maintenanceType?: string
  priority?: string
  technicianId?: number | null
}

export type ReportFailureResult =
  | { ok: true; order_id: number; order_number: string }
  | { ok: false; reason: 'OPEN_ORDER_EXISTS'; existing_order_id: number; existing_order_number: string }

export async function reportFailure(i: ReportFailureInput): Promise<ReportFailureResult> {
  const { data, error } = await supabase.rpc('report_failure', {
    p_machine_id: i.machineId,
    p_reporter_name: i.reporterName,
    p_failure_type: i.failureType,
    p_failure_subcategory: i.failureSubcategory,
    p_machine_stopped: i.machineStopped,
    p_description: i.description,
    p_reported_at: i.reportedAt,
    p_maintenance_type: i.maintenanceType ?? null,
    p_priority: i.priority ?? null,
    p_technician_id: i.technicianId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as ReportFailureResult
}

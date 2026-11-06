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

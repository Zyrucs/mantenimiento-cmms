import { createClient } from '@supabase/supabase-js'

// The publishable key is meant to be public; data access is enforced by
// Row Level Security in the database, not by hiding this key.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://yijualgkrcxkqqphpzll.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_Yodcb3DrSG6lAmRdCH_QYQ_Hqo9eId6'

export const supabase = createClient(url, key)

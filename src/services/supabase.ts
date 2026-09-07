import { createClient } from '@supabase/supabase-js';

// Fallback directo a las credenciales del proyecto para evitar "Failed to fetch" si Vercel no inyecta envs a tiempo
const DEFAULT_URL = 'https://vkrwosnoqhavwyifyfvy.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_1gNy1VIegEak5XdjTOxtLg_IK3TX5ot';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL).trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY).trim();

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('⚠️ [AudiMAS Supabase] VITE_SUPABASE_URL no está definida en las variables de entorno de Vite. Utilizando fallback por defecto.');
}

if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('⚠️ [AudiMAS Supabase] VITE_SUPABASE_ANON_KEY no está definida en las variables de entorno de Vite. Utilizando fallback por defecto.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: window.localStorage
  }
});

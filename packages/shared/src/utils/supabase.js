import { createClient } from '@supabase/supabase-js';

const supabaseUrl = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_URL || '') : '';
const supabaseKey = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || '') : '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials missing: check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

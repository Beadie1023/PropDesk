import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Thrown at import time, not caught — a missing key here means the
  // whole app can't load data, so failing loudly on startup is better
  // than every individual storage call failing separately with a less
  // obvious error.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set both in your ' +
      'environment (Render dashboard → your frontend service → Environment) ' +
      'and redeploy.',
  );
}

export const supabase = createClient(url, anonKey);

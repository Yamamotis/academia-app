import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://gqqwatmizpfkbqxhgiio.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxcXdhdG1penBma2JxeGhnaWlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzIzMzcsImV4cCI6MjA4ODcwODMzN30.C1hEYn0bapqAin_E-aVRzksbP4SmvXEdNaTgClsNmpU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// camelCase → snake_case  (para enviar ao banco)
export const toDb = (obj) =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k.replace(/([A-Z])/g, "_$1").toLowerCase(), v])
  );

// snake_case → camelCase  (ao ler do banco)
export const fromDb = (obj) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      v,
    ])
  );

import { createClient } from "@supabase/supabase-js";

// Credenziali del progetto Supabase — la publishable key è pensata per
// stare nel codice del browser, è protetta dalle policy di Row Level
// Security già impostate sul database (ogni utente vede solo la propria azienda).
const supabaseUrl = "https://lgsonyftsrlrfieltwju.supabase.co";
const supabaseKey = "sb_publishable_17RuICEkUSbUROjUozWrAA_fItJd7dj";

export const supabase = createClient(supabaseUrl, supabaseKey);

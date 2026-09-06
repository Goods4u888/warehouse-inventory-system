// Supabase connection — anon/publishable key only, never the service_role key.
// This file is loaded client-side, so nothing in it should be a secret beyond
// what Row Level Security already protects (see supabase/schema.sql).
window.APP_CONFIG = {
  SUPABASE_URL: 'https://sttebevlaxchawetbwfo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_crdaX8uvkWhYouy3A3NHdQ_XeGTRtzf',
};

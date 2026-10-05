import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://nrkasxobntwgodzbpcgp.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ya2FzeG9ibnR3Z29kemJwY2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MTY3NDQsImV4cCI6MjEwNjQ5Mjc0NH0.ra-rgmgLzYihHUBuTCJPanKL59Wue8pVdSDKyt_v_Qo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

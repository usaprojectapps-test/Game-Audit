import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://kjfzdmmloryzbuiixceh.supabase.co", /* "YOUR_SUPABASE_URL" */
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnpkbW1sb3J5emJ1aWl4Y2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3OTkyODQsImV4cCI6MjA4MzM3NTI4NH0.ivmARw-Nj0kegWTV3GZwbyKeHx0c7eQRUtGww1S8B8M"  /*"YOUR_SUPABASE_ANON_KEY" */
);

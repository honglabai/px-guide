import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://plshwfggvcergfbofrbt.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsc2h3ZmdndmNlcmdmYm9mcmJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mjk1ODksImV4cCI6MjExMDQwNTU4OX0.b51KB6wufcqshTsZFRPwbfYKKocwzUEP0lxu5N4QThk';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

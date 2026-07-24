const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('../../.env.local', 'utf-8');
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const sb = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await sb.from('patients').select('*');
  console.log("Patients in cloud:", data);
  if (error) console.error("Error:", error);
}
check();

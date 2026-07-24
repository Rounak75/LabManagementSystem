const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const env = fs.readFileSync('apps/admin/.env.local', 'utf-8');
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
  const secret = env.match(/SUPABASE_JWT_SECRET=(.*)/)[1].trim();

  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { role: "authenticated", role_app: "Admin", user_id: "b9f1d064-7e16-4252-8082-220d93aa9129" },
    secret,
    { expiresIn: '1h' }
  );

  const sb = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

  const { data, error } = await sb.from('patients').update({
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  }).is('updated_at', null).select();

  console.log("Updated patients:", data);
  if (error) console.error("Error:", error);
}
main().catch(console.error);

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const env = fs.readFileSync('apps/admin/.env.local', 'utf-8');
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const secret = env.match(/SUPABASE_JWT_SECRET=(.*)/)[1].trim();
  const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { role: "authenticated", role_app: "Admin", user_id: "b9f1d064-7e16-4252-8082-220d93aa9129" },
    secret,
    { expiresIn: '1h' }
  );

  const res = await fetch(`${url}/rest/v1/visits`, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("Cloud visits:", data);
}
main().catch(console.error);

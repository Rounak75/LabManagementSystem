const fs = require('fs');
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

// Fix the Smoke Test Patient which has patient_id LAB-2026-00002 colliding with
// local Sujata Mahato. Change it to LAB-2026-00099 (unused).
async function main() {
  const res = await fetch(`${url}/rest/v1/patients?id=eq.55c722f3-5566-423d-98e9-523b14f99f99`, {
    method: 'PATCH',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ patient_id: 'LAB-2026-00099' })
  });
  const data = await res.json();
  console.log("Updated smoke test patient:", data);
}
main().catch(console.error);

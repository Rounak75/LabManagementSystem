const fs = require('fs');
const jwt = require('jsonwebtoken');
const env = fs.readFileSync('apps/admin/.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const secret = env.match(/SUPABASE_JWT_SECRET=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const token = jwt.sign(
  {
    role: "authenticated",
    role_app: "Admin",
    user_id: "test-user-id"
  },
  secret,
  { expiresIn: '1h' }
);

fetch(`${url}/rest/v1/patients`, {
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${token}`
  }
}).then(r => r.json()).then(data => {
  console.log("Patients:", data);
}).catch(console.error);

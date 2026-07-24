const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

async function main() {
  const env = fs.readFileSync('apps/admin/.env.local', 'utf-8');
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const secret = env.match(/SUPABASE_JWT_SECRET=(.*)/)[1].trim();
  const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

  // Create JWT manually using jsonwebtoken or just do raw fetch with a JWT
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { role: "authenticated", role_app: "Admin", user_id: "b9f1d064-7e16-4252-8082-220d93aa9129" },
    secret,
    { expiresIn: '1h' }
  );

  const res = await fetch(`${url}/rest/v1/patients`, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${token}` }
  });
  const patientsCloud = await res.json();
  console.log("Cloud patients:", patientsCloud);

  const prisma = new PrismaClient({
    datasources: { db: { url: "file:C:/Users/Rouna/AppData/Roaming/@lab/desktop/lab.sqlite" } }
  });
  
  const patientsLocal = await prisma.patient.findMany();
  console.log("Local patients:", patientsLocal);

  const cursor = await prisma.syncCursor.findUnique({ where: { source: 'patients' } });
  console.log("SyncCursor for patients:", cursor);
}
main().catch(console.error);

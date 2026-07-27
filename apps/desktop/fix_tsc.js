const fs = require('fs');
const path = require('path');

const cloudDir = path.join(__dirname, 'src', 'main', 'services', 'cloud');
const files = fs.readdirSync(cloudDir).filter(f => f.startsWith('pull-') && f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(cloudDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Fix logger.warn 5 args to 3 args
  // E.g. logger.warn("cloud", "[pull-bookings] skipping row", r.booking_id, "— constraint conflict:", e.meta);
  content = content.replace(/logger\.warn\(\s*"cloud",\s*("[^"]+"),\s*([^,]+),\s*("[^"]+"),\s*([^)]+)\);/g, (match, p1, p2, p3, p4) => {
    changed = true;
    return `logger.warn("cloud", ${p1} + " " + ${p2} + " " + ${p3} + " " + JSON.stringify(${p4}));`;
  });

  // Fix logger.error 5 args to 3 args
  // E.g. logger.error("cloud", "[pull-bookings] row", r.booking_id, "failed", e);
  content = content.replace(/logger\.error\(\s*"cloud",\s*("[^"]+"),\s*([^,]+),\s*("[^"]+"),\s*([^)]+)\);/g, (match, p1, p2, p3, p4) => {
    changed = true;
    return `logger.error("cloud", ${p1} + " " + ${p2} + " " + ${p3}, ${p4});`;
  });

  // pull-payments.ts has a 5 arg warn on line 49 maybe?
  // logger.warn("cloud", "[pull-payments] skipped invalid event", r.event_id, ":", result.error.message);
  content = content.replace(/logger\.warn\(\s*"cloud",\s*("[^"]+"),\s*([^,]+),\s*("[^"]+"),\s*([^)]+)\);/g, (match, p1, p2, p3, p4) => {
    changed = true;
    return `logger.warn("cloud", ${p1} + " " + ${p2} + " " + ${p3} + " " + JSON.stringify(${p4}));`;
  });

  // Add deleted_at to RawPatientRow
  if (file === 'pull-patients.ts' && content.includes('interface RawPatientRow {') && !content.includes('deleted_at?: string | null;')) {
    content = content.replace('updated_at: string;', 'updated_at: string;\n  deleted_at?: string | null;');
    changed = true;
  }

  // Add deleted_at to RawVisitRow
  if (file === 'pull-visits.ts' && content.includes('interface RawVisitRow {') && !content.includes('deleted_at?: string | null;')) {
    content = content.replace('updated_at: string;', 'updated_at: string;\n  deleted_at?: string | null;');
    changed = true;
  }

  // Fix pull-verifications.ts updated_at on RawVerificationRow
  if (file === 'pull-verifications.ts') {
    if (!content.includes('updated_at?: string | null;')) {
      content = content.replace('verified_at: string | null;', 'verified_at: string | null;\n  updated_at: string;');
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', file);
  }
}

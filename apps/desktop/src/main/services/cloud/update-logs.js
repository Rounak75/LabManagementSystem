const fs = require('fs');
const path = require('path');
const dir = 'c:/Users/Rouna/Downloads/Lab Management System/Lab Management System/apps/desktop/src/main/services/cloud';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && f !== 'logger.ts' && f !== 'sync-worker.ts' && f !== 'sync-engine.ts');

files.forEach(f => {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf8');

  if (content.includes('console.error(') || content.includes('console.warn(') || content.includes('console.log(')) {
    if (!content.includes('import { logger }')) {
      content = 'import { logger } from "./logger";\n' + content;
    }
    
    // Catch-all
    content = content.replace(/console\.error\((.*?)\)/g, 'logger.error("cloud", $1)');
    content = content.replace(/console\.warn\((.*?)\)/g, 'logger.warn("cloud", $1)');
    content = content.replace(/console\.log\((.*?)\)/g, 'logger.info("cloud", $1)');
    
    fs.writeFileSync(fp, content, 'utf8');
    console.log('Updated', f);
  }
});

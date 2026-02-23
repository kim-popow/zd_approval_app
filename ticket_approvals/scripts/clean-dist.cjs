const fs = require('node:fs');
const path = require('node:path');

const distPath = path.resolve(process.cwd(), 'dist');

try {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log(`Cleaned: ${distPath}`);
} catch (error) {
  console.error('Failed to clean dist directory:', error);
  process.exit(1);
}

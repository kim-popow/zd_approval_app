const fs = require('node:fs');
const path = require('node:path');

const distConfigPath = path.resolve(process.cwd(), 'dist', 'zcli.apps.config.json');
const srcConfigPath = path.resolve(process.cwd(), 'src', 'zcli.apps.config.json');

if (!fs.existsSync(distConfigPath)) {
  console.error('Missing dist/zcli.apps.config.json. Run `zcli apps:create dist` first.');
  process.exit(1);
}

try {
  const raw = fs.readFileSync(distConfigPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed.app_id) {
    console.error('dist/zcli.apps.config.json does not contain app_id.');
    process.exit(1);
  }

  fs.writeFileSync(srcConfigPath, JSON.stringify({ app_id: parsed.app_id }));
  console.log(`Synced app_id ${parsed.app_id} to src/zcli.apps.config.json`);
} catch (error) {
  console.error('Failed to sync zcli config:', error);
  process.exit(1);
}

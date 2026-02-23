const fs = require('node:fs');
const path = require('node:path');

const requiredPaths = [
  'dist/manifest.json',
  'dist/assets/index.html',
  'dist/assets/main.js',
  'dist/assets/main.css',
  'dist/translations/en.json'
];

const missing = requiredPaths.filter((relativePath) => {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return !fs.existsSync(absolutePath);
});

if (missing.length > 0) {
  console.error('Build output is incomplete. Missing files:');
  missing.forEach((filePath) => console.error(`- ${filePath}`));
  console.error('Run `npm run build` and ensure it completes successfully.');
  process.exit(1);
}

console.log('Build output verified.');

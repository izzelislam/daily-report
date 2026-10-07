#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const built = path.join(__dirname, '..', 'dist', 'cli.js');
if (!fs.existsSync(built)) {
  console.error('dailyreport is not built yet. Run: npm run build (inside /app)');
  process.exit(1);
}
require(built);

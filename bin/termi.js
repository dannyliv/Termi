#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error('');
  console.error('Termi needs a newer version of Node.js to run.');
  console.error(`You have ${process.versions.node}. Termi needs 20.19 or newer.`);
  console.error('A grown-up can get the latest from: https://nodejs.org');
  console.error('');
  process.exit(1);
}
if (process.argv[2] === '--version' || process.argv[2] === '-v') {
  // Answered here so a version check never loads (or depends on) the app.
  const { createRequire } = await import('node:module');
  const pkg = createRequire(import.meta.url)('../package.json');
  console.log(pkg.version);
  process.exit(0);
}
import(new URL('../dist/cli.js', import.meta.url)).catch((err) => {
  console.error('Termi could not start. Details were saved for a grown-up.');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});

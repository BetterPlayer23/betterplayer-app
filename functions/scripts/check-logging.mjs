// Fails if Cloud Functions code could write secrets or whole error objects to
// the logs. Rule: log with logger + safeError / logError (src/safeLog.ts);
// never console.*, never String(error), never an error object as a log field.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const root = new URL('../src', import.meta.url).pathname;
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) files.push(p);
  }
};
walk(root);

const rules = [
  [/\bconsole\.(info|warn|error|debug)\s*\(/, 'use logger from firebase-functions, not console'],
  [/String\(\s*(e|err|error)\s*\)/, 'use safeError(e) instead of String(e)'],
  [/logger\.\w+\([^)]*[,{]\s*(e|err|error)\s*[,)}]/, 'pass safeError(e), never the error object'],
  [/logger\.\w+\([^)]*\berror\s*:\s*(e|err)\b/, 'pass safeError(e), never the error object'],
  [/logger\.\w+\([^)]*(apiKey|password|\.value\(\))/i, 'never log secrets'],
];
let bad = 0;
for (const file of files) {
  if (file.endsWith('safeLog.ts')) continue;
  const script = file.includes('/src/scripts/'); // run by hand in a terminal
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    // Ignore words inside quoted text, e.g. a message naming a secret.
    const code = line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "''");
    for (const [re, why] of rules) {
      if (script && why.startsWith('use logger')) continue;
      if (re.test(code)) {
        bad++;
        console.log(`${file.replace(root, 'src')}:${i + 1}: ${why}`);
      }
    }
  });
}
if (bad) {
  console.log(`\n${bad} unsafe logging line(s).`);
  process.exit(1);
}
console.log(`Logging check passed (${files.length} files).`);

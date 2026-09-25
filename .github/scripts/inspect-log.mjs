// Read-only: describe log entries WITHOUT printing their text.
// For each WARNING-or-worse entry of a function in a time window, prints its
// shape (where the text is, how long, which JSON keys) and YES/NO answers:
// does it contain one of our secrets, or something that looks like a key?
// Secret values are only compared in memory and never printed.
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

const PROJECT = 'betterplayer-beta';
const { SERVICE, FROM, TO } = process.env;
const say = (q, a) => console.log(`   ${q.padEnd(52)} ${a}`);

// Secrets we can compare against (values stay in memory).
const secrets = [];
const keyFile = readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
const key = JSON.parse(keyFile);
for (const f of ['private_key_id', 'private_key', 'client_email', 'client_id']) {
  if (key[f]) secrets.push({ name: `deploy key field "${f}"`, value: String(key[f]) });
}
for (const line of String(key.private_key ?? '').split('\n')) {
  if (line.length >= 20) secrets.push({ name: 'a line of the deploy private key', value: line });
}
for (const name of ['ANTHROPIC_API_KEY', 'GMAIL_APP_PASSWORD']) {
  try {
    const value = execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret', name, '--project', PROJECT], { encoding: 'utf8' }).trim();
    if (value && value !== 'not-set') secrets.push({ name: `secret ${name}`, value });
    if (name === 'GMAIL_APP_PASSWORD' && value) secrets.push({ name: `secret ${name} (no spaces)`, value: value.replace(/\s/g, '') });
  } catch { console.log(`(could not read ${name}; skipped)`); }
}
// GitHub hides every line of the GCP_SA_KEY secret in logs. Short lines of the
// key file (like "{" or "}") are harmless but get hidden too.
const keyLines = keyFile.split('\n').map((l) => l.trim()).filter(Boolean);

const patterns = [
  ['Anthropic-style key (sk-ant-…)', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['private key block (BEGIN … KEY)', /-----BEGIN [A-Z ]*KEY-----/],
  ['Google access token (ya29.…)', /ya29\.[A-Za-z0-9_-]{20,}/],
  ['"Authorization" / "x-api-key" header', /authorization|x-api-key/i],
  ['the word "password" / "pass:"', /password|"pass"\s*:/i],
];

const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${SERVICE}" AND severity>=WARNING AND timestamp>="${FROM}" AND timestamp<="${TO}"`;
const entries = JSON.parse(execFileSync('gcloud', ['logging', 'read', filter, '--project', PROJECT, '--limit', '50', '--format', 'json'], { encoding: 'utf8' }) || '[]');
console.log(`${entries.length} warning/error entries for ${SERVICE} between ${FROM} and ${TO}\n`);

for (const e of entries.reverse()) {
  const text = e.textPayload ?? JSON.stringify(e.jsonPayload ?? e.protoPayload ?? {});
  const firstLine = (e.jsonPayload?.message ?? e.textPayload ?? '').split('\n')[0].trim();
  console.log(`${e.timestamp} ${e.severity}`);
  say('Log name:', String(e.logName).split('/').pop());
  say('Text is in:', e.textPayload !== undefined ? 'textPayload (plain text)' : e.jsonPayload ? 'jsonPayload (structured)' : 'other');
  if (e.jsonPayload) say('JSON keys:', Object.keys(e.jsonPayload).join(', '));
  say('Length / lines:', `${text.length} characters, ${text.split('\n').length} line(s)`);
  const onlyPunct = /^[\s{}\[\](),:;"'.-]*$/.test(firstLine);
  say('First line is only brackets/punctuation:', onlyPunct ? `YES (${JSON.stringify(firstLine)})` : 'NO');
  const hiddenLine = keyLines.findIndex((l) => firstLine === l);
  say('First line equals a line of the deploy key file:', hiddenLine < 0 ? 'NO' : `YES (line ${hiddenLine + 1}, ${keyLines[hiddenLine].length} chars${onlyPunct ? ', punctuation only' : ''})`);
  const hits = secrets.filter((s) => s.value && text.includes(s.value)).map((s) => s.name);
  say('Contains one of our secret values:', hits.length ? `YES: ${[...new Set(hits)].join('; ')}` : 'NO');
  for (const [label, re] of patterns) if (re.test(text)) say(`Looks like it contains ${label}:`, 'YES');
  console.log('');
}

#!/usr/bin/env node
/** Ejecuta el paso real de monitor.yml sin secretos: ausencia debe fallar. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/monitor.yml'), 'utf8');
const lines = workflow.split(/\r?\n/);
const start = lines.findIndex((line) => line === '        run: |');
assert.ok(start >= 0, 'monitor.yml debe tener un paso shell');
const body = [];
for (const line of lines.slice(start + 1)) {
  if (line && !line.startsWith('          ')) break;
  body.push(line.slice(10));
}
assert.ok(body.length > 0, 'el paso shell no puede estar vacio');

const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash';
const result = await new Promise((resolveResult, reject) => {
  const child = spawn(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', body.join('\n')], {
    cwd: root,
    env: {
      ...process.env,
      MONITOR_METRICS_URL: '',
      MONITOR_METRICS_TOKEN: '',
      GITHUB_STEP_SUMMARY: '/dev/null',
    },
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.once('error', reject);
  child.once('close', (code) => resolveResult({ code, output }));
});
assert.notEqual(result.code, 0, 'sin credenciales no se midio nada: el monitor debe fallar');
assert.match(result.output, /Monitoreo SIN CONFIGURAR|Faltan MONITOR_METRICS_/);
console.log('monitor-workflow.spec: sin secretos el paso real falla y lo explica');

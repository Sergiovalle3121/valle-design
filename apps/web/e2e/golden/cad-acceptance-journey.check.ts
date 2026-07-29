import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAD_ACCEPTANCE_JOURNEY } from './cad-acceptance-journey';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

assert.equal(CAD_ACCEPTANCE_JOURNEY.length, 50, 'the CAD acceptance journey must contain exactly 50 steps');
assert.deepEqual(CAD_ACCEPTANCE_JOURNEY.map((entry) => entry.step), Array.from({ length: 50 }, (_, index) => index + 1));
assert.equal(new Set(CAD_ACCEPTANCE_JOURNEY.map((entry) => entry.action)).size, 50, 'step actions must be unique');
for (const entry of CAD_ACCEPTANCE_JOURNEY) {
  assert.ok(entry.evidence.length > 0, `step ${entry.step} has no evidence`);
  for (const evidence of entry.evidence)
    assert.ok(existsSync(resolve(repositoryRoot, evidence)), `step ${entry.step} evidence is missing: ${evidence}`);
}

const counts = CAD_ACCEPTANCE_JOURNEY.reduce<Record<string, number>>((result, entry) => {
  result[entry.level] = (result[entry.level] ?? 0) + 1;
  return result;
}, {});
assert.deepEqual(counts, { 'browser-proven': 45, performance: 5 });
console.log(`CAD acceptance journey verified: 50/50 mapped · ${JSON.stringify(counts)}`);

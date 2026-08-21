import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { probeDwg, type DwgProbeResult } from "../../src/index.js";

const KNOWN_SIGNATURES = [
  "AC1009",
  "AC1012",
  "AC1014",
  "AC1015",
  "AC1018",
  "AC1021",
  "AC1024",
  "AC1027",
  "AC1032",
] as const;

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function assertTypedFailure(result: DwgProbeResult, inputLength: number): void {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(typeof result.error.code, "string");
  assert.notEqual(result.error.code.length, 0);
  assert.notEqual(result.error.code, "DWG_INTERNAL_ERROR");
  assert.equal(typeof result.error.category, "string");
  assert.equal(typeof result.error.message, "string");
  assert.equal(Number.isSafeInteger(result.error.offset), true);
  assert.ok(result.error.offset >= 0);
  assert.equal(Number.isSafeInteger(result.workUnits), true);
  assert.ok(result.workUnits >= 0);
  assert.ok(result.workUnits <= inputLength * 2 + 1);
  assert.ok(Array.isArray(result.diagnostics));
  assert.ok(Array.isArray(result.lossManifest));
}

/**
 * Una entrada que empieza con la firma AC1015 completa hace que el probe
 * tenga éxito desde que el decoder de laboratorio existe; los invariantes
 * duros (presupuesto acotado, metadata coherente) se mantienen.
 */
function startsWithLabDecodedSignature(bytes: Uint8Array): boolean {
  const signature = ascii("AC1015");
  if (bytes.byteLength < signature.byteLength) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function assertTypedResult(result: DwgProbeResult, bytes: Uint8Array): void {
  if (startsWithLabDecodedSignature(bytes)) {
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.probe.signature, "AC1015");
    assert.equal(result.probe.byteLength, bytes.byteLength);
    assert.equal(Number.isSafeInteger(result.workUnits), true);
    assert.ok(result.workUnits >= 0);
    assert.ok(result.workUnits <= bytes.byteLength * 2 + 1);
    return;
  }
  assertTypedFailure(result, bytes.byteLength);
}

function probeWithoutThrow(bytes: Uint8Array): DwgProbeResult {
  let result: DwgProbeResult | undefined;
  assert.doesNotThrow(() => {
    result = probeDwg(bytes);
  });
  assert.notEqual(result, undefined);
  return result!;
}

test("the public boundary returns a typed error for non-Uint8Array input", () => {
  const values: unknown[] = [
    null,
    undefined,
    "",
    "AC1015",
    [],
    {},
    new ArrayBuffer(6),
    1015,
  ];
  for (const value of values) {
    const result = probeDwg(value as Uint8Array);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "DWG_INPUT_INVALID");
  }
});

test(
  "SharedArrayBuffer-backed views fail closed before inspection",
  { skip: typeof SharedArrayBuffer === "undefined" },
  () => {
    const shared = new SharedArrayBuffer(6);
    const bytes = new Uint8Array(shared);
    bytes.set(ascii("AC1015"));
    const result = probeDwg(bytes);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "DWG_SHARED_BUFFER_REJECTED");
      assert.equal(result.error.offset, 0);
      assert.equal(result.probe, null);
    }
  },
);

test("a byte-offset view is bounded to its own region", () => {
  const backing = new Uint8Array(20).fill(0xff);
  backing.set(ascii("AC1015"), 7);
  const result = probeDwg(new Uint8Array(backing.buffer, 7, 6));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.probe.byteLength, 6);
});

test("a genuine cross-realm Uint8Array is accepted without weakening brand checks", () => {
  const context = createContext({});
  const crossRealm = runInContext(
    "Uint8Array.from([65, 67, 49, 48, 49, 53])",
    context,
  ) as Uint8Array;
  assert.equal(crossRealm instanceof Uint8Array, false);
  const result = probeDwg(crossRealm);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.probe.signature, "AC1015");
});

test("a detached Uint8Array is rejected as typed input failure", () => {
  const bytes = ascii("AC1015");
  const transferable = bytes.buffer as ArrayBuffer;
  structuredClone(transferable, { transfer: [transferable] });
  assert.equal(bytes.byteLength, 0);
  const result = probeDwg(bytes);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "DWG_INPUT_INVALID");
    assert.equal(result.probe, null);
  }
});

for (const signature of KNOWN_SIGNATURES) {
  const decoded = signature === "AC1015";
  test(`known signature ${signature} declares its real decoder status`, () => {
    const result = probeDwg(ascii(signature));
    assert.equal(result.ok, decoded);
    assert.notEqual(result.probe, null);
    assert.equal(result.workUnits, 13);
    if (result.ok) {
      assert.equal(result.probe.decoderStatus, "experimental-lab");
    } else {
      assert.equal(result.error.code, "DWG_VERSION_DECODER_UNSUPPORTED");
    }
  });
}

for (const signature of ["AC1000", "AC1099"]) {
  test(`syntactically valid unknown signature ${signature} is explicit`, () => {
    const result = probeDwg(ascii(signature));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "DWG_VERSION_UNKNOWN");
      assert.notEqual(result.probe, null);
      assert.equal(result.workUnits, 13);
    }
  });
}

for (const invalid of [
  "",
  "A",
  "AC",
  "AC1",
  "AC10",
  "AC101",
  "ac1015",
  "AC10A5",
  "XAC1015",
]) {
  test(`invalid or truncated boundary ${JSON.stringify(invalid)} fails closed`, () => {
    const bytes = ascii(invalid);
    const result = probeWithoutThrow(bytes);
    assertTypedFailure(result, bytes.byteLength);
    if (!result.ok) assert.equal(result.probe, null);
  });
}

const truncationVectors = [
  ...KNOWN_SIGNATURES,
  "AC1000",
  "AC1099",
  "ac1015",
  "AC10A5",
  "XAC1015",
  "AC1015\u0000\u00ff\u007f",
] as const;

for (const vector of truncationVectors) {
  const bytes = ascii(vector);
  for (let cut = 0; cut < bytes.byteLength; cut += 1) {
    test(`exhaustive truncation ${JSON.stringify(vector)} at byte ${cut}`, () => {
      const truncated = bytes.slice(0, cut);
      const result = probeWithoutThrow(truncated);
      assertTypedResult(result, truncated);
      assert.equal(JSON.stringify(result), JSON.stringify(probeDwg(truncated)));
    });
  }
}

function deterministicTestBytes(caseIndex: number): Uint8Array {
  const header = createHash("sha256")
    .update(`valle-dwg0-adversarial-v1:${caseIndex}:length`)
    .digest();
  const length = header.readUInt16LE(0) % 1_025;
  const bytes = new Uint8Array(length);
  for (let offset = 0, block = 0; offset < length; block += 1) {
    const digest = createHash("sha256")
      .update(`valle-dwg0-adversarial-v1:${caseIndex}:${block}`)
      .digest();
    const count = Math.min(digest.byteLength, length - offset);
    bytes.set(digest.subarray(0, count), offset);
    offset += count;
  }
  return bytes;
}

const generatedCases = Array.from({ length: 160 }, (_, index) => {
  const bytes = deterministicTestBytes(index);
  if (index % 10 === 0 && bytes.length >= 6) bytes.set(ascii("AC1015"));
  if (index % 10 === 1 && bytes.length >= 6) bytes.set(ascii("AC1099"));
  return bytes;
});

for (const [index, bytes] of generatedCases.entries()) {
  test(`generated hostile subcase ${index + 1}/160 is typed and deterministic`, () => {
    const first = probeWithoutThrow(bytes);
    const second = probeWithoutThrow(bytes.slice());
    assertTypedResult(first, bytes);
    assert.deepEqual(second, first);
  });
}

test("file-size limit accepts the exact boundary and rejects one byte above it", () => {
  const exact = ascii("AC1015");
  const atLimit = probeDwg(exact, {
    limits: { maxFileBytes: exact.byteLength },
  });
  assert.equal(atLimit.ok, true);

  const above = new Uint8Array(exact.byteLength + 1);
  above.set(exact);
  const rejected = probeDwg(above, {
    limits: { maxFileBytes: exact.byteLength },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "DWG_FILE_LIMIT_EXCEEDED");
    assert.equal(rejected.workUnits, 0);
    assert.equal(rejected.probe, null);
  }
});

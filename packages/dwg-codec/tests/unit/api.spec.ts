import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as publicApi from "../../src/index.js";
import {
  DEFAULT_DWG_LIMITS,
  DWG_VERSION_REGISTRY,
  probeDwg,
  readDwg,
  writeDwg,
  type DwgError,
  type DwgLimits,
  type DwgProbeResult,
} from "../../src/index.js";
import { createDwgLimits, DWG_LIMIT_BOUNDS } from "../../src/api/limits.js";
import { ascii } from "../support/assert.js";
import { FixedClock } from "../support/fake-clock.js";

const KNOWN = [
  ["AC1009", "R12"],
  ["AC1012", "R13"],
  ["AC1014", "R14"],
  ["AC1015", "2000"],
  ["AC1018", "2004"],
  ["AC1021", "2007"],
  ["AC1024", "2010"],
  ["AC1027", "2013"],
  ["AC1032", "2018"],
] as const;

/** Exige la variante de fallo y devuelve su error tipado. */
function expectError(result: DwgProbeResult): DwgError {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  return result.error;
}

test("the package exposes exactly five callable public boundaries", () => {
  const functions = Object.entries(publicApi).filter(
    ([, value]) => typeof value === "function",
  );
  assert.deepEqual(
    functions.map(([name]) => name).sort(),
    [
      "canonicalDocumentToDwgEntities",
      "dwgDatabaseToCanonicalDocument",
      "probeDwg",
      "readDwg",
      "writeDwg",
    ],
  );
});

test("the version registry is immutable and matches all nine known labels", () => {
  assert.equal(Object.isFrozen(DWG_VERSION_REGISTRY), true);
  assert.deepEqual(
    DWG_VERSION_REGISTRY.map(({ code, label }) => [code, label]),
    KNOWN,
  );
  for (const version of DWG_VERSION_REGISTRY) {
    assert.equal(Object.isFrozen(version), true);
    assert.equal(
      version.decoderStatus,
      version.code === "AC1015" ? "experimental-lab" : "unsupported",
    );
  }
});

for (const [signature, label] of KNOWN) {
  const decoded = signature === "AC1015";
  test(`${signature} probe declares its real decoder status`, () => {
    const result = probeDwg(ascii(signature));
    assert.equal(result.ok, decoded);
    assert.equal(result.workUnits, 13);
    assert.equal(result.probe?.versionKind, "known");
    if (result.probe?.versionKind === "known") {
      assert.equal(result.probe.version.label, label);
      assert.equal(
        result.probe.decoderStatus,
        decoded ? "experimental-lab" : "unsupported",
      );
    }
    if (!result.ok) {
      assert.equal(result.error.code, "DWG_VERSION_DECODER_UNSUPPORTED");
    }
    assert.equal(Object.isFrozen(result), true);
  });
}

test("the public writer and reader round-trip an empty container", () => {
  const bytes = writeDwg();
  const probe = probeDwg(bytes);
  assert.equal(probe.ok, true);
  const database = readDwg(bytes);
  assert.deepEqual(database.layers, []);
  assert.deepEqual(database.blocks, []);
  assert.deepEqual(database.modelSpaceEntities, []);
  assert.deepEqual(database.unsupported, []);
});

test("readDwg fails closed with a typed error on foreign signatures", () => {
  try {
    readDwg(ascii("AC1024"));
    assert.fail("readDwg must throw for versions without a decoder");
  } catch (error) {
    const detail = (error as { detail?: { code?: string } }).detail;
    assert.equal(detail?.code, "DWG_VERSION_DECODER_UNSUPPORTED");
  }
});

for (const signature of ["AC1000", "AC1099"] as const) {
  test(`${signature} is syntactically valid and explicitly unknown`, () => {
    const result = probeDwg(ascii(signature));
    assert.equal(expectError(result).code, "DWG_VERSION_UNKNOWN");
    assert.equal(result.probe?.versionKind, "unknown");
    assert.equal(result.probe?.signature, signature);
    assert.equal(result.workUnits, 13);
  });
}

for (let length = 0; length < 6; length += 1) {
  test(`a compatible ${length}-byte prefix is typed as truncated`, () => {
    const bytes = ascii("AC1015").slice(0, length);
    const result = probeDwg(bytes);
    const error = expectError(result);
    assert.equal(error.code, "DWG_SIGNATURE_TRUNCATED");
    assert.equal(error.offset, length);
    assert.equal(result.workUnits, length * 2);
    assert.equal(result.probe, null);
  });
}

const invalidAtPosition = [
  "XC1015",
  "AX1015",
  "AC2015",
  "AC1115",
  "AC10A5",
  "AC101X",
];
for (const [position, signature] of invalidAtPosition.entries()) {
  test(`a mismatch at signature byte ${position} is invalid`, () => {
    const result = probeDwg(ascii(signature));
    const error = expectError(result);
    assert.equal(error.code, "DWG_SIGNATURE_INVALID");
    assert.equal(error.offset, position);
    assert.equal(result.workUnits, 6 + position + 1);
    assert.equal(result.probe, null);
  });
}

test("bytes after the fixed signature remain opaque to the probe", () => {
  const result = probeDwg(Uint8Array.of(65, 67, 49, 48, 49, 53, 0, 255, 127));
  assert.equal(result.ok, true);
  assert.equal(result.probe?.byteLength, 9);
  assert.equal(result.workUnits, 16);
});

test("a view snapshots only its byte-offset region", () => {
  const backing = new Uint8Array(20).fill(88);
  backing.set(ascii("AC1015"), 7);
  const result = probeDwg(new Uint8Array(backing.buffer, 7, 6));
  assert.equal(result.ok, true);
  assert.equal(result.probe?.byteLength, 6);
});

test("a Node Buffer view is accepted as its exact Uint8Array region", () => {
  const backing = Buffer.alloc(20, 88);
  backing.set(ascii("AC1015"), 8);
  const result = probeDwg(backing.subarray(8, 14));
  assert.equal(result.ok, true);
  assert.equal(result.probe?.byteLength, 6);
});

test("a cross-realm Uint8Array is accepted without instanceof assumptions", () => {
  const crossRealm = runInNewContext(
    "new Uint8Array([65,67,49,48,49,53])",
  ) as Uint8Array;
  assert.equal(crossRealm instanceof Uint8Array, false);
  const result = probeDwg(crossRealm);
  assert.equal(result.ok, true);
});

test("detached Uint8Array storage fails as typed invalid input", () => {
  const input = ascii("AC1015");
  const buffer = input.buffer as ArrayBuffer;
  structuredClone(buffer, { transfer: [buffer] });
  const result = probeDwg(input);
  assert.equal(expectError(result).code, "DWG_INPUT_INVALID");
  assert.equal(result.workUnits, 0);
});

test(
  "SharedArrayBuffer-backed views are rejected before work",
  {
    skip: typeof SharedArrayBuffer === "undefined",
  },
  () => {
    const shared = new SharedArrayBuffer(6);
    new Uint8Array(shared).set(ascii("AC1015"));
    const result = probeDwg(new Uint8Array(shared));
    assert.equal(expectError(result).code, "DWG_SHARED_BUFFER_REJECTED");
    assert.equal(result.workUnits, 0);
  },
);

test(
  "SharedArrayBuffer rejection ignores forged tags and shadowed view fields",
  { skip: typeof SharedArrayBuffer === "undefined" },
  () => {
    const shared = new SharedArrayBuffer(6);
    const input = new Uint8Array(shared);
    input.set(ascii("AC1015"));
    Object.defineProperty(shared, Symbol.toStringTag, {
      configurable: true,
      value: "ArrayBuffer",
    });
    Object.defineProperties(input, {
      buffer: { configurable: true, value: new ArrayBuffer(6) },
      byteLength: { configurable: true, value: 6 },
      [Symbol.toStringTag]: { configurable: true, value: "Uint8Array" },
    });

    const result = probeDwg(input);
    assert.equal(expectError(result).code, "DWG_SHARED_BUFFER_REJECTED");
    assert.equal(result.workUnits, 0);
  },
);

test("ordinary Uint8Array identity ignores hostile shadow properties", () => {
  const input = ascii("AC1015");
  Object.defineProperties(input, {
    buffer: {
      configurable: true,
      value:
        typeof SharedArrayBuffer === "undefined"
          ? new ArrayBuffer(1)
          : new SharedArrayBuffer(1),
    },
    byteLength: { configurable: true, value: Number.MAX_SAFE_INTEGER },
    [Symbol.toStringTag]: { configurable: true, value: "DataView" },
  });

  const result = probeDwg(input);
  assert.equal(result.ok, true);
  assert.equal(result.probe?.byteLength, 6);
  assert.equal(result.workUnits, 13);
});

test("the owned snapshot is stable after the caller mutates its buffer", () => {
  const input = ascii("AC1015");
  let reads = 0;
  const signal = {
    get aborted(): boolean {
      reads += 1;
      if (reads === 3) input.fill(88);
      return false;
    },
  };
  const result = probeDwg(input, {
    signal,
    limits: { workPollInterval: 6 },
    clock: new FixedClock(0),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(input), [88, 88, 88, 88, 88, 88]);
});

test("invalid public values never escape a raw exception", () => {
  const badInputs: unknown[] = [
    null,
    undefined,
    "AC1015",
    [],
    {},
    new ArrayBuffer(6),
    1015,
  ];
  for (const input of badInputs) {
    const result = probeDwg(input as Uint8Array);
    assert.equal(expectError(result).code, "DWG_INPUT_INVALID");
  }
});

test("hostile thrown proxies cannot escape the public error normalizer", () => {
  const hostile = new Proxy(
    {},
    {
      getPrototypeOf(): never {
        throw new Error("must not escape");
      },
    },
  );
  const result = probeDwg(ascii("AC1015"), {
    clock: {
      now(): number {
        throw hostile;
      },
    },
  });
  const error = expectError(result);
  assert.equal(error.code, "DWG_INTERNAL_ERROR");
  assert.equal(error.message.includes("escape"), false);
});

test("null, array, and unknown options are typed invalid input", () => {
  const options: unknown[] = [null, [], { surprise: true }];
  for (const value of options) {
    const result = probeDwg(ascii("AC1015"), value as never);
    assert.equal(expectError(result).code, "DWG_INPUT_INVALID");
  }
});

test("malformed clock and cancellation collaborators are typed invalid input", () => {
  const badOptions: unknown[] = [
    { clock: {} },
    { clock: { now: 1 } },
    { signal: {} },
    { signal: { aborted: "no" } },
  ];
  for (const value of badOptions) {
    const result = probeDwg(ascii("AC1015"), value as never);
    assert.equal(expectError(result).code, "DWG_INPUT_INVALID");
  }
});

test("all twelve limits are frozen, reducible, and bounded by their defaults", () => {
  const names = Object.keys(DEFAULT_DWG_LIMITS) as (keyof DwgLimits)[];
  assert.equal(names.length, 12);
  assert.equal(Object.isFrozen(DEFAULT_DWG_LIMITS), true);
  for (const name of names) {
    assert.deepEqual(DWG_LIMIT_BOUNDS[name], {
      min: 1,
      max: DEFAULT_DWG_LIMITS[name],
    });
    assert.equal(createDwgLimits({ [name]: 1 })[name], 1);
    assert.equal(
      createDwgLimits({ [name]: DEFAULT_DWG_LIMITS[name] })[name],
      DEFAULT_DWG_LIMITS[name],
    );
    assert.throws(() =>
      createDwgLimits({ [name]: DEFAULT_DWG_LIMITS[name] + 1 }),
    );
  }
});

test("null limit fields are rejected rather than replaced by defaults", () => {
  const result = probeDwg(ascii("AC1015"), {
    limits: { maxFileBytes: null } as unknown as Partial<DwgLimits>,
  });
  assert.equal(expectError(result).code, "DWG_INPUT_INVALID");
});

test("default file and work ceilings are coherent at the exact file limit", () => {
  assert.equal(
    DEFAULT_DWG_LIMITS.maxWorkUnits,
    2 * DEFAULT_DWG_LIMITS.maxFileBytes + 1,
  );
  const bytes = new Uint8Array(DEFAULT_DWG_LIMITS.maxFileBytes);
  bytes.set(ascii("AC1015"));
  const result = probeDwg(bytes, { clock: new FixedClock(0) });
  assert.equal(result.ok, true);
  assert.equal(result.workUnits, bytes.byteLength + 7);
});

test("one byte above maxFileBytes is rejected before snapshot work", () => {
  const result = probeDwg(ascii("AC1015x"), { limits: { maxFileBytes: 6 } });
  assert.equal(expectError(result).code, "DWG_FILE_LIMIT_EXCEEDED");
  assert.equal(result.workUnits, 0);
});

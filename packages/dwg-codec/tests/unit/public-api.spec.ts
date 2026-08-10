import assert from "node:assert/strict";
import test from "node:test";
import {
  createDwgExtensionRegistry,
  getDwgCapabilities,
  readDwg,
  writeDwg,
  type DwgDocument,
  type DwgExtensionCodec,
} from "../../src/index.js";
import { createDwgWorkerRequest } from "../../src/worker/protocol.js";
import { assertDwgError, ascii } from "../support/assert.js";

const SHA256 = "0".repeat(64);

const COMPLETE_DOCUMENT: DwgDocument = Object.freeze({
  neutralModelVersion: 1,
  objectDatabaseComplete: true,
  source: Object.freeze({
    sha256: SHA256,
    byteLength: 6,
    version: "AC1032",
  }),
  objects: Object.freeze([]),
  diagnostics: Object.freeze([]),
  lossManifest: Object.freeze([]),
});

test("capabilities are immutable and keep all nine versions disabled", () => {
  const capabilities = getDwgCapabilities();
  assert.equal(capabilities.schemaVersion, "1.0.0");
  assert.equal(capabilities.matrixVersion, "v1");
  assert.equal(capabilities.neutralModelVersion, 1);
  assert.equal(capabilities.productionAvailable, false);
  assert.equal(capabilities.versions.length, 9);
  assert.equal(Object.isFrozen(capabilities), true);
  assert.equal(Object.isFrozen(capabilities.versions), true);
  for (const version of capabilities.versions) {
    assert.equal(version.probe, "supported");
    assert.deepEqual(
      version.directions.map((direction) => direction.direction),
      ["read", "write"],
    );
    for (const direction of version.directions) {
      assert.equal(direction.state, "unsupported");
      assert.equal(direction.families.length, 19);
      assert.equal(Object.isFrozen(direction.families), true);
      for (const family of direction.families) {
        assert.equal(family.state, "unsupported");
        assert.equal(
          family.properties.every(
            (property) => property.state === "unsupported",
          ),
          true,
        );
      }
    }
  }
});

test("readDwg returns no partial document while the decoder is unavailable", () => {
  const result = readDwg(ascii("AC1032"));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "DWG_VERSION_DECODER_UNSUPPORTED");
  }
  assert.equal(Object.hasOwn(result, "document"), false);
});

test("writeDwg validates a complete model then fails closed as unsupported", () => {
  const result = writeDwg(COMPLETE_DOCUMENT, { targetVersion: "AC1032" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "DWG_VERSION_WRITER_UNSUPPORTED");
    assert.equal(result.targetVersion, "AC1032");
  }
  assert.equal(Object.hasOwn(result, "bytes"), false);

  const invalid = writeDwg({} as DwgDocument, { targetVersion: "AC1032" });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, "DWG_INPUT_INVALID");
});

test("the extension registry accepts only static first-party descriptors", () => {
  const descriptor = {
    id: "valle.example",
    schemaVersion: 1,
    origin: "valle-first-party" as const,
    supportedVersions: ["AC1032"] as const,
    objectTypes: ["VALLE_EXAMPLE"] as const,
  };
  const registry = createDwgExtensionRegistry([descriptor]);
  assert.equal(registry.get("valle.example")?.id, "valle.example");
  assert.equal(registry.get("missing"), null);
  assert.equal(Object.isFrozen(registry.codecs), true);
  assertDwgError(
    () => createDwgExtensionRegistry([descriptor, descriptor]),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      createDwgExtensionRegistry([
        { ...descriptor, origin: "third-party" as never },
      ]),
    "DWG_INPUT_INVALID",
  );

  const hostileOuter = [] as unknown as {
    map: () => readonly unknown[];
  };
  hostileOuter.map = () => [
    {
      ...descriptor,
      id: "injected",
      origin: "third-party",
      supportedVersions: ["AC9999"],
    },
  ];
  assert.deepEqual(
    createDwgExtensionRegistry(
      hostileOuter as unknown as readonly DwgExtensionCodec[],
    ).codecs,
    [],
  );

  const hostileVersions = ["AC1032"];
  Object.defineProperty(hostileVersions, Symbol.iterator, {
    value: () => {
      throw new Error("caller iterator must remain inert");
    },
  });
  const inertIteratorRegistry = createDwgExtensionRegistry([
    { ...descriptor, supportedVersions: hostileVersions as ["AC1032"] },
  ]);
  assert.equal(inertIteratorRegistry.get("valle.example")?.id, "valle.example");

  let getterExecuted = false;
  const accessorDescriptor = { ...descriptor } as Record<string, unknown>;
  Object.defineProperty(accessorDescriptor, "id", {
    enumerable: true,
    get: () => {
      getterExecuted = true;
      return "accessor";
    },
  });
  assertDwgError(
    () =>
      createDwgExtensionRegistry([
        accessorDescriptor as unknown as DwgExtensionCodec,
      ]),
    "DWG_INPUT_INVALID",
  );
  assert.equal(getterExecuted, false);
});

test("worker requests are versioned, copied and operation-validated", () => {
  interface ProbePayload {
    readonly bytes: Uint8Array;
  }
  const parseProbePayload = (
    value: unknown,
    operation: "probe",
  ): value is ProbePayload =>
    operation === "probe" &&
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    "bytes" in value &&
    value.bytes instanceof Uint8Array;
  const request = createDwgWorkerRequest(
    "request-1",
    "probe",
    {
      bytes: Uint8Array.of(65, 67, 49, 48, 49, 53),
    },
    parseProbePayload,
  );
  assert.equal(request.protocolVersion, 1);
  assert.equal(request.requestId, "request-1");
  assert.equal(request.operation, "probe");
  assert.equal(Object.getPrototypeOf(request.payload), null);
  assert.deepEqual(
    request.payload.bytes,
    Uint8Array.of(65, 67, 49, 48, 49, 53),
  );
});

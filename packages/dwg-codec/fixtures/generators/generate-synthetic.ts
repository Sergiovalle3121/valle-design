import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXED_CREATED_AT = "2026-08-09";
export const FIXED_GENERATED_AT = "2026-08-09T00:00:00Z";
export const GENERATOR_PATH = "fixtures/generators/generate-synthetic.ts";
export const OWNER_SOURCE_ID = "VALLE-OWNER-DWG0-2026-08-09";
export const BASE_SOURCE_ID = "VALLE-REPO-BASE-8BE49A55";

type SignatureExpectation =
  "recognized" | "unknown-version" | "invalid" | "truncated";

type ParseOutcome = "ok" | "unsupported" | "error";

export interface SyntheticFixtureSpec {
  readonly id: string;
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly declaredVersion: string | null;
  readonly purpose: readonly string[];
  readonly expectations: {
    readonly signature: SignatureExpectation;
    readonly parseOutcome: ParseOutcome;
    readonly errorCode: string | null;
    readonly maxWorkUnits: number;
  };
}

export interface FixtureManifestEntry {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly creator: string;
  readonly createdAt: string;
  readonly origin: {
    readonly type:
      | "valle-synthetic"
      | "owner-authorized"
      | "original-measurement"
      | "third-party-licensed";
    readonly reference: string;
  };
  readonly sourceIds: readonly string[];
  readonly permission: {
    readonly basis: string;
    readonly license:
      | "Valle-Internal-Synthetic"
      | "Valle-Owner-Authorized"
      | "0BSD"
      | "Apache-2.0"
      | "BSD-2-Clause"
      | "BSD-3-Clause"
      | "CC-BY-4.0"
      | "CC0-1.0"
      | "ISC"
      | "MIT"
      | "Unlicense";
    readonly redistributionEvidence: string;
  };
  readonly declaredVersion: string | null;
  readonly byteLength: number;
  readonly purpose: readonly string[];
  readonly expectations: SyntheticFixtureSpec["expectations"];
  readonly synthetic: boolean;
  readonly generatedBy: string | null;
  readonly redistributable: true;
  readonly intakeId?: string | null;
  readonly intakeRecord?: {
    readonly path: string;
    readonly sha256: string;
    readonly byteLength: number;
  } | null;
  readonly oracle?: {
    readonly id: string;
    readonly kind:
      | "owner-ground-truth"
      | "original-measurement"
      | "independent-reader"
      | "independent-writer"
      | "adversarial-expectation";
    readonly artifactSha256: string;
    readonly groundTruthSha256: string;
    readonly groundTruthPath: string;
    readonly groundTruthByteLength: number;
    readonly reviewer: string;
    readonly reviewedAt: string;
  } | null;
}

export interface FixtureManifest {
  readonly schemaVersion: "1.1.0";
  readonly generatedAt: string;
  readonly fixtures: readonly FixtureManifestEntry[];
}

const ascii = (value: string): Uint8Array =>
  Uint8Array.from([...value].map((character) => character.charCodeAt(0)));

const signatureSpec = (
  category: "recognized" | "unknown",
  signature: string,
): SyntheticFixtureSpec => {
  const recognized = category === "recognized";
  return {
    id: `synthetic.${category}.${signature.toLowerCase()}`,
    path: `synthetic/${category}/${signature.toLowerCase()}.dwg`,
    bytes: ascii(signature),
    declaredVersion: signature,
    purpose: [
      recognized
        ? "Exercise a known first-party signature without claiming a decoder"
        : "Exercise a syntactically valid but unknown AC10xx signature",
    ],
    expectations: {
      signature: recognized ? "recognized" : "unknown-version",
      parseOutcome: "unsupported",
      errorCode: recognized
        ? "DWG_VERSION_DECODER_UNSUPPORTED"
        : "DWG_VERSION_UNKNOWN",
      maxWorkUnits: 32,
    },
  };
};

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

export function createSyntheticCorpus(): readonly SyntheticFixtureSpec[] {
  const ac1015 = ascii("AC1015");
  const truncated = Array.from({ length: 6 }, (_, length) => ({
    id:
      length === 0
        ? "synthetic.truncated.empty"
        : `synthetic.truncated.ac1015-prefix-${length}`,
    path:
      length === 0
        ? "synthetic/truncated/empty.dwg"
        : `synthetic/truncated/ac1015-prefix-${length}.dwg`,
    bytes: ac1015.slice(0, length),
    declaredVersion: null,
    purpose: ["Exercise deterministic signature truncation at every byte"],
    expectations: {
      signature: "truncated" as const,
      parseOutcome: "error" as const,
      errorCode: "DWG_SIGNATURE_TRUNCATED",
      maxWorkUnits: 32,
    },
  }));

  const invalid: readonly SyntheticFixtureSpec[] = [
    {
      id: "synthetic.invalid.lowercase-ac1015",
      path: "synthetic/invalid/lowercase-ac1015.dwg",
      bytes: ascii("ac1015"),
      declaredVersion: null,
      purpose: ["Verify that signature matching is case-sensitive"],
      expectations: {
        signature: "invalid",
        parseOutcome: "error",
        errorCode: "DWG_SIGNATURE_INVALID",
        maxWorkUnits: 32,
      },
    },
    {
      id: "synthetic.invalid.nondigit-ac10a5",
      path: "synthetic/invalid/nondigit-ac10a5.dwg",
      bytes: ascii("AC10A5"),
      declaredVersion: null,
      purpose: ["Reject a non-decimal byte in the AC10xx version suffix"],
      expectations: {
        signature: "invalid",
        parseOutcome: "error",
        errorCode: "DWG_SIGNATURE_INVALID",
        maxWorkUnits: 32,
      },
    },
    {
      id: "synthetic.invalid.shifted-xac1015",
      path: "synthetic/invalid/shifted-xac1015.dwg",
      bytes: ascii("XAC1015"),
      declaredVersion: null,
      purpose: ["Reject a known signature shifted away from offset zero"],
      expectations: {
        signature: "invalid",
        parseOutcome: "error",
        errorCode: "DWG_SIGNATURE_INVALID",
        maxWorkUnits: 32,
      },
    },
  ];

  const recognized = KNOWN_SIGNATURES.map((signature) =>
    signatureSpec("recognized", signature),
  );
  const recognizedTail: SyntheticFixtureSpec = {
    ...signatureSpec("recognized", "AC1015"),
    id: "synthetic.recognized.ac1015-tail",
    path: "synthetic/recognized/ac1015-tail.dwg",
    bytes: Uint8Array.of(...ascii("AC1015"), 0x00, 0xff, 0x7f),
    purpose: [
      "Verify that signature probing is bounded to the six-byte prefix",
      "Keep arbitrary trailing bytes unsupported rather than treating them as a decoded header",
    ],
  };
  const unknown = ["AC1000", "AC1099"].map((signature) =>
    signatureSpec("unknown", signature),
  );

  return [...truncated, ...invalid, ...recognized, recognizedTail, ...unknown];
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createSyntheticManifest(
  corpus: readonly SyntheticFixtureSpec[] = createSyntheticCorpus(),
): FixtureManifest {
  return {
    schemaVersion: "1.1.0",
    generatedAt: FIXED_GENERATED_AT,
    fixtures: corpus.map((fixture) => ({
      id: fixture.id,
      path: fixture.path,
      sha256: sha256(fixture.bytes),
      creator: "Valle Design DWG-0 clean-room generator",
      createdAt: FIXED_CREATED_AT,
      origin: {
        type: "valle-synthetic",
        reference: GENERATOR_PATH,
      },
      sourceIds: [OWNER_SOURCE_ID, BASE_SOURCE_ID],
      permission: {
        basis: "Direct authorization from the Valle repository owner",
        license: "Valle-Internal-Synthetic",
        redistributionEvidence: `SOURCE_REGISTER.json#${OWNER_SOURCE_ID}`,
      },
      declaredVersion: fixture.declaredVersion,
      byteLength: fixture.bytes.byteLength,
      purpose: fixture.purpose,
      expectations: fixture.expectations,
      synthetic: true,
      generatedBy: GENERATOR_PATH,
      redistributable: true,
    })),
  };
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeSyntheticCorpus(): Promise<void> {
  const fixtureRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const corpus = createSyntheticCorpus();

  for (const fixture of corpus) {
    const outputPath = resolve(fixtureRoot, fixture.path);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, fixture.bytes);
  }

  await writeFile(
    resolve(fixtureRoot, "manifest.json"),
    canonicalJson(createSyntheticManifest(corpus)),
    "utf8",
  );

  const totalBytes = corpus.reduce(
    (total, fixture) => total + fixture.bytes.byteLength,
    0,
  );
  console.log(
    `Generated ${corpus.length} synthetic fixtures (${totalBytes} bytes) with a canonical manifest.`,
  );
}

if (process.argv[1] !== undefined) {
  const invokedPath = resolve(process.argv[1]);
  const modulePath = resolve(fileURLToPath(import.meta.url));
  if (invokedPath === modulePath) {
    if (process.argv.length !== 3 || process.argv[2] !== "--write") {
      throw new Error("Usage: generate-synthetic.ts --write");
    }
    void writeSyntheticCorpus().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}

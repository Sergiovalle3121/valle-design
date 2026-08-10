import { caseFold } from "./safe-path.js";

interface ContentAdmission {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

const ROWS = [
  "packages/dwg-codec/.gitattributes|8fff19a378cb915179d66293d0bae06bd0d87ca0946d4f56b2e64c04e7edc652|53",
  "packages/dwg-codec/AGENTS.md|d61936840162aa752611400b4b56eda4570311d990afb6764ecab8b8ad2ac05c|6497",
  "packages/dwg-codec/CAPABILITIES.md|ab96837f9a9a025f488b6c5be84055a888c6fbc8236ba3b607317ae27679a13b|5776",
  "packages/dwg-codec/CLEAN_ROOM_POLICY.md|632b94943c35e72e3e58e1a5efa012f593ca8aae2ad478fcc9847b74df872b87|6047",
  "packages/dwg-codec/COMPATIBILITY_MATRIX.v1.json|fe5b31bba5cb32d413857f9ec36121cd176615b922639a9755382b1d9e191027|7812",
  "packages/dwg-codec/compatibility-matrix.schema.json|129aa1c94a4df9986611dfaf69295cc54f85479061e2adca5862507299e2f3a1|8465",
  "packages/dwg-codec/CORPUS_INTAKE.md|ea52601c7fec1a5dce5997b956423cacb025aad9ab619cee03c67b7abb6cb57f|4112",
  "packages/dwg-codec/corpus-intake.schema.json|2949bc9fc596092450c329022f26b0b3b709f6b928ff3c764a7cfe6d5d37736f|11250",
  "packages/dwg-codec/DWG0_CONTENT_BASELINE.v1.json|91b83a607f12337f2dcb1bfac3de9a6b30b51c6c631bf2b20adc544aa494e2a2|15204",
  "packages/dwg-codec/dwg0-content-baseline.schema.json|29fb66cf4be5362ee8cf27e2acec55b4b0af95202a66a88cafb7eae3651895bf|1513",
  "packages/dwg-codec/FACT_REGISTER.json|310951857daec12f87e1c68f3b9ae33c71305795c781f179e9c852cfa81b751b|5359",
  "packages/dwg-codec/fact-register.schema.json|a032f27996fb87fd47ee143856126f73358166567dfae295ad8eeb0857ded803|5522",
  "packages/dwg-codec/fixtures/generators/generate-synthetic.ts|288f1a5ef2fb55e9e414636062f53b90280b0e68a4d75389d005e586c6600451|9236",
  "packages/dwg-codec/fixtures/manifest.json|094dc3ec7ff4bf9183240d3dfd11491ed53a59219bb8a8d03dd6d85d7959992d|25667",
  "packages/dwg-codec/fixtures/manifest.schema.json|a35a31d4c8d456c61fa9b0e8eab2d68ad0f5845ad4ab750119d21477ef1f21ca|17013",
  "packages/dwg-codec/OWNER_DIRECTIVE_DWG1.md|15d57552b1452620c8e0343d5f554a4e5d58a5630716459caf7d69af01c3d3b0|2200",
  "packages/dwg-codec/package.json|9f6f987f7ef92936697308c831ce386f991681c205bc5b0050aa3243fe025ab0|1652",
  "packages/dwg-codec/private-bundle.schema.json|09c7f027311e025675b8ec1bea783da58bd121e5643c10bb19d9348777081135|3319",
  "packages/dwg-codec/README.md|b2e794769ff49572314b8e0ae9ec829dd5ca22495ee25c796e251c12f64b967d|7949",
  "packages/dwg-codec/SOURCE_REGISTER.json|080b0be2ccc7a17cd55d6bbc4bc7c377791342b2979ecbdba9a733126ba07d62|21015",
  "packages/dwg-codec/THREAT_MODEL.md|7a506022bcb80ef805c4366fab24826ae3c6eef7f79ef310fda88c21e5b17002|8068",
  "packages/dwg-codec/scripts/check-capabilities.ts|a76c04fc65e239f9ba3ab397be6e0b2724272865866c64c63320853bce480d03|5651",
  "packages/dwg-codec/scripts/check-fixtures.ts|097dcc4efebf33d45eeda453b3f92a136f5a909725247253667ef158594d2d39|555",
  "packages/dwg-codec/scripts/check-research.ts|c78cc9bf6d058eb26a823a84108525e1377548bc792dcab5bc89c25813bb3c69|779",
  "packages/dwg-codec/scripts/fixture-validation.ts|9e85a29661ec259cd514db7e7b2c7ee21879d311497fd8051e4b5b01e9da7ac8|19858",
  "packages/dwg-codec/scripts/private-bundle-validation.ts|f023822db20b64350a254ac2f29bc4e7ab4950bd014b3329ebf77b05cc574c25|1715",
  "packages/dwg-codec/scripts/provenance-validation.ts|c49c75de7552a7c676a87b1b6237dd5f34df1006dcd287a0901056cd69c93311|27248",
  "packages/dwg-codec/scripts/research-validation.ts|373380134fc3dbeac405d753296610d67f191ff34a2bab722147435b5c8fa3e6|22928",
  "packages/dwg-codec/scripts/schema-validation.ts|1d93cb0c5a4239472e5cb08472e4f2acf4e643472afcecce747ff2d4ce70130f|1537",
  "packages/dwg-codec/source-register.schema.json|7c7010095d8a1c5e01b2b499365c5cad56629d3026d6e974a7402bae555b9750|6054",
  "packages/dwg-codec/src/api/capabilities.ts|a43d9d5864a7a46ddce41e35dfc31d7573b49289b3decaf9893ef0e81406fcc9|5358",
  "packages/dwg-codec/src/api/diagnostics.ts|cef59a605cc3ad8a652f0ac780caf6fd787db1b626106c5b426046c55f9c6539|900",
  "packages/dwg-codec/src/api/limits.ts|cbe648b78e8cdda1c96a223ecf0073661b59abbdce6d1f02c0596a5bd236cdf4|5429",
  "packages/dwg-codec/src/api/probe.ts|eb2357f8144f77f98d521d20a35e63f0562a43fac500fc7c7d648c0bdbee89d4|4724",
  "packages/dwg-codec/src/api/read.ts|9dace30926c1e467d32b1cbd4e306d69480a3955e9f45eadb0a5727bbdd5fc2f|1276",
  "packages/dwg-codec/src/api/write.ts|480246c10dc27c6da241e1b5922fac098ada24d8299fbc9e5df0bbb17333ce01|4969",
  "packages/dwg-codec/src/binary/byte-cursor.ts|54e13981ee3e053e516568b714f8b0adc0e047a0858628a12af0c64046b472b4|5911",
  "packages/dwg-codec/src/binary/byte-sink.ts|4d64061a798d84336ce5ee929064e1451b60913dbdc8e9bcada634a46d9e2dcc|5095",
  "packages/dwg-codec/src/binary/range-table.ts|e568eed63153904be89a17b6ce96853ff8b90a6fca4dafe4bcbc5c03aa887890|7004",
  "packages/dwg-codec/src/extensions/registry.ts|85ba2683617b56d7b10a0cec36c13ddcadae9d411e8ef0eada9b5bf0a465c902|8720",
  "packages/dwg-codec/src/index.ts|853817903a352e20bbedd36283126ac6828d2f63157b5c2144d3ac0c6e51af6d|2221",
  "packages/dwg-codec/src/model/database.ts|d9d7c704ba28c5f046c1d5d17a36a270cbc6e0fbb200410600ea737eec2e1cde|20049",
  "packages/dwg-codec/src/model/document.ts|4fba01d4e637157b405af1fc8b20d0462a84742244a285121bd579705f0ebe7e|1967",
  "packages/dwg-codec/src/model/handle.ts|9a31b00f0951942e0fd83a5dee3a12a9627408ec82f568f2dcb21554200fa227|2541",
  "packages/dwg-codec/src/model/opaque-object.ts|10357d67b53261d14c595ba8a865429a8eaee11391a6a4a7f5bc4bd6d1076251|6012",
  "packages/dwg-codec/src/model/reference.ts|d60a2ae9b36517cea1a1c46d3ce09ac1a91eb5234ec235bb385b2572d84bbc85|1719",
  "packages/dwg-codec/src/model/symbol-table.ts|6e10192efebb905795bfa8ad7297421778ca1e54be0a314c2e9be16cacb06253|7949",
  "packages/dwg-codec/src/security/input-snapshot.ts|0952623283ddce809739a978ffe4b52d9a1230178d0afa73a190fe11ce7960a3|1265",
  "packages/dwg-codec/src/security/owned-bytes.ts|6259f034082c01dcc9435acda1ad223457174efc65139e400cd1d6603bdffe0f|6697",
  "packages/dwg-codec/src/security/parse-error.ts|13dbd7a670c0b6c1bd292392f5975dd25de85187be344b02a083fd7aca21941c|2066",
  "packages/dwg-codec/src/security/resource-budget.ts|e501fd300a9200688d692b773e337f5a069921af9a70ac112dacfd078b3ca068|6564",
  "packages/dwg-codec/src/security/worker-supervisor.ts|56e5eac8aa2099fea467a55dc7409898d7801125f2e99e0a2e9f2a621c7c26a1|16394",
  "packages/dwg-codec/src/worker/protocol.ts|6b95f986060423a60dd0001f857e1dac0b1085cc8423bb314fe714bde93f4dd4|18674",
  "packages/dwg-codec/tests/adversarial.spec.ts|01a6a80af44d37b0dfe57cf463b57a422ad76551accedc60c78e5c48fb89c354|297",
  "packages/dwg-codec/tests/adversarial/checker-hardening.spec.ts|44ddd1bb87617b4c1bcefd486948e51f1a925a3d78214a16de445411755c1ebc|16957",
  "packages/dwg-codec/tests/adversarial/provenance-hardening.spec.ts|243dccfa8402b4610ed90ac52f2bf05e7b4a0f90cee73f5a60661d3056a72a22|15371",
  "packages/dwg-codec/tests/adversarial/research-governance.spec.ts|e1ffa0dc6ec0824016c2703fbad7877476b9e625fb1862fcdb9d5a2e360e4b80|22746",
  "packages/dwg-codec/tests/adversarial/resource-limits.spec.ts|e092452f862c35bfdeafc1e3c6572e97c7e18d9b8d36c66678d9177e997dd29a|8988",
  "packages/dwg-codec/tests/adversarial/worker-timeout.spec.ts|a67114f6d2fb941b4e5d364c0a617943f4bb247867e57703cac3e26b1c3a9be2|21475",
  "packages/dwg-codec/tests/unit.spec.ts|3cfe158253b751be2275264c0aa69fddb74686eb84e27567d139383c40f4e762|162",
  "packages/dwg-codec/tests/unit/api.spec.ts|77b9cc2398d9ba81db2d2cafe7f19af934737a96f4bec76961909d644880f49b|10567",
  "packages/dwg-codec/tests/unit/binary.spec.ts|6a376df7c535cc74c639f243e235c17148599d6129459e9a2d4d56c31c5896d3|10385",
  "packages/dwg-codec/tests/unit/model.spec.ts|fcc0f803c59f31415cd1309f0cccfda2c702748fcf96562ccf987013067180b4|20477",
  "packages/dwg-codec/tests/unit/public-api.spec.ts|d95efec0f40133554434cd6f783a6f9d707d5a2ceede7556c057dc14edeb301f|5777",
  "packages/dwg-codec/tests/unit/security.spec.ts|2b2e98311ff9957b366b73b8112fead682a66504f206e8801ce3b15d64375b66|17294",
] as const;

function parse(row: string): readonly [string, Readonly<ContentAdmission>] {
  const fields = row.split("|");
  const path = fields[0];
  const sha256 = fields[1];
  const encodedByteLength = fields[2];
  const byteLength = Number(encodedByteLength);
  if (
    fields.length !== 3 ||
    path === undefined ||
    sha256 === undefined ||
    encodedByteLength === undefined ||
    !Number.isSafeInteger(byteLength) ||
    String(byteLength) !== encodedByteLength
  ) {
    throw new Error("DWG-1 safe-core admission constant is malformed");
  }
  return [caseFold(path), Object.freeze({ path, sha256, byteLength })] as const;
}

export const DWG1_CONTENT_BOUND_ADMISSION_COUNT = 65;
export const DWG1_CONTENT_BOUND_ADMISSION: ReadonlyMap<
  string,
  Readonly<ContentAdmission>
> = new Map(ROWS.map(parse));

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import CasperSdk from "casper-js-sdk";

const { KeyAlgorithm, PrivateKey } = CasperSdk;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function main() {
  const outputDir = process.argv[2]
    ? resolve(process.argv[2])
    : join(repoRoot, "contracts", "ghostshift-ledger", "keys");
  await mkdir(outputDir, { recursive: true });

  const privateKey = PrivateKey.generate(KeyAlgorithm.ED25519);
  const secretKeyPath = join(outputDir, "secret_key.pem");
  const publicKeyPath = join(outputDir, "public_key.pem");

  await writeFile(secretKeyPath, privateKey.toPem());
  await writeFile(publicKeyPath, privateKey.publicKey.toPem());

  console.log(
    JSON.stringify(
      {
        secretKeyPath,
        publicKeyPath,
        publicKeyHex: privateKey.publicKey.toHex()
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("GhostShift key generation failed:", error);
  process.exit(1);
});

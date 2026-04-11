import { Encrypter } from "age-encryption";

const PRIVATE_DIR = "notes/private";

async function promptPassphrase(): Promise<string> {
  process.stdout.write("Passphrase: ");
  process.stdin.setRawMode(true);
  const passphrase = await new Promise<string>((resolve) => {
    let input = "";
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (ch: string) => {
      if (ch === "\r" || ch === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeAllListeners("data");
        process.stdout.write("\n");
        resolve(input);
      } else if (ch === "\u007F" || ch === "\b") {
        input = input.slice(0, -1);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else {
        input += ch;
      }
    });
  });
  if (!passphrase) {
    console.error("No passphrase provided");
    process.exit(1);
  }
  return passphrase;
}

const glob = new Bun.Glob("*.edn");
const files = Array.from(glob.scanSync({ cwd: PRIVATE_DIR }));

if (files.length === 0) {
  console.log("No .edn files found in notes/private/");
  process.exit(0);
}

console.log(`Found ${files.length} decrypted note(s)`);
const passphrase = await promptPassphrase();

let encrypted = 0;
for (const filename of files) {
  const ednPath = `${PRIVATE_DIR}/${filename}`;
  const agePath = `${ednPath}.age`;
  try {
    const plaintext = await Bun.file(ednPath).text();
    const e = new Encrypter();
    e.setPassphrase(passphrase);
    const ciphertext = await e.encrypt(plaintext);
    await Bun.write(agePath, ciphertext);
    console.log(`  ${filename} → ${filename}.age`);
    encrypted++;
  } catch (err) {
    console.error(`  Failed: ${filename}: ${err}`);
  }
}

console.log(`Encrypted ${encrypted}/${files.length} note(s)`);

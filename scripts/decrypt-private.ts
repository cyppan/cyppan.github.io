import { Decrypter } from "age-encryption";

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

const glob = new Bun.Glob("*.edn.age");
const files = Array.from(glob.scanSync({ cwd: PRIVATE_DIR }));

if (files.length === 0) {
  console.log("No .edn.age files found in notes/private/");
  process.exit(0);
}

console.log(`Found ${files.length} encrypted note(s)`);
const passphrase = await promptPassphrase();

let decrypted = 0;
for (const filename of files) {
  const agePath = `${PRIVATE_DIR}/${filename}`;
  const ednPath = agePath.replace(/\.age$/, "");
  try {
    const ciphertext = await Bun.file(agePath).bytes();
    const d = new Decrypter();
    d.addPassphrase(passphrase);
    const plaintext = await d.decrypt(ciphertext, "text");
    await Bun.write(ednPath, plaintext);
    console.log(`  ${filename} → ${filename.replace(/\.age$/, "")}`);
    decrypted++;
  } catch (err) {
    console.error(`  Failed: ${filename}: ${err}`);
  }
}

console.log(`Decrypted ${decrypted}/${files.length} note(s)`);

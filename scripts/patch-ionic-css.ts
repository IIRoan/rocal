import * as fs from "fs";
import * as path from "path";

const ionicCssPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@ionic",
  "react",
  "css"
);

if (!fs.existsSync(ionicCssPath)) {
  console.log("Ionic CSS not found at", ionicCssPath);
  process.exit(0);
}

const files = fs.readdirSync(ionicCssPath).filter((f) => f.endsWith(".css"));

for (const file of files) {
  const filePath = path.join(ionicCssPath, file);
  let content = fs.readFileSync(filePath, "utf8");

  if (content.includes(":host-context")) {
    console.log(`Patching ${file}...`);
    // Replace `:host-context([dir=rtl])` with `html[dir=rtl]`
    // or just remove the :host-context part, but html[dir=rtl] is a good fallback.
    content = content.replace(/:host-context\(([^)]+)\)/g, "html$1");
    fs.writeFileSync(filePath, content, "utf8");
  }
}

console.log("Finished patching Ionic CSS for Turbopack!");

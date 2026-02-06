const fs = require("node:fs");
const path = require("node:path");

function copyDir(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const root = path.resolve(__dirname, "..");
const distCli = path.join(root, "dist", "cli");
const distSrcCli = path.join(root, "dist", "src", "cli");

copyDir(distSrcCli, distCli);

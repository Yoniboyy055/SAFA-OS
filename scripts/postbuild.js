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
const distRoot = path.join(root, "dist");
const distSrcRoot = path.join(root, "dist", "src");
const dashboardRoot = path.join(root, "dashboard");
const distDashboardRoot = path.join(distRoot, "dashboard");

copyDir(distSrcRoot, distRoot);
copyDir(dashboardRoot, distDashboardRoot);

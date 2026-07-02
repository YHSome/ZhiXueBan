// 手动打包智学伴 EXE —— 零网络依赖
const fs = require("fs");
const path = require("path");

const root = __dirname;
const electronDist = path.join(root, "node_modules/electron/dist");
const releaseDir = path.join(root, "release/智学伴");

// 1. 创建输出目录
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

// 2. 复制 Electron 运行时
console.log("复制 Electron 运行时...");
const electronFiles = fs.readdirSync(electronDist).filter(
  (f) => !f.endsWith(".dll") || fs.statSync(path.join(electronDist, f)).size > 1024 * 1024
);
for (const file of fs.readdirSync(electronDist)) {
  const src = path.join(electronDist, file);
  const dest = path.join(releaseDir, file);
  if (fs.lstatSync(src).isFile()) {
    fs.copyFileSync(src, dest);
  }
}

// 3. 复制 locales（语言包）
const localesSrc = path.join(electronDist, "locales");
const localesDest = path.join(releaseDir, "locales");
if (fs.existsSync(localesSrc)) {
  fs.mkdirSync(localesDest, { recursive: true });
  for (const file of fs.readdirSync(localesSrc)) {
    // 只保留中文
    if (file.startsWith("zh-CN") || file.startsWith("en")) {
      fs.copyFileSync(path.join(localesSrc, file), path.join(localesDest, file));
    }
  }
}

// 4. 创建 app 目录
const appDir = path.join(releaseDir, "resources/app");
fs.mkdirSync(appDir, { recursive: true });

// 5. 复制应用文件
console.log("复制应用文件...");
const include = [
  "main.js", "package.json", ".next", "node_modules",
  "public", "src"
];
for (const item of include) {
  const src = path.join(root, item);
  const dest = path.join(appDir, item);
  if (!fs.existsSync(src)) continue;
  if (fs.lstatSync(src).isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyDir(src, dest) {
  // 排除不需要的
  const skip = ["release", ".git", "electron-builder", "node_modules/electron/dist/locales"];
  if (skip.some((s) => src.includes(s))) return;

  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    if (item === "node_modules" && src.includes("node_modules")) {
      // 跳过嵌套 node_modules
      continue;
    }
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.lstatSync(s).isDirectory()) {
      if (item !== "node_modules" && item !== ".next") {
        copyDir(s, d);
      } else {
        // node_modules 和 .next 只复制不递归（已在主循环中复制）
        copyDirShallow(s, d);
      }
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function copyDirShallow(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.lstatSync(s).isDirectory()) {
      copyDirShallow(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// 6. 修复 pdfjs-dist worker 路径（Next.js bundle 会从 node_modules 和 .next/server/chunks 两处找）
const workerSrc = path.join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
if (fs.existsSync(workerSrc)) {
  // 路径1：Next.js chunk 动态 import 的路径
  const workerDest1 = path.join(appDir, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  fs.mkdirSync(path.dirname(workerDest1), { recursive: true });
  fs.copyFileSync(workerSrc, workerDest1);
  // 路径2：.next 编译产物可能引用的路径
  const workerDest2 = path.join(appDir, ".next/server/chunks/pdf.worker.mjs");
  fs.mkdirSync(path.dirname(workerDest2), { recursive: true });
  fs.copyFileSync(workerSrc, workerDest2);
  console.log("已复制 pdf.worker.mjs");
}

// 7. 重命名 electron.exe → 智学伴.exe
fs.renameSync(
  path.join(releaseDir, "electron.exe"),
  path.join(releaseDir, "智学伴.exe")
);

console.log("✅ 打包完成！");
console.log(`   输出目录：${releaseDir}`);
console.log("   双击 智学伴.exe 启动");

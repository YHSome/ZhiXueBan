// 全面能力检测（Python、numpy、matplotlib、解析库）
export async function GET() {
  const caps = { python: false, numpy: false, matplotlib: false, parse: false };
  try {
    const { execSync } = require("child_process");

    // 检测 Python
    let pythonCmd = null;
    try {
      require("child_process").execSync("python3 --version", { stdio: "ignore" });
      pythonCmd = "python3";
    } catch {
      try {
        require("child_process").execSync("python --version", { stdio: "ignore" });
        pythonCmd = "python";
      } catch {}
    }

    if (pythonCmd) {
      caps.python = true;

      // 检测 numpy
      try {
        execSync(`${pythonCmd} -c "import numpy"`, { stdio: "ignore", timeout: 5000, shell: true });
        caps.numpy = true;
      } catch {}

      // 检测 matplotlib
      try {
        execSync(`${pythonCmd} -c "import matplotlib"`, { stdio: "ignore", timeout: 5000, shell: true });
        caps.matplotlib = true;
      } catch {}

      // 检测解析库
      try {
        execSync(`${pythonCmd} -c "import fitz; import docx"`, { stdio: "ignore", timeout: 5000, shell: true });
        caps.parse = true;
      } catch {}
    }

    return Response.json(caps, { status: 200 });
  } catch {
    return Response.json(caps, { status: 200 });
  }
}

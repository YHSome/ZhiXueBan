// 检测 Python + numpy + matplotlib 是否可用（轻量 ping，不生成图片）
export async function GET() {
  try {
    const { execSync } = require("child_process");

    let pythonCmd = null;
    try { execSync("python3 --version", { stdio: "ignore", shell: true, timeout: 5000 }); pythonCmd = "python3"; } catch {}
    if (!pythonCmd) {
      try { execSync("python --version", { stdio: "ignore", shell: true, timeout: 5000 }); pythonCmd = "python"; } catch {}
    }
    if (!pythonCmd) {
      try { execSync("/usr/bin/python3 --version", { stdio: "ignore", shell: true, timeout: 5000 }); pythonCmd = "/usr/bin/python3"; } catch {}
    }
    if (!pythonCmd) {
      return Response.json({ ok: false, reason: "no-python" }, { status: 200 });
    }

    // 检查 numpy 和 matplotlib
    const checkScript = "import numpy, matplotlib; print('ok')";
    const result = execSync(`${pythonCmd} -c "${checkScript}"`, {
      encoding: "utf8", timeout: 10000, shell: true,
    });
    if (result.trim() === "ok") {
      return Response.json({ ok: true, python: pythonCmd });
    }
    return Response.json({ ok: false, reason: "no-libs" }, { status: 200 });
  } catch {
    return Response.json({ ok: false, reason: "error" }, { status: 200 });
  }
}

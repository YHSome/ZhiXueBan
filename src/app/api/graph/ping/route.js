// 检测 Python + numpy + matplotlib 是否可用（轻量 ping，不生成图片）
export async function GET() {
  try {
    const { execSync } = require("child_process");

    let pythonCmd = null;
    try { pythonCmd = execSync("where python 2>nul || which python3 2>/dev/null || which python 2>/dev/null", { encoding: "utf8", shell: true, timeout: 5000 }).split("\n")[0]?.trim(); } catch {}
    if (!pythonCmd) {
      try { execSync("python3 --version", { stdio: "ignore", shell: true, timeout: 5000 }); pythonCmd = "python3"; } catch {
        try { execSync("python --version", { stdio: "ignore", shell: true, timeout: 5000 }); pythonCmd = "python"; } catch {}
      }
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

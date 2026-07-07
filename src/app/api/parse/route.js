// 文件解析 API —— 统一走 Python（parse.py）
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return Response.json({ error: "没有接收到文件" }, { status: 400 });
    }

    const fileName = file.name || "";
    const ext = fileName.split(".").pop().toLowerCase();

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

    if (!pythonCmd) {
      return Response.json(
        { error: "未检测到 Python 环境，请安装 Python 3 并确保 python 命令可用" },
        { status: 500 }
      );
    }

    // 写临时文件
    const os = require("os");
    const path = require("path");
    const fs = require("fs");
    const { execSync } = require("child_process");
    const tmpPath = path.join(os.tmpdir(), `zhixueban_${Date.now()}.${ext}`);
    fs.writeFileSync(tmpPath, Buffer.from(await file.arrayBuffer()));

    try {
      const script = path.resolve(process.cwd(), "parse.py");
      const result = execSync(`${pythonCmd} "${script}" "${tmpPath}"`, {
        env: { ...process.env, PATH: process.env.PATH + ";C:\\Program Files\\Git\\mingw64\\bin" },
        encoding: "utf-8",
        timeout: 30000,
      });

      const data = JSON.parse(result);
      if (data.error) {
        return Response.json({ error: data.error }, { status: 422 });
      }
      return Response.json({ text: data.text, fileName });
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  } catch (e) {
    return Response.json({ error: `解析失败：${e.message}` }, { status: 500 });
  }
}

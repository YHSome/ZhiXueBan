# Vercel Python Runtime — 数学图形生成 API
import json, os, subprocess, tempfile, sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", 0))
            body = json.loads(self.rfile.read(length))
            expression = body.get("expression", "").strip()
            if not expression:
                self._error(400, "缺少 expression")
                return

            # 与 JS 端相同的预处理
            lines = [l.strip() for l in expression.replace("\\n", "\n").split("\n") if l.strip()]
            processed = []
            for line in lines:
                # 去除参数标签
                import re
                line = re.sub(r'\|(xmin|xmax|ymin|ymax|zmin|zmax)=', '|', line, flags=re.IGNORECASE)
                # 定义域简写
                line = re.sub(r'\|\s*(-?\d+(?:\.\d+)?)\s*<=\s*x\s*<=\s*(-?\d+(?:\.\d+)?)\s*\|',
                             r'|\1|\2|\1|\2|', line)
                parts = line.split("|")
                expr = parts[0].strip()

                # 统一前缀空格
                expr = re.sub(r'^(eq|multi|par|3d|pw|y)\s*:\s*', r'\1:', expr)

                # 变量统一
                expr = re.sub(r'\btheta\b', 'x', expr, flags=re.IGNORECASE)
                expr = expr.replace('θ', 'x')
                expr = re.sub(r'\bt\b', 'x', expr)

                # ^ → **
                expr = expr.replace('^', '**')
                # )数字 → )**数字
                expr = re.sub(r'\)(\d+(?:\.\d+)?)', r')**\1', expr)
                # 变量后数字 → 变量**数字
                expr = re.sub(r'\b([a-zA-Z])(\d+(?:\.\d+)?)\b', r'\1**\2', expr)
                # 数字+变量 → 数字*变量
                expr = re.sub(r'(\d+(?:\.\d+)?)([a-zA-Z])', lambda m: m.group(0) if m.group(2) in 'eE' else f'{m.group(1)}*{m.group(2)}', expr)
                # )( → )*(
                expr = expr.replace(')(', ')*(')
                # )字母 → )*字母
                expr = re.sub(r'\)([a-zA-Z])', r')*\1', expr)
                # 数字( → 数字*(
                expr = re.sub(r'(\d)\(', r'\1*(', expr)

                # multi: 逗号→分号
                if expr.startswith('multi:') and ';' not in expr and ',' in expr:
                    expr = expr[:6] + expr[6:].replace(',', ';')

                # 标题美化
                parts[0] = expr
                if len(parts) > 1:
                    title_idx = len(parts) - 1
                    if parts[title_idx]:
                        parts[title_idx] = parts[title_idx].replace('**', '^')
                        parts[title_idx] = re.sub(r'(\d)\*([a-zA-Z])', r'\1\2', parts[title_idx])

                processed.append("|".join(parts))

            # 写入 input.txt
            work_dir = Path(tempfile.mkdtemp(prefix="zhixueban_"))
            input_file = work_dir / "input.txt"
            output_dir = work_dir / "output"
            output_dir.mkdir()

            input_file.write_text("\n".join(processed), encoding="utf-8")

            # 调用 formula_to_image.py（路径相对于项目根目录）
            script = Path(__file__).resolve().parent.parent / "formula_to_image.py"
            result = subprocess.run(
                [sys.executable, str(script), str(input_file), str(output_dir)],
                capture_output=True, text=True, timeout=30, cwd=str(work_dir)
            )

            # 读取生成的图片
            pngs = list(output_dir.glob("*.png"))
            if not pngs:
                self._error(500, f"未生成图片 — {result.stderr[:300]}")
                return

            img = pngs[0].read_bytes()

            # 清理
            import shutil
            shutil.rmtree(work_dir, ignore_errors=True)

            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=3600")
            self.end_headers()
            self.wfile.write(img)

        except Exception as e:
            self._error(500, f"渲染失败：{str(e)[:200]}")

    def _error(self, code, msg):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": msg}).encode("utf-8"))

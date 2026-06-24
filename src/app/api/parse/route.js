// 文件解析 API —— 将 PDF/DOCX/PPTX/TXT/MD 提取为纯文本
import { createRequire } from "module";
const require = createRequire(import.meta.url);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return Response.json({ error: "没有接收到文件" }, { status: 400 });
    }

    const fileName = file.name || "";
    const ext = fileName.split(".").pop().toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // 优先判断是否 ZIP 压缩包（magic bytes: PK）
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;

    let text = "";

    if (isZip) {
      // ZIP 压缩包：先解压，再逐个解析内部文件
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(buffer);
        const parts = [];

        // 检查是否是 PPTX（有 ppt/ 目录结构）
        const isPPTX = Object.keys(zip.files).some((f) => f.startsWith("ppt/slides/"));

        if (isPPTX) {
          // PPTX：提取幻灯片文本
          const slideFiles = Object.keys(zip.files).filter(
            (f) => f.startsWith("ppt/slides/slide") && f.endsWith(".xml")
          );
          for (const slideFile of slideFiles.sort()) {
            const xml = await zip.files[slideFile].async("text");
            const texts = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
            const slideText = texts.map((t) => t.replace(/<a:t[^>]*>/, "").replace(/<\/a:t>/, "")).join(" ");
            if (slideText.trim()) parts.push(slideText.trim());
          }
        } else {
          // 普通 ZIP：遍历所有文件，逐个解析
          for (const [name, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const innerExt = name.split(".").pop().toLowerCase();
            const innerBuf = Buffer.from(await entry.async("nodebuffer"));
            try {
              const innerText = await parseBuffer(innerBuf, innerExt);
              if (innerText.trim()) {
                parts.push(`--- ${name} ---\n${innerText.trim()}`);
              }
            } catch {
              // 跳过无法解析的文件
            }
          }
        }
        text = parts.join("\n\n");
      } catch (e) {
        return Response.json({ error: `ZIP 解压失败：${e.message}` }, { status: 422 });
      }
    } else {
      // 单文件：直接解析
      try {
        text = await parseBuffer(buffer, ext);
      } catch (e) {
        return Response.json({ error: `${ext.toUpperCase()} 解析失败：${e.message}` }, { status: 422 });
      }
    }

    if (!text || text.trim().length < 10) {
      const hint = ext === "pdf" || ext === "docx"
        ? "。此文件可能是扫描件或图片型文档，不含可提取的文字"
        : "";
      return Response.json(
        { error: `文件内容太少，无法提取有效文本${hint}` },
        { status: 422 }
      );
    }

    return Response.json({ text: text.trim(), fileName });
  } catch (e) {
    return Response.json({ error: `解析异常：${e.message}` }, { status: 500 });
  }
}

// 根据 buffer 和扩展名解析单个文件的文本
async function parseBuffer(buffer, ext) {
  if (ext === "txt" || ext === "md") {
    return buffer.toString("utf-8");
  }

  if (ext === "pdf") {
    const fs = require("fs");
    const path = require("path");
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");

    // 指向 node_modules 里实际的 worker 文件，Windows 需 file:// URL
    const workerPath = path.resolve(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;

    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;

    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      pages.push(pageText);
    }
    await doc.destroy();
    return pages.join("\n\n");
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const extractRawText = mammoth.default?.extractRawText || mammoth.extractRawText;
    if (!extractRawText) throw new Error("mammoth 加载失败");
    const result = await extractRawText({ buffer });
    return result.value;
  }

  // 不支持的格式
  const supported = ["txt", "md", "pdf", "docx", "pptx", "zip"];
  if (!supported.includes(ext)) {
    throw new Error(
      ext === "ppt"
        ? "不支持旧版 .ppt 格式，请用 PowerPoint 另存为 .pptx 后重新上传"
        : ext === "doc"
          ? "不支持旧版 .doc 格式，请用 Word 另存为 .docx 后重新上传"
          : `暂不支持 .${ext} 格式，支持的格式：${supported.join("、")}`
    );
  }
  return buffer.toString("utf-8");
}

// 纯 Node.js PDF 文本提取（零依赖，只用 zlib）
function extractPdfText(buffer, zlib) {
  const str = buffer.toString("latin1");
  const pages = [];

  const streamRegex = /(\d+ \d+ obj[\s\S]*?endobj)/g;
  let objMatch;
  while ((objMatch = streamRegex.exec(str)) !== null) {
    const obj = objMatch[1];
    if (!obj.includes("stream")) continue;

    const streamMatch = obj.match(/stream\r?\n([\s\S]*?)endstream/);
    if (!streamMatch) continue;
    let content = streamMatch[1];

    if (obj.includes("FlateDecode")) {
      try {
        content = zlib.inflateRawSync(Buffer.from(content, "latin1")).toString("latin1");
      } catch {
        try {
          content = zlib.inflateSync(Buffer.from(content, "latin1")).toString("latin1");
        } catch {
          continue;
        }
      }
    }

    const btRegex = /BT([\s\S]*?)ET/g;
    let btMatch;
    let pageText = "";
    while ((btMatch = btRegex.exec(content)) !== null) {
      const block = btMatch[1];

      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        pageText += tjMatch[1] + " ";
      }

      const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
      let taMatch;
      while ((taMatch = tjArrayRegex.exec(block)) !== null) {
        const inner = taMatch[1];
        const innerTexts = inner.match(/\(([^)]*)\)/g) || [];
        pageText += innerTexts.map((t) => t.slice(1, -1)).join("") + " ";
      }
    }

    if (pageText.trim()) pages.push(pageText.trim());
  }

  const result = pages.join("\n\n");
  return result || "[此 PDF 无可提取的文字内容，可能是扫描件或图片型 PDF]";
}

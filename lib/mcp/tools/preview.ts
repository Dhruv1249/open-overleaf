import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execFileAsync, resolveSafePath } from "../git.ts";
import { getPDFPageCount } from "./compile.ts";
import type { ToolDefinition } from "../types.ts";

const INTERNAL_APP_URL = process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || "8080"}`;

function getEffectiveMCPToken(): string {
  if (process.env.OVERLEAF_MCP_TOKEN) {
    return process.env.OVERLEAF_MCP_TOKEN;
  }
  const secretString = process.env.OVERLEAF_MCP_SECRET || process.env.SESSION_SECRET || "open_overleaf_mcp_secret";
  let ghTokenHash = process.env.GITHUB_TOKEN_HASH || "";
  if (!ghTokenHash) {
    const rawSecret = process.env.GITHUB_CLIENT_SECRET || "default_gh_token";
    ghTokenHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
  }
  const repoName = process.env.GITHUB_SINGLE_REPO_NAME || "overleaf-projects";
  const rawCombined = `${secretString}:${ghTokenHash}:${repoName}`;
  return crypto.createHash("sha256").update(rawCombined).digest("hex");
}

function buildInternalHeaders(): Record<string, string> {
  let activeToken = "";
  try {
    activeToken = getEffectiveMCPToken();
  } catch {
    activeToken = process.env.SESSION_SECRET || "";
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${activeToken}`,
    "x-internal-mcp": "true",
    "x-internal-token": activeToken,
  };
}

export const previewToolDefinitions: ToolDefinition[] = [
  {
    name: "get_project_pdf",
    description: "Compiles and retrieves the PDF document for a project as binary/base64 data.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        pdfName: { type: "string", description: "Target PDF filename (e.g. main.pdf)" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "export_project_pdf",
    description: "Directly exports and copies the compiled PDF from the project build directory to a destination path on the local filesystem. Bypasses transmitting heavy multi-megabyte base64 data over JSON-RPC.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        destinationPath: { type: "string", description: "Absolute or relative local destination path where the .pdf file should be saved" },
        pdfName: { type: "string", description: "Target PDF file name (default: main.pdf)" },
      },
      required: ["projectName", "destinationPath"],
    },
  },
  {
    name: "get_project_preview_image",
    description: "Renders a high-resolution preview image of a specific page of the project PDF. Directly saves the image to disk and returns the local file path for immediate visual inspection, with optional region cropping.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        pageNumber: { type: "number", description: "Page number to render (default: 1)" },
        dpi: { type: "number", description: "Resolution DPI for rasterization (default: 150)" },
        pdfName: { type: "string", description: "PDF filename (default: main.pdf)" },
        saveToFile: { type: "boolean", description: "Save the image to disk and return file path (default: true)" },
        outputPath: { type: "string", description: "Optional specific destination file path for the .png image" },
        returnBase64: { type: "boolean", description: "Whether to also include the base64 string in the return payload (default: false to conserve tokens)" },
        crop: {
          type: "object",
          description: "Optional bounding box crop ratios (0.0 to 1.0 relative coordinates)",
          properties: {
            top: { type: "number", description: "Top crop start ratio (0.0 = top of page)" },
            bottom: { type: "number", description: "Bottom crop end ratio (1.0 = bottom of page)" },
            left: { type: "number", description: "Left crop start ratio (0.0 = left of page)" },
            right: { type: "number", description: "Right crop end ratio (1.0 = right of page)" },
          },
        },
      },
      required: ["projectName"],
    },
  },
  {
    name: "sync_to_drive",
    description: "Compiles the project PDF and syncs it directly to connected Google Drive storage.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        mainFile: { type: "string", description: "Entry .tex file (default: main.tex)" },
      },
      required: ["projectName"],
    },
  },
];

export async function handlePreviewTool(name: string, args: Record<string, any>): Promise<any> {
  if (name === "get_project_pdf") {
    const projectName = String(args?.projectName);
    const pdfFilename = String(args?.pdfName || "main.pdf");
    const texName = pdfFilename.replace(/\.pdf$/i, ".tex");
    let compileResult: any = null;

    let pdfResponse = await fetch(
      `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/pdf?mainFile=${encodeURIComponent(texName)}`,
      { headers: buildInternalHeaders() }
    );

    if (!pdfResponse.ok) {
      compileResult = await fetch(
        `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/compile`,
        {
          method: "POST",
          headers: buildInternalHeaders(),
          body: JSON.stringify({ mainFile: texName }),
        }
      ).then((r) => r.json().catch(() => ({})));

      pdfResponse = await fetch(
        `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/pdf?mainFile=${encodeURIComponent(texName)}`,
        { headers: buildInternalHeaders() }
      );
    }

    if (!pdfResponse.ok) {
      throw new Error(`PDF compilation failed for project ${projectName}: ${compileResult?.log || "PDF not found"}`);
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    const base64DataString = pdfBuffer.toString("base64");
    const tempPdfPath = path.join("/tmp/oo-compile", projectName, `temp-${Date.now()}-${path.basename(pdfFilename)}`);
    fs.mkdirSync(path.dirname(tempPdfPath), { recursive: true });
    fs.writeFileSync(tempPdfPath, pdfBuffer);
    const totalPages = await getPDFPageCount(tempPdfPath);
    try { fs.unlinkSync(tempPdfPath); } catch {}

    return {
      fileName: pdfFilename,
      mimeType: "application/pdf",
      pageCount: totalPages,
      base64Data: base64DataString,
      sizeBytes: pdfBuffer.length,
      compilationStatus: compileResult ? (compileResult.ok ? "compiled" : "failed") : "cached",
      errorCount: compileResult?.errors ?? 0,
      warningCount: compileResult?.warnings ?? 0,
      log: compileResult?.log ?? "",
    };
  }

  if (name === "export_project_pdf") {
    const projectName = String(args?.projectName);
    const destinationPath = String(args?.destinationPath || args?.destinationLocalPath || "");
    if (!destinationPath) {
      throw new Error("destinationPath or destinationLocalPath must be provided");
    }
    const pdfFilename = String(args?.pdfName || "main.pdf");
    const texName = pdfFilename.replace(/\.pdf$/i, ".tex");

    let sourcePdfPath = path.join("/tmp/oo-compile", projectName, pdfFilename);
    if (!fs.existsSync(sourcePdfPath)) {
      try {
        await fetch(
          `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/compile`,
          {
            method: "POST",
            headers: buildInternalHeaders(),
            body: JSON.stringify({ mainFile: texName }),
          }
        );
      } catch {}
    }

    if (!fs.existsSync(sourcePdfPath)) {
      const candidatePaths = [
        resolveSafePath(projectName, pdfFilename),
        path.join(process.cwd(), "projects", projectName, pdfFilename),
        path.join("/app/projects", projectName, pdfFilename),
      ];
      for (const cand of candidatePaths) {
        if (fs.existsSync(cand)) {
          sourcePdfPath = cand;
          break;
        }
      }
    }

    if (!fs.existsSync(sourcePdfPath)) {
      throw new Error(`PDF ${pdfFilename} not found for project ${projectName}. Compilation may have failed.`);
    }

    const resolvedDestination = path.resolve(destinationPath);
    fs.mkdirSync(path.dirname(resolvedDestination), { recursive: true });
    fs.copyFileSync(sourcePdfPath, resolvedDestination);

    const stats = fs.statSync(resolvedDestination);
    const totalPages = await getPDFPageCount(resolvedDestination);

    return {
      success: true,
      message: `Successfully exported PDF to ${resolvedDestination}`,
      exportedPath: resolvedDestination,
      destinationPath: resolvedDestination,
      sizeBytes: stats.size,
      pageCount: totalPages,
    };
  }

  if (name === "get_project_preview_image") {
    const projectName = String(args?.projectName);
    const pdfFilename = String(args?.pdfName || "main.pdf");
    const targetPageNumber = parseInt(String(args?.pageNumber || "1"), 10);
    const resolutionDPI = parseInt(String(args?.dpi || "150"), 10);
    const saveToFile = args?.saveToFile !== false;
    const returnBase64 = Boolean(args?.returnBase64);
    const customOutputPath = args?.outputPath ? String(args.outputPath) : null;
    const crop = args?.crop;
    const texName = pdfFilename.replace(/\.pdf$/i, ".tex");
    let compileResult: any = null;

    const pdfFullPath = path.join("/tmp/oo-compile", projectName, pdfFilename);
    if (!fs.existsSync(pdfFullPath)) {
      compileResult = await fetch(
        `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/compile`,
        {
          method: "POST",
          headers: buildInternalHeaders(),
          body: JSON.stringify({ mainFile: texName }),
        }
      ).then((r) => r.json().catch(() => ({})));
    }

    if (!fs.existsSync(pdfFullPath)) {
      throw new Error(`Failed to compile or find PDF ${pdfFilename} in project ${projectName}: ${compileResult?.log || ""}`);
    }

    const previewDir = path.join("/tmp/oo-preview", projectName);
    fs.mkdirSync(previewDir, { recursive: true });
    const temporaryOutputPrefix = path.join(previewDir, `preview_p${targetPageNumber}`);

    await execFileAsync("pdftoppm", [
      "-png", "-r", String(resolutionDPI),
      "-f", String(targetPageNumber),
      "-l", String(targetPageNumber),
      pdfFullPath, temporaryOutputPrefix,
    ]);

    const expectedPngPath = `${temporaryOutputPrefix}-${targetPageNumber}.png`;
    const fallbackPngPath = `${temporaryOutputPrefix}-01.png`;
    let currentPngPath = fs.existsSync(expectedPngPath) ? expectedPngPath : fallbackPngPath;

    if (!fs.existsSync(currentPngPath)) {
      throw new Error(`Failed generating PNG preview image for page ${targetPageNumber}`);
    }

    // Apply crop if requested using ImageMagick
    if (crop && typeof crop === "object") {
      try {
        const { stdout: dimsOut } = await execFileAsync("identify", ["-format", "%w %h", currentPngPath]);
        const [fullW, fullH] = dimsOut.trim().split(" ").map((v) => parseInt(v, 10));

        const topRatio = Math.max(0, Math.min(Number(crop.top ?? 0), 1));
        const bottomRatio = Math.max(topRatio, Math.min(Number(crop.bottom ?? 1), 1));
        const leftRatio = Math.max(0, Math.min(Number(crop.left ?? 0), 1));
        const rightRatio = Math.max(leftRatio, Math.min(Number(crop.right ?? 1), 1));

        const cropX = Math.floor(leftRatio * fullW);
        const cropY = Math.floor(topRatio * fullH);
        const cropW = Math.max(1, Math.floor((rightRatio - leftRatio) * fullW));
        const cropH = Math.max(1, Math.floor((bottomRatio - topRatio) * fullH));

        const croppedPath = path.join(previewDir, `cropped_p${targetPageNumber}_${Date.now()}.png`);
        await execFileAsync("convert", [
          currentPngPath,
          "-crop", `${cropW}x${cropH}+${cropX}+${cropY}`,
          "+repage",
          croppedPath,
        ]);

        if (fs.existsSync(croppedPath)) {
          try { fs.unlinkSync(currentPngPath); } catch {}
          currentPngPath = croppedPath;
        }
      } catch (cropErr: any) {
        console.warn(`[preview] ImageMagick crop failed, using uncropped image:`, cropErr.message);
      }
    }

    // Determine final output path
    let finalDestination = currentPngPath;
    if (customOutputPath) {
      finalDestination = path.resolve(customOutputPath);
      fs.mkdirSync(path.dirname(finalDestination), { recursive: true });
      fs.copyFileSync(currentPngPath, finalDestination);
      try { fs.unlinkSync(currentPngPath); } catch {}
    }

    const imageStats = fs.statSync(finalDestination);
    let base64String: string | undefined;
    if (returnBase64 || !saveToFile) {
      base64String = fs.readFileSync(finalDestination).toString("base64");
    }

    if (!saveToFile && !customOutputPath) {
      try { fs.unlinkSync(finalDestination); } catch {}
    }

    return {
      fileName: `${path.basename(pdfFilename, ".pdf")}_p${targetPageNumber}.png`,
      mimeType: "image/png",
      pageNumber: targetPageNumber,
      previewPath: saveToFile ? finalDestination : undefined,
      sizeBytes: imageStats.size,
      ...(base64String ? { base64Data: base64String } : {}),
      compilationStatus: compileResult ? (compileResult.ok ? "compiled" : "failed") : "cached",
      message: `Page ${targetPageNumber} rendered${crop ? " (cropped)" : ""} successfully: ${finalDestination}`,
    };
  }

  if (name === "sync_to_drive") {
    const projectName = String(args?.projectName);
    const mainFile = String(args?.mainFile || "main.tex");
    const response = await fetch(`${INTERNAL_APP_URL}/api/drive/sync`, {
      method: "POST",
      headers: buildInternalHeaders(),
      body: JSON.stringify({ project: projectName, mainFile }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      throw new Error(`Drive sync failed: ${data?.error || response.status}`);
    }
    return {
      driveUrl: data.webViewLink,
      fileId: data.fileId,
      drivePath: data.drivePath,
    };
  }

  throw new Error(`Unknown preview tool: ${name}`);
}

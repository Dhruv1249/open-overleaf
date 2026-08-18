import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import crypto from "crypto";

export interface CopilotRequestPayload {
  prompt: string;
  fileContexts?: Record<string, string>;
  selectedText?: string;
  fullFileContent?: string;
  activeFilePath?: string;
  compileLog?: string;
  errorCount?: number;
  warningCount?: number;
  apiKey?: string;
  projectName?: string;
  history?: any[];
}

export interface CopilotResponsePayload {
  success: boolean;
  message: string;
  actionType?: "modify_file" | "delete_file" | "none";
  targetPath?: string;
  actionDescription?: string;
  replacementCode?: string;
  error?: string;
}

const pendingApprovals = new Map<string, "pending" | "approved" | "rejected" | { status: "approved" | "rejected"; details?: any }>();

const functionDeclarations = [
  {
    name: "list_projects",
    description: "Lists all LaTeX projects stored in open-overleaf.",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  },
  {
    name: "list_files",
    description: "Lists files and directories inside a target LaTeX project.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        subDir: { type: "STRING", description: "Optional sub-directory path relative to project root" }
      },
      required: ["projectName"]
    }
  },
  {
    name: "read_project_file",
    description: "Reads a .tex or text file from an open-overleaf project in GitHub.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        filePath: { type: "STRING", description: "Relative file path inside project" }
      },
      required: ["projectName", "filePath"]
    }
  },
  {
    name: "create_file",
    description: "Creates a new empty file in the LaTeX project.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        filePath: { type: "STRING", description: "Relative file path to create, e.g. helper_notes.tex" }
      },
      required: ["projectName", "filePath"]
    }
  },
  {
    name: "delete_file",
    description: "Deletes a specific file or folder inside a target project on GitHub. Requires user approval.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        filePath: { type: "STRING", description: "Relative file path inside project" }
      },
      required: ["projectName", "filePath"]
    }
  },
  {
    name: "compile_project",
    description: "Triggers LaTeX compilation for an open-overleaf project on the backend, fetching fresh files from GitHub.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        engine: { type: "STRING", description: "Compilation engine: xelatex, pdflatex, lualatex" },
        entryFile: { type: "STRING", description: "Target tex file to compile" }
      },
      required: ["projectName"]
    }
  },
  {
    name: "get_compilation_log",
    description: "Reads the compilation log file (main.log) from local backend directory.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the project" },
        logFile: { type: "STRING", description: "Name of log file, defaults to main.log" },
        startLine: { type: "INTEGER", description: "1-indexed starting line to slice" },
        endLine: { type: "INTEGER", description: "1-indexed ending line to slice" }
      },
      required: ["projectName"]
    }
  },
  {
    name: "search_in_project",
    description: "Performs full-text search across project files using a locally cached git clone.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the project" },
        query: { type: "STRING", description: "String to search for" },
        filePattern: { type: "STRING", description: "Glob pattern to filter files, e.g., *.tex" },
        caseSensitive: { type: "BOOLEAN", description: "Whether grep should be case-sensitive" }
      },
      required: ["projectName", "query"]
    }
  },
  {
    name: "validate_tex",
    description: "Runs chktex to lint a LaTeX file and retrieve syntax warning/error diagnostics.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the project" },
        filePath: { type: "STRING", description: "Relative file path inside project" }
      },
      required: ["projectName", "filePath"]
    }
  },
  {
    name: "rename_file",
    description: "Renames or moves a file inside the LaTeX project. Requires user approval.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the project" },
        fromPath: { type: "STRING", description: "Old relative file path" },
        toPath: { type: "STRING", description: "New relative file path" }
      },
      required: ["projectName", "fromPath", "toPath"]
    }
  },
  {
    name: "update_project_settings",
    description: "Updates project settings like compilation engine or main entry file. Requires user approval.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the project" },
        settings: {
          type: "OBJECT",
          properties: {
            engine: { type: "STRING", description: "xelatex, pdflatex, or lualatex" },
            mainFile: { type: "STRING", description: "Main entry file name" }
          }
        }
      },
      required: ["projectName", "settings"]
    }
  },
  {
    name: "read_file_lines",
    description: "Reads specific line ranges [startLine, endLine] from a file inside the project.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        filePath: { type: "STRING", description: "Relative file path inside project" },
        startLine: { type: "INTEGER", description: "1-indexed starting line to read" },
        endLine: { type: "INTEGER", description: "1-indexed ending line to read" }
      },
      required: ["projectName", "filePath", "startLine", "endLine"]
    }
  },
  {
    name: "get_file_history",
    description: "Gets commit history (list of SHAs and commit messages) for a specific file in a project from GitHub.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the project" },
        filePath: { type: "STRING", description: "Relative file path inside project" },
        perPage: { type: "INTEGER", description: "Maximum number of history items to fetch, defaults to 30" }
      },
      required: ["projectName", "filePath"]
    }
  },
  {
    name: "get_file_at_revision",
    description: "Retrieves the content of a file at a specific Git commit SHA from GitHub.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the project" },
        filePath: { type: "STRING", description: "Relative file path inside project" },
        sha: { type: "STRING", description: "Commit SHA hash" }
      },
      required: ["projectName", "filePath", "sha"]
    }
  },
  {
    name: "apply_patch",
    description: "Applies targeted chunk-based line replacements to a file. Use this for making surgical modifications instead of rewriting the entire file.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the project" },
        filePath: { type: "STRING", description: "Relative file path inside project" },
        patches: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              startLine: { type: "INTEGER", description: "1-indexed starting line number of the block to replace" },
              endLine: { type: "INTEGER", description: "1-indexed ending line number of the block to replace" },
              originalContent: { type: "STRING", description: "The exact content expected in the target file at those lines" },
              newContent: { type: "STRING", description: "The replacement content" }
            },
            required: ["startLine", "endLine", "originalContent", "newContent"]
          },
          description: "List of patch chunks to apply"
        }
      },
      required: ["projectName", "filePath", "patches"]
    }
  },
  {
    name: "get_project_preview_image",
    description: "Renders a specified PDF page to PNG preview image and returns image data for visual inspection of the compiled PDF layout and formatting.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        pdfName: { type: "STRING", description: "PDF filename, defaults to main.pdf" },
        pageNumber: { type: "INTEGER", description: "Page number to render, defaults to 1" },
        dpi: { type: "INTEGER", description: "Image resolution DPI, defaults to 150" }
      },
      required: ["projectName"]
    }
  },
  {
    name: "get_project_pdf",
    description: "Retrieves compiled PDF document metadata and base64 encoded binary data.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        pdfName: { type: "STRING", description: "PDF filename to retrieve, defaults to main.pdf" }
      },
      required: ["projectName"]
    }
  }
];

/**
 * Computes or retrieves the active MCP authentication token.
 */
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

/**
 * Invokes a tool on the local MCP server running on HTTP port 3202.
 */
async function callLocalMCPTool(toolName: string, toolArguments: Record<string, any>): Promise<any> {
  const mcpPort = parseInt(process.env.MCP_PORT || "3202", 10);
  const token = getEffectiveMCPToken();
  const url = `http://127.0.0.1:${mcpPort}/api/mcp/tool`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      tool: toolName,
      arguments: toolArguments
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP tool error ${response.status}: ${text}`);
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "MCP tool execution failed");
  }
  return data.result;
}

function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj)
    .sort()
    .reduce((res: any, key: string) => {
      res[key] = sortObjectKeys(obj[key]);
      return res;
    }, {});
}

function isSimpleGreeting(prompt: string): boolean {
  const clean = prompt.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
  const greetings = [
    "hello", "hi", "hey", "greetings", "good morning", "good afternoon", 
    "good evening", "howdy", "sup", "yo", "test", "halo", "ola", "namaste"
  ];
  return greetings.includes(clean);
}

function parseLaxJson(str: string): any {
  try {
    return JSON.parse(str);
  } catch (e) {}

  let fixed = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't'];
      const isHex = (c: string) => /[0-9a-fA-F]/.test(c);

      let isUnicode = false;
      if (char === 'u' && i + 4 < str.length) {
        if (isHex(str[i+1]) && isHex(str[i+2]) && isHex(str[i+3]) && isHex(str[i+4])) {
          isUnicode = true;
        }
      }

      if (inString && !validEscapes.includes(char) && !isUnicode) {
        fixed += "\\\\" + char;
      } else {
        fixed += "\\" + char;
      }
      escape = false;
    } else if (char === '\\') {
      escape = true;
    } else {
      if (char === '"') {
        inString = !inString;
        fixed += char;
      } else if (inString) {
        if (char === '\n') {
          fixed += "\\n";
        } else if (char === '\r') {
          fixed += "\\r";
        } else if (char === '\t') {
          fixed += "\\t";
        } else if (char.charCodeAt(0) < 32) {
          fixed += "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0");
        } else {
          fixed += char;
        }
      } else {
        fixed += char;
      }
    }
  }

  if (escape) {
    fixed += "\\";
  }

  return JSON.parse(fixed);
}

/**
 * Sanitizes objects for logging by redacting tokens and truncating large base64 buffers.
 */
function sanitizeForLog(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForLog);
  const copy: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase().includes("token") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("auth")) {
      copy[k] = "[REDACTED]";
    } else if (k === "base64Data" && typeof v === "string") {
      copy[k] = `[base64 image: ${Math.round(v.length / 1024)} KB]`;
    } else if (typeof v === "string" && v.length > 500) {
      copy[k] = `${v.slice(0, 200)}... [truncated ${v.length} chars]`;
    } else if (typeof v === "object" && v !== null) {
      copy[k] = sanitizeForLog(v);
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

const modelsCascade = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite"
];

/**
 * Executes a call to the Gemini API with fallback cascading support on rate limits.
 */
async function fetchGeminiWithFallback(
  payload: any,
  apiKey: string
): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
  for (let modelIndex = 0; modelIndex < modelsCascade.length; modelIndex++) {
    const modelName = modelsCascade[modelIndex];
    const targetGeminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    console.log(`[Gemini API] Calling ${modelName} (turns: ${payload?.contents?.length || 0})`);

    try {
      const response = await fetch(targetGeminiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        console.warn(`[Gemini API] Model ${modelName} returned 429. Trying next model...`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Gemini API] Model ${modelName} returned error ${response.status}: ${errorText}`);
        return { success: false, error: `Gemini API Error (${response.status}): ${errorText}`, status: response.status };
      }

      const data = await response.json();
      console.log(`[Gemini API] Model ${modelName} responded (finishReason: ${data?.candidates?.[0]?.finishReason || "unknown"})`);
      return { success: true, data };
    } catch (err: any) {
      console.error(`[Gemini API] Fetch error calling ${modelName}:`, err.message || err);
      if (modelIndex === modelsCascade.length - 1) {
        return { success: false, error: err.message || "Failed to contact Gemini API", status: 500 };
      }
    }
  }

  return { success: false, error: "All models in cascade returned 429 (Rate Limit)", status: 429 };
}

/**
 * Handles AI Copilot code generation requests powered by cascading Gemini models.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = requireSession(request as unknown as Request);
    if ("error" in authResult) return authResult.error;
    const userAccessToken = authResult.session?.access_token as string | undefined;

    const payload: any = await request.json();
    if (payload.action === "approve" || payload.action === "reject") {
      const { callId, action, details } = payload;
      if (callId === "pending-diff" || !callId) {
        for (const [key, val] of pendingApprovals.entries()) {
          if (val === "pending") {
            pendingApprovals.set(key, {
              status: action === "approve" ? "approved" : "rejected",
              details: details || null,
            });
          }
        }
      } else {
        pendingApprovals.set(callId, {
          status: action === "approve" ? "approved" : "rejected",
          details: details || null,
        });
      }
      return NextResponse.json({ success: true });
    }

    const userPromptText = payload.prompt || "";
    const activeFilePath = payload.activeFilePath || "";
    const selectedTextSnippet = payload.selectedText || "";
    const fullFileContentString = payload.fullFileContent || "";
    const fileContextsMap = payload.fileContexts || {};
    const compileLogString = payload.compileLog || "";
    const errorCountNumber = payload.errorCount || 0;
    const warningCountNumber = payload.warningCount || 0;
    const projectName = payload.projectName || "";

    console.log("Copilot call: prompt =", userPromptText, "project =", projectName, "file =", activeFilePath || "(none)");

    const geminiApiKeyString = payload.apiKey || process.env.GEMINI_API_KEY || "";
    if (!geminiApiKeyString) {
      console.error("Copilot error: GEMINI_API_KEY missing");
      return NextResponse.json(
        { success: false, message: "", error: "GEMINI_API_KEY environment variable is missing on server" },
        { status: 400 }
      ) as any;
    }

    const referencedFilesList: string[] = [];
    const atMentionRegex = /@([a-zA-Z0-9_.\-\/]+)/g;
    let matchRegexArray: RegExpExecArray | null;

    while ((matchRegexArray = atMentionRegex.exec(userPromptText)) !== null) {
      const referencedFileName = matchRegexArray[1];
      if (fileContextsMap[referencedFileName]) {
        referencedFilesList.push(referencedFileName);
      }
    }

    const isGreeting = isSimpleGreeting(userPromptText);

    let compiledContextPrompt = `You are an expert LaTeX Copilot AI Assistant inside Open-Overleaf.\n\n`;
    if (projectName) {
      compiledContextPrompt += `Current Project Name: ${projectName}\n`;
    }
    if (activeFilePath) {
      compiledContextPrompt += `Active File: ${activeFilePath}\n`;
    } else {
      compiledContextPrompt += `Active File: None (No file currently open in editor)\n`;
    }

    if (!isGreeting) {
      if (activeFilePath && fullFileContentString) {
        compiledContextPrompt += `Full Content of ${activeFilePath}:\n\`\`\`latex\n${fullFileContentString}\n\`\`\`\n\n`;
      }

      if (referencedFilesList.length > 0) {
        compiledContextPrompt += `Referenced Files Context (@mentions):\n`;
        for (const fileNameItem of referencedFilesList) {
          compiledContextPrompt += `--- ${fileNameItem} ---\n${fileContextsMap[fileNameItem]}\n\n`;
        }
      }

      if (compileLogString || errorCountNumber > 0 || warningCountNumber > 0) {
        compiledContextPrompt += `LaTeX Compilation Status & Diagnostics:\n`;
        compiledContextPrompt += `Error Count: ${errorCountNumber}, Warning Count: ${warningCountNumber}\n`;
        compiledContextPrompt += `Log Output:\n\`\`\`\n${compileLogString.slice(-1500)}\n\`\`\`\n\n`;
      }
    }

    compiledContextPrompt += `GUIDELINES:\n`;
    compiledContextPrompt += `1. Respond directly without calling tools if the user is greeting you, saying hello, asking a general question, or the request does not require filesystem/compilation actions.\n`;
    compiledContextPrompt += `2. Only call tools if they are strictly necessary to perform or answer the user request.\n`;
    compiledContextPrompt += `3. When calling an MCP tool (function call), ALWAYS explain your thinking process and reasoning in a text part before the functionCall. State what you are planning to do, which tool you are choosing, and why.\n`;
    compiledContextPrompt += `4. If you are returning the final response (the JSON object), you MUST NOT output any plain text thinking or explanations outside the JSON object. Put all your explanations, thoughts, or responses inside the "message" field of the JSON object.\n`;
    compiledContextPrompt += `5. If the user request contains a multi-step checklist or task pipeline, systematically execute EVERY single step in order without skipping intermediate file creation, renaming, deletion, patching, or inspection actions.\n\n`;

    if (selectedTextSnippet) {
      compiledContextPrompt += `User Highlighted Selection:\n\`\`\`latex\n${selectedTextSnippet}\n\`\`\`\n`;
      compiledContextPrompt += `TASK INSTRUCTION: The user has highlighted the section above. Modify or refine ONLY this highlighted text based on the request while preserving surrounding LaTeX compatibility.\n\n`;
    } else if (activeFilePath) {
      compiledContextPrompt += `TASK INSTRUCTION: Answer the user query and generate/refine LaTeX code or propose file operations for ${activeFilePath}.\n\n`;
    } else {
      compiledContextPrompt += `TASK INSTRUCTION: Answer the user query and generate/refine LaTeX code or propose file operations for the project.\n\n`;
    }

    compiledContextPrompt += `User Request: ${userPromptText}\n\n`;
    compiledContextPrompt += `OUTPUT FORMAT INSTRUCTION:\n`;
    compiledContextPrompt += `When you have finished calling tools (or if no tools are needed), return a valid JSON object strictly adhering to this schema:\n`;
    compiledContextPrompt += `{\n`;
    compiledContextPrompt += `  "message": "Brief natural language explanation of your response or proposed fix",\n`;
    compiledContextPrompt += `  "actionType": "modify_file" | "delete_file" | "none",\n`;
    compiledContextPrompt += `  "targetPath": "${activeFilePath || "relative/path/to/target/file.tex"}",\n`;
    compiledContextPrompt += `  "actionDescription": "Human readable description of proposed modification for user approval",\n`;
    compiledContextPrompt += `  "replacementCode": "When modifying without text selection, this MUST contain the COMPLETE, full-file LaTeX document content. When modifying with text selection, this contains only the replacement for the highlighted selection."\n`;
    compiledContextPrompt += `}\n`;

    const systemInstruction = {
      parts: [
        {
          text: `You are an expert LaTeX Copilot AI Assistant inside Open-Overleaf.
Your goal is to assist the user with editing and compiling LaTeX documents.

AVAILABLE MCP TOOLS:
- list_projects: Lists all LaTeX projects in open-overleaf.
- list_files: Lists files and directory structure in the current project.
- search_in_project: Searches for text patterns across project files.
- read_project_file: Reads the complete text of an existing file.
- read_file_lines: Reads specific line ranges [startLine, endLine] from an existing file.
- create_file: Creates a new empty file in the project. (To add code or content to it, call apply_patch immediately after).
- apply_patch: Surgically replaces targeted lines or adds content into an existing file using diff chunks (mounted in Monaco for user hunk review).
- rename_file: Renames or moves an existing file.
- delete_file: Deletes an existing file from the project.
- validate_tex: Runs chktex linter to inspect syntax and diagnostics.
- get_file_history: Fetches git commit history for a file.
- get_file_at_revision: Inspects file content at a specific git SHA commit.
- update_project_settings: Updates project configuration (compiler engine, main entry file).
- compile_project: Runs LaTeX compilation and returns diagnostics and log.
- get_project_pdf: Compiles (if needed) and fetches compiled PDF binary metadata + compilation logs.
- get_project_preview_image: Compiles (if needed) and renders a PDF page to PNG for visual layout inspection + compilation logs.

CRITICAL GUIDELINES:
1. Respond directly without calling any tools if the user is greeting you (e.g. "hello", "hi"), saying hello, asking a general question, or if the request does not require filesystem or compilation actions.
2. ONLY call tools if they are strictly necessary to perform the filesystem or compilation actions requested by the user.
3. If the user greets you or says hello, DO NOT list files, read files, or compile the project. Just reply with a helpful greeting text directly.
4. When you have finished executing tools and have the necessary information to reply, stop calling tools and immediately return the final JSON text response. Do not perform unnecessary or redundant operations.
5. NEVER write your own response JSON or assistant messages into files like '.overleaf.json' or '.tex' unless specifically instructed by the user to write that content.
6. To inspect the contents, read the text, or see code inside any file (like a .tex, .json, or .bib file), you MUST call the 'read_project_file' or 'read_file_lines' tool. Do NOT use 'compile_project' or other tools to read/inspect files.
7. Only use 'compile_project' when the user explicitly asks you to compile, build, preview, or run compilation on the project.
8. If you want to check what files are inside the project, call 'list_files' once. Do not call it repeatedly.
9. If a compilation fails, DO NOT call 'compile_project' again until you have modified a file using 'apply_patch' to attempt to fix the error.
10. Use 'create_file' to create any new empty file in the project. Then use 'apply_patch' to add content to it.
11. Use 'apply_patch' when you need to make targeted line-level modifications or add content to an existing file. Always use surgical patches.
12. Use 'get_file_history' and 'get_file_at_revision' to inspect past commits/versions of a file when the user asks to see history, revert a change, or when you need to understand how a recent update broke the compilation.
13. When calling an MCP tool (function call), ALWAYS explain your thinking process and reasoning in a text part before the functionCall. State what you are planning to do, which tool you are choosing, and why.
14. If you are returning the final response (the JSON object), you MUST NOT output any plain text thinking or explanations outside the JSON object. Put all your explanations, thoughts, or responses inside the "message" field of the JSON object.
15. If returning 'modify_file' in the final JSON response without a highlighted text selection, 'replacementCode' MUST be the COMPLETE, full-file LaTeX document content including preamble, \\documentclass, packages, and \\begin{document}...\\end{document}. NEVER return an isolated snippet in 'replacementCode' for full-file modifications.
16. When the user asks to look at, review, or inspect the visual appearance or layout of the PDF, call 'get_project_preview_image' to inspect the rendered page visually.
17. When the user provides a multi-step checklist or task pipeline, you MUST execute ALL requested steps in exact sequence without skipping intermediate file creation, renaming, deletion, patching, or inspection steps.`
        }
      ]
    };

    const history = payload.history || [];
    const cleanHistory = history.filter((msg: any) => {
      if (msg.sender === "user") return true;
      if (msg.sender === "copilot" && !msg.isThought && !msg.isToolCall && !msg.isError) return true;
      return false;
    });

    const historyTurns: any[] = [];
    for (const msg of cleanHistory) {
      const role = msg.sender === "user" ? "user" : "model";
      if (historyTurns.length === 0) {
        if (role === "user") {
          historyTurns.push({ role, parts: [{ text: msg.text }] });
        }
      } else {
        const lastTurn = historyTurns[historyTurns.length - 1];
        if (lastTurn.role === role) {
          lastTurn.parts[0].text += "\n" + msg.text;
        } else {
          historyTurns.push({ role, parts: [{ text: msg.text }] });
        }
      }
    }

    const conversationHistory: any[] = [...historyTurns];
    if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === "user") {
      conversationHistory[conversationHistory.length - 1].parts[0].text += "\n\n[Current Context & Update Request]:\n" + compiledContextPrompt;
    } else {
      conversationHistory.push({
        role: "user",
        parts: [{ text: compiledContextPrompt }]
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendChunk = (data: any) => {
          try {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"));
          } catch (e) {}
        };

        try {
          let finalResponseData: any = null;
          let loopCounter = 0;
          const maxLoopLimit = 20;
          let isDone = false;
          const executedToolSignatures = new Set<string>();

          while (!isDone && loopCounter < maxLoopLimit) {
            loopCounter++;
            console.log("Copilot loop turn:", loopCounter);

            const responseResult = await fetchGeminiWithFallback(
              {
                contents: conversationHistory,
                tools: isGreeting ? [] : [
                  {
                    functionDeclarations,
                  },
                ],
                systemInstruction,
                ...(isGreeting ? {
                  generationConfig: {
                    responseMimeType: "application/json"
                  }
                } : {})
              },
              geminiApiKeyString
            );

            if (!responseResult.success) {
              sendChunk({ type: "error", error: responseResult.error });
              controller.close();
              return;
            }

            const geminiResponseData = responseResult.data;
            const candidate = geminiResponseData?.candidates?.[0];
            const content = candidate?.content;
            const parts = content?.parts || [];

            const functionCalls = parts
              .filter((p: any) => p.functionCall)
              .map((p: any) => p.functionCall);

            if (functionCalls.length > 0) {
              const textParts = parts
                .filter((p: any) => p.text)
                .map((p: any) => p.text)
                .join("\n")
                .trim();

              if (textParts) {
                sendChunk({ type: "thought", text: textParts });
              }

              conversationHistory.push(content);
              console.log("Gemini requested batched function calls:", functionCalls.map((fc: any) => fc.name).join(", "));

              for (let i = 0; i < functionCalls.length; i++) {
                const fc = functionCalls[i];
                const callId = `call-${loopCounter}-${i}`;
                sendChunk({ type: "tool_start", id: callId, name: fc.name, arguments: fc.args });
              }

              const responsePartsNested = await Promise.all(
                functionCalls.map(async (fc: any, i: number) => {
                  const callId = `call-${loopCounter}-${i}`;
                  const toolName = fc.name;
                  const toolArgs = fc.args || {};
                  const sortedArgs = sortObjectKeys(fc.args || {});
                  const signature = `${toolName}:${JSON.stringify(sortedArgs)}`;
                  let toolResult;

                  executedToolSignatures.add(signature);
                  try {
                    const finalArgs = {
                      ...toolArgs,
                      githubToken: userAccessToken || toolArgs?.githubToken,
                    };

                    const approvalRequiredTools = [
                      "apply_patch",
                      "create_file",
                      "delete_file",
                      "rename_file",
                      "update_project_settings",
                    ];
                    const requiresApproval = approvalRequiredTools.includes(toolName);
                    let approvalRecord: any = null;

                    if (requiresApproval) {
                      sendChunk({ type: "tool_approval_required", id: callId, name: toolName, arguments: toolArgs });
                      pendingApprovals.set(callId, "pending");

                      const startTime = Date.now();
                      const isPatchEdit = toolName === "apply_patch";
                      const approvalTimeoutMs = isPatchEdit ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000;

                      while (Date.now() - startTime < approvalTimeoutMs) {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        const currentVal = pendingApprovals.get(callId);
                        if (currentVal && typeof currentVal === "object" && (currentVal.status === "approved" || currentVal.status === "rejected")) {
                          approvalRecord = currentVal;
                          break;
                        }
                      }

                      pendingApprovals.delete(callId);

                      if (approvalRecord?.status === "rejected") {
                        const rejectDetails = approvalRecord?.details;
                        toolResult = {
                          rejectedByUser: true,
                          message: rejectDetails?.message || `The user reviewed and rejected the proposed changes for '${toolName}'.`,
                          acceptedHunksCount: rejectDetails?.acceptedCount ?? 0,
                          rejectedHunksCount: rejectDetails?.rejectedCount ?? 1,
                        };
                        sendChunk({
                          type: "tool_result",
                          id: callId,
                          name: toolName,
                          success: false,
                          rejectedByUser: true,
                          result: toolResult,
                          arguments: toolArgs,
                        });
                      } else if (approvalRecord?.status !== "approved") {
                        throw new Error(`Tool execution for '${toolName}' timed out waiting for user approval.`);
                      }
                    }

                    if (!toolResult) {
                      console.log("[Copilot API] Executing tool:", toolName, "args:", JSON.stringify(sanitizeForLog(finalArgs)));
                      toolResult = await callLocalMCPTool(toolName, finalArgs);
                      if (requiresApproval && approvalRecord?.details) {
                        toolResult = {
                          ...toolResult,
                          reviewDetails: approvalRecord.details,
                        };
                      }
                      console.log("[Copilot API] Tool execution succeeded:", toolName, "result:", JSON.stringify(sanitizeForLog(toolResult)));
                      sendChunk({ type: "tool_result", id: callId, name: toolName, success: true, result: toolResult, arguments: toolArgs });
                    }
                  } catch (err: any) {
                    console.error("[Copilot API] Tool execution failed:", toolName, "error:", err.message || err);
                    sendChunk({ type: "tool_result", id: callId, name: toolName, success: false, error: err.message });
                    toolResult = { error: err.message || "Failed to execute tool" };
                  }

                  let inlineImagePart: any = null;
                  let sanitizedResult = toolResult;

                  if (toolName === "get_project_preview_image" && toolResult?.base64Data) {
                    inlineImagePart = {
                      inlineData: {
                        mimeType: toolResult.mimeType || "image/png",
                        data: toolResult.base64Data,
                      },
                    };
                    sanitizedResult = {
                      fileName: toolResult.fileName,
                      mimeType: toolResult.mimeType,
                      pageNumber: toolResult.pageNumber,
                      sizeBytes: toolResult.sizeBytes,
                      status: "rendered_successfully",
                    };
                  }

                  const callParts: any[] = [
                    {
                      functionResponse: {
                        name: toolName,
                        response: { result: sanitizedResult },
                      },
                    },
                  ];
                  if (inlineImagePart) {
                    callParts.push(inlineImagePart);
                  }

                  return callParts;
                })
              );

              const flattenedResponseParts = responsePartsNested.flat();

              conversationHistory.push({
                role: "user",
                parts: flattenedResponseParts,
              });
            } else {
              isDone = true;
              let rawCandidateText = parts[0]?.text || "";
              rawCandidateText = rawCandidateText.trim();
              if (rawCandidateText.startsWith("```")) {
                const lines = rawCandidateText.split("\n");
                if (lines[0].startsWith("```")) {
                  lines.shift();
                }
                if (lines[lines.length - 1].startsWith("```")) {
                  lines.pop();
                }
                rawCandidateText = lines.join("\n").trim();
              }
              console.log("[Copilot API] Gemini raw candidate text:", rawCandidateText);

              let parsedJsonResponse: any = null;
              let parseError: any = null;

              try {
                parsedJsonResponse = parseLaxJson(rawCandidateText);
                console.log("[Copilot API] Parsed JSON response successfully:", JSON.stringify(parsedJsonResponse));
              } catch (err: any) {
                parseError = err;
                const startIdx = rawCandidateText.indexOf("{");
                const endIdx = rawCandidateText.lastIndexOf("}");
                if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                  try {
                    const innerJsonStr = rawCandidateText.slice(startIdx, endIdx + 1);
                    parsedJsonResponse = parseLaxJson(innerJsonStr);
                    parseError = null;
                    console.log("[Copilot API] Extracted and parsed inner JSON block successfully:", JSON.stringify(parsedJsonResponse));
                  } catch (e2: any) {
                    parseError = e2;
                    console.warn("[Copilot API] Failed to parse extracted inner JSON block:", e2.message);
                  }
                }
              }

              if (parseError) {
                const isJsonLike = rawCandidateText.trim().startsWith("{") || rawCandidateText.includes("replacementCode") || rawCandidateText.includes('"message"');
                if (isJsonLike && loopCounter < maxLoopLimit) {
                  console.warn("[Copilot API] JSON parsing failed on AI candidate text. Retrying with error message fed back to AI model...", parseError.message);
                  sendChunk({
                    type: "thought",
                    text: `✕ AI JSON format error (${parseError.message}). Retrying AI response generation...`,
                  });
                  conversationHistory.push({
                    role: "model",
                    parts: [{ text: rawCandidateText }],
                  });
                  conversationHistory.push({
                    role: "user",
                    parts: [
                      {
                        text: `[JSON FORMAT ERROR]: Your previous response failed to parse as valid JSON: ${parseError.message}. Please output ONLY a valid JSON object matching the required schema with proper string escaping.`,
                      },
                    ],
                  });
                  isDone = false;
                  continue;
                }

                console.warn("[Copilot API] Failed to parse response as JSON, falling back to plaintext response");
                const containsLatex = rawCandidateText.includes("\\") || rawCandidateText.includes("{") || rawCandidateText.includes("}");
                if (containsLatex && activeFilePath) {
                  parsedJsonResponse = {
                    message: "Generated update:",
                    actionType: "modify_file",
                    targetPath: activeFilePath,
                    actionDescription: "Apply AI code modification",
                    replacementCode: rawCandidateText,
                  };
                } else {
                  parsedJsonResponse = {
                    message: rawCandidateText,
                    actionType: "none",
                    targetPath: activeFilePath,
                    actionDescription: "",
                    replacementCode: "",
                  };
                }
              }

              isDone = true;
              finalResponseData = parsedJsonResponse;
              sendChunk({ type: "final", response: parsedJsonResponse });
            }
          }

          if (!finalResponseData) {
            console.error("Exited loop because max turn limit was hit without final response");
            sendChunk({ type: "error", error: "Failed to generate completion after maximum turns" });
          } else {
            console.log("Copilot request completed successfully");
          }
          controller.close();
        } catch (streamError: any) {
          console.error("Stream execution error:", streamError);
          sendChunk({ type: "error", error: streamError.message || "Internal stream execution error" });
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (serverError: any) {
    console.error("Server exception in Copilot route:", serverError);
    return NextResponse.json(
      { success: false, message: "", error: serverError.message || "Internal Copilot Error" },
      { status: 500 }
    ) as any;
  }
}

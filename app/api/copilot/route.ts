import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
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
    name: "write_project_file",
    description: "Writes or updates a file in an open-overleaf project and commits it to GitHub.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: { type: "STRING", description: "Name of the LaTeX project" },
        filePath: { type: "STRING", description: "Relative file path inside project" },
        content: { type: "STRING", description: "Updated file content" }
      },
      required: ["projectName", "filePath", "content"]
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

/**
 * Handles AI Copilot code generation requests powered by gemini-3.5-flash-lite with 429 retry backoff.
 */
export async function POST(request: NextRequest): Promise<NextResponse<CopilotResponsePayload>> {
  try {
    const session = verifySessionFromRequest(request);
    const userAccessToken = session?.access_token as string | undefined;

    const payload: CopilotRequestPayload = await request.json();
    const userPromptText = payload.prompt || "";
    const activeFilePath = payload.activeFilePath || "main.tex";
    const selectedTextSnippet = payload.selectedText || "";
    const fullFileContentString = payload.fullFileContent || "";
    const fileContextsMap = payload.fileContexts || {};
    const compileLogString = payload.compileLog || "";
    const errorCountNumber = payload.errorCount || 0;
    const warningCountNumber = payload.warningCount || 0;
    const projectName = payload.projectName || "";

    console.log("Copilot call: prompt =", userPromptText, "project =", projectName, "file =", activeFilePath);

    const geminiApiKeyString = payload.apiKey || process.env.GEMINI_API_KEY || "";
    if (!geminiApiKeyString) {
      console.error("Copilot error: GEMINI_API_KEY missing");
      return NextResponse.json(
        { success: false, message: "", error: "GEMINI_API_KEY environment variable is missing on server" },
        { status: 400 }
      );
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

    let compiledContextPrompt = `You are an expert LaTeX Copilot AI Assistant inside Open-Overleaf.\n\n`;
    if (projectName) {
      compiledContextPrompt += `Current Project Name: ${projectName}\n`;
    }
    compiledContextPrompt += `Active File: ${activeFilePath}\n`;

    if (fullFileContentString) {
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

    if (selectedTextSnippet) {
      compiledContextPrompt += `User Highlighted Selection:\n\`\`\`latex\n${selectedTextSnippet}\n\`\`\`\n`;
      compiledContextPrompt += `TASK INSTRUCTION: The user has highlighted the section above. Modify or refine ONLY this highlighted text based on the request while preserving surrounding LaTeX compatibility.\n\n`;
    } else {
      compiledContextPrompt += `TASK INSTRUCTION: Answer the user query and generate/refine LaTeX code or propose file operations for ${activeFilePath}.\n\n`;
    }

    compiledContextPrompt += `User Request: ${userPromptText}\n\n`;
    compiledContextPrompt += `OUTPUT FORMAT INSTRUCTION:\n`;
    compiledContextPrompt += `Return a valid JSON object strictly adhering to this schema:\n`;
    compiledContextPrompt += `{\n`;
    compiledContextPrompt += `  "message": "Brief natural language explanation of your response or proposed fix",\n`;
    compiledContextPrompt += `  "actionType": "modify_file" | "delete_file" | "none",\n`;
    compiledContextPrompt += `  "targetPath": "${activeFilePath}",\n`;
    compiledContextPrompt += `  "actionDescription": "Human readable description of proposed modification for user approval",\n`;
    compiledContextPrompt += `  "replacementCode": "The refined or generated LaTeX code snippet to insert or replace"\n`;
    compiledContextPrompt += `}\n`;

    const targetGeminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiApiKeyString}`;

    const conversationHistory: any[] = [
      {
        role: "user",
        parts: [
          {
            text: compiledContextPrompt,
          },
        ],
      },
    ];

    let finalResponseData: any = null;
    const maxRetryAttemptsLimit = 3;
    let loopCounter = 0;
    const maxLoopLimit = 8;
    let isDone = false;

    while (!isDone && loopCounter < maxLoopLimit) {
      loopCounter++;
      console.log("Copilot loop turn:", loopCounter);

      const requestBodyPayload = {
        contents: conversationHistory,
        tools: [
          {
            functionDeclarations,
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      };

      let successAttempt = false;
      let rawCandidateText = "";
      let functionCallToExecute: any = null;

      for (let attemptIndex = 1; attemptIndex <= maxRetryAttemptsLimit; attemptIndex++) {
        const geminiHttpResponse = await fetch(targetGeminiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBodyPayload),
        });

        if (geminiHttpResponse.status === 429) {
          console.warn("Gemini API rate limited (429), retrying...");
          if (attemptIndex < maxRetryAttemptsLimit) {
            await new Promise((resolve) => setTimeout(resolve, 30000));
            continue;
          }
          console.error("Gemini API rate limit exceeded permanently");
          return NextResponse.json(
            { success: false, message: "", error: "Rate limit exceeded (429). Please wait 30 seconds before retrying." },
            { status: 429 }
          );
        }

        if (!geminiHttpResponse.ok) {
          const errorResponseBody = await geminiHttpResponse.text();
          console.error("Gemini API error status:", geminiHttpResponse.status, "body:", errorResponseBody);
          return NextResponse.json(
            { success: false, message: "", error: `Gemini API Error (${geminiHttpResponse.status}): ${errorResponseBody}` },
            { status: geminiHttpResponse.status }
          );
        }

        const geminiResponseData = await geminiHttpResponse.json();
        const candidate = geminiResponseData?.candidates?.[0];
        const contentPart = candidate?.content?.parts?.[0];

        if (contentPart?.functionCall) {
          functionCallToExecute = contentPart.functionCall;
          console.log("Gemini requested function call:", functionCallToExecute.name, "args:", JSON.stringify(functionCallToExecute.args));
          conversationHistory.push({
            role: "model",
            parts: [contentPart],
          });
          successAttempt = true;
          break;
        } else {
          rawCandidateText = contentPart?.text || "";
          console.log("Gemini returned text response length:", rawCandidateText.length);
          successAttempt = true;
          break;
        }
      }

      if (!successAttempt) {
        console.error("Failed to fetch response from Gemini API inside loop");
        return NextResponse.json(
          { success: false, message: "", error: "Failed to communicate with Gemini API" },
          { status: 500 }
        );
      }

      if (functionCallToExecute) {
        const toolName = functionCallToExecute.name;
        const toolArgs = functionCallToExecute.args || {};

        let toolResult;
        try {
          const finalArgs = {
            ...toolArgs,
            githubToken: userAccessToken || toolArgs?.githubToken,
          };
          console.log("Executing local tool:", toolName, "args:", JSON.stringify(finalArgs));
          toolResult = await callLocalMCPTool(toolName, finalArgs);
          console.log("Tool execution succeeded");
        } catch (err: any) {
          console.error("Tool execution failed:", err.message);
          toolResult = { error: err.message || "Failed to execute tool" };
        }

        conversationHistory.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: { result: toolResult },
              },
            },
          ],
        });
      } else {
        isDone = true;

        let parsedJsonResponse = {
          message: rawCandidateText,
          actionType: "none",
          targetPath: activeFilePath,
          actionDescription: "",
          replacementCode: "",
        };

        try {
          parsedJsonResponse = JSON.parse(rawCandidateText);
          console.log("Parsed JSON response successfully");
        } catch {
          console.warn("Failed to parse response as JSON, falling back to plaintext");
          parsedJsonResponse = {
            message: "Generated update:",
            actionType: "modify_file",
            targetPath: activeFilePath,
            actionDescription: "Apply AI code modification",
            replacementCode: rawCandidateText,
          };
        }

        finalResponseData = parsedJsonResponse;
      }
    }

    if (!finalResponseData) {
      console.error("Exited loop because max turn limit was hit without final response");
      return NextResponse.json(
        { success: false, message: "", error: "Failed to generate completion after maximum turns" },
        { status: 500 }
      );
    }

    console.log("Copilot request completed successfully");
    return NextResponse.json({
      success: true,
      message: finalResponseData.message || "Refined successfully",
      actionType: (finalResponseData.actionType as any) || (finalResponseData.replacementCode ? "modify_file" : "none"),
      targetPath: finalResponseData.targetPath || activeFilePath,
      actionDescription: finalResponseData.actionDescription || "Apply proposed changes",
      replacementCode: finalResponseData.replacementCode || "",
    });
  } catch (serverError: any) {
    console.error("Server exception in Copilot route:", serverError);
    return NextResponse.json(
      { success: false, message: "", error: serverError.message || "Internal Copilot Error" },
      { status: 500 }
    );
  }
}

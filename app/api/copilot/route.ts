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

    console.log("Calling Gemini model:", modelName);

    try {
      const response = await fetch(targetGeminiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        console.warn(`Model ${modelName} returned 429. Trying next model...`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Model ${modelName} returned error ${response.status}: ${errorText}`);
        return { success: false, error: `Gemini API Error (${response.status}): ${errorText}`, status: response.status };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: any) {
      console.error(`Fetch error calling ${modelName}:`, err.message);
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
    compiledContextPrompt += `Active File: ${activeFilePath}\n`;

    if (!isGreeting) {
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
    }

    compiledContextPrompt += `GUIDELINES:\n`;
    compiledContextPrompt += `1. Respond directly without calling tools if the user is greeting you, saying hello, asking a general question, or the request does not require filesystem/compilation actions.\n`;
    compiledContextPrompt += `2. Only call tools if they are strictly necessary to perform or answer the user request.\n`;
    compiledContextPrompt += `3. When calling an MCP tool (function call), ALWAYS explain your thinking process and reasoning in a text part before the functionCall. State what you are planning to do, which tool you are choosing, and why.\n`;
    compiledContextPrompt += `4. If you are returning the final response (the JSON object), you MUST NOT output any plain text thinking or explanations outside the JSON object. Put all your explanations, thoughts, or responses inside the "message" field of the JSON object.\n\n`;

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

    const systemInstruction = {
      parts: [
        {
          text: `You are an expert LaTeX Copilot AI Assistant inside Open-Overleaf.
Your goal is to assist the user with editing and compiling LaTeX documents.

CRITICAL GUIDELINES:
1. Respond directly without calling any tools if the user is greeting you (e.g. "hello", "hi"), saying hello, asking a general question, or if the request does not require filesystem or compilation actions.
2. ONLY call tools if they are strictly necessary to perform the filesystem or compilation actions requested by the user.
3. If the user greets you or says hello, DO NOT list files, read files, or compile the project. Just reply with a helpful greeting text directly.
4. When you have finished executing tools and have the necessary information to reply, stop calling tools and immediately return the final JSON text response. Do not perform unnecessary or redundant operations.
5. NEVER write your own response JSON or assistant messages into files like '.overleaf.json' or '.tex' unless specifically instructed by the user to write that content.
6. To inspect the contents, read the text, or see code inside any file (like a .tex, .json, or .bib file), you MUST call the 'read_project_file' tool. Do NOT use 'compile_project' or other tools to read/inspect files.
7. Only use 'compile_project' when the user explicitly asks you to compile, build, preview, or run compilation on the project.
8. If you want to check what files are inside the project, call 'list_files' once. Do not call it repeatedly.
9. If a compilation fails, DO NOT call 'compile_project' again until you have modified a file using 'write_project_file' to attempt to fix the error.
10. When calling an MCP tool (function call), ALWAYS explain your thinking process and reasoning in a text part before the functionCall. State what you are planning to do, which tool you are choosing, and why.
11. If you are returning the final response (the JSON object), you MUST NOT output any plain text thinking or explanations outside the JSON object. Put all your explanations, thoughts, or responses inside the "message" field of the JSON object.`
        }
      ]
    };

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

    const stream = new ReadableStream({
      async start(controller) {
        const sendChunk = (data: any) => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"));
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

              const responseParts = await Promise.all(
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
                    console.log("Executing local tool:", toolName, "args:", JSON.stringify(finalArgs));
                    toolResult = await callLocalMCPTool(toolName, finalArgs);
                    console.log("Tool execution succeeded:", toolName);
                    sendChunk({ type: "tool_result", id: callId, name: toolName, success: true, result: toolResult });
                  } catch (err: any) {
                    console.error("Tool execution failed:", toolName, err.message);
                    sendChunk({ type: "tool_result", id: callId, name: toolName, success: false, error: err.message });
                    toolResult = { error: err.message || "Failed to execute tool" };
                  }

                  return {
                    functionResponse: {
                      name: toolName,
                      response: { result: toolResult },
                    },
                  };
                })
              );


              conversationHistory.push({
                role: "user",
                parts: responseParts,
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
              console.log("Gemini returned text response length:", rawCandidateText.length);

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
                let parsedInnerJson = false;
                const startIdx = rawCandidateText.indexOf("{");
                const endIdx = rawCandidateText.lastIndexOf("}");
                if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                  try {
                    const innerJsonStr = rawCandidateText.slice(startIdx, endIdx + 1);
                    parsedJsonResponse = JSON.parse(innerJsonStr);
                    parsedInnerJson = true;
                    console.log("Extracted and parsed inner JSON block successfully");
                  } catch {
                    console.warn("Failed to parse extracted inner JSON block");
                  }
                }

                if (!parsedInnerJson) {
                  console.warn("Failed to parse response as JSON, falling back to plaintext");
                  const containsLatex = rawCandidateText.includes("\\") || rawCandidateText.includes("{") || rawCandidateText.includes("}");
                  if (containsLatex) {
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
              }

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

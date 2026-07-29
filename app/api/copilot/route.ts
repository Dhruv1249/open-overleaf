import { NextRequest, NextResponse } from "next/server";

export interface CopilotRequestPayload {
  prompt: string;
  fileContexts?: Record<string, string>;
  selectedText?: string;
  fullFileContent?: string;
  activeFilePath?: string;
  apiKey?: string;
}

export interface CopilotResponsePayload {
  success: boolean;
  message: string;
  replacementCode?: string;
  error?: string;
}

/**
 * Handles AI Copilot code generation requests powered by gemini-3.6-flash-lite with 429 retry backoff.
 */
export async function POST(request: NextRequest): Promise<NextResponse<CopilotResponsePayload>> {
  try {
    const payload: CopilotRequestPayload = await request.json();
    const userPromptText = payload.prompt || "";
    const activeFilePath = payload.activeFilePath || "main.tex";
    const selectedTextSnippet = payload.selectedText || "";
    const fullFileContentString = payload.fullFileContent || "";
    const fileContextsMap = payload.fileContexts || {};

    const geminiApiKeyString = payload.apiKey || process.env.GEMINI_API_KEY || "";
    if (!geminiApiKeyString) {
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

    if (selectedTextSnippet) {
      compiledContextPrompt += `User Highlighted Selection:\n\`\`\`latex\n${selectedTextSnippet}\n\`\`\`\n`;
      compiledContextPrompt += `TASK INSTRUCTION: The user has highlighted the section above. Modify or refine ONLY this highlighted text based on the request while preserving surrounding LaTeX compatibility.\n\n`;
    } else {
      compiledContextPrompt += `TASK INSTRUCTION: Answer the user query and generate/refine LaTeX code for ${activeFilePath}.\n\n`;
    }

    compiledContextPrompt += `User Request: ${userPromptText}\n\n`;
    compiledContextPrompt += `OUTPUT FORMAT INSTRUCTION:\n`;
    compiledContextPrompt += `Return a valid JSON object strictly adhering to this schema:\n`;
    compiledContextPrompt += `{\n  "message": "Brief natural language explanation",\n  "replacementCode": "The refined or generated LaTeX code snippet"\n}\n`;

    const targetGeminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash-lite:generateContent?key=${geminiApiKeyString}`;

    const requestBodyPayload = {
      contents: [
        {
          parts: [
            {
              text: compiledContextPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    };

    const maxRetryAttemptsLimit = 3;
    for (let attemptIndex = 1; attemptIndex <= maxRetryAttemptsLimit; attemptIndex++) {
      const geminiHttpResponse = await fetch(targetGeminiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBodyPayload),
      });

      if (geminiHttpResponse.status === 429) {
        if (attemptIndex < maxRetryAttemptsLimit) {
          await new Promise((resolve) => setTimeout(resolve, 30000));
          continue;
        }
        return NextResponse.json(
          { success: false, message: "", error: "Rate limit exceeded (429). Please wait 30 seconds before retrying." },
          { status: 429 }
        );
      }

      if (!geminiHttpResponse.ok) {
        const errorResponseBody = await geminiHttpResponse.text();
        return NextResponse.json(
          { success: false, message: "", error: `Gemini API Error (${geminiHttpResponse.status}): ${errorResponseBody}` },
          { status: geminiHttpResponse.status }
        );
      }

      const geminiResponseData = await geminiHttpResponse.json();
      const rawCandidateText = geminiResponseData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      let parsedJsonResponse = { message: rawCandidateText, replacementCode: "" };
      try {
        parsedJsonResponse = JSON.parse(rawCandidateText);
      } catch {
        parsedJsonResponse = { message: "Generated update:", replacementCode: rawCandidateText };
      }

      return NextResponse.json({
        success: true,
        message: parsedJsonResponse.message || "Refined successfully",
        replacementCode: parsedJsonResponse.replacementCode || "",
      });
    }

    return NextResponse.json(
      { success: false, message: "", error: "Failed to generate completion after maximum retries" },
      { status: 500 }
    );
  } catch (serverError: any) {
    return NextResponse.json(
      { success: false, message: "", error: serverError.message || "Internal Copilot Error" },
      { status: 500 }
    );
  }
}

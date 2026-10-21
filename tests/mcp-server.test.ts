/**
 * Unit test suite verifying MCP Server transports and authentication.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { handleHttpRequest } from "../mcp-server.ts";

describe("Open-Overleaf MCP Server Transports & Authentication", () => {
  const testPortNumber = 48291;
  const testAuthenticationToken = "unit-test-secure-token-12345";
  let activeHttpServer: http.Server;

  before(async () => {
    process.env.OVERLEAF_MCP_TOKEN = testAuthenticationToken;

    activeHttpServer = http.createServer((incomingRequest, outgoingResponse) => {
      handleHttpRequest(incomingRequest, outgoingResponse);
    });

    await new Promise<void>((resolvePromise) => {
      activeHttpServer.listen(testPortNumber, () => resolvePromise());
    });
  });

  after(async () => {
    await new Promise<void>((resolvePromise) => {
      activeHttpServer.close(() => resolvePromise());
    });
  });

  test("rejects requests missing Bearer authorization token with 401", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });

    assert.strictEqual(responsePayload.status, 401);
    const parsedBody = await responsePayload.json();
    assert.match(parsedBody.error, /Unauthorized/);
  });

  test("rejects requests with invalid authorization token with 401", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/sse`, {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid-token-value",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });

    assert.strictEqual(responsePayload.status, 401);
  });

  test("returns 404 for non-existent session ID header", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
        "mcp-session-id": "00000000-0000-0000-0000-000000000000",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    assert.strictEqual(responsePayload.status, 404);
    const parsedBody = await responsePayload.json();
    assert.strictEqual(parsedBody.error.code, -32001);
  });

  test("supports modern Streamable HTTP client connection and tool listing", async () => {
    const streamableClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const activeMcpClient = new Client({
      name: "streamable-test-client",
      version: "1.0.0",
    });

    await activeMcpClient.connect(streamableClientTransport);
    const retrievedToolsResult = await activeMcpClient.listTools();

    assert.ok(Array.isArray(retrievedToolsResult.tools));
    assert.ok(retrievedToolsResult.tools.length > 0);

    const toolNameSet = new Set(retrievedToolsResult.tools.map((singleTool) => singleTool.name));
    assert.ok(toolNameSet.has("list_projects"));
    assert.ok(toolNameSet.has("read_project_file"));
    assert.ok(toolNameSet.has("write_project_file"));
    assert.ok(toolNameSet.has("compile_project"));
    assert.ok(toolNameSet.has("get_project_pdf"));

    await activeMcpClient.close();
  });

  test("supports modern Streamable HTTP client listing and fetching prompts", async () => {
    const streamableClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const activeMcpClient = new Client({
      name: "streamable-prompts-client",
      version: "1.0.0",
    });

    await activeMcpClient.connect(streamableClientTransport);
    const retrievedPromptsResult = await activeMcpClient.listPrompts();

    assert.ok(Array.isArray(retrievedPromptsResult.prompts));
    const promptNameSet = new Set(retrievedPromptsResult.prompts.map((singlePrompt) => singlePrompt.name));
    assert.ok(promptNameSet.has("tailor_resume"));
    assert.ok(promptNameSet.has("tailor_cover_letter"));
    assert.ok(promptNameSet.has("fix_compilation_error"));
    assert.ok(promptNameSet.has("review_candidate_profile"));

    const tailorPrompt = await activeMcpClient.getPrompt({
      name: "tailor_resume",
      arguments: {
        companyName: "Acme Corp",
        jobTitle: "Senior Distributed Systems Engineer",
        jobDescription: "Must know Go, Kubernetes, and PostgreSQL.",
      },
    });

    assert.ok(tailorPrompt.messages.length > 0);
    const promptMessageText = tailorPrompt.messages[0].content.type === "text" ? tailorPrompt.messages[0].content.text : "";
    assert.ok(promptMessageText.includes("Acme Corp"));
    assert.ok(promptMessageText.includes("get_user_profile"));
    assert.ok(promptMessageText.includes("1-page"));

    await activeMcpClient.close();
  });

  test("supports legacy SSE client transport connection and tool listing", async () => {
    const legacySseClientTransport = new SSEClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const legacyMcpClient = new Client({
      name: "legacy-sse-test-client",
      version: "1.0.0",
    });

    await legacyMcpClient.connect(legacySseClientTransport);
    const retrievedToolsResult = await legacyMcpClient.listTools();

    assert.ok(Array.isArray(retrievedToolsResult.tools));
    const toolNameSet = new Set(retrievedToolsResult.tools.map((singleTool) => singleTool.name));
    assert.ok(toolNameSet.has("list_projects"));

    await legacyMcpClient.close();
  });

  test("supports direct REST tool execution endpoint used by Job-cruiser backend", async () => {
    const restToolResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "unknown_test_tool",
        arguments: {},
      }),
    });

    assert.strictEqual(restToolResponse.status, 400);
    const parsedResponseBody = await restToolResponse.json();
    assert.strictEqual(parsedResponseBody.success, false);
    assert.match(parsedResponseBody.error, /Unknown.*tool/i);
  });

  test("responds with health status on plain HTTP GET request", async () => {
    const healthCheckResponse = await fetch(`http://localhost:${testPortNumber}/sse`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        Accept: "application/json",
      },
    });

    assert.strictEqual(healthCheckResponse.status, 200);
    const parsedHealthCheck = await healthCheckResponse.json();
    assert.strictEqual(parsedHealthCheck.status, "healthy");
    assert.strictEqual(parsedHealthCheck.service, "open-overleaf-mcp");
  });

  test("supports Streamable HTTP communication on /mcp alternative endpoint", async () => {
    const streamableClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const clientInstance = new Client({
      name: "mcp-endpoint-client",
      version: "1.0.0",
    });

    await clientInstance.connect(streamableClientTransport);
    const toolsResult = await clientInstance.listTools();
    assert.ok(toolsResult.tools.length > 0);
    await clientInstance.close();
  });

  test("isolates multiple concurrent Streamable HTTP client sessions simultaneously", async () => {
    const firstClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const secondClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const firstClient = new Client({ name: "client-one", version: "1.0.0" });
    const secondClient = new Client({ name: "client-two", version: "1.0.0" });

    await Promise.all([
      firstClient.connect(firstClientTransport),
      secondClient.connect(secondClientTransport),
    ]);

    const [firstTools, secondTools] = await Promise.all([
      firstClient.listTools(),
      secondClient.listTools(),
    ]);

    assert.ok(firstTools.tools.length > 0);
    assert.ok(secondTools.tools.length > 0);
    assert.strictEqual(firstTools.tools.length, secondTools.tools.length);

    await Promise.all([firstClient.close(), secondClient.close()]);
  });
});

describe("Open-Overleaf MCP Tool Operations Without Remote GitHub Token", () => {
  const testPortNumber = 48292;
  const testAuthenticationToken = "unit-test-secure-token-67890";
  const temporaryTestProjectsDirectory = path.join(os.tmpdir(), `open-overleaf-unit-tests-${Date.now()}`);
  let activeHttpServer: http.Server;

  before(async () => {
    process.env.OVERLEAF_MCP_TOKEN = testAuthenticationToken;
    process.env.PROJECTS_DIR = temporaryTestProjectsDirectory;
    fs.mkdirSync(temporaryTestProjectsDirectory, { recursive: true });
    const { execSync } = await import("node:child_process");
    execSync("git init -b main", { cwd: temporaryTestProjectsDirectory });
    execSync("git config user.name 'Test User'", { cwd: temporaryTestProjectsDirectory });
    execSync("git config user.email 'test@example.com'", { cwd: temporaryTestProjectsDirectory });

    activeHttpServer = http.createServer((incomingRequest, outgoingResponse) => {
      handleHttpRequest(incomingRequest, outgoingResponse);
    });

    await new Promise<void>((resolvePromise) => {
      activeHttpServer.listen(testPortNumber, () => resolvePromise());
    });
  });

  after(async () => {
    await new Promise<void>((resolvePromise) => {
      activeHttpServer.close(() => resolvePromise());
    });
    try {
      fs.rmSync(temporaryTestProjectsDirectory, { recursive: true, force: true });
    } catch {
    }
  });

  test("create_file creates file on disk without requiring githubToken", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "create_file",
        arguments: {
          projectName: "test-proj",
          filePath: "docs/intro.tex",
          content: "\\section{Introduction}",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);

    const writtenFileOnDisk = path.join(temporaryTestProjectsDirectory, "test-proj", "docs", "intro.tex");
    assert.ok(fs.existsSync(writtenFileOnDisk));
    assert.strictEqual(fs.readFileSync(writtenFileOnDisk, "utf-8"), "\\section{Introduction}");
  });

  test("write_project_file updates file on disk and in compile directory", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "write_project_file",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
          content: "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);

    const writtenFileOnDisk = path.join(temporaryTestProjectsDirectory, "test-proj", "main.tex");
    assert.ok(fs.existsSync(writtenFileOnDisk));
  });

  test("rename_file renames file on disk without requiring githubToken", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "rename_file",
        arguments: {
          projectName: "test-proj",
          fromPath: "docs/intro.tex",
          toPath: "docs/overview.tex",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);

    const oldFilePath = path.join(temporaryTestProjectsDirectory, "test-proj", "docs", "intro.tex");
    const newFilePath = path.join(temporaryTestProjectsDirectory, "test-proj", "docs", "overview.tex");
    assert.ok(!fs.existsSync(oldFilePath));
    assert.ok(fs.existsSync(newFilePath));
  });

  test("search_in_project searches local files without git clone dependency", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "search_in_project",
        arguments: {
          projectName: "test-proj",
          query: "Hello World",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);
    assert.ok(parsed.result.totalMatches > 0);
    assert.strictEqual(parsed.result.matches[0].file, "main.tex");
  });

  test("validate_tex inspects local file without git clone dependency", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "validate_tex",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);
    assert.ok("available" in parsed.result);
  });

  test("apply_patch applies edits locally without requiring githubToken", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "apply_patch",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
          patches: [
            {
              startLine: 3,
              endLine: 3,
              originalContent: "Hello World",
              newContent: "Hello Patched World",
            },
          ],
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);

    const patchedFile = path.join(temporaryTestProjectsDirectory, "test-proj", "main.tex");
    const updatedContent = fs.readFileSync(patchedFile, "utf-8");
    assert.ok(updatedContent.includes("Hello Patched World"));
  });

  test("update_project_settings and get_project_settings manage settings locally", async () => {
    const updateResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "update_project_settings",
        arguments: {
          projectName: "test-proj",
          settings: {
            compiler: "xelatex",
            mainFile: "main.tex",
          },
        },
      }),
    });

    assert.strictEqual(updateResponse.status, 200);
    const parsedUpdate = await updateResponse.json();
    assert.strictEqual(parsedUpdate.success, true);

    const getResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_project_settings",
        arguments: {
          projectName: "test-proj",
        },
      }),
    });

    assert.strictEqual(getResponse.status, 200);
    const parsedGet = await getResponse.json();
    assert.strictEqual(parsedGet.success, true);
    assert.strictEqual(parsedGet.result.settings.compiler, "xelatex");
  });

  test("get_file_history and get_file_at_revision handle local-only projects gracefully", async () => {
    const historyResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_file_history",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
        },
      }),
    });

    assert.strictEqual(historyResponse.status, 200);
    const parsedHistory = await historyResponse.json();
    assert.strictEqual(parsedHistory.success, true);
    assert.ok(Array.isArray(parsedHistory.result.commits));

    const targetSha = parsedHistory.result.commits[0]?.sha || "HEAD";
    const revisionResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_file_at_revision",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
          sha: targetSha,
        },
      }),
    });

    assert.strictEqual(revisionResponse.status, 200);
    const parsedRevision = await revisionResponse.json();
    assert.strictEqual(parsedRevision.success, true);
    assert.ok(parsedRevision.result.content.includes("Hello Patched World"));
  });

  test("delete_file removes file from local disk", async () => {
    const deleteResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "delete_file",
        arguments: {
          projectName: "test-proj",
          filePath: "docs/overview.tex",
        },
      }),
    });

    assert.strictEqual(deleteResponse.status, 200);
    const parsedDelete = await deleteResponse.json();
    assert.strictEqual(parsedDelete.success, true);

    const deletedFilePath = path.join(temporaryTestProjectsDirectory, "test-proj", "docs", "overview.tex");
    assert.ok(!fs.existsSync(deletedFilePath));
  });

  test("get_user_profile returns markdown, json, and latex formats with section filtering", async () => {
    const profileDir = path.join(temporaryTestProjectsDirectory, "test-proj", "profile");
    fs.mkdirSync(profileDir, { recursive: true });

    const sampleMarkdown = `# Candidate Profile & Experience Bank

## Personal Information
- **Name**: Jane Doe | **Email**: jane@example.com

## Professional Summary
Experienced systems engineer specializing in high-throughput backend services.

## Core Skills & Technologies
Go, PostgreSQL, Docker, Kubernetes, TypeScript

## Work Experience
### Staff Engineer — Tech Corp
- Built real-time indexing pipeline processing 50k events/sec
`;

    const sampleJSON = {
      name: "Jane Doe",
      email: "jane@example.com",
      bio_summary: "Experienced systems engineer specializing in high-throughput backend services.",
      skills: ["Go", "PostgreSQL", "Docker", "Kubernetes", "TypeScript"],
      experiences: [
        {
          company: "Tech Corp",
          role: "Staff Engineer",
          highlights: "Built real-time indexing pipeline processing 50k events/sec",
        },
      ],
    };

    const sampleLaTeX = `\\newcommand{\\candidateName}{Jane Doe}\n\\newcommand{\\candidateEmail}{jane@example.com}\n`;

    fs.writeFileSync(path.join(profileDir, "PROFILE.md"), sampleMarkdown, "utf-8");
    fs.writeFileSync(path.join(profileDir, "profile.json"), JSON.stringify(sampleJSON, null, 2), "utf-8");
    fs.writeFileSync(path.join(profileDir, "profile_vars.tex"), sampleLaTeX, "utf-8");

    const markdownResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_user_profile",
        arguments: {
          projectName: "test-proj",
          format: "markdown",
          section: "all",
        },
      }),
    });
    assert.strictEqual(markdownResponse.status, 200);
    const parsedMarkdown = await markdownResponse.json();
    assert.strictEqual(parsedMarkdown.success, true);
    assert.ok(parsedMarkdown.result.content.includes("Jane Doe"));
    assert.ok(parsedMarkdown.result.content.includes("Core Skills & Technologies"));

    const skillsSectionResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_user_profile",
        arguments: {
          projectName: "test-proj",
          format: "markdown",
          section: "skills",
        },
      }),
    });
    assert.strictEqual(skillsSectionResponse.status, 200);
    const parsedSkills = await skillsSectionResponse.json();
    assert.strictEqual(parsedSkills.success, true);
    assert.ok(parsedSkills.result.content.includes("Go, PostgreSQL"));

    const jsonResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_user_profile",
        arguments: {
          projectName: "test-proj",
          format: "json",
          section: "skills",
        },
      }),
    });
    assert.strictEqual(jsonResponse.status, 200);
    const parsedJson = await jsonResponse.json();
    assert.strictEqual(parsedJson.success, true);
    assert.deepStrictEqual(parsedJson.result.data, ["Go", "PostgreSQL", "Docker", "Kubernetes", "TypeScript"]);

    const latexResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_user_profile",
        arguments: {
          projectName: "test-proj",
          format: "latex",
        },
      }),
    });
    assert.strictEqual(latexResponse.status, 200);
    const parsedLatex = await latexResponse.json();
    assert.strictEqual(parsedLatex.success, true);
    assert.ok(parsedLatex.result.content.includes("\\newcommand{\\candidateName}{Jane Doe}"));

    const autoResolvedProjectResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_user_profile",
        arguments: {
          format: "markdown",
        },
      }),
    });
    assert.strictEqual(autoResolvedProjectResponse.status, 200);
    const parsedAutoResolved = await autoResolvedProjectResponse.json();
    assert.strictEqual(parsedAutoResolved.success, true);
    assert.strictEqual(parsedAutoResolved.result.projectName, "test-proj");
  });

  test("edit_project_file performs targeted string replacement", async () => {
    const editResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "edit_project_file",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
          target: "Hello Patched World",
          replacement: "Hello Targeted Edit World",
        },
      }),
    });

    assert.strictEqual(editResponse.status, 200);
    const parsedEdit = await editResponse.json();
    assert.strictEqual(parsedEdit.success, true);
    assert.strictEqual(parsedEdit.result.replacementsCount, 1);

    const editedFilePath = path.join(temporaryTestProjectsDirectory, "test-proj", "main.tex");
    const editedContent = fs.readFileSync(editedFilePath, "utf-8");
    assert.ok(editedContent.includes("Hello Targeted Edit World"));
    assert.ok(!editedContent.includes("Hello Patched World"));
  });

  test("batch_write_files creates and updates multiple files in single operation", async () => {
    const batchResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "batch_write_files",
        arguments: {
          projectName: "test-proj",
          commitMessage: "scaffold modular report",
          files: [
            { path: "sections/01_intro.tex", content: "\\section{Introduction}\nThis is section 1." },
            { path: "sections/02_methods.tex", content: "\\section{Methodology}\nThis is section 2." },
          ],
        },
      }),
    });

    assert.strictEqual(batchResponse.status, 200);
    const parsedBatch = await batchResponse.json();
    assert.strictEqual(parsedBatch.success, true);
    assert.strictEqual(parsedBatch.result.filesWritten, 2);

    const file1 = path.join(temporaryTestProjectsDirectory, "test-proj", "sections", "01_intro.tex");
    const file2 = path.join(temporaryTestProjectsDirectory, "test-proj", "sections", "02_methods.tex");
    assert.ok(fs.existsSync(file1));
    assert.ok(fs.existsSync(file2));
    assert.strictEqual(fs.readFileSync(file1, "utf-8"), "\\section{Introduction}\nThis is section 1.");
    assert.strictEqual(fs.readFileSync(file2, "utf-8"), "\\section{Methodology}\nThis is section 2.");
  });

  test("clean_build_artifacts removes temporary TeX output files while keeping source", async () => {
    const projDir = path.join(temporaryTestProjectsDirectory, "test-proj");
    fs.writeFileSync(path.join(projDir, "main.aux"), "dummy aux", "utf-8");
    fs.writeFileSync(path.join(projDir, "main.toc"), "dummy toc", "utf-8");
    fs.writeFileSync(path.join(projDir, "main.log"), "dummy log", "utf-8");
    fs.writeFileSync(path.join(projDir, "main.out"), "dummy out", "utf-8");

    const cleanResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "clean_build_artifacts",
        arguments: {
          projectName: "test-proj",
        },
      }),
    });

    assert.strictEqual(cleanResponse.status, 200);
    const parsedClean = await cleanResponse.json();
    assert.strictEqual(parsedClean.success, true);
    assert.ok(parsedClean.result.cleanedCount >= 4);

    assert.ok(!fs.existsSync(path.join(projDir, "main.aux")));
    assert.ok(!fs.existsSync(path.join(projDir, "main.toc")));
    assert.ok(!fs.existsSync(path.join(projDir, "main.log")));
    assert.ok(!fs.existsSync(path.join(projDir, "main.out")));
    // source file main.tex must still exist!
    assert.ok(fs.existsSync(path.join(projDir, "main.tex")));
  });

  test("upload_project_asset uploads base64 binary asset into project directory", async () => {
    const dummyImageBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const uploadResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "upload_project_asset",
        arguments: {
          projectName: "test-proj",
          targetPath: "images/test_pixel.png",
          contentBase64: dummyImageBuffer.toString("base64"),
        },
      }),
    });

    assert.strictEqual(uploadResponse.status, 200);
    const parsedUpload = await uploadResponse.json();
    assert.strictEqual(parsedUpload.success, true);

    const assetOnDisk = path.join(temporaryTestProjectsDirectory, "test-proj", "images", "test_pixel.png");
    assert.ok(fs.existsSync(assetOnDisk));
    assert.strictEqual(fs.readFileSync(assetOnDisk).length, dummyImageBuffer.length);
  });

  test("create_checkpoint, list_checkpoints, and rollback_to_checkpoint manage Git snapshots", async () => {
    const checkpointTag = "chk_test_v1";
    const createCheckpointResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "create_checkpoint",
        arguments: {
          projectName: "test-proj",
          tag: checkpointTag,
          message: "Saved before breaking changes",
        },
      }),
    });

    assert.strictEqual(createCheckpointResponse.status, 200);
    const parsedCreate = await createCheckpointResponse.json();
    assert.strictEqual(parsedCreate.success, true);
    assert.strictEqual(parsedCreate.result.tag, checkpointTag);

    const listCheckpointsResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "list_checkpoints",
        arguments: {
          projectName: "test-proj",
        },
      }),
    });

    assert.strictEqual(listCheckpointsResponse.status, 200);
    const parsedList = await listCheckpointsResponse.json();
    assert.strictEqual(parsedList.success, true);
    assert.ok(parsedList.result.checkpoints.some((c: any) => c.tag === checkpointTag));

    // Now modify a file
    const mainTexPath = path.join(temporaryTestProjectsDirectory, "test-proj", "main.tex");
    fs.writeFileSync(mainTexPath, "CORRUPTED CONTENT", "utf-8");

    // Rollback to checkpoint
    const rollbackResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "rollback_to_checkpoint",
        arguments: {
          projectName: "test-proj",
          tag: checkpointTag,
        },
      }),
    });

    assert.strictEqual(rollbackResponse.status, 200);
    const parsedRollback = await rollbackResponse.json();
    assert.strictEqual(parsedRollback.success, true);

    // Verify main.tex restored
    const restoredContent = fs.readFileSync(mainTexPath, "utf-8");
    assert.ok(restoredContent.includes("Hello Targeted Edit World"));
    assert.ok(!restoredContent.includes("CORRUPTED CONTENT"));
  });

  test("export_project_pdf copies compiled PDF artifact directly to destination path", async () => {
    const projDir = path.join(temporaryTestProjectsDirectory, "test-proj");
    fs.writeFileSync(path.join(projDir, "main.pdf"), "%PDF-1.4 dummy pdf content", "utf-8");

    const destinationPath = path.join(temporaryTestProjectsDirectory, "exported_output.pdf");

    const exportResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "export_project_pdf",
        arguments: {
          projectName: "test-proj",
          destinationLocalPath: destinationPath,
        },
      }),
    });

    assert.strictEqual(exportResponse.status, 200);
    const parsedExport = await exportResponse.json();
    assert.strictEqual(parsedExport.success, true);
    assert.strictEqual(parsedExport.result.destinationPath, destinationPath);

    assert.ok(fs.existsSync(destinationPath));
    assert.strictEqual(fs.readFileSync(destinationPath, "utf-8"), "%PDF-1.4 dummy pdf content");
  });

  test("get_compiler_environment queries engines, fonts, and packages", async () => {
    const envResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_compiler_environment",
        arguments: {
          queryFont: "DejaVu",
          checkPackage: "geometry",
        },
      }),
    });

    assert.strictEqual(envResponse.status, 200);
    const parsedEnv = await envResponse.json();
    assert.strictEqual(parsedEnv.success, true);
    assert.ok(typeof parsedEnv.result.engines === "object");
    assert.ok("pdflatex" in parsedEnv.result.engines);
    assert.ok("xelatex" in parsedEnv.result.engines);
    assert.ok("lualatex" in parsedEnv.result.engines);
  });
});


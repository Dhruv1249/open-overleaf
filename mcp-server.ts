import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), "projects");

const server = new Server(
  {
    name: "open-overleaf-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: "Lists all LaTeX projects stored in open-overleaf.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "read_project_file",
        description: "Reads a .tex or text file from an open-overleaf project.",
        inputSchema: {
          type: "object",
          properties: {
            projectName: { type: "string", description: "Name of the LaTeX project" },
            filePath: { type: "string", description: "Relative file path inside the project (e.g. main.tex)" },
          },
          required: ["projectName", "filePath"],
        },
      },
      {
        name: "write_project_file",
        description: "Writes or updates a .tex file in an open-overleaf project.",
        inputSchema: {
          type: "object",
          properties: {
            projectName: { type: "string", description: "Name of the LaTeX project" },
            filePath: { type: "string", description: "Relative file path inside project" },
            content: { type: "string", description: "Updated file content" },
          },
          required: ["projectName", "filePath", "content"],
        },
      },
      {
        name: "compile_project",
        description: "Triggers LaTeX compilation (xelatex / pdflatex) for an open-overleaf project.",
        inputSchema: {
          type: "object",
          properties: {
            projectName: { type: "string", description: "Name of the LaTeX project" },
            engine: { type: "string", description: "Compilation engine: pdflatex, xelatex, lualatex", default: "xelatex" },
          },
          required: ["projectName"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "list_projects") {
      if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
      }
      const files = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
      const projects = files.filter((f) => f.isDirectory()).map((f) => f.name);
      return {
        content: [{ type: "text", text: JSON.stringify({ projects }) }],
      };
    }

    if (name === "read_project_file") {
      const projectName = String(args?.projectName);
      const filePath = String(args?.filePath);
      const fullPath = path.join(PROJECTS_DIR, projectName, filePath);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    }

    if (name === "write_project_file") {
      const projectName = String(args?.projectName);
      const filePath = String(args?.filePath);
      const content = String(args?.content);
      const fullPath = path.join(PROJECTS_DIR, projectName, filePath);

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");

      return {
        content: [{ type: "text", text: `Successfully wrote ${filePath} in project ${projectName}` }],
      };
    }

    if (name === "compile_project") {
      const projectName = String(args?.projectName);
      const engine = String(args?.engine || "xelatex");
      const projectDir = path.join(PROJECTS_DIR, projectName);

      if (!fs.existsSync(projectDir)) {
        throw new Error(`Project directory not found: ${projectName}`);
      }

      const mainTex = path.join(projectDir, "main.tex");
      const texFile = fs.existsSync(mainTex) ? "main.tex" : "cv.tex";

      const command = `${engine} -interaction=nonstopmode -output-directory=${projectDir} ${path.join(projectDir, texFile)}`;
      const { stdout, stderr } = await execAsync(command);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "compiled",
              outputLog: stdout.slice(-1000),
              errors: stderr,
              pdfPath: path.join(projectDir, `${path.basename(texFile, ".tex")}.pdf`),
            }),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("MCP Server Error:", err);
  process.exit(1);
});

import * as fs from "fs";
import * as path from "path";
import { execFileAsync, getProjectsDir, resolveSafePath, commitPullAndPush } from "../git.ts";
import type { ToolDefinition } from "../types.ts";

export const envToolDefinitions: ToolDefinition[] = [
  {
    name: "get_compiler_environment",
    description: "Inspects the Overleaf LaTeX compilation environment. Returns available compiler engines (pdflatex, xelatex, lualatex), installed system fonts (via fc-list), and verifies whether specific LaTeX packages (.sty/.cls) or system fonts are installed.",
    inputSchema: {
      type: "object",
      properties: {
        queryFont: { type: "string", description: "Optional font family name to search for (e.g. 'Times', 'Liberation', 'Roboto', 'Arial')" },
        checkPackage: { type: "string", description: "Optional LaTeX package name to test for presence (e.g. 'microtype', 'biblatex', 'tikz')" },
      },
    },
  },
  {
    name: "get_user_profile",
    description: "Retrieves professional experience, skills, education, projects, or publications stored in the user profile.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the target LaTeX project" },
        format: { type: "string", enum: ["markdown", "json", "latex"], description: "Desired output format (default: markdown)" },
        section: { type: "string", enum: ["all", "summary", "skills", "experiences", "projects", "education", "contact", "links"], description: "Specific section to retrieve (default: all)" },
      },
    },
  },
  {
    name: "get_project_settings",
    description: "Retrieves compiler and project settings (engine, mainFile, rootFile) from .overleaf.json.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "update_project_settings",
    description: "Updates project settings (.overleaf.json) including default compilation engine and main file.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        settings: { type: "object", description: "Settings dictionary to store" },
      },
      required: ["projectName", "settings"],
    },
  },
];

function resolveDefaultProjectName(): string {
  const projectsDirectory = getProjectsDir();
  if (!fs.existsSync(projectsDirectory)) {
    return "job_applications";
  }
  const discoveredProjects = fs.readdirSync(projectsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);

  for (const candidateProject of discoveredProjects) {
    const profileFolder = path.join(projectsDirectory, candidateProject, "profile");
    if (fs.existsSync(profileFolder)) {
      return candidateProject;
    }
  }

  if (discoveredProjects.includes("job_applications")) {
    return "job_applications";
  }

  return discoveredProjects[0] || "job_applications";
}

function extractMarkdownSection(fullMarkdownContent: string, sectionKey: string): string {
  const sectionHeaderMapping: Record<string, string> = {
    summary: "## Professional Summary",
    skills: "## Core Skills & Technologies",
    experiences: "## Work Experience",
    projects: "## Technical Projects",
    education: "## Education & Academics",
    contact: "## Personal Information",
    links: "## Personal Information",
  };

  const targetHeader = sectionHeaderMapping[sectionKey.toLowerCase()];
  if (!targetHeader || !fullMarkdownContent.includes(targetHeader)) {
    return fullMarkdownContent;
  }

  const startingIndex = fullMarkdownContent.indexOf(targetHeader);
  const nextHeaderIndex = fullMarkdownContent.indexOf("\n## ", startingIndex + targetHeader.length);
  if (nextHeaderIndex !== -1) {
    return fullMarkdownContent.slice(startingIndex, nextHeaderIndex).trim();
  }
  return fullMarkdownContent.slice(startingIndex).trim();
}

export async function handleEnvTool(name: string, args: Record<string, any>): Promise<any> {
  if (name === "get_compiler_environment") {
    const queryFont = args?.queryFont ? String(args.queryFont).toLowerCase() : null;
    const checkPackage = args?.checkPackage ? String(args.checkPackage).replace(/\.sty$/, "") : null;

    // Check available LaTeX engines
    const engines: Record<string, boolean> = {
      pdflatex: fs.existsSync("/usr/bin/pdflatex") || fs.existsSync("/usr/local/bin/pdflatex"),
      xelatex: fs.existsSync("/usr/bin/xelatex") || fs.existsSync("/usr/local/bin/xelatex"),
      lualatex: fs.existsSync("/usr/bin/lualatex") || fs.existsSync("/usr/local/bin/lualatex"),
      latexmk: fs.existsSync("/usr/bin/latexmk") || fs.existsSync("/usr/local/bin/latexmk"),
    };

    // System tools
    const utilities: Record<string, boolean> = {
      pdftoppm: fs.existsSync("/usr/bin/pdftoppm"),
      pdfinfo: fs.existsSync("/usr/bin/pdfinfo"),
      convert: fs.existsSync("/usr/bin/convert"),
      chktex: fs.existsSync("/usr/bin/chktex"),
      texlab: fs.existsSync("/usr/local/bin/texlab") || fs.existsSync("/usr/bin/texlab"),
    };

    // Query fonts via fc-list
    let matchingFonts: string[] = [];
    let sampleFonts: string[] = [];
    try {
      const { stdout: fontList } = await execFileAsync("fc-list", [":", "family"]);
      const uniqueFamilies = Array.from(
        new Set(
          fontList
            .split("\n")
            .map((f) => f.trim().split(",")[0].trim())
            .filter(Boolean)
        )
      ).sort();

      if (queryFont) {
        matchingFonts = uniqueFamilies.filter((f) => f.toLowerCase().includes(queryFont));
      }
      sampleFonts = uniqueFamilies.slice(0, 40);
    } catch {
      sampleFonts = ["Standard TeX Live Fonts (Computer Modern, Latin Modern, TeX Gyre)"];
    }

    // Check package presence via kpsewhich
    let packageFound: boolean | undefined;
    let packagePath: string | undefined;
    if (checkPackage) {
      try {
        const { stdout: kpseOut } = await execFileAsync("kpsewhich", [`${checkPackage}.sty`]);
        packagePath = kpseOut.trim();
        packageFound = Boolean(packagePath);
      } catch {
        packageFound = false;
      }
    }

    return {
      engines,
      utilities,
      installedFontsCount: sampleFonts.length > 1 ? sampleFonts.length : undefined,
      sampleInstalledFonts: sampleFonts,
      ...(queryFont ? { queryFont, matchingFonts, fontFound: matchingFonts.length > 0 } : {}),
      ...(checkPackage ? { checkPackage, packageFound, packagePath: packagePath || undefined } : {}),
    };
  }

  if (name === "get_user_profile") {
    const requestedProject = args?.projectName ? String(args.projectName) : resolveDefaultProjectName();
    const outputFormat = String(args?.format || "markdown").toLowerCase();
    const targetSection = String(args?.section || "all").toLowerCase();

    const jsonProfilePath = resolveSafePath(requestedProject, "profile/profile.json");
    const markdownProfilePath = resolveSafePath(requestedProject, "profile/PROFILE.md");
    const markdownProfilePathLower = resolveSafePath(requestedProject, "profile/profile.md");
    const resolvedMarkdownPath = fs.existsSync(markdownProfilePath) ? markdownProfilePath : markdownProfilePathLower;
    const latexVariablesPath = resolveSafePath(requestedProject, "profile/profile_vars.tex");
    const latexVariablesPathAlt = resolveSafePath(requestedProject, "profile/profile.tex");
    const resolvedLatexPath = fs.existsSync(latexVariablesPath) ? latexVariablesPath : latexVariablesPathAlt;

    let parsedCandidateProfile: any = null;
    if (fs.existsSync(jsonProfilePath)) {
      try {
        parsedCandidateProfile = JSON.parse(fs.readFileSync(jsonProfilePath, "utf-8"));
      } catch (jsonParseError: any) {
        console.warn(`[MCP Server] Failed parsing profile.json: ${jsonParseError.message}`);
      }
    }

    if (outputFormat === "latex") {
      if (!fs.existsSync(resolvedLatexPath)) {
        throw new Error(`Profile LaTeX variables not found in project '${requestedProject}' at 'profile/profile_vars.tex'. Ensure candidate profile has been synchronized from Job-cruiser backend (POST /api/overleaf/sync-profile).`);
      }
      return {
        projectName: requestedProject,
        format: "latex",
        content: fs.readFileSync(resolvedLatexPath, "utf-8"),
      };
    }

    if (outputFormat === "json") {
      if (!parsedCandidateProfile) {
        throw new Error(`Profile JSON not found in project '${requestedProject}' at 'profile/profile.json'. Ensure candidate profile has been synchronized from Job-cruiser backend (POST /api/overleaf/sync-profile).`);
      }
      if (targetSection !== "all") {
        const sectionDataMapping: Record<string, any> = {
          summary: parsedCandidateProfile.bio_summary || parsedCandidateProfile.summary || "",
          skills: parsedCandidateProfile.skills || [],
          experiences: parsedCandidateProfile.experiences || [],
          projects: parsedCandidateProfile.projects || [],
          education: parsedCandidateProfile.education || [],
          contact: {
            name: parsedCandidateProfile.name,
            headline: parsedCandidateProfile.professional_headline,
            email: parsedCandidateProfile.email,
            phone: parsedCandidateProfile.phone,
            location: parsedCandidateProfile.location,
            country: parsedCandidateProfile.country,
          },
          links: {
            linkedin: parsedCandidateProfile.linkedin_url,
            github: parsedCandidateProfile.github_url,
            portfolio: parsedCandidateProfile.portfolio_url,
            customLinks: parsedCandidateProfile.custom_links,
          },
        };
        const resolvedSectionData = sectionDataMapping[targetSection] ?? parsedCandidateProfile[targetSection] ?? null;
        return {
          projectName: requestedProject,
          format: "json",
          section: targetSection,
          data: resolvedSectionData,
        };
      }
      return {
        projectName: requestedProject,
        format: "json",
        profile: parsedCandidateProfile,
      };
    }

    if (fs.existsSync(resolvedMarkdownPath)) {
      const completeMarkdownContent = fs.readFileSync(resolvedMarkdownPath, "utf-8");
      if (targetSection === "all") {
        return {
          projectName: requestedProject,
          format: "markdown",
          content: completeMarkdownContent,
        };
      }
      const filteredSectionMarkdown = extractMarkdownSection(completeMarkdownContent, targetSection);
      return {
        projectName: requestedProject,
        format: "markdown",
        section: targetSection,
        content: filteredSectionMarkdown,
      };
    }

    if (parsedCandidateProfile) {
      return {
        projectName: requestedProject,
        format: "json",
        note: "Markdown profile file not found; falling back to structured JSON profile.",
        profile: parsedCandidateProfile,
      };
    }

    throw new Error(`Candidate profile not found in project '${requestedProject}' (checked 'profile/PROFILE.md' and 'profile/profile.json'). Trigger a profile synchronization from Job-cruiser backend (POST /api/overleaf/sync-profile) to populate the experience bank.`);
  }

  if (name === "get_project_settings") {
    const projectName = String(args?.projectName);
    const settingsAbsolutePath = resolveSafePath(projectName, ".overleaf.json");
    if (!fs.existsSync(settingsAbsolutePath)) {
      return { settings: null };
    }
    try {
      const rawSettings = fs.readFileSync(settingsAbsolutePath, "utf-8");
      return { settings: JSON.parse(rawSettings) };
    } catch {
      return { settings: null };
    }
  }

  if (name === "update_project_settings") {
    const projectName = String(args?.projectName);
    const settings = args?.settings;
    if (!settings || typeof settings !== "object") {
      throw new Error("settings object required");
    }
    const settingsAbsolutePath = resolveSafePath(projectName, ".overleaf.json");
    fs.mkdirSync(path.dirname(settingsAbsolutePath), { recursive: true });
    fs.writeFileSync(settingsAbsolutePath, JSON.stringify(settings, null, 2), "utf-8");
    await commitPullAndPush(`mcp: update settings for ${projectName}`);
    return { message: `Settings updated for project ${projectName}` };
  }

  throw new Error(`Unknown env tool: ${name}`);
}

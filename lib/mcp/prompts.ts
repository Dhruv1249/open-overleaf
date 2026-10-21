/**
 * Prompts supported by the Open-Overleaf MCP server.
 */

export const promptDefinitions = [
  {
    name: "tailor_resume",
    description: "Step-by-step guided prompt to tailor a 1-page ATS LaTeX resume against a target job description.",
    arguments: [
      { name: "companyName", description: "Target company name", required: true },
      { name: "jobTitle", description: "Target job title", required: true },
      { name: "jobDescription", description: "Target job description or requirements", required: true },
      { name: "projectName", description: "Project directory name (default: job_applications)", required: false },
    ],
  },
  {
    name: "tailor_cover_letter",
    description: "Step-by-step guided prompt to generate a tailored LaTeX cover letter.",
    arguments: [
      { name: "companyName", description: "Target company name", required: true },
      { name: "jobTitle", description: "Target job title", required: true },
      { name: "jobDescription", description: "Target job description or requirements", required: true },
      { name: "hiringManager", description: "Name of hiring manager or team", required: false },
      { name: "projectName", description: "Project directory name (default: job_applications)", required: false },
    ],
  },
  {
    name: "fix_compilation_error",
    description: "Guided prompt to inspect LaTeX compilation logs, run syntax diagnostics, and patch compilation errors.",
    arguments: [
      { name: "projectName", description: "Project directory name (default: job_applications)", required: true },
      { name: "entryFile", description: "Target tex file path that failed compilation", required: true },
      { name: "errorLog", description: "Compilation log snippet or error message", required: false },
    ],
  },
  {
    name: "review_candidate_profile",
    description: "Inspects and reviews the candidate's complete background, experience bank, and skills.",
    arguments: [
      { name: "projectName", description: "Project directory name (default: job_applications)", required: false },
      { name: "targetRole", description: "Target career role to evaluate profile alignment against", required: false },
    ],
  },
];

export function handleGetPrompt(name: string, promptArgs?: Record<string, any>) {
  if (name === "tailor_resume") {
    const company = promptArgs?.companyName || "Target Company";
    const role = promptArgs?.jobTitle || "Target Role";
    const jd = promptArgs?.jobDescription || "";
    const project = promptArgs?.projectName || "job_applications";

    return {
      description: `Tailoring resume for ${role} at ${company}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are an expert LaTeX resume engineer and career strategist. Your goal is to generate an ATS-compliant, strictly 1-page LaTeX resume tailored for the position of "${role}" at "${company}".

TARGET JOB DETAILS:
- Company: ${company}
- Role: ${role}
- Project: ${project}
- Job Description:
${jd}

EXECUTION INSTRUCTIONS:
1. Retrieve Candidate Profile:
   Call get_user_profile(projectName="${project}", format="markdown") to read the candidate's complete verified background.
   CRITICAL: Never invent experience, metrics, or degrees. All factual accomplishments must derive from this profile.

2. Inspect Baseline Template:
   Call read_project_file(projectName="${project}", filePath="templates/resume.tex") to inspect formatting macros, packages, and layout geometry.

3. Align & Tailor Content:
   - Identify top hard skills, libraries, domain keywords, and responsibilities emphasized in the JD.
   - Select the candidate's strongest matching experiences and technical projects.
   - Reorder and emphasize bullet points to highlight direct relevance to the JD requirements.
   - Escape all LaTeX special characters (\\%, \\&, \\_, \\$, \\#, \\textasciitilde{}, etc.).

4. Write Tailored Document:
   Construct the full LaTeX document preserving the template preamble, and call write_project_file(projectName="${project}", filePath="job_applications/${company.toLowerCase()}_${role.toLowerCase().replace(/\\s+/g, '_')}/resume.tex", content=...).

5. Compile & Verify 1-Page Constraint:
   Call compile_project(projectName="${project}", engine="xelatex", entryFile="job_applications/${company.toLowerCase()}_${role.toLowerCase().replace(/\\s+/g, '_')}/resume.tex").
   - If compileResult.pageCount > 1: tighten vertical spacing (\\vspace{-2pt}), reduce margins slightly, or condense bullet points until pageCount is exactly 1.
   - If compilation fails: call get_compilation_log to inspect error lines, and use apply_patch to fix syntax errors.

Begin by calling get_user_profile now.`,
          },
        },
      ],
    };
  }

  if (name === "tailor_cover_letter") {
    const company = promptArgs?.companyName || "Target Company";
    const role = promptArgs?.jobTitle || "Target Role";
    const jd = promptArgs?.jobDescription || "";
    const hiringManager = promptArgs?.hiringManager || "Hiring Team";
    const project = promptArgs?.projectName || "job_applications";

    return {
      description: `Tailoring cover letter for ${role} at ${company}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are an expert executive cover letter writer. Your goal is to draft a personalized, compelling 3-4 paragraph LaTeX cover letter for "${role}" at "${company}".

TARGET JOB DETAILS:
- Company: ${company}
- Role: ${role}
- Hiring Manager/Team: ${hiringManager}
- Project: ${project}
- Job Description:
${jd}

EXECUTION INSTRUCTIONS:
1. Retrieve Candidate Profile:
   Call get_user_profile(projectName="${project}", format="markdown") to understand the candidate's core background, recent achievements, and career narrative.

2. Inspect Cover Letter Template:
   Call read_project_file(projectName="${project}", filePath="templates/cover_letter.tex") to review letterhead styling and contact macro definitions.

3. Structure the Letter:
   - Opening Paragraph: Express direct enthusiasm for the ${role} role at ${company}. Reference what excites the candidate about the company's product or mission.
   - Middle 1-2 Paragraphs: Highlight 2 specific past achievements from the candidate profile that directly solve problems or fulfill technical requirements mentioned in the JD.
   - Closing Paragraph: Reiterate enthusiasm, state availability for interviews, and provide a polite sign-off.
   - Maintain professional, authentic tone. Avoid generic buzzwords.

4. Write & Compile:
   Call write_project_file to save the document at "job_applications/${company.toLowerCase()}_${role.toLowerCase().replace(/\\s+/g, '_')}/cover_letter.tex", then call compile_project with engine="xelatex".

Begin by calling get_user_profile now.`,
          },
        },
      ],
    };
  }

  if (name === "fix_compilation_error") {
    const project = promptArgs?.projectName || "job_applications";
    const entryFile = promptArgs?.entryFile || "resume.tex";
    const errorLog = promptArgs?.errorLog || "";

    return {
      description: `Diagnosing and repairing LaTeX compilation error for ${entryFile}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are an expert LaTeX compiler and debugging specialist. The document "${entryFile}" in project "${project}" failed to compile.

Provided Error Information:
${errorLog || "No snippet provided. Please fetch from compilation log."}

EXECUTION INSTRUCTIONS:
1. Retrieve Compilation Log:
   Call get_compilation_log(projectName="${project}") to inspect the exact failure line number and error message.

2. Inspect Source Lines:
   Call read_file_lines(projectName="${project}", filePath="${entryFile}", startLine=1, endLine=100) around the reported error line.

3. Run Syntax Diagnostics:
   Call validate_tex(projectName="${project}", filePath="${entryFile}") to check for chktex syntax warnings, unmatched delimiters, or unescaped characters.

4. Diagnose Common LaTeX Issues:
   - Unescaped special characters: %, &, _, $, #, ~, ^
   - Missing closing braces or brackets: { } [ ]
   - Unmatched environments: \\begin{...} without corresponding \\end{...}
   - Undefined control sequence (missing package or misspelled macro)
   - Paragraph ended before \\... was complete (blank line inside macro argument)

5. Apply Surgical Fix:
   Call apply_patch with targeted line replacements. Do NOT overwrite the entire file with write_project_file if a localized patch suffices.

6. Recompile & Verify:
   Call compile_project(projectName="${project}", engine="xelatex", entryFile="${entryFile}") to ensure compilation succeeds with zero errors.

Begin by inspecting the compilation log or file lines now.`,
          },
        },
      ],
    };
  }

  if (name === "review_candidate_profile") {
    const project = promptArgs?.projectName || "job_applications";
    const targetRole = promptArgs?.targetRole || "";

    return {
      description: `Reviewing candidate profile in ${project}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a principal technical recruiter and career coach. Review the candidate's experience bank in project "${project}"${targetRole ? ` against the target role of "${targetRole}"` : ""}.

EXECUTION INSTRUCTIONS:
1. Call get_user_profile(projectName="${project}", format="markdown") to retrieve the candidate experience bank.
2. Evaluate:
   - Depth and breadth of Core Skills & Tech Stack.
   - Impact metrics and quantifiable results in Work Experience bullets (e.g. latency, throughput, scale, revenue).
   - Technical Projects complexity, live deployment status, and source code availability.
   - Any skill or narrative gaps${targetRole ? ` when aiming for ${targetRole}` : ""}.
3. Provide a structured, actionable critique with recommendations for bullet rephrasing and template optimization.

Begin by calling get_user_profile now.`,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown MCP prompt requested: ${name}`);
}

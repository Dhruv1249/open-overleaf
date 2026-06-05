import { NextResponse } from "next/server";
import { listTopLevelDirectories, readFileAtPath } from "../../../lib/github";

export async function GET(req: Request) {
  try {
    const dirs = await listTopLevelDirectories(req);
    const projects = [];
    for (const d of dirs) {
      // try to read a project manifest at `${d.name}/.open-overleaf/project.json`
      const manifestPath = `${d.name}/.open-overleaf/project.json`;
      let manifest = null;
      try {
        const content = await readFileAtPath(manifestPath, req);
        if (content) manifest = JSON.parse(content);
      } catch (e) {
        // ignore
      }
      projects.push({ name: d.name, manifest });
    }
    return NextResponse.json({ projects });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { writeLocalFileBuffer, commitPullAndPush, resolveSafeProjectPath } from "@/lib/git";

/**
 * POST /api/projects/[name]/upload
 * Content-Type: multipart/form-data
 *
 * Fields:
 *   files[]    — one or more File objects (text or binary)
 *   targetDir  — optional subdirectory inside the project (e.g. "images")
 *
 * Each file is written to the local git working tree and then committed and pushed.
 * Response: { ok: true, results: [{ path, ok, error? }] }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;
  const authResult = requireSession(req as unknown as Request);
  if ("error" in authResult) return authResult.error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: `Bad form data: ${error.message}` }, { status: 400 });
  }

  const targetDir = ((formData.get("targetDir") as string) ?? "").replace(/^\/|\/$/g, "");
  const files = formData.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });
  }

  const results: { path: string; ok: boolean; error?: string }[] = [];

  for (const file of files) {
    const relativePath = ((file as any).webkitRelativePath as string | undefined) || file.name;
    const safePath = relativePath.replace(/\.\./g, "_").replace(/^\//, "");
    const projectRelativePath = targetDir ? `${targetDir}/${safePath}` : safePath;

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const absolutePath = resolveSafeProjectPath(project, projectRelativePath);
      writeLocalFileBuffer(absolutePath, buffer);
      results.push({ path: safePath, ok: true });
    } catch (error: any) {
      results.push({ path: safePath, ok: false, error: error.message });
    }
  }

  const successCount = results.filter((result) => result.ok).length;
  if (successCount > 0) {
    try {
      await commitPullAndPush(`feat: upload ${successCount} file(s) to ${project}/${targetDir || ""}`);
    } catch (pushError: any) {
      return NextResponse.json(
        { ok: false, error: `Files written locally but git push failed: ${pushError.message}`, results },
        { status: 500 }
      );
    }
  }

  const allOk = results.every((result) => result.ok);
  return NextResponse.json({ ok: allOk, results });
}

import { isCompanyId } from "@/lib/companies";
import type { PublicCareers } from "@/lib/careers";
import { getProfile, listJobs } from "@/lib/server/site";

// GET ?co=<company> — public: the company profile and its open job posts for
// the careers page (lib/server/site.ts). Drafts, closed posts and everything
// else stay private.
export async function GET(request: Request) {
  const co = new URL(request.url).searchParams.get("co");
  if (!isCompanyId(co)) return Response.json({ error: "Unknown company." }, { status: 400 });
  const [profile, jobs] = await Promise.all([getProfile(co), listJobs(co)]);
  const body: PublicCareers = { company: co, profile, jobs };
  return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}

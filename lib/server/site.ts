import "server-only";
import { COMPANY_ORDER, isCompanyReady, type CompanyId } from "@/lib/companies";
import { toProfile, type CompanyProfile, type PublicJob } from "@/lib/careers";
import { getAdminClient } from "@/lib/server/supabase-admin";

// The public website's data (supabase/migrate_phase84_careers.sql), read on
// the server with each company's service key. Only published news, open jobs
// and the profile leave the server.

export interface NewsCard {
  co: CompanyId;
  id: string;
  title: string;
  summary: string;
  date: string | null;
  cover: string | null;
}
export interface NewsArticle extends NewsCard {
  body: string;
}

const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // Manila
export const readyCompanies = () => COMPANY_ORDER.filter((c) => isCompanyReady(c));

function admin(co: CompanyId) {
  try {
    return getAdminClient(co);
  } catch {
    return null;
  }
}

export async function getProfile(co: CompanyId): Promise<CompanyProfile | null> {
  const a = admin(co);
  if (!a) return null;
  const { data } = await a.from("company_profile").select("*").maybeSingle();
  return data ? toProfile(data) : null;
}

export async function listJobs(co: CompanyId): Promise<PublicJob[]> {
  const a = admin(co);
  if (!a) return [];
  const [posts, branches, departments] = await Promise.all([
    a
      .from("job_posts")
      .select("*")
      .eq("status", "open")
      .order("posted_at", { ascending: false }),
    a.from("branches").select("id, name"),
    a.from("departments").select("id, name"),
  ]);
  const name = (rows: { id: string; name: string }[] | null, id: unknown) => (typeof id === "string" ? (rows ?? []).find((r) => r.id === id)?.name : undefined);
  const t = today();
  return ((posts.data as Record<string, unknown>[] | null) ?? [])
    .filter((r) => !r.closes_on || String(r.closes_on) >= t)
    .map((r) => ({
      id: String(r.id),
      title: String(r.title),
      place:
        String(r.location ?? "").trim() ||
        [name(branches.data, r.branch_id), name(departments.data, r.department_id)].filter((x) => x && !/unassigned/i.test(x)).join(" · "),
      employmentType: (r.employment_type as PublicJob["employmentType"]) ?? null,
      slots: Number(r.slots ?? 1),
      summary: String(r.summary ?? ""),
      responsibilities: String(r.responsibilities ?? ""),
      qualifications: String(r.qualifications ?? ""),
      benefits: String(r.benefits ?? ""),
      closesOn: (r.closes_on as string | null) ?? null,
      postedAt: (r.posted_at as string | null) ?? null,
      banner: coverUrl(co, r.banner_photo_path),
    }));
}

// A photo in the public company-media bucket.
export const mediaUrl = (co: CompanyId, path: unknown) => coverUrl(co, path);
const coverUrl = (co: CompanyId, path: unknown) => {
  if (typeof path !== "string" || !path) return null;
  const a = admin(co);
  return a ? a.storage.from("company-media").getPublicUrl(path).data.publicUrl : null;
};
const toCard = (co: CompanyId, r: Record<string, unknown>): NewsCard => ({
  co,
  id: String(r.id),
  title: String(r.title ?? ""),
  summary: String(r.summary ?? ""),
  date: (r.published_on as string | null) ?? null,
  cover: coverUrl(co, r.cover_path),
});

// Published news, newest first: one company's, or every company's together.
export async function listNews(which: CompanyId | "all", page: number, per: number): Promise<{ items: NewsCard[]; total: number }> {
  const cos = which === "all" ? readyCompanies() : [which];
  const take = page * per;
  const parts = await Promise.all(
    cos.map(async (co) => {
      const a = admin(co);
      if (!a) return { items: [] as NewsCard[], total: 0 };
      const { data, count } = await a
        .from("news_posts")
        .select("id, title, summary, published_on, cover_path, created_at", { count: "exact" })
        .eq("status", "published")
        .order("published_on", { ascending: false })
        .order("created_at", { ascending: false })
        .range(0, take - 1);
      return { items: ((data as Record<string, unknown>[] | null) ?? []).map((r) => toCard(co, r)), total: count ?? 0 };
    }),
  );
  const all = parts.flatMap((p) => p.items).sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
  return { items: all.slice((page - 1) * per, take), total: parts.reduce((t, p) => t + p.total, 0) };
}

export async function getNews(co: CompanyId, id: string): Promise<NewsArticle | null> {
  const a = admin(co);
  if (!a || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await a.from("news_posts").select("id, title, summary, body, published_on, cover_path").eq("id", id).eq("status", "published").maybeSingle();
  return data ? { ...toCard(co, data), body: String(data.body ?? "") } : null;
}

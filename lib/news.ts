import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";

// Newsroom (supabase/migrate_phase84_careers.sql): HR writes news and press
// releases; published ones appear on the public website (/news). Cover photos
// go in the public company-media bucket.

export interface NewsPost {
  id: string;
  status: "draft" | "published";
  title: string;
  summary: string;
  body: string;
  coverPath: string | null;
  photoPaths: string[]; // up to 10, the article's gallery (phase 89)
  publishedOn: string | null;
  updatedAt: string;
}
export type NewsPatch = Partial<Pick<NewsPost, "status" | "title" | "summary" | "body" | "coverPath" | "photoPaths" | "publishedOn">>;

type Row = Record<string, unknown>;
const db = () => getSupabaseClient() as unknown as SupabaseClient;
const media = () => db().storage.from("company-media");
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(/news_posts/i.test(e.message) && /exist|find|not found|schema cache/i.test(e.message) ? "The Newsroom isn't set up yet — ask HR to run the latest database update." : e.message);
};
const toPost = (r: Row): NewsPost => ({
  id: String(r.id),
  status: r.status as NewsPost["status"],
  title: String(r.title ?? ""),
  summary: String(r.summary ?? ""),
  body: String(r.body ?? ""),
  coverPath: (r.cover_path as string | null) ?? null,
  photoPaths: Array.isArray(r.photo_paths) ? (r.photo_paths as string[]) : [],
  publishedOn: (r.published_on as string | null) ?? null,
  updatedAt: String(r.updated_at ?? ""),
});
const toRow = (p: NewsPatch): Row => {
  const m: Record<keyof NewsPatch, string> = { status: "status", title: "title", summary: "summary", body: "body", coverPath: "cover_path", photoPaths: "photo_paths", publishedOn: "published_on" };
  return Object.fromEntries(
    Object.entries(p)
      .filter(([k]) => k in m)
      .map(([k, v]) => [m[k as keyof NewsPatch], v === "" && k === "publishedOn" ? null : v]),
  );
};

export async function fetchNewsPosts(): Promise<NewsPost[]> {
  const { data, error } = await db().from("news_posts").select("*").order("updated_at", { ascending: false });
  fail(error);
  return ((data as Row[]) ?? []).map(toPost);
}
export async function createNewsPost(p: NewsPatch): Promise<string> {
  const { data, error } = await db().from("news_posts").insert(toRow(p)).select("id").single();
  fail(error);
  return String((data as Row).id);
}
export async function updateNewsPost(id: string, p: NewsPatch): Promise<void> {
  const { error } = await db().from("news_posts").update(toRow(p)).eq("id", id);
  fail(error);
}
export async function deleteNewsPost(p: NewsPost): Promise<void> {
  const files = [p.coverPath, ...p.photoPaths].filter((x): x is string => !!x);
  if (files.length) await media().remove(files);
  const { error } = await db().from("news_posts").delete().eq("id", p.id);
  fail(error);
}

export const MAX_NEWS_PHOTOS = 10;
export const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
export async function uploadCover(file: File): Promise<string> {
  return uploadImage(file, "news");
}
// A public photo (news covers, the company homepage, the founder).
export async function uploadImage(file: File, folder: "news" | "profile" | "jobs"): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP photo.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Photos up to 5 MB.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await media().upload(path, file, { contentType: file.type });
  fail(error);
  return path;
}
export async function removeCover(path: string): Promise<void> {
  await media().remove([path]);
}
export const coverUrl = (path: string | null) => (path ? media().getPublicUrl(path).data.publicUrl : null);

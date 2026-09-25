import { getSupabaseClient } from "./client";

// Comments and reactions on Bulletin Board announcements
// (supabase/migrate_phase14_announcement_comments_reactions.sql).

export type ReactionKind = "like" | "heart" | "celebrate";

export interface AnnouncementComment {
  id: string;
  announcementId: string;
  employeeId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface AnnouncementReaction {
  announcementId: string;
  employeeId: string;
  reaction: ReactionKind;
}

export async function fetchBulletinInteractions(): Promise<{ comments: AnnouncementComment[]; reactions: AnnouncementReaction[] }> {
  const client = getSupabaseClient();
  const [c, r] = await Promise.all([
    client.from("announcement_comments").select("*").order("created_at", { ascending: true }),
    client.from("announcement_reactions").select("announcement_id, employee_id, reaction"),
  ]);
  if (c.error) throw c.error;
  if (r.error) throw r.error;
  return {
    comments: c.data.map((row) => ({
      id: row.id,
      announcementId: row.announcement_id,
      employeeId: row.employee_id,
      authorName: row.author_name,
      body: row.body,
      createdAt: row.created_at,
    })),
    reactions: r.data.map((row) => ({ announcementId: row.announcement_id, employeeId: row.employee_id, reaction: row.reaction })),
  };
}

export async function insertComment(announcementId: string, employeeId: string, body: string): Promise<AnnouncementComment> {
  const { data, error } = await getSupabaseClient()
    .from("announcement_comments")
    .insert({ announcement_id: announcementId, employee_id: employeeId, body })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, announcementId: data.announcement_id, employeeId: data.employee_id, authorName: data.author_name, body: data.body, createdAt: data.created_at };
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("announcement_comments").delete().eq("id", id);
  if (error) throw error;
}

// Sets (or, with null, removes) the employee's one reaction on a post.
export async function setReaction(announcementId: string, employeeId: string, reaction: ReactionKind | null): Promise<void> {
  const table = getSupabaseClient().from("announcement_reactions");
  const { error } =
    reaction === null
      ? await table.delete().eq("announcement_id", announcementId).eq("employee_id", employeeId)
      : await table.upsert({ announcement_id: announcementId, employee_id: employeeId, reaction }, { onConflict: "announcement_id,employee_id" });
  if (error) throw error;
}

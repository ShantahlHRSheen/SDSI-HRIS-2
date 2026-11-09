import { isCompanyId } from "@/lib/companies";
import { RESUME_MAX_BYTES } from "@/lib/careers";
import { getAdminClient } from "@/lib/server/supabase-admin";

// POST (multipart form) — public: someone outside the company applies for an
// open job post. Checked here, then added to Hiring & Onboarding as an
// applicant (source "online", status "screening") with the resume in the
// private hiring-files bucket. Visitors never get database access.
//
// Fields: co, jobId, name, email, phone, address, coverLetter, consent ("yes"),
// resume (file), website (left empty by people; filled by bots).

const MAX_PER_HOUR = 100; // per company, all posts
const recent = new Map<string, number[]>(); // best effort, per server instance
const bad = (error: string, status = 400) => Response.json({ error }, { status });
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");

// What the file really is, from its first bytes — not its name.
function sniff(b: Uint8Array): { type: string; ext: string } | null {
  const starts = (...xs: number[]) => xs.every((x, i) => b[i] === x);
  if (starts(0x25, 0x50, 0x44, 0x46)) return { type: "application/pdf", ext: "pdf" };
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { type: "image/png", ext: "png" };
  if (starts(0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (starts(0x50, 0x4b, 0x03, 0x04)) return { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
  if (starts(0xd0, 0xcf, 0x11, 0xe0)) return { type: "application/msword", ext: "doc" };
  return null;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (hits.length >= 5) return bad("Too many applications from here. Please try again later.", 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("The application couldn't be read. If your resume is large, try a smaller file (up to 4 MB).");
  }
  const co = form.get("co");
  if (!isCompanyId(co)) return bad("Unknown company.");
  // Bots fill every field; people never see this one.
  if (text(form.get("website"), 200)) return Response.json({ ok: true });

  const name = text(form.get("name"), 100).replace(/\s+/g, " ");
  const email = text(form.get("email"), 200).toLowerCase();
  const phone = text(form.get("phone"), 30);
  const address = text(form.get("address"), 300);
  const coverLetter = text(form.get("coverLetter"), 4000);
  const jobId = text(form.get("jobId"), 64);
  if (name.length < 2) return bad("Type your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad("Type a valid email address.");
  if (!/^[0-9+()\-\s]{7,30}$/.test(phone)) return bad("Type a valid contact number.");
  if (address.length < 3) return bad("Type your address.");
  if (form.get("consent") !== "yes") return bad("Please agree to the data privacy consent.");

  const resume = form.get("resume");
  if (!(resume instanceof File) || resume.size === 0) return bad("Attach your resume.");
  if (resume.size > RESUME_MAX_BYTES) return bad("Your resume is too large. Up to 4 MB, please.");
  const bytes = new Uint8Array(await resume.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return bad("Your resume must be a PDF, Word document or a photo (JPG or PNG).");

  let admin;
  try {
    admin = getAdminClient(co);
  } catch {
    return bad("Applications for this company aren't open yet.", 503);
  }
  const { data: job } = await admin.from("job_posts").select("id, title, status, closes_on, branch_id, department_id, requisition_id").eq("id", jobId).maybeSingle();
  if (!job || job.status !== "open" || (job.closes_on && String(job.closes_on) < today())) return bad("This job is no longer open.", 404);

  const dayAgo = new Date(now - 24 * 3600_000).toISOString();
  const { count: dup } = await admin.from("applicants").select("id", { count: "exact", head: true }).eq("job_post_id", job.id).ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)).gte("created_at", dayAgo);
  if ((dup ?? 0) > 0) return bad("You've already applied for this job. We'll contact you — thank you!", 409);
  const hourAgo = new Date(now - 3600_000).toISOString();
  const { count: lastHour } = await admin.from("applicants").select("id", { count: "exact", head: true }).eq("source", "online").gte("created_at", hourAgo);
  if ((lastHour ?? 0) >= MAX_PER_HOUR) return bad("We're receiving many applications right now. Please try again in an hour.", 429);

  const { data: created, error } = await admin
    .from("applicants")
    .insert({
      name,
      email,
      contact_number: phone,
      address,
      position: job.title,
      branch_id: job.branch_id,
      department_id: job.department_id,
      requisition_id: job.requisition_id,
      job_post_id: job.id,
      source: "online",
      cover_letter: coverLetter,
      privacy_consent_at: new Date().toISOString(),
      status: "screening",
    })
    .select("id")
    .single();
  if (error || !created) return bad("Your application couldn't be sent. Please try again.", 500);

  const safe = name.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60) || "applicant";
  const { error: upErr } = await admin.storage.from("hiring-files").upload(`${created.id}/${now}-resume-${safe}_resume.${kind.ext}`, bytes, { contentType: kind.type });
  if (upErr) {
    await admin.from("applicants").delete().eq("id", created.id);
    return bad("Your resume couldn't be uploaded. Please try again.", 500);
  }
  hits.push(now);
  recent.set(ip, hits);
  return Response.json({ ok: true });
}

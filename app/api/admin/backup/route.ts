import { getAdminClient, getCaller } from "@/lib/server/supabase-admin";

// Full database backup for HR (hr_admin only), downloaded in pieces so it
// works however large the data grows (a single response is size-limited):
//
//   POST {}                          → { tables: [{ name, orderBy }] }
//   POST { table, orderBy, offset }  → { rows, done }   (500 rows per call)
//   POST { finished: rowCount }      → records the backup in the audit log
//
// Tables are discovered from the database itself, so new tables are
// included automatically. Uses the service role (never sent to the browser)
// so nothing is hidden by row-level security.

const PAGE = 500;
const NAME = /^[a-z_][a-z0-9_]*$/;

type Definition = { properties?: Record<string, { description?: string }> };

async function listTables(): Promise<{ name: string; orderBy: string[] }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't list tables (${res.status}).`);
  const spec = (await res.json()) as { definitions?: Record<string, Definition> };
  return Object.entries(spec.definitions ?? {})
    .filter(([name]) => NAME.test(name))
    .map(([name, def]) => {
      const props = Object.entries(def.properties ?? {});
      // Primary-key columns give a stable order for paging.
      const pk = props.filter(([, p]) => p.description?.includes("<pk/>")).map(([col]) => col);
      return { name, orderBy: pk.length ? pk : props.slice(0, 1).map(([col]) => col) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = getAdminClient();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  const caller = await getCaller(request, admin);
  if (!caller) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!caller.employee?.roles.includes("hr_admin")) return Response.json({ error: "Only HR can download a backup." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { table?: unknown; orderBy?: unknown; offset?: unknown; finished?: unknown };

  if (typeof body.finished === "number") {
    const { data: me } = await admin.from("employees").select("first_name, last_name").eq("id", caller.employee.id).maybeSingle();
    await admin.from("audit_logs").insert({
      actor_employee_id: caller.employee.id,
      actor_name: me ? `${me.last_name} - ${me.first_name}` : (caller.user.email ?? "HR"),
      module: "Backup",
      action: "export",
      description: `Downloaded full backup (${body.finished} rows)`,
    });
    return Response.json({ ok: true });
  }

  if (body.table === undefined) {
    try {
      return Response.json({ tables: await listTables() });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  const table = typeof body.table === "string" ? body.table : "";
  const orderBy = Array.isArray(body.orderBy) ? body.orderBy.filter((c): c is string => typeof c === "string" && NAME.test(c)) : [];
  const offset = typeof body.offset === "number" && body.offset >= 0 ? Math.floor(body.offset) : 0;
  if (!NAME.test(table)) return Response.json({ error: "Unknown table." }, { status: 400 });

  let query = admin.from(table).select("*");
  for (const col of orderBy) query = query.order(col, { ascending: true });
  const { data, error } = await query.range(offset, offset + PAGE - 1);
  if (error) return Response.json({ error: `${table}: ${error.message}` }, { status: 500 });
  return Response.json({ rows: data, done: data.length < PAGE });
}

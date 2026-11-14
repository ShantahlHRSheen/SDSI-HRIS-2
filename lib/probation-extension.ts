import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";

// Extension of Probationary Employment (supabase/migrate_phase90_probation_extension.sql,
// phases 91 and 94): HR prepares, signs and sends the notice, and the employee
// gets it right away to read and sign the CONFORME. The Department Head
// ("Noted by") and the Chairman ("Approved by") are printed on the letter
// only; they don't sign. The letter's wording is built from the details below
// (peBlocks), the same for the on-screen letter and the printed PDF.

export type PeStatus = "hr" | "noted" | "approved" | "employee" | "done";
export type PeSigner = "hr" | "noted" | "approved" | "employee";

export interface PeScore {
  criteria: string;
  weight: number; // percent
  score: number;
}
export interface PeStandard {
  title: string;
  text: string;
}

export interface PeData {
  letterDate: string; // YYYY-MM-DD
  employeeName: string; // "CHARM JIREH RIVERA"
  salutation: string; // "Ms. Rivera"
  female: boolean;
  position: string;
  department: string;
  employerName: string; // "Shantahl Direct Sales Inc."
  hiredOn: string;
  probationEnds: string;
  evalDate: string;
  scores: PeScore[];
  passingScore: number;
  remarks: string; // what the Department Head noted, and why the extension
  extendFrom: string;
  extendTo: string;
  standards: PeStandard[];
  reevalBy: string;
  closing: string;
  hrName: string;
  hrTitle: string;
  notedName: string;
  notedTitle: string;
  approverName: string;
  approverTitle: string;
}

export interface ProbationExtension {
  id: string;
  employeeId: string;
  employeeName: string;
  status: PeStatus;
  data: PeData;
  createdAt: string;
  hrName: string | null;
  hrSignedAt: string | null;
  notedId: string | null;
  notedName: string | null;
  notedAt: string | null;
  approverId: string | null;
  approverName: string | null;
  approvedAt: string | null;
  returnedNote: string | null;
  returnedBy: string | null;
  returnedAt: string | null;
  receivedAt: string | null;
}

export const peTotal = (d: PeData) => Math.round(d.scores.reduce((t, s) => t + (Number(s.score) || 0), 0) * 100) / 100;
export const pePassed = (d: PeData) => peTotal(d) >= d.passingScore;

export function peStatusLabel(r: ProbationExtension): { label: string; tone: "warning" | "good" | "info" | "critical" } {
  if (r.status === "done") return { label: "Signed by the employee", tone: "good" };
  if (r.status === "hr") return r.returnedNote ? { label: "Returned to HR", tone: "critical" } : { label: "Draft — HR to send", tone: "warning" };
  return { label: "Sent · waiting for the employee to sign", tone: "info" };
}

// What the signed-in person still has to sign on it, if anything. Only HR
// and the employee sign (phase 94): "Noted by" and "Approved by" are printed
// names only.
export function peMyPart(r: ProbationExtension, me: string | undefined): Exclude<PeSigner, "hr"> | null {
  return !!me && r.status === "employee" && r.employeeId === me ? "employee" : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : "__________");
const dayAfter = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  if (isNaN(+t)) return "";
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};
const plusMonth = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  if (isNaN(+t)) return "";
  t.setUTCMonth(t.getUTCMonth() + 1);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};

export const DEFAULT_STANDARDS: PeStandard[] = [
  {
    title: "Conduct during office hours",
    text: "Do not use company time or equipment for personal or unauthorized activities, including playing mobile games, browsing social media and watching movies.",
  },
  { title: "Following instructions", text: "Follow the instructions of your superiors and company officers promptly and completely." },
  { title: "Workplace relations", text: "Avoid gossip and negative rumors, and do not get involved in fights or conflicts in the workplace." },
  { title: "Productivity and accuracy", text: "Use all office hours for your assigned tasks and make sure your outputs are accurate." },
];

// The draft HR starts from.
export function draftPeData(input: {
  employee: { firstName: string; lastName: string; gender?: string | null; dateHired?: string | null };
  position: string;
  department: string;
  employerName: string;
  today: string;
  hrName: string;
  notedName: string;
  approverName: string;
}): PeData {
  const e = input.employee;
  const female = e.gender === "Female";
  const probationEnds = "";
  return {
    letterDate: input.today,
    employeeName: [e.firstName, e.lastName].filter((x) => x?.trim()).join(" ").toUpperCase(),
    salutation: `${female ? "Ms." : "Mr."} ${e.lastName.charAt(0).toUpperCase()}${e.lastName.slice(1).toLowerCase()}`,
    female,
    position: input.position,
    department: input.department,
    employerName: input.employerName,
    hiredOn: e.dateHired ?? "",
    probationEnds,
    evalDate: "",
    scores: [
      { criteria: "Behavior (rated by HR)", weight: 10, score: 0 },
      { criteria: "Job Performance (rated by the Department Head)", weight: 10, score: 0 },
      { criteria: "Sales", weight: 80, score: 0 },
    ],
    passingScore: 90,
    remarks:
      "Your Department Head noted your strengths, and the Company values them. Because of them, and in fairness to you, Management has decided to give you another chance to show the improvement needed for regularization instead of ending your probationary employment.",
    extendFrom: "",
    extendTo: "",
    standards: DEFAULT_STANDARDS,
    reevalBy: "",
    closing:
      "We hope you will take this opportunity seriously and show the improvement we know you are capable of. If you have any questions about this letter or the standards above, please approach HR.",
    hrName: input.hrName,
    hrTitle: "HR Manager",
    notedName: input.notedName,
    notedTitle: input.department ? `Department Head, ${input.department}` : "Department Head",
    approverName: input.approverName,
    approverTitle: "Chairman of the Board",
  };
}

// When the probation end date is set, the extension starts the next day and
// runs a month unless HR changes it.
export function withProbationEnd(d: PeData, probationEnds: string): PeData {
  const from = dayAfter(probationEnds);
  const to = from ? plusMonth(from) : "";
  return { ...d, probationEnds, extendFrom: d.extendFrom || from, extendTo: d.extendTo || to, reevalBy: d.reevalBy || to };
}

// ---- The letter, as blocks (screen and PDF) -----------------------------------------

export type Run = { t: string; b?: boolean };
export type Block =
  | { k: "date"; t: string }
  | { k: "address"; lines: Run[][] }
  | { k: "subject"; t: string }
  | { k: "p"; runs: Run[] }
  | { k: "h"; t: string }
  | { k: "scores"; rows: [string, string, string][]; total: [string, string] }
  | { k: "list"; numbered: boolean; items: Run[][] };

const fmt = (n: number) => (Number(n) || 0).toFixed(2).replace(/\.00$/, "");

export function peBlocks(d: PeData): Block[] {
  const total = peTotal(d);
  const passed = total >= d.passingScore;
  const honor = d.female ? "MS." : "MR.";
  const blocks: Block[] = [
    { k: "date", t: longDate(d.letterDate) },
    {
      k: "address",
      lines: [[{ t: `${honor} ${d.employeeName}`, b: true }], [{ t: [d.position, d.department].filter(Boolean).join(", ") }], [{ t: d.employerName }]],
    },
    { k: "subject", t: "Extension of Probationary Employment for Further Observation and Re-evaluation" },
    { k: "p", runs: [{ t: `Dear ${d.salutation}:` }] },
    {
      k: "p",
      runs: [
        { t: `You were hired on ${longDate(d.hiredOn)} as a probationary ${d.position}${d.department ? ` in the ${d.department}` : ""}, and your probationary contract is set to end on ` },
        { t: longDate(d.probationEnds), b: true },
        { t: "." },
      ],
    },
    {
      k: "p",
      runs: [
        { t: `Your evaluation for regularization, completed on ${longDate(d.evalDate)}, gave you an actual score of ` },
        { t: fmt(total), b: true },
        { t: passed ? `, against the required passing score of ${fmt(d.passingScore)}. The results were as follows:` : `, below the required passing score of ${fmt(d.passingScore)}. The results were as follows:` },
      ],
    },
    {
      k: "scores",
      rows: d.scores.map((s) => [s.criteria, `${fmt(s.weight)}%`, fmt(s.score)]),
      total: [`Actual Score (passing score: ${fmt(d.passingScore)})`, `${fmt(total)} – ${passed ? "Passed" : "Failed"}`],
    },
  ];
  if (d.remarks.trim()) blocks.push({ k: "p", runs: [{ t: d.remarks.trim() }] });
  blocks.push(
    { k: "h", t: "Extension of Probationary Period" },
    {
      k: "p",
      runs: [
        { t: "Your probationary employment is hereby extended from " },
        { t: longDate(d.extendFrom), b: true },
        { t: " until " },
        { t: longDate(d.extendTo), b: true },
        {
          t: ". This extension is for the sole purpose of further observing your performance and conduct and re-evaluating you for regularization. All other terms and conditions of your probationary employment remain the same.",
        },
      ],
    },
  );
  const standards = d.standards.filter((s) => s.title.trim() || s.text.trim());
  if (standards.length) {
    blocks.push(
      { k: "h", t: "Areas You Must Improve" },
      { k: "p", runs: [{ t: "During the extension period, you are expected to meet the following standards:" }] },
      {
        k: "list",
        numbered: true,
        items: standards.map((s) => [...(s.title.trim() ? [{ t: `${s.title.trim().replace(/\.$/, "")}. `, b: true }] : []), { t: s.text.trim() }]),
      },
      { k: "p", runs: [{ t: "Your Department Head and HR will monitor your performance and conduct closely during this period and will give you feedback along the way." }] },
    );
  }
  blocks.push(
    { k: "h", t: "Re-evaluation" },
    {
      k: "p",
      runs: [{ t: `You will be re-evaluated using the same evaluation criteria and passing score of ${fmt(d.passingScore)} on or before ` }, { t: longDate(d.reevalBy), b: true }, { t: "." }],
    },
    {
      k: "list",
      numbered: false,
      items: [
        [{ t: "If you meet the standards and pass the re-evaluation, you will be recommended for regular employment." }],
        [{ t: "If you do not meet the standards, your probationary employment will end on " }, { t: longDate(d.extendTo), b: true }, { t: " without need of further notice." }],
        [{ t: "This extension does not make you a regular employee, and it does not guarantee regularization." }],
      ],
    },
  );
  if (d.closing.trim()) blocks.push({ k: "p", runs: [{ t: d.closing.trim() }] });
  return blocks;
}

export const peConforme = (d: PeData) =>
  `I have read and understood this letter. I voluntarily agree to the extension of my probationary employment until ${longDate(d.extendTo)}, for further observation and re-evaluation, and I understand the standards I must meet to be regularized.`;

// ---- Data -------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  delete: () => Query;
  eq: (c: string, v: string) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
};
type Client = { from: (t: string) => Query; rpc: (fn: string, a?: Row) => PromiseLike<{ error: { message: string } | null }> };
const client = () => getSupabaseClient() as unknown as Client;
const bucket = () => getSupabaseClient().storage.from("leave-forms");

const SETUP = "Probation extensions aren't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/(probation_extensions|pe_)/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toPe = (r: Row): ProbationExtension => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  employeeName: String(r.employee_name ?? ""),
  status: (r.status as PeStatus) ?? "hr",
  data: r.data as PeData,
  createdAt: String(r.created_at ?? ""),
  hrName: (r.hr_name as string | null) ?? null,
  hrSignedAt: (r.hr_signed_at as string | null) ?? null,
  notedId: (r.noted_id as string | null) ?? null,
  notedName: (r.noted_name as string | null) ?? null,
  notedAt: (r.noted_at as string | null) ?? null,
  approverId: (r.approver_id as string | null) ?? null,
  approverName: (r.approver_name as string | null) ?? null,
  approvedAt: (r.approved_at as string | null) ?? null,
  returnedNote: (r.returned_note as string | null) ?? null,
  returnedBy: (r.returned_by as string | null) ?? null,
  returnedAt: (r.returned_at as string | null) ?? null,
  receivedAt: (r.received_at as string | null) ?? null,
});

export async function fetchProbationExtensions(): Promise<ProbationExtension[]> {
  const { data, error } = await client().from("probation_extensions").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data as Row[]).map(toPe);
}

const rpc = async (fn: string, args: Row) => {
  const { error } = await client().rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
};

export async function createProbationExtension(employeeId: string, notedId: string, approverId: string, data: PeData): Promise<string> {
  const id = crypto.randomUUID();
  await rpc("pe_create", { p_id: id, p_employee: employeeId, p_noted: notedId, p_approver: approverId, p_data: data as unknown as Row });
  return id;
}
export const saveProbationExtension = (id: string, notedId: string, approverId: string, data: PeData) =>
  rpc("pe_save", { p_id: id, p_noted: notedId, p_approver: approverId, p_data: data as unknown as Row });

const sigPath = (id: string, as: PeSigner) => `pe/${id}/${as}.png`;
const STEP: Record<PeSigner, string> = { hr: "pe_send", noted: "pe_note", approved: "pe_approve", employee: "pe_receive" };

// Places the signer's saved signature, then moves the notice on.
export async function signProbationExtension(id: string, me: string, as: PeSigner): Promise<void> {
  await placeMySignature(me, sigPath(id, as));
  await rpc(STEP[as], { p_id: id });
}
export const returnProbationExtension = (id: string, note: string) => rpc("pe_return", { p_id: id, p_note: note });

export async function deleteProbationExtension(id: string): Promise<void> {
  const { error } = await client().from("probation_extensions").delete().eq("id", id);
  if (error) throw new Error(friendly(error.message));
  await bucket().remove((["hr", "noted", "approved", "employee"] as PeSigner[]).map((s) => sigPath(id, s)));
}

// The signatures given so far, by signer.
export async function peSignatures(r: ProbationExtension): Promise<Partial<Record<PeSigner, Uint8Array>>> {
  const signed: [PeSigner, string | null][] = [
    ["hr", r.hrSignedAt],
    ["noted", r.notedAt],
    ["approved", r.approvedAt],
    ["employee", r.receivedAt],
  ];
  const out: Partial<Record<PeSigner, Uint8Array>> = {};
  await Promise.all(
    signed
      .filter(([, at]) => at)
      .map(async ([as]) => {
        const { data } = await bucket().download(sigPath(r.id, as));
        if (data) out[as] = new Uint8Array(await data.arrayBuffer());
      }),
  );
  return out;
}

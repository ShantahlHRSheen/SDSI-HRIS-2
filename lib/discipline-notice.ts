import { currentCompany } from "./companies";
import { buildTardinessNtePdf, buildTardinessSanctionPdf, type SignatureMark } from "./nte-tardiness-pdf";
import { downloadDisciplineFile } from "./supabase/discipline-files";
import type { DisciplinaryRecord, Employee } from "./types";

// A generated notice (record.noticeData) printed with the signatures it has
// so far: HR Manager, Department Manager, and the employee's "received".

let letterhead: Promise<Uint8Array | null> | null = null;
export function loadHrLetterhead(): Promise<Uint8Array | null> {
  const url = currentCompany().hrLetterhead;
  if (!url) return Promise.resolve(null);
  letterhead ??= fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? new Uint8Array(b) : null))
    .catch(() => null);
  return letterhead;
}

async function mark(path: string | null | undefined, at: string | null | undefined, name?: string): Promise<SignatureMark | null> {
  if (!path || !at) return null;
  const png = new Uint8Array(await (await downloadDisciplineFile(path)).arrayBuffer());
  return { png, at, name };
}

export async function buildSignedNotice(r: DisciplinaryRecord, employees: Employee[]): Promise<Uint8Array | null> {
  const d = r.noticeData;
  if (!d) return null;
  const company = currentCompany();
  if (d.kind === "sanction") {
    return buildTardinessSanctionPdf({
      companyName: company.name,
      companyShort: company.shortName,
      companyAddress: company.info.address,
      companyContact: [company.info.phone, company.info.email].filter(Boolean).join(" · "),
      letterhead: await loadHrLetterhead(),
      ...d,
      signatures: { employee: await mark(r.ackSignaturePath, r.acknowledgedAt) },
    });
  }
  const hr = employees.find((e) => e.id === r.hrSignerId);
  const [hrMark, managerMark, branchMark, employeeMark] = await Promise.all([
    mark(r.hrSignaturePath, r.hrSignedAt, hr ? `${hr.firstName} ${hr.lastName}` : undefined),
    mark(r.managerSignaturePath, r.managerSignedAt),
    mark(r.branchManagerSignaturePath, r.branchManagerSignedAt),
    mark(r.ackSignaturePath, r.acknowledgedAt),
  ]);
  return buildTardinessNtePdf([
    {
      companyName: company.name,
      companyShort: company.shortName,
      companyAddress: company.info.address,
      companyContact: [company.info.phone, company.info.email].filter(Boolean).join(" · "),
      letterhead: await loadHrLetterhead(),
      employeeName: d.employeeName,
      issueDate: d.issueDate,
      month: d.month,
      days: d.days,
      cc: d.cc,
      branchManager: d.branchManager ?? null,
      signatures: { hr: hrMark, manager: managerMark, branch: branchMark, employee: employeeMark },
    },
  ]);
}

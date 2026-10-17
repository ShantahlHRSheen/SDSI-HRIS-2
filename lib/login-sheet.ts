import { branchName, fullName, positionTitle } from "./helpers";
import type { Employee } from "./types";

// The Excel file HR downloads after creating employee logins
// (components/employees/BulkLoginButton.tsx): one row per employee with their
// sign-in email and temporary password, under a short how-to-sign-in note.
// ExcelJS is loaded only when the file is made.

export interface LoginSheetRow {
  employee: Employee;
  email: string;
  password: string;
}

// color: the company's brand color as "#rrggbb", used for the title and header.
export async function loginSheetBlob(rows: LoginSheetRow[], companyName: string, signInUrl: string, color: string): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Logins", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "5:5" },
  });
  ws.columns = [
    { key: "no", width: 5 },
    { key: "empNo", width: 13 },
    { key: "name", width: 30 },
    { key: "branch", width: 16 },
    { key: "position", width: 26 },
    { key: "email", width: 34 },
    { key: "password", width: 20 },
  ];

  const brand = `FF${color.replace("#", "").toUpperCase()}`;
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = `${companyName} — HRIS employee logins`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: brand } };
  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = `Created ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Confidential — give each employee only their own row.`;
  ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  ws.mergeCells("A3:G3");
  ws.getCell("A3").value = `How to sign in: open ${signInUrl}, choose ${companyName}, then enter the email and temporary password below. The HRIS asks for a new password at the first sign-in.`;
  ws.getCell("A3").font = { size: 10 };
  ws.getCell("A3").alignment = { wrapText: true, vertical: "top" };
  ws.getRow(3).height = 30;

  const header = ws.getRow(5);
  header.values = ["#", "Employee No.", "Name", "Branch", "Position", "Sign-in email", "Temporary password"];
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brand } };
    cell.alignment = { vertical: "middle" };
  });
  header.height = 20;

  rows.forEach((r, i) => {
    const row = ws.addRow({
      no: i + 1,
      empNo: r.employee.employeeNumber,
      name: fullName(r.employee),
      branch: branchName(r.employee.branchId),
      position: positionTitle(r.employee.positionId),
      email: r.email,
      password: r.password,
    });
    row.getCell("password").font = { name: "Consolas", bold: true };
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

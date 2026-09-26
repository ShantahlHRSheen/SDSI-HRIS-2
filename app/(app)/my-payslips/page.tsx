"use client";

import { useState } from "react";
import { useHris } from "@/lib/store";
import { MyPayslipsView } from "@/components/payroll/MyPayslipsView";
import type { PayrollLine } from "@/lib/payroll";
import type { Employee, PayrollPeriod } from "@/lib/types";

// Everyone's own payslips, whatever their role (upper management, HR,
// payroll and regular employees alike).
export default function MyPayslipsPage() {
  const { currentEmployee, payrollPeriods, generatedPayslips } = useHris();
  const [preview, setPreview] = useState<{ employee: Employee; period: PayrollPeriod; line: PayrollLine } | null>(null);
  return <MyPayslipsView employee={currentEmployee} payrollPeriods={payrollPeriods} generatedPayslips={generatedPayslips} preview={preview} setPreview={setPreview} />;
}

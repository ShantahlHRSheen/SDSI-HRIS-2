"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, IdCard } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { IdCardManager } from "@/components/id-card/IdCardManager";
import { fullName } from "@/lib/helpers";

// HR's view of any employee's ID card. Everyone else only has "My ID Card".
export default function EmployeeIdCardPage() {
  const params = useParams<{ id: string }>();
  const { employees, currentUser } = useHris();
  const isHr = !!currentUser?.roles.some((r) => r === "hr_admin" || r === "sys_admin");
  const employee = isHr ? employees.find((e) => e.id === params.id) : undefined;

  return (
    <div>
      <Link href={`/employees/${params.id}`} className="mb-4 flex items-center gap-1.5 text-sm text-[var(--series-1)] print:hidden">
        <ArrowLeft size={16} /> Back to profile
      </Link>
      {employee ? (
        <>
          <PageHeader title={`ID Card — ${fullName(employee)}`} subtitle="Generated from the employee record. HR can upload the photo and signature and set the emergency contact on the employee's behalf." />
          <IdCardManager key={employee.id} employee={employee} />
        </>
      ) : (
        <EmptyState icon={IdCard} title="Not available" description="Only HR can view other employees' ID cards." />
      )}
    </div>
  );
}

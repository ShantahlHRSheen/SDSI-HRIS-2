"use client";

import { IdCard } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { IdCardManager } from "@/components/id-card/IdCardManager";

export default function MyIdCardPage() {
  const { currentEmployee } = useHris();
  return (
    <div>
      <PageHeader title="My ID Card" subtitle="Your company ID, generated from your employee record. Add your photo, signature and emergency contact, then print or save it as a PDF." />
      {currentEmployee ? (
        <IdCardManager key={currentEmployee.id} employee={currentEmployee} />
      ) : (
        <EmptyState icon={IdCard} title="No employee record" description="Your account isn't linked to an employee record — contact HR." />
      )}
    </div>
  );
}

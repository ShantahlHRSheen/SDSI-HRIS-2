"use client";

import { Suspense } from "react";
import { EmployeeLogin } from "@/components/auth/EmployeeLogin";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <EmployeeLogin />
    </Suspense>
  );
}

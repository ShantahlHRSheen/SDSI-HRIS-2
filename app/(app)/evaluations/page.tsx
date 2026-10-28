import { redirect } from "next/navigation";

// Performance evaluations moved to the evaluation page
// (app/(app)/sales-admin-evaluation): purposes, the Sales Admin form, a
// second head, the Vice Chairperson's and Chairman's recommendations.
export default function EvaluationsPage() {
  redirect("/sales-admin-evaluation");
}

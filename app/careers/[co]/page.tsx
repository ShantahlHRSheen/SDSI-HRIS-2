import { notFound, redirect } from "next/navigation";
import { isCompanyId } from "@/lib/companies";
import { careersUrl } from "@/lib/careers";

// Older links (/careers/sdsi?job=…) go to the company's own website.
type Props = { params: Promise<{ co: string }>; searchParams: Promise<{ job?: string | string[] }> };

export default async function OldCompanyCareers({ params, searchParams }: Props) {
  const { co } = await params;
  if (!isCompanyId(co)) notFound();
  const job = (await searchParams).job;
  redirect(careersUrl(co, typeof job === "string" ? job : undefined));
}

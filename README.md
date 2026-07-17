# Shantahl HRIS — Demo Instance

A demo build of the Shantahl Direct Sales Inc. HRIS build spec. Per the request
that scoped this build, this instance **skips the real database** — there is
no Supabase project, no auth backend, and no persisted server-side data. It
runs entirely in the browser against seeded, deterministic mock data (11
branches, ~105 employees, monthly attendance/overtime/payroll analytics,
evaluations, disciplinary records, audit logs, announcements) so it can be
demoed immediately without any setup.

## Running the demo

```bash
npm install
npm run dev
```

Open http://localhost:3000. There is no login form — pick a demo user card to
preview the system from that role's point of view (HR Manager, Payroll
Officer, Sr. Accounting Assistant, Corporate Treasurer, CFO, Department
Manager/Employee, Employee, Upper Management). The HR Manager role also
carries full System Administrator access.

Any changes you make (creating an evaluation, issuing a disciplinary record,
editing branches/departments/etc. in System Administration) are kept in
`localStorage` for the session so the demo feels persistent across page
reloads, but nothing leaves the browser — refreshing in a private window or
clearing site data resets it back to the seed data.

## What's fully built vs. previewed

This demo focused implementation depth on the modules requested for this
pass: **Dashboards with monthly attendance/overtime/payroll-expense analytics
and reports, Performance Evaluations, Disciplinary Records, Audit Trail, and
System Administration**, plus the foundation every module needs (Employee
Directory / 201 File, Org structure, Bulletin Board, role-based navigation).
There is no Contract Monitoring module in this build (removed by request).

Modules further down the build order (Section 9 of the build spec) —
Attendance, Leave, Overtime, Attendance Corrections, Payroll Processing,
Payslips, Allowance Vouchers, Government Reports, 13th Month Pay, Notifications,
Org Chart — are present in the navigation as clearly labeled **"Preview"**
stubs describing what's planned, so the full scope of the spec is visible even
though depth wasn't built into every module yet.

## Moving from demo to the real build

When ready to build out the full system per the spec, the next steps are:

1. Stand up the Supabase project (Postgres + Auth + Storage) and translate
   `lib/types.ts` into SQL migrations under `supabase/migrations`.
2. Write RLS policies per table alongside each migration.
3. Replace `lib/store.tsx` (client-side mock state) with real data fetching
   via server actions / API routes.
4. Build the payroll computation service (`lib/payroll` per the spec) as an
   isolated, unit-tested module — configurable, versioned SSS / PhilHealth /
   Pag-IBIG / withholding-tax tables, not hardcoded brackets.
5. Wire up the remaining "Preview" modules in the order laid out in Section 9
   of the build spec.

## Tech stack

Next.js (App Router, TypeScript), Tailwind CSS v4, React Context for demo
state, no external chart library (hand-built SVG/HTML charts per the
project's data-visualization conventions).

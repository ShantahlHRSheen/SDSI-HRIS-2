import type { Employee } from "./types";

// A second supervisor (employees.co_supervisor_id,
// supabase/migrate_phase67_co_supervisor.sql): someone who approves an
// employee's leave, overtime, correction and travel forms just like their
// supervisor (e.g. Daro's Head Office, with two Credit Supervisors). Forms
// keep the supervisor at filing time as their "department head", so the
// second one is looked up from the employee list, kept here by the store.

let secondSupervisors = new Map<string, string>();

export function registerSecondSupervisors(employees: Employee[]): void {
  secondSupervisors = new Map(employees.filter((e) => e.coSupervisorId).map((e) => [e.id, e.coSupervisorId as string]));
}

// Is `me` the second supervisor of this employee?
export const isSecondSupervisorOf = (employeeId: string, me: string | undefined): boolean => !!me && secondSupervisors.get(employeeId) === me;

// Is `me` either of this employee's supervisors?
export const supervises = (employee: Pick<Employee, "id" | "supervisorId" | "coSupervisorId"> | undefined, me: string | undefined): boolean =>
  !!employee && !!me && (employee.supervisorId === me || employee.coSupervisorId === me);

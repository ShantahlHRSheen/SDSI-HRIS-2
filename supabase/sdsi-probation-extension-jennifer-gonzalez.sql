-- =============================================================================
-- SDSI only: Jennifer Gonzalez's Extension of Probationary Employment
-- (from HR's letter dated November 14, 2026), as a DRAFT in Probation Extension.
--
-- Run after migrate_phase90_probation_extension.sql. Nothing is signed or sent:
-- HR opens it under "Drafts to send", checks it, and clicks "Sign & send".
-- Jennifer then gets it right away and signs the CONFORME; Michelle Ignacio (Noted by)
-- and Lowel B. Magdadaro (Approved by) sign their parts too (phase 91).
-- Safe to re-run: it adds the draft only once.
-- =============================================================================

insert into probation_extensions (id, employee_id, employee_name, status, data, created_by, noted_id, noted_name, approver_id, approver_name)
select 'pe-jennifer-gonzalez-2026-11', c.id, 'Jennifer Gonzalez', 'hr', $json${
  "letterDate": "2026-11-14",
  "employeeName": "JENNIFER GONZALEZ",
  "salutation": "Ms. Gonzalez",
  "female": true,
  "position": "Sales Admin",
  "department": "MLM Department",
  "employerName": "Shantahl Direct Sales Inc.",
  "hiredOn": "2026-06-15",
  "probationEnds": "2026-11-14",
  "evalDate": "2026-10-28",
  "scores": [
    {
      "criteria": "Behavior (rated by HR)",
      "weight": 10,
      "score": 5.38
    },
    {
      "criteria": "Job Performance (rated by the Department Head)",
      "weight": 10,
      "score": 8.33
    },
    {
      "criteria": "Sales",
      "weight": 80,
      "score": 72.43
    }
  ],
  "passingScore": 90,
  "remarks": "Your Department Head noted your good communication, time management and commitment to your responsibilities, and HR noted that you get along well with your co-employees and make extra effort to keep the work area neat and clean. The Company values these qualities. Because of them, and in fairness to you, Management has decided to give you another chance to show the improvement needed for regularization instead of ending your probationary employment.",
  "extendFrom": "2026-11-15",
  "extendTo": "2026-12-14",
  "standards": [
    {
      "title": "Punctuality",
      "text": "Report to work on time every working day."
    },
    {
      "title": "Conduct during office hours",
      "text": "Do not use company time or equipment for personal or unauthorized activities. You were reminded of this verbally, through a posted memo, and through the Notice to Explain issued on October 27, 2026."
    },
    {
      "title": "Following instructions",
      "text": "Follow the instructions of your superiors and company officers promptly and completely."
    },
    {
      "title": "Workplace relations",
      "text": "Avoid gossip and negative rumors, and do not get involved in fights or conflicts in the workplace."
    },
    {
      "title": "Confidentiality",
      "text": "Keep all company data strictly confidential."
    },
    {
      "title": "Sales target",
      "text": "Consistently generate gross sales of at least three (3) times the ads spent for the period, as required under the Sales Admin evaluation."
    },
    {
      "title": "Productivity and accuracy",
      "text": "Use all office hours for your assigned tasks and make sure your outputs are accurate."
    }
  ],
  "reevalBy": "2026-12-14",
  "closing": "We hope you will take this opportunity seriously and show the improvement we know you are capable of. If you have any questions about this letter or the standards above, please approach HR.",
  "hrName": "Sheena A. Evangelista",
  "hrTitle": "HR Manager",
  "notedName": "Michelle Ignacio",
  "notedTitle": "Department Head, MLM Department",
  "approverName": "Lowel B. Magdadaro",
  "approverTitle": "Chairman of the Board"
}$json$::jsonb,
       h.id, n.id, app_reg_name(n.id), a.id, app_reg_name(a.id)
  from employees c, employees h, employees n, employees a
 where c.employee_number = 'EMP-0184'   -- Jennifer Gonzalez
   and h.employee_number = 'EMP-0077'   -- Sheena A. Evangelista (HR)
   and n.employee_number = 'EMP-0191'   -- Michelle Ignacio (Noted by)
   and a.employee_number = 'EMP-0001'   -- Lowel B. Magdadaro (Approved by)
on conflict (id) do nothing;

select id, employee_name, status, noted_name, approver_name from probation_extensions where id = 'pe-jennifer-gonzalez-2026-11';

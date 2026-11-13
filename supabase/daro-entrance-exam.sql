-- =============================================================================
-- Daro Lending Corporation — Applicant's Entrance Exam
--
--   From DARO-ENTRANCE-EXAM (Applicant's Examination Form):
--     Part I    Mathematical Questions   25 multiple choice, 1 pt each
--     Part II   Abstract                  5 multiple choice (pictures in
--                                          public/exams/daro), 1 pt each
--     Part III  Spelling and Grammar     20 multiple choice, 1 pt each
--     Part IV   Essay                     4 essays, 5 pts each (HR scores)
--   70 points; passing 75%. Answer key from the Word file, except Part I #12:
--   36, 34, 30, 28, 24 → 22 (the Word key says a. 67).
--
-- Run in Daro's Supabase SQL Editor, after the hiring and exam updates
-- (migrate_phase81_hiring.sql … migrate_phase85_applicant_exams.sql). It
-- appears in Hiring → Exams as "DARO Entrance Exam" (active), where HR can
-- edit it, attach it to a job post, or send it to an applicant.
-- Safe to re-run: it updates the same exam.
-- =============================================================================

insert into exams (id, status, title, instructions, time_limit_minutes, passing_percent, questions)
values (
  'exam-daro-entrance',
  'active',
  'DARO Entrance Exam',
  'Choose the correct answer for each question in Parts I to III. Answer the essay questions in Part IV in your own words. Answers are saved only when you press "Send my answers".',
  null,
  75,
  $json$[
 {
  "id": "p1-1",
  "kind": "choice",
  "prompt": "What is the next prime number after 7?",
  "choices": [
   "11",
   "12",
   "45"
  ],
  "answer": 0,
  "points": 1,
  "section": "Part I. Mathematical Questions"
 },
 {
  "id": "p1-2",
  "kind": "choice",
  "prompt": "65 - 43 = ?",
  "choices": [
   "21",
   "22",
   "23"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-3",
  "kind": "choice",
  "prompt": "What does the square root of 144 equal?",
  "choices": [
   "12",
   "24",
   "48"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-4",
  "kind": "choice",
  "prompt": "52 divided by 4 equals what?",
  "choices": [
   "12",
   "13",
   "8"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-5",
  "kind": "choice",
  "prompt": "87 + 56 = ?",
  "choices": [
   "256",
   "143",
   "78"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-6",
  "kind": "choice",
  "prompt": "How many sides does a nonagon have?",
  "choices": [
   "12",
   "9",
   "8"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-7",
  "kind": "choice",
  "prompt": "What is the next number in the sequence: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, ?",
  "choices": [
   "55",
   "67",
   "45"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-8",
  "kind": "choice",
  "prompt": "7 x 9 = ?",
  "choices": [
   "63",
   "78",
   "54"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-9",
  "kind": "choice",
  "prompt": "What does 3 squared equal?",
  "choices": [
   "8",
   "9",
   "10"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-10",
  "kind": "choice",
  "prompt": "5 multiply by 0 is?",
  "choices": [
   "5",
   "0",
   "50"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-11",
  "kind": "choice",
  "prompt": "2, 1, (1/2), (1/4), ... What number should come next?",
  "choices": [
   "1/2",
   "1/3",
   "1/8"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p1-12",
  "kind": "choice",
  "prompt": "36, 34, 30, 28, 24, ... What number should come next?",
  "choices": [
   "67",
   "22",
   "23"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-13",
  "kind": "choice",
  "prompt": "2, 6, 18, 54, ... What number should come next?",
  "choices": [
   "144",
   "145",
   "162"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p1-14",
  "kind": "choice",
  "prompt": "67 - 53 = ?",
  "choices": [
   "14",
   "15",
   "16"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-15",
  "kind": "choice",
  "prompt": "78 + 5 + 2 = ?",
  "choices": [
   "85",
   "87",
   "86"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-16",
  "kind": "choice",
  "prompt": "100 - 50 + 20 = ?",
  "choices": [
   "20",
   "70",
   "80"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-17",
  "kind": "choice",
  "prompt": "8 x 9 = ?",
  "choices": [
   "72",
   "98",
   "71"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-18",
  "kind": "choice",
  "prompt": "9 x 4 = ?",
  "choices": [
   "76",
   "33",
   "36"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p1-19",
  "kind": "choice",
  "prompt": "(5 x 8) + 2 = ?",
  "choices": [
   "45",
   "43",
   "42"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p1-20",
  "kind": "choice",
  "prompt": "90 divided by 9 is?",
  "choices": [
   "11",
   "10",
   "9"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p1-21",
  "kind": "choice",
  "prompt": "5 multiply by 7 is?",
  "choices": [
   "35",
   "57",
   "90"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-22",
  "kind": "choice",
  "prompt": "5 + 13 = ?",
  "choices": [
   "18",
   "13",
   "8"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-23",
  "kind": "choice",
  "prompt": "80, 10, 70, 15, 60, ... What number should come next?",
  "choices": [
   "20",
   "30",
   "40"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-24",
  "kind": "choice",
  "prompt": "V, VIII, XI, XIV, __, XX, ... What number should fill the blank?",
  "choices": [
   "XVII",
   "XIV",
   "III"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p1-25",
  "kind": "choice",
  "prompt": "5.2, 4.8, 4.4, 4, ... What number should come next?",
  "choices": [
   "3.6",
   "3.3",
   "5.6"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p2-1",
  "kind": "choice",
  "prompt": "Which figure completes the series?",
  "choices": [
   "A",
   "B",
   "C",
   "D"
  ],
  "answer": 0,
  "points": 1,
  "image": "/exams/daro/abstract-1.png",
  "section": "Part II. Abstract"
 },
 {
  "id": "p2-2",
  "kind": "choice",
  "prompt": "Which figure completes the statement?",
  "choices": [
   "A",
   "B",
   "C",
   "D"
  ],
  "answer": 2,
  "points": 1,
  "image": "/exams/daro/abstract-2.png"
 },
 {
  "id": "p2-3",
  "kind": "choice",
  "prompt": "Which figure is the odd one out?",
  "choices": [
   "A",
   "B",
   "C",
   "D",
   "E"
  ],
  "answer": 0,
  "points": 1,
  "image": "/exams/daro/abstract-3.png"
 },
 {
  "id": "p2-4",
  "kind": "choice",
  "prompt": "Which figure completes the series?",
  "choices": [
   "A",
   "B",
   "C",
   "D"
  ],
  "answer": 2,
  "points": 1,
  "image": "/exams/daro/abstract-4.png"
 },
 {
  "id": "p2-5",
  "kind": "choice",
  "prompt": "Which figure completes the grid?",
  "choices": [
   "A",
   "B",
   "C",
   "D"
  ],
  "answer": 0,
  "points": 1,
  "image": "/exams/daro/abstract-5.png"
 },
 {
  "id": "p3-1",
  "kind": "choice",
  "prompt": "Fill in the blank: \"________ such a friendly person.\"",
  "choices": [
   "Your",
   "You're",
   "Your'e"
  ],
  "answer": 1,
  "points": 1,
  "section": "Part III. Spelling and Grammar"
 },
 {
  "id": "p3-2",
  "kind": "choice",
  "prompt": "Which is the correct spelling?",
  "choices": [
   "Inconveinence",
   "Inconvenience",
   "Inconvienience"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p3-3",
  "kind": "choice",
  "prompt": "Which is the correct spelling?",
  "choices": [
   "Activate",
   "Activete",
   "Acktivate"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p3-4",
  "kind": "choice",
  "prompt": "Fill in the blank: \"I would be happy to ______ you.\"",
  "choices": [
   "Assisst",
   "Asist",
   "Assist"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p3-5",
  "kind": "choice",
  "prompt": "Which is the correct spelling?",
  "choices": [
   "Tommorrow",
   "Tomorrow",
   "Tomorow"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p3-6",
  "kind": "choice",
  "prompt": "Fill in the blank: \"I'm very ____________ for your assistance.\"",
  "choices": [
   "Greatful",
   "Gratefull",
   "Grateful"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p3-7",
  "kind": "choice",
  "prompt": "What is a synonym of the word \"help\"?",
  "choices": [
   "Hinder",
   "Tired",
   "Assist"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p3-8",
  "kind": "choice",
  "prompt": "What is the correct spelling?",
  "choices": [
   "Guarante",
   "Guarentee",
   "Guarantee"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p3-9",
  "kind": "choice",
  "prompt": "Fill in the blank. \"I'm afraid ______ not in stock at this time.\"",
  "choices": [
   "Its'",
   "It's",
   "Its"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p3-10",
  "kind": "choice",
  "prompt": "Fill in the blank: \"What would you _________ for this customer?\"",
  "choices": [
   "Reckomend",
   "Recommend",
   "Recomend"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p3-11",
  "kind": "choice",
  "prompt": "Which is the correct spelling?",
  "choices": [
   "Ackquire",
   "Acquire",
   "Aquire"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p3-12",
  "kind": "choice",
  "prompt": "Which is the correct spelling?",
  "choices": [
   "Privelidge",
   "Privilege",
   "Priviledge"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p3-13",
  "kind": "choice",
  "prompt": "Fill in the blank: \"I cannot believe ______ coming over!\"",
  "choices": [
   "Their",
   "There",
   "They're"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p3-14",
  "kind": "choice",
  "prompt": "Which is the correct spelling?",
  "choices": [
   "Humorous",
   "Humerous",
   "Humurous"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p3-15",
  "kind": "choice",
  "prompt": "Fill in the blank: \"I ____________ for that inconvenience to you.\"",
  "choices": [
   "Apollogize",
   "Appologize",
   "Apologize"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p3-16",
  "kind": "choice",
  "prompt": "What is the correct spelling?",
  "choices": [
   "Ocationally",
   "Occasionally",
   "Occasionaly"
  ],
  "answer": 1,
  "points": 1
 },
 {
  "id": "p3-17",
  "kind": "choice",
  "prompt": "What is the correct spelling?",
  "choices": [
   "Accident",
   "Acident",
   "Acciddent"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p3-18",
  "kind": "choice",
  "prompt": "What is the correct spelling?",
  "choices": [
   "Easelly",
   "Easilly",
   "Easily"
  ],
  "answer": 2,
  "points": 1
 },
 {
  "id": "p3-19",
  "kind": "choice",
  "prompt": "What is the correct spelling?",
  "choices": [
   "Receive",
   "Ricieve",
   "Recieve"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p3-20",
  "kind": "choice",
  "prompt": "What is the correct spelling?",
  "choices": [
   "Sufficient",
   "Suficient",
   "Sufficeint"
  ],
  "answer": 0,
  "points": 1
 },
 {
  "id": "p4-1",
  "kind": "essay",
  "prompt": "Why do you want to work in this Company?",
  "choices": [],
  "answer": null,
  "points": 5,
  "section": "Part IV. Essay"
 },
 {
  "id": "p4-2",
  "kind": "essay",
  "prompt": "How do you help the company?",
  "choices": [],
  "answer": null,
  "points": 5
 },
 {
  "id": "p4-3",
  "kind": "essay",
  "prompt": "What kind of experience do you need to be an HR/Admin Officer?",
  "choices": [],
  "answer": null,
  "points": 5
 },
 {
  "id": "p4-4",
  "kind": "essay",
  "prompt": "Write an application letter.",
  "choices": [],
  "answer": null,
  "points": 5
 }
]$json$::jsonb
)
on conflict (id) do update
  set title = excluded.title, instructions = excluded.instructions, passing_percent = excluded.passing_percent,
      questions = excluded.questions, status = 'active';

select title, status, jsonb_array_length(questions) as questions,
       (select sum((q->>'points')::int) from jsonb_array_elements(questions) q) as total_points
  from exams where id = 'exam-daro-entrance';

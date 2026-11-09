// The built-in Psychological screening (HR's "Applicant Psychological
// Screening"): 30 statements answered 1–5, five work-related traits, and
// checks that the answers are candid and consistent. Scored on the server
// (app/api/careers/exam); the report shows to HR on the applicant's record.
// A screening aid, not a clinical diagnosis.

export type Trait = "C" | "E" | "I" | "T" | "A";
export type Band = "h" | "m" | "l";

export const PSYCH_TITLE = "Psychological screening";
export const PSYCH_INSTRUCTIONS = [
  "Read each statement and choose how well it describes you.",
  "There are no right or wrong answers. Answer honestly; overly perfect answers lower the reliability of your result.",
  "Do not spend too long on one item. Your first reaction is usually the most accurate.",
  "Answer all 30 items before submitting.",
].join("\n");

export const LIKERT = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

export const TRAITS: Record<Trait, { name: string; desc: Record<Band, string> }> = {
  C: {
    name: "Conscientiousness",
    desc: {
      h: "Organized, dependable, and follows through on tasks without close supervision.",
      m: "Generally reliable; may need reminders or structure on less engaging tasks.",
      l: "May struggle with deadlines, accuracy, or finishing tasks. Verify work history and references.",
    },
  },
  E: {
    name: "Emotional Stability",
    desc: {
      h: "Stays composed under pressure and recovers quickly from setbacks.",
      m: "Handles normal stress well; may be affected by sustained pressure or criticism.",
      l: "May react strongly to stress or criticism. Explore coping strategies in the interview.",
    },
  },
  I: {
    name: "Integrity",
    desc: {
      h: "Strong regard for honesty, company property, and rules.",
      m: "Mostly sound values with some flexibility toward rules. Probe with situational questions.",
      l: "Answers suggest tolerance for dishonest or rule-breaking behavior. Treat as a serious concern.",
    },
  },
  T: {
    name: "Teamwork",
    desc: {
      h: "Cooperative, helps others, and handles disagreement constructively.",
      m: "Works with others adequately; may prefer independent work.",
      l: "May find collaboration or diverse teams difficult. Check fit for team-based roles.",
    },
  },
  A: {
    name: "Adaptability",
    desc: {
      h: "Comfortable with change, new systems, and multitasking.",
      m: "Adjusts to change with some time and support.",
      l: "Prefers stable routines; may resist new procedures. Consider for roles with low change.",
    },
  },
};

// [statement, scale (V = validity), reverse-keyed]
const RAW: [string, Trait | "V", boolean][] = [
  ["I finish tasks before their deadline, even when no one checks on me.", "C", false],
  ["I stay calm when a customer or coworker is angry with me.", "E", false],
  ["Taking small office supplies home is acceptable because the company will not miss them.", "I", true],
  ["I prefer working alone over working in a group.", "T", true],
  ["I adjust quickly when plans change at the last minute.", "A", false],
  ["I have never been late to anything in my life.", "V", false],
  ["I often leave tasks unfinished once they become boring.", "C", true],
  ["Criticism of my work stays on my mind for days.", "E", true],
  ["If I saw a coworker stealing, I would report it.", "I", false],
  ["I willingly help coworkers even when it is not my assignment.", "T", false],
  ["I get frustrated when I am asked to learn a new system or procedure.", "A", true],
  ["I have never said anything bad about anyone.", "V", false],
  ["I double-check my work for errors before submitting it.", "C", false],
  ["I lose my temper easily when I am under pressure.", "E", true],
  ["Bending the rules is fine as long as the result is good.", "I", true],
  ["I listen to other people's ideas even when I disagree with them.", "T", false],
  ["I enjoy trying new ways of doing things.", "A", false],
  ["I have never felt annoyed at anyone.", "V", false],
  ["I keep my work area and files organized.", "C", false],
  ["I recover quickly after a bad day at work.", "E", false],
  ["I tell my supervisor when I make a mistake, even if no one would notice.", "I", false],
  ["When there is conflict in a team, I look for a solution everyone can accept.", "T", false],
  ["I prefer a routine that never changes.", "A", true],
  ["I always follow every rule, no matter how small.", "V", false],
  ["I arrive on time for work and appointments.", "C", false],
  ["I worry a lot about things I cannot control.", "E", true],
  ["I would call in sick just to get a free day off.", "I", true],
  ["I find it hard to work with people who are very different from me.", "T", true],
  ["I can handle several tasks at once without getting confused.", "A", false],
  ["I have never taken anything that did not belong to me, not even a pen.", "V", false],
];
export const PSYCH_ITEMS = RAW.map(([prompt, scale, reverse], i) => ({ id: `p${i + 1}`, prompt, scale, reverse }));
// Items (1-based) that measure the same thing in opposite directions.
const PAIRS: [number, number][] = [
  [1, 7],
  [2, 14],
  [3, 9],
  [16, 28],
  [17, 23],
];

export type Tone = "good" | "warn" | "bad";
export interface PsychResult {
  traits: Record<Trait, number>; // 0–100
  overall: number;
  checks: [Tone, string][];
  verdict: [Tone, string, string];
  minutes: number;
  answered: number;
}

export const band = (p: number): Band => (p >= 75 ? "h" : p >= 50 ? "m" : "l");
export const BAND: Record<Band, [string, Tone]> = { h: ["High", "good"], m: ["Moderate", "warn"], l: ["Low", "bad"] };

// answers: item id → 1..5 (all 30 answered).
export function scorePsych(answers: Record<string, number>, minutes: number): PsychResult {
  const a = (n: number) => Number(answers[`p${n}`]);
  const keyed = (n: number) => (RAW[n - 1][2] ? 6 - a(n) : a(n));
  const traits = {} as Record<Trait, number>;
  for (const s of Object.keys(TRAITS) as Trait[]) {
    let sum = 0;
    RAW.forEach((it, i) => {
      if (it[1] === s) sum += keyed(i + 1);
    });
    traits[s] = Math.round(((sum - 5) / 20) * 100);
  }
  const overall = Math.round(Object.values(traits).reduce((t, v) => t + v, 0) / 5);
  const vItems = RAW.map((_, i) => i + 1).filter((n) => RAW[n - 1][1] === "V");
  const vMean = vItems.reduce((t, n) => t + a(n), 0) / vItems.length;
  const inconsistent = PAIRS.filter(([x, y]) => Math.abs(keyed(x) - keyed(y)) >= 3).length;
  const counts = [0, 0, 0, 0, 0, 0];
  RAW.forEach((_, i) => counts[a(i + 1)]++);
  const maxSame = Math.max(...counts);
  const checks: [Tone, string][] = [];
  checks.push(
    vMean >= 4.2
      ? ["bad", `Social desirability is high (${vMean.toFixed(1)} of 5). The applicant claimed near-perfect behavior on statements few people can truthfully agree with. Scores may be inflated.`]
      : vMean >= 3.6
        ? ["warn", `Social desirability is elevated (${vMean.toFixed(1)} of 5). Some impression management is likely.`]
        : ["good", `Social desirability is normal (${vMean.toFixed(1)} of 5). Answers appear candid.`],
  );
  checks.push(
    inconsistent >= 2
      ? ["bad", `${inconsistent} of 5 matched item pairs contradict each other. The applicant may have answered carelessly or randomly.`]
      : inconsistent === 1
        ? ["warn", "1 of 5 matched item pairs contradicts the other. Minor inconsistency."]
        : ["good", "Matched item pairs agree. Responses are consistent."],
  );
  checks.push(maxSame >= 22 ? ["bad", `The same answer was chosen ${maxSame} of 30 times. This pattern suggests the applicant did not read the items.`] : ["good", `Answer pattern is varied (most-used option chosen ${maxSame} of 30 times).`]);
  checks.push(minutes < 3 ? ["warn", `Completed in ${minutes.toFixed(1)} minutes, which is faster than expected for careful reading.`] : ["good", `Completion time was ${minutes.toFixed(1)} minutes.`]);
  const invalid = checks.some((c) => c[0] === "bad");
  let verdict: [Tone, string, string];
  if (invalid) verdict = ["bad", "Invalid result: retest or verify in interview", "One or more validity checks failed, so the trait scores should not be relied on."];
  else if (traits.I < 40 || overall < 50) verdict = ["bad", "Not recommended", traits.I < 40 ? "Integrity score is below the minimum of 40." : "Overall score is below 50."];
  else if (overall >= 65 && Object.values(traits).every((v) => v >= 40) && traits.I >= 60) verdict = ["good", "Recommended for interview", "Scores meet all thresholds."];
  else verdict = ["warn", "Consider with caution", "Acceptable overall, but one or more areas need follow-up in the interview."];
  if (!invalid && checks.some((c) => c[0] === "warn") && verdict[0] === "good") verdict = ["warn", "Recommended, with validity caution", "Scores meet thresholds, but a validity check raised a minor concern."];
  return { traits, overall, checks, verdict, minutes: Math.round(minutes * 10) / 10, answered: 30 };
}

export const PSYCH_NOTE =
  "Scoring guide: each trait has 5 items scored 1 to 5 (reverse-keyed items flipped), converted to 0–100%. High is 75 and above, Moderate 50–74, Low below 50. This is a screening aid, not a clinical diagnosis. Use it alongside the interview, reference checks, and skills tests, and keep results confidential under the Data Privacy Act.";

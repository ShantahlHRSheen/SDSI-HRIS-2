// Demo builds (no database connected) run on fictional sample data. Names
// that are written into the app itself — signatories on payslips, vouchers
// and 13th month slips, and the org chart — are swapped for fictional ones
// here, so a demo never shows real people.
export const IS_DEMO = !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const FIRST = ["Andrea", "Bianca", "Carlo", "Dianne", "Enzo", "Faith", "Gabriel", "Hazel", "Ian", "Jasmine", "Kevin", "Lianne", "Marco", "Nicole", "Oliver", "Patricia", "Rafael", "Sofia", "Tristan", "Vanessa", "Warren", "Yvette"];
const LAST = ["Bautista", "Castro", "Del Mundo", "Escobar", "Fajardo", "Herrera", "Ilagan", "Javier", "Manalo", "Navarro", "Ocampo", "Pascual", "Quiambao", "Salazar", "Tolentino", "Umali", "Valdez", "Zamora"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// The same fictional name every time for the same real name; keeps a middle
// initial if there was one, and ALL CAPS if the original was.
export function demoName(real: string): string {
  const h = hash(real.trim().toLowerCase());
  const middle = /\b([A-Z])\.\s/.exec(real)?.[1];
  const name = `${FIRST[h % FIRST.length]}${middle ? ` ${middle}.` : ""} ${LAST[Math.floor(h / FIRST.length) % LAST.length]}`;
  return real === real.toUpperCase() ? name.toUpperCase() : name;
}

// A name as the app should show it: the real one, or a fictional one in a demo.
export const shownName = (real: string): string => (IS_DEMO ? demoName(real) : real);

export function withShownNames<T extends { name: string }>(people: readonly T[]): T[] {
  return IS_DEMO ? people.map((p) => ({ ...p, name: demoName(p.name) })) : [...people];
}

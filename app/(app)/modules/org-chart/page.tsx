"use client";

import { shownName } from "@/lib/demo-mode";
import { currentCompany } from "@/lib/companies";
import { AutoOrgChart } from "@/components/org-chart/AutoOrgChart";
import { useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Calculator,
  Camera,
  ChartColumn,
  Leaf,
  Briefcase,
  Megaphone,
  Monitor,
  Network,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  User,
  Users,
} from "lucide-react";

// Company organization chart — transcribed from HR's "SDSI ORG CHART"
// (Canva, Sept 2026). Static on purpose: it's the official chart as
// published, not derived from employee records. Update the data below when
// HR issues a new version.

// direct: reports straight to the unit head — a line is drawn from the head
// to that side of the card ("left" or "right"). team: the people listed are
// one team under its first person, joined by a bracket on their left.
type Side = "left" | "right";
type Person = { name: string; title: string; freelancer?: boolean; direct?: Side };
type Division = { name: string; icon: LucideIcon; people: Person[]; direct?: Side; team?: boolean };
type Group = { name: string; icon: LucideIcon; lead?: Person; people?: Person[]; divisions?: Division[]; team?: boolean };
type Unit = {
  id: string;
  title: string;
  head: { name: string; title?: string };
  leads?: Person[];
  aside?: Person;
  groups: Group[];
  // Lines drawn as in the official chart: the departments side by side
  // (scrolling sideways on narrower screens).
  lines?: boolean;
};

const BOARD = {
  chairman: { name: "Lowel B. Magdadaro", title: "Chairman of the Board" },
  vice: { name: "Sheilah A. Magdadaro", title: "Vice Chairperson" },
};

const BUSINESS_UNITS = [
  { id: "mlm", label: "MLM", icon: Leaf, color: "#2e9e3f" },
  { id: "cosmetics", label: "Shantahl Cosmetics", icon: Sparkles, color: "#db2777" },
  { id: "darofy", label: "Darofy", icon: ShoppingCart, color: "#7c3aed" },
];

const SHARED_SERVICES = [
  { id: "operations", label: "Operations", icon: Settings },
  { id: "finance", label: "Finance", icon: ChartColumn },
  { id: "accounting", label: "Accounting", icon: Calculator },
  { id: "hr", label: "HR", icon: Users },
];

const UNITS: Unit[] = [
  {
    id: "mlm",
    title: "MLM Business Unit",
    head: { name: "Lowel B. Magdadaro", title: "Chairman of the BOD / MLM Business Unit Head" },
    lines: true,
    groups: [
      {
        name: "Netdev Department",
        icon: Network,
        people: [
          { name: "Romelito Domecillo", title: "Netdev Manager", direct: "right" },
          { name: "Chester Rosales", title: "Netdev Manager", direct: "right" },
          { name: "Randel Segovia", title: "Netdev Manager", direct: "right" },
        ],
      },
      {
        name: "Business Development Department",
        icon: Briefcase,
        people: [{ name: "Mae Japitan", title: "Business Development Manager", direct: "left" }],
      },
      {
        name: "Sales Department",
        icon: ChartColumn,
        team: true,
        people: [
          { name: "Michelle Ignacio", title: "Sales Head", direct: "right" },
          { name: "Jennifer Gonzales", title: "Sales Admin" },
          { name: "Charm Jireh Rivera", title: "Sales Admin" },
          { name: "Christian Aure", title: "Sales Admin" },
        ],
      },
      {
        name: "Marketing Department",
        icon: Megaphone,
        divisions: [
          {
            name: "Social Media Management Division",
            icon: Monitor,
            direct: "left",
            team: true,
            people: [
              { name: "Jasmine Eusebio", title: "Marketing Head" },
              { name: "Erwin Carreon", title: "Social Media Manager" },
              { name: "Shane Garcia", title: "Social Media Manager" },
            ],
          },
          {
            name: "Creatives & Production Division",
            icon: Camera,
            team: true,
            people: [
              { name: "John Paul Michael Papa", title: "Head MMA", direct: "left" },
              { name: "Frank Dela Cruz", title: "Video Editor" },
              { name: "John Michael De Maliwat", title: "GA" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "darofy",
    title: "Darofy Business Unit",
    head: { name: "Mark Anthony B. Magdadaro" },
    groups: [
      {
        name: "Sales Department",
        icon: ChartColumn,
        people: [
          { name: "Mharbee Mongcal", title: "Sales Admin" },
          { name: "Shopify Specialist", title: "Ads Specialist", freelancer: true },
        ],
      },
      {
        name: "Marketing Department",
        icon: Megaphone,
        people: [
          { name: "Sarah Mei Iglesia", title: "Marketing Head" },
          { name: "Ronald Lugtu", title: "Video Editor" },
          { name: "Angela Acosta", title: "Social Media Manager" },
        ],
      },
    ],
  },
  {
    id: "cosmetics",
    title: "Shantahl Cosmetics Business Unit",
    head: { name: "Junrey M. Japitan", title: "CEO / President" },
    groups: [
      { name: "Sales Department", icon: TrendingUp, people: [{ name: "Jerome Canas", title: "Social Media Manager" }] },
      {
        name: "Marketing Department",
        icon: Megaphone,
        people: [
          { name: "Loribel Garcia", title: "Head MMA" },
          { name: "Arnie Pangilinan", title: "Video Editor" },
        ],
      },
    ],
  },
  {
    id: "accounting",
    title: "Accounting Department",
    head: BOARD.vice,
    groups: [
      {
        name: "Accounting Department",
        icon: Settings,
        lead: { name: "Maricris Barlinan", title: "Chief Finance Officer" },
        people: [
          { name: "Wendie Halog", title: "Sr. Accounting Assistant" },
          { name: "Kathleen Surigao", title: "Accounting Clerk" },
          { name: "Charmaine Bumanlag", title: "Jr. Accounting Assistant" },
          { name: "Abigail Caluya", title: "Accounting Clerk" },
        ],
      },
    ],
  },
  {
    id: "finance",
    title: "Finance Department",
    head: BOARD.vice,
    groups: [
      {
        name: "Finance Department",
        icon: Settings,
        people: [
          { name: "Joan Mariette Santarina", title: "Corporate Treasurer" },
          { name: "Erika Grace Bulaclac", title: "Bookkeeper" },
        ],
      },
    ],
  },
  {
    id: "hr",
    title: "HR Department",
    head: BOARD.vice,
    groups: [{ name: "HR Department", icon: Settings, people: [{ name: "Sheena A. Evangelista", title: "HR Manager" }] }],
  },
  {
    id: "operations",
    title: "Operations Department",
    head: BOARD.vice,
    leads: [
      { name: "Marlyn Leonardo", title: "Operations Manager" },
      { name: "Jaimie Nucom", title: "Operations Supervisor" },
    ],
    aside: { name: "Cherry Ann Asuncion", title: "CSR" },
    groups: [
      {
        name: "Cabanatuan Branch",
        icon: Store,
        people: [
          { name: "Reynalyn Alfonso", title: "Cashier" },
          { name: "Ardee Santarina", title: "Cashier" },
          { name: "Jomari De Dios", title: "Warehouseman" },
        ],
      },
      {
        name: "Manila Branch",
        icon: Store,
        people: [
          { name: "Ma. Abegail Fatima Aboguin", title: "Branch Supervisor" },
          { name: "Dayanara Flores", title: "Cashier" },
          { name: "Jemuel Castillo", title: "Warehouseman" },
          { name: "Clover Riomalos", title: "Stockman" },
        ],
      },
      {
        name: "Cebu Branch",
        icon: Store,
        people: [
          { name: "Mary Jane Pedrano", title: "Branch Manager" },
          { name: "Karlou Japitan", title: "Branch Supervisor" },
          { name: "Leonilyn Talisic", title: "Cashier" },
          { name: "Jober Bersabal", title: "Warehouseman" },
          { name: "Ricky Malasa", title: "Stockman" },
        ],
      },
      {
        name: "Other Branches",
        icon: Store,
        people: [
          { name: "Daniel Bato", title: "Pangasinan Cashier" },
          { name: "Jebeth Guinto", title: "Lucena Cashier" },
          { name: "Gretchen De Sosa", title: "Cavite Cashier" },
          { name: "Catherine Mogato", title: "Bacolod Cashier" },
          { name: "Jemima Amestoso", title: "CDO Cashier" },
          { name: "Charles Villamor", title: "Davao Cashier" },
        ],
      },
    ],
  },
];

// Brand colours are fixed (not the app theme) so the chart looks like the
// official one in both light and dark mode.
const DARK = "#0a3326";
const BRIGHT = "#2e9e3f";
const barStyle = { background: `linear-gradient(90deg, ${DARK}, #0f4a2c)`, boxShadow: `inset 0 -5px 0 ${BRIGHT}` };

function IconBadge({ icon: Icon, size = "md", color = DARK }: { icon: LucideIcon; size?: "sm" | "md" | "lg"; color?: string }) {
  const box = size === "lg" ? "h-14 w-14" : size === "md" ? "h-11 w-11" : "h-9 w-9";
  const px = size === "lg" ? 26 : size === "md" ? 20 : 16;
  return (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-full text-white`} style={{ background: color, boxShadow: `0 0 0 3px ${BRIGHT}66` }}>
      <Icon size={px} />
    </span>
  );
}

// `label`: a heading such as "Business Units" rather than a person.
function HeadBar({ name, title, icon = User, size = "md", label = false }: { name: string; title?: string; icon?: LucideIcon; size?: "md" | "lg"; label?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 pb-3.5 text-white" style={barStyle}>
      <IconBadge icon={icon} size={size} />
      <div className="min-w-0 flex-1 text-center">
        <div className={`font-bold tracking-wide uppercase ${size === "lg" ? "text-base sm:text-lg" : "text-sm sm:text-base"}`}>{label ? name : shownName(name)}</div>
        {title && <div className="text-xs text-[#c7f0cf]">{title}</div>}
      </div>
    </div>
  );
}

// "Reports to Chairman", shown in place of the lines when they aren't drawn
// (one column on phones).
function DirectTag({ light = false }: { light?: boolean }) {
  return (
    <span
      className="mt-0.5 block w-fit rounded-full px-1.5 text-[10px] text-white group-data-[lines=on]/chart:hidden"
      style={{ background: light ? DARK : BRIGHT }}
    >
      Reports to Chairman
    </span>
  );
}

function PersonCard({ person, teamOf }: { person: Person; teamOf?: string }) {
  return (
    <div
      data-direct={person.direct}
      data-team={teamOf}
      className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] py-2 pr-3 pl-2"
      style={{ boxShadow: `inset 4px 0 0 ${BRIGHT}` }}
    >
      <span className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: DARK }}>
        <User size={16} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{shownName(person.name)}</span>
      <span className="w-[42%] shrink-0 border-l border-[var(--border-hairline)] pl-3 text-xs text-[var(--text-secondary)]">
        {person.title}
        {person.freelancer && <span className="mt-0.5 block w-fit rounded-full border border-[var(--border-hairline)] px-1.5 text-[10px] text-[var(--text-muted)]">Freelancer</span>}
        {person.direct && <DirectTag />}
      </span>
    </div>
  );
}

function Connector() {
  return <div className="mx-auto h-5 w-0.5" style={{ background: BRIGHT }} />;
}

function SectionTitle({ title, sub = "Organizational Structure" }: { title: string; sub?: string }) {
  return (
    <div className="mb-5 text-center">
      <h2 className="text-xl font-extrabold tracking-wide text-[var(--text-primary)] uppercase sm:text-2xl">{title}</h2>
      <div className="mx-auto mt-1 h-0.5 w-24 rounded" style={{ background: BRIGHT }} />
      <div className="mt-1.5 text-xs tracking-[0.2em] text-[var(--text-muted)] uppercase">{sub}</div>
    </div>
  );
}

function GroupColumn({ group }: { group: Group }) {
  return (
    <div className="min-w-0" data-column>
      <div className="flex items-center gap-3 rounded-xl px-3 py-2 pb-3 text-white" style={barStyle}>
        <IconBadge icon={group.icon} size="sm" />
        <div className="flex-1 text-center text-sm font-bold tracking-wide uppercase">{group.name}</div>
      </div>
      <div className="mt-2 space-y-2">
        {group.lead && (
          <>
            <PersonCard person={group.lead} />
            <div className="h-1" />
          </>
        )}
        {group.people?.map((p) => <PersonCard key={p.name} person={p} teamOf={group.team ? group.name : undefined} />)}
        {group.divisions?.map((d) => (
          <div key={d.name} className="space-y-2 pt-1">
            <div data-direct={d.direct} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-white" style={{ background: BRIGHT }}>
              <IconBadge icon={d.icon} size="sm" />
              <div className="flex-1 text-xs font-bold tracking-wide uppercase">
                {d.name}
                {d.direct && <DirectTag light />}
              </div>
            </div>
            {d.people.map((p) => (
              <PersonCard key={p.name} person={p} teamOf={d.team ? d.name : undefined} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// The official chart's lines, drawn over the laid-out cards:
// - from the unit head to each direct report: out of the head's side (or
//   down from it), along a trunk just inside the gap beside the card, then
//   across to the card's left or right side;
// - a bracket on the left of each team, joining its people.
// Only while the departments sit side by side; otherwise the cards say
// "Reports to Chairman" instead.
function useChartLines(enabled: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  useLayoutEffect(() => {
    const root = box.current;
    if (!enabled || !root || !head.current) return;
    const draw = () => {
      const o = root.getBoundingClientRect();
      const rel = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left - o.left, right: r.right - o.left, top: r.top - o.top, bottom: r.bottom - o.top, mid: r.top + r.height / 2 - o.top };
      };
      const columns = [...root.querySelectorAll("[data-column]")].map(rel);
      if (columns.length < 2 || columns.some((c) => Math.abs(c.top - columns[0].top) > 2)) return setPaths([]);
      const h = rel(head.current!);
      const r = 8; // corner radius
      const out: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>("[data-direct]")) {
        const c = rel(el);
        const side = el.dataset.direct as Side;
        // Trunk 14px into the gap on the joining side (gaps are 40px).
        const x = side === "right" ? c.right + 14 : c.left - 26;
        const end = side === "right" ? c.right : c.left;
        const toward = end > x ? r : -r;
        const last = `V ${c.mid - r} Q ${x} ${c.mid} ${x + toward} ${c.mid} H ${end}`;
        if (x < h.left + 24 || x > h.right - 24) {
          // Out of the head's side, then down.
          const fromRight = x > h.right - 24;
          const startX = fromRight ? h.right : h.left;
          const y = h.top + (h.bottom - h.top) / 2;
          out.push(`M ${startX} ${y} H ${x + (fromRight ? -r : r)} Q ${x} ${y} ${x} ${y + r} ${last}`);
        } else out.push(`M ${x} ${h.bottom} ${last}`);
      }
      const teams = new Map<string, ReturnType<typeof rel>[]>();
      for (const el of root.querySelectorAll<HTMLElement>("[data-team]")) teams.set(el.dataset.team!, [...(teams.get(el.dataset.team!) ?? []), rel(el)]);
      for (const cards of teams.values()) {
        if (cards.length < 2) continue;
        const x = cards[0].left - 10;
        const first = cards[0];
        const lastCard = cards[cards.length - 1];
        out.push(`M ${first.left} ${first.mid} H ${x + r} Q ${x} ${first.mid} ${x} ${first.mid + r} V ${lastCard.mid - r} Q ${x} ${lastCard.mid} ${x + r} ${lastCard.mid} H ${lastCard.left}`);
        for (const c of cards.slice(1, -1)) out.push(`M ${x} ${c.mid} H ${c.left}`);
      }
      setPaths(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(root);
    return () => ro.disconnect();
  }, [enabled]);
  return { box, head, paths };
}

function UnitSection({ unit }: { unit: Unit }) {
  const cols = unit.lines
    ? "md:grid-cols-4 md:min-w-[1000px] gap-x-10"
    : unit.groups.length >= 4
      ? "lg:grid-cols-2 2xl:grid-cols-4"
      : unit.groups.length === 3
        ? "lg:grid-cols-3"
        : unit.groups.length === 2
          ? "md:grid-cols-2"
          : "";
  const single = unit.groups.length === 1;
  const { box, head, paths } = useChartLines(!!unit.lines);
  return (
    <section id={unit.id} className="scroll-mt-20 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-1)]/40 p-4 sm:p-6">
      <SectionTitle title={unit.title} />
      <div className={unit.lines ? "-mx-2 overflow-x-auto px-2 pb-1" : undefined}>
        <div ref={box} data-lines={paths.length ? "on" : "off"} className={`group/chart relative ${unit.lines ? "md:min-w-[1000px]" : ""}`}>
          {paths.length > 0 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              {paths.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={BRIGHT} strokeOpacity={0.8} strokeWidth={2} />
              ))}
            </svg>
          )}
          <div ref={head} className={`mx-auto ${unit.lines ? "max-w-md" : "max-w-xl"}`}>
            <HeadBar name={unit.head.name} title={unit.head.title} size="lg" />
          </div>
          {/* With lines, more room under the head instead of the connector. */}
          {paths.length ? <div className="h-12" /> : <Connector />}
          {(unit.leads || unit.aside) && (
            <>
              <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-3 md:grid-cols-2">
                {unit.aside && (
                  <div className="md:order-first">
                    <PersonCard person={unit.aside} />
                  </div>
                )}
                <div className="space-y-2">{unit.leads?.map((p) => <PersonCard key={p.name} person={p} />)}</div>
              </div>
              <Connector />
            </>
          )}
          <div className={`grid grid-cols-1 gap-5 ${cols} ${single ? "mx-auto max-w-xl" : ""}`}>
            {unit.groups.map((g) => (
              <GroupColumn key={g.name} group={g} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Overview() {
  return (
    <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-1)]/40 p-4 sm:p-6">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-extrabold tracking-wide text-[var(--text-primary)] uppercase sm:text-3xl">Shantahl Direct Sales Inc</h1>
        <div className="mx-auto mt-1.5 h-0.5 w-40 rounded" style={{ background: BRIGHT }} />
        <div className="mt-1.5 text-xs tracking-[0.2em] text-[var(--text-muted)] uppercase">Organizational Structure</div>
      </div>
      <div className="mx-auto max-w-lg">
        <HeadBar name="Board of Directors" icon={Users} size="lg" label />
        <Connector />
        <HeadBar name={BOARD.chairman.name} title={BOARD.chairman.title} size="lg" />
        <Connector />
        <HeadBar name={BOARD.vice.name} title={BOARD.vice.title} size="lg" />
        <Connector />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <HeadBar name="Business Units" icon={Settings} label />
          <div className="mt-3 space-y-2.5 border-l-2 pl-4" style={{ borderColor: BRIGHT }}>
            {BUSINESS_UNITS.map((u) => (
              <a key={u.id} href={`#${u.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2 text-white transition-opacity hover:opacity-90" style={{ background: `linear-gradient(90deg, ${u.color}, ${u.color}cc)` }}>
                <IconBadge icon={u.icon} size="sm" color={u.color} />
                <span className="flex-1 text-center text-sm font-bold tracking-wide uppercase">{u.label}</span>
              </a>
            ))}
          </div>
        </div>
        <div>
          <HeadBar name="Shared Services" icon={Users} label />
          <div className="mt-3 space-y-2.5 border-l-2 pl-4" style={{ borderColor: BRIGHT }}>
            {SHARED_SERVICES.map((u) => (
              <a key={u.id} href={`#${u.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2 text-white transition-opacity hover:opacity-90" style={{ background: `linear-gradient(90deg, ${BRIGHT}, #3fb34f)` }}>
                <IconBadge icon={u.icon} size="sm" />
                <span className="flex-1 text-center text-sm font-bold tracking-wide uppercase">{u.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-[var(--text-muted)]">Tap a business unit or department to jump to its chart.</p>
    </section>
  );
}

export default function OrgChartPage() {
  // The chart below is Shantahl's; other companies get one drawn from their
  // 201 files until theirs is designed.
  if (currentCompany().id !== "sdsi") return <AutoOrgChart />;
  return (
    <div className="space-y-6">
      <Overview />
      {UNITS.map((u) => (
        <UnitSection key={u.id} unit={u} />
      ))}
    </div>
  );
}

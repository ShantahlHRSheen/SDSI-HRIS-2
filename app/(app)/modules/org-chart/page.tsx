"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Calculator,
  Camera,
  ChartColumn,
  Leaf,
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

// direct: reports straight to the unit head (a line is drawn to them).
type Person = { name: string; title: string; freelancer?: boolean; direct?: boolean };
type Division = { name: string; icon: LucideIcon; people: Person[] };
type Group = { name: string; icon: LucideIcon; lead?: Person; people?: Person[]; divisions?: Division[] };
type Unit = {
  id: string;
  title: string;
  head: { name: string; title?: string };
  leads?: Person[];
  aside?: Person;
  groups: Group[];
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
    head: { name: "Lowel B. Magdadaro", title: "Chairman / MLM Business Unit Head" },
    groups: [
      {
        name: "Netdev Department",
        icon: Network,
        people: [
          { name: "Romelito Domecillo", title: "Netdev Manager", direct: true },
          { name: "Chester Rosales", title: "Netdev Manager", direct: true },
          { name: "Randel Segovia", title: "Netdev Manager", direct: true },
          { name: "Mae Japitan", title: "Sales Manager", direct: true },
        ],
      },
      {
        name: "Sales Department",
        icon: ChartColumn,
        people: [
          { name: "Michelle Ignacio", title: "Sales Head", direct: true },
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
            people: [
              { name: "Jasmine Eusebio", title: "Marketing Head", direct: true },
              { name: "Erwin Carreon", title: "Social Media Manager" },
              { name: "Shane Garcia", title: "Social Media Manager" },
            ],
          },
          {
            name: "Creatives & Production Division",
            icon: Camera,
            people: [
              { name: "John Paul Michael Papa", title: "Head MMA", direct: true },
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

function HeadBar({ name, title, icon = User, size = "md" }: { name: string; title?: string; icon?: LucideIcon; size?: "md" | "lg" }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 pb-3.5 text-white" style={barStyle}>
      <IconBadge icon={icon} size={size} />
      <div className="min-w-0 flex-1 text-center">
        <div className={`font-bold tracking-wide uppercase ${size === "lg" ? "text-base sm:text-lg" : "text-sm sm:text-base"}`}>{name}</div>
        {title && <div className="text-xs text-[#c7f0cf]">{title}</div>}
      </div>
    </div>
  );
}

function PersonCard({ person }: { person: Person }) {
  return (
    <div
      data-direct={person.direct ? "" : undefined}
      className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] py-2 pr-3 pl-2"
      style={{ boxShadow: `inset 4px 0 0 ${BRIGHT}` }}
    >
      <span className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: DARK }}>
        <User size={16} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{person.name}</span>
      <span className="w-[42%] shrink-0 border-l border-[var(--border-hairline)] pl-3 text-xs text-[var(--text-secondary)]">
        {person.title}
        {person.freelancer && <span className="mt-0.5 block w-fit rounded-full border border-[var(--border-hairline)] px-1.5 text-[10px] text-[var(--text-muted)]">Freelancer</span>}
        {/* In one column (phones) the reporting lines aren't drawn — say it instead. */}
        {person.direct && (
          <span className="mt-0.5 block w-fit rounded-full px-1.5 text-[10px] text-white lg:hidden" style={{ background: BRIGHT }}>
            Reports to Chairman
          </span>
        )}
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
    <div className="min-w-0">
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
        {group.people?.map((p) => <PersonCard key={p.name} person={p} />)}
        {group.divisions?.map((d) => (
          <div key={d.name} className="space-y-2 pt-1">
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-white" style={{ background: BRIGHT }}>
              <IconBadge icon={d.icon} size="sm" />
              <div className="flex-1 text-xs font-bold tracking-wide uppercase">{d.name}</div>
            </div>
            {d.people.map((p) => <PersonCard key={p.name} person={p} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Lines from the unit head to the people reporting to them directly, drawn
// once the chart is laid out: down a trunk in the gap beside the person's
// column, then across to their card. Only while the columns sit side by side
// (lg and up); in one column the cards say "Reports to Chairman" instead.
function useDirectLines(enabled: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  useLayoutEffect(() => {
    const root = box.current;
    if (!enabled || !root || !head.current) return;
    const draw = () => {
      if (window.innerWidth < 1024) return setPaths([]);
      const o = root.getBoundingClientRect();
      const h = head.current!.getBoundingClientRect();
      const centre = h.left + h.width / 2 - o.left;
      const top = h.bottom - o.top;
      const half = 10; // half the column gap (gap-5)
      setPaths(
        [...root.querySelectorAll<HTMLElement>("[data-direct]")].map((el) => {
          const r = el.getBoundingClientRect();
          const left = r.left - o.left;
          const right = r.right - o.left;
          const y = r.top + r.height / 2 - o.top;
          // Columns right of the head's centre join on the card's left side;
          // the others on its right side. The two trunks sharing a gap sit
          // 3px apart.
          const onLeft = left > centre;
          const x = onLeft ? left - half + 3 : right + half - 3;
          const turn = onLeft ? 6 : -6;
          return `M ${x} ${top} V ${y - 6} Q ${x} ${y} ${x + turn} ${y} H ${onLeft ? left : right}`;
        }),
      );
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(root);
    return () => ro.disconnect();
  }, [enabled]);
  return { box, head, paths };
}

function UnitSection({ unit }: { unit: Unit }) {
  const cols = unit.groups.length >= 4 ? "lg:grid-cols-2 2xl:grid-cols-4" : unit.groups.length === 3 ? "lg:grid-cols-3" : unit.groups.length === 2 ? "md:grid-cols-2" : "";
  const single = unit.groups.length === 1;
  const hasDirect = unit.groups.some((g) => [...(g.people ?? []), ...(g.divisions ?? []).flatMap((d) => d.people)].some((p) => p.direct));
  const { box, head, paths } = useDirectLines(hasDirect);
  return (
    <section id={unit.id} className="scroll-mt-20 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-1)]/40 p-4 sm:p-6">
      <SectionTitle title={unit.title} />
      <div ref={box} className="relative">
        {paths.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={BRIGHT} strokeOpacity={0.8} strokeWidth={2} />
            ))}
          </svg>
        )}
        <div ref={head} className="mx-auto max-w-xl">
          <HeadBar name={unit.head.name} title={unit.head.title} size="lg" />
        </div>
        {/* The lines replace the single connector (kept for the spacing). */}
        <div className={paths.length ? "invisible" : undefined}>
          <Connector />
        </div>
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
        <HeadBar name="Board of Directors" icon={Users} size="lg" />
        <Connector />
        <HeadBar name={BOARD.chairman.name} title={BOARD.chairman.title} size="lg" />
        <Connector />
        <HeadBar name={BOARD.vice.name} title={BOARD.vice.title} size="lg" />
        <Connector />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <HeadBar name="Business Units" icon={Settings} />
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
          <HeadBar name="Shared Services" icon={Users} />
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
  return (
    <div className="space-y-6">
      <Overview />
      {UNITS.map((u) => (
        <UnitSection key={u.id} unit={u} />
      ))}
    </div>
  );
}

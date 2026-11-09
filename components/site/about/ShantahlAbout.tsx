import { Globe, Headset, HeartHandshake, Megaphone, Quote, Sparkles, Store, Users } from "lucide-react";

// Shantahl's About Us (from HR's company write-up), as designed sections:
// introduction, the founders' story and the name, the LSM Group, how the
// company works, its teams, its commitment and where it's going.

type Theme = { deep: string; mid: string; accent: string };

const TEAMS = ["Marketing", "Sales", "Operations", "Accounting", "Finance", "Human Resources"];

export function ShantahlAbout({ t }: { t: Theme }) {
  return (
    <div className="space-y-16">
      {/* Introduction */}
      <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-xs font-semibold tracking-[0.25em] uppercase" style={{ color: t.mid }}>
            About Us
          </p>
          <h2 className="mt-3 text-3xl leading-tight font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Building one of the country&rsquo;s leading direct-selling companies
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">Shantahl Direct Sales, Inc.</b> is an e-commerce company that aims to become one of the leading direct-selling companies in the country through both online and offline marketing.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Online", "Social media and e-commerce platforms"],
            ["Offline", "Traditional and face-to-face selling"],
            ["People", "Jobs and earning opportunities"],
            ["Worldwide", "Reaching communities in every country"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl p-4 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${t.deep}, ${t.mid})` }}>
              <div className="text-lg font-bold">{k}</div>
              <div className="mt-1 text-xs leading-snug text-white/80">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Our story */}
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="text-2xl font-bold text-[var(--text-primary)]">Our Story</h3>
          <div className="mt-2 h-1 w-12 rounded-full" style={{ background: t.mid }} />
          <p className="mt-5 leading-relaxed text-[var(--text-secondary)]">
            Shantahl was conceptualized through the vision and imagination of a wonderful couple, <b className="text-[var(--text-primary)]">Mr. Lowel B. Magdadaro</b> and <b className="text-[var(--text-primary)]">Ms. Sheilah A. Magdadaro</b>.
          </p>
          <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">
            In addition to the Magdadaro family&rsquo;s first business venture, the <b className="text-[var(--text-primary)]">LSM Group of Companies</b>, Shantahl Direct Sales, Inc. was established with the purpose of helping people — by providing employment opportunities and creating avenues for individuals who are interested in earning through the business of selling.
          </p>
        </div>
        <figure className="relative flex flex-col justify-center overflow-hidden rounded-2xl p-8 text-white shadow-md" style={{ background: `linear-gradient(140deg, ${t.deep}, ${t.mid})` }}>
          <Quote size={56} className="absolute -top-1 right-4 opacity-15" />
          <p className="text-xs font-semibold tracking-[0.25em] text-white/70 uppercase">The name behind the brand</p>
          <blockquote className="mt-4 text-xl leading-relaxed font-medium sm:text-2xl">
            The trademark <span style={{ color: t.accent }}>&ldquo;Shantahl&rdquo;</span> was derived from the name of their <i>unica hija</i> — their beloved only daughter.
          </blockquote>
          <figcaption className="mt-6 border-t border-white/20 pt-4">
            <div className="text-lg font-bold">Chloe Shantahl A. Magdadaro</div>
            <div className="text-sm text-white/70">The inspiration behind Shantahl</div>
          </figcaption>
        </figure>
      </div>

      {/* How we work */}
      <div>
        <h3 className="text-center text-2xl font-bold text-[var(--text-primary)]">How We Work</h3>
        <div className="mx-auto mt-2 h-1 w-12 rounded-full" style={{ background: t.mid }} />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Feature t={t} icon={<Megaphone size={22} />} title="Social Media Advertising">
            A unique system that combines social media advertising with a dedicated <b>Customer Support Team</b>, built like a call center, to keep pace with the fast-moving world of commerce and e-commerce.
          </Feature>
          <Feature t={t} icon={<Store size={22} />} title="Online and Offline Marketing">
            Social media and e-commerce platforms are our primary marketing tools, complemented by traditional sales strategies, including face-to-face selling.
          </Feature>
          <Feature t={t} icon={<Headset size={22} />} title="Continuous Growth">
            What started as a small group serving as a pilot project grew into a larger organization, with an increasing number of employees and a continuous commitment to innovation and improvement.
          </Feature>
        </div>
      </div>

      {/* Teams + commitment */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ background: t.mid }}>
              <Users size={20} />
            </span>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">Our Teams</h3>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">Dedicated departments that have become key strengths in supporting our operations in the growing e-commerce industry.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TEAMS.map((d) => (
              <span key={d} className="rounded-full border px-3 py-1 text-sm font-medium" style={{ borderColor: `${t.mid}55`, color: t.deep, background: `${t.accent}26` }}>
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ background: t.mid }}>
              <HeartHandshake size={20} />
            </span>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">Our Commitment</h3>
          </div>
          <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">
            Shantahl Direct Sales, Inc. aims to provide <b className="text-[var(--text-primary)]">quality products</b> that address the needs and preferences of individuals across different age groups and lifestyles.
          </p>
        </div>
      </div>

      {/* Looking ahead */}
      <div className="relative overflow-hidden rounded-2xl px-6 py-10 text-center text-white sm:px-12" style={{ background: `linear-gradient(120deg, ${t.deep}, ${t.mid})` }}>
        <Globe size={180} className="pointer-events-none absolute -right-10 -bottom-12 opacity-10" />
        <Sparkles size={28} className="mx-auto" style={{ color: t.accent }} />
        <p className="mx-auto mt-4 max-w-3xl text-xl leading-relaxed font-medium sm:text-2xl">
          We envision expanding our presence worldwide and reaching communities in every country through our <span style={{ color: t.accent }}>unique, innovative, and customer-focused</span> marketing approach.
        </p>
      </div>
    </div>
  );
}

function Feature({ t, icon, title, children }: { t: Theme; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border-hairline)] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${t.deep}, ${t.mid})` }}>
        {icon}
      </span>
      <h4 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)] [&_b]:text-[var(--text-primary)]">{children}</p>
    </div>
  );
}

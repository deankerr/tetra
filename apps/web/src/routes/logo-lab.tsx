import { createFileRoute } from '@tanstack/react-router'
import { AudioWaveform, Badge, Orbit, Sparkles, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'

import { LogoExplorationNav } from '@/components/logo-exploration-nav'

export const Route = createFileRoute('/logo-lab')({
  component: LogoLabRoute,
  head: () => ({
    meta: [
      {
        title: 'Tetra Logo Lab',
      },
    ],
  }),
})

// Logo concepts keep the current triangular sidebar mark as the raw material.
const concepts = [
  {
    badge: 'kinetic prism',
    className: 'concept-card concept-card--facet',
    detail: 'glass edges, scanning shimmer, denser geometry',
    fontClass: 'font-space',
    name: 'Facet Console',
    tone: 'calm control surface',
  },
  {
    badge: 'electric wordmark',
    className: 'concept-card concept-card--signal',
    detail: 'variable weight pulse, tiny bolt orbitals',
    fontClass: 'font-orbitron',
    name: 'Signal Core',
    tone: 'late-night systems energy',
  },
  {
    badge: 'editorial glyph',
    className: 'concept-card concept-card--room',
    detail: 'serif contrast, velvet prism, soft underline wake',
    fontClass: 'font-newsreader',
    name: 'Thinking Room',
    tone: 'warm research notebook',
  },
] as const

// Smaller title sketches test lockups that could sit in headers, docs, or splash states.
const lockups = [
  {
    className: 'lockup-chip lockup-chip--simple',
    eyebrow: 'original, amplified',
    label: 'Tetra',
    mark: 'mark-prism',
  },
  {
    className: 'lockup-chip lockup-chip--split',
    eyebrow: 'split voice',
    label: 'tetra',
    mark: 'mark-signal',
  },
  {
    className: 'lockup-chip lockup-chip--terminal',
    eyebrow: 'local-first prompt',
    label: 'TETRA',
    mark: 'mark-terminal',
  },
  {
    className: 'lockup-chip lockup-chip--editorial',
    eyebrow: 'soft title',
    label: 'Tetra',
    mark: 'mark-ink',
  },
] as const

// Animation notes are displayed as tiny control-surface readouts beside the moving marks.
const motionNotes = [
  {
    Icon: Orbit,
    label: 'orbit',
    value: 'slow satellite facets',
  },
  {
    Icon: AudioWaveform,
    label: 'pulse',
    value: 'letters breathe on idle',
  },
  {
    Icon: Zap,
    label: 'spark',
    value: 'hover kicks the prism',
  },
] as const

function LogoLabRoute() {
  return (
    <main className="logo-lab min-h-svh overflow-hidden bg-[#090c10] text-white">
      <LogoLabStyles />

      {/* Ambient depth makes the canvas feel intentionally separate from the app shell. */}
      <div className="logo-lab__aura logo-lab__aura--teal" />
      <div className="logo-lab__aura logo-lab__aura--rose" />
      <div className="logo-lab__grid" />

      {/* The shared switcher keeps all logo studies available from every exploration page. */}
      <header className="logo-lab__header">
        <LogoExplorationNav active="logo" />
      </header>

      {/* Hero explores the largest, most detailed interpretation of the current sidebar mark. */}
      <section className="logo-lab__hero">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="logo-lab__hero-copy"
          initial={{ opacity: 0, y: 22 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <span className="logo-lab__kicker">
            from tiny sidebar diamond to full identity toybox
          </span>
          <h1 className="logo-lab__title">
            <span>Tetra</span>
            <span aria-hidden className="logo-lab__title-shadow">
              Tetra
            </span>
          </h1>
          <p className="logo-lab__summary">
            Big marks, odd lockups, animated title treatments, and a few directions that lean into
            the local-first power-user mood.
          </p>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          className="logo-lab__hero-mark"
          initial={{ opacity: 0, rotate: -8, scale: 0.86 }}
          transition={{ delay: 0.1, duration: 0.8, ease: 'easeOut' }}
        >
          <div className="logo-lab__mark-halo" />
          <TetraPrism className="logo-lab__giant-prism" detailed />
          <div className="logo-lab__satellite logo-lab__satellite--one" />
          <div className="logo-lab__satellite logo-lab__satellite--two" />
          <div className="logo-lab__satellite logo-lab__satellite--three" />
        </motion.div>
      </section>

      {/* Concept cards contrast different font and animation personalities. */}
      <section className="logo-lab__concepts">
        {concepts.map((concept, index) => (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className={concept.className}
            initial={{ opacity: 0, y: 24 }}
            key={concept.name}
            transition={{ delay: 0.12 * index, duration: 0.58, ease: 'easeOut' }}
          >
            <div className="concept-card__stage">
              <TetraPrism className="concept-card__prism" detailed />
              <div className="concept-card__ring" />
              <div className="concept-card__scan" />
            </div>
            <div className="concept-card__body">
              <span className="concept-card__badge">{concept.badge}</span>
              <h2 className={`concept-card__title ${concept.fontClass}`}>{concept.name}</h2>
              <p>{concept.detail}</p>
              <small>{concept.tone}</small>
            </div>
          </motion.article>
        ))}
      </section>

      {/* Lockups test compact marks that can survive beside navigation and session lists. */}
      <section className="logo-lab__lockups">
        {lockups.map((lockup) => (
          <div className={lockup.className} key={lockup.label + lockup.eyebrow}>
            <span className={lockup.mark}>
              <TetraPrism className="size-8" />
            </span>
            <div>
              <small>{lockup.eyebrow}</small>
              <strong>{lockup.label}</strong>
            </div>
          </div>
        ))}
      </section>

      {/* Bottom strip puts animation behavior and typography specimens in one glance. */}
      <section className="logo-lab__specimens">
        <div className="motion-panel">
          <div className="motion-panel__mark">
            <TetraPrism className="size-20" detailed />
            <Sparkles className="motion-panel__spark motion-panel__spark--one" />
            <Sparkles className="motion-panel__spark motion-panel__spark--two" />
          </div>
          <div className="motion-panel__notes">
            {motionNotes.map(({ Icon, label, value }) => (
              <div className="motion-panel__note" key={label}>
                <Icon className="size-4" />
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="type-panel">
          {['T', 'e', 't', 'r', 'a'].map((letter, index) => (
            <span
              className={`type-panel__letter type-panel__letter--${index}`}
              key={letter + index}
            >
              {letter}
            </span>
          ))}
          <div className="type-panel__caption">
            <Badge className="size-4" />
            <span>variable title weight, per-letter hover rhythm</span>
          </div>
        </div>
      </section>
    </main>
  )
}

function TetraPrism({ className, detailed = false }: { className?: string; detailed?: boolean }) {
  // SVG ids must be unique because the mark appears many times on the same route.
  const id = useId().replaceAll(':', '')

  return (
    <svg className={className} viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
      {/* Base facets preserve the current three-triangle Tetra shape. */}
      <defs>
        <linearGradient id={`${id}-left`} x1="22" x2="92" y1="138" y2="8">
          <stop stopColor="#0f766e" />
          <stop offset="1" stopColor="#67e8f9" />
        </linearGradient>
        <linearGradient id={`${id}-right`} x1="82" x2="142" y1="10" y2="138">
          <stop stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={`${id}-base`} x1="18" x2="144" y1="132" y2="132">
          <stop stopColor="#5eead4" />
          <stop offset="0.5" stopColor="#a7f3d0" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <filter
          id={`${id}-glow`}
          colorInterpolationFilters="sRGB"
          x="-35%"
          y="-35%"
          width="170%"
          height="170%"
        >
          <feGaussianBlur stdDeviation="5" />
          <feColorMatrix values="0 0 0 0 0.2 0 0 0 0 0.95 0 0 0 0 0.9 0 0 0 0.6 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Expanded facets add enough surface area for logo-scale use. */}
      <g filter={detailed ? `url(#${id}-glow)` : undefined}>
        <polygon fill={`url(#${id}-left)`} points="80,8 16,140 80,96" />
        <polygon fill={`url(#${id}-right)`} points="80,8 80,96 144,140" />
        <polygon fill={`url(#${id}-base)`} points="16,140 144,140 80,96" />
        {detailed ? (
          <>
            <path
              d="M80 8 L80 96 L48 126"
              fill="none"
              stroke="rgba(255,255,255,0.48)"
              strokeWidth="2"
            />
            <path d="M80 96 L116 126" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="2" />
            <path
              d="M44 84 L80 96 L116 84"
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="2"
            />
            <circle cx="80" cy="96" fill="#ecfeff" r="3.4" />
          </>
        ) : null}
      </g>
    </svg>
  )
}

function LogoLabStyles() {
  return (
    <style>{`
      .logo-lab {
        font-family: 'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif;
        position: relative;
      }

      .font-newsreader {
        font-family: 'Newsreader Variable', ui-serif, Georgia, serif;
      }

      .font-orbitron {
        font-family: 'Orbitron Variable', ui-sans-serif, system-ui, sans-serif;
      }

      .font-space {
        font-family: 'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif;
      }

      .logo-lab__aura,
      .logo-lab__grid {
        pointer-events: none;
        position: absolute;
      }

      .logo-lab__aura {
        border-radius: 999px;
        filter: blur(36px);
        opacity: 0.62;
      }

      .logo-lab__aura--teal {
        animation: logoAura 9s ease-in-out infinite alternate;
        background: #12d6c0;
        height: 340px;
        right: 6vw;
        top: -110px;
        width: 340px;
      }

      .logo-lab__aura--rose {
        animation: logoAura 11s ease-in-out infinite alternate-reverse;
        background: #f472b6;
        bottom: 8vh;
        height: 260px;
        left: -100px;
        width: 260px;
      }

      .logo-lab__grid {
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px);
        background-size: 42px 42px;
        inset: 0;
        mask-image: radial-gradient(circle at 50% 20%, black, transparent 76%);
      }

      .logo-lab__header,
      .logo-lab__hero,
      .logo-lab__concepts,
      .logo-lab__lockups,
      .logo-lab__specimens {
        margin-inline: auto;
        max-width: 1200px;
        position: relative;
        width: min(calc(100% - 48px), 1200px);
        z-index: 1;
      }

      .logo-lab__header {
        align-items: center;
        display: flex;
        justify-content: space-between;
        padding-block: 24px 18px;
      }

      .logo-lab__hero {
        align-items: center;
        display: grid;
        gap: 48px;
        grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
        min-height: 470px;
        padding-block: 38px 54px;
      }

      .logo-lab__kicker {
        color: #7dd3fc;
        display: block;
        font-size: 13px;
        font-weight: 650;
        margin-bottom: 16px;
        text-transform: uppercase;
      }

      .logo-lab__title {
        font-family: 'Orbitron Variable', ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(86px, 12vw, 166px);
        font-weight: 800;
        letter-spacing: 0;
        line-height: 0.82;
        position: relative;
        text-transform: uppercase;
      }

      .logo-lab__title > span:first-child {
        background: linear-gradient(100deg, #ecfeff 0%, #67e8f9 34%, #c084fc 62%, #fef08a 100%);
        background-clip: text;
        color: transparent;
        display: block;
        filter: drop-shadow(0 20px 36px rgba(34, 211, 238, 0.18));
      }

      .logo-lab__title-shadow {
        color: transparent;
        inset: 10px auto auto 12px;
        opacity: 0.22;
        position: absolute;
        -webkit-text-stroke: 1px #67e8f9;
      }

      .logo-lab__summary {
        color: rgba(255, 255, 255, 0.68);
        font-family: 'Newsreader Variable', ui-serif, Georgia, serif;
        font-size: 23px;
        line-height: 1.35;
        margin-top: 24px;
        max-width: 620px;
      }

      .logo-lab__hero-mark {
        aspect-ratio: 1;
        display: grid;
        isolation: isolate;
        place-items: center;
        position: relative;
      }

      .logo-lab__mark-halo {
        animation: logoHalo 6s linear infinite;
        aspect-ratio: 1;
        background:
          conic-gradient(from 120deg, transparent 0 12%, #22d3ee 19%, transparent 30% 48%, #f0abfc 58%, transparent 70% 100%),
          radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 64%);
        border-radius: 999px;
        inset: 8%;
        mask-image: radial-gradient(circle, transparent 0 47%, black 48% 54%, transparent 55%);
        position: absolute;
        z-index: -1;
      }

      .logo-lab__giant-prism {
        animation: prismFloat 4.8s ease-in-out infinite;
        width: min(82%, 390px);
      }

      .logo-lab__satellite {
        animation: satelliteOrbit 8s linear infinite;
        background: #ecfeff;
        border-radius: 999px;
        box-shadow: 0 0 24px currentColor;
        height: 10px;
        left: 50%;
        position: absolute;
        top: 50%;
        transform-origin: -130px -130px;
        width: 10px;
      }

      .logo-lab__satellite--two {
        animation-delay: -2.4s;
        color: #f0abfc;
        transform-origin: 120px -118px;
      }

      .logo-lab__satellite--three {
        animation-delay: -5s;
        color: #fef08a;
        transform-origin: -92px 132px;
      }

      .logo-lab__concepts {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .concept-card {
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03)),
          radial-gradient(circle at 34% 18%, var(--glow), transparent 45%);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.28);
        min-height: 420px;
        overflow: hidden;
        padding: 22px;
        position: relative;
      }

      .concept-card--facet {
        --accent: #7dd3fc;
        --glow: rgba(45, 212, 191, 0.44);
      }

      .concept-card--room {
        --accent: #fb7185;
        --glow: rgba(251, 113, 133, 0.34);
      }

      .concept-card--signal {
        --accent: #facc15;
        --glow: rgba(250, 204, 21, 0.32);
      }

      .concept-card:hover .concept-card__prism {
        transform: rotate(-7deg) scale(1.06);
      }

      .concept-card__stage {
        align-items: center;
        display: flex;
        height: 190px;
        justify-content: center;
        position: relative;
      }

      .concept-card__prism {
        position: relative;
        transition: transform 480ms ease;
        width: 148px;
        z-index: 1;
      }

      .concept-card__ring {
        animation: logoHalo 7s linear infinite;
        aspect-ratio: 1;
        border: 1px solid color-mix(in oklch, var(--accent), transparent 30%);
        border-radius: 999px;
        position: absolute;
        width: 176px;
      }

      .concept-card__scan {
        animation: scanLine 3.4s ease-in-out infinite;
        background: linear-gradient(90deg, transparent, color-mix(in oklch, var(--accent), white 34%), transparent);
        height: 2px;
        left: -30%;
        opacity: 0.72;
        position: absolute;
        top: 46%;
        width: 160%;
      }

      .concept-card__body {
        display: grid;
        gap: 12px;
      }

      .concept-card__badge {
        color: var(--accent);
        font-size: 11px;
        font-weight: 760;
        text-transform: uppercase;
      }

      .concept-card__title {
        color: white;
        font-size: 34px;
        font-weight: 780;
        line-height: 0.95;
      }

      .concept-card p {
        color: rgba(255, 255, 255, 0.68);
        font-size: 15px;
        line-height: 1.45;
      }

      .concept-card small {
        color: rgba(255, 255, 255, 0.42);
        font-size: 12px;
      }

      .logo-lab__lockups {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        padding-block: 18px;
      }

      .lockup-chip {
        align-items: center;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.11);
        border-radius: 8px;
        display: flex;
        gap: 14px;
        min-height: 88px;
        padding: 16px;
      }

      .lockup-chip small {
        color: rgba(255, 255, 255, 0.42);
        display: block;
        font-size: 11px;
        margin-bottom: 2px;
      }

      .lockup-chip strong {
        display: block;
        font-size: 28px;
        line-height: 1;
      }

      .lockup-chip--simple strong {
        font-family: 'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif;
      }

      .lockup-chip--split strong {
        color: #67e8f9;
        font-family: 'Orbitron Variable', ui-sans-serif, system-ui, sans-serif;
        text-transform: lowercase;
      }

      .lockup-chip--terminal strong {
        color: #bef264;
        font-family: 'Orbitron Variable', ui-sans-serif, system-ui, sans-serif;
        font-size: 23px;
      }

      .lockup-chip--editorial strong {
        font-family: 'Newsreader Variable', ui-serif, Georgia, serif;
        font-size: 33px;
        font-style: italic;
      }

      .mark-prism,
      .mark-signal,
      .mark-terminal,
      .mark-ink {
        display: grid;
        place-items: center;
      }

      .mark-signal {
        animation: prismFloat 3s ease-in-out infinite;
      }

      .mark-terminal {
        filter: hue-rotate(65deg) saturate(1.25);
      }

      .mark-ink {
        filter: hue-rotate(145deg) saturate(0.9);
      }

      .logo-lab__specimens {
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
        padding-bottom: 34px;
      }

      .motion-panel,
      .type-panel {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        min-height: 230px;
        overflow: hidden;
        position: relative;
      }

      .motion-panel {
        align-items: center;
        display: grid;
        gap: 18px;
        grid-template-columns: 160px 1fr;
        padding: 24px;
      }

      .motion-panel__mark {
        display: grid;
        min-height: 160px;
        place-items: center;
        position: relative;
      }

      .motion-panel__mark svg:first-child {
        animation: prismKick 2.8s ease-in-out infinite;
      }

      .motion-panel__spark {
        color: #fde68a;
        position: absolute;
      }

      .motion-panel__spark--one {
        animation: twinkle 1.7s ease-in-out infinite;
        right: 22px;
        top: 18px;
      }

      .motion-panel__spark--two {
        animation: twinkle 2.2s ease-in-out infinite reverse;
        bottom: 26px;
        left: 18px;
      }

      .motion-panel__notes {
        display: grid;
        gap: 10px;
      }

      .motion-panel__note {
        align-items: center;
        display: grid;
        gap: 10px;
        grid-template-columns: 18px 52px 1fr;
      }

      .motion-panel__note svg,
      .motion-panel__note span {
        color: rgba(255, 255, 255, 0.48);
      }

      .motion-panel__note span {
        font-size: 12px;
        text-transform: uppercase;
      }

      .motion-panel__note strong {
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
        font-weight: 520;
      }

      .type-panel {
        align-items: center;
        display: flex;
        gap: 0;
        justify-content: center;
        padding: 28px;
      }

      .type-panel__letter {
        animation: titleWave 2.8s ease-in-out infinite;
        color: #f8fafc;
        display: inline-block;
        font-family: 'Newsreader Variable', ui-serif, Georgia, serif;
        font-size: clamp(72px, 9vw, 132px);
        font-style: italic;
        font-variation-settings: 'wght' 760, 'opsz' 48;
        line-height: 0.82;
        text-shadow: 0 18px 35px rgba(45, 212, 191, 0.2);
      }

      .type-panel__letter--0 {
        animation-delay: 0ms;
      }

      .type-panel__letter--1 {
        animation-delay: 120ms;
      }

      .type-panel__letter--2 {
        animation-delay: 240ms;
      }

      .type-panel__letter--3 {
        animation-delay: 360ms;
      }

      .type-panel__letter--4 {
        animation-delay: 480ms;
      }

      .type-panel__letter:nth-child(2n) {
        color: #67e8f9;
        font-family: 'Orbitron Variable', ui-sans-serif, system-ui, sans-serif;
        font-style: normal;
      }

      .type-panel__caption {
        align-items: center;
        bottom: 18px;
        color: rgba(255, 255, 255, 0.46);
        display: flex;
        font-size: 12px;
        gap: 8px;
        left: 20px;
        position: absolute;
      }

      @media (max-width: 980px) {
        .logo-lab__hero,
        .logo-lab__specimens {
          grid-template-columns: 1fr;
        }

        .logo-lab__concepts,
        .logo-lab__lockups {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 680px) {
        .logo-lab__header,
        .logo-lab__hero,
        .logo-lab__concepts,
        .logo-lab__lockups,
        .logo-lab__specimens {
          width: min(calc(100% - 28px), 1200px);
        }

        .logo-lab__header,
        .motion-panel {
          align-items: stretch;
          grid-template-columns: 1fr;
        }

        .logo-lab__header {
          display: grid;
          gap: 10px;
        }

        .logo-lab__hero {
          gap: 24px;
          min-height: 0;
          padding-block: 18px 28px;
        }

        .logo-lab__title {
          font-size: 58px;
        }

        .logo-lab__summary {
          font-size: 18px;
        }

        .logo-lab__satellite {
          display: none;
        }

        .logo-lab__concepts,
        .logo-lab__lockups {
          grid-template-columns: 1fr;
        }

        .type-panel {
          min-height: 190px;
        }

        .type-panel__letter {
          font-size: 56px;
        }
      }

      @keyframes logoAura {
        from {
          transform: translate3d(0, 0, 0) scale(1);
        }
        to {
          transform: translate3d(28px, 18px, 0) scale(1.08);
        }
      }

      @keyframes logoHalo {
        to {
          transform: rotate(1turn);
        }
      }

      @keyframes prismFloat {
        0%,
        100% {
          transform: translateY(0) rotate(0deg);
        }
        50% {
          transform: translateY(-12px) rotate(3deg);
        }
      }

      @keyframes prismKick {
        0%,
        100% {
          transform: rotate(0deg) scale(1);
        }
        42% {
          transform: rotate(-8deg) scale(1.08);
        }
        58% {
          transform: rotate(5deg) scale(0.98);
        }
      }

      @keyframes satelliteOrbit {
        to {
          rotate: 1turn;
        }
      }

      @keyframes scanLine {
        0%,
        100% {
          transform: translateX(-30%) rotate(-4deg);
        }
        50% {
          transform: translateX(30%) rotate(4deg);
        }
      }

      @keyframes titleWave {
        0%,
        100% {
          font-variation-settings: 'wght' 560, 'opsz' 22;
          transform: translateY(0);
        }
        50% {
          font-variation-settings: 'wght' 850, 'opsz' 54;
          transform: translateY(-10px);
        }
      }

      @keyframes twinkle {
        0%,
        100% {
          opacity: 0.3;
          transform: scale(0.8) rotate(0deg);
        }
        50% {
          opacity: 1;
          transform: scale(1.18) rotate(18deg);
        }
      }
    `}</style>
  )
}

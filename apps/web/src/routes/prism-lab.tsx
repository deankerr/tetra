import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useId } from 'react'

import { LogoExplorationNav } from '@/components/logo-exploration-nav'

export const Route = createFileRoute('/prism-lab')({
  component: PrismLabRoute,
  head: () => ({
    meta: [
      {
        title: 'Tetra Prism Lab',
      },
    ],
  }),
})

// Directions are intentionally material-led: prism, wire, light, mono, and z-depth.
const studies = [
  {
    className: 'material-card material-card--opal',
    label: 'gradient gem',
    title: 'Opal Core',
    words: 'wet light, soft refraction, saturated edges',
  },
  {
    className: 'material-card material-card--mono',
    label: 'monochrome',
    title: 'Black Ice',
    words: 'same geometry, almost no color, more symbol than jewel',
  },
  {
    className: 'material-card material-card--wire',
    label: 'wireframe',
    title: 'Axis Mesh',
    words: 'construction lines, readable z-axis, math without coldness',
  },
  {
    className: 'material-card material-card--beam',
    label: 'light',
    title: 'Split Beam',
    words: 'tetrahedron as prism, title cut by spectral light',
  },
] as const

function PrismLabRoute() {
  return (
    <main className="prism-lab min-h-svh overflow-hidden bg-[#070808] text-white">
      <PrismLabStyles />

      {/* Fine-grain stage lighting replaces icons and app chrome. */}
      <div className="prism-lab__grain" />
      <div className="prism-lab__beam prism-lab__beam--cyan" />
      <div className="prism-lab__beam prism-lab__beam--white" />

      {/* The shared switcher keeps all logo studies available from every exploration page. */}
      <header className="prism-lab__rail">
        <LogoExplorationNav active="prism" />
      </header>

      {/* Hero explores the tetrahedron as a dimensional object, not a flat badge. */}
      <section className="prism-hero">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="prism-hero__copy"
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <span className="prism-hero__kicker">gems / prisms / wire / z-axis</span>
          <h1 className="prism-hero__title">
            <span className="prism-hero__title-main">Tetra</span>
            <span aria-hidden className="prism-hero__title-ghost">
              Tetra
            </span>
          </h1>
          <p>
            Keep the simple tetrahedron idea, but let the mark behave like a physical thing:
            polished, skeletal, split by light, or reduced to a dark cut in glass.
          </p>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, rotateX: 58, rotateZ: -42, y: 0 }}
          className="z-tetra"
          initial={{ opacity: 0, rotateX: 52, rotateZ: -30, y: 24 }}
          transition={{ delay: 0.08, duration: 0.8, ease: 'easeOut' }}
        >
          <div className="z-tetra__axis z-tetra__axis--x" />
          <div className="z-tetra__axis z-tetra__axis--y" />
          <div className="z-tetra__axis z-tetra__axis--z" />
          <div className="z-tetra__shadow" />
          <div className="z-tetra__face z-tetra__face--front" />
          <div className="z-tetra__face z-tetra__face--left" />
          <div className="z-tetra__face z-tetra__face--right" />
          <div className="z-tetra__edge z-tetra__edge--one" />
          <div className="z-tetra__edge z-tetra__edge--two" />
          <div className="z-tetra__edge z-tetra__edge--three" />
        </motion.div>
      </section>

      {/* Material cards compare how much color and detail the mark can tolerate. */}
      <section className="material-grid">
        {studies.map((study, index) => (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className={study.className}
            initial={{ opacity: 0, y: 22 }}
            key={study.title}
            transition={{ delay: 0.08 * index, duration: 0.55, ease: 'easeOut' }}
          >
            <div className="material-card__stage">
              <StudyMark mode={study.label} />
            </div>
            <div className="material-card__text">
              <span>{study.label}</span>
              <h2>{study.title}</h2>
              <p>{study.words}</p>
            </div>
          </motion.article>
        ))}
      </section>

      {/* Wordmark strip tests title styling without leaning on external icons. */}
      <section className="wordmark-strip">
        <div className="wordmark-strip__spec wordmark-strip__spec--cut">
          <span>Tetra</span>
          <small>faceted grotesque</small>
        </div>
        <div className="wordmark-strip__spec wordmark-strip__spec--serif">
          <span>Tetra</span>
          <small>weird-serif editorial gem</small>
        </div>
        <div className="wordmark-strip__spec wordmark-strip__spec--wire">
          <span>Tetra</span>
          <small>monoline construction</small>
        </div>
      </section>
    </main>
  )
}

function StudyMark({ mode }: { mode: string }) {
  const id = useId().replaceAll(':', '')

  return (
    <svg className="study-mark" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
      {/* Each specimen reuses the same tetrahedron silhouette with different material logic. */}
      <defs>
        <linearGradient id={`${id}-opal-left`} x1="36" x2="118" y1="184" y2="24">
          <stop stopColor="#e0f2fe" />
          <stop offset="0.44" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#f0abfc" />
        </linearGradient>
        <linearGradient id={`${id}-opal-right`} x1="108" x2="184" y1="20" y2="184">
          <stop stopColor="#fef3c7" />
          <stop offset="0.45" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={`${id}-opal-base`} x1="34" x2="188" y1="180" y2="180">
          <stop stopColor="#f8fafc" />
          <stop offset="0.5" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
          <feColorMatrix values="0 0 0 0 0.52 0 0 0 0 0.98 0 0 0 0 0.94 0 0 0 0.6 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* A material-specific backdrop lets the same geometry swing between moods. */}
      {mode === 'wireframe' ? (
        <g className="study-mark__wire">
          <path d="M110 20 L30 190 L110 124 Z" />
          <path d="M110 20 L110 124 L190 190 Z" />
          <path d="M30 190 L190 190 L110 124 Z" />
          <path d="M30 190 L110 20 L190 190" />
          <path d="M62 112 L110 124 L158 112" />
          <circle cx="110" cy="124" r="4" />
        </g>
      ) : null}

      {mode === 'monochrome' ? (
        <g className="study-mark__mono" filter={`url(#${id}-blur)`}>
          <polygon points="110,20 30,190 110,124" />
          <polygon points="110,20 110,124 190,190" />
          <polygon points="30,190 190,190 110,124" />
          <path d="M110 20 L110 124 L74 162" />
          <path d="M110 124 L150 162" />
        </g>
      ) : null}

      {mode !== 'monochrome' && mode !== 'wireframe' ? (
        <g filter={`url(#${id}-blur)`}>
          <polygon fill={`url(#${id}-opal-left)`} points="110,20 30,190 110,124" />
          <polygon fill={`url(#${id}-opal-right)`} points="110,20 110,124 190,190" />
          <polygon fill={`url(#${id}-opal-base)`} points="30,190 190,190 110,124" />
          <path
            d="M110 20 L110 124 L74 162"
            fill="none"
            stroke="rgba(255,255,255,0.56)"
            strokeWidth="3"
          />
          <path d="M110 124 L150 162" fill="none" stroke="rgba(255,255,255,0.36)" strokeWidth="3" />
          <circle cx="110" cy="124" fill="#ffffff" r="4" />
        </g>
      ) : null}

      {mode === 'light' ? <path className="study-mark__spectrum" d="M0 112 L220 82" /> : null}
      {mode === 'gradient gem' ? (
        <ellipse className="study-mark__caustic" cx="110" cy="194" rx="62" ry="13" />
      ) : null}
    </svg>
  )
}

function PrismLabStyles() {
  return (
    <style>{`
      .prism-lab {
        font-family: 'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif;
        position: relative;
      }

      .prism-lab__grain,
      .prism-lab__beam {
        pointer-events: none;
        position: absolute;
      }

      .prism-lab__grain {
        background:
          linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
          radial-gradient(circle at 72% 18%, rgba(255, 255, 255, 0.12), transparent 28%),
          radial-gradient(circle at 22% 74%, rgba(14, 165, 233, 0.2), transparent 30%);
        background-size: 48px 48px, 48px 48px, auto, auto;
        inset: 0;
        mask-image: radial-gradient(circle at 50% 25%, black, transparent 84%);
      }

      .prism-lab__beam {
        filter: blur(24px);
        opacity: 0.7;
        transform-origin: top;
      }

      .prism-lab__beam--cyan {
        background: linear-gradient(180deg, rgba(34, 211, 238, 0.55), transparent);
        height: 780px;
        right: 21%;
        top: -170px;
        transform: rotate(31deg);
        width: 120px;
      }

      .prism-lab__beam--white {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.3), transparent);
        height: 520px;
        left: 12%;
        top: -160px;
        transform: rotate(-24deg);
        width: 72px;
      }

      .prism-lab__rail,
      .prism-hero,
      .material-grid,
      .wordmark-strip {
        margin-inline: auto;
        max-width: 1240px;
        position: relative;
        width: min(calc(100% - 48px), 1240px);
        z-index: 1;
      }

      .prism-lab__rail {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding-block: 28px 12px;
      }

      .prism-hero {
        align-items: center;
        display: grid;
        gap: 42px;
        grid-template-columns: minmax(0, 0.96fr) minmax(410px, 1.04fr);
        min-height: 620px;
        perspective: 1000px;
        padding-block: 42px 64px;
      }

      .prism-hero__kicker {
        color: rgba(186, 230, 253, 0.82);
        display: block;
        font-size: 13px;
        font-weight: 760;
        margin-bottom: 18px;
        text-transform: uppercase;
      }

      .prism-hero__title {
        display: grid;
        font-size: clamp(86px, 12vw, 172px);
        font-weight: 820;
        letter-spacing: 0;
        line-height: 0.78;
        position: relative;
      }

      .prism-hero__title-main {
        background:
          linear-gradient(95deg, #ffffff 0%, #dbeafe 28%, #67e8f9 42%, #ffffff 55%, #94a3b8 100%),
          linear-gradient(180deg, transparent 0 47%, rgba(255, 255, 255, 0.55) 47% 50%, transparent 50%);
        background-clip: text;
        color: transparent;
        filter: drop-shadow(0 26px 50px rgba(125, 211, 252, 0.18));
        font-family: 'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif;
        font-variation-settings: 'wght' 820;
      }

      .prism-hero__title-ghost {
        color: transparent;
        inset: 13px auto auto 15px;
        opacity: 0.22;
        position: absolute;
        -webkit-text-stroke: 1px rgba(255, 255, 255, 0.6);
      }

      .prism-hero p {
        color: rgba(255, 255, 255, 0.62);
        font-size: 22px;
        line-height: 1.42;
        margin-top: 28px;
        max-width: 620px;
      }

      .z-tetra {
        aspect-ratio: 1;
        display: grid;
        margin-inline: auto;
        place-items: center;
        position: relative;
        transform-style: preserve-3d;
        width: min(82vw, 560px);
      }

      .z-tetra__shadow {
        animation: zShadow 5s ease-in-out infinite;
        background: radial-gradient(ellipse, rgba(103, 232, 249, 0.36), transparent 66%);
        border-radius: 999px;
        height: 120px;
        position: absolute;
        transform: translate3d(0, 120px, -130px) rotateX(88deg);
        width: 360px;
      }

      .z-tetra__face {
        clip-path: polygon(50% 0, 0 100%, 100% 100%);
        height: 350px;
        position: absolute;
        transform-origin: 50% 74%;
        width: 350px;
      }

      .z-tetra__face--front {
        animation: facePulse 5s ease-in-out infinite;
        background: linear-gradient(135deg, rgba(236, 254, 255, 0.92), rgba(20, 184, 166, 0.76) 42%, rgba(14, 165, 233, 0.22));
        border: 1px solid rgba(255, 255, 255, 0.42);
        transform: translateZ(72px);
      }

      .z-tetra__face--left {
        background: linear-gradient(140deg, rgba(255, 255, 255, 0.72), rgba(34, 211, 238, 0.18));
        transform: rotateY(-62deg) translateZ(14px);
      }

      .z-tetra__face--right {
        background: linear-gradient(30deg, rgba(168, 85, 247, 0.42), rgba(255, 255, 255, 0.16));
        transform: rotateY(62deg) translateZ(14px);
      }

      .z-tetra__axis {
        background: rgba(255, 255, 255, 0.3);
        height: 1px;
        position: absolute;
        width: 580px;
      }

      .z-tetra__axis--x {
        transform: rotateZ(28deg) translateZ(-80px);
      }

      .z-tetra__axis--y {
        transform: rotateZ(-30deg) translateZ(-80px);
      }

      .z-tetra__axis--z {
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.75), transparent);
        transform: rotateZ(90deg) rotateY(62deg) translateZ(-80px);
      }

      .z-tetra__edge {
        background: rgba(255, 255, 255, 0.68);
        height: 2px;
        position: absolute;
        transform-origin: left;
        width: 330px;
      }

      .z-tetra__edge--one {
        transform: translate3d(-108px, 70px, 112px) rotateZ(-58deg);
      }

      .z-tetra__edge--two {
        transform: translate3d(-105px, 70px, 112px) rotateZ(3deg);
      }

      .z-tetra__edge--three {
        transform: translate3d(103px, 78px, 112px) rotateZ(-122deg);
      }

      .material-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .material-card {
        background: rgba(255, 255, 255, 0.055);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        min-height: 460px;
        overflow: hidden;
        padding: 18px;
        position: relative;
      }

      .material-card::before {
        background: radial-gradient(circle at 50% 20%, var(--study-glow), transparent 56%);
        content: '';
        inset: 0;
        opacity: 0.72;
        position: absolute;
      }

      .material-card--opal {
        --study-glow: rgba(45, 212, 191, 0.42);
      }

      .material-card--mono {
        --study-glow: rgba(255, 255, 255, 0.2);
      }

      .material-card--wire {
        --study-glow: rgba(148, 163, 184, 0.28);
      }

      .material-card--beam {
        --study-glow: rgba(251, 191, 36, 0.28);
      }

      .material-card__stage,
      .material-card__text {
        position: relative;
      }

      .material-card__stage {
        display: grid;
        min-height: 240px;
        place-items: center;
      }

      .study-mark {
        overflow: visible;
        width: min(100%, 240px);
      }

      .study-mark__caustic {
        animation: caustic 3.6s ease-in-out infinite;
        fill: rgba(103, 232, 249, 0.3);
      }

      .study-mark__mono polygon {
        fill: rgba(255, 255, 255, 0.88);
        stroke: rgba(0, 0, 0, 0.5);
        stroke-width: 1.5;
      }

      .study-mark__mono path {
        fill: none;
        stroke: rgba(0, 0, 0, 0.5);
        stroke-width: 3;
      }

      .study-mark__wire path,
      .study-mark__wire circle {
        animation: wireGlow 3.2s ease-in-out infinite;
        fill: none;
        stroke: rgba(226, 232, 240, 0.82);
        stroke-width: 2;
      }

      .study-mark__wire circle {
        fill: #ffffff;
      }

      .study-mark__spectrum {
        animation: splitBeam 3.8s ease-in-out infinite;
        fill: none;
        stroke: url(#unused);
        stroke-linecap: round;
        stroke-width: 8;
      }

      .material-card--beam .study-mark__spectrum {
        stroke: #fef3c7;
        filter: drop-shadow(0 0 12px #f0abfc) drop-shadow(0 0 20px #22d3ee);
      }

      .material-card__text {
        display: grid;
        gap: 10px;
      }

      .material-card__text span {
        color: rgba(255, 255, 255, 0.44);
        font-size: 11px;
        font-weight: 760;
        text-transform: uppercase;
      }

      .material-card__text h2 {
        color: #ffffff;
        font-size: 30px;
        font-weight: 790;
        line-height: 0.98;
      }

      .material-card--mono h2,
      .material-card--wire h2 {
        font-family: 'Fraunces Variable', ui-serif, Georgia, serif;
        font-variation-settings: 'SOFT' 30, 'WONK' 1, 'opsz' 72, 'wght' 760;
      }

      .material-card__text p {
        color: rgba(255, 255, 255, 0.62);
        font-size: 15px;
        line-height: 1.4;
      }

      .wordmark-strip {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        padding-block: 18px 42px;
      }

      .wordmark-strip__spec {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        min-height: 190px;
        overflow: hidden;
        padding: 22px;
        position: relative;
      }

      .wordmark-strip__spec::after {
        content: '';
        height: 1px;
        left: 0;
        position: absolute;
        right: 0;
        top: 50%;
      }

      .wordmark-strip__spec span {
        display: block;
        font-size: clamp(56px, 7vw, 96px);
        line-height: 0.86;
      }

      .wordmark-strip__spec small {
        bottom: 20px;
        color: rgba(255, 255, 255, 0.45);
        font-size: 12px;
        left: 22px;
        position: absolute;
      }

      .wordmark-strip__spec--cut span {
        background: linear-gradient(110deg, #ffffff, #67e8f9 45%, #e5e7eb 46%, #94a3b8);
        background-clip: text;
        color: transparent;
        font-family: 'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif;
        font-variation-settings: 'wght' 820;
      }

      .wordmark-strip__spec--cut::after {
        background: linear-gradient(90deg, transparent, #67e8f9, transparent);
      }

      .wordmark-strip__spec--serif span {
        color: #f8fafc;
        font-family: 'Fraunces Variable', ui-serif, Georgia, serif;
        font-variation-settings: 'SOFT' 0, 'WONK' 1, 'opsz' 96, 'wght' 820;
      }

      .wordmark-strip__spec--serif::after {
        background: linear-gradient(90deg, transparent, rgba(244, 114, 182, 0.8), transparent);
      }

      .wordmark-strip__spec--wire span {
        color: transparent;
        font-family: 'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif;
        font-variation-settings: 'wght' 720;
        -webkit-text-stroke: 1.4px rgba(255, 255, 255, 0.86);
      }

      .wordmark-strip__spec--wire::after {
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
      }

      @media (max-width: 1060px) {
        .prism-hero,
        .material-grid,
        .wordmark-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .prism-hero__copy {
          grid-column: 1 / -1;
        }

        .z-tetra {
          grid-column: 1 / -1;
        }
      }

      @media (max-width: 680px) {
        .prism-lab__rail,
        .prism-hero,
        .material-grid,
        .wordmark-strip {
          width: min(calc(100% - 28px), 1240px);
        }

        .prism-lab__rail {
          display: grid;
        }

        .prism-hero,
        .material-grid,
        .wordmark-strip {
          grid-template-columns: 1fr;
        }

        .prism-hero {
          gap: 18px;
          min-height: 0;
          padding-block: 26px 40px;
        }

        .prism-hero__title {
          font-size: 64px;
        }

        .prism-hero p {
          font-size: 18px;
        }

        .z-tetra {
          width: min(92vw, 390px);
        }

        .z-tetra__face {
          height: 250px;
          width: 250px;
        }

        .z-tetra__axis {
          width: 360px;
        }
      }

      @keyframes facePulse {
        0%,
        100% {
          filter: brightness(1);
        }
        50% {
          filter: brightness(1.24);
        }
      }

      @keyframes zShadow {
        0%,
        100% {
          opacity: 0.38;
          transform: translate3d(0, 120px, -130px) rotateX(88deg) scale(0.92);
        }
        50% {
          opacity: 0.72;
          transform: translate3d(0, 120px, -130px) rotateX(88deg) scale(1.08);
        }
      }

      @keyframes caustic {
        0%,
        100% {
          opacity: 0.24;
          transform: scaleX(0.8);
        }
        50% {
          opacity: 0.7;
          transform: scaleX(1.18);
        }
      }

      @keyframes wireGlow {
        0%,
        100% {
          opacity: 0.52;
        }
        50% {
          opacity: 1;
        }
      }

      @keyframes splitBeam {
        0%,
        100% {
          opacity: 0.3;
          transform: translateX(-14px);
        }
        50% {
          opacity: 1;
          transform: translateX(12px);
        }
      }
    `}</style>
  )
}

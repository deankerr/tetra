import { Link } from '@tanstack/react-router'

const pages = [
  { key: 'logo', label: 'Logo Lab', to: '/logo-lab' },
  { key: 'prism', label: 'Prism Lab', to: '/prism-lab' },
  { key: 'three', label: '3D Studio', to: '/tetra-3d' },
] as const

type LogoExplorationPage = (typeof pages)[number]['key']

export function LogoExplorationNav({ active }: { active: LogoExplorationPage }) {
  return (
    <nav className="logo-exploration-nav" aria-label="Logo exploration pages">
      <LogoExplorationNavStyles />

      {/* The shared switcher keeps the three experiments connected without importing app chrome. */}
      <div className="logo-exploration-nav__tabs">
        {pages.map((page) => (
          <Link
            className={page.key === active ? 'is-active' : undefined}
            key={page.key}
            to={page.to}
          >
            {page.label}
          </Link>
        ))}
      </div>

      <Link className="logo-exploration-nav__home" to="/">
        Chat
      </Link>
    </nav>
  )
}

function LogoExplorationNavStyles() {
  return (
    <style>{`
      .logo-exploration-nav {
        align-items: center;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        pointer-events: auto;
        width: 100%;
      }

      .logo-exploration-nav__tabs {
        background: rgba(255, 255, 255, 0.055);
        border: 1px solid rgba(255, 255, 255, 0.13);
        border-radius: 999px;
        display: flex;
        gap: 3px;
        padding: 4px;
      }

      .logo-exploration-nav a {
        align-items: center;
        border: 1px solid transparent;
        border-radius: 999px;
        color: rgba(255, 255, 255, 0.68);
        display: inline-flex;
        font-family: 'Orbitron Variable', ui-sans-serif, system-ui, sans-serif;
        font-size: 11px;
        justify-content: center;
        min-height: 32px;
        padding: 8px 13px;
        text-transform: uppercase;
        transition:
          background 160ms ease,
          border-color 160ms ease,
          color 160ms ease,
          box-shadow 160ms ease;
      }

      .logo-exploration-nav a:hover,
      .logo-exploration-nav a.is-active {
        background: rgba(103, 232, 249, 0.13);
        border-color: rgba(103, 232, 249, 0.72);
        color: #ffffff;
        box-shadow: 0 0 28px rgba(103, 232, 249, 0.12);
      }

      .logo-exploration-nav__home {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.12) !important;
      }

      @media (max-width: 700px) {
        .logo-exploration-nav {
          align-items: stretch;
          display: grid;
        }

        .logo-exploration-nav__tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .logo-exploration-nav a {
          font-size: 10px;
          min-width: 0;
          padding-inline: 8px;
          text-align: center;
        }
      }
    `}</style>
  )
}

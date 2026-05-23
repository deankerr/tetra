import { useId } from 'react'
import type { SVGProps } from 'react'

// [shadow, mid, lit] — dark to light, left to base face.
export const TETRA_PALETTES = {
  crimson: ['#7f1d1d', '#dc2626', '#fca5a5'],
  emerald: ['#14532d', '#16a34a', '#86efac'],
  forge: ['#7c2d12', '#c2410c', '#fb923c'],
  indigo: ['#1e1b4b', '#4338ca', '#818cf8'],
  midnight: ['#0f172a', '#1d4ed8', '#93c5fd'],
  slate: ['#1e293b', '#475569', '#94a3b8'],
  teal: ['#134e4a', '#0d9488', '#5eead4'],
  violet: ['#4c1d95', '#6d28d9', '#a78bfa'],
} as const satisfies Record<string, [string, string, string]>

export type TetraPalette = keyof typeof TETRA_PALETTES

type TetraLogoProps = SVGProps<SVGSVGElement> & {
  detailed?: boolean
  palette?: TetraPalette
  faces?: [shadow: string, mid: string, lit: string]
}

/**
 * Three flat-filled faces of a tetrahedron, viewed isometrically.
 * No gradients — value contrast alone creates the 3D read at any size.
 * Inner edge lines are drawn explicitly so the geometry survives at 20px.
 * Use `palette` for a named preset or `faces` for a custom [shadow, mid, lit] triple.
 */
export function TetraLogo({ detailed = false, palette = 'teal', faces, ...props }: TetraLogoProps) {
  const [shadow, mid, lit] = faces ?? TETRA_PALETTES[palette]
  const id = useId().replaceAll(':', '')

  if (!detailed) {
    return (
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
        <polygon fill={shadow} points="16,2 2,30 16,20" />
        <polygon fill={mid} points="16,2 16,20 30,30" />
        <polygon fill={lit} points="2,30 30,30 16,20" />
        {/* inner edges — ensure face boundaries survive at icon scale */}
        <g fill="none" stroke="rgba(255,255,255,0.22)" strokeLinecap="round" strokeWidth="0.8">
          <line x1="16" x2="16" y1="2" y2="20" />
          <line x1="2" x2="16" y1="30" y2="20" />
          <line x1="30" x2="16" y1="30" y2="20" />
        </g>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <filter
          colorInterpolationFilters="sRGB"
          height="140%"
          id={`${id}-g`}
          width="140%"
          x="-20%"
          y="-20%"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
          <feColorMatrix values="0 0 0 0 0.43 0 0 0 0 0.16 0 0 0 0 0.98 0 0 0 0.55 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-g)`}>
        <polygon fill={shadow} points="80,10 14,148 80,100" />
        <polygon fill={mid} points="80,10 80,100 146,148" />
        <polygon fill={lit} points="14,148 146,148 80,100" />
        <g fill="none" stroke="rgba(255,255,255,0.28)" strokeLinecap="round" strokeWidth="1.5">
          <line x1="80" x2="80" y1="10" y2="100" />
          <line x1="14" x2="80" y1="148" y2="100" />
          <line x1="146" x2="80" y1="148" y2="100" />
        </g>
        <circle cx="80" cy="100" fill={lit} opacity="0.8" r="2.8" />
      </g>
    </svg>
  )
}

import type { SVGProps } from 'react'

/** Renders the Tetra faceted mark. */
export function TetraLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon fill="#0f766e" points="16,2 2,28 16,19" />
      <polygon fill="#14b8a6" points="16,2 16,19 30,28" />
      <polygon fill="#5eead4" points="2,28 30,28 16,19" />
    </svg>
  )
}

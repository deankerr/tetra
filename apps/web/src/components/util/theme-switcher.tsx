import { useTheme } from '@lonik/themer'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const themes = [
  { icon: MonitorIcon, label: 'Switch to system theme', value: 'system' },
  { icon: SunIcon, label: 'Switch to light theme', value: 'light' },
  { icon: MoonIcon, label: 'Switch to dark theme', value: 'dark' },
] as const

export function ThemeSwitcher({ className, ...props }: React.ComponentProps<'div'>) {
  const { theme, setTheme } = useTheme()

  return (
    <div
      className={cn(
        'relative isolate inline-flex h-8 items-center rounded-full border border-dotted px-1',
        className,
      )}
      {...props}
    >
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          aria-label={label}
          title={label}
          type="button"
          onClick={() => {
            setTheme(value)
          }}
          className="group relative size-6 rounded-full transition duration-200 ease-out"
        >
          {theme === value && <div className="bg-muted absolute inset-0 -z-1 rounded-full" />}
          <Icon
            className={cn(
              'relative m-auto size-3.5 transition duration-200 ease-out',
              theme === value
                ? 'text-foreground'
                : 'text-secondary-foreground group-hover:text-foreground group-focus-visible:text-foreground',
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}

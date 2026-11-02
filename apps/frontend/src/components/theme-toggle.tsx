'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    )

    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== 'vp-theme') return
      const nextTheme = event.newValue === 'dark' ? 'dark' : 'light'
      applyTheme(nextTheme)
      setTheme(nextTheme)
    }
    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [])

  const select = (nextTheme: Theme) => {
    applyTheme(nextTheme)
    setTheme(nextTheme)
    try {
      localStorage.setItem('vp-theme', nextTheme)
    } catch {
      // Browsers with disabled storage still allow theme changes this session.
    }
  }

  return (
    <fieldset className="fixed right-4 top-4 z-50 flex items-center gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-(--shadow-1) backdrop-blur-sm sm:right-6 sm:top-6">
      <legend className="sr-only">Tema da interface</legend>
      <button
        aria-label="Tema claro"
        aria-pressed={theme === 'light'}
        className="flex size-9 items-center justify-center gap-1.5 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-secondary aria-pressed:text-secondary-foreground sm:w-auto sm:px-3"
        onClick={() => select('light')}
        type="button"
      >
        <Sun aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold">
          Claro
        </span>
      </button>
      <button
        aria-label="Tema escuro"
        aria-pressed={theme === 'dark'}
        className="flex size-9 items-center justify-center gap-1.5 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-secondary aria-pressed:text-secondary-foreground sm:w-auto sm:px-3"
        onClick={() => select('dark')}
        type="button"
      >
        <Moon aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold">
          Escuro
        </span>
      </button>
    </fieldset>
  )
}

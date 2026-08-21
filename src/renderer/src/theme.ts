export type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'foldermapper-theme'

export function loadTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

/** Shared palette for CSS surfaces and WebGL effects, taken from the supplied reference. */
export const palette = {
  warmGrey: '#c2bcbf',
  nordicBlue: '#3771c8',
  mistBlue: '#9abad5',
  offWhite: '#f5f5f5',
} as const

// Darker shades of the reference blue keep small text readable on the light surfaces.
function shade(hex: string, strength: number) {
  return `#${[1, 3, 5].map((offset) => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * strength).toString(16).padStart(2, '0')).join('')}`
}

export const themeColors = {
  ...palette,
  ink: shade(palette.nordicBlue, .25),
  mutedInk: shade(palette.nordicBlue, .5),
  strongBlue: shade(palette.nordicBlue, .8),
}

export type ThemeMode = 'light' | 'dark'
export const darkPalette = {
  black: '#010101',
  charcoal: '#282828',
  softWhite: '#ececec',
  white: '#f9f9f9',
} as const

// Map existing palette roles to neutrals so decorative effects follow dark mode too.
const darkThemeColors: Record<keyof typeof themeColors, string> = {
  warmGrey: darkPalette.softWhite,
  nordicBlue: darkPalette.softWhite,
  mistBlue: darkPalette.softWhite,
  offWhite: darkPalette.white,
  ink: darkPalette.black,
  mutedInk: darkPalette.softWhite,
  strongBlue: darkPalette.charcoal,
}

export function getThemeColors(mode: ThemeMode) {
  return mode === 'dark' ? darkThemeColors : themeColors
}

export const themeStorageKey = 'g-stock.theme'
const themeChangeEvent = 'g-stock:theme-change'

export function loadThemePreference(): ThemeMode {
  try {
    return window.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function getTheme(): ThemeMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(root: HTMLElement = document.documentElement, mode: ThemeMode = loadThemePreference()) {
  for (const [name, hex] of Object.entries(getThemeColors(mode))) {
    const token = `--color-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
    root.style.setProperty(token, hex)
    root.style.setProperty(`${token}-rgb`, channels.join(' '))
  }
  root.dataset.theme = mode
  root.style.colorScheme = mode
}

export function setTheme(mode: ThemeMode): boolean {
  applyTheme(document.documentElement, mode)
  let saved = true
  try {
    window.localStorage.setItem(themeStorageKey, mode)
  } catch {
    saved = false
  }
  window.dispatchEvent(new Event(themeChangeEvent))
  return saved
}

export function subscribeToTheme(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === themeStorageKey || event.key === null) {
      applyTheme()
      onChange()
    }
  }
  window.addEventListener(themeChangeEvent, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(themeChangeEvent, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

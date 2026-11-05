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

export function applyTheme(root: HTMLElement = document.documentElement) {
  for (const [name, hex] of Object.entries(themeColors)) {
    const token = `--color-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
    root.style.setProperty(token, hex)
    root.style.setProperty(`${token}-rgb`, channels.join(' '))
  }
}

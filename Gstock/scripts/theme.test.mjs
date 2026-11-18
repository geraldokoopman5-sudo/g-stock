import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let theme
let ThemeToggle

before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  theme = await server.ssrLoadModule('/src/theme.ts')
  ThemeToggle = (await server.ssrLoadModule('/src/components/ThemeToggle.tsx')).default
})
after(async () => { await server?.close() })
afterEach(() => { delete globalThis.window; delete globalThis.document })

function browser(saved) {
  const storage = new Map(saved ? [[theme.themeStorageKey, saved]] : [])
  const properties = new Map()
  const root = { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value) } }
  globalThis.document = { documentElement: root }
  globalThis.window = Object.assign(new EventTarget(), {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  })
  return { root, storage, properties }
}

test('a saved dark preference applies at startup and switching back to light survives reload', () => {
  const { root, storage, properties } = browser('dark')
  theme.applyTheme()
  assert.equal(theme.getTheme(), 'dark')
  assert.equal(root.style.colorScheme, 'dark')
  assert.equal(properties.get('--color-ink'), '#010101')
  assert.equal(properties.get('--color-strong-blue'), '#282828')
  assert.equal(properties.get('--color-nordic-blue'), '#ececec')
  assert.equal(properties.get('--color-off-white'), '#f9f9f9')
  assert.equal(properties.get('--color-strong-blue-rgb'), '40 40 40')
  assert.equal(theme.setTheme('light'), true)
  assert.equal(theme.getTheme(), 'light')
  assert.equal(root.style.colorScheme, 'light')
  assert.equal(properties.get('--color-nordic-blue'), '#3771c8')
  assert.equal(storage.get(theme.themeStorageKey), 'light')
  root.dataset.theme = 'dark'
  theme.applyTheme()
  assert.equal(theme.getTheme(), 'light')
})

test('missing or invalid preferences use light; blocked storage still allows toggling for the visit', () => {
  for (const saved of [undefined, 'invalid']) {
    browser(saved)
    theme.applyTheme()
    assert.equal(theme.getTheme(), 'light')
  }
  window.localStorage.getItem = () => { throw new Error('Storage blocked') }
  window.localStorage.setItem = () => { throw new Error('Storage blocked') }
  assert.equal(theme.loadThemePreference(), 'light')
  assert.equal(theme.setTheme('dark'), false)
  assert.equal(theme.getTheme(), 'dark')
})

test('theme consumers update together and react to preference changes in another tab', () => {
  const { storage } = browser()
  theme.applyTheme()
  const snapshots = []
  const unsubscribe = theme.subscribeToTheme(() => snapshots.push(theme.getTheme()))
  theme.setTheme('dark')
  storage.set(theme.themeStorageKey, 'light')
  window.dispatchEvent(Object.assign(new Event('storage'), { key: theme.themeStorageKey }))
  assert.deepEqual(snapshots, ['dark', 'light'])
  storage.clear()
  window.dispatchEvent(Object.assign(new Event('storage'), { key: null }))
  assert.equal(theme.getTheme(), 'light')
  unsubscribe()
  theme.setTheme('dark')
  assert.deepEqual(snapshots, ['dark', 'light', 'light'])
})

test('the shared icon button exposes a labelled keyboard-operable dark mode switch', () => {
  const markup = renderToStaticMarkup(React.createElement(ThemeToggle))
  assert.match(markup, /<button[^>]*type="button"[^>]*role="switch"[^>]*aria-checked="false"/)
  assert.match(markup, /aria-label="Dark mode"/)
  assert.match(markup, /title="Switch to dark mode"/)
  assert.match(markup, /<svg[^>]*aria-hidden="true"/)
})

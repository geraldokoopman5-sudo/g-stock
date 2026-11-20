import { writeFile } from 'node:fs/promises'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// Generate standalone assets from the same geometry and palette as the website.
const server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false, watch: null }, appType: 'custom' })
try {
  const { default: BrandLogo } = await server.ssrLoadModule('/src/components/BrandLogo.tsx')
  const { getLogoColors } = await server.ssrLoadModule('/src/theme.ts')
  for (const mode of ['light', 'dark']) {
    const colors = getLogoColors(mode)
    for (const markOnly of [true, false]) {
      const svg = renderToStaticMarkup(React.createElement(BrandLogo, { markOnly }))
        .replace(/var\(--logo-([a-z]+)\)/g, (_, token) => colors[token])
      const filename = `${markOnly ? 'favicon' : 'gstock-logo'}${mode === 'dark' ? '-dark' : ''}.svg`
      await writeFile(new URL(`../public/${filename}`, import.meta.url), `${svg}\n`)
    }
  }
} finally { await server.close() }

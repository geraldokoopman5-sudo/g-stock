import { Buffer } from 'node:buffer'
import process from 'node:process'

// Keep cookies on the frontend's origin while calling the backend server to server.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  const fail = (status, detail) => {
    response.statusCode = status
    response.setHeader('Content-Type', 'application/problem+json')
    response.end(JSON.stringify({ status, detail }))
  }

  const site = request.headers['sec-fetch-site']
  const origin = request.headers.origin
  if ((site && !['same-origin', 'none'].includes(site)) ||
      (origin && origin !== `https://${request.headers.host}`)) {
    fail(403, 'This request must come from the frontend origin.')
    return
  }

  let target
  try {
    target = new URL(process.env.API_PROXY_TARGET)
    if (target.protocol !== 'https:' || target.username || target.password ||
        target.pathname !== '/' || target.search || target.hash) throw new Error('Invalid backend URL')
  } catch {
    fail(503, 'Configure API_PROXY_TARGET with the backend HTTPS URL in the frontend hosting environment.')
    return
  }

  const path = new URL(request.url, 'https://frontend.invalid')
  if (!path.pathname.startsWith('/api/v1/')) {
    fail(404, 'API route was not found.')
    return
  }

  try {
    const headers = new Headers()
    for (const name of ['authorization', 'cookie', 'content-type', 'accept', 'x-csrf-token', 'sec-fetch-site']) {
      const value = request.headers[name]
      if (typeof value === 'string') headers.set(name, value)
    }
    // The browser origin was checked above. The upstream request now uses its API origin.
    if (origin) headers.set('Origin', target.origin)
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : request.body
    const upstream = await fetch(new URL(path.pathname + path.search, target), {
      method: request.method,
      headers,
      body: body === undefined || typeof body === 'string' || Buffer.isBuffer(body)
        ? body : JSON.stringify(body),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    })
    // Read the body before sending headers so a failed upstream transfer can return a clean error.
    const bytes = Buffer.from(await upstream.arrayBuffer())
    response.statusCode = upstream.status
    const type = upstream.headers.get('content-type')
    if (type) response.setHeader('Content-Type', type)
    const retryAfter = upstream.headers.get('retry-after')
    if (retryAfter) response.setHeader('Retry-After', retryAfter)
    const cookies = upstream.headers.getSetCookie()
    if (cookies.length) response.setHeader('Set-Cookie', cookies)
    response.end(bytes)
  } catch {
    fail(502, 'The backend is unavailable or waking up. Please wait a minute and try again.')
  }
}

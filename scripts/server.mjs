// Local static server shared by the headless renderer and the studio.
// Everything the stage page loads is served from here, so a render never
// reaches the network: three.js, fonts and models come out of the skill.
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SKILL = resolve(fileURLToPath(import.meta.url), '../..')
const NM = join(SKILL, 'node_modules')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
}

// URL prefix -> directory on disk. /work/<id>/ mounts are added per render.
const STATIC = [
  ['/stage/', join(SKILL, 'stage')],
  ['/studio/', join(SKILL, 'studio')],
  ['/assets/', join(SKILL, 'assets')],
  ['/vendor/three/', join(NM, 'three')],
  ['/fonts/', NM], // /fonts/@fontsource-variable/inter/index.css
]

/** Resolve `rel` inside `root`, refusing anything that climbs out of it. */
function inside(root, rel) {
  const file = normalize(join(root, decodeURIComponent(rel)))
  return file === root || file.startsWith(root + sep) ? file : null
}

export function sendFile(req, res, file) {
  let st
  try {
    st = statSync(file)
  } catch {
    res.writeHead(404).end('not found')
    return
  }
  if (st.isDirectory()) {
    const index = join(file, 'index.html')
    if (existsSync(index)) return sendFile(req, res, index)
    res.writeHead(404).end('not found')
    return
  }
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const headers = {
    'content-type': type,
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
    'accept-ranges': 'bytes',
  }
  // Range support so <video> can seek inside the studio.
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
  if (range) {
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Number(range[2]) : st.size - 1
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 })
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { ...headers, 'content-length': st.size })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

/**
 * Start the server on 127.0.0.1. `api(req, res, url)` may handle a request
 * first and return true when it did.
 */
export async function startServer({ port = 0, api } = {}) {
  const mounts = new Map()
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local')
      if (api && (await api(req, res, url))) return
      const path = url.pathname
      if (path === '/' ) {
        res.writeHead(302, { location: '/studio/' }).end()
        return
      }
      for (const [id, dir] of mounts) {
        const prefix = `/work/${id}/`
        if (path.startsWith(prefix)) {
          const file = inside(dir, path.slice(prefix.length))
          return file ? sendFile(req, res, file) : res.writeHead(403).end()
        }
      }
      for (const [prefix, dir] of STATIC) {
        if (path.startsWith(prefix)) {
          const file = inside(dir, path.slice(prefix.length))
          return file ? sendFile(req, res, file) : res.writeHead(403).end()
        }
      }
      res.writeHead(404).end('not found')
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' })
      res.end(String(err?.stack ?? err))
    }
  })
  await new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', ok)
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  return {
    origin,
    server,
    /** Serve `dir` at /work/<id>/ and return that URL prefix. */
    mount(id, dir) {
      mounts.set(id, resolve(dir))
      return `${origin}/work/${id}/`
    },
    unmount(id) {
      mounts.delete(id)
    },
    close: () => new Promise((ok) => server.close(ok)),
  }
}

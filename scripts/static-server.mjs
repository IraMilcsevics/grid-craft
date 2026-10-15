import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/**
 * Serves a folder, optionally under a path prefix such as `/grid-craft/`, so the build can be tested the way
 * GitHub Pages will serve it. Resolves with the running server once it listens.
 */
export function startStaticServer({ root, port, prefix = '/' }) {
  const base = path.resolve(root)
  const mount = prefix.replace(/\/?$/, '/')
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x').pathname
    if (!url.startsWith(mount)) return void res.writeHead(404).end('Not found')
    let file = path.join(base, decodeURIComponent(url.slice(mount.length)))
    if (!file.startsWith(base)) return void res.writeHead(403).end()
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (!existsSync(file)) return void res.writeHead(404).end('Not found')
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => resolve(server))
  })
}

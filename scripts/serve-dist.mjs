/**
 * Tiny static server for the production build, optionally under a path prefix, to test that the
 * app works when hosted in a subfolder: `node scripts/serve-dist.mjs 4175 /grid-craft/`
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const port = Number(process.argv[2] ?? 4175)
const prefix = (process.argv[3] ?? '/').replace(/\/?$/, '/')
const root = path.resolve(process.env.DIST ?? 'dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x').pathname
  if (!url.startsWith(prefix)) {
    res.writeHead(404).end('Not found')
    return
  }
  let file = path.join(root, decodeURIComponent(url.slice(prefix.length)))
  if (!file.startsWith(root)) return void res.writeHead(403).end()
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!existsSync(file)) return void res.writeHead(404).end('Not found')
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(port, () => console.error(`Serving dist at http://localhost:${port}${prefix}`))

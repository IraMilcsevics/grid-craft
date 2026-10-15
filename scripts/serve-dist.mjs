/**
 * Serves the production build, optionally under a path prefix, to test that the app works when hosted
 * in a subfolder: `node scripts/serve-dist.mjs 4175 /grid-craft/`
 * (In Git Bash on Windows, prefix the command with MSYS_NO_PATHCONV=1 or the prefix gets rewritten.)
 */
import { startStaticServer } from './static-server.mjs'

const port = Number(process.argv[2] ?? 4175)
const prefix = process.argv[3] ?? '/'
await startStaticServer({ root: process.env.DIST ?? 'dist', port, prefix })
console.error(`Serving at http://localhost:${port}${prefix.replace(/\/?$/, '/')}`)

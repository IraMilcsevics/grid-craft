import type { Server } from 'node:http'

export function startStaticServer(options: { root: string; port: number; prefix?: string }): Promise<Server>

import type { ServerResponse } from 'node:http'
import type { CompanionEvent } from '@yoto-local/shared'

/** Fan-out of companion events to every connected Server-Sent Events client. */
export class EventHub {
  private readonly clients = new Set<ServerResponse>()
  private readonly heartbeat: NodeJS.Timeout

  constructor() {
    // Keeps idle connections from being closed by the browser or proxies.
    this.heartbeat = setInterval(() => this.write(': ping\n\n'), 25_000)
    this.heartbeat.unref()
  }

  add(res: ServerResponse): void {
    this.clients.add(res)
    res.on('close', () => this.clients.delete(res))
  }

  emit(event: CompanionEvent): void {
    this.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  close(): void {
    clearInterval(this.heartbeat)
    for (const res of this.clients) res.end()
    this.clients.clear()
  }

  private write(chunk: string): void {
    for (const res of this.clients) res.write(chunk)
  }
}

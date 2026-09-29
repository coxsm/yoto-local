import { AlertTriangle, Check, Clock, Loader2, X } from 'lucide-react'
import type { DownloadJob } from '@yoto-local/shared'
import { cn } from '../lib/utils'

interface DownloadQueueProps {
  jobs: DownloadJob[]
  onCancel: (id: string) => void
  onDismiss: (id: string) => void
}

function describe(job: DownloadJob): string {
  switch (job.status) {
    case 'queued':
      return 'Waiting...'
    case 'running': {
      const item = job.total > 1 ? `Item ${job.current} of ${job.total} · ` : ''
      return `${item}${job.stage ?? 'Downloading'} · ${Math.round(job.progress)}%`
    }
    case 'done':
      return job.error ? 'Finished with some errors' : 'Download complete'
    case 'cancelled':
      return 'Cancelled'
    case 'error':
      return 'Failed'
  }
}

export function DownloadQueue({ jobs, onCancel, onDismiss }: DownloadQueueProps) {
  if (!jobs.length) return null

  return (
    <ul className="space-y-3" aria-label="Downloads">
      {jobs.map((job) => {
        const active = job.status === 'running' || job.status === 'queued'
        return (
          <li key={job.id} className="rounded-xl border border-white/10 bg-card/40 p-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                {job.status === 'running' && (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                )}
                {job.status === 'queued' && <Clock className="w-5 h-5 text-muted-foreground" />}
                {job.status === 'done' && !job.error && <Check className="w-5 h-5 text-primary" />}
                {(job.status === 'error' || (job.status === 'done' && job.error)) && (
                  <AlertTriangle className="w-5 h-5 text-accent" />
                )}
                {job.status === 'cancelled' && <X className="w-5 h-5 text-muted-foreground" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{job.title ?? job.url}</p>
                <p className="text-xs text-muted-foreground">{describe(job)}</p>
              </div>
              <button
                onClick={() => (active ? onCancel(job.id) : onDismiss(job.id))}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  active
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'
                )}
              >
                {active ? 'Cancel' : 'Dismiss'}
              </button>
            </div>
            {job.status === 'running' && (
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-200 ease-linear"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            )}
            {job.error && (
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/20 p-3 text-xs text-red-300">
                {job.error}
              </pre>
            )}
          </li>
        )
      })}
    </ul>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { HealthResponse } from '@yoto-local/shared'
import { companion, CompanionError } from '../api/companion'

export type CompanionStatus = 'checking' | 'offline' | 'unpaired' | 'ready'

const RETRY_MS = 5000

/** Tracks whether the local companion is reachable and paired, retrying while it isn't. */
export function useCompanion() {
  const [status, setStatus] = useState<CompanionStatus>('checking')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [pairError, setPairError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const check = useCallback(async function check(): Promise<CompanionStatus> {
    window.clearTimeout(timer.current)
    let next: CompanionStatus
    try {
      setHealth(await companion.health())
      if (!companion.token) {
        next = 'unpaired'
      } else {
        await companion.verifyPairing()
        next = 'ready'
      }
    } catch (error) {
      next = error instanceof CompanionError && error.status === 401 ? 'unpaired' : 'offline'
    }
    setStatus(next)
    if (next === 'offline') timer.current = window.setTimeout(check, RETRY_MS)
    return next
  }, [])

  useEffect(() => {
    check()
    return () => window.clearTimeout(timer.current)
  }, [check])

  const pair = useCallback(
    async (code: string): Promise<boolean> => {
      companion.setToken(code)
      const next = await check()
      if (next === 'unpaired') {
        companion.setToken(null)
        setPairError('That code didn’t match. Check the companion window and try again.')
        return false
      }
      setPairError(null)
      return next === 'ready'
    },
    [check]
  )

  const unpair = useCallback(() => {
    companion.setToken(null)
    setStatus('unpaired')
  }, [])

  return { status, health, pairError, check, pair, unpair }
}

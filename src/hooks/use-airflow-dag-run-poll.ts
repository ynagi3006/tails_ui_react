import { useEffect, useState } from 'react'

import { apiFetchJson } from '@/lib/api'

const AIRFLOW_POLL_MS = 10_000
const TERMINAL = new Set(['success', 'failed'])

export type AirflowRunPollSnapshot = {
  dag_run_id?: string
  dag_id?: string
  state?: string
  start_date?: string | null
  end_date?: string | null
}

/**
 * Poll ``GET /airflow/runs/{dag_run_id}`` while the run is non-terminal (same cadence as classic metrics UI).
 */
export function useAirflowDagRunPoll(dagRunId: string | null | undefined, dagId: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<AirflowRunPollSnapshot | null>(null)
  const [lastPollError, setLastPollError] = useState<string | null>(null)

  useEffect(() => {
    const id = (dagRunId || '').trim()
    if (!id) {
      setSnapshot(null)
      setLastPollError(null)
      return
    }

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const stopInterval = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    }

    const pollOnce = async (): Promise<boolean> => {
      if (cancelled) return true
      const qs = (dagId || '').trim() ? `?${new URLSearchParams({ dag_id: dagId!.trim() })}` : ''
      try {
        const run = await apiFetchJson<AirflowRunPollSnapshot>(`/airflow/runs/${encodeURIComponent(id)}${qs}`)
        if (cancelled) return true
        setLastPollError(null)
        setSnapshot({
          dag_run_id: run.dag_run_id ?? id,
          dag_id: run.dag_id,
          state: run.state,
          start_date: run.start_date,
          end_date: run.end_date,
        })
        const st = (run.state || '').toLowerCase()
        return TERMINAL.has(st)
      } catch (e) {
        if (!cancelled) {
          setLastPollError(e instanceof Error ? e.message : 'Poll failed')
        }
        return false
      }
    }

    void (async () => {
      const done = await pollOnce()
      if (cancelled || done) return
      intervalId = window.setInterval(() => {
        void (async () => {
          const finished = await pollOnce()
          if (finished) stopInterval()
        })()
      }, AIRFLOW_POLL_MS)
    })()

    return () => {
      cancelled = true
      stopInterval()
    }
  }, [dagRunId, dagId])

  const stateLower = (snapshot?.state || '').toLowerCase()
  const isTerminal = TERMINAL.has(stateLower)
  const terminalKind = stateLower === 'success' ? 'success' : stateLower === 'failed' ? 'failed' : null

  return {
    snapshot,
    lastPollError,
    isTerminal,
    terminalKind,
    isPollingActive: Boolean((dagRunId || '').trim()) && !isTerminal,
  }
}

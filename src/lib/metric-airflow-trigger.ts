/** Subset of ``airflow_trigger`` returned with metric create/update/SQL upload (matches classic UI). */
export type AirflowTriggerPayload = {
  status?: string
  dag_id?: string
  metric_version_id?: string
  dag_run_id?: string
  message?: string
}

export function normalizeAirflowTrigger(raw: unknown): AirflowTriggerPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    status: o.status != null ? String(o.status) : undefined,
    dag_id: o.dag_id != null ? String(o.dag_id) : undefined,
    metric_version_id: o.metric_version_id != null ? String(o.metric_version_id) : undefined,
    dag_run_id: o.dag_run_id != null ? String(o.dag_run_id) : undefined,
    message: o.message != null ? String(o.message) : undefined,
  }
}

/** Read ``airflow_trigger`` from a metric create/put or SQL POST response body. */
export function pickAirflowTriggerFromMetricResponse(res: unknown): AirflowTriggerPayload | null {
  if (!res || typeof res !== 'object') return null
  return normalizeAirflowTrigger((res as Record<string, unknown>).airflow_trigger)
}

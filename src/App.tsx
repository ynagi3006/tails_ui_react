import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/pages/HomePage'
import { MetricDetailPage } from '@/pages/MetricDetailPage'
import { MetricsPage } from '@/pages/MetricsPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { ReportBuilderPage } from '@/pages/ReportBuilderPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ReportViewPage } from '@/pages/ReportViewPage'

const ExplorePage = lazy(async () => {
  const m = await import('@/pages/ExplorePage')
  return { default: m.ExplorePage }
})

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="metrics/:metricId" element={<MetricDetailPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/:reportId" element={<ReportViewPage />} />
          <Route
            path="explore"
            element={
              <Suspense
                fallback={
                  <div className="text-muted-foreground flex min-h-[40vh] items-center justify-center text-sm">
                    Loading explore…
                  </div>
                }
              >
                <ExplorePage />
              </Suspense>
            }
          />
          <Route path="report-builder" element={<ReportBuilderPage />} />
          <Route
            path="admin"
            element={<PlaceholderPage title="Admin" description="Permission groups, members, and user profiles." />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

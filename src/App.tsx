import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { OktaAuthProvider } from '@/auth/OktaAuthProvider'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/pages/HomePage'
import { MetricDatapointsPage } from '@/pages/MetricDatapointsPage'
import { MetricDetailPage } from '@/pages/MetricDetailPage'
import { MetricsPage } from '@/pages/MetricsPage'
import { NewMetricPage } from '@/pages/NewMetricPage'
import { NewReportPage } from '@/pages/NewReportPage'
import { AdminPage } from '@/pages/AdminPage'
import { ReportBuilderPage } from '@/pages/ReportBuilderPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { LoginCallbackPage } from '@/pages/LoginCallbackPage'
import { LoginPage } from '@/pages/LoginPage'
import { ReportViewPage } from '@/pages/ReportViewPage'

const ExplorePage = lazy(async () => {
  const m = await import('@/pages/ExplorePage')
  return { default: m.ExplorePage }
})

export default function App() {
  return (
    <BrowserRouter>
      <OktaAuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/callback" element={<LoginCallbackPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="metrics" element={<MetricsPage />} />
              <Route path="metrics/new" element={<NewMetricPage />} />
              <Route path="metrics/:metricId/datapoints" element={<MetricDatapointsPage />} />
              <Route path="metrics/:metricId" element={<MetricDetailPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="reports/new" element={<NewReportPage />} />
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
              <Route path="admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </OktaAuthProvider>
    </BrowserRouter>
  )
}

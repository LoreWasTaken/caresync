// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Layouts
import { ShowcaseLayout } from './features/showcase/layouts/ShowcaseLayout'
import { AuthLayout } from './features/auth/layouts/AuthLayout'
import { DashboardLayout } from './features/dashboard/layouts/DashboardLayout'

// Auth & Protection
import { LoginPage } from './features/auth/pages/LoginPage'
import { RegisterPage } from './features/auth/pages/RegisterPage'
import { ProtectedRoute } from './features/auth/components/ProtectedRoute'
import { RoleBasedRoute, dashboardPathForRole } from './features/auth/components/RoleBasedRoute'

import { ForgotPasswordPage } from './features/auth/pages/ForgotPasswordPage'
import { ResetPasswordPage } from './features/auth/pages/ResetPasswordPage'

// Showcase Pages
import LandingPage from './features/showcase/pages/LandingPage'
import { HardwareEvolutionPage } from './features/showcase/pages/HardwareEvolutionPage'
import { SecurityDeepDivePage } from './features/showcase/pages/SecurityDeepDivePage'
import { SoftwareArchitecturePage } from './features/showcase/pages/SoftwareArchitecturePage'
import { UnifiedTimelinePage } from './features/showcase/pages/UnifiedTimelinePage'
import { TeamPage } from './features/showcase/pages/TeamPage'

// Dashboard Pages
import { PatientDashboard } from './features/dashboard/pages/PatientDashboard'
import { CaregiverDashboard } from './features/dashboard/pages/CaregiverDashboard'
import { SecuritySettings } from './features/dashboard/pages/SecuritySettings'

// Medication Pages
import { MyMedicationsPage } from './features/medications/pages/MyMedicationsPage'
import { AddMedicationPage } from './features/medications/pages/AddMedicationPage'
import { EditMedicationPage } from './features/medications/pages/EditMedicationPage'
import { SchedulePage } from './features/medications/pages/SchedulePage'

// Device & Report Pages
import { DevicesPage } from './features/devices/pages/DevicesPage'
import { ReportsPage } from './features/reports/pages/ReportsPage'

// Helper: redirects /app to the user's role-appropriate dashboard
import { useAuthStore } from './shared/store/authStore'

function AppIndexRedirect() {
  const user = useAuthStore((s) => s.user)
  return <Navigate to={dashboardPathForRole(user?.role)} replace />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/" element={<LandingPage />} />

        {/* AUTH ROUTES (Wrapped in Theme-Aware Layout) */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        {/* PUBLIC SHOWCASE */}
        <Route path="/showcase" element={<ShowcaseLayout />}>
          <Route path="hardware" element={<HardwareEvolutionPage />} />
          <Route path="software" element={<SoftwareArchitecturePage />} />
          <Route path="security" element={<SecurityDeepDivePage />} />
          <Route path="timeline" element={<UnifiedTimelinePage />} />
          <Route path="team" element={<TeamPage />} />
          <Route index element={<Navigate to="hardware" replace />} />
        </Route>

        {/* ─── PROTECTED DASHBOARD (nested under DashboardLayout) ─── */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* /app → redirect to role-appropriate dashboard */}
          <Route index element={<AppIndexRedirect />} />

          {/* Patient-only */}
          <Route
            path="patient"
            element={
              <RoleBasedRoute allowedRoles={['patient']}>
                <PatientDashboard />
              </RoleBasedRoute>
            }
          />

          {/* Caregiver / healthcare_provider */}
          <Route
            path="caregiver"
            element={
              <RoleBasedRoute allowedRoles={['caregiver', 'healthcare_provider']}>
                <CaregiverDashboard />
              </RoleBasedRoute>
            }
          />

          {/* Medications — patient-only CRUD */}
          <Route
            path="medications"
            element={
              <RoleBasedRoute allowedRoles={['patient']}>
                <MyMedicationsPage />
              </RoleBasedRoute>
            }
          />
          <Route
            path="medications/add"
            element={
              <RoleBasedRoute allowedRoles={['patient']}>
                <AddMedicationPage />
              </RoleBasedRoute>
            }
          />
          <Route
            path="medications/:id/edit"
            element={
              <RoleBasedRoute allowedRoles={['patient']}>
                <EditMedicationPage />
              </RoleBasedRoute>
            }
          />

          {/* Schedule — patient-only */}
          <Route
            path="schedule"
            element={
              <RoleBasedRoute allowedRoles={['patient']}>
                <SchedulePage />
              </RoleBasedRoute>
            }
          />

          {/* Devices — patient-only */}
          <Route
            path="devices"
            element={
              <RoleBasedRoute allowedRoles={['patient']}>
                <DevicesPage />
              </RoleBasedRoute>
            }
          />

          {/* Reports — patient-only */}
          <Route
            path="reports"
            element={
              <RoleBasedRoute allowedRoles={['patient']}>
                <ReportsPage />
              </RoleBasedRoute>
            }
          />

          {/* Settings — accessible to all authenticated roles */}
          <Route path="settings" element={<SecuritySettings />} />
        </Route>

        {/* 404 Redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

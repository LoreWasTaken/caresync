// src/features/dashboard/layouts/DashboardLayout.tsx
import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../shared/store/authStore'
import {
  LayoutDashboard,
  Pill,
  CalendarDays,
  Cpu,
  FileBarChart,
  Users,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Navigation definitions per role                                    */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  disabled?: boolean          // future features — rendered but greyed-out
}

const patientNav: NavItem[] = [
  { label: 'Dashboard',   to: '/app/patient',      icon: <LayoutDashboard size={18} /> },
  { label: 'Medications', to: '/app/medications',   icon: <Pill size={18} /> },
  { label: 'Schedule',    to: '/app/schedule',      icon: <CalendarDays size={18} /> },
  { label: 'Devices',     to: '/app/devices',       icon: <Cpu size={18} /> },
  { label: 'Reports',     to: '/app/reports',       icon: <FileBarChart size={18} /> },
]

const caregiverNav: NavItem[] = [
  { label: 'Dashboard', to: '/app/caregiver', icon: <LayoutDashboard size={18} /> },
  { label: 'Patients',  to: '/app/patients',  icon: <Users size={18} />,           disabled: true },
  { label: 'Reports',   to: '/app/reports',   icon: <FileBarChart size={18} />,    disabled: true },
]

const bottomNav: NavItem[] = [
  { label: 'Settings', to: '/app/settings', icon: <Settings size={18} /> },
]

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export const DashboardLayout = () => {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const role = user?.role ?? 'patient'
  const mainNav = role === 'caregiver' || role === 'healthcare_provider' ? caregiverNav : patientNav

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  /* shared link classes */
  const linkClasses = (isActive: boolean, disabled?: boolean) =>
    [
      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
      disabled
        ? 'text-text-muted/40 cursor-not-allowed'
        : isActive
          ? 'bg-brand-primary/10 text-brand-primary'
          : 'text-text-muted hover:bg-bg-hover hover:text-text-main',
    ].join(' ')

  /* Sidebar content (reused for mobile drawer & desktop fixed) */
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border-subtle">
        <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center text-white font-bold text-sm">
          CS
        </div>
        <span className="text-lg font-bold text-text-main tracking-tight">CareSync</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {mainNav.map((item) =>
          item.disabled ? (
            <span key={item.to} className={linkClasses(false, true)}>
              {item.icon}
              {item.label}
              <span className="ml-auto text-[10px] uppercase tracking-wider opacity-60">soon</span>
            </span>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => linkClasses(isActive)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      {/* Bottom nav (settings) */}
      <div className="px-3 pb-4 space-y-1 border-t border-border-subtle pt-3">
        {bottomNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => linkClasses(isActive)}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  )

  return (
    <div className="h-dvh flex bg-bg-page text-text-main">
      {/* ---------- Mobile overlay ---------- */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ---------- Sidebar ---------- */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-60 bg-bg-card border-r border-border-subtle transform transition-transform duration-200 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Mobile close button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-3 p-1 rounded-md hover:bg-bg-hover text-text-muted lg:hidden"
        >
          <X size={18} />
        </button>

        <SidebarContent />
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-border-subtle bg-bg-card shrink-0">
          {/* Left: hamburger + greeting */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md hover:bg-bg-hover text-text-muted lg:hidden"
            >
              <Menu size={20} />
            </button>

            <h1 className="text-sm sm:text-base font-semibold truncate">
              Welcome back, <span className="text-brand-primary">{user?.firstName || user?.email?.split('@')[0]}</span>
            </h1>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <button
              className="p-2 rounded-full border border-border-subtle hover:bg-bg-hover transition-colors"
              title="Notifications"
            >
              <Bell className="text-text-muted w-4.5 h-4.5" size={18} />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-full border border-border-subtle hover:bg-red-500/10 hover:text-red-500 transition-colors group"
              title="Logout"
            >
              <LogOut className="text-text-muted group-hover:text-red-500 w-4.5 h-4.5" size={18} />
            </button>
          </div>
        </header>

        {/* Page content — scrollable */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 themed-scrollbar">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

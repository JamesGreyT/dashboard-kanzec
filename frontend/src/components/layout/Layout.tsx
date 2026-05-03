import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'
import GlobalLoadingBar from '@/components/GlobalLoadingBar'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't trigger in input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setSidebarOpen(true)
      }
      if (e.key === 'Escape') {
        setSidebarOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app-shell grain-overlay relative flex h-[100dvh] overflow-hidden text-foreground">
      <GlobalLoadingBar />
      {/* Mobile Header (visible only on small screens) */}
      <div className="md:hidden absolute top-0 left-0 right-0 z-20 flex items-center justify-between border-b border-border/70 bg-sidebar/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-tight text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>Kanzec</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-md border border-border/70 bg-card/70 p-1.5 text-muted-foreground transition-colors hover:text-foreground" aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}>
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar (drawer on mobile, fixed on desktop) */}
      <div className={`
        fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/45 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main id="main" className="relative z-10 w-full flex-1 overflow-y-auto px-4 pb-20 pt-18 md:px-6 md:py-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}

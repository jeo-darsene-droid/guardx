import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Mail, CopyCheck, Building2, Users, Database, Settings, ChevronLeft, Flame, Search, Smartphone } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', emoji: '📊' },
  { to: '/lettres', icon: Mail, label: 'Générateur de lettres', emoji: '📬' },
  { to: '/doublons', icon: CopyCheck, label: 'Vérificateur de doublons', emoji: '🔍' },
  { to: '/coproprietes', icon: Building2, label: 'Ciblage copropriétés', emoji: '🏘️' },
  { to: '/croisement-req', icon: Search, label: 'Croisement REQ', emoji: '🔗' },
  { to: '/prospects', icon: Users, label: 'Mes prospects', emoji: '📋' },
  { to: '/terrain', icon: Smartphone, label: 'Mode terrain', emoji: '📱' },
  { to: '/base-clients', icon: Database, label: 'Base clients', emoji: '🛡️' },
  { to: '/parametres', icon: Settings, label: 'Paramètres', emoji: '⚙️' },
]

export default function Sidebar({ open, onToggle }) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onToggle} />
      )}

      <aside
        className={`${
          open ? 'w-64' : 'w-0 lg:w-20'
        } shrink-0 transition-all duration-300 overflow-hidden bg-navy text-white z-40 lg:relative fixed h-full`}
      >
        <div className="flex flex-col h-full">
          {/* Logo area */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <Flame className="text-accent shrink-0" size={24} />
              {open && <span className="text-lg font-extrabold text-accent whitespace-nowrap">GUARD-X</span>}
            </div>
            <button onClick={onToggle} className="hidden lg:block p-1 rounded hover:bg-white/10 shrink-0">
              <ChevronLeft className={`transition-transform ${!open ? 'rotate-180' : ''}`} size={18} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  } ${!open ? 'lg:justify-center' : ''}`
                }
                title={item.label}
              >
                <span className="text-lg shrink-0">{item.emoji}</span>
                {open && <span className="whitespace-nowrap">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 shrink-0">
            {open ? (
              <p className="text-xs text-white/40">Guard-X Protection Incendie<br />© 2025 — Tous droits réservés</p>
            ) : (
              <p className="text-xs text-white/40 text-center">©2025</p>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}

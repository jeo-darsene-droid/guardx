import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'
import LetterGenerator from './components/LetterGenerator.jsx'
import DuplicateChecker from './components/DuplicateChecker.jsx'
import PropertyFilter from './components/PropertyFilter.jsx'
import ProspectTracker from './components/ProspectTracker.jsx'
import ClientBase from './components/ClientBase.jsx'
import Settings from './components/Settings.jsx'
import { CheckCircle, XCircle, X } from 'lucide-react'

const API = '/api'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [toasts, setToasts] = useState([])
  const [config, setConfig] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  useEffect(() => {
    fetch(`${API}/config`)
      .then(r => r.json())
      .then(data => setConfig(data))
      .catch(() => {
        setConfig({
          rep_name: 'Jéo-Darsène Saint-Louis',
          phone: '438-406-5077',
          email: 'jdsaintlouis@guard-x.com',
          default_mode: 'postal',
        })
      })
  }, [])

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-light-grey">
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 rounded-lg hover:bg-gray-100 lg:hidden"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span className="text-xl font-extrabold text-accent tracking-tight">GUARD-X</span>
              <span className="hidden sm:inline text-sm text-gray-400 font-medium">Protection Incendie</span>
            </div>
            <div className="flex items-center gap-3">
              {config && (
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-navy">{config.rep_name}</div>
                  <div className="text-xs text-gray-400">{config.phone}</div>
                </div>
              )}
              <div className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center text-sm font-bold">
                {config?.rep_name?.charAt(0) || 'J'}
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Dashboard showToast={showToast} />} />
              <Route path="/lettres" element={<LetterGenerator config={config} showToast={showToast} />} />
              <Route path="/doublons" element={<DuplicateChecker showToast={showToast} />} />
              <Route path="/coproprietes" element={<PropertyFilter showToast={showToast} />} />
              <Route path="/prospects" element={<ProspectTracker showToast={showToast} />} />
              <Route path="/base-clients" element={<ClientBase showToast={showToast} />} />
              <Route path="/parametres" element={<Settings config={config} setConfig={setConfig} showToast={showToast} />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>

        {/* Toasts */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`toast-enter flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[280px] ${
                t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
              }`}
            >
              {t.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
              <span className="flex-1 text-sm font-medium">{t.message}</span>
              <button onClick={() => removeToast(t.id)} className="hover:opacity-70">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </BrowserRouter>
  )
}

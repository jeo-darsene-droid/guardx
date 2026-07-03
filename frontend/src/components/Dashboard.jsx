import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Users, CopyCheck, Building2, Mail, Search, Target, ArrowRight, Activity } from 'lucide-react'

const API = '/api'

export default function Dashboard({ showToast }) {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState({ letters_today: 0, prospects: 0, duplicates_removed: 0, properties_targeted: 0 })
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/kpis`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/activity`).then(r => r.json()).catch(() => []),
    ]).then(([k, a]) => {
      setKpis(k)
      setActivity(a)
      setLoading(false)
    })
  }, [])

  const kpiCards = [
    { label: 'Lettres générées aujourd\'hui', value: kpis.letters_today || 0, icon: FileText, color: 'bg-navy' },
    { label: 'Prospects dans le pipeline', value: kpis.prospects || 0, icon: Users, color: 'bg-blue-600' },
    { label: 'Doublons supprimés', value: kpis.duplicates_removed || 0, icon: CopyCheck, color: 'bg-accent' },
    { label: 'Propriétés ciblées', value: kpis.properties_targeted || 0, icon: Building2, color: 'bg-green-600' },
  ]

  const quickActions = [
    { label: 'Générer des lettres', icon: Mail, path: '/lettres', color: 'bg-navy hover:bg-navy-light' },
    { label: 'Vérifier doublons', icon: Search, path: '/doublons', color: 'bg-accent hover:bg-accent-light' },
    { label: 'Cibler secteur', icon: Target, path: '/coproprietes', color: 'bg-green-600 hover:bg-green-700' },
  ]

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleString('fr-CA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de votre activité de prospection</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">{kpi.label}</p>
                <p className="text-3xl font-bold text-navy mt-1">
                  {loading ? '—' : kpi.value.toLocaleString('fr-CA')}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-lg ${kpi.color} flex items-center justify-center`}>
                <kpi.icon className="text-white" size={24} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Two columns: Activity + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity feed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={20} className="text-navy" />
            <h2 className="text-lg font-semibold text-navy">Activité récente</h2>
          </div>
          {activity.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">Aucune activité récente</p>
          ) : (
            <div className="space-y-3">
              {activity.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">{a.detail || a.action}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatTime(a.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-navy mb-4">Actions rapides</h2>
          <div className="space-y-3">
            {quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-lg text-white font-medium transition-colors ${action.color}`}
              >
                <div className="flex items-center gap-3">
                  <action.icon size={20} />
                  <span>{action.label}</span>
                </div>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

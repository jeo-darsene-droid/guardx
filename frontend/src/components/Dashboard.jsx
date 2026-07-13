import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Users, CopyCheck, Building2, Mail, Search, Target, ArrowRight, Activity, AlarmClock, Phone, Footprints, FileCheck, Trophy, Download, TrendingUp, Gauge } from 'lucide-react'

const API = '/api'

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const QUICK_LOG = [
  { action: 'appel', label: 'Appel', icon: Phone, color: 'bg-blue-600 hover:bg-blue-700' },
  { action: 'visite', label: 'Visite terrain', icon: Footprints, color: 'bg-teal-600 hover:bg-teal-700' },
  { action: 'courriel', label: 'Courriel', icon: Mail, color: 'bg-yellow-600 hover:bg-yellow-700' },
  { action: 'soumission', label: 'Soumission envoyée', icon: FileCheck, color: 'bg-green-600 hover:bg-green-700' },
  { action: 'vente', label: 'Vente signée', icon: Trophy, color: 'bg-accent hover:bg-accent-light' },
]

export default function Dashboard({ showToast }) {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState({ letters_today: 0, prospects: 0, duplicates_removed: 0, properties_targeted: 0 })
  const [activity, setActivity] = useState([])
  const [followups, setFollowups] = useState({ due: [], overdue: [], pipeline_count: 0, machine_count: 0 })
  const [cadence, setCadence] = useState(null)
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1)
  const [reportYear, setReportYear] = useState(now.getFullYear())
  const [generatingReport, setGeneratingReport] = useState(false)

  const loadData = useCallback(() => {
    Promise.all([
      fetch(`${API}/kpis`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/activity`).then(r => r.json()).catch(() => []),
      fetch(`${API}/followups`).then(r => r.json()).catch(() => ({ due: [], overdue: [] })),
      fetch(`${API}/cadence-anjou`).then(r => r.json()).catch(() => null),
    ]).then(([k, a, f, c]) => {
      setKpis(k)
      setActivity(a)
      setFollowups(f)
      setCadence(c)
      setLoading(false)
    })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleQuickLog = async (action, label) => {
    try {
      await fetch(`${API}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, detail: label, detail_count: 1 }),
      })
      showToast(`${label} enregistré(e) au journal`)
      loadData()
    } catch {
      showToast('Erreur lors de l\'enregistrement', 'error')
    }
  }

  const handleGenerateReport = async () => {
    setGeneratingReport(true)
    try {
      const res = await fetch(`${API}/report/monthly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: reportYear, month: reportMonth }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport_prospection_${reportYear}_${String(reportMonth).padStart(2, '0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Rapport mensuel généré')
    } catch {
      showToast('Erreur lors de la génération du rapport', 'error')
    } finally {
      setGeneratingReport(false)
    }
  }

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

  const ProgressBar = ({ value, max, color = 'bg-accent' }) => {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium text-gray-600 shrink-0 tabular-nums">{value} / {max}</span>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de votre activité de prospection</p>
      </div>

      {/* Cadence Anjou */}
      {cadence && (
        <div className="bg-gradient-to-br from-navy to-navy/90 rounded-xl shadow-sm p-5 text-white">
          <div className="flex items-center gap-2 mb-4">
            <Gauge size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Cadence Anjou</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-white/60 font-medium mb-1.5">Lettres cette semaine</p>
              <ProgressBar value={cadence.lettres_semaine} max={cadence.lettres_semaine_obj} color="bg-accent" />
            </div>
            <div>
              <p className="text-xs text-white/60 font-medium mb-1.5">Qualifiées aujourd'hui</p>
              <ProgressBar value={cadence.qualifiees_jour} max={cadence.qualifiees_jour_obj} color="bg-green-400" />
            </div>
            <div>
              <p className="text-xs text-white/60 font-medium mb-1.5">Qualifiées ce mois</p>
              <ProgressBar value={cadence.qualifiees_mois} max={cadence.qualifiees_mois_obj} color="bg-blue-400" />
            </div>
            <div>
              <p className="text-xs text-white/60 font-medium mb-1.5">Taux de retour</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-accent tabular-nums">{cadence.taux_retour}%</span>
                <span className="text-xs text-white/50">{cadence.retours_entrants} / {cadence.lettres_total} lettres</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-white/60 font-medium">Couverture Anjou</p>
              <span className="text-xs font-medium text-white/80 tabular-nums">{cadence.couverture_traite} / {cadence.couverture_obj}</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent to-green-400 rounded-full transition-all" style={{ width: `${Math.min(100, (cadence.couverture_traite / cadence.couverture_obj) * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Panneau Aujourd'hui — suivis dus et en retard */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlarmClock size={20} className="text-accent" />
          <h2 className="text-lg font-semibold text-navy">Aujourd'hui</h2>
          {(followups.overdue.length + followups.due.length) > 0 && (
            <span className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full bg-accent/10 text-accent">
              {followups.overdue.length + followups.due.length} suivi(s) à faire
              {followups.pipeline_count != null && (
                <span className="ml-1 text-gray-400">· {followups.pipeline_count} pipeline + {followups.machine_count || 0} machine</span>
              )}
            </span>
          )}
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm py-4 text-center">Chargement...</p>
        ) : followups.overdue.length === 0 && followups.due.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">✅ Aucun suivi dû aujourd'hui. Planifiez vos prochaines actions dans Mes prospects.</p>
        ) : (
          <div className="space-y-2">
            {/* Pipeline follow-ups FIRST (overdue) */}
            {followups.overdue.map(p => (
              <button key={`o-${p.id}`} onClick={() => navigate('/prospects')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 hover:bg-red-100 text-left transition-colors">
                <span className="text-xs font-bold text-red-600 shrink-0 w-24">⚠ {p.next_action}</span>
                <span className="font-medium text-gray-700 flex-1 truncate">{p.entreprise || p.adresse || '—'}</span>
                <span className="text-xs text-gray-500 hidden sm:block">{p.statut}</span>
                {p.telephone && <span className="text-xs text-navy font-medium shrink-0">{p.telephone}</span>}
              </button>
            ))}
            {/* Pipeline follow-ups (due today) */}
            {followups.due.map(p => {
              const isMachine = !!p._machine_type
              return (
                <button key={`d-${p.id}`} onClick={() => navigate('/prospects')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border ${isMachine ? 'bg-purple-50 border-purple-100 hover:bg-purple-100' : 'bg-blue-50 border-blue-100 hover:bg-blue-100'}`}>
                  <span className={`text-xs font-bold shrink-0 w-24 ${isMachine ? 'text-purple-600' : 'text-blue-600'}`}>{isMachine ? p._machine_type : 'Aujourd\'hui'}</span>
                  <span className="font-medium text-gray-700 flex-1 truncate">{p.entreprise || p.adresse || '—'}</span>
                  <span className="text-xs text-gray-500 hidden sm:block">{p.statut}</span>
                  {p.telephone && <span className="text-xs text-navy font-medium shrink-0">{p.telephone}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Journal rapide */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-navy mb-3">Journal rapide</h2>
        <p className="text-xs text-gray-400 mb-3">Enregistrez chaque action — elles alimentent automatiquement le rapport mensuel de Mel.</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_LOG.map(q => (
            <button key={q.action} onClick={() => handleQuickLog(q.action, q.label)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${q.color}`}>
              <q.icon size={16} />
              {q.label}
            </button>
          ))}
        </div>
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

          {/* Rapport mensuel pour Mel */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <h3 className="font-semibold text-navy mb-2">Rapport mensuel (Mel)</h3>
            <div className="flex gap-2">
              <select value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm">
                {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm">
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={handleGenerateReport} disabled={generatingReport} className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light text-sm font-medium disabled:opacity-50">
                <Download size={16} />
                {generatingReport ? 'Génération...' : 'Générer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

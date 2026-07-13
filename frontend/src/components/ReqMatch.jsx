import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { Upload, Database, Loader2, Search, Download, Send, AlertTriangle, CheckCircle, XCircle, HelpCircle, RefreshCw, Mail, MapPin, Check } from 'lucide-react'

const API = '/api'
// Limite d'upload des fonctions serverless (Vercel ~4.5 Mo) — les gros imports doivent se faire en local
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname)

export default function ReqMatch({ showToast }) {
  const navigate = useNavigate()
  const [info, setInfo] = useState({ count: 0, last_import: null })
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [buildings, setBuildings] = useState([])
  const [matching, setMatching] = useState(false)
  const [results, setResults] = useState(null)
  const [activeTab, setActiveTab] = useState('matched')
  const [addrOverrides, setAddrOverrides] = useState({})
  const resultsRef = useRef(null)
  const [postalLoading, setPostalLoading] = useState(false)
  const [postalResults, setPostalResults] = useState(null)
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [expandedStreets, setExpandedStreets] = useState(new Set())
  const [importing, setImporting] = useState(false)

  const loadInfo = useCallback(() => {
    fetch(`${API}/req-info`)
      .then(r => r.json())
      .then(data => { setInfo(data); setLoadingInfo(false) })
      .catch(() => setLoadingInfo(false))
  }, [])

  useEffect(() => { loadInfo() }, [loadInfo])

  // Load buildings from sessionStorage (populated by PropertyFilter)
  useEffect(() => {
    const stored = sessionStorage.getItem('req_buildings')
    if (stored) {
      try { setBuildings(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  const onDrop = useCallback(async (acceptedFiles) => {
    const f = acceptedFiles[0]
    if (!f) return
    if (f.size > MAX_UPLOAD_BYTES && !IS_LOCAL) {
      showToast(`Fichier trop volumineux (${(f.size / 1024 / 1024).toFixed(0)} Mo) pour l'app en ligne (limite 4.5 Mo). Faites cet import depuis l'app locale (localhost) — les données seront ensuite visibles partout.`, 'error')
      return
    }
    setUploading(true)
    const formData = new FormData()
    formData.append('file', f)
    try {
      const res = await fetch(`${API}/req-import`, { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.error || `Erreur ${res.status} lors de l'import REQ`, 'error')
      } else {
        showToast(`Base REQ mise à jour — ${data.count} syndicats trouvés sur ${data.total_scanned?.toLocaleString()} lignes`)
        loadInfo()
      }
    } catch (err) {
      showToast(`Erreur de connexion lors de l'import REQ: ${err.message}`, 'error')
    } finally {
      setUploading(false)
    }
  }, [showToast, loadInfo])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'] },
    multiple: false,
  })

  const runMatch = async () => {
    if (buildings.length === 0) {
      showToast('Aucun bâtiment à croiser. Utilisez d\'abord Ciblage copropriétés.', 'error')
      return
    }
    setMatching(true)
    setResults(null)
    try {
      const res = await fetch(`${API}/req-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: buildings }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Erreur lors du croisement', 'error')
      } else {
        setResults(data)
        setActiveTab('matched')
        showToast(`Croisement terminé — ${data.matched_count} matchés, ${data.uncertain_count} incertains, ${data.no_syndicat_count} sans syndicat`)
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    } catch {
      showToast('Erreur lors du croisement REQ', 'error')
    } finally {
      setMatching(false)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return null
    return new Date(iso).toLocaleString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const toggleAddr = (idx, row) => {
    setAddrOverrides(prev => {
      const key = `${activeTab}-${idx}`
      const current = prev[key]
      if (current === 'immeuble') {
        const { [key]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: 'immeuble' }
    })
  }

  const getDisplayAddr = (row, idx) => {
    const key = `${activeTab}-${idx}`
    if (addrOverrides[key] === 'immeuble') {
      return { adresse: row.Adresse_Immeuble, ville: row.Ville_CodePostal_Immeuble || row.Ville_CodePostal, source: 'Immeuble (manuel)' }
    }
    return { adresse: row.Adresse, ville: row.Ville_CodePostal, source: row.source_adresse }
  }

  const buildExportRows = () => {
    if (!results) return []
    const categories = [
      ['matched', results.matched || []],
      ['uncertain', results.uncertain || []],
      ['no_syndicat', results.no_syndicat || []],
    ]
    const out = []
    for (const [tabKey, rows] of categories) {
      rows.forEach((row, idx) => {
        const useImmeuble = addrOverrides[`${tabKey}-${idx}`] === 'immeuble'
        out.push({
          Nom_Gestionnaire: '',
          Nom_Syndicat: row.Nom_Syndicat || '',
          Adresse: useImmeuble ? row.Adresse_Immeuble : row.Adresse,
          Ville_CodePostal: useImmeuble ? (row.Ville_CodePostal_Immeuble || row.Ville_CodePostal || '') : (row.Ville_CodePostal || ''),
          Nb_Unites: row.Nb_Unites || '',
          Secteur: row.Secteur || '',
          Code_Utilisation: row.Code_Utilisation || '',
          Notes: row.Notes || '',
          Adresse_Immeuble: row.Adresse_Immeuble || '',
          NEQ: row.NEQ || '',
          Statut_REQ: row.Statut_REQ || '',
          Score: row.match_score ?? '',
          Source_Adresse: useImmeuble ? 'Immeuble (manuel)' : (row.source_adresse || ''),
        })
      })
    }
    return out
  }

  const exportExcel = async () => {
    const rows = buildExportRows()
    if (rows.length === 0) return
    try {
      const res = await fetch(`${API}/export-properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, sheet_name: 'Croisement_REQ' }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `croisement_req_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Export Excel téléchargé')
    } catch {
      showToast('Erreur lors de l\'export', 'error')
    }
  }

  const sendToProspects = async () => {
    const rows = buildExportRows()
    if (rows.length === 0) return
    try {
      const res = await fetch(`${API}/prospects/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: rows }),
      })
      const data = await res.json()
      showToast(`${data.added} prospects ajoutés (${data.total} total)`)
    } catch {
      showToast('Erreur lors de l\'envoi vers les prospects', 'error')
    }
  }

  const goToLetters = async () => {
    const rows = buildExportRows()
    if (rows.length === 0) return
    sessionStorage.setItem('letter_rows', JSON.stringify(rows))
    navigate('/lettres')
    showToast(`${rows.length} lignes transférées vers le générateur de lettres`)
  }

  // ── Phase E: REQ import by postal code ──
  const onDropPostal = useCallback(async (acceptedFiles) => {
    const f = acceptedFiles[0]
    if (!f) return
    if (f.size > MAX_UPLOAD_BYTES && !IS_LOCAL) {
      showToast(`Fichier trop volumineux (${(f.size / 1024 / 1024).toFixed(0)} Mo) pour l'app en ligne (limite 4.5 Mo). Faites cet import depuis l'app locale (localhost) — les données seront ensuite visibles partout.`, 'error')
      return
    }
    setPostalLoading(true)
    setPostalResults(null)
    setSelectedRows(new Set())
    const formData = new FormData()
    formData.append('file', f)
    try {
      const res = await fetch(`${API}/req-import-by-postal`, { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.error || `Erreur ${res.status} lors du filtrage REQ`, 'error')
      } else if (data.count === 0) {
        showToast(data.message || 'Aucun établissement trouvé pour Anjou')
      } else {
        setPostalResults(data)
        // Expand all streets by default
        setExpandedStreets(new Set(data.streets.map(s => s.rue)))
        showToast(`${data.count} entreprises trouvées à Anjou (${data.duplicates} doublons exclus) — ${data.streets.length} rues`)
      }
    } catch (err) {
      showToast(`Erreur de connexion lors du filtrage REQ: ${err.message}`, 'error')
    } finally {
      setPostalLoading(false)
    }
  }, [showToast])

  const { getRootProps: getRootPropsPostal, getInputProps: getInputPropsPostal, isDragActive: isDragActivePostal } = useDropzone({
    onDrop: onDropPostal,
    accept: { 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'] },
    multiple: false,
  })

  const toggleRow = (neq) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(neq)) next.delete(neq)
      else next.add(neq)
      return next
    })
  }

  const toggleStreet = (rue, rows) => {
    const allSelected = rows.every(r => selectedRows.has(r.neq))
    setSelectedRows(prev => {
      const next = new Set(prev)
      for (const r of rows) {
        if (allSelected) next.delete(r.neq)
        else next.add(r.neq)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!postalResults) return
    const allRows = postalResults.streets.flatMap(s => s.rows)
    if (allRows.every(r => selectedRows.has(r.neq))) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(allRows.map(r => r.neq)))
    }
  }

  const toggleStreetExpand = (rue) => {
    setExpandedStreets(prev => {
      const next = new Set(prev)
      if (next.has(rue)) next.delete(rue)
      else next.add(rue)
      return next
    })
  }

  const importSelected = async () => {
    if (selectedRows.size === 0) {
      showToast('Aucune ligne sélectionnée', 'error')
      return
    }
    setImporting(true)
    const allRows = postalResults.streets.flatMap(s => s.rows)
    const selected = allRows.filter(r => selectedRows.has(r.neq))
    try {
      const res = await fetch(`${API}/req-import-selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: selected }),
      })
      const data = await res.json()
      if (data.status === 'ok') {
        showToast(`${data.added} prospects ajoutés (${data.total} total)`, 'success')
        setSelectedRows(new Set())
      } else {
        showToast(data.error || 'Erreur lors de l\'import', 'error')
      }
    } catch {
      showToast('Erreur lors de l\'import', 'error')
    } finally {
      setImporting(false)
    }
  }

  const tabs = [
    { key: 'matched', label: 'Matchés', icon: CheckCircle, color: 'green', count: results?.matched_count || 0 },
    { key: 'uncertain', label: 'Incertains', icon: HelpCircle, color: 'amber', count: results?.uncertain_count || 0 },
    { key: 'no_syndicat', label: 'Sans syndicat', icon: XCircle, color: 'gray', count: results?.no_syndicat_count || 0 },
  ]

  const currentRows = results ? (results[activeTab] || []) : []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Croisement REQ</h1>
        <p className="text-gray-500 text-sm mt-1">
          Croisez les bâtiments du Ciblage copropriétés avec le Registre des entreprises du Québec (REQ)
          pour enrichir automatiquement le nom du syndicat et l'adresse d'envoi postale.
        </p>
      </div>

      {/* REQ base status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${info.count > 0 ? 'bg-green-600' : 'bg-gray-400'}`}>
          <Database className="text-white" size={24} />
        </div>
        <div className="flex-1">
          {loadingInfo ? (
            <p className="text-gray-400">Chargement...</p>
          ) : info.count > 0 ? (
            <>
              <p className="font-semibold text-navy">{info.count.toLocaleString('fr-CA')} syndicats dans la base REQ</p>
              <p className="text-sm text-gray-400">Dernier import : {formatDate(info.last_import) || '—'}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-600">Base REQ vide</p>
              <p className="text-sm text-gray-400">Importez le fichier CSV du REQ (Données Québec) pour activer le croisement.</p>
            </>
          )}
        </div>
        {info.count > 0 && (
          <button onClick={loadInfo} className="p-2 rounded-lg hover:bg-gray-100" title="Rafraîchir">
            <RefreshCw size={18} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* Step 1: Import REQ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-navy mb-1">Étape 1 — Importer les données REQ</h3>
        <p className="text-sm text-gray-500 mb-4">
          Téléchargez le dataset « registre-des-entreprises » sur Données Québec (fichier ZIP ~225 Mo).
          Le système extrait automatiquement les 3 fichiers nécessaires (Entreprise, Nom, Établissement),
          filtre les syndicats de copropriété et les stocke dans la base.
        </p>
        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${isDragActive ? 'border-accent bg-accent/5' : 'border-gray-300 hover:border-navy'}`}>
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <>
                <Loader2 className="text-navy animate-spin" size={36} />
                <p className="font-medium text-gray-600">Import et filtrage en cours... (peut prendre quelques minutes)</p>
              </>
            ) : (
              <>
                <Upload className="text-gray-400" size={36} />
                <p className="font-medium text-gray-600">Glissez le fichier ZIP REQ ici</p>
                <p className="text-sm text-gray-400">Téléchargé de Données Québec (registre-des-entreprises) — .zip ~225 Mo</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Step 2: Match buildings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-navy mb-1">Étape 2 — Croisement avec les bâtiments</h3>
        <p className="text-sm text-gray-500 mb-4">
          {buildings.length > 0
            ? `${buildings.length} bâtiments prêts à croiser (provenant du Ciblage copropriétés).`
            : 'Aucun bâtiment. Allez sur Ciblage copropriétés, filtrez, puis revenez ici.'}
        </p>
        <button
          onClick={runMatch}
          disabled={buildings.length === 0 || info.count === 0 || matching}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-navy/90 transition-colors"
        >
          {matching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          {matching ? 'Croisement en cours...' : 'Croiser avec la base REQ'}
        </button>
      </div>

      {/* Phase E — REQ businesses by postal code (Zones 1-3) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-navy mb-1 flex items-center gap-2">
          <MapPin size={18} className="text-accent" />
          Import REQ par code postal — Anjou (Zones 1-3)
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Filtre le dump REQ par codes postaux H1J / H1K (Anjou). Dédoublonne contre les prospects existants ET la base clients.
          Les entreprises sont groupées par rue avec zone auto-assignée et segment « Industriel / Commercial ».
        </p>
        <div {...getRootPropsPostal()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${isDragActivePostal ? 'border-accent bg-accent/5' : 'border-gray-300 hover:border-navy'}`}>
          <input {...getInputPropsPostal()} />
          <div className="flex flex-col items-center gap-2">
            {postalLoading ? (
              <>
                <Loader2 className="text-navy animate-spin" size={36} />
                <p className="font-medium text-gray-600">Filtrage par code postal en cours... (peut prendre quelques minutes)</p>
              </>
            ) : (
              <>
                <Upload className="text-gray-400" size={36} />
                <p className="font-medium text-gray-600">Glissez le fichier ZIP REQ ici</p>
                <p className="text-sm text-gray-400">Filtrage automatique par H1J / H1K → Anjou</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Phase E — Preview results */}
      {postalResults && (
        <div className="space-y-4">
          <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="text-accent" size={24} />
              <div>
                <p className="font-semibold text-navy">{postalResults.count} entreprises trouvées</p>
                <p className="text-sm text-gray-500">
                  {postalResults.duplicates} doublons exclus · {postalResults.streets.length} rues · {postalResults.total_scanned?.toLocaleString()} établissements scannés
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-navy hover:bg-gray-50"
              >
                <Check size={14} />
                {postalResults.streets.flatMap(s => s.rows).every(r => selectedRows.has(r.neq)) ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
              <button
                onClick={importSelected}
                disabled={selectedRows.size === 0 || importing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {importing ? 'Import...' : `Importer la sélection (${selectedRows.size})`}
              </button>
            </div>
          </div>

          {/* Street-grouped preview */}
          <div className="space-y-2">
            {postalResults.streets.map(sd => {
              const isExpanded = expandedStreets.has(sd.rue)
              const allSelected = sd.rows.every(r => selectedRows.has(r.neq))
              const someSelected = sd.rows.some(r => selectedRows.has(r.neq))
              return (
                <div key={sd.rue} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Street header */}
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 cursor-pointer" onClick={() => toggleStreetExpand(sd.rue)}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                      onChange={() => toggleStreet(sd.rue, sd.rows)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                    <span className="font-medium text-navy capitalize flex-1">{sd.rue}</span>
                    <span className="text-xs text-gray-400">{sd.zone}</span>
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{sd.rows.length}</span>
                    <svg className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                  </div>
                  {/* Street rows */}
                  {isExpanded && (
                    <div className="border-t border-gray-50">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50/50">
                          <tr>
                            <th className="px-4 py-2 w-8"></th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600">Entreprise</th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600">NEQ</th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600">Adresse</th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600">Statut</th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600">Zone</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sd.rows.map(r => (
                            <tr key={r.neq} className={`hover:bg-gray-50/50 ${selectedRows.has(r.neq) ? 'bg-accent/5' : ''}`}>
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={selectedRows.has(r.neq)}
                                  onChange={() => toggleRow(r.neq)}
                                  className="w-4 h-4 accent-accent cursor-pointer"
                                />
                              </td>
                              <td className="px-2 py-2 font-medium text-navy">{r.nom}</td>
                              <td className="px-2 py-2 text-gray-500 text-xs">{r.neq}</td>
                              <td className="px-2 py-2 text-gray-600">{r.adresse}</td>
                              <td className="px-2 py-2 text-gray-500 text-xs">{r.statut_immat || '—'}</td>
                              <td className="px-2 py-2 text-xs">
                                <span className={`px-1.5 py-0.5 rounded ${r.zone === 'Hors zone' ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700'}`}>
                                  {r.zone}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          <div ref={resultsRef} className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="text-green-600" size={24} />
            <div>
              <p className="font-semibold text-green-800">Croisement terminé</p>
              <p className="text-sm text-green-700">
                {results.matched_count} matchés · {results.uncertain_count} incertains · {results.no_syndicat_count} sans syndicat —
                utilisez les boutons ci-dessous pour exporter, envoyer aux prospects ou générer les lettres.
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200">
            {tabs.map(tab => {
              const Icon = tab.icon
              const colorClasses = {
                green: 'text-green-600 border-green-600',
                amber: 'text-amber-600 border-amber-600',
                gray: 'text-gray-500 border-gray-500',
              }
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key ? colorClasses[tab.color] : 'text-gray-400 border-transparent hover:text-gray-600'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label} ({tab.count})
                </button>
              )
            })}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-navy hover:bg-gray-50">
              <Download size={16} /> Exporter Excel
            </button>
            <button onClick={sendToProspects} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90">
              <Send size={16} /> Envoyer vers Mes prospects
            </button>
            <button onClick={goToLetters} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy/90">
              <Mail size={16} /> Générer les lettres
            </button>
          </div>

          {/* Results table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Syndicat</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Adresse d'envoi</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Source</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Score</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Immeuble</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">NEQ</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentRows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun résultat dans cette catégorie</td></tr>
                  ) : currentRows.map((row, idx) => {
                    const display = getDisplayAddr(row, idx)
                    const isOverridden = addrOverrides[`${activeTab}-${idx}`] === 'immeuble'
                    return (
                      <tr key={idx} className={row.is_radie ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-navy">{row.Nom_Syndicat || '—'}</div>
                          {row.is_radie && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium mt-0.5">
                              <AlertTriangle size={12} /> STATUT RADIÉ
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div>{display.adresse}</div>
                          <div className="text-gray-400 text-xs">{display.ville}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            display.source.startsWith('REQ') ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {display.source}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`font-medium ${row.match_score >= 85 ? 'text-green-600' : row.match_score >= 50 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {row.match_score}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{row.Adresse_Immeuble}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{row.NEQ || '—'}</td>
                        <td className="px-3 py-2">
                          {row.source_adresse !== 'Immeuble' && (
                            <button
                              onClick={() => toggleAddr(idx, row)}
                              className={`text-xs px-2 py-1 rounded ${isOverridden ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                              {isOverridden ? '↩ REQ' : '↪ Immeuble'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

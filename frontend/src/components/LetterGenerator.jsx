import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, Mail, Download, Loader2, Table, Send, Link2, AlertTriangle } from 'lucide-react'

const API = '/api'

export default function LetterGenerator({ config, showToast }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [mode, setMode] = useState(config?.default_mode || 'postal')
  const [repName, setRepName] = useState(config?.rep_name || 'Jéo-Darsène Saint-Louis')
  const [repTitle, setRepTitle] = useState(config?.rep_title || 'Gestionnaire de comptes clients')
  const [phone, setPhone] = useState(config?.phone || '438-406-5077')
  const [email, setEmail] = useState(config?.email || 'jdsaintlouis@guard-x.com')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [resultUrl, setResultUrl] = useState(null)
  const [clientWarnings, setClientWarnings] = useState(null)
  const [fromReq, setFromReq] = useState(false)
  const [fullRows, setFullRows] = useState(null)
  const [showNoNameConfirm, setShowNoNameConfirm] = useState(false)

  const rowsMissingName = (rows) => {
    if (!rows) return []
    return rows.filter(r => {
      // Flux syndicat/locatif : lettres non nominatives, aucun nom attendu
      const segment = String(r.Segment || r.segment || '').toLowerCase()
      if (segment === 'syndicat de copropriété' || segment === 'locatif') return false
      if (String(r.Nom_Syndicat || '').trim()) return false
      const name = String(r.Nom_Gestionnaire || r.Contact || r.contact || '').trim()
      return !name
    })
  }

  const checkAgainstClients = useCallback(async (rows) => {
    setClientWarnings(null)
    try {
      const checkRes = await fetch(`${API}/clients/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, address_field: 'Adresse' }),
      })
      const check = await checkRes.json()
      if (check.checked && check.flagged > 0) {
        setClientWarnings(check)
        showToast(`⚠️ ${check.flagged} adresse(s) sont peut-être déjà des clients Guard-X`, 'error')
      }
    } catch { /* base clients indisponible — on continue */ }
  }, [showToast])

  // Check for rows passed from Croisement REQ via sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('letter_rows')
    if (stored) {
      try {
        const rows = JSON.parse(stored)
        if (rows && rows.length > 0) {
          const columns = Object.keys(rows[0])
          setPreview({ columns, rows, total_rows: rows.length })
          setFullRows(rows)
          setFromReq(true)
          sessionStorage.removeItem('letter_rows')
          showToast(`${rows.length} lignes chargées depuis Croisement REQ`, 'success')
          // Garde-fou : vérification contre la base clients aussi pour les données REQ
          checkAgainstClients(rows)
        }
      } catch { /* ignore */ }
    }
  }, [showToast, checkAgainstClients])

  const onDrop = useCallback(async (acceptedFiles) => {
    const f = acceptedFiles[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setResultUrl(null)

    const formData = new FormData()
    formData.append('file', f)
    try {
      const res = await fetch(`${API}/preview-excel`, { method: 'POST', body: formData })
      const data = await res.json()
      setPreview(data)
    } catch {
      showToast('Erreur lors du chargement du fichier', 'error')
      return
    }

    // Garde-fou : vérification automatique de TOUTES les lignes contre la base clients
    setClientWarnings(null)
    setFullRows(null)
    try {
      const fullData = new FormData()
      fullData.append('file', f)
      const fullRes = await fetch(`${API}/import-prospects`, { method: 'POST', body: fullData })
      const full = await fullRes.json()
      const rows = full.rows || []
      setFullRows(rows)
      await checkAgainstClients(rows)
    } catch { /* base clients indisponible — on continue */ }
  }, [checkAgainstClients])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
  })

  const handleGenerate = async () => {
    if (!file && !fromReq) {
      showToast('Veuillez d\'abord téléverser un fichier Excel', 'error')
      return
    }
    // Vérifier si mode postal (nominatif) et noms manquants
    if (mode === 'postal') {
      const rows = fullRows?.length ? fullRows : preview?.rows
      const missing = rowsMissingName(rows)
      if (missing.length > 0) {
        setShowNoNameConfirm(true)
        return
      }
    }
    doGenerate()
  }

  const doGenerate = async () => {
    setGenerating(true)
    setProgress(10)

    try {
      setProgress(40)
      let res
      if (fromReq && preview) {
        // Send rows directly as JSON (no file upload needed)
        res = await fetch(`${API}/generate-letters-json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: preview.rows,
            settings: { mode, rep_name: repName, rep_title: repTitle, phone, email },
          }),
        })
      } else {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('settings', JSON.stringify({ mode, rep_name: repName, rep_title: repTitle, phone, email }))
        res = await fetch(`${API}/generate-letters`, { method: 'POST', body: formData })
      }
      setProgress(80)
      if (!res.ok) throw new Error('Échec de génération')
      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition')
      let filename = 'lettres_guardx.zip'
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (match && match[1]) filename = match[1].replace(/['"]/g, '')
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setResultUrl(url)
      setProgress(100)
      showToast('Lettres générées — téléchargement démarré!')
    } catch {
      showToast('Erreur lors de la génération des lettres', 'error')
    } finally {
      setGenerating(false)
      setTimeout(() => setProgress(0), 2000)
    }
  }

  const handleSendToProspects = async () => {
    const rows = fullRows?.length ? fullRows : preview?.rows
    if (!rows?.length) {
      showToast('Veuillez d\'abord téléverser un fichier', 'error')
      return
    }
    try {
      const res = await fetch(`${API}/prospects/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: rows }),
      })
      const data = await res.json()
      showToast(`${data.added} prospects ajoutés au suivi (${data.total} total)`)
    } catch {
      showToast('Erreur lors de l\'envoi aux prospects', 'error')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Générateur de lettres</h1>
        <p className="text-gray-500 text-sm mt-1">Générez des lettres Word personnalisées pour vos prospects</p>
      </div>

      {/* Upload zone or REQ banner */}
      {fromReq ? (
        <div className="bg-navy/5 border-2 border-navy/20 rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-navy flex items-center justify-center">
            <Link2 className="text-white" size={24} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-navy">Données du Croisement REQ</p>
            <p className="text-sm text-gray-500">{preview?.total_rows || 0} lignes prêtes — nom du syndicat + adresse d'envoi REQ</p>
          </div>
          <button onClick={() => { setFromReq(false); setPreview(null) }} className="text-sm text-gray-400 hover:text-gray-600">
            Changer de source
          </button>
        </div>
      ) : (
        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-accent bg-accent/5' : 'border-gray-300 hover:border-navy'}`}>
          <input {...getInputProps()} />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet className="text-green-600" size={40} />
              <p className="font-medium text-gray-700">{file.name}</p>
              <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(0)} Ko — Cliquez pour changer</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="text-gray-400" size={40} />
              <p className="font-medium text-gray-600">Glissez votre fichier Excel ici</p>
              <p className="text-sm text-gray-400">ou cliquez pour parcourir (.xlsx, .xls)</p>
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
            <Table size={18} className="text-navy" />
            <h3 className="font-semibold text-navy">Aperçu des données</h3>
            <span className="text-sm text-gray-400 ml-auto">{preview.total_rows} lignes au total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  {preview.columns.map(col => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => {
                  const nameMissing = rowsMissingName([row]).length > 0
                  return (
                  <tr key={i} className="border-t border-gray-50">
                    {preview.columns.map(col => (
                      <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                        {String(row[col] ?? '')}
                        {(col === 'Nom_Gestionnaire' || col === 'Contact') && nameMissing && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 whitespace-nowrap">
                            <AlertTriangle size={10} />
                            Nom manquant
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Garde-fou base clients */}
      {clientWarnings && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-semibold text-amber-800 mb-2">⚠️ Clients existants détectés ({clientWarnings.flagged})</h3>
          <p className="text-sm text-amber-700 mb-3">Ces adresses correspondent à des clients dans la base Sage — vérifiez avant d'envoyer une lettre :</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {clientWarnings.results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-amber-900">{r.adresse}</span>
                <span className="text-amber-600">→ {r.client} ({r.score}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-navy mb-3">Mode d'envoi</h3>
        <div className="flex gap-4">
          <label className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${mode === 'postal' ? 'border-navy bg-navy/5' : 'border-gray-200'}`}>
            <input type="radio" checked={mode === 'postal'} onChange={() => setMode('postal')} className="accent-navy" />
            <div>
              <span className="font-medium text-gray-700">Mode postal</span>
              <p className="text-xs text-gray-400 mt-0.5">Inclut le bloc d'adresse du destinataire</p>
            </div>
          </label>
          <label className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${mode === 'dépôt' ? 'border-navy bg-navy/5' : 'border-gray-200'}`}>
            <input type="radio" checked={mode === 'dépôt'} onChange={() => setMode('dépôt')} className="accent-navy" />
            <div>
              <span className="font-medium text-gray-700">Mode dépôt</span>
              <p className="text-xs text-gray-400 mt-0.5">Sans adresse (pour dépôt en personne)</p>
            </div>
          </label>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-navy mb-3">Paramètres du représentant</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Nom du représentant</label>
            <input value={repName} onChange={e => setRepName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Titre / Fonction</label>
            <input value={repTitle} onChange={e => setRepTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Téléphone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Courriel</label>
            <input value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
        </div>
      </div>

      {/* Generate button + progress */}
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating || (!file && !fromReq)}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? <Loader2 className="animate-spin" size={20} /> : <Mail size={20} />}
            {generating ? 'Génération en cours...' : 'Générer les lettres'}
          </button>
          <button
            onClick={handleSendToProspects}
            disabled={!preview}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={20} />
            Envoyer aux prospects
          </button>
        </div>

        {progress > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div className="bg-accent h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}

        {resultUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="text-green-600" size={20} />
              <span className="font-medium text-green-800">Lettres générées — fichier ZIP prêt</span>
            </div>
            <a href={resultUrl} download="lettres_guardx.zip" className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              <Download size={16} />
              Télécharger le ZIP
            </a>
          </div>
        )}
      </div>

      {/* Dialogue de confirmation — nom manquant en mode nominatif */}
      {showNoNameConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertTriangle className="text-orange-600" size={20} />
              </div>
              <h3 className="font-semibold text-navy text-lg">Nom de décideur manquant</h3>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              {rowsMissingName(fullRows?.length ? fullRows : preview?.rows).length} ligne(s) sans nom de décideur en mode postal (nominatif). Les lettres seront adressées sans nom spécifique.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowNoNameConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={() => { setShowNoNameConfirm(false); doGenerate() }}
                className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-light text-sm font-medium"
              >
                Envoyer quand même sans nom
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

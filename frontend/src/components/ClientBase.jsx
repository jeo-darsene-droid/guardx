import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Database, ShieldCheck, Loader2, FileSpreadsheet } from 'lucide-react'

const API = '/api'

export default function ClientBase({ showToast }) {
  const [info, setInfo] = useState({ count: 0, last_import: null })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const loadInfo = useCallback(() => {
    fetch(`${API}/clients/info`)
      .then(r => r.json())
      .then(data => { setInfo(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadInfo() }, [loadInfo])

  const onDrop = useCallback(async (acceptedFiles) => {
    const f = acceptedFiles[0]
    if (!f) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', f)
    try {
      const res = await fetch(`${API}/clients/import`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Erreur lors de l\'import', 'error')
      } else {
        showToast(`Base clients mise à jour — ${data.count} clients`)
        loadInfo()
      }
    } catch {
      showToast('Erreur lors de l\'import de la base clients', 'error')
    } finally {
      setUploading(false)
    }
  }, [showToast, loadInfo])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  })

  const formatDate = (iso) => {
    if (!iso) return null
    return new Date(iso).toLocaleString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Base clients</h1>
        <p className="text-gray-500 text-sm mt-1">
          Importez votre export Sage. Chaque liste importée ailleurs dans l'app sera
          automatiquement vérifiée contre cette base pour éviter de prospecter des clients existants.
        </p>
      </div>

      {/* Status card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${info.count > 0 ? 'bg-green-600' : 'bg-gray-400'}`}>
          <Database className="text-white" size={24} />
        </div>
        <div className="flex-1">
          {loading ? (
            <p className="text-gray-400">Chargement...</p>
          ) : info.count > 0 ? (
            <>
              <p className="font-semibold text-navy">{info.count.toLocaleString('fr-CA')} clients dans la base</p>
              <p className="text-sm text-gray-400">Dernier import : {formatDate(info.last_import) || '—'}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-600">Base clients vide</p>
              <p className="text-sm text-gray-400">Le garde-fou anti-doublons est inactif tant qu'aucun export n'est importé.</p>
            </>
          )}
        </div>
        {info.count > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-green-50 text-green-700">
            <ShieldCheck size={14} />
            Garde-fou actif
          </span>
        )}
      </div>

      {/* Upload zone */}
      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-accent bg-accent/5' : 'border-gray-300 hover:border-navy'}`}>
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <>
              <Loader2 className="text-navy animate-spin" size={40} />
              <p className="font-medium text-gray-600">Import en cours...</p>
            </>
          ) : (
            <>
              <Upload className="text-gray-400" size={40} />
              <p className="font-medium text-gray-600">Glissez votre export Sage ici</p>
              <p className="text-sm text-gray-400">ou cliquez pour parcourir (.xlsx, .xls, .csv) — remplace la base actuelle</p>
            </>
          )}
        </div>
      </div>

      {/* Format hint */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet size={18} className="text-navy" />
          <h3 className="font-semibold text-navy">Colonnes reconnues</h3>
        </div>
        <p className="text-sm text-gray-500">
          Format Sage : <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">NAMECUST</code>{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">NAMECTAC</code>{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">TEXTPHON1</code>{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">TXDESC</code>{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">TXADDRESS1</code>
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Format générique : colonnes <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Nom</code> et{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Adresse</code>.
          Les adresses sont normalisées (Saint→St, Boulevard→Boul, accents) pour la correspondance floue.
        </p>
      </div>
    </div>
  )
}

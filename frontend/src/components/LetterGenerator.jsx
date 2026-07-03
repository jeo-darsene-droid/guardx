import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, Mail, Download, Loader2, Table, Send } from 'lucide-react'

const API = '/api'

export default function LetterGenerator({ config, showToast }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [mode, setMode] = useState(config?.default_mode || 'postal')
  const [repName, setRepName] = useState(config?.rep_name || 'Jéo-Darsène Saint-Louis')
  const [phone, setPhone] = useState(config?.phone || '438-406-5077')
  const [email, setEmail] = useState(config?.email || 'jdsaintlouis@guard-x.com')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [resultUrl, setResultUrl] = useState(null)

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
    }
  }, [showToast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
  })

  const handleGenerate = async () => {
    if (!file) {
      showToast('Veuillez d\'abord téléverser un fichier Excel', 'error')
      return
    }
    setGenerating(true)
    setProgress(10)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('settings', JSON.stringify({ mode, rep_name: repName, phone, email }))

    try {
      setProgress(40)
      const res = await fetch(`${API}/generate-letters`, { method: 'POST', body: formData })
      setProgress(80)
      if (!res.ok) throw new Error('Échec de génération')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setResultUrl(url)
      setProgress(100)
      showToast('Lettres générées avec succès!')
    } catch {
      showToast('Erreur lors de la génération des lettres', 'error')
    } finally {
      setGenerating(false)
      setTimeout(() => setProgress(0), 2000)
    }
  }

  const handleSendToProspects = async () => {
    if (!preview?.rows?.length) {
      showToast('Veuillez d\'abord téléverser un fichier', 'error')
      return
    }
    try {
      const res = await fetch(`${API}/prospects/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: preview.rows }),
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

      {/* Upload zone */}
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
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    {preview.columns.map(col => (
                      <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate">{String(row[col] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
            disabled={generating || !file}
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
    </div>
  )
}

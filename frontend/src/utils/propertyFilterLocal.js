// Filtrage d'évaluation foncière côté navigateur (fichiers trop gros pour l'upload serverless).
// Réplique la logique de backend/routes/properties.py : filtres, mapping arrondissements,
// construction des lignes, regroupement condos par adresse.
import Papa from 'papaparse'

const ARROND_MAP = {
  rem05: 'côte-des-neiges—notre-dame-de-grâce',
  rem06: 'côte-des-neiges—notre-dame-de-grâce',
  rem09: 'ahuntsic-cartierville',
  rem12: 'le plateau-mont-royal',
  rem13: 'le sud-ouest',
  rem14: 'le sud-ouest',
  rem15: 'ville-marie',
  rem16: 'ville-marie',
  rem17: 'mercier—hochelaga-maisonneuve',
  rem19: 'mercier—hochelaga-maisonneuve',
  rem20: 'rosemont—la petite-patrie',
  rem21: 'outremont',
  rem22: 'villeray—saint-michel—parc-extension',
  rem23: 'villeray—saint-michel—parc-extension',
  rem24: 'villeray—saint-michel—parc-extension',
  rem25: 'ahunsic-cartierville',
  rem27: 'saint-laurent',
  rem31: 'saint-leonard',
  rem32: 'montréal-nord',
  rem33: 'anjou',
  rem34: 'rivière-des-prairies—pointe-aux-trembles',
  rem99: 'autre',
}

const SUFFIX_MAP = {
  '(anj)': 'anjou', '(mtl)': 'montréal', '(mtln)': 'montréal-nord',
  '(pat)': 'pointe-aux-trembles', '(rdp)': 'rivière-des-prairies',
  '(slo)': 'saint-laurent', '(sle)': 'saint-léonard',
  '(cdn)': 'côte-des-neiges', '(ndg)': 'notre-dame-de-grâce',
  '(out)': 'outremont', '(vma)': 'ville-marie', '(plt)': 'plateau',
  '(rpr)': 'rosemont', '(mhm)': 'mercier', '(hma)': 'hochelaga-maisonneuve',
  '(vsp)': 'villeray', '(smp)': 'saint-michel', '(pex)': 'parc-extension',
  '(swt)': 'sud-ouest', '(ahs)': 'ahuntsic', '(car)': 'cartierville',
  '(ppp)': 'petite-patrie',
}

function findCol(columns, candidates) {
  const lowerMap = {}
  for (const c of columns) lowerMap[c.toLowerCase()] = c
  for (const c of candidates) {
    if (lowerMap[c.toLowerCase()]) return lowerMap[c.toLowerCase()]
  }
  return null
}

function cleanCivic(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s === '0' || s === '0.0') return ''
  const n = parseFloat(s)
  if (!Number.isNaN(n)) return String(Math.trunc(n))
  return s
}

export function filterPropertiesLocally(file, options, onProgress) {
  const {
    minUnits, maxUnits, searchTerm = '', yearMin = '', yearMax = '',
    condoOnly = true, utilFilter = '',
  } = options

  return new Promise((resolve, reject) => {
    let cols = null
    const rawRows = []
    let totalScanned = 0
    const term = searchTerm.trim().toLowerCase()
    const utilTerms = utilFilter.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    const yMin = yearMin ? parseInt(yearMin, 10) : null
    const yMax = yearMax ? parseInt(yearMax, 10) : null
    const fileSize = file.size || 1

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      chunkSize: 1024 * 1024 * 4,
      chunk: ({ data, meta }, parser) => {
        if (!cols) {
          const columns = meta.fields || []
          cols = {
            units: findCol(columns, ['NOMBRE_LOGEMENT', 'NB_LOGEMENT', 'NOMBRE_LOGEMENTS']),
            rue: findCol(columns, ['NOM_RUE', 'RUE', 'NOM_VOIE']),
            muni: findCol(columns, ['MUNICIPALITE', 'ARRONDISSEMENT', 'VILLE']),
            cat: findCol(columns, ['CATEGORIE_UEF', 'CATEGORIE']),
            util: findCol(columns, ['CODE_UTILISATION', 'CUBF']),
            year: findCol(columns, ['ANNEE_CONSTRUCTION', 'YEAR_BUILT', 'ANNEE']),
            addr: findCol(columns, ['ADRESSE', 'CIVIC', 'NUMERO_CIVIQUE']),
            civic: findCol(columns, ['CIVIQUE_DEBUT', 'NO_CIVIQUE', 'NUMERO_CIVIQUE', 'NO_CIVIC', 'CIVIC_NUMBER', 'CIVIQUE']),
            civicFin: findCol(columns, ['CIVIQUE_FIN']),
            arrond: findCol(columns, ['NO_ARROND_ILE_CUM', 'ARRONDISSEMENT_CODE', 'CODE_ARROND']),
          }
        }

        totalScanned += data.length
        if (onProgress && meta.cursor) {
          onProgress(Math.min(95, Math.round((meta.cursor / fileSize) * 90)))
        }

        for (const row of data) {
          // Filtre unités : relâché en mode condo (regroupement après), strict sinon
          const unitsRaw = cols.units ? parseFloat(row[cols.units]) : NaN
          if (!condoOnly) {
            if (Number.isNaN(unitsRaw) || unitsRaw < minUnits || unitsRaw > maxUnits) continue
          } else if (Number.isNaN(unitsRaw) || unitsRaw < 1) continue

          // Filtre terme de recherche (rue, municipalité, arrondissement)
          if (term) {
            let match = false
            const rueVal = cols.rue ? String(row[cols.rue] || '').toLowerCase() : ''
            const muniVal = cols.muni ? String(row[cols.muni] || '').toLowerCase() : ''
            const arrondVal = cols.arrond ? String(row[cols.arrond] || '').toLowerCase() : ''
            if (rueVal.includes(term) || muniVal.includes(term) || arrondVal.includes(term)) match = true
            if (!match && arrondVal) {
              for (const [code, name] of Object.entries(ARROND_MAP)) {
                if (name.includes(term) && arrondVal.includes(code)) { match = true; break }
              }
            }
            if (!match && rueVal) {
              for (const [suffix, name] of Object.entries(SUFFIX_MAP)) {
                if (name.includes(term) && rueVal.includes(suffix)) { match = true; break }
              }
            }
            if (!match) continue
          }

          // Filtre condominium
          if (condoOnly && cols.cat) {
            if (!String(row[cols.cat] || '').toLowerCase().includes('condominium')) continue
          }

          // Filtre code d'utilisation
          if (utilTerms.length && cols.util) {
            const utilVal = String(row[cols.util] || '').toLowerCase()
            if (!utilTerms.some(ut => utilVal.includes(ut))) continue
          }

          // Filtre année
          if (cols.year && (yMin !== null || yMax !== null)) {
            const yr = parseFloat(row[cols.year])
            if (yMin !== null && (Number.isNaN(yr) || yr < yMin)) continue
            if (yMax !== null && (Number.isNaN(yr) || yr > yMax)) continue
          }

          // Construction de la ligne (même format que le backend)
          let civic = cols.civic ? cleanCivic(row[cols.civic]) : ''
          if (civic && cols.civicFin && cols.civicFin !== cols.civic) {
            const civicFin = cleanCivic(row[cols.civicFin])
            if (civicFin && civicFin !== civic) civic = `${civic}-${civicFin}`
          }

          const addrParts = []
          if (civic) addrParts.push(civic)
          if (cols.addr && cols.addr !== cols.civic) {
            const av = String(row[cols.addr] || '').trim()
            if (av && av !== '0') addrParts.push(av)
          }
          let secteurName = ''
          if (cols.rue) {
            let rv = String(row[cols.rue] || '').trim()
            const m = rv.match(/\(([A-Z]{2,5})\)\s*$/)
            if (m) {
              secteurName = SUFFIX_MAP[m[0].toLowerCase()] || ''
            }
            rv = rv.replace(/\s*\([A-Z]{2,5}\)\s*$/, '').trim()
            if (rv && rv !== '0') addrParts.push(rv)
          }
          const address = addrParts.filter(Boolean).join(' ')

          if (cols.arrond) {
            const arrondVal = String(row[cols.arrond] || '').trim().toLowerCase()
            secteurName = ARROND_MAP[arrondVal] || secteurName
          }
          const muni = cols.muni ? String(row[cols.muni] || '') : ''
          const nb = Number.isNaN(unitsRaw) ? 0 : Math.trunc(unitsRaw)
          const utilVal = cols.util ? String(row[cols.util] || '').trim() : ''

          rawRows.push({
            Nom_Gestionnaire: '',
            Nom_Syndicat: '',
            Civic: civic,
            Adresse: address,
            Ville_CodePostal: secteurName || muni,
            Nb_Unites: nb,
            Secteur: secteurName || muni,
            Code_Utilisation: utilVal,
            Notes: '',
          })
        }
      },
      complete: () => {
        let results = rawRows
        // Regroupement condos par adresse + somme des unités, puis filtre unités
        if (condoOnly && results.length) {
          const grouped = {}
          for (const r of results) {
            const key = r.Adresse
            if (!key) continue
            if (!grouped[key]) grouped[key] = { ...r, Nb_Unites: 0 }
            grouped[key].Nb_Unites += r.Nb_Unites || 1
          }
          results = Object.values(grouped).filter(r => r.Nb_Unites >= minUnits && r.Nb_Unites <= maxUnits)
        }
        resolve({
          count: results.length,
          rows: results.slice(0, 500),
          all_rows: results,
          total_scanned: totalScanned,
        })
      },
      error: (err) => reject(err),
    })
  })
}

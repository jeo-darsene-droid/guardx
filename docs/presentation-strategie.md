# Guard-X — Document explicatif pour présentation stratégique

## Contexte de l'entreprise

**Guard-X Protection Incendie** est une entreprise spécialisée en protection incendie (inspection, entretien, conformité des systèmes d'extinction et d'alarme). Le représentant commercial est **Jéo-Darsène Saint-Louis**, Gestionnaire de comptes clients (jdsaintlouis@guard-x.com, 438-406-5077).

Le secteur ciblé est **Anjou**, un arrondissement industriel et commercial de Montréal (codes postaux H1J et H1K), qui contient environ **1500 entreprises** à prospecter.

---

## Problématique avant Guard-X Dashboard

La prospection était manuelle et dispersée :
- Listes d'entreprises dans des Excel disparates
- Lettres de prospection rédigées manuellement une par une
- Aucun suivi structuré des relances (visite, appel, 2e lettre)
- Pas de visibilité sur la couverture territoriale
- Risque de contacter des clients existants (doublons)
- Aucune donnée pour mesurer le taux de retour ou la cadence

---

## Solution : Guard-X Dashboard

Une application web interne (React + FastAPI + Supabase) qui automatise et structure l'ensemble du cycle de prospection, de l'identification des cibles au suivi terrain. L'application a été développée par phases successives (A à G).

---

## Architecture technique

| Couche | Technologie | Rôle |
|--------|-------------|------|
| Frontend | React + Vite + TailwindCSS | Interface utilisateur (desktop + mobile) |
| Backend | Python FastAPI | API REST, logique métier, génération PDF |
| Base de données | Supabase (PostgreSQL) | Persistance des prospects, clients, activité |
| Matching flou | RapidFuzz + normalisation d'adresses | Déduplication et recherche tolérante aux fautes |
| Génération PDF | python-docx | Lettres de prospection personnalisées |
| Données externes | Registre des entreprises du Québec (REQ) | Source officielle d'entreprises |

---

## Les 9 modules de l'application

### 1. Dashboard (Tableau de bord) — `/`
**Rôle** : Vue d'ensemble quotidienne de l'activité de prospection.

- **KPIs en temps réel** : lettres envoyées aujourd'hui, prospects dans le pipeline, doublons retirés, propriétés ciblées
- **Journal rapide** : 5 boutons pour enregistrer une action en 1 clic (Appel, Visite terrain, Courriel, Soumission envoyée, Vente signée) — chaque action alimente automatiquement le rapport mensuel
- **Panneau « Aujourd'hui »** : suivis dus aujourd'hui et en retard, fusion de deux flux :
  - **Pipeline actif** (prospects existants avec prochaine action ≤ aujourd'hui) — affichés EN PREMIER
  - **Actions machine Anjou** (visites J+8, appels J+3, 2e lettres J+21) — dérivées automatiquement des notes
- **Carte Cadence Anjou** (voir section 8 ci-dessous)
- **Génération de rapport mensuel** : export PDF du rapport d'activité pour un mois donné

### 2. Générateur de lettres — `/lettres`
**Rôle** : Générer des lettres de prospection PDF personnalisées en lot.

- Import d'un fichier Excel de prospects
- Deux modes de lettre :
  - **Mode postal** : format fenêtre (adresse dans la zone transparente de l'enveloppe), mise en page avec framePr pour positionnement précis
  - **Mode dépôt** : format lettre classique (remise en main propre)
- Personnalisation automatique : nom du gestionnaire, adresse, entreprise, date
- Vérification automatique contre la base clients (alerte si l'adresse correspond à un client existant)
- Avertissement si noms de décideurs manquants (segment industriel/commercial)
- Génération en lot avec barre de progression
- Lettre type : « Concernant la protection incendie de votre immeuble » — offre d'inspection et de conformité

### 3. Vérificateur de doublons — `/doublons`
**Rôle** : Éviter de contacter des entreprises qui sont déjà clientes.

- Import de deux fichiers Excel (prospects + clients)
- Comparaison par adresse avec matching flou (algorithme RapidFuzz, seuil configurable 85%)
- Trois catégories de résultats :
  - **Propres** : aucune correspondance avec un client existant
  - **Doublons** : correspondance forte (≥ seuil) — à retirer de la prospection
  - **Incertains** : correspondance partielle — à valider manuellement
- Export Excel des résultats

### 4. Ciblage copropriétés — `/coproprietes`
**Rôle** : Filtrer les propriétés résidentielles (copropriétés) selon des critères pour identifier les syndics à contacter.

- Import d'un fichier CSV d'évaluation foncière (ville de Montréal)
- Filtres : nombre d'unités (min/max), année de construction, type (condo uniquement), utilisation, terme de recherche
- Export des résultats filtrés vers Excel
- Envoi direct vers le générateur de lettres ou vers les prospects

### 5. Croisement REQ — `/croisement-req`
**Rôle** : Importer et croiser les données du Registre des entreprises du Québec (REQ) avec les prospects existants.

Deux flux d'import :
- **Import REQ classique** : import du ZIP officiel de Données Québec, extraction des syndicats de copropriété (filtrage par nom : "Syndicat" + "Copropriété/Condominium"), jointure de 3 fichiers CSV (Entreprise, Nom, Établissement), normalisation d'adresses, insertion dans Supabase
- **Import REQ par code postal** (Phase E) : filtrage par codes postaux H1J/H1K (Anjou), assignation automatique de zone et rue, déduplication floue contre prospects ET clients existants, prévisualisation groupée par rue avec cases à cocher, import de la sélection

### 6. Mes prospects — `/prospects`
**Rôle** : Gestion complète du pipeline de prospection.

- **Tableau interactif** avec filtres : statut, secteur, contacté/non-contacté, dates, recherche texte
- **Vue par rue** : groupement par zone → rue, avec statistiques (lettres envoyées, visites, à repasser, retours, ventes, complétées)
- **13 statuts de prospection** :
  - À contacter / À appeler
  - Message laissé
  - Contacté – intéressé
  - Contacté – à rappeler
  - Rencontre prévue
  - Courriel envoyé
  - En attente (rapport/réponse)
  - Soumission envoyée
  - Soumission révisée
  - En fermeture
  - Vendu / Signé
  - Récupéré (signé)
  - À repasser
  - Perdu (revisiter année suivante)
  - Hors d'affaires
- **Édition inline** : statut, prochaine action (date), segment, contacté (checkbox)
- **3 actions rapides par prospect** (Phase C) :
  - **Visite — Absent** : statut → "À repasser", prochaine action = J+3, note "Visite absent" ajoutée
  - **Visite — Rencontre** : statut → "Contacté – à rappeler", ajout de notes
  - **Retour entrant** : statut → "Contacté – à rappeler", prochaine action = J+1, note "Retour entrant" ajoutée
  - Chaque action log dans le journal d'activité
- **Badge "Nom de décideur manquant"** : alerte orange pour les prospects industriels/commerciaux sans nom de gestionnaire
- **Import de noms de décideurs en lot** (Phase G-bonus) : import Excel avec colonnes Entreprise + Nom_Gestionnaire, fuzzy match contre prospects existants, mise à jour du champ contact (n'écrase pas un nom déjà présent)
- **Couverture Anjou** : barre de progression X / 1500 entreprises traitées
- **Export Excel** complet

### 7. Mode terrain — `/terrain` (Phase G)
**Rôle** : Interface mobile-first pour le représentant sur le terrain, au comptoir des entreprises.

- **Barre de recherche persistante** (épinglée en haut) : recherche par nom OU adresse
  - Phase 1 : recherche server-side Supabase `ilike` (sous-chaîne)
  - Phase 2 : fuzzy matching RapidFuzz si <10 résultats (tolérant aux fautes de frappe)
- **Fiche prospect** complète : nom, contact, adresse, téléphone (cliquable tel:), zone, rue, statut, notes
- **Pitch comptoir** (collapsible) : script de vente prêt à lire
  > « Bonjour, je viens voir {Nom_Gestionnaire} — Jéo de Guard-X, je lui ai envoyé une lettre la semaine passée concernant la protection incendie. »
- **3 gros boutons thumb-friendly** (réutilisent les actions rapides de la Phase C) :
  - Visite — Absent (ambre)
  - Visite — Rencontre (vert)
  - Retour entrant (accent)
- Optimisé pour usage mobile au comptoir

### 8. Cadence Anjou (Phase F) — intégrée au Dashboard
**Rôle** : Mesurer et piloter la cadence de prospection sur le territoire Anjou.

5 métriques avec objectifs et barres de progression :

| Métrique | Objectif | Source de données |
|----------|----------|-------------------|
| Lettres cette semaine | 40 / semaine | activity_log → `letters_generated` (depuis lundi) |
| Nouvelles entreprises qualifiées aujourd'hui | 8 / jour | activity_log → `req_postal_import` (aujourd'hui) |
| Nouvelles entreprises ce mois | 160 / mois | activity_log → `req_postal_import` (depuis le 1er) |
| Taux de retour | % (retours entrants ÷ lettres envoyées) | activity_log → `retour_entrant` / `letters_generated` |
| Couverture Anjou totale | 1500 entreprises | prospects avec lettre envoyée + visite/relance complétée |

La carte affiche un fond dégradé navy avec 4 colonnes de progress bars et une barre de couverture en bas.

### 9. Base clients — `/base-clients`
**Rôle** : Consulter et gérer la base de clients existants (pour éviter les doublons de prospection).

### 10. Paramètres — `/parametres`
**Rôle** : Configuration de l'application (nom du représentant, titre, téléphone, courriel, mode de lettre par défaut, logo).

---

## Stratégie de prospection « Cadence Anjou »

### Territoire
Anjou (H1J, H1K) — ~1500 entreprises industrielles, commerciales et résidentielles.

### Zones de prospection
Le territoire est divisé en 4 zones basées sur les rues :

| Zone | Caractéristique | Rues principales |
|------|-----------------|------------------|
| ZONE 1 — Cœur industriel | Industries lourdes, manufacturier | Jarry Est, Bombardier, Ray-Lawson, Ampère, Edison, Galilée, Newton, Colbert |
| ZONE 2 — Commercial / corporatif | Bureaux, commerce, services | Métropolitain Est, Louis-H-La Fontaine, Galeries d'Anjou, Jean-Talon Est |
| ZONE 3 — Logistique / manufacturier Est | Entrepôts, distribution | Henri-Bourassa Est, Langelier, de la Seine, de l'Yser, de la Marne |
| ZONE 4 — Résidentiel condos | Copropriétés, résidentiel | Chaumont, Joseph-Renaud, Wilfrid-Pelletier, de l'Anjou, des Ormeaux, Goncourt, Grosbois, Grenoble |

### Cycle de prospection (workflow)

```
1. Identification     →  Import REQ par code postal (H1J/H1K)
                          ↓ Filtrage, déduplication, assignation zone/rue
2. Qualification      →  Sélection par rue, import dans prospects
                          ↓ Badge "décideur manquant" → import Excel noms
3. Lettre             →  Générateur de lettres PDF (mode postal)
                          → 40 lettres / semaine (objectif cadence)
4. Attente retour     →  8 jours (fenêtre de réponse)
                          ↓
5. Visite J+8         →  Visite terrain — suivi lettre (action machine)
                          ├─ Si absent → Appel J+3 (action machine)
                          ├─ Si rencontré → Action rapide "Visite — Rencontre"
                          └─ Si aucun retour après 21 jours → 2e lettre (action machine)
6. Suivi pipeline     →  Statut, prochaine action, notes
                          → Panneau "Aujourd'hui" fusionne pipeline + actions machine
7. Conversion         →  Soumission → Négociation → Vente signée
                          → Log "Vente signée" dans le journal
```

### Actions automatisées (« machine »)
Le système génère automatiquement des tâches basées sur les notes du prospect :

| Action | Déclencheur (dans notes) | Délai |
|--------|--------------------------|-------|
| Visite J+8 | "Visite terrain — suivi lettre" | 8 jours après lettre |
| Appel J+3 | "Visite absent" | 3 jours après visite manquée |
| 2e lettre J+21 | "2e lettre si aucun retour" | 21 jours après 1re lettre |

Ces actions apparaissent dans le panneau « Aujourd'hui » du Dashboard, après les suivis pipeline actifs.

### Outils terrain
Le **Mode terrain** (mobile) permet au représentant de :
- Rechercher un prospect en <3s au comptoir
- Lire le pitch comptoir (script prêt)
- Enregistrer le résultat de la visite en 1 tap (absent, rencontre, retour entrant)
- Tout est synchronisé en temps réel vers Supabase

---

## Données réelles actuelles (juillet 2025)

| Indicateur | Valeur |
|------------|--------|
| Lettres envoyées (total) | ~1996 |
| Retours entrants | 6 |
| Taux de retour | 0.3% |
| Objectif couverture Anjou | 1500 entreprises |

> Note : Le taux de retour de 0.3% est bas — la stratégie de cadence vise à l'augmenter via les visites J+8 systématiques et les 2e lettres J+21.

---

## Métriques de performance (cadence)

| Métrique | Objectif quotidien/hebdo/mensuel |
|----------|----------------------------------|
| Lettres par semaine | 40 |
| Nouvelles entreprises qualifiées par jour | 8 |
| Nouvelles entreprises qualifiées par mois | 160 |
| Couverture Anjou totale | 1500 |

---

## Avantages stratégiques pour la direction

1. **Visibilité totale** : le Dashboard donne une vue en temps réel de la cadence, du pipeline et de la couverture territoriale — plus besoin de rapports manuels.

2. **Aucun doublon** : le système vérifie automatiquement chaque prospect contre la base clients (fuzzy matching 85%) avant d'envoyer une lettre.

3. **Productivité terrain** : le Mode terrain mobile permet d'enregistrer une visite en 1 tap, sans papier ni retard — le pitch comptoir est intégré.

4. **Prospection ciblée et structurée** : les 4 zones d'Anjou sont cartographiées par rue, avec un suivi de progression par rue (lettres, visites, ventes).

5. **Données officielles REQ** : import direct du Registre des entreprises du Québec filtré par code postal — source gouvernementale gratuite et à jour.

6. **Cycle de relance automatisé** : les visites J+8, appels J+3 et 2e lettres J+21 sont générés automatiquement — aucun prospect ne tombe dans l'oubli.

7. **Rapport mensuel automatisé** : toutes les actions sont loggées et le rapport mensuel est généré en 1 clic.

8. **Coût minimal** : l'infrastructure utilise Supabase (gratuit jusqu'à 500MB) et des technologies open source — aucun coût de licence.

---

## Résumé pour la présentation

**Guard-X Dashboard** transforme la prospection commerciale d'un processus manuel et non mesurable en un système structuré, automatisé et transparent. La stratégie « Cadence Anjou » cible 1500 entreprises sur le territoire d'Anjou avec un rythme de 40 lettres/semaine, des relances automatisées (J+8, J+3, J+21) et un suivi terrain mobile. Le tout est piloté depuis un tableau de bord unique qui montre en temps réel la progression vers les objectifs.

---

## Informations sur le représentant

- **Nom** : Jéo-Darsène Saint-Louis
- **Titre** : Gestionnaire de comptes clients
- **Entreprise** : Guard-X Protection Incendie
- **Téléphone** : 438-406-5077
- **Courriel** : jdsaintlouis@guard-x.com
- **Territoire** : Anjou (H1J, H1K), Montréal

---

## Instructions pour Claude AI

Crée une présentation professionnelle en français pour une réunion avec la direction. La présentation doit :

1. **Introduction** : contexte de l'entreprise Guard-X et de la problématique de prospection
2. **Solution** : présentation du Guard-X Dashboard et de ses 9 modules
3. **Stratégie Cadence Anjou** : territoire, zones, cycle de prospection, objectifs
4. **Automatisation** : actions machine (J+8, J+3, J+21), mode terrain mobile
5. **Résultats et métriques** : données actuelles, objectifs, taux de retour
6. **Avantages** : productivité, visibilité, coût minimal, données REQ
7. **Conclusion** : demande de soutien/ressources pour la suite

Ton de présentation : professionnel, concret, orienté résultats. Mettre en évidence les chiffres clés et les objectifs mesurables.

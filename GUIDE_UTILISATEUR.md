# GUIDE UTILISATEUR — Guard-X Dashboard

> Comment utiliser l'application au quotidien pour prospecter, relancer et rapporter.
> Pour l'installation et le démarrage, voir le [`README.md`](README.md).

---

## Sommaire

1. [La routine du matin](#1-la-routine-du-matin)
2. [Dashboard](#2-dashboard)
3. [Mes prospects — le cœur de l'app](#3-mes-prospects--le-cœur-de-lapp)
4. [Base clients — le garde-fou](#4-base-clients--le-garde-fou)
5. [Générateur de lettres](#5-générateur-de-lettres)
6. [Ciblage copropriétés](#6-ciblage-copropriétés)
7. [Vérificateur de doublons](#7-vérificateur-de-doublons)
8. [Rapport mensuel pour Mel](#8-rapport-mensuel-pour-mel)
9. [Paramètres](#9-paramètres)
10. [Flux de travail complets](#10-flux-de-travail-complets)
11. [Questions fréquentes](#11-questions-fréquentes)

---

## 1. La routine du matin

Ouvrez l'app → le **Dashboard** s'affiche. Le panneau **« Aujourd'hui »** en haut montre :

- 🔴 **En retard** (rouge) : les suivis dont la date de prochaine action est dépassée — à traiter en premier
- 🔵 **Aujourd'hui** (bleu) : les suivis dus ce jour

Chaque ligne affiche l'entreprise, le statut et le **numéro de téléphone** (prêt à composer).
Cliquez sur une ligne pour ouvrir « Mes prospects ».

> 💡 Meilleures fenêtres d'appel : **mardi–jeudi, 10 h – 11 h 30 et 13 h 30 – 15 h 30.**

Pour que ce panneau fonctionne, il faut **remplir la colonne « Prochaine action »**
dans Mes prospects après chaque appel/visite/courriel. Pas de date = pas de rappel.

---

## 2. Dashboard

| Zone | À quoi ça sert |
|---|---|
| **Aujourd'hui** | Vos suivis dus et en retard (voir §1) |
| **Journal rapide** | Un clic = une action enregistrée : Appel, Visite terrain, Courriel, Soumission envoyée, Vente signée. **Ces clics alimentent le rapport de Mel** — prenez l'habitude de cliquer après chaque action |
| **Cartes KPI** | Lettres du jour, prospects au pipeline, doublons détectés, propriétés ciblées |
| **Activité récente** | Les 5 dernières actions enregistrées |
| **Actions rapides** | Raccourcis vers les lettres, doublons, ciblage |
| **Rapport mensuel (Mel)** | Choisir mois + année → « Générer » télécharge l'Excel (voir §8) |

---

## 3. Mes prospects — le cœur de l'app

Votre pipeline complet. Tout est **sauvegardé automatiquement** à chaque modification
(pas de bouton « Enregistrer »).

### Les colonnes clés

- **Segment** : type de prospect — Syndicat de copropriété, Restaurant / Bar, Hôtel,
  Industriel / Commercial, Multi-sites, Partenariat, Ancien client (win-back), Autre
- **Statut** : les 15 statuts du cycle de vente, avec pastilles colorées :

| Statut | Quand l'utiliser |
|---|---|
| 🔵 À contacter / À appeler | Nouveau prospect, aucune action encore |
| 🟣 Message laissé | Boîte vocale ou message auprès d'un tiers |
| 🟢 Contacté – intéressé | Contact établi, intérêt manifesté |
| 📞 Contacté – à rappeler | « Rappelez-moi à telle date » → mettre la date en Prochaine action |
| 📅 Rencontre prévue | Rendez-vous fixé |
| 🟡 Courriel envoyé | Courriel de suivi ou de présentation parti |
| 🟠 En attente (rapport/réponse) | On attend le dernier rapport d'inspection ou une réponse |
| 📄 Soumission envoyée | Soumission Sage envoyée → **relance 24–72 h après** |
| 📝 Soumission révisée | Prix ou contenu ajusté après négociation |
| 🤝 En fermeture | Signature imminente, ouverture de compte en cours |
| ✅ Vendu / Signé | Contrat signé 🎉 |
| ♻️ Récupéré (signé) | Ancien client win-back re-signé |
| ❌ Perdu (revisiter année suivante) | Refus — mettre une Prochaine action l'an prochain |
| ⚫ Hors d'affaires | Fermé, démoli, inexistant |
| 🔁 À repasser | Porte fermée au terrain — repasser |

- **Prochaine action** : LA colonne la plus importante. Date du prochain geste.
  Devient **rouge** quand elle est dépassée et remonte dans « Aujourd'hui ».
- **Contacté** : case à cocher + date du dernier contact.

### Importer / exporter

- **Importer** : fichier Excel au format prospects (voir README) ou export du Ciblage
  copropriétés. À l'import, chaque adresse est **automatiquement comparée à la Base
  clients** — un avertissement s'affiche si des clients existants sont détectés.
- **Exporter** : télécharge tout le pipeline en `mes_prospects.xlsx`.

### Filtres

Recherche libre (nom, rue, ville, notes), secteur, statut, contacté/non, plage de dates.

---

## 4. Base clients — le garde-fou

**But :** ne jamais envoyer une lettre de prospection à un client Guard-X existant.

### Mise en place (à refaire à chaque mise à jour de Sage)

1. Exportez la liste clients depuis Sage (colonnes `NAMECUST`, `NAMECTAC`,
   `TEXTPHON1`, `TXDESC`, `TXADDRESS1` — reconnues automatiquement).
2. Page **🛡️ Base clients** → glissez le fichier dans la zone.
3. La carte affiche le nombre de clients + la date du dernier import + badge « Garde-fou actif ».

### Ce qui se passe ensuite (automatique)

- **Générateur de lettres** : dès qu'un fichier est téléversé, toutes les adresses sont
  vérifiées. Bandeau orange avec la liste des correspondances (adresse → client, score %).
- **Mes prospects** : à chaque import, avertissement si des adresses matchent.

La comparaison utilise la **correspondance floue** : « 123 Saint-Denis » matche
« 123 St-Denis », « boulevard » matche « boul », les accents sont ignorés — exactement
là où la recherche de Proxy échoue.

> ⚠️ Base clients vide = garde-fou inactif. L'app vous le dit, elle ne fait pas semblant.

---

## 5. Générateur de lettres

Transforme un Excel de prospects en **ZIP de lettres Word personnalisées**.

### Étapes

1. Préparez l'Excel : `Nom_Gestionnaire | Nom_Syndicat | Adresse | Ville_CodePostal | Nb_Unites | Secteur | Notes`
   (le Ciblage copropriétés produit ce format directement).
2. Glissez le fichier → aperçu des 5 premières lignes + vérification anti-clients automatique.
3. Choisissez le **mode** :
   - **Postal** : bloc d'adresse du destinataire positionné pour enveloppe à fenêtre
   - **Dépôt** : sans bloc d'adresse, pour remise en main propre
4. Vérifiez nom / téléphone / courriel du représentant (pré-remplis depuis Paramètres).
5. **Générer les lettres** → téléchargez le ZIP → imprimez.

### Bon à savoir

- `Nom_Gestionnaire` vide → la lettre s'adresse « **Au président du syndicat de copropriété** ».
  C'est voulu : les noms d'administrateurs ne sont pas dans les données ouvertes
  (voir §6) — ne perdez pas de temps à les chercher pour une première lettre.
- **« Envoyer aux prospects »** ajoute les lignes du fichier au pipeline Mes prospects
  (sans créer de doublons internes).
- Après une tournée de dépôt, mettez la **Prochaine action à +3 semaines** sur chaque
  prospect : c'est le délai typique de rappel d'un président de syndicat.

---

## 6. Ciblage copropriétés

Trouve les immeubles à cibler dans le **rôle d'évaluation foncière de Montréal**.

### Étapes

1. Téléchargez le CSV : https://donnees.montreal.ca/dataset/unites-evaluation-fonciere
2. Glissez-le dans la page (gros fichier — soyez patient).
3. Filtres :
   - **Nombre d'unités** : votre cible habituelle est **8 à 24**
   - **Secteur / rue** : nom de rue, arrondissement (« Anjou », « Rosemont »…) ou code
   - **Année de construction** : optionnel
4. Résultats → **Exporter Excel** (format lettres prêt à l'emploi) ou
   **Envoyer aux prospects** (ajout direct au pipeline).

### ⚠️ Limite légale importante

Les **noms des propriétaires et administrateurs ne sont PAS dans les données ouvertes**
(anonymisées). Pour un prospect prioritaire, cherchez le nom manuellement sur le site
du REQ ou Evalweb — au cas par cas. L'app ne récoltera jamais ces noms automatiquement,
et la lettre a un repli propre (« Au président du syndicat »).

---

## 7. Vérificateur de doublons

Comparaison manuelle et détaillée entre **deux fichiers** (en plus du garde-fou
automatique de la Base clients).

1. Téléversez le fichier **prospects** et le fichier **clients**.
2. Ajustez le **seuil** (85 % par défaut — plus bas = plus de correspondances signalées).
3. Résultats en 3 onglets :
   - ✅ **Liste nette** : prospects sans correspondance — sûrs à prospecter
   - ⚠️ **Doublons trouvés** : score ≥ seuil — probablement déjà clients
   - ❓ **Incertains** : score 50–85 % — à vérifier manuellement dans Proxy/Sage
4. Chaque onglet s'exporte en Excel. Utilisez la **Liste nette** pour vos lettres.

---

## 8. Rapport mensuel pour Mel

**Un clic remplace des heures de compilation.**

1. Dashboard → carte **« Rapport mensuel (Mel) »** (en bas à droite).
2. Choisissez le mois et l'année → **Générer**.
3. L'Excel téléchargé contient :
   - **KPI** : ventes signées depuis l'embauche (en premier — Mel le demande),
     ventes/soumissions/appels/visites/courriels/lettres du mois, clients en suivi actif
   - **« Mois AAAA »** (ex. « Juin 2026 ») : le journal de toutes les actions du mois
   - **Pipeline** : l'état complet de vos prospects

### Pour que le rapport soit juste

Le rapport se construit à partir de ce que l'app a vu. Deux habitudes :

1. **Journal rapide** après chaque appel/visite/courriel/soumission/vente (un clic).
2. **Statuts à jour** dans Mes prospects (les KPI « ventes » et « soumissions actives »
   viennent des statuts).

Ce que vous ne loggez pas n'existe pas dans le rapport.

---

## 9. Paramètres

- **Représentant** : nom, téléphone, courriel — pré-remplissent le générateur de lettres
- **Mode par défaut** : postal ou dépôt
- **Logo** : remplace le logo Guard-X en tête des lettres (PNG/JPG)

---

## 10. Flux de travail complets

### A. Campagne de lettres aux syndicats (de zéro)

1. **Ciblage copropriétés** : CSV de Montréal → filtrer 8–24 unités + secteur cible
2. **Envoyer aux prospects** (segment : Syndicat de copropriété)
3. Vérifier le bandeau anti-clients ; au besoin, passer par le **Vérificateur de doublons**
4. **Exporter Excel** → **Générateur de lettres** → mode dépôt ou postal → ZIP → imprimer
5. Tournée de dépôt / mise à la poste
6. Dans **Mes prospects** : statut « Courriel envoyé »… non — statut selon le canal,
   et **Prochaine action = +3 semaines**
7. Les rappels remontent dans **Aujourd'hui** au bon moment

### B. Campagne win-back (liste des 149)

1. **Mes prospects** → **Importer** la liste (les notes existantes sont préservées
   dans la colonne Notes)
2. Segment : **Ancien client (win-back)** ; statut : À contacter / À appeler
3. Blocs d'appels mardi–jeudi ; après chaque appel : **Journal rapide → Appel**,
   statut mis à jour, **Prochaine action** datée
4. Re-signé → statut **♻️ Récupéré (signé)** + Journal rapide → Vente signée

### C. Suivi de soumission

1. Soumission bâtie dans Sage et envoyée → statut **📄 Soumission envoyée** +
   Journal rapide → Soumission envoyée + **Prochaine action = +2 jours**
2. Relance à la date due (elle apparaît dans Aujourd'hui)
3. Négociation → **📝 Soumission révisée** ; signature → **🤝 En fermeture** puis **✅ Vendu / Signé**
4. Service pour une année future (ex. 2027) : notez-le et mettez la Prochaine action
   en conséquence — le pipeline gère les horizons longs

### D. Fin de mois

1. Vérifier que les statuts sont à jour
2. Dashboard → **Rapport mensuel (Mel)** → mois écoulé → Générer → envoyer à Mel

---

## 11. Questions fréquentes

**Rien n'apparaît dans « Aujourd'hui » alors que j'ai des suivis à faire.**
Le panneau lit la colonne **Prochaine action**. Si elle est vide, l'app ne peut pas
deviner. Datez chaque prospect actif.

**J'ai importé deux fois le même fichier dans Mes prospects.**
L'import ajoute les lignes. Supprimez les doublons avec l'icône 🗑️, ou exportez,
nettoyez dans Excel et réimportez après avoir vidé la liste.

**Le garde-fou ne signale rien alors que je sais qu'il y a des clients.**
Vérifiez la page Base clients : si elle est vide ou périmée, réimportez l'export Sage.

**Mes anciens statuts (v1) ont disparu ?**
Non — ils sont automatiquement convertis (« À contacter » → « À contacter / À appeler »,
« Vendu » → « Vendu / Signé », etc.).

**Puis-je utiliser l'app sur mon téléphone ?**
La version déployée sur Vercel est accessible de partout ; l'interface est utilisable
sur mobile (la sidebar se replie).

**Où sont stockées mes données ?**
Dans votre projet Supabase (config, journal, prospects, base clients). Les fichiers
Excel/CSV que vous téléversez sont traités en mémoire et ne sont pas conservés.

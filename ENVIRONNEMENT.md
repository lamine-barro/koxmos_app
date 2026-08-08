# Variables d'environnement Koxmos App

## Clés privées — uniquement côté broker

Collez les clés dans [`backend/.env`](./backend/.env). Ce fichier est ignoré par Git et n'est jamais envoyé dans l'application iPhone.

```dotenv
OPENAI_API_KEY=...
AETHEX_API_KEY=...
JEKO_STORE_ID=...
JEKO_API_KEY=...
JEKO_API_KEY_ID=...
```

Lancez ensuite :

```bash
cd backend
set -a && source .env && set +a
npm start
```

## Adresse publique de développement — application mobile

Le fichier racine [`.env`](./.env) contient uniquement l'adresse réseau locale du broker :

```dotenv
EXPO_PUBLIC_KOXMOS_AGENT_URL=http://192.168.1.4:4242
```

Ne placez jamais une clé API dans ce fichier : toute variable commençant par `EXPO_PUBLIC_` peut être embarquée dans l'application.

## Kora AI

Configurez seulement côté broker `KOXMOS_KORA_TOOL_URL` (URL HTTPS publique du broker), `KOXMOS_KORA_TOOL_SECRET` et, après création, `AETHEX_DEFAULT_AGENT_ID`. La commande `npm run bootstrap:kora` crée les tuteurs explicitement ; elle n’est jamais lancée automatiquement.

## Facturation vocale

Le broker facture `100 FCFA/minute`, au prorata de la seconde, dans un registre de débit côté serveur. L'application ne peut ni calculer ni modifier le solde. Le crédit de test n'existe qu'en développement ; en production, le solde doit être crédité exclusivement après vérification cryptographique d'un webhook du prestataire de paiement.

Le broker actuel refuse volontairement de démarrer avec `NODE_ENV=production` : le registre fichier est acceptable uniquement pour le développement. Avant une mise en production, remplacez-le par PostgreSQL avec transactions, idempotence, sauvegardes contrôlées et webhooks de paiement vérifiés.

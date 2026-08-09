# Variables d'environnement Koxmos App

## Clés privées — uniquement côté broker

Collez les clés dans [`backend/.env`](./backend/.env). Ce fichier est ignoré par Git et n'est jamais envoyé dans l'application iPhone.

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
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

## OpenAI Realtime

Le broker crée, après contrôle du portefeuille, un secret éphémère OpenAI pour chaque appel. La clé `OPENAI_API_KEY` reste exclusivement sur le VPS. Les tuteurs Koxmos sont associés côté serveur à des voix OpenAI fixes ; aucune clé, aucun jeton durable et aucun transcript n’est embarqué dans l’application.

## Facturation vocale

Le broker facture `100 FCFA/minute`, au prorata de la seconde, dans un registre de débit côté serveur. L'application ne peut ni calculer ni modifier le solde. Le crédit de test n'existe qu'en développement ; en production, le solde doit être crédité exclusivement après vérification cryptographique d'un webhook du prestataire de paiement.

Le broker actuel refuse volontairement de démarrer avec `NODE_ENV=production` : le registre fichier est acceptable uniquement pour le développement. Avant une mise en production, remplacez-le par PostgreSQL avec transactions, idempotence, sauvegardes contrôlées et webhooks de paiement vérifiés.

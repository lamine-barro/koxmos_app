# Tester Koxmos sur votre iPhone

## Test local immédiat — sans clé API

1. Installez **Expo Go** depuis l’App Store sur l’iPhone.
2. Connectez l’iPhone et ce Mac au même Wi-Fi.
3. Dans un terminal :

```bash
cd /Users/laminebarro/LAMINEBARRO/BUSINESS/ETUDESK/Etudesk_SAS/PRODUCTS/koxmos_app
npm start -- --lan
```

4. Scannez le QR code avec l’app Expo Go.

Vous pourrez tester le parcours complet local : prénom + pays, passeport, compétences, changement GPT/Kora, tuteur texte de démonstration, écran vocal Kora et export/import chiffré.

## Activer GPT-5 mini réel sur le réseau local

La clé OpenAI reste seulement sur ce Mac, jamais sur l’iPhone.

1. Le broker lit automatiquement `BUSINESS/KOXMOS/koxmos.com/.env` et réutilise sa clé `OPENAI_API_KEY` sans la dupliquer. Si vous devez utiliser un autre fichier, définissez `KOXMOS_SOURCE_ENV`.
2. Dans le terminal, lancez le broker local :

```bash
cd /Users/laminebarro/LAMINEBARRO/BUSINESS/ETUDESK/Etudesk_SAS/PRODUCTS/koxmos_app/backend
npm start
```

3. Trouvez l’adresse Wi-Fi du Mac :

```bash
ipconfig getifaddr en0
```

4. Créez `.env` à la racine de Koxmos avec, en remplaçant l’adresse :

```bash
EXPO_PUBLIC_KOXMOS_AGENT_URL=http://192.168.1.10:4242
```

5. Redémarrez Expo avec `npm start -- --lan`, puis rechargez l’app sur l’iPhone.

Le broker utilise GPT-5 mini via la Responses API avec `store: false`. Il ne reçoit jamais le passeport complet : il garde seulement une courte fenêtre de conversation, configurable et purgée après 7 jours par défaut, afin que le tuteur puisse reprendre une séance. Les réponses texte sont diffusées progressivement et peuvent être arrêtées dans l’application.

## Aethex Kora AI

Le parcours vocal et son interface sont prêts à tester, mais l’appel réel exige les paramètres AethexAI : URL/SDK mobile, format audio, jeton court et politique de rétention. Ne mettez aucune clé AethexAI dans l’application.

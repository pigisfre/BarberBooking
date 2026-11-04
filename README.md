# BarberBooking

App di prenotazione per un barbiere: **app Cliente** (iOS, Android, web) + **gestionale del salone** (iOS, Android, tablet, web). Un solo codice Expo / React Native, personalizzato per ogni barbiere tramite `brands/<id>/brand.json`.

Decisioni di prodotto: vedi [`CLAUDE.md`](CLAUDE.md). Piano e stato: cartella [`replica/`](replica/).

## Struttura

```
apps/client      app Cliente (Expo Router)
apps/business    gestionale del barbiere (Expo Router)
packages/core    logica pura: calcolo slot, fusi orari, formattazione, codici d'errore
packages/api     DataLayer (interfaccia unica) + backend finto per lo sviluppo + hook React
packages/ui      tema dai token (chiaro/scuro + colore del brand) e componenti
brands/          un cliente = una cartella (demo = dati di prova)
e2e/             test end-to-end web (Playwright)
replica/         recon, architettura, schema SQL, design, build log
```

## Avvio in locale (web)

Serve Node 22 e pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev:server
```

Lascia girare il backend finto (porta 8787), poi in altri due terminali:

```bash
pnpm client
```

```bash
pnpm business
```

- App Cliente: http://localhost:8081
- Gestionale: http://localhost:8082, accesso con `titolare@demo.test`

Su telefono (Expo Go o development build) imposta `EXPO_PUBLIC_FAKE_URL=http://<ip-del-computer>:8787`, perché `localhost` sul telefono è il telefono stesso.

## Test

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm export:web && node e2e/slice.mjs
```

Schema del database: vedi l'intestazione di `replica/test/schema.test.sql`.

## Un nuovo barbiere

1. Copia `brands/_template` in `brands/<id>` e compila `brand.json`, mettendo gli asset in `assets/`.
2. Controlla i colori:

```bash
python3 replica/design/build_tokens.py --brand brands/<id>/brand.json --out build/<id>
```

3. Costruisci con `BRAND=<id>`, per esempio:

```bash
BRAND=<id> pnpm --filter @bb/client export:web
```

Dopo aver cambiato un `brand.json` aggiungi `--clear` all'export, perché Metro tiene in cache la configurazione.

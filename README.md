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
EXPO_PUBLIC_BACKEND=fake pnpm client
```

```bash
EXPO_PUBLIC_BACKEND=fake pnpm business
```

Senza `EXPO_PUBLIC_BACKEND=fake` le app usano Supabase (URL e chiave pubblica in `brands/demo/brand.json`): vedi "Demo su Supabase".

- App Cliente: http://localhost:8081
- Gestionale: http://localhost:8082, accesso con le credenziali demo mostrate nella pagina

Su telefono (Expo Go o development build) imposta `EXPO_PUBLIC_FAKE_URL=http://<ip-del-computer>:8787`, perché `localhost` sul telefono è il telefono stesso.

## Test

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm test:db
```

(test del database su un Postgres locale: usa `PGHOST`/`PGPORT`/`PGUSER`)

```bash
pnpm e2e
```

## Demo su Supabase (piano gratuito)

1. Nel progetto Supabase apri **SQL Editor**, incolla tutto `supabase/demo-setup.sql` e premi **Run**. Crea tabelle, regole e dati demo.
2. **Authentication → Sign In / Providers**: attiva **Allow anonymous sign-ins** (serve ai clienti della demo).
3. **Authentication → Users → Add user → Create new user**: email `titolare@barberbooking.demo`, la password che preferisci, spunta **Auto Confirm User**. Se cambi email o password, aggiornale in `brands/demo/brand.json` alla voce `demo`.
4. Di nuovo nello **SQL Editor**: esegui `supabase/demo-staff.sql`, che deve rispondere `ok: titolare collegato`.
5. Avvia le app (`pnpm client`, `pnpm business`) e prova a prenotare e a entrare nel gestionale.

Per rimettere i dati demo come nuovi, riesegui solo `supabase/seed.sql`. Il progetto gratuito va in pausa dopo circa una settimana senza visite: si riattiva dalla dashboard.

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

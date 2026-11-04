# BarberBooking

App di prenotazione per barbieri: **app Cliente** + **gestionale del barbiere**, su web, iOS e Android.

## Decisioni di prodotto (da rispettare sempre)

- **Single-tenant, white-label.** Il prodotto si vende a UN singolo barbiere (un salone, eventualmente con collaboratori) e si personalizza per lui e per i suoi clienti. Ogni cliente è un'installazione separata, con database Supabase, dominio e app negli store a suo nome. **Non è una piattaforma multi-salone**: niente `tenant_id`, niente ricerca dei saloni, niente console SaaS, niente self-signup dei saloni.
- La "dashboard centrale" è la home del gestionale del barbiere (S22).
- **Un solo codice:** Expo (React Native) + Expo Router + react-native-web per iOS, Android e web. Nessun progetto React web separato.
- La personalizzazione per cliente sta in `brands/<cliente>/brand.json` + assets, letti da `app.config.ts`.
- Stile: skill `apple-design` (molle, gesti, materiali, tipografia), tradotta per React Native.
- Ispirazione funzionale da BarberApp, **clean-room**: mai codice, testi, logo, colori o asset dell'originale. Il nome e il brand del prodotto saranno nostri (`/replica-brand`).
- Mercato Italia: testi in italiano, `Europe/Rome`, EUR, GDPR, dati in UE.

## Dove sta cosa

- `replica/recon.md`, `replica/features.csv`: ricognizione e matrice delle funzioni (ID schermate S01..., flussi F01...).
- `replica/architecture.md`: stack, API, job, rischi, ordine di costruzione.
- `supabase/migrations/`: schema del database. Si testa con `pnpm test:db` (Postgres locale, vedi `supabase/tests/run.sh`); ogni modifica allo schema deve far passare i test e va rigenerato `supabase/demo-setup.sql` (`pnpm demo-sql`).
- `replica/backend.md`: stato del backend, cosa è verificato e cosa no, checklist di sicurezza.
- Demo da portfolio: Supabase Free; clienti con accesso anonimo + nome e telefono; il telefono NON verificato non deve mai dare accesso a dati esistenti.
- `.claude/skills/`: skill Replica (`replica-*`) e `apple-design`.

## Flusso di lavoro

recon → architect → design → build → backend → test → diff → entrepreneur → brand → launch → deploy (cartella `replica/`).

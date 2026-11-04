# Architecture: BarberBooking (nome provvisorio). Ricostruisce le funzioni principali di BarberApp

Fonti: `replica/recon.md`, `replica/features.csv`. Schema: `replica/schema.sql`, testato su Postgres 16 con `replica/test/schema.test.sql`.

## L'idea in una riga

**Un solo codice React Native (Expo) per iOS, Android e web, installato una volta per ogni barbiere che lo compra.**

Ogni installazione è **single-tenant e personalizzata**: il database, le app con nome, logo e colori del barbiere e il dominio sono suoi. Il codice resta uno solo: cambia solo il file di configurazione del cliente.

```
barberbooking/                      monorepo pnpm + Turborepo
├─ apps/
│  ├─ client/      Expo Router  ->  iOS, Android, web   (l'app dei clienti del barbiere;
│  │                                 su web e anche la pagina di prenotazione pubblica)
│  └─ business/    Expo Router  ->  iOS, Android, tablet, web desktop (il gestionale del barbiere;
│                                    la home S22 e la "dashboard centrale")
├─ packages/
│  ├─ ui/          componenti condivisi (NativeWind), token da replica-design; tema dal brand
│  ├─ core/        logica pura TS: calcolo slot, regole, prezzi, date/fusi, schemi zod, testi it
│  └─ api/         client Supabase, tipi generati dal DB, hook TanStack Query
├─ brands/
│  ├─ _template/brand.json         modello da copiare
│  └─ barberia-mario/              un cliente = una cartella
│     ├─ brand.json                nome, colori, bundle id, dominio, url Supabase, ...
│     └─ assets/                   logo, icona app 1024, splash, favicon
├─ supabase/
│  ├─ migrations/  0001_init.sql = replica/schema.sql (uguale per tutti i clienti)
│  ├─ functions/   Edge Functions (Deno, importano packages/core)
│  └─ seed.sql     dati finti per sviluppo
└─ scripts/
   ├─ new-client   crea brand/, progetto Supabase, migrazioni, riga `salon`, utente titolare
   └─ deploy-all   migrazioni + web + EAS Update su tutti i clienti
```

Come funziona la personalizzazione:
- `app.config.ts` legge `BRAND=barberia-mario` e da lì prende nome app, icona, splash, bundle id (`it.barberiamario.app`), schema dei deep link e URL del backend.
- `packages/ui` legge i colori del brand e sovrascrive solo i token "brand" (accento, logo). Tutti gli altri token restano quelli del sistema di design, così ogni cliente ha un aspetto suo ma la qualità resta la stessa.
- Ogni cliente ha un profilo EAS (`eas.json`) e un progetto Vercel suoi.

Perché due app e non una:
- clienti e barbiere hanno store listing, permessi e navigazione diversi;
- il cliente finale non deve mai vedere il gestionale.

## Stack

| layer | choice | why |
| --- | --- | --- |
| mobile + web | **Expo SDK (React Native) + Expo Router + react-native-web**, TypeScript | un codice per 3 piattaforme, come richiesto |
| web pubblico | app Cliente in build web, rendering statico/server di Expo Router | link da Instagram e Google, indicizzabile |
| personalizzazione | `brands/<cliente>/brand.json` + `app.config.ts` + profili EAS | N clienti, un codice |
| styling | **NativeWind** (Tailwind) + token di replica-design, stile da skill `apple-design` | stesse classi su native e web |
| animazioni e gesti | `react-native-reanimated` (molle) + `react-native-gesture-handler` | agenda trascinabile, pannelli dal basso |
| stato server | **TanStack Query** | cache, retry, lettura offline |
| validazione | **zod** in `packages/core` | stessi schemi nelle app e nelle Edge Functions |
| database | **un progetto Supabase per cliente**, regione UE (Francoforte) | dati del barbiere separati fisicamente; GDPR più semplice |
| accesso dati | Supabase client + **RLS** + **RPC Postgres** per le operazioni critiche | la sicurezza sta nel database |
| auth | **Supabase Auth**: clienti con **telefono + OTP SMS** (più Apple/Google); staff con email + password o magic link | il barbiere conosce i clienti dal telefono |
| server logic | **Supabase Edge Functions** (Deno) | slot, webhook, invio messaggi |
| realtime | **Supabase Realtime** su `appointments` | agenda aggiornata su telefono, tablet e PC del salone |
| WhatsApp | **WhatsApp Business Platform (Cloud API di Meta)** sul **numero business del barbiere** | i clienti ricevono il messaggio dal loro barbiere; Meta fattura direttamente a lui |
| SMS (OTP) | provider di Supabase Auth (Twilio o MessageBird) | integrato |
| email | **Resend**, dominio del barbiere o un tuo sottodominio | |
| push | **Expo Push Notifications** | un'API per iOS e Android |
| jobs | **pg_cron** in ogni progetto Supabase che chiama le Edge Functions | niente servizi extra |
| file | **Supabase Storage** (foto salone, avatar operatori) | |
| hosting web | **Vercel**, un progetto per cliente (`prenota.<dominio-barbiere>.it`, `gestionale.<dominio>.it`) | |
| build mobile | **EAS Build + Submit** sull'account sviluppatore del barbiere; **EAS Update** per fix rapidi | |
| errori | **Sentry**, un progetto con tag `brand` | vedi i crash di tutti i clienti in un posto solo |
| acconti online (fase 2) | **Stripe**, account del barbiere (Standard, non Connect) | i soldi vanno a lui senza passare da te |
| test | Vitest (`core`), test SQL (`replica/test`), Playwright (web), Maestro (mobile) | |

## Schema

Tabelle MVP: **15**:
- persone: `profiles`, `staff_users`;
- salone: `salon` (riga unica), `staff_members`, `service_categories`, `services`, `service_staff`, `working_hours`, `time_blocks`;
- clienti e appuntamenti: `customers`, `appointments`, `appointment_services`;
- notifiche e sistema: `push_tokens`, `message_log`, `webhook_events`.

Access rules: **Postgres Row Level Security** su ogni tabella, con le funzioni `is_staff()` e `has_role(roles)`.

Decisioni chiave:
- **Niente `tenant_id`.** Il salone è la riga unica della tabella `salon`, che un vincolo impedisce di duplicare. La separazione tra barbieri diversi è fisica: un database per cliente. Questo toglie un'intera classe di bug, cioè i dati di un salone visibili da un altro.
- **Persona e scheda cliente.** `profiles` è chi usa l'app; `customers` è la scheda nella rubrica del barbiere. Il barbiere può creare clienti senza app; quando quel cliente installa l'app con lo stesso telefono, la scheda si collega da sola e non nasce un doppione (verificato, test T6).
- **Doppia prenotazione impossibile nel database.** C'è un vincolo di esclusione per operatore sugli appuntamenti attivi.
- **Una sola porta per prenotare: `book_appointment()`**, una funzione RPC atomica. Fa queste cose:
  - controlla l'idempotenza (un doppio tap restituisce lo stesso id);
  - applica le regole del salone (preavviso minimo, giorni di anticipo, servizi attivi e abilitati per l'operatore, orario di lavoro);
  - prende un lock per operatore e controlla pause e ferie;
  - fissa prezzo e durata di ogni servizio al momento della prenotazione;
  - restituisce errori con codici stabili (`slot_unavailable`, `outside_hours`, `invalid_services`, `too_late`, `too_far`, `booking_closed`).
- **Orari salvati come regole in ora locale** (`working_hours` + `salon.timezone`); gli istanti sono in UTC.
- **Soldi in centesimi** + `currency`.
- **Tabelle della fase 2:** elencate in fondo a `schema.sql`.

Verificato su Postgres 16 (`replica/test/schema.test.sql`), 15 casi:
- non si può creare un secondo salone;
- il barbiere inserisce un cliente a mano;
- prenotazione con più servizi: durata 45 minuti e totale 30 € corretti;
- un doppio tap non crea duplicati;
- uno slot sovrapposto viene rifiutato; quello subito dopo viene accettato;
- la scheda di rubrica si collega al profilo quando il cliente installa l'app;
- prenotare oltre l'orario di chiusura viene rifiutato;
- un cliente vede solo i propri appuntamenti e la propria scheda;
- l'inserimento diretto viene bloccato dalla RLS;
- un servizio inesistente o disattivato viene rifiutato;
- prenotare su una pausa viene rifiutato;
- un cliente non può modificare il salone;
- un utente anonimo legge salone e servizi ma non clienti né appuntamenti.

## API

Le operazioni CRUD semplici passano dal client Supabase con RLS (marcate **RLS**). Le operazioni critiche passano da RPC o Edge Function.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| Auth `signInWithOtp` / `verifyOtp` | accesso con telefono | pubblico | phone, code | sessione | F01, F02 |
| Auth email / Apple / Google | accesso | pubblico / staff | | sessione | F01, F07 |
| `GET salon` **RLS** | dati del salone (home dell'app) | pubblico | | salone | F01, F02 |
| `GET services, service_categories, staff_members, service_staff` **RLS** | catalogo | pubblico | | liste | F01, F02 |
| `POST fn/availability` | slot liberi per giorno, o i primi giorni liberi | pubblico, rate limit | service_ids, staff_id o "qualsiasi", date | `[{start, staff_id}]` | F01, F02, F03, F07 |
| `RPC book_appointment` | prenota in modo atomico | cliente loggato o staff | staff, services, start, customer?, source, note, idempotency_key | appointment_id o codice errore | F01, F02, F07 |
| `RPC cancel_appointment` | annulla entro la finestra (cliente) o sempre (staff) | cliente proprietario o staff | id | ok o `outside_window` | F03 |
| `RPC reschedule_appointment` | sposta in modo atomico | cliente proprietario o staff | id, nuovo start, staff? | id | F03 |
| `GET appointments` **RLS** | i miei appuntamenti / agenda | cliente / staff | range date | lista | F01, F07 |
| `PATCH appointments.status` **RLS** | completato, no-show, conferma | staff | id, status | | F07 |
| `CRUD customers` **RLS** | rubrica | staff | | | F07 |
| `CRUD services, categories, staff_members, service_staff, working_hours, time_blocks` **RLS** | configurazione | owner/admin (pause: tutto lo staff) | | | F06 |
| `PATCH salon` **RLS** | profilo e regole di prenotazione | owner/admin | | | F06 |
| `POST fn/invite-staff` | invita un collaboratore via email | owner | email, role | | F06 |
| `POST fn/register-push` | salva il token Expo | loggato | token, app, platform | | F05 |
| `POST fn/delete-account` | cancella il profilo e anonimizza la scheda | loggato | | | GDPR / Apple |
| `GET fn/dashboard` | KPI di oggi e della settimana per S22 | staff | data | numeri | F09 |

Webhooks in:
- `fn/whatsapp-webhook` (verifica la firma di Meta): aggiorna lo stato in `message_log` e gestisce il pulsante "Annulla" del template.
- Fase 2: `fn/stripe-webhook` per gli acconti, con `webhook_events` per l'idempotenza.

Webhooks out: nessuno.

Jobs (pg_cron, in ogni installazione):
| job | schedule | what |
| --- | --- | --- |
| `send-reminders` | ogni ora al minuto 0 | se l'ora locale = `salon.reminder_hour`, manda il WhatsApp ai clienti con appuntamento domani; fallback push/email; setta `reminder_sent_at` (idempotente) |
| `notify-booking` | al volo (trigger → coda) | conferma al cliente; push al barbiere per nuove prenotazioni, spostamenti e annullamenti |
| `cleanup` | ogni settimana | token push scaduti, vecchi `webhook_events` |

Strumenti tuoi, fuori dalle app:
- `scripts/new-client`: usa la CLI di Supabase per creare il progetto, applicare le migrazioni, creare la riga `salon`, invitare il titolare e impostare i segreti delle Edge Functions.
- `scripts/deploy-all`: per ogni cliente in `brands/`, applica le migrazioni, pubblica il web e manda l'EAS Update. In CI è una matrice, un job per cliente.

Solo API ufficiali, con chiavi tue o del barbiere: Supabase, Meta WhatsApp Cloud API, Resend, Expo, provider SMS, Stripe. Nessun endpoint di BarberApp.

## The parts that bite

- **Store, il più importante.** La regola Apple **4.2.6** rifiuta le app nate da un template commerciale se a pubblicarle non è chi possiede il contenuto. Quindi:
  - ogni barbiere deve avere **il proprio account Apple Developer** come azienda (99 $/anno, serve il numero D-U-N-S, qualche settimana per ottenerlo) e un account Google Play (25 $ una tantum);
  - tu entri nel suo team come sviluppatore e pubblichi da lì;
  - ogni app deve sembrare davvero sua (nome, icona, foto, contenuti), non una copia uguale per tutti.
  Va messo nel contratto e nei tempi di consegna.
- **Aggiornamenti a N clienti:** un'unica versione del codice per tutti; le migrazioni devono essere retrocompatibili, perché le app già installate restano per un po' alla versione precedente. `deploy-all` con un rollout cliente per cliente: prima un cliente pilota, poi gli altri.
- **Costi per cliente:**
  - Supabase Free mette in pausa i progetti inattivi, quindi in produzione serve il piano Pro (circa 25 $/mese per progetto);
  - Vercel, gli SMS OTP e WhatsApp hanno costi a parte.
  Vanno inclusi nel canone che fai pagare al barbiere.
- **WhatsApp:** account Meta Business **del barbiere**, numero dedicato, template approvati ("promemoria", "conferma"). Va configurato in fase di installazione e richiede qualche giorno di verifica.
- **Fusi orari e ora legale:** orari in ora locale del salone; slot calcolati in `packages/core` con `Temporal` / `date-fns-tz`. I giorni del cambio d'ora (23 o 25 ore) hanno test dedicati.
- **Idempotenza:** `idempotency_key` sulle prenotazioni, `reminder_sent_at`, `webhook_events`.
- **Concorrenza:** lock per operatore + vincolo di esclusione. L'app gestisce `slot_unavailable` ricaricando gli slot.
- **Calcolo slot:** nella Edge Function, così pause e appuntamenti altrui non arrivano mai al client.
- **SMS OTP:** costano e attirano abusi. Servono rate limit, captcha sul web e solo numeri italiani all'inizio.
- **GDPR:**
  - il barbiere è titolare dei dati e tu sei responsabile del trattamento: serve un contratto ex art. 28 con ogni cliente;
  - dati nell'UE; consensi marketing con data; esportazione e cancellazione;
  - privacy policy a nome del barbiere, dentro la sua app.
- **Offline:** il tablet del salone mostra l'agenda in cache in sola lettura con l'avviso "offline".
- **Web con react-native-web:** il gestionale su desktop richiede layout dedicati (sidebar, agenda larga). Si gestiscono con breakpoint in `packages/ui`. Il codice solo nativo va in file `.native.tsx`.
- **Fiscale:** la cassa (fase 2) non emette scontrini. Va scritto chiaramente.

## Build order

1. **Vertical slice (2-3 settimane):** un cliente finto, un cliente finale prenota da web, la prenotazione compare in agenda.
   - Screens: S17, S05, S06, S07, S08, S09, S21 e S23 (sola lettura).
   - Tables: tutte quelle di `schema.sql`.
   - Routes: OTP, `salon`, `fn/availability`, `book_appointment`, `GET appointments`.
   - Dimostra: monorepo, Expo su web/iOS/Android, personalizzazione da `brand.json`, RLS, calcolo slot.

2. **Must-haves:**
   - a. **Configurazione salone:** S29 servizi, S30 staff, S31 orari, S32 regole, S40 link e QR; `scripts/new-client`.
   - b. **Agenda completa:** S22 dashboard, S23 con drag & drop, S25 crea/modifica, S26 pause e ferie, stati e no-show, realtime.
   - c. **Clienti:** S27, S28 con consensi.
   - d. **App Cliente:** S01, S02, S04 (home = il salone), S10, S11 sposta/annulla, S16 con cancellazione account.
   - e. **Notifiche:** push, `send-reminders` WhatsApp, `whatsapp-webhook`.
   - f. **Primo cliente vero:** account Apple e Google del barbiere, TestFlight e Play internal, dominio, `deploy-all`.

3. **Should-haves** (fase 2):
   - Apple/Google login, centro notifiche, vista settimana, wizard di primo accesso;
   - cassa S33/S34 + sconti; magazzino S35; analytics S36;
   - marketing S37, voucher S38, coda S12/S39;
   - acconti con Stripe S41, import clienti CSV (per chi arriva da un altro gestionale).

4. **Could-haves:** vista combinata S43, fidelity a punti, porta un amico, Google Calendar, mini sito, più sedi dello stesso barbiere, SMS di riserva, commissioni dello staff.

5. **Fixes da replica-entrepreneur:** da aggiungere dopo la lettura delle recensioni.

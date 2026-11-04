# Architecture: BarberBooking (nome provvisorio). Ricostruisce le funzioni principali di BarberApp

Fonti: `replica/recon.md`, `replica/features.csv`. Schema: `replica/schema.sql`, testato su Postgres 16 con `replica/test/schema.test.sql`.

## L'idea in una riga

**Un solo codice React Native (Expo) per iOS, Android e web.** Su web gira tramite react-native-web.
Due app: **Cliente** e **Salone**. La console della piattaforma è una sezione web della app Salone, visibile solo agli admin della piattaforma.
Un solo backend: **Supabase** (Postgres + Auth + Edge Functions), con sede nell'UE.

```
barberbooking/                      monorepo pnpm + Turborepo
├─ apps/
│  ├─ client/      Expo Router  ->  iOS, Android, web (pagina pubblica /<slug> del salone = S17)
│  └─ business/    Expo Router  ->  iOS, Android, tablet, web desktop (gestionale)
│                                   + /(platform)/*  console S50-S54, solo web, solo admin piattaforma
├─ packages/
│  ├─ ui/          componenti condivisi (NativeWind = Tailwind per RN e web), token da replica-design
│  ├─ core/        logica pura TS: calcolo slot, regole, prezzi, date/fusi, schemi zod, testi it
│  └─ api/         client Supabase, tipi generati dal DB, hook TanStack Query
└─ supabase/
   ├─ migrations/  0001_init.sql = replica/schema.sql
   ├─ functions/   Edge Functions (Deno, importano packages/core)
   └─ seed.sql     dati finti realistici
```

Perché due app e non una: clienti e barbieri hanno store listing, permessi, navigazione e ciclo di rilascio diversi. Apple, inoltre, preferisce app con uno scopo chiaro. Il codice condiviso sta in `packages/`, quindi le app sono soprattutto schermate.

## Stack

| layer | choice | why |
| --- | --- | --- |
| mobile + web | **Expo SDK (React Native) + Expo Router + react-native-web**, TypeScript | un codice per 3 piattaforme, come richiesto; routing a file uguale su web e mobile |
| web pubblico (S17) | stessa app Cliente, build web con rendering statico/server di Expo Router | link Instagram/Google aperti senza app, indicizzabile |
| styling | **NativeWind** (Tailwind) + token di replica-design | stessa sintassi di classi su native e web |
| componenti complessi | agenda: componente nostro su `react-native-reanimated` + `gesture-handler`; liste: `FlashList` | il calendario per operatore è il cuore del gestionale e va controllato da noi |
| stato server | **TanStack Query** | cache, retry, offline in lettura |
| validazione | **zod** in `packages/core` | stessi schemi in client ed Edge Functions |
| database | **Supabase Postgres, regione UE (Francoforte)** | managed, RLS, GDPR; un solo database |
| accesso dati | Supabase client + **RLS** (lettura/CRUD semplice) + **RPC Postgres** per le operazioni critiche | la sicurezza sta nel database, non nell'interfaccia |
| auth | **Supabase Auth**: clienti con **telefono + OTP SMS** (più Apple/Google); staff con email + password o magic link | il barbiere conosce il cliente dal telefono; l'OTP evita le password |
| server logic | **Supabase Edge Functions** (Deno) | webhook, invio messaggi, calcolo slot con dati privati |
| realtime | **Supabase Realtime** su `appointments` per tenant | agenda aggiornata su tutti i dispositivi del salone |
| abbonamento SaaS | **Stripe Billing**: Checkout + Customer Portal | niente form carta; disdetta in un clic |
| acconti clienti (fase 2) | **Stripe Connect** (Express) | i soldi vanno al salone, non a noi |
| WhatsApp | **WhatsApp Business Platform (Cloud API di Meta)**, template approvati | l'unica via ufficiale per invii automatici |
| SMS (OTP, fallback) | provider SMS di Supabase Auth (Twilio o MessageBird) | integrato |
| email | **Resend** dal nostro dominio | semplice, buona deliverability |
| push | **Expo Push Notifications** | un'API per iOS e Android |
| jobs | **pg_cron** (Supabase) che chiama Edge Functions | niente servizi extra |
| file | **Supabase Storage** (logo, foto salone, avatar) | stessa piattaforma e stesse regole |
| hosting web | **Vercel**: build `expo export -p web` delle due app | preview per ogni PR |
| build mobile | **EAS Build + EAS Submit**; **EAS Update** per fix JS senza store | TestFlight e Play internal |
| errori e analytics | **Sentry** (RN + web); PostHog in UE oppure Plausible | crash e funnel di prenotazione |
| test | Vitest (`core`), test SQL (`replica/test`), Playwright (web), Maestro (mobile) | |

Domini:
- `app.<brand>.it`: app Cliente web
- `<brand>.it/<slug>`: pagina pubblica del salone
- `gestionale.<brand>.it`: gestionale web
- `gestionale.<brand>.it/platform`: console della piattaforma

## Schema

Tabelle MVP: **16** (`profiles`, `platform_admins`, `tenants`, `memberships`, `staff_members`, `service_categories`, `services`, `service_staff`, `working_hours`, `time_blocks`, `customers`, `appointments`, `appointment_services`, `push_tokens`, `message_log`, `webhook_events`), più la vista `public_tenants`.
Access rules: **Postgres Row Level Security** su ogni tabella, con le funzioni `is_member(tenant)`, `has_role(tenant, roles)` e `is_platform_admin()`.

Decisioni chiave:
- **Un cliente, due livelli.** `profiles` è la persona con l'app, unica su tutta la piattaforma. `customers` è la sua scheda **dentro un salone**, con note, consensi e no-show. Il barbiere può creare clienti senza app; quando quel cliente installa l'app con lo stesso telefono, le due cose si collegano.
- **Doppia prenotazione impossibile nel database.** Vincolo `exclude using gist (staff_id with =, tstzrange(start_at,end_at) with &&)` sugli appuntamenti attivi.
- **Una sola porta per prenotare: `book_appointment()`**, una funzione RPC atomica. Fa queste cose:
  - controlla l'idempotenza (un doppio tap restituisce lo stesso id);
  - verifica le regole del salone (preavviso minimo, giorni di anticipo, servizi abilitati per l'operatore, orario di lavoro);
  - prende un lock per operatore e controlla le pause e le ferie;
  - fissa prezzo e durata di ogni servizio al momento della prenotazione;
  - restituisce errori con codici stabili (`slot_unavailable`, `outside_hours`, `invalid_services`, `too_late`, `too_far`, `booking_closed`).
  Il cliente non può inserire appuntamenti direttamente: la RLS lo blocca, ed è verificato nei test.
- **Orari salvati come regole in ora locale** (`working_hours.opens/closes` + `tenants.timezone`). Gli istanti sono salvati in UTC (`timestamptz`).
- **Soldi in centesimi interi** + `currency`.
- **Tabelle della fase 2** (cassa, magazzino, marketing, fidelity, coda, Connect): elencate in fondo a `schema.sql`, da aggiungere come migrazioni successive.

Verificato su Postgres 16 (`replica/test/schema.test.sql`), 11 casi:
- prenotazione con più servizi: durata 45 minuti e totale 30 € corretti;
- un doppio tap non crea duplicati;
- uno slot sovrapposto viene rifiutato; quello subito dopo viene accettato;
- prenotare oltre l'orario di chiusura viene rifiutato;
- un servizio non abilitato per l'operatore viene rifiutato;
- prenotare su una pausa viene rifiutato;
- un cliente vede solo i propri appuntamenti e la propria scheda;
- l'inserimento diretto viene bloccato dalla RLS;
- il titolare vede tutto il salone;
- un utente anonimo legge solo la vista pubblica.

## API

Le operazioni CRUD semplici passano dal client Supabase con RLS (marcate **RLS**). Le operazioni critiche passano da RPC o Edge Function.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| Auth `signInWithOtp` / `verifyOtp` | accesso con telefono | pubblico | phone, code | sessione | F01, F02 |
| Auth email / Apple / Google | accesso | pubblico | | sessione | F06, F01 |
| `GET public_tenants?slug=` **RLS** | pagina salone | pubblico | slug | salone | F01, F02 |
| `GET services, staff_members, service_staff` **RLS** | catalogo pubblico | pubblico | tenant_id | liste | F01, F02 |
| `GET public_tenants` con ricerca per nome e città | cerca salone (S03) | pubblico | q, city, lat/lng | lista | F01 |
| `POST fn/availability` | slot liberi per giorno (o primi giorni liberi) | pubblico, rate limit | tenant, service_ids, staff_id or any, date | `[{start, staff_id}]` | F01, F02, F03, F07 |
| `RPC book_appointment` | prenota in modo atomico | cliente loggato o staff | tenant, staff, services, start, customer?, source, note, idempotency_key | appointment_id o codice errore | F01, F02, F07 |
| `RPC cancel_appointment` | annulla entro la finestra (cliente) o sempre (staff) | cliente proprietario o staff | id | ok o `outside_window` | F03 |
| `RPC reschedule_appointment` | sposta in modo atomico (annulla + prenota in una transazione) | cliente proprietario o staff | id, new start, staff? | id | F03 |
| `GET appointments` **RLS** | i miei appuntamenti / agenda del salone | cliente / staff | range date | lista | F01, F07 |
| `PATCH appointments.status` **RLS** | completato, no-show, conferma richiesta | staff | id, status | | F07 |
| `CRUD customers` **RLS** | rubrica | staff | | | F07 |
| `CRUD services, categories, staff_members, service_staff, working_hours, time_blocks` **RLS** | configurazione | owner/admin (blocchi: tutto lo staff) | | | F06 |
| `PATCH tenants` **RLS** | profilo e regole di prenotazione | owner/admin | | | F06 |
| `POST fn/signup-tenant` | crea salone, membership owner, staff owner, orari di default, trial 30 giorni | utente loggato | name, slug, city | tenant | F06 |
| `POST fn/invite-staff` | invita un collaboratore via email | owner | email, role | | F06 |
| `POST fn/billing-checkout` | Stripe Checkout per il piano | owner | plan | url | F12 |
| `POST fn/billing-portal` | Stripe Customer Portal | owner | | url | F12 |
| `POST fn/register-push` | salva il token Expo | loggato | token, app, platform | | F05 |
| `POST fn/delete-account` | cancella il profilo; anonimizza i dati nei saloni | loggato | | | GDPR / Apple |
| `GET fn/platform/*` | elenco saloni, metriche, sospendi | admin piattaforma | | | S50-S54 |

Webhooks in:
- `fn/stripe-webhook` (verifica la firma; `webhook_events` per l'idempotenza). Eventi: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Aggiornano `tenants.plan/status`.
- `fn/whatsapp-webhook` (verifica la firma di Meta). Aggiorna lo stato di `message_log` e gestisce le risposte "Annulla" dal pulsante del template.

Webhooks out: nessuno nel MVP.

Jobs (pg_cron):
| job | schedule | what |
| --- | --- | --- |
| `send-reminders` | ogni ora al minuto 0 | per i saloni la cui ora locale = `reminder_hour`, invia il WhatsApp ai clienti con appuntamento domani; fallback push/email; setta `reminder_sent_at` (idempotente) |
| `notify-booking` | al volo, trigger → coda | conferma al cliente e push al barbiere per nuove prenotazioni, spostamenti e annullamenti |
| `trial-expiry` | ogni giorno alle 03:17 | avvisi a 7, 3 e 1 giorno; alla scadenza `status = read_only` (agenda consultabile, niente nuove prenotazioni online) |
| `cleanup` | ogni settimana | token push scaduti, `webhook_events` più vecchi di 90 giorni |

Solo API ufficiali con chiavi del titolare del progetto: Supabase, Stripe, Meta WhatsApp Cloud API, Resend, Expo, provider SMS. Nessun endpoint di BarberApp.

## The parts that bite

- **Fusi orari e ora legale:** orari in ora locale del salone; slot calcolati con `Temporal` / `date-fns-tz` in `packages/core`. Nei giorni del cambio d'ora (23 o 25 ore) servono test dedicati. Il cliente vede sempre l'ora del salone.
- **Idempotenza:** `idempotency_key` su ogni prenotazione; `webhook_events` per Stripe e Meta; `reminder_sent_at` per non mandare due promemoria.
- **Concorrenza:** lock per operatore + vincolo di esclusione. L'app gestisce `slot_unavailable` ricaricando gli slot ("questo orario è appena stato preso").
- **Calcolo slot:** fatto dalla Edge Function con dati privati (pause, appuntamenti altrui), mai esposti al client. "Qualsiasi operatore" = unione degli slot degli operatori abilitati, con assegnazione bilanciata.
- **WhatsApp:**
  - servono un account Meta Business verificato, un numero dedicato e template approvati ("promemoria", "conferma");
  - si paga a conversazione e Meta fattura noi, quindi va incluso nel prezzo o venduto a crediti. `message_log.cost_cents` serve a misurarlo;
  - i messaggi partono da un numero della piattaforma, a nome del salone. Il numero proprio per ogni salone è un'opzione futura.
- **SMS OTP:** costano e attirano abusi (SMS pumping). Servono rate limit, captcha (hCaptcha/Turnstile su web) e paesi limitati all'inizio.
- **Multi-tenancy:** ogni tabella ha `tenant_id` + RLS. In CI va eseguito il test "un secondo utente non vede nulla" per ogni tabella nuova.
- **GDPR:** dati in UE; DPA con ogni fornitore (Supabase, Stripe, Meta, Resend, Sentry). Il salone è titolare dei dati dei suoi clienti e noi siamo responsabili del trattamento: serve un contratto ex art. 28 con ogni salone. Consensi marketing con data; esportazione e cancellazione.
- **Offline:** il tablet del salone con rete instabile mostra l'agenda in cache (TanStack Query persistito) in sola lettura e segnala "offline". Niente prenotazioni offline.
- **Realtime:** un canale per tenant su `appointments`; fallback a refetch periodico.
- **Ricerca saloni:** `pg_trgm` su nome e città; mappa e "vicino a me" con lat/lng (PostGIS se cresce).
- **Store:**
  - Apple: Sign in with Apple obbligatorio se c'è Google; cancellazione account dentro l'app; linea guida 4.1 (copycat), da qui il rebrand.
  - App Salone: niente acquisti in-app per l'abbonamento. È un servizio business, quindi si paga sul web, ma l'app non deve mostrare link al pagamento.
- **Web con react-native-web:** il gestionale su desktop richiede layout dedicati (sidebar, agenda larga, tabelle). Si gestiscono con breakpoint in `packages/ui`, non con un'altra app. Le librerie native-only (camera, ecc.) vanno isolate in file `.native.tsx`.
- **Fiscale:** la cassa del MVP non emette scontrini. Va scritto chiaramente nel prodotto per non creare aspettative.

## Build order

1. **Vertical slice (2-3 settimane):** un salone creato a mano, un cliente prenota da web, la prenotazione compare in agenda.
   - Screens: S17 (web), S05, S06, S07, S08, S09 e S23 (sola lettura), S21.
   - Tables: tutte quelle di `schema.sql`.
   - Routes: OTP, `public_tenants`, `fn/availability`, `book_appointment`, `GET appointments`.
   - Dimostra: monorepo, Expo su web/iOS/Android, RLS, calcolo slot, vincolo anti-doppione.

2. **Must-haves** (in quest'ordine):
   - a. **Onboarding salone:** S20 wizard, `fn/signup-tenant`, S29 servizi, S30 staff, S31 orari, S32 regole, S40 link/QR.
   - b. **Agenda completa:** S22, S23 con drag & drop, S25 crea/modifica, S26 blocchi, stati e no-show, realtime.
   - c. **Clienti:** S27, S28 con consensi.
   - d. **App Cliente:** S01, S02, S03 ricerca, S04, S10, S11 sposta/annulla, S16 con cancellazione account; `cancel/reschedule` RPC.
   - e. **Notifiche:** push conferme, `send-reminders` WhatsApp, `whatsapp-webhook`.
   - f. **SaaS:** trial, S42, Stripe Checkout/Portal/webhook, `trial-expiry`; console S50, S51, S53.
   - g. **Rilascio:** TestFlight e Play internal di entrambe le app, Vercel per il web.

3. **Should-haves** (fase 2):
   - Apple/Google login, preferiti, centro notifiche, vista settimana;
   - cassa S33/S34 + sconti; magazzino S35; analytics S36;
   - marketing S37, voucher S38, coda S12/S39;
   - acconti con Stripe Connect S41, import clienti CSV.

4. **Could-haves:** vista combinata S43, fidelity a punti, porta un amico, Google Calendar sync, mini sito, multi-sede, SMS fallback, commissioni staff.

5. **Fixes da replica-entrepreneur:** da aggiungere dopo la lettura delle recensioni. Ipotesi iniziale dalla recon, da verificare: oggi l'app cliente richiede un account prima di qualsiasi cosa (S17 prenotazione web con solo telefono + OTP lo riduce); instabilità della sincronizzazione calendario.

# Backend

Stato al 2026-11-04. Modalità: **demo da portfolio** su Supabase Free (progetto `egtoooukufqcaxbbnxnh`, regione eu-north-1, UE).

## Cosa c'è

| parte | come | dove |
| --- | --- | --- |
| database | Postgres su Supabase, una migrazione | `supabase/migrations/20261104000000_init.sql` |
| accesso ai dati | RLS su ogni tabella + funzioni `security definer` per le operazioni critiche | stessa migrazione |
| orari liberi | `get_available_slots()` in SQL, stessa logica di `packages/core/src/slots.ts` | stessa migrazione |
| prenotazione | `book_appointment()`: atomica, idempotente, lock per operatore + vincolo di esclusione | stessa migrazione |
| annullamento | `cancel_appointment()`: cliente solo i propri e fuori dalla finestra; staff sempre | stessa migrazione |
| dashboard | `day_stats()`, solo staff | stessa migrazione |
| cancellazione account | `delete_my_account()`: elimina l'utente di Auth; la scheda del salone resta, anonima; annulla gli appuntamenti futuri | stessa migrazione |
| profili | trigger `on_auth_user_created` | stessa migrazione |
| realtime | `appointments` nella publication `supabase_realtime` (l'agenda per ora aggiorna ogni 15 s; l'abbonamento realtime arriverà con l'agenda completa) | stessa migrazione |
| client | `packages/api/src/supabase/` (stessa interfaccia del backend finto) | |
| dati demo | `supabase/seed.sql` (date relative al giorno in cui lo esegui) | |
| file unico per lo SQL Editor | `supabase/demo-setup.sql` (generato: `pnpm demo-sql`) | |

**Accesso nella demo:**
- **Clienti:** "anonymous sign-in" di Supabase, più nome e telefono salvati nel profilo. Niente SMS, che costano, e niente email: con il piano gratuito le email partono solo verso i membri del team del progetto.
- **Staff:** email + password di un account demo, con le credenziali mostrate nella pagina d'accesso del gestionale.
- **In un prodotto vero:**
  - clienti con OTP via SMS, Apple, Google o link email (con un SMTP proprio, per esempio Resend);
  - captcha (Turnstile) sull'accesso anonimo e sulla registrazione.

**Non attivi nella demo:** promemoria WhatsApp (servono un account Meta Business e un costo a messaggio), email transazionali, pagamenti. Non c'è Stripe: niente acconti né abbonamento nel modello single-tenant della demo.

## Come è stato verificato

La rete di questo ambiente blocca `*.supabase.co` e anche i registri delle immagini Docker, quindi **Supabase locale (`supabase start`) non si può avviare qui**. Verifiche fatte:
- **Postgres 16 locale + stub di Supabase** (`supabase/tests/`: ruoli `anon` e `authenticated`, `auth.users`, `auth.uid()`). Sono 41 controlli che si verificano da soli (`pnpm test:db`), tra cui:
  - una seconda utenza non vede niente;
  - un anonimo non prenota;
  - il telefono non verificato non dà accesso allo storico altrui;
  - ora legale;
  - annullamento;
  - cancellazione dell'account.
- **`demo-setup.sql` + `demo-staff.sql` provati su un database vuoto**, come li useresti tu nello SQL Editor:
  - lo staff vede i 17 appuntamenti di prova e le statistiche;
  - un anonimo vede 36 orari liberi per domani e 0 appuntamenti.
- **Client Supabase:**
  - typecheck;
  - test sulla traduzione di righe ed errori (`map.test.ts`);
  - build web che chiama davvero il tuo progetto: con la rete bloccata mostra "Non riusciamo a caricare il salone / Riprova", senza crash (timeout di 12 s sulle chiamate).
- **End-to-end (`pnpm e2e`):** sul backend finto, che applica le stesse regole.

**Da verificare sul progetto vero** (non è stato possibile da qui):
- la lettura dei dati;
- l'accesso anonimo;
- la prenotazione;
- l'accesso del titolare;
- `delete_my_account()`: su Supabase il ruolo `postgres` può cancellare da `auth.users`, ma va provato.

I passaggi sono nel README, sezione "Demo su Supabase".

## Checklist di sicurezza

- [x] segreti solo in variabili d'ambiente; nel repository ci sono solo URL e chiave **pubblica** (publishable), che sono fatti per stare nell'app; `.env*` è in `.gitignore`
- [x] input validato sul server: tipi e vincoli `check` in Postgres, regole in `book_appointment()` / `cancel_appointment()`, codici d'errore stabili
- [x] autorizzazione su ogni lettura e scrittura (RLS + funzioni), testata con un secondo utente, con un anonimo e con un telefono "rubato"
- [ ] rate limit: Supabase limita già l'accesso anonimo per IP (30 all'ora di default). Per un prodotto vero servono il captcha e limiti sulle prenotazioni per utente
- [x] webhook con firma: nessun webhook nella demo (la tabella `webhook_events` è pronta per Stripe e Meta)
- [ ] upload: nessun upload nella demo (foto del salone e avatar arriveranno con Supabase Storage, con limiti di tipo e dimensione)
- [x] nessun dato utente in URL o log (gli id degli appuntamenti sono UUID; nessun log di dati personali)
- [x] dipendenze controllate (`pnpm audit --prod`, 2026-11-04): 2 moderate in `glob` e `minimatch`, dentro la CLI di Expo (strumenti di build, non nel codice dell'app). Si risolvono aggiornando Expo quando esce la patch
- [ ] privacy policy con l'elenco dei fornitori (Supabase; poi Resend, Meta, Sentry): da scrivere per il prodotto vero; per il portfolio basta una nota "demo con dati inventati"

## Integrazioni future (per il prodotto vero)

| integrazione | API ufficiale | note |
| --- | --- | --- |
| WhatsApp | WhatsApp Business Platform (Cloud API) | account Meta Business del barbiere, template approvati, costo a messaggio |
| email | Resend | dominio verificato (SPF, DKIM, DMARC); SMTP personalizzato anche per le email di Supabase Auth |
| SMS OTP | Supabase Auth + Twilio o MessageBird | circa 0,09 $ a SMS; limiti e captcha contro l'abuso |
| push | Expo Push | token in `push_tokens` |
| acconti | Stripe (account del barbiere) | fase 2 |

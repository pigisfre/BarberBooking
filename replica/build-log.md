# Build log

Una riga per schermata: ID, data, stato, cosa manca, cosa è stato più difficile del previsto.
Backend: **finto** (`packages/api/src/fake`, stesse regole e codici d'errore di `book_appointment()`), finché `/replica-backend` non collega Supabase.

## 2026-11-04: shell + vertical slice

| ID | schermata | stato | manca | note |
| --- | --- | --- | --- | --- |
| S04+S05 | home salone + servizi (cliente) | partial | foto di copertina, staff in home, link/QR | la home è il salone (single-tenant) |
| S06 | scelta operatore | done | | si salta con un solo operatore o `features.multiStaff = false` |
| S07 | giorno e orario | done | lista d'attesa se pieno (fase 2) | slot per fascia; giorni di chiusura attenuati |
| S02 | accesso cliente | partial | OTP SMS, Apple, Google, link email | finto: nome + telefono, in linea nel riepilogo per non aggiungere un passaggio |
| S08 | riepilogo e conferma | done | acconto online (fase 2) | doppio tap protetto da `idempotencyKey` (verificato in e2e) |
| S09 | confermato | done | aggiungi al calendario, indicazioni | spunta con molla; dissolvenza con riduci movimento |
| S10 | i miei appuntamenti | partial | sposta (S11) | annulla con conferma e finestra di 2 ore |
| S16 | profilo | partial | elimina account (serve il backend) | |
| S21 | accesso staff | partial | password / link email | finto: solo email |
| S22 | Oggi (dashboard) | partial | incassi reali (cassa, fase 2) | appuntamenti vs settimana scorsa, incasso previsto, prossimi clienti |
| S23 | agenda giorno | partial | trascinamento, allungamento, crea da slot vuoto (S25), realtime | sola lettura; colonne per operatore, pause, linea dell'ora; telefono: un operatore alla volta |
| S27, S29, S30, S31-S32-S40-S44 | clienti, servizi, staff, impostazioni | stub | tutto | pagine segnaposto che dicono cosa arriva |

Copertura: 13 schermate su ~42 in perimetro hanno codice (8 utilizzabili, 5 segnaposto). Parity (`parity.py`): **19.9**, must-have **4 su 27**.

### Verifiche
- `packages/core`: 18 test (fusi orari e ora legale, regole, primo disponibile, formattazione).
- `packages/api`: 14 test sullo store finto, gli stessi casi dei test SQL dello schema.
- `packages/ui`: 14 test (colori del brand TypeScript = Python su 6 brand; tema chiaro e scuro).
- Typecheck di tutti i pacchetti e delle due app.
- Build web di entrambe le app (`expo export`).
- `e2e/slice.mjs` (Playwright, 12 controlli):
  - il cliente prenota taglio + barba con Marco; il doppio tap crea un solo appuntamento;
  - lo slot sparisce dagli orari liberi;
  - il titolare entra nel gestionale e trova la prenotazione nella colonna di Marco;
  - anonimi e clienti non leggono l'agenda;
  - nessun errore in console.
- Screenshot a 390 e 1440 px in `replica/clone-screens/`. Non ci sono screenshot dell'originale, quindi `imgdiff.py` non ha riferimenti: vale solo la parity delle funzioni.

### Più difficile del previsto
- **Rete:** `docs.expo.dev` e `api.expo.dev` sono bloccati in questo ambiente. Le versioni compatibili vengono da `node_modules/expo/bundledNativeModules.json` invece che da `expo install`.
- **Serializzazione della config di Expo:** trasforma i `null` di `brand.json` in `{}`, e questo faceva crashare il tema scuro. Ora `brands/load.js` toglie i `null` e il tema accetta solo stringhe; c'è un test dedicato. Attenzione: dopo aver cambiato un `brand.json` serve `expo export --clear`, perché Metro tiene in cache la configurazione.
- **Stack su web:** tiene montate le schermate precedenti, quindi i `testID` vanno resi unici per schermata.
- **Pressable animato:** con lo stile sulla vista interna, i layout in percentuale (griglia degli orari) non funzionavano. Ora lo stile sta sul `Pressable` animato.

### Scelte diverse dall'architettura
- **Styling:** si usa uno StyleSheet con i token (`useTheme()`), non NativeWind. NativeWind stabile (4.x) è pensato per Tailwind 3, mentre la versione per Tailwind 4 è ancora RC. Su un prodotto da vendere è meglio non dipendere da una RC né aggiungere una pipeline Babel/CSS in più. Il risultato non cambia: i componenti usano solo ruoli dei token, e `tailwind.tokens.js` resta disponibile se si vorrà passare a NativeWind.
- **Navigazione del gestionale:** è una struttura nostra (barra laterale su tablet e desktop, barra in basso sul telefono) con `Slot` di Expo Router, uguale su tutte le piattaforme.

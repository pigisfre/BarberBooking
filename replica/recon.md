# Recon map: BarberApp / BarberApp Pro (Micrologic s.r.l.), web + iOS + Android

Scope: entrambi i lati del prodotto.
- **Lato salone (gestionale):** agenda, prenotazioni online, staff, servizi, clienti, cassa, magazzino, analytics, promemoria e marketing, fidelity, pagamenti.
- **Lato cliente:** app di prenotazione e pagina di prenotazione web.
- **Aggiunta nostra (non nell'originale):** console centrale della piattaforma SaaS (gestione dei saloni abbonati), perché il prodotto va venduto.

For: SaaS da vendere a barbieri e parrucchieri, mercato Italia.
Date: 2026-11-04
Method: solo fonti pubbliche, lette tramite ricerca web. Le pagine del sito e degli store non si sono potute aprire direttamente (rete dell'ambiente), quindi **non ci sono screenshot di riferimento** in `replica/screens/`. Schermate e layout qui sotto sono **dedotti** dalle funzioni dichiarate e dalle convenzioni della categoria, e marcati come tali. Da completare con screenshot degli store e dei video pubblici.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing site (Pro) | https://www.barberapppro.it/ | "prenotazioni, promemoria e cassa in un'unica app"; 950+ saloni (dato del venditore) |
| 2 | funzionalità (Pro) | https://www.barberapppro.it/funzionalita/ | promemoria WhatsApp serali, analytics, magazzino, cassa |
| 3 | agenda e prenotazioni | https://www.barberapp.it/agenda-e-prenotazioni/ | promemoria, acconto/prepagamento in app, marketing email/WhatsApp, "fino a -70% no-show" (dato del venditore) |
| 4 | cassa | https://www.barberapp.it/cassa/ | a pagamento; sconti per cliente; QR sullo scontrino per scaricare l'app; modalità agenda+cassa+magazzino in una schermata |
| 5 | pagamenti in app | https://www.barberapp.it/pagamenti-in-app/ | Stripe; commissioni da 1,5% + 0,25 € a transazione |
| 6 | analytics | https://www.barberapp.it/analytics/ | vendite, incassi, rendimento per operatore, confronto periodi; servizi più redditizi, fasce orarie più richieste |
| 7 | landing / abbonamenti | https://www.barberapp.it/landing-page/ , https://www.barberapp.it/abbonamenti/ | elenco funzioni: agenda digitale, sito web, analytics, magazzino, cassa, porta un amico e fidelity, app personalizzate, prenotazioni online; canone fisso; 30 giorni gratis senza carta; 0 commissioni |
| 8 | termini | https://www.barberapp.it/termini/ , https://www.barberapp.it/terminibusiness/ | Micrologic S.r.l.; marchi collegati BookApp, TimeBeauty, FitnessTime (stessa piattaforma multi-verticale) |
| 9 | App Store cliente | https://apps.apple.com/it/app/barberapp/id1228283983 | gratuita; cerca salone, registrati, prenota, promemoria; valutazioni alte (numeri variano per paese) |
| 10 | App Store Pro | https://apps.apple.com/it/app/barberapp-pro/id1491592321 | automatizza prenotazioni e fidelizza; calendario collegato a Instagram e Google; WhatsApp automatico; magazzino; note versione: coda dinamica, voucher visibili nelle prenotazioni |
| 11 | Google Play cliente | https://play.google.com/store/apps/details?id=com.softwareline.barbier | stessa app cliente |
| 12 | pagina prenotazione web di un salone | https://bookappweb.it/barberia1928/ | pagina pubblica per salone, prenotazione da browser |
| 13 | terze parti | https://mwm.ai/apps/barberapp/1228283983 , https://www.ossblog.it/barberapp-per-prenotare-dal-tuo-barbiere-con-lo-smartphone/ | "mettiti in coda" se la fascia è piena; scelta operatore, servizio, data e ora |
| 14 | listing | https://www.capterra.com/p/10005442/BarberApp/ | canone fisso, versione gratuita e prova (dati aggregati, da verificare) |

Da aggiungere quando la rete lo consente: screenshot degli store (iOS, Android), video demo pubblici, tabella prezzi ufficiale.

## Core loop

Il cliente prenota da app o web un servizio con un barbiere in uno slot libero, riceve il promemoria WhatsApp e si presenta. Il barbiere vede tutto nell'agenda, incassa in cassa e misura i risultati. Il salone paga per questo: **meno telefonate, meno no-show, agenda sempre piena**.

## Screens

Legenda piattaforma: **C** = app cliente (iOS/Android), **W** = web pubblico, **B** = gestionale (web + iOS/Android/tablet), **A** = console piattaforma (web, nostra).
Tutte le schermate sono *dedotte* (vedi Method).

### Cliente (C, W)

| ID | screen | route / how to reach | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| S01 | Onboarding | primo avvio app | presentare l'app, permessi notifiche e posizione | carousel, button | first run |
| S02 | Accesso / registrazione | dopo onboarding o al momento di prenotare | account (fonte 9: registrazione obbligatoria nell'originale) | tel/OTP, email, Apple/Google | empty, error, OTP scaduto |
| S03 | Cerca salone | tab Home | trovare il salone per nome, città, vicino a me, link o QR | search, mappa, lista card salone | empty, loading, nessun risultato, posizione negata |
| S04 | Pagina salone | tap su card, link pubblico, QR | info, orari, indirizzo, foto, servizi, staff | header, tabs, lista servizi, CTA Prenota | filled, chiuso oggi, salone sospeso |
| S05 | Scegli servizi | Prenota | uno o più servizi con durata e prezzo | lista selezionabile, totale | none selected, filled |
| S06 | Scegli operatore | dopo servizi | barbiere specifico o "qualsiasi" | avatar list | un solo operatore (salta step) |
| S07 | Scegli giorno e orario | dopo operatore | slot liberi | date strip/calendario, griglia slot | loading, nessuno slot (→ coda), slot appena occupato |
| S08 | Riepilogo e conferma | dopo slot | note, voucher, acconto/prepagamento | riepilogo, campo note, voucher, pagamento Stripe | pagamento rifiutato, acconto richiesto |
| S09 | Prenotazione confermata | dopo conferma | conferma, aggiungi al calendario, indicazioni | success, buttons | |
| S10 | I miei appuntamenti | tab Appuntamenti | prossimi e passati | lista, segmenti | empty, filled |
| S11 | Dettaglio appuntamento | tap su appuntamento | sposta, annulla, ripeti, indicazioni | card, actions | fuori finestra di cancellazione |
| S12 | Mettiti in coda | da S07 se pieno | lista d'attesa / coda dinamica (fonti 10, 13) | form, stato coda | in coda, posto liberato, scaduto |
| S13 | Saloni preferiti | tab o da S04 | accesso rapido | lista | empty |
| S14 | Fidelity, voucher, porta un amico | tab Profilo | punti/voucher, codice invito (fonte 7, 10) | card voucher, codice condivisibile | nessun voucher |
| S15 | Notifiche | campanella | promemoria, conferme, promo | lista | empty |
| S16 | Profilo e impostazioni | tab Profilo | dati, consensi marketing, elimina account | form, toggle | |
| S17 | Pagina prenotazione web | `/<salone>` pubblico (fonte 12) | prenotare senza app, anche da Instagram/Google (fonte 10) | stesso flusso S04-S09 in web | guest con telefono/OTP |

### Gestionale salone (B)

| ID | screen | route / how to reach | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| S20 | Registrazione salone | sito marketing → prova 30 gg (fonte 7) | creare l'account del salone senza carta | wizard: salone, orari, servizi, staff | step error, abbandono a metà |
| S21 | Login staff | app / web | accesso titolare e collaboratori | email+password, magic link | error, account sospeso |
| S22 | Home / oggi | dopo login | KPI del giorno, prossimi clienti, alert | stat tiles, lista | giorno vuoto |
| S23 | Agenda giorno | menu Agenda | colonne per operatore, slot, drag & drop | calendar grid, appointment block | vuota, piena, sovrapposizione |
| S24 | Agenda settimana / lista | toggle vista | panoramica | week grid, list | |
| S25 | Nuovo / modifica appuntamento | tap su slot o "+" | crea per telefono o walk-in | ricerca cliente, servizi, operatore, ora, note | conflitto, cliente nuovo |
| S26 | Blocchi, pause, ferie | da agenda o staff | indisponibilità | modal, ricorrenza | |
| S27 | Clienti | menu Clienti | rubrica, ricerca, filtri | table/list, search | empty, migliaia di righe |
| S28 | Scheda cliente | tap cliente | storico, spesa, no-show, note, consensi | tabs, timeline | |
| S29 | Servizi e categorie | Impostazioni | durata, prezzo, operatori abilitati | lista ordinabile, form | empty |
| S30 | Staff | Impostazioni | orari per operatore, servizi, permessi, (commissioni: guess) | lista, form, weekly hours | |
| S31 | Orari e chiusure | Impostazioni | orari salone, festivi | weekly editor, date list | |
| S32 | Regole prenotazione online | Impostazioni | anticipo minimo, finestra cancellazione, intervallo slot, acconto, approvazione manuale | form, toggle | |
| S33 | Cassa | menu Cassa (fonte 4) | chiudi conto: servizi + prodotti, sconti, metodo di pagamento | carrello, tastierino, metodi | conto vuoto, pagamento parziale |
| S34 | Movimenti e chiusura giornata | da Cassa | storico incassi, chiusura | table, totali | |
| S35 | Magazzino | menu Magazzino (fonte 2) | prodotti, giacenze, carichi, ordini, vendite collegate | table, form, alert scorte | sotto scorta |
| S36 | Analytics | menu Statistiche (fonte 6) | incassi, servizi top, fasce orarie, rendimento operatori, confronto periodi | charts, period picker | pochi dati |
| S37 | Marketing e automazioni | menu Marketing (fonte 3) | promemoria WhatsApp, campagne email/WhatsApp/push, compleanno, riattivazione | lista campagne, editor, segmenti | |
| S38 | Fidelity, voucher, porta un amico | menu Marketing (fonte 7, 10) | regole punti, voucher, gift card, referral | form, lista | |
| S39 | Coda / lista d'attesa | da agenda (fonte 10) | gestire chi aspetta uno slot | lista, azione "assegna" | |
| S40 | Canali di prenotazione | Impostazioni | link pagina, QR, Instagram, Google, mini sito (fonte 7, 10) | link copy, QR, anteprima | |
| S41 | Pagamenti online | Impostazioni (fonte 5) | collega Stripe, acconti | onboarding Stripe Connect | non collegato |
| S42 | Abbonamento | Impostazioni | piano, fatture, metodo di pagamento, disdetta | piano card, portal | trial, scaduto |
| S43 | Vista combinata | toggle da Impostazioni (fonte 4) | agenda + cassa + magazzino in una schermata (tablet/desktop) | split view | |
| S44 | Impostazioni generali | menu | profilo salone, sedi, ruoli, notifiche | form | |

### Console piattaforma (A, nostra)

| ID | screen | purpose |
| --- | --- | --- |
| S50 | Saloni (tenant) | lista, stato (trial, attivo, scaduto), ricerca |
| S51 | Dettaglio salone | piano, utilizzo, contatti, note supporto, sospendi |
| S52 | Piani e prezzi | piani, funzioni incluse, coupon |
| S53 | Metriche piattaforma | MRR, trial → pagante, churn, prenotazioni totali |
| S54 | Messaggi e template | costo WhatsApp/SMS per salone, template approvati |

## Flows

```
F01 Cliente prenota dall'app
    S03 -> S04 -> S05 -> S06 -> S07 -> S08 -> S09
    happy path clicks: ~7 (salone già tra i preferiti: ~5)
    edge: nessuno slot (-> S12), slot preso mentre conferma, acconto rifiutato,
          servizi multipli con operatori diversi, salone chiuso, cambio ora legale

F02 Cliente prenota dal web senza app (link Instagram/Google)
    S17 (servizio -> operatore -> slot -> telefono + OTP -> conferma)
    happy path clicks: ~6
    edge: numero già registrato, OTP non arriva

F03 Cliente sposta o annulla
    S10 -> S11 -> S07 -> S09   |   S10 -> S11 -> annulla
    edge: fuori finestra di cancellazione, acconto da rimborsare o trattenere

F04 Cliente in coda
    S07 (pieno) -> S12 -> notifica posto libero -> S08 -> S09
    edge: due clienti accettano lo stesso posto

F05 Promemoria automatico
    job serale -> WhatsApp ai clienti del giorno dopo -> conferma/annulla dal link
    edge: numero non WhatsApp (fallback SMS/push), opt-out

F06 Salone si registra e va online
    S20 (salone -> orari -> servizi -> staff) -> S40 copia link -> S22
    happy path: < 10 minuti è l'obiettivo

F07 Barbiere inserisce appuntamento telefonico o walk-in
    S23 tap slot -> S25 -> salva
    edge: cliente nuovo, sovrapposizione, servizio non abilitato per l'operatore

F08 Barbiere chiude il conto
    S23 appuntamento -> S33 (servizi precaricati + prodotti + sconto) -> pagato -> S34
    edge: prodotto senza giacenza, pagamento misto, acconto già versato

F09 Titolare controlla l'andamento
    S36 periodo -> confronta -> per operatore

F10 Titolare lancia una campagna
    S37 segmento (es. non viene da 60 giorni) -> messaggio -> invia -> risultati

F11 Salone attiva i pagamenti online
    S41 -> onboarding Stripe -> S32 acconto obbligatorio

F12 Piattaforma: trial -> pagante
    S20 -> 30 giorni -> S42 checkout -> attivo   (scadenza -> sola lettura)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | all |
| Input / phone + OTP | text, phone, OTP | empty, error, disabled | S02, S17, S25 |
| Salon card | list, map pin | | S03, S13 |
| Service row | selectable, editable | selected, disabled | S05, S29, S33 |
| Staff avatar picker | single, "qualsiasi" | selected | S06, S25 |
| Date strip + slot grid | mobile, desktop | loading, no slots, taken | S07, S17, S25 |
| Calendar grid | day per staff, week, list | drag, resize, conflict | S23, S24, S43 |
| Appointment block | per stato: confermato, da confermare, pagato, no-show, annullato | | S23, S24 |
| Modal / bottom sheet | | | S25, S26 |
| Data table | with search, filters, pagination | empty, loading | S27, S34, S35, S50 |
| Stat tile, chart | line, bar | empty | S22, S36, S53 |
| Checkout cart + keypad | | | S33 |
| Toast, banner | info, success, error | | all |
| Tab bar (mobile), sidebar (desktop) | | | all |

## Inferred data model

```
Tenant (salone)  id, name, slug, address, geo, phone, timezone, logo, photos,
                 plan, trial_ends_at, status
                 evidence: S04, S20, fonte 7 (prova 30 gg) | confidence: high

Location         id, tenant_id, address, hours          multi-sede | confidence: guess

StaffMember      id, tenant_id, user_id, name, avatar, role (owner|admin|staff),
                 weekly_hours, service_ids, commission_pct (guess)
                 evidence: S06, analytics per operatore (fonte 6) | confidence: high

Service          id, tenant_id, category, name, duration_min, price_cents, staff_ids,
                 online_bookable | confidence: high

Customer         id, tenant_id, user_id?, name, phone, email, birthday, notes,
                 marketing_consent, no_show_count
                 evidence: S28, promemoria WhatsApp (fonte 2) | confidence: high

User (cliente)   id, phone, email, name, favorites    account globale tra saloni
                 evidence: fonte 9 (cerca il tuo salone, registrati) | confidence: medium

Appointment      id, tenant_id, customer_id, staff_id, start_at, end_at, status
                 (pending|confirmed|completed|cancelled|no_show), source (app|web|staff),
                 notes, deposit_cents, voucher_id
                 + AppointmentService(appointment_id, service_id, price_cents, duration)
                 confidence: high

TimeBlock        id, staff_id, start_at, end_at, reason (pausa|ferie|altro) | high

WaitlistEntry    id, tenant_id, customer_id, service_ids, staff_id?, date, status
                 evidence: fonte 10, 13 (coda dinamica) | confidence: medium

Sale             id, tenant_id, appointment_id?, customer_id?, staff_id, total_cents,
                 discount_cents, method (cash|card|online|mixed), closed_at
                 + SaleLine(sale_id, service_id|product_id, qty, price_cents)
                 evidence: fonte 4 | confidence: high

Product          id, tenant_id, name, sku, price_cents, cost_cents, stock_qty,
                 min_stock | confidence: high
StockMovement    id, product_id, qty, type (carico|vendita|rettifica|ordine) | medium

Voucher          id, tenant_id, customer_id?, code, value_cents|percent, expires_at,
                 redeemed_at | evidence: fonte 10 | medium
LoyaltyAccount   customer_id, points | guess (fonte 7 dice "fidelity", meccanica ignota)
Referral         referrer_customer_id, referred_customer_id, reward_voucher_id | medium

Campaign         id, tenant_id, channel (whatsapp|email|push), segment, body,
                 scheduled_at, stats | medium
MessageLog       id, tenant_id, customer_id, channel, template, status, cost_cents | guess

Payment          id, tenant_id, appointment_id, stripe_payment_intent, amount, fee,
                 status | evidence: fonte 5 | high

Subscription     tenant_id, plan, stripe_subscription_id, status | high (nostra)
```

Relationships: Tenant 1-n StaffMember, Service, Customer, Appointment, Product, Campaign. Appointment n-n Service. Customer n-1 User (lo stesso cliente può essere cliente di più saloni). Sale 0-1 Appointment.

## Feature matrix

Vedi `features.csv`. Must: 31, should: 20, could: 14, skip: 3 (totale 68, di cui 3 aggiunte nostre con `original=no`). Il tool di parity conta 62 righe (esclude skip e aggiunte nostre): 29 must da fare.

## Out of scope (cannot or should not be cloned)

- La **base clienti e i saloni** già su BarberApp (950+ dichiarati): è la loro rete, non una funzione.
- Il **brand**, i nomi BarberApp, BookApp, TimeBeauty, il loro logo, colori e testi.
- **App personalizzate per singolo salone** (fonte 7: app con il marchio del salone): servizio su misura, non una funzione. Rimandato.
- **Scontrino fiscale / registratore telematico**: in Italia richiede un RT omologato o un servizio certificato di terzi. Non lo ricostruiamo: integrazione futura con un fornitore. La cassa resta "gestionale", non fiscale.

## Size

Screens 49 (17 cliente, 25 gestionale, 5 console, più varianti per piattaforma), flows 12, entities ~20.

Hard parts:
1. **Disponibilità e concorrenza degli slot**: durate multiple, più operatori, pause, ferie, coda, due persone sullo stesso slot (vincolo a livello database).
2. **Tre piattaforme**: web + iOS + Android, per due app diverse (cliente e gestionale). Serve una base di codice condivisa (es. Expo/React Native + web), altrimenti diventano sei progetti.
3. **WhatsApp**: l'API ufficiale di Meta (WhatsApp Business Platform) richiede template approvati e ha un costo per conversazione: va incluso nel prezzo o nei crediti.
4. Pagamenti per salone (Stripe Connect), multi-tenant e GDPR, store review di Apple e Google.

Size: **XL per tutto il perimetro** → va ridotto. Proposta:
- **MVP (L, circa un trimestre):** tutte le righe `must`: prenotazione cliente (app + web), agenda, staff, servizi, clienti, promemoria, abbonamento SaaS e console.
- **Fase 2:** cassa, magazzino, analytics avanzate, marketing, fidelity, coda, pagamenti online.

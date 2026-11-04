# Componenti: BarberBooking

Sistema nostro, costruito sulle regole di `apple-design` e tradotto per Expo / React Native (+ web tramite react-native-web).
Token in `tokens.json`; le classi Tailwind/NativeWind usano solo i ruoli (`bg-surface`, `text-muted`, `rounded-md`), mai valori esadecimali.
Icone: Lucide (MIT). Font: di sistema.

## Regole valide per tutti i componenti

- **Il feedback parte alla pressione, non al rilascio** (`onPressIn`). L'elemento scala a 0.97 subito e torna con la molla `snappy`. L'azione scatta al rilascio; se il dito esce dall'area la pressione si annulla, con un margine di 10pt (`hitSlop`).
- **Le animazioni si possono interrompere.** Le molle di Reanimated partono sempre dal valore attuale sullo schermo. Niente transizioni CSS o keyframe per ciò che si trascina; niente blocco dei tocchi durante un'animazione.
- **Rimbalzo solo dopo un gesto con slancio** (molla `momentum`): rilascio in agenda, lancio di un pannello. Tutto il resto usa `default` o `snappy`, senza rimbalzo.
- **Entrata e uscita dalla stessa parte.** Un pannello che sale dal basso esce verso il basso; un menu si apre dal pulsante che lo ha aperto.
- **Accessibilità:**
  - **riduci movimento** (`useReducedMotion`): dissolvenza di 200ms al posto di scorrimenti e rimbalzi;
  - **riduci trasparenza** (`AccessibilityInfo.isReduceTransparencyEnabled`): materiali pieni (`surface`);
  - **testo più grande**: si rispetta il Dynamic Type, il layout cresce col testo e non si tronca;
  - **lettore di schermo**: ogni elemento interattivo ha `accessibilityRole`, `accessibilityLabel` e `accessibilityState`;
  - **area di tocco** minima 44×44.
- **Feedback aptico** (`expo-haptics`) solo nei momenti indicati in `tokens.json → haptics`, sullo stesso frame dell'animazione.
- **Angoli:** `borderCurve: 'continuous'` su iOS.
- **Web:** `:hover` sui puntatori fini, `:focus-visible` con anello di 2px `accent` + 2px di distanza, navigazione completa da tastiera.

## Primitivi

```
Button
  variants  primary (bg accent, text on-accent), secondary (bg fill, text text),
            tinted (bg accent-tint, text accent-text), ghost (text accent-text), danger (bg danger, text on-danger)
  sizes     sm 32, md 44, lg 52 (CTA in basso nelle schermate di prenotazione)
  states    default, pressed (scale 0.97 + opacita 0.9), focus-visible, disabled (opacita 0.4),
            loading (spinner al posto dell'icona, etichetta mantenuta per il lettore di schermo)
  tokens    radius sm (md per lg), type headline, gap 8 icona-testo
  a11y      role button, accessibilityState {disabled, busy}
  used on   tutte

IconButton
  sizes     36 (area di tocco 44 con hitSlop)
  variants  plain, filled (bg fill), on-material (sopra chrome)
  a11y      accessibilityLabel obbligatorio
  used on   nav bar, agenda, schede

TextField
  parts     label sopra (footnote, text-muted), campo, testo d'aiuto o errore sotto
  states    default (border border-input 1px), focus (border accent 2px), error (border danger + messaggio),
            disabled, read-only
  tokens    altezza 44, radius sm, padding 12/16, type body, bg surface
  a11y      label collegata; errore annunciato (accessibilityLiveRegion polite)
  validazione  inline mentre si scrive, non solo all'invio
  used on   S02, S08, S16, S25, S28, S29-S32

PhoneField
  = TextField con prefisso paese (+39 di default), tastiera numerica, formattazione mentre si scrive
  used on   S02, S17, S25

OtpField
  6 caselle, autocompletamento dagli SMS (textContentType oneTimeCode / autoComplete sms-otp),
  incolla tutto il codice in un colpo, timer "Invia di nuovo" a 30s, errore con vibrazione warning
  used on   S02, S17

Switch
  nativo (Switch di RN) con trackColor accent. Su web, input checkbox con role switch
  used on   S16, S32, S29

SegmentedControl
  2-4 opzioni, cursore che scorre con molla snappy, aptico select
  used on   S10 (Prossimi / Passati), S23-S24 (Giorno / Settimana / Lista), S36 (periodo)

Chip
  variants  filter (toggle), suggestion
  states    off (bg fill), on (bg accent-tint, text accent-text, icona spunta), disabled
  used on   S07 (fasce del giorno: mattina / pomeriggio / sera), S27 filtri

Avatar
  sizes     28, 40, 56, 80
  fallback  iniziali su staff-N-bg / staff-N-ink (colore stabile per operatore)
  used on   S06, S23, S30, S28

StatusPill
  confermato (accent-tint / accent-text), da confermare (warning-tint / warning),
  completato (success-tint / success), no-show (danger-tint / danger), annullato (fill / text-muted, barrato)
  sempre con testo, mai solo colore
  used on   S10, S11, S23, S28

Skeleton
  blocchi fill con pulsazione di opacita lenta (non shimmer); con riduci movimento: statico
  used on   liste e agenda durante il caricamento

EmptyState
  icona Lucide 32 in text-muted, titolo (title3), una riga di spiegazione, al massimo un'azione
  testi scritti da noi, specifici per schermata ("Nessun appuntamento in arrivo. Prenota il prossimo taglio.")
  used on   S10, S15, S27, S29, S23 (giorno libero)

Toast
  in alto, sotto la safe area, materiale chrome; entra dall'alto ed esce in alto (si scorre via verso l'alto)
  tipi      successo, errore, info; resta 4s, oppure finche non si tocca se c'e un'azione ("Annulla")
  a11y      annunciato dal lettore di schermo
  used on   conferme veloci nel gestionale (spostato, salvato)

Banner
  in linea, sopra il contenuto: offline (warning-tint), sola lettura, errore di sincronizzazione
  used on   S22, S23
```

## Navigazione e superfici

```
NavBar
  compact   titolo grande (largeTitle) che si riduce a titolo inline (headline) scorrendo;
            materiale chrome; niente riga di separazione: sfumatura di bordo solo quando il contenuto passa sotto
  wide      titolo title1 a sinistra, azioni a destra, nessun titolo grande
  used on   tutte

TabBar (compact)
  materiale chrome sotto il contenuto, 49 + safe area, 4-5 voci con icona + etichetta (caption)
  Cliente:  Prenota, Appuntamenti, Profilo
  Salone:   Oggi, Agenda, Clienti, Altro
  etichette specifiche, non generiche ("Appuntamenti", non "Home")

Sidebar (regular e wide)
  248 di larghezza, bg bg (piu pesante del contenuto = struttura), voci 36 con icona; voce attiva bg fill
  regular: si apre e chiude; wide: sempre visibile
  used on   gestionale su tablet e desktop

Sheet (pannello dal basso)
  materiale sheet, radius lg in alto, maniglia 36×5, sfondo attenuato da scrim
  gesti     segue il dito 1:1 rispettando il punto di presa; al rilascio proietta lo slancio
            (decelerationRate 0.998) e sceglie il punto di arresto piu vicino (mezzo, pieno, chiuso);
            effetto elastico oltre il limite (rubberband 0.55); la velocita del dito passa alla molla sheet
  dettagli  apre dal basso, chiude verso il basso; il contenuto dietro si abbassa e scala a 0.94 se e un
            compito modale; nessuno scrim se e un pannello parallelo (agenda + dettaglio su tablet)
  web       su wide diventa un pannello laterale a destra (entra ed esce da destra)
  libreria  @gorhom/bottom-sheet su native, componente nostro su web
  used on   S08 riepilogo, S11 dettaglio, S25 nuovo appuntamento (compact), S26 pausa

Dialog (conferma)
  SOLO per azioni distruttive e irreversibili: annulla appuntamento, elimina account, elimina servizio
  pulsante distruttivo in danger, l'altro "Mantieni" (non "Annulla", che si confonde con annullare l'appuntamento)
  native: Alert di sistema; web: dialog con focus trap e chiusura con Esc
  per il resto: azione immediata + Toast "Annulla" per tornare indietro

ListGroup / ListRow (stile elenco raggruppato)
  gruppi su bg con righe surface, radius md sul gruppo, separatori sottili rientrati dopo l'icona
  riga      altezza minima 44, icona opzionale, titolo + sottotitolo, accessorio a destra
            (chevron, valore, switch, spunta)
  used on   S16, S29-S32, S40, S44, S28
```

## Componenti di dominio

```
SalonHeader (S04, home dell'app cliente)
  foto di copertina a tutta larghezza con il titolo grande sopra; scorrendo la foto rallenta
  (parallasse leggera, disattivata con riduci movimento) e la nav bar diventa materiale
  sotto: indirizzo (tocco = mappe), orari di oggi ("Aperto fino alle 19:00" / "Chiuso oggi"), telefono, Instagram

ServiceRow (S05, S29)
  nome (headline), durata e prezzo (subhead text-muted, numeri tabulari), descrizione su due righe
  selezione multipla: spunta a destra, riga con bg accent-tint quando scelta, aptico select
  in basso un pulsante fisso "Continua · 45 min · 30,00 €" che si aggiorna mentre si sceglie

StaffPicker (S06)
  griglia di Avatar 56 con nome; prima opzione "Primo disponibile"
  se c'e un solo operatore il passaggio si salta (brand.features.multiStaff = false)

DateStrip (S07)
  striscia orizzontale di giorni (lun 12), con lo scorrimento che si ferma sul giorno; il giorno senza slot
  e attenuato ma toccabile ("Nessun orario: entra in lista d'attesa", fase 2)
  il giorno scelto ha un indicatore che scorre con molla snappy dal giorno precedente

SlotGrid (S07, S17, S25)
  griglia di orari (3 colonne compact, 5-6 wide) raggruppati per Mattina / Pomeriggio / Sera
  slot: altezza 44, radius sm, bg fill; scelto: bg accent, text on-accent, aptico select
  caricamento: Skeleton della griglia; nessuno slot: EmptyState + "Prova un altro giorno" (salta al primo libero)
  slot appena preso: lo slot si dissolve, Toast "Questo orario e appena stato prenotato", aptico warning,
  la griglia si ricarica senza spostare lo scroll

BookingSummary (S08)
  Sheet con servizi, operatore, data e ora (numeri tabulari), totale, note facoltative
  CTA "Conferma prenotazione" lg; doppio tap protetto (idempotency_key); in caricamento resta premuto

BookingConfirmed (S09)
  spunta che si disegna (molla default, aptico success sullo stesso frame), riepilogo,
  "Aggiungi al calendario", "Indicazioni"; con riduci movimento: comparsa in dissolvenza

AppointmentCard (S10, S22)
  data grande a sinistra (giorno e mese), servizi, operatore, StatusPill; scorrere a sinistra mostra
  "Sposta" e "Annulla" (Annulla chiede conferma)

AgendaGrid (S23, S24, S43): il componente piu importante del gestionale
  struttura colonna oraria a sinistra (52) + una colonna per operatore (min 160); 64 pt per ora;
            linea dell'ora attuale in danger, che si aggiorna ogni minuto
            compact: un operatore alla volta, si scorre lateralmente tra operatori (la pagina segue il dito)
            regular/wide: tutte le colonne affiancate, intestazione con Avatar fissa in alto
  gesti     tocco su uno spazio vuoto -> nuovo appuntamento a quell'ora (S25)
            pressione lunga su un appuntamento -> lo solleva (scale 1.03, shadow lift, aptico pickup),
            poi segue il dito 1:1 dal punto di presa, si aggancia ogni 5 min, puo cambiare colonna (operatore)
            durante il trascinamento: l'orario di arrivo appare in un'etichetta accanto al dito
            rilascio: molla momentum verso lo slot, aptico drop, salvataggio ottimistico; se il server rifiuta
            (sovrapposizione, pausa), il blocco torna al suo posto con la stessa molla + Toast con il motivo
            maniglia in basso per allungare la durata, agganciata a 5 min
            pizzico per lo zoom verticale (fase 2)
  pause     strisce diagonali tenui su fill, con la causa ("Pausa", "Ferie")
  realtime  le modifiche degli altri dispositivi entrano con una dissolvenza (niente salti)
  a11y      ogni blocco ha l'etichetta "10:00-10:45, Taglio e barba, Mario Rossi, confermato";
            azioni personalizzate del lettore di schermo: Sposta di 15 minuti avanti/indietro, Apri;
            da tastiera (web): frecce per spostare, Invio per aprire

AppointmentBlock (dentro AgendaGrid)
  bg staff-N-bg, testo staff-N-ink, barra di 3pt a sinistra in staff-N-ink
  contenuto in base all'altezza: >= 44: ora + cliente + servizi; < 44: solo cliente
  stati: da confermare = bordo tratteggiato; completato = opacita 0.6; no-show = StatusPill danger

StatTile (S22, S36)
  etichetta (footnote, text-muted), valore display con numeri tabulari, variazione rispetto al periodo
  precedente (success o danger con freccia + testo, non solo colore); quando il valore cambia, i numeri
  scorrono (molla snappy)

CustomerRow e DataTable (S27)
  compact: ListRow con Avatar, nome, ultimo appuntamento, numero di no-show se maggiore di 0
  wide: tabella con intestazione fissa, ordinamento, ricerca istantanea (nessun ritardo di debounce oltre 100ms)

WeeklyHoursEditor (S30, S31)
  una riga per giorno: switch aperto/chiuso + fasce orarie (aggiungi una seconda fascia per la pausa pranzo);
  "Copia su tutti i giorni"
```

## Stato dei primitivi in codice

Il progetto Expo non esiste ancora: si crea in `/replica-build` (passo 1, la shell dell'app). Per verificare il sistema **adesso**, prima di qualsiasi schermata, c'è `replica/design/preview.html`: una pagina che usa solo `tokens.css` e mostra i primitivi principali in chiaro e in scuro. Gli screenshot sono in `replica/design/preview-light.png` e `preview-dark.png`. Nella build questi componenti si riscrivono in `packages/ui` con NativeWind, con gli stessi ruoli e le stesse misure.

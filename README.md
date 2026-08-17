# Autocontrollo HACCP

App collegata al database Supabase (progetto `lgsonyftsrlrfieltwju`).

## Come metterla online con Vercel (consigliato, gratis)

1. Crea un account gratuito su https://vercel.com (puoi accedere con GitHub, Google o email)
2. Crea un account gratuito su https://github.com se non lo hai già
3. Su GitHub: crea un nuovo repository (es. "haccp-app"), carica dentro tutti i file di questa cartella
   (dalla pagina del repository: "Add file" → "Upload files", trascina tutta la cartella)
4. Su Vercel: "Add New..." → "Project" → seleziona il repository appena creato → "Deploy"
5. Vercel rileva automaticamente che è un progetto Vite/React e lo pubblica da solo.
   Non serve configurare nulla: le chiavi Supabase sono già nel codice.
6. Dopo 1-2 minuti Vercel ti dà un link tipo `https://haccp-app-tuonome.vercel.app`
   — quello è il link da dare ai clienti.

## Come provarla sul tuo computer prima di pubblicarla (opzionale)

Se hai Node.js installato:
```
npm install
npm run dev
```
Poi apri il link che appare nel terminale (di solito http://localhost:5173).

## Moduli già collegati al database
- Login (email/password creata su Supabase → Authentication → Users)
- Panoramica (dashboard con alert di ritardo)
- Temperature
- Sanificazione
- Monitoraggio infestanti (con allegato file)

## Moduli ancora da collegare
Allergeni, Formazione, Tracciabilità, Registrazione sanitaria, Configurazione,
promemoria calendario, esportazione PDF — arrivano nei prossimi passaggi.

## Creare un nuovo utente/azienda cliente
Per ogni nuova azienda cliente:
1. Supabase → Authentication → Users → Add user (email + password del cliente)
2. Supabase → SQL Editor, esegui:
```sql
with nuova_azienda as (
  insert into companies (name, consultant_name, consultant_email)
  values ('Nome azienda cliente', 'Il tuo nome', 'tuaemail@esempio.it')
  returning id
)
insert into profiles (id, company_id, full_name)
select 'UID_UTENTE_CLIENTE', nuova_azienda.id, 'Nome referente cliente'
from nuova_azienda;
```
(sostituendo `UID_UTENTE_CLIENTE` con l'UID copiato da Authentication → Users)

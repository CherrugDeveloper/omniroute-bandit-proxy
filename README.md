# Omniroute Bandit Proxy

Un reverse proxy dinamico in Node.js basato sull algoritmo Multi-Armed Bandit (Epsilon-Greedy) per l instradamento intelligente del traffico verso multiple istanze backend.

## Requisiti

- Node.js >= 18

## Installazione

npm install

## Configurazione

Copia il file .env.example in .env e configura i valori:

cp .env.example .env

Modifica config/bandit.json per personalizzare l elenco dei backend target e i parametri dell algoritmo.

## Avvio

In modalita sviluppo:

npm run dev

In produzione:

npm start

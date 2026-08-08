const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Struttura dati per gestire le stanze: { "1234": { domandaAttiva, prenotato, punteggi: {} } }
const stanze = {};

io.on('connection', (socket) => {
  let stanzaCorrente = null;
  let nicknameCorrente = null;

  // 1. CREAZIONE O INGRESSO IN UNA STANZA
  socket.on('uniscitiStanza', ({ codiceStanza, ruoli, nickname }) => {
    stanzaCorrente = codiceStanza;
    nicknameCorrente = nickname;

    socket.join(codiceStanza);

    // Inizializza la stanza se non esiste
    if (!stanze[codiceStanza]) {
      stanze[codiceStanza] = {
        domandaAttiva: null,
        prenotato: null,
        punteggi: {}
      };
    }

    const stanza = stanze[codiceStanza];

    // Se è un giocatore, aggiungilo ai punteggi
    if (ruoli === 'giocatore' && nickname) {
      if (!(nickname in stanza.punteggi)) {
        stanza.punteggi[nickname] = 0;
      }
    }

    // Invia lo stato attuale della stanza al client appena connesso
    socket.emit('aggiornaStato', stanza);
    io.to(codiceStanza).emit('aggiornaPunteggi', stanza.punteggi);
  });

  // 2. SELEZIONE DOMANDA DAL TABELLONE
  socket.on('selezionaDomanda', (data) => {
    if (!stanzaCorrente || !stanze[stanzaCorrente]) return;
    
    const stanza = stanze[stanzaCorrente];
    stanza.domandaAttiva = data;
    stanza.prenotato = null;

    io.to(stanzaCorrente).emit('apriDomanda', data);
  });

  // 3. PRENOTAZIONE BUZZER DA GIOCATORE
  socket.on('prenota', () => {
    if (!stanzaCorrente || !stanze[stanzaCorrente]) return;

    const stanza = stanze[stanzaCorrente];
    if (stanza.domandaAttiva && !stanza.prenotato) {
      stanza.prenotato = nicknameCorrente;
      io.to(stanzaCorrente).emit('giocatorePrenotato', nicknameCorrente);
    }
  });

  // 4. ESITO RISPOSTA DALLA REGIA
  socket.on('esitoRisposta', (data) => {
    if (!stanzaCorrente || !stanze[stanzaCorrente]) return;

    const { giocatore, esito, punti } = data;
    const stanza = stanze[stanzaCorrente];

    if (esito === 'corretta') {
      stanza.punteggi[giocatore] = (stanza.punteggi[giocatore] || 0) + punti;
      stanza.domandaAttiva = null;
      stanza.prenotato = null;
      io.to(stanzaCorrente).emit('chiudiDomanda', { punteggi: stanza.punteggi });
    } else if (esito === 'errata') {
      stanza.punteggi[giocatore] = (stanza.punteggi[giocatore] || 0) - punti;
      stanza.prenotato = null;
      io.to(stanzaCorrente).emit('riapriBuzzer', stanza.punteggi);
    }
  });

  // 5. RESET TURNO
  socket.on('resetTurno', () => {
    if (!stanzaCorrente || !stanze[stanzaCorrente]) return;
    stanze[stanzaCorrente].prenotato = null;
    io.to(stanzaCorrente).emit('resetBuzzer');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server attivo su porta ${PORT}`));

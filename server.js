const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serviamo i file statici dalla sottocartella "public"
app.use(express.static(path.join(__dirname, 'public')));

// Permette la lettura del file domande.json
app.get('/domande.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'domande.json'));
});

// Gestione delle stanze
const stanze = {};

function generaPinStanza() {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (stanze[pin]);
  return pin;
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentNick = null;

  // 1. Creazione Stanza (Tabellone)
  socket.on('creaStanza', () => {
    const pin = generaPinStanza();
    stanze[pin] = { punteggi: {}, domandaAttiva: null, prenotato: null };
    currentRoom = pin;
    socket.join(pin);
    socket.emit('stanzaCreata', { pin });
  });

  // 2. Ingresso (Giocatore / Regia)
  socket.on('uniscitiStanza', ({ pin, nickname, ruolo }) => {
    if (!stanze[pin]) {
      socket.emit('erroreIngresso', 'PIN Stanza non valido.');
      return;
    }

    currentRoom = pin;
    socket.join(pin);

    if (ruolo === 'giocatore') {
      currentNick = nickname;
      if (stanze[pin].punteggi[nickname] === undefined) {
        stanze[pin].punteggi[nickname] = 0;
      }
    }

    socket.emit('statoIniziale', stanze[pin]);
    io.to(pin).emit('aggiornaPunteggi', stanze[pin].punteggi);
  });

  // 3. Selezione Domanda
  socket.on('selezionaDomanda', (domandaData) => {
    if (!currentRoom || !stanze[currentRoom]) return;
    stanze[currentRoom].domandaAttiva = domandaData;
    stanze[currentRoom].prenotato = null;
    io.to(currentRoom).emit('apriDomanda', domandaData);
  });

  // 4. Pressione Buzzer
  socket.on('pressBuzzer', () => {
    if (!currentRoom || !stanze[currentRoom]) return;
    const stanza = stanze[currentRoom];

    if (stanza.domandaAttiva && !stanza.prenotato) {
      stanza.prenotato = currentNick;
      io.to(currentRoom).emit('giocatorePrenotato', currentNick);
    }
  });

  // 5. Esito Risposta (Regia)
  socket.on('esitoRisposta', ({ giocatore, esito, punti }) => {
    if (!currentRoom || !stanze[currentRoom]) return;
    const stanza = stanze[currentRoom];

    if (esito === 'corretta') {
      stanza.punteggi[giocatore] = (stanza.punteggi[giocatore] || 0) + punti;
      stanza.domandaAttiva = null;
      stanza.prenotato = null;
      io.to(currentRoom).emit('chiudiDomanda', { punteggi: stanza.punteggi, vincitore: giocatore });
    } else if (esito === 'errata') {
      stanza.punteggi[giocatore] = (stanza.punteggi[giocatore] || 0) - punti;
      stanza.prenotato = null;
      io.to(currentRoom).emit('riapriBuzzer', stanza.punteggi);
    }
  });

  // Reset del Turno
  socket.on('resetTurno', () => {
    if (!currentRoom || !stanze[currentRoom]) return;
    stanze[currentRoom].prenotato = null;
    io.to(currentRoom).emit('resetBuzzer');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server Rischiatutto attivo su http://localhost:${PORT}`);
});
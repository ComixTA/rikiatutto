const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Rende pubblica la cartella public (HTML, JS, domande.json)
app.use(express.static('public'));

// Stato del gioco in memoria
let gameState = {
  domandaAttiva: null,
  prenotato: null,
  punteggi: {}
};

io.on('connection', (socket) => {
  console.log('Un utente si è connesso:', socket.id);

  // Invia lo stato attuale al nuovo connesso
  socket.emit('aggiornaStato', gameState);

  // Quando un concorrente inserisce il nickname
  socket.on('registraGiocatore', (nickname) => {
    if (nickname && !(nickname in gameState.punteggi)) {
      gameState.punteggi[nickname] = 0;
    }
    io.emit('aggiornaPunteggi', gameState.punteggi);
  });

  // QUANDO DAL TABELLONE VIENE CLICCATA UNA DOMANDA
  socket.on('selezionaDomanda', (data) => {
    gameState.domandaAttiva = data;
    gameState.prenotato = null;
    // Invia l'evento 'apriDomanda' a TUTTI i client (Tabellone, Regia, Giocatori)
    io.emit('apriDomanda', data);
  });

  // Quando un giocatore premi il BUZZER
  socket.on('prenota', (nickname) => {
    if (gameState.domandaAttiva && !gameState.prenotato) {
      gameState.prenotato = nickname;
      io.emit('giocatorePrenotato', nickname);
    }
  });

  // Gestione dell'esito dalla Regia
  socket.on('esitoRisposta', (data) => {
    const { giocatore, esito, punti } = data;
    
    if (esito === 'corretta') {
      gameState.punteggi[giocatore] = (gameState.punteggi[giocatore] || 0) + punti;
      gameState.domandaAttiva = null;
      gameState.prenotato = null;
      io.emit('chiudiDomanda', { punteggi: gameState.punteggi });
    } else if (esito === 'errata') {
      gameState.punteggi[giocatore] = (gameState.punteggi[giocatore] || 0) - punti;
      gameState.prenotato = null;
      io.emit('riapriBuzzer', gameState.punteggi);
    }
  });

  // Sblocco / Reset dalla Regia
  socket.on('resetTurno', () => {
    gameState.prenotato = null;
    io.emit('resetBuzzer');
  });

  socket.on('disconnect', () => {
    console.log('Utente disconnesso:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});

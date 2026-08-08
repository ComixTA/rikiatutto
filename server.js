const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servire i file statici dalla cartella 'public'
app.use(express.static('public'));

// Struttura dati per gestire lo stato di ciascuna stanza PIN
// Formato: { "1234": { punteggi: { "Giocatore1": 100 }, domandaAttiva: null, prenotato: null } }
const stanze = {};

function ottieniOInizializzaStanza(codice) {
  if (!stanze[codice]) {
    stanze[codice] = {
      punteggi: {},
      domandaAttiva: null,
      prenotato: null
    };
  }
  return stanze[codice];
}

io.on('connection', (socket) => {

  // 1. ACCESSO ALLA STANZA (Tabellone, Regia o Giocatore)
  socket.on('uniscitiStanza', (data) => {
    const { codiceStanza, nickname, ruolo, ruoli } = data;
    const ruoloEffettivo = ruolo || ruoli;

    if (!codiceStanza) return;

    socket.codiceStanza = codiceStanza;
    socket.nickname = nickname;
    socket.ruolo = ruoloEffettivo;

    // Aggiunge la connessione alla stanza Socket.IO basata sul PIN
    socket.join(codiceStanza);

    const stanza = ottieniOInizializzaStanza(codiceStanza);

    // Se è un nuovo giocatore, inizializza il punteggio a 0
    if (ruoloEffettivo === 'giocatore' && nickname) {
      if (stanza.punteggi[nickname] === undefined) {
        stanza.punteggi[nickname] = 0;
      }
    }

    // Invia lo stato attuale al dispositivo appena connesso
    socket.emit('aggiornaStato', {
      punteggi: stanza.punteggi,
      domandaAttiva: stanza.domandaAttiva,
      prenotato: stanza.prenotato
    });

    // Invia la classifica aggiornata a tutti nella stanza
    io.to(codiceStanza).emit('aggiornaPunteggi', stanza.punteggi);
  });

  // 2. SELEZIONE DOMANDA DAL TABELLONE
  socket.on('selezionaDomanda', (data) => {
    const codice = socket.codiceStanza;
    if (!codice) return;

    const stanza = ottieniOInizializzaStanza(codice);
    stanza.domandaAttiva = data;
    stanza.prenotato = null;

    // Notifica TUTTI nella stanza (Tabellone, Regia, Giocatori)
    io.to(codice).emit('apriDomanda', data);
    io.to(codice).emit('resetBuzzer');
  });

  // 3. PRENOTAZIONE BUZZER DA PARTE DI UN GIOCATORE
  socket.on('prenotaBuzzer', () => {
    const codice = socket.codiceStanza;
    const nick = socket.nickname;

    if (!codice || !nick) return;

    const stanza = ottieniOInizializzaStanza(codice);

    // Si prenota solo se la domanda è attiva e nessuno si è ancora prenotato
    if (stanza.domandaAttiva && !stanza.prenotato) {
      stanza.prenotato = nick;
      io.to(codice).emit('giocatorePrenotato', nick);
    }
  });

  // 4. VERIFICA RISPOSTA DA PARTE DELLA REGIA
  socket.on('confermaRisposta', (data) => {
    const codice = data.codiceStanza || socket.codiceStanza;
    if (!codice) return;

    const stanza = ottieniOInizializzaStanza(codice);
    const { nick, punti, esito } = data;
    const valorePunti = parseInt(punti, 10) || 0;

    if (stanza.punteggi[nick] === undefined) {
      stanza.punteggi[nick] = 0;
    }

    if (esito === true) {
      // RISPOSTA CORRETTA: Aggiungi punti e chiudi domanda
      stanza.punteggi[nick] += valorePunti;
      stanza.domandaAttiva = null;
      stanza.prenotato = null;

      io.to(codice).emit('chiudiDomanda', { punteggi: stanza.punteggi });
    } else {
      // RISPOSTA ERRATA: Detrai punti e riapri il buzzer per gli altri
      stanza.punteggi[nick] -= valorePunti;
      stanza.prenotato = null;

      io.to(codice).emit('riapriBuzzer', stanza.punteggi);
    }
  });

  // 5. CHIUSURA FORZATA DOMANDA DALLA REGIA
  socket.on('forzaChiudiDomanda', (data) => {
    const codice = (data && data.codiceStanza) || socket.codiceStanza;
    if (!codice) return;

    const stanza = ottieniOInizializzaStanza(codice);
    stanza.domandaAttiva = null;
    stanza.prenotato = null;

    io.to(codice).emit('chiudiDomanda', { punteggi: stanza.punteggi });
  });

  socket.on('disconnect', () => {
    // Gestione disconnessione facoltativa
  });
});

// Avvio del Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Rischiatutto attivo sulla porta ${PORT}`);
});

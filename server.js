const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 9002;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const words = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/wordlist.json'), 'utf8'));

const rooms = {};

const getShuffledWords = (count, settings) => {
  let filteredWords = [...words];

  if (settings.wordLength > 0) {
    filteredWords = filteredWords.filter(w => w.length === settings.wordLength);
  }
  
  const getWords = (num) => {
      const shuffled = [...filteredWords].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, num);
  }

  if (settings.gameMode === 'combination') {
    return Array.from({ length: count }, () => getWords(settings.wordCount).join(' '));
  }
  
  return getWords(count);
};

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const getPublicRooms = () => {
    return Object.values(rooms)
      .filter(room => !room.isPrivate && room.players.length < room.settings.maxPlayers)
      .map(room => ({
        id: room.id,
        name: room.name,
        playerCount: room.players.length,
        maxPlayers: room.settings.maxPlayers,
      }));
  };

  io.on('connection', (socket) => {
    socket.on('getPublicRooms', (callback) => {
      callback(getPublicRooms());
    });

    socket.on('createRoom', ({ roomName, isPrivate, settings, player }, callback) => {
      const roomId = Math.random().toString(36).substr(2, 9);
      const newPlayer = { ...player, id: socket.id, score: 0, isHost: true };
      const newSettings = {
        ...settings,
        drawTime: parseInt(settings.drawTime, 10),
        rounds: parseInt(settings.rounds, 10),
        wordCount: parseInt(settings.wordCount, 10),
        hints: parseInt(settings.hints, 10),
      };

      rooms[roomId] = {
        id: roomId,
        name: roomName,
        isPrivate,
        players: [newPlayer],
        settings: newSettings,
        gameState: {
          status: 'waiting',
          currentRound: 0,
          currentDrawer: null,
          currentWord: '',
          timer: 0,
          hintsUsed: 0,
        },
        drawingData: [],
      };
      socket.join(roomId);
      callback({ status: 'ok', roomId });
      io.to(roomId).emit('roomState', rooms[roomId]);
      if (!isPrivate) {
        io.emit('publicRoomsUpdate', getPublicRooms());
      }
    });

    socket.on('joinRoom', ({ roomId, player }, callback) => {
      if (!rooms[roomId]) {
        return callback({ status: 'error', message: 'Room not found' });
      }
      if (rooms[roomId].players.some(p => p.id === socket.id)) {
        // Player is already in the room, just send them the state
        io.to(socket.id).emit('roomState', rooms[roomId]);
        return callback({ status: 'ok', room: rooms[roomId] });
      }
      if (rooms[roomId].players.length >= rooms[roomId].settings.maxPlayers) {
        return callback({ status: 'error', message: 'Room is full' });
      }

      const newPlayer = { ...player, id: socket.id, score: 0, isHost: false };
      rooms[roomId].players.push(newPlayer);
      socket.join(roomId);
      
      // Send drawing history to the new player
      if (rooms[roomId].drawingData.length > 0) {
        socket.emit('drawingHistory', rooms[roomId].drawingData);
      }

      callback({ status: 'ok', room: rooms[roomId] });
      io.to(roomId).emit('roomState', rooms[roomId]);
      if (!rooms[roomId].isPrivate) {
        io.emit('publicRoomsUpdate', getPublicRooms());
      }
    });

    const startGame = (roomId) => {
      const room = rooms[roomId];
      if (!room || room.players.length < 2) return;

      room.gameState.status = 'playing';
      room.gameState.currentRound = 1;
      room.players.forEach(p => p.score = 0);
      io.to(roomId).emit('roomState', room);
      startRound(roomId);
    };

    const startRound = (roomId) => {
      const room = rooms[roomId];
      if (!room || room.gameState.status !== 'playing') return;

      const drawerIndex = (room.gameState.currentRound - 1) % room.players.length;
      const drawer = room.players[drawerIndex];

      if (!drawer) {
        endGame(roomId);
        return;
      }

      room.gameState.currentDrawer = drawer.id;
      room.drawingData = [];
      io.to(roomId).emit('clearCanvas');

      const wordChoices = getShuffledWords(3, room.settings);
      io.to(drawer.id).emit('chooseWord', wordChoices);

      room.gameState.timer = room.settings.drawTime;
      room.gameState.hintsUsed = 0;
      room.guessedPlayers = new Set();
      io.to(roomId).emit('roomState', room);
      io.to(roomId).emit('systemMessage', { content: `${drawer.nickname} is drawing!` });

      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timerInterval = setInterval(() => {
        if (!rooms[roomId]) {
            clearInterval(room.timerInterval);
            return;
        }
        room.gameState.timer -= 1;
        io.to(roomId).emit('timerUpdate', room.gameState.timer);
        
        // Hint logic
        if (room.gameState.currentWord && room.settings.hints > 0) {
            const timePerHint = Math.floor(room.settings.drawTime / (room.settings.hints + 1));
            if (room.gameState.timer > 0 && room.gameState.timer % timePerHint === 0 && room.gameState.hintsUsed < room.settings.hints) {
                room.gameState.hintsUsed++;
                const wordWithHints = getWordWithHints(room.gameState.currentWord, room.gameState.hintsUsed, room.settings.hints);
                io.to(roomId).emit('wordUpdate', { word: wordWithHints });
                io.to(room.gameState.currentDrawer).emit('wordUpdate', { word: room.gameState.currentWord, forDrawer: true });
            }
        }

        if (room.gameState.timer <= 0) {
          endRound(roomId, 'time_up');
        }
      }, 1000);
    };

    const endRound = (roomId, reason) => {
      const room = rooms[roomId];
      if (!room || room.gameState.status !== 'playing') return;
      if (room.timerInterval) clearInterval(room.timerInterval);

      io.to(roomId).emit('systemMessage', { content: `Round over! The word was: ${room.gameState.currentWord}` });
      io.to(roomId).emit('roundEnd', { word: room.gameState.currentWord });
      room.gameState.currentWord = '';

      setTimeout(() => {
        if (!rooms[roomId]) return;
        if (room.gameState.currentRound >= room.settings.rounds) {
          endGame(roomId);
        } else {
          room.gameState.currentRound += 1;
          startRound(roomId);
        }
      }, 5000);
    };

    const endGame = (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      room.gameState.status = 'ended';
      io.to(roomId).emit('gameOver', room.players.sort((a, b) => b.score - a.score));
      io.to(roomId).emit('roomState', room);
    };

    socket.on('startGame', ({ roomId }) => {
      startGame(roomId);
    });

    const getWordMask = (word) => {
        if (rooms[roomId] && rooms[roomId].settings.gameMode === 'combination') {
            return word.split(' ').map(w => '_'.repeat(w.length)).join(' + ');
        }
        return '_'.repeat(word.length);
    }
    
    const getWordWithHints = (word, hintsUsed, totalHints) => {
        if (!word) return '';
        const wordParts = word.split(' ');
        const hintsPerPart = Math.floor(hintsUsed / wordParts.length);
        const extraHints = hintsUsed % wordParts.length;

        const revealedParts = wordParts.map((part, index) => {
            let revealedCount = hintsPerPart + (index < extraHints ? 1 : 0);
            let revealedIndices = new Set();
            while(revealedIndices.size < revealedCount) {
                revealedIndices.add(Math.floor(Math.random() * part.length));
            }
            return part.split('').map((char, i) => revealedIndices.has(i) ? char : '_').join('');
        });

        if (rooms[roomId] && rooms[roomId].settings.gameMode === 'combination') {
            return revealedParts.join(' + ');
        }
        return revealedParts.join('');
    };

    socket.on('wordChosen', ({ roomId, word }) => {
      const room = rooms[roomId];
      if (!room || socket.id !== room.gameState.currentDrawer) return;
      room.gameState.currentWord = word;
      room.guessedPlayers = new Set();
      io.to(roomId).emit('wordUpdate', { word: getWordMask(word) });
      io.to(socket.id).emit('wordUpdate', { word: word, forDrawer: true });
    });

    socket.on('sendMessage', ({ roomId, message }) => {
      const room = rooms[roomId];
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      if (room.gameState.status === 'playing' && socket.id !== room.gameState.currentDrawer && room.gameState.currentWord && !room.guessedPlayers?.has(socket.id) && message.toLowerCase() === room.gameState.currentWord.toLowerCase()) {
        
        const timeBonus = Math.floor(room.gameState.timer * 1.5);
        const orderBonus = Math.max(0, (room.players.length - room.guessedPlayers.size - 2) * 50);
        const points = 100 + timeBonus + orderBonus;
        player.score += points;
        
        const drawer = room.players.find(p => p.id === room.gameState.currentDrawer);
        if(drawer) drawer.score += 50;

        room.guessedPlayers.add(socket.id);
        
        io.to(roomId).emit('systemMessage', { content: `${player.nickname} guessed the word!` });
        io.to(roomId).emit('roomState', room);

        if (room.guessedPlayers.size >= room.players.length - 1) {
          endRound(roomId, 'all_guessed');
        }

      } else {
        io.to(roomId).emit('newMessage', { player, message });
      }
    });

    socket.on('drawing', ({ roomId, data }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (room.gameState.status === 'playing') {
        room.drawingData.push(data);
      }
      socket.to(roomId).emit('drawing', data);
    });
    
    socket.on('clearCanvas', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      room.drawingData = [];
      io.to(roomId).emit('clearCanvas');
    });

    socket.on('undo', ({ roomId, history }) => {
        const room = rooms[roomId];
        if (!room) return;
        room.drawingData = history;
        io.to(roomId).emit('undo', { history });
    });

    socket.on('disconnect', () => {
      for (const roomId in rooms) {
        const room = rooms[roomId];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const removedPlayer = room.players.splice(playerIndex, 1)[0];
          io.to(roomId).emit('systemMessage', { content: `${removedPlayer.nickname} has left.` });

          if (room.players.length === 0) {
            if (room.timerInterval) clearInterval(room.timerInterval);
            delete rooms[roomId];
          } else {
            if (removedPlayer.isHost && room.players.length > 0) {
              room.players[0].isHost = true;
            }
             if (room.gameState.status === 'playing' && room.gameState.currentDrawer === socket.id) {
               endRound(roomId, 'drawer_left');
            }
             if(room.gameState.status === 'playing' && room.players.length < 2) {
                endGame(roomId);
             }
             io.to(roomId).emit('roomState', room);
          }
          
          if (room && !room.isPrivate) {
            io.emit('publicRoomsUpdate', getPublicRooms());
          }
          break;
        }
      }
    });
  });

  httpServer
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    })
    .on('error', (err) => {
      console.error(err);
      process.exit(1);
    });
});

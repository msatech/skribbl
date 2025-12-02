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

const getShuffledWords = (count) => {
  const shuffled = [...words].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
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
      rooms[roomId] = {
        id: roomId,
        name: roomName,
        isPrivate,
        players: [newPlayer],
        settings: { ...settings, drawTime: parseInt(settings.drawTime, 10), rounds: parseInt(settings.rounds, 10) },
        gameState: {
          status: 'waiting',
          currentRound: 0,
          currentDrawer: null,
          currentWord: '',
          timer: 0,
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
        return callback({ status: 'ok', room: rooms[roomId] });
      }
      if (rooms[roomId].players.length >= rooms[roomId].settings.maxPlayers) {
        return callback({ status: 'error', message: 'Room is full' });
      }

      const newPlayer = { ...player, id: socket.id, score: 0, isHost: false };
      rooms[roomId].players.push(newPlayer);
      rooms[roomId].drawingData.forEach(data => socket.emit('drawing', data));
      socket.join(roomId);

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

      // Ensure round number doesn't exceed player count in a way that repeats drawers unnecessarily
      const drawerIndex = (room.gameState.currentRound - 1) % room.players.length;
      const drawer = room.players[drawerIndex];

      if (!drawer) { // handle case where drawer might not exist
        endGame(roomId);
        return;
      }

      room.gameState.currentDrawer = drawer.id;
      room.drawingData = [];
      io.to(roomId).emit('clearCanvas');

      const wordChoices = getShuffledWords(3);
      io.to(drawer.id).emit('chooseWord', wordChoices);

      room.gameState.timer = room.settings.drawTime;
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
      room.gameState.currentWord = '';
      
      io.to(roomId).emit('roundEnd');

      setTimeout(() => {
        if (!rooms[roomId]) return; // Room might be deleted
        if ((room.gameState.currentRound * room.players.length) >= (room.settings.rounds * room.players.length)) {
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

    socket.on('wordChosen', ({ roomId, word }) => {
      const room = rooms[roomId];
      if (!room || socket.id !== room.gameState.currentDrawer) return;
      room.gameState.currentWord = word;
      room.guessedPlayers = new Set();
      io.to(roomId).emit('wordUpdate', '_'.repeat(word.length));
    });

    socket.on('sendMessage', ({ roomId, message }) => {
      const room = rooms[roomId];
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      if (room.gameState.status === 'playing' && socket.id !== room.gameState.currentDrawer && room.gameState.currentWord && !room.guessedPlayers?.has(socket.id) && message.toLowerCase() === room.gameState.currentWord.toLowerCase()) {
        const points = 500 - (room.guessedPlayers.size * 50) + (room.gameState.timer * 2);
        player.score += points;
        
        const drawer = room.players.find(p => p.id === room.gameState.currentDrawer);
        if(drawer) drawer.score += 50;

        room.guessedPlayers.add(socket.id);
        
        io.to(roomId).emit('systemMessage', { content: `${player.nickname} guessed the word!` });
        io.to(roomId).emit('roomState', room);

        if (room.guessedPlayers.size === room.players.length - 1) {
          endRound(roomId, 'all_guessed');
        }

      } else {
        io.to(roomId).emit('newMessage', { player, message });
      }
    });

    socket.on('drawing', ({ roomId, data }) => {
      const room = rooms[roomId];
      if (!room) return;
      // We don't need to store all drawing data on the server
      // room.drawingData.push(data);
      socket.to(roomId).emit('drawing', data);
    });
    
    socket.on('clearCanvas', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      room.drawingData = [];
      io.to(roomId).emit('clearCanvas');
    });

    socket.on('undo', ({ roomId }) => {
        io.to(roomId).emit('undo');
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
          
          if (!room.isPrivate) {
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

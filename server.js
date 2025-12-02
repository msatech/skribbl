
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const words = require('./src/wordlist.json');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:9002', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

const rooms = {};
const DISCONNECT_TIMEOUT = 15000; // 15 seconds

const getShuffledWords = (count) => {
    const shuffled = [...words].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createRoom', ({ roomName, isPrivate, settings, nickname, playerUUID }) => {
    let roomId = Math.random().toString(36).substring(2, 8);
    while (rooms[roomId]) {
        roomId = Math.random().toString(36).substring(2, 8);
    }
    
    const host = {
      id: socket.id,
      uuid: playerUUID,
      nickname,
      score: 0,
      isHost: true,
      connected: true,
    };

    rooms[roomId] = {
      id: roomId,
      name: roomName,
      isPrivate,
      settings,
      players: [host],
      finalScores: [],
      gameState: {
        status: 'waiting',
        currentRound: 0,
        currentDrawerId: null,
        timer: 0,
        guessedPlayerIds: [],
        word: '',
        turn: -1,
      },
      drawingHistory: [],
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    io.to(roomId).emit('roomState', rooms[roomId]);
    console.log(`Room created: ${roomId} by ${nickname} (${playerUUID})`);
  });

  socket.on('joinRoom', ({ roomId, nickname, playerUUID }) => {
    const room = rooms[roomId];
    if (!room) {
      return socket.emit('roomNotFound');
    }

    const existingPlayer = room.players.find(p => p.uuid === playerUUID);

    if (existingPlayer) {
        console.log(`${nickname} (${playerUUID}) re-joined room: ${roomId}`);
        existingPlayer.id = socket.id; // Update socket ID
        existingPlayer.connected = true;
        if (existingPlayer.disconnectTimeout) {
            clearTimeout(existingPlayer.disconnectTimeout);
            delete existingPlayer.disconnectTimeout;
        }
        io.to(roomId).emit('systemMessage', { content: `${nickname} has reconnected.`});
    } else {
        if (room.players.length >= room.settings.maxPlayers) {
            return socket.emit('error', { message: 'Room is full.' });
        }
        
        const newPlayer = {
            id: socket.id,
            uuid: playerUUID,
            nickname,
            score: 0,
            isHost: room.players.length === 0, // First player is host
            connected: true,
        };
        room.players.push(newPlayer);
        io.to(roomId).emit('systemMessage', { content: `${nickname} has joined the game.`});
        console.log(`${nickname} (${playerUUID}) joined room: ${roomId}`);
    }
    
    socket.join(roomId);
    socket.emit('joinedRoom', roomId);
    io.to(roomId).emit('roomState', room);
  });

  const startGame = (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    
    room.players.forEach(p => p.score = 0);
    room.finalScores = [];
    room.gameState = {
        ...room.gameState,
        status: 'waiting',
        currentRound: 0,
        currentDrawerId: null,
        timer: 0,
        guessedPlayerIds: [],
        word: '',
        turn: -1,
    };
    
    io.to(roomId).emit('roomState', room);
    
    startRound(roomId);
  };

  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    const player = room?.players.find(p => p.id === socket.id);
    if (!room || !player || !player.isHost) return;

    const activePlayers = room.players.filter(p => p.connected);
    if (activePlayers.length < 2) {
        return socket.emit('systemMessage', { content: 'You need at least 2 active players to start.' });
    }
    startGame(roomId);
  });

  const startRound = (roomId) => {
    const room = rooms[roomId];
    if (!room || room.gameState.status === 'ended') return;

    const activePlayers = room.players.filter(p => p.connected);
    if (activePlayers.length < 2 && room.gameState.status !== 'waiting') {
        endGame(roomId, 'Not enough players.');
        return;
    }

    room.gameState.turn++;
    if (room.gameState.turn >= room.players.length) {
        room.gameState.turn = 0;
        room.gameState.currentRound++;
    }
    
    if (room.gameState.currentRound >= room.settings.rounds) {
        endGame(roomId);
        return;
    }

    // Find the next connected drawer
    let attempts = 0;
    while(attempts < room.players.length) {
        const potentialDrawer = room.players[room.gameState.turn];
        if (potentialDrawer && potentialDrawer.connected) {
            break; // Found a connected drawer
        }
        room.gameState.turn = (room.gameState.turn + 1) % room.players.length;
        attempts++;
    }

    const drawer = room.players[room.gameState.turn];
    if (!drawer || !drawer.connected) {
        endGame(roomId, "Could not find a drawer."); // End game if no one is left
        return;
    }
    
    room.gameState.currentDrawerId = drawer.id;
    room.gameState.status = 'choosing_word';
    room.gameState.word = '';
    room.gameState.guessedPlayerIds = [];
    room.drawingHistory = [];
    io.to(roomId).emit('drawingAction', { tool: 'clear' });
    
    const wordChoices = getShuffledWords(3);
    
    io.to(drawer.id).emit('chooseWord', wordChoices);
    
    io.to(roomId).emit('roomState', room);
    io.to(roomId).emit('systemMessage', { content: `${drawer.nickname} is choosing a word...` });
    io.to(roomId).emit('sound', 'new_round');

    if (room.wordChoiceTimeout) clearTimeout(room.wordChoiceTimeout);
    room.wordChoiceTimeout = setTimeout(() => {
        if (room?.gameState.status === 'choosing_word') {
            const randomWord = wordChoices[Math.floor(Math.random() * wordChoices.length)];
            handleWordChosen(roomId, drawer.id, randomWord);
        }
    }, 5000);
  };
  
  const handleWordChosen = (roomId, socketId, word) => {
      const room = rooms[roomId];
      if (!room || socketId !== room.gameState.currentDrawerId || room.gameState.status !== 'choosing_word') return;

      if (room.wordChoiceTimeout) clearTimeout(room.wordChoiceTimeout);
      
      room.gameState.word = word;
      beginDrawingPhase(roomId);
  }

  socket.on('wordChosen', ({ roomId, word }) => {
    handleWordChosen(roomId, socket.id, word);
  });
  
  const beginDrawingPhase = (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    
    room.gameState.status = 'playing';
    room.gameState.timer = room.settings.drawTime;
    
    const drawer = room.players.find(p => p.id === room.gameState.currentDrawerId);
    io.to(roomId).emit('roomState', room);
    io.to(roomId).emit('systemMessage', { content: `${drawer?.nickname} is drawing!` });

    if (room.timerInterval) clearInterval(room.timerInterval);
    room.timerInterval = setInterval(() => {
        const currentRoom = rooms[roomId];
        if (!currentRoom || currentRoom.gameState.status !== 'playing') {
            clearInterval(room.timerInterval);
            return;
        }

        currentRoom.gameState.timer--;
        io.to(roomId).emit('timerUpdate', currentRoom.gameState.timer);
        
        if(currentRoom.gameState.timer > 0 && currentRoom.settings.hints > 0 && currentRoom.gameState.timer % Math.floor(currentRoom.settings.drawTime / (currentRoom.settings.hints + 1)) === 0) {
            io.to(roomId).emit('roomState', currentRoom);
        }

        if (currentRoom.gameState.timer <= 0) {
            endRound(roomId, 'time_up');
        }
    }, 1000);
  }

  socket.on('submitGuess', ({ roomId, guess }) => {
    const room = rooms[roomId];
    const player = room?.players.find(p => p.id === socket.id);
    if (!room || !player || player.id === room.gameState.currentDrawerId || room.gameState.guessedPlayerIds.includes(player.id)) {
      return;
    }
    
    io.to(roomId).emit('chatMessage', { player, message: guess });
    io.to(roomId).emit('sound', 'message');

    if (guess.trim().toLowerCase() === room.gameState.word.toLowerCase()) {
      room.gameState.guessedPlayerIds.push(player.id);
      
      const basePoints = 200;
      const timeBonus = Math.floor((room.gameState.timer / room.settings.drawTime) * 100);
      const isFirstGuesser = room.gameState.guessedPlayerIds.length === 1;
      const firstGuessBonus = isFirstGuesser ? 50 : 0;
      const guesserScore = basePoints + timeBonus + firstGuessBonus;
      player.score += guesserScore;

      const drawer = room.players.find(p => p.id === room.gameState.currentDrawerId);
      if(drawer) {
          const guessersCount = room.players.filter(p => p.connected).length - 1;
          const drawerPoints = Math.round(300 / (guessersCount || 1));
          drawer.score += drawerPoints;
      }
      
      io.to(roomId).emit('systemMessage', { content: `${player.nickname} guessed the word!`, isCorrectGuess: true });
      io.to(roomId).emit('sound', 'correct_guess');

      const allGuessed = room.gameState.guessedPlayerIds.length === room.players.filter(p => p.connected).length - 1;
      if (allGuessed && room.players.length > 1) {
          if (drawer) drawer.score += 200; // Perfect round bonus for drawer
          room.players.forEach(p => {
              if (room.gameState.guessedPlayerIds.includes(p.id)) {
                  p.score += 50; // Bonus for all guessers
              }
          });
          endRound(roomId, 'all_guessed');
      } else {
         io.to(roomId).emit('roomState', room); 
      }
    }
  });
  
  socket.on('drawingAction', ({ roomId, action }) => {
    const room = rooms[roomId];
    if (room && socket.id === room.gameState.currentDrawerId) {
        if (action.tool === 'clear') {
            room.drawingHistory = [];
        } else if (action.tool === 'undo') {
            if (room.drawingHistory.length > 0) {
                let lastStrokeStartIndex = -1;
                for (let i = room.drawingHistory.length - 1; i >= 0; i--) {
                    if ((room.drawingHistory[i].tool === 'pencil' || room.drawingHistory[i].tool === 'eraser') && room.drawingHistory[i].isStartOfLine) {
                        lastStrokeStartIndex = i;
                        break;
                    }
                }
                if (lastStrokeStartIndex !== -1) {
                    room.drawingHistory.splice(lastStrokeStartIndex);
                } else {
                    room.drawingHistory.pop(); // Fallback for single actions like fill
                }
            }
             // On undo, we have to send the entire history back to ensure consistency
             socket.broadcast.to(roomId).emit('drawingAction', { tool: 'undo', history: room.drawingHistory });
             return;
        } else {
             room.drawingHistory.push(action);
        }
        socket.broadcast.to(roomId).emit('drawingAction', action);
    }
  });

  const endRound = (roomId, reason) => {
    const room = rooms[roomId];
    if (!room || room.gameState.status !== 'playing') return;

    if (room.timerInterval) clearInterval(room.timerInterval);
    if (reason === 'time_up') io.to(roomId).emit('sound', 'time_up');

    room.gameState.status = 'ended_round';
    io.to(roomId).emit('roomState', room);
    io.to(roomId).emit('systemMessage', { content: `Round over! The word was: ${room.gameState.word}`});

    setTimeout(() => {
        if(rooms[roomId]) startRound(roomId);
    }, 5000);
  }
  
  const endGame = (roomId, message = 'Game over!') => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.timerInterval) clearInterval(room.timerInterval);
    if (room.wordChoiceTimeout) clearTimeout(room.wordChoiceTimeout);
    
    room.finalScores = [...room.players].sort((a,b) => b.score - a.score);
    room.gameState.status = 'ended';
    io.to(roomId).emit('systemMessage', { content: message });
    io.to(roomId).emit('finalScores', room.finalScores);
    io.to(roomId).emit('sound', 'game_over');
    io.to(roomId).emit('roomState', room);
  }
  
  socket.on('resetGame', (roomId) => {
      const room = rooms[roomId];
      const player = room?.players.find(p => p.id === socket.id);
      if (!room || !player || !player.isHost) return;
      
      console.log(`Resetting game for room ${roomId}`);
      startGame(roomId);
  });

  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
    let disconnectedPlayer = null;
    let roomId = null;
    
    // Find the player and room they were in
    for (const id in rooms) {
      const room = rooms[id];
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        disconnectedPlayer = player;
        roomId = id;
        break;
      }
    }

    if (disconnectedPlayer && roomId) {
        const room = rooms[roomId];
        disconnectedPlayer.connected = false;
        io.to(roomId).emit('systemMessage', { content: `${disconnectedPlayer.nickname} has disconnected.` });
        io.to(roomId).emit('sound', 'leave');
        
        // Handle drawer disconnect
        if (room.gameState.status === 'playing' && disconnectedPlayer.id === room.gameState.currentDrawerId) {
             io.to(roomId).emit('systemMessage', { content: 'The drawer has left. The round will end shortly.' });
             endRound(roomId, 'drawer_left');
        }

        // Set a timeout to remove the player if they don't reconnect
        disconnectedPlayer.disconnectTimeout = setTimeout(() => {
            if (rooms[roomId]) {
                const playerIndex = rooms[roomId].players.findIndex(p => p.uuid === disconnectedPlayer.uuid);
                if (playerIndex !== -1 && !rooms[roomId].players[playerIndex].connected) {
                    const removedPlayer = rooms[roomId].players.splice(playerIndex, 1)[0];
                    console.log(`Permanently removed ${removedPlayer.nickname} from room ${roomId}`);
                    
                    if (rooms[roomId].players.length === 0) {
                        console.log(`Room ${roomId} closed because all players left.`);
                        if (room.timerInterval) clearInterval(room.timerInterval);
                        if (room.wordChoiceTimeout) clearTimeout(room.wordChoiceTimeout);
                        delete rooms[roomId];
                        return;
                    }
                    io.to(roomId).emit('roomState', rooms[roomId]);
                }
            }
        }, DISCONNECT_TIMEOUT);

        // Promote a new host if the host disconnected
        if (disconnectedPlayer.isHost && room.players.some(p => p.connected)) {
            const newHost = room.players.find(p => p.connected);
            if (newHost) {
                newHost.isHost = true;
                io.to(roomId).emit('systemMessage', { content: `${newHost.nickname} is now the host.` });
            }
        }
        
        // Check if game can continue
        const activePlayers = room.players.filter(p => p.connected);
        if (activePlayers.length < 2 && (room.gameState.status === 'playing' || room.gameState.status === 'choosing_word')) {
            endGame(roomId, 'Not enough players to continue.');
        }

        io.to(roomId).emit('roomState', room);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

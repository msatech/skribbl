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
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const rooms = {};

const getShuffledWords = (count) => {
    const shuffled = [...words].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createRoom', ({ roomName, isPrivate, settings, nickname }) => {
    let roomId = Math.random().toString(36).substring(2, 8);
    while (rooms[roomId]) {
        roomId = Math.random().toString(36).substring(2, 8);
    }
    
    const host = {
      id: socket.id,
      nickname,
      score: 0,
      isHost: true,
    };

    rooms[roomId] = {
      id: roomId,
      name: roomName,
      isPrivate,
      settings,
      players: [host],
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
    console.log(`Room created: ${roomId} by ${nickname}`);
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    if (!rooms[roomId]) {
      return socket.emit('error', { message: 'Room not found.' });
    }
    if (rooms[roomId].players.length >= rooms[roomId].settings.maxPlayers) {
      return socket.emit('error', { message: 'Room is full.' });
    }
    
    const player = {
      id: socket.id,
      nickname,
      score: 0,
      isHost: false,
    };

    socket.join(roomId);
    rooms[roomId].players.push(player);
    
    io.to(roomId).emit('roomState', rooms[roomId]);
    io.to(roomId).emit('systemMessage', { content: `${nickname} has joined the game.`});
    socket.emit('joinedRoom', roomId);
    console.log(`${nickname} joined room: ${roomId}`);
  });

  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    if (!room || room.players.find(p => p.id === socket.id)?.isHost !== true) return;
    if (room.players.length < 2) {
        return socket.emit('systemMessage', { content: 'You need at least 2 players to start.' });
    }
    
    room.players.forEach(p => p.score = 0);
    room.gameState.currentRound = 0;
    room.gameState.turn = -1;
    
    startRound(roomId);
  });

  const startRound = (roomId) => {
    const room = rooms[roomId];
    if (!room || room.gameState.status === 'ended') return;

    room.gameState.turn++;
    if (room.gameState.turn >= room.players.length) {
        room.gameState.turn = 0;
        room.gameState.currentRound++;
    }
    
    if (room.gameState.currentRound >= room.settings.rounds) {
        endGame(roomId);
        return;
    }

    const drawer = room.players[room.gameState.turn];
    if (!drawer) {
        endGame(roomId); // All players might have left
        return;
    }
    
    room.gameState.currentDrawerId = drawer.id;
    room.gameState.status = 'choosing_word';
    room.gameState.word = '';
    room.gameState.guessedPlayerIds = [];
    room.drawingHistory = [];
    
    const wordChoices = getShuffledWords(3);
    
    io.to(roomId).emit('roomState', room);
    io.to(roomId).emit('systemMessage', { content: `${drawer.nickname} is choosing a word...` });
    io.to(roomId).emit('sound', 'new_round');

    // Send word choices ONLY to the drawer
    io.to(drawer.id).emit('chooseWord', wordChoices);

    // Word choice timeout
    room.wordChoiceTimeout = setTimeout(() => {
        if (room.gameState.status === 'choosing_word') {
            const randomWord = wordChoices[Math.floor(Math.random() * wordChoices.length)];
            // Manually trigger word selection for the drawer
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
    
    io.to(roomId).emit('roomState', room);
    io.to(roomId).emit('systemMessage', { content: `${room.players.find(p => p.id === room.gameState.currentDrawerId).nickname} is drawing!` });

    // Start timer
    if (room.timerInterval) clearInterval(room.timerInterval);
    room.timerInterval = setInterval(() => {
        room.gameState.timer--;
        io.to(roomId).emit('timerUpdate', room.gameState.timer);
        
        if(room.gameState.timer % Math.floor(room.settings.drawTime / (room.settings.hints + 1)) === 0 && room.gameState.timer > 0) {
            io.to(roomId).emit('roomState', room); // To update word display with hints
        }

        if (room.gameState.timer <= 0) {
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

    if (guess.toLowerCase() === room.gameState.word.toLowerCase()) {
      room.gameState.guessedPlayerIds.push(player.id);
      
      const basePoints = 200;
      const timeBonus = Math.floor((room.gameState.timer / room.settings.drawTime) * 100);
      const isFirstGuesser = room.gameState.guessedPlayerIds.length === 1;
      const firstGuessBonus = isFirstGuesser ? 50 : 0;
      const guesserScore = basePoints + timeBonus + firstGuessBonus;
      player.score += guesserScore;

      // Update drawer's score
      const drawer = room.players.find(p => p.id === room.gameState.currentDrawerId);
      if(drawer) {
          const guessersCount = room.players.length - 1;
          const drawerPoints = Math.round(300 / guessersCount);
          drawer.score += drawerPoints;
      }
      
      io.to(roomId).emit('systemMessage', { content: `${player.nickname} guessed the word!`, isCorrectGuess: true });
      io.to(roomId).emit('sound', 'correct_guess');

      const allGuessed = room.gameState.guessedPlayerIds.length === room.players.length - 1;
      if (allGuessed) {
          const drawer = room.players.find(p => p.id === room.gameState.currentDrawerId);
          if (drawer) drawer.score += 200;
          room.players.forEach(p => {
              if (room.gameState.guessedPlayerIds.includes(p.id)) {
                  p.score += 50;
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
            // More robust undo logic can be implemented here if needed
            const lastLineStartIndex = room.drawingHistory.findLastIndex(a => a.tool === 'pencil' || a.tool === 'eraser');
            if (lastLineStartIndex !== -1) {
              const lineStart = room.drawingHistory[lastLineStartIndex];
              if(lineStart.points.length > 1) { // It's a continuous line
                 room.drawingHistory = room.drawingHistory.slice(0, lastLineStartIndex);
              } else { // It's a single dot or start of a line
                 room.drawingHistory.pop();
              }
            } else {
               room.drawingHistory.pop();
            }

        } else {
            room.drawingHistory.push(action);
        }
        socket.to(roomId).emit('drawingAction', action);
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
        startRound(roomId);
    }, 5000);
  }
  
  const endGame = (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.timerInterval) clearInterval(room.timerInterval);
    if (room.wordChoiceTimeout) clearTimeout(room.wordChoiceTimeout);

    room.gameState.status = 'ended';
    io.to(roomId).emit('finalScores', room.players.sort((a,b) => b.score - a.score));
    io.to(roomId).emit('sound', 'game_over');
    io.to(roomId).emit('roomState', room);
  }
  
  socket.on('resetGame', (roomId) => {
      const room = rooms[roomId];
      if (!room || room.players.find(p => p.id === socket.id)?.isHost !== true) return;
      
      console.log(`Resetting game for room ${roomId}`);
      startGame(roomId);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const disconnectedPlayer = room.players[playerIndex];
        room.players.splice(playerIndex, 1);
        
        io.to(roomId).emit('systemMessage', { content: `${disconnectedPlayer.nickname} has left the game.` });
        io.to(roomId).emit('sound', 'leave');

        if (room.players.length < 2 && room.gameState.status !== 'waiting' && room.gameState.status !== 'ended') {
            io.to(roomId).emit('systemMessage', { content: 'Not enough players to continue. Game over.'});
            endGame(roomId);
        } else if (disconnectedPlayer.id === room.gameState.currentDrawerId) {
            io.to(roomId).emit('systemMessage', { content: 'The drawer has left. Starting new round.'});
            endRound(roomId, 'drawer_left');
        } else if (room.players.length > 0 && !room.players.some(p => p.isHost)) {
            // Promote next player to host
            room.players[0].isHost = true;
            io.to(roomId).emit('systemMessage', { content: `${room.players[0].nickname} is now the host.`});
        }
        
        if (room.players.length === 0) {
            delete rooms[roomId];
            console.log(`Room ${roomId} closed because all players left.`);
        } else {
            io.to(roomId).emit('roomState', room);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

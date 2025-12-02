
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Room, GameState, Player, GameSettings, ChatMessage } from '@/types';
import useLocalStorage from './use-local-storage';
import words from '@/wordlist.json';
import { DrawingAction } from '@/app/(game)/room/[roomId]/canvas';
import { useAudio } from './use-audio';

const initialGameState: GameState = {
  status: 'waiting',
  currentRound: 0,
  currentDrawerId: null,
  timer: 0,
  guessedPlayerIds: [],
};

export const useGameEngine = () => {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [nickname, setNicknameState] = useLocalStorage('nickname', '');
  const [drawingHistory, setDrawingHistory] = useState<DrawingAction[]>([]);
  const [wordToDraw, setWordToDraw] = useState('');
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [wordDisplay, setWordDisplay] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [finalScores, setFinalScores] = useState<Player[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  
  const { playSound } = useAudio();
  const timerRef = useRef<NodeJS.Timeout>();

  const me = useMemo(() => players.find(p => p.nickname === nickname), [players, nickname]);
  const isDrawer = useMemo(() => me?.id === gameState.currentDrawerId, [me, gameState.currentDrawerId]);

  const addSystemMessage = useCallback((content: string, isCorrectGuess = false) => {
    setChatMessages(prev => [...prev, { type: 'system', content, isCorrectGuess }]);
  }, []);

  const getShuffledWords = useCallback((count: number) => {
    const shuffled = [...words].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }, []);
  
  const updateWordDisplay = useCallback(() => {
    if (!wordToDraw) {
      setWordDisplay('');
      return;
    }
    const revealedLetters = new Set<number>();
    
    // Reveal spaces
    wordToDraw.split('').forEach((char, index) => {
        if(char === ' ') revealedLetters.add(index);
    });

    if (room && gameState.timer > 0 && wordToDraw && room.settings.hints > 0) {
      const { drawTime, hints } = room.settings;
      const timePerHint = Math.floor(drawTime / (hints + 1));
      const hintsToShow = Math.floor((drawTime - gameState.timer) / timePerHint);

      if (hintsToShow > 0) {
        const lettersToReveal = Math.floor(wordToDraw.replace(/ /g, '').length * (0.2 * hintsToShow));
        while(revealedLetters.size < lettersToReveal + wordToDraw.split(' ').length -1) {
            const randomIndex = Math.floor(Math.random() * wordToDraw.length);
            if(wordToDraw[randomIndex] !== ' ') {
                 revealedLetters.add(randomIndex);
            }
        }
      }
    }
    
    const display = wordToDraw.split('').map((char, index) => {
        if (revealedLetters.has(index)) return char;
        if (char === ' ') return ' ';
        return '_';
    }).join('');

    setWordDisplay(display);

  }, [wordToDraw, gameState.timer, room]);

  const endRound = useCallback((reason: 'time_up' | 'all_guessed' | 'drawer_left') => {
    if (timerRef.current) clearInterval(timerRef.current);
    if(gameState.status !== 'playing' && gameState.status !== 'choosing_word') return;

    if (reason === 'time_up') playSound('time_up');
    addSystemMessage(`Round over! The word was: ${wordToDraw}`);
    
    setGameState(prev => ({ ...prev, status: 'ended_round' }));

    setTimeout(() => {
        // startRound will be called here
        setGameState(prev => {
            if (prev.status === 'ended') return prev; // Don't start a new round if game is over
            const nextRound = prev.currentRound;
            const currentDrawerIndex = players.findIndex(p => p.id === prev.currentDrawerId);
            let nextDrawerIndex = (currentDrawerIndex + 1) % players.length;

            if(nextDrawerIndex === 0) {
                if(nextRound + 1 > room!.settings.rounds) {
                    // End Game
                    setFinalScores([...players].sort((a,b) => b.score - a.score));
                    setIsLeaderboardOpen(true);
                    playSound('game_over');
                    return { ...prev, status: 'ended' };
                }
            }
             // Wrapped in a timeout to allow state to update before starting next round logic
            setTimeout(() => startRound(), 100);
            return prev;
        });

    }, 5000);

  }, [gameState.status, wordToDraw, players, room, addSystemMessage, playSound]);

  // The main game timer
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.timer > 0) {
      timerRef.current = setTimeout(() => {
        setGameState(prev => ({ ...prev, timer: prev.timer - 1 }));
        updateWordDisplay();
      }, 1000);
    } else if (gameState.status === 'playing' && gameState.timer <= 0) {
      endRound('time_up');
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState.status, gameState.timer, endRound, updateWordDisplay]);


  const startRound = useCallback(() => {
    if (!room) return;

    setGameState(prevGameState => {
        let nextRound = prevGameState.currentRound;
        const currentDrawerIndex = players.findIndex(p => p.id === prevGameState.currentDrawerId);
        let nextDrawerIndex = (currentDrawerIndex + 1) % players.length;
        
        if (nextDrawerIndex === 0) {
          nextRound++;
        }
        
        if (nextRound > room.settings.rounds) {
            // This is the end of the game
            setFinalScores([...players].sort((a,b) => b.score - a.score));
            setIsLeaderboardOpen(true);
            playSound('game_over');
            return { ...prevGameState, status: 'ended' };
        }
        
        const nextDrawer = players[nextDrawerIndex];
        setWordChoices(getShuffledWords(3));
        setWordToDraw('');
        setDrawingHistory([]);
        setChatMessages([]);
        addSystemMessage(`${nextDrawer.nickname} is choosing a word...`);
        
        return {
          ...prevGameState,
          status: 'choosing_word',
          currentRound: nextRound,
          currentDrawerId: nextDrawer.id,
          guessedPlayerIds: [],
        };
    });
  }, [room, players, getShuffledWords, addSystemMessage, playSound]);

  const startGame = useCallback(() => {
    if (players.length < 2) {
      addSystemMessage('Need at least 2 players to start.');
      return;
    }
    setPlayers(prev => prev.map(p => ({ ...p, score: 0 })));
    setIsLeaderboardOpen(false);
    
    // This immediately triggers the first round
    startRound();

  }, [players.length, addSystemMessage, startRound]);

  const selectWord = useCallback((word: string) => {
    if (!isDrawer || !room) return;
    setWordToDraw(word);
    setWordChoices([]);

    setGameState(prev => ({
        ...prev,
        status: 'playing',
        timer: room.settings.drawTime,
    }));

    addSystemMessage(`${me?.nickname} is drawing!`);

  }, [isDrawer, room, me, addSystemMessage]);

  useEffect(() => {
    if(gameState.status === 'playing') {
        updateWordDisplay();
    }
    if(gameState.status === 'ended_round' || gameState.status === 'ended') {
        setWordDisplay(wordToDraw);
    }
  }, [gameState.status, updateWordDisplay, wordToDraw]);

  const submitGuess = useCallback((guess: string) => {
    if (isDrawer || !me || gameState.status !== 'playing' || gameState.guessedPlayerIds.includes(me.id)) {
      return;
    }
    
    // Add user message to chat
    setChatMessages(prev => [...prev, { type: 'user', player: me, message: guess }]);

    if (guess.toLowerCase() === wordToDraw.toLowerCase()) {
      playSound('correct_guess');
      addSystemMessage(`${me.nickname} guessed the word!`, true);

      // Score calculation
      const basePoints = 200;
      const timeBonus = Math.ceil((gameState.timer / room!.settings.drawTime) * 100);
      const isFirstGuesser = gameState.guessedPlayerIds.length === 0;
      const firstGuessBonus = isFirstGuesser ? 50 : 0;
      const totalPoints = basePoints + timeBonus + firstGuessBonus;

      setPlayers(prevPlayers => {
        const guessersCount = prevPlayers.length - 1;
        const newPlayers = prevPlayers.map(p => {
          if (p.id === me.id) { // Guesser's score
            return { ...p, score: p.score + totalPoints };
          }
          if (p.id === gameState.currentDrawerId) { // Drawer's score
            const drawerPoints = Math.round(300 / guessersCount);
            return { ...p, score: p.score + drawerPoints };
          }
          return p;
        });

        const newGuessedIds = [...gameState.guessedPlayerIds, me.id];
        
        // Check if everyone guessed
        if (newGuessedIds.length === guessersCount) {
             const allGuessedDrawerBonus = 200;
             const allGuessedGuesserBonus = 50;
             const finalPlayers = newPlayers.map(p => {
                if (p.id === gameState.currentDrawerId) {
                    return {...p, score: p.score + allGuessedDrawerBonus };
                }
                if (newGuessedIds.includes(p.id)) {
                    return {...p, score: p.score + allGuessedGuesserBonus };
                }
                return p;
             });
             setGameState(prev => ({ ...prev, guessedPlayerIds: newGuessedIds }));
             setPlayers(finalPlayers);
             endRound('all_guessed');
             return finalPlayers; // early return
        }

        setGameState(prev => ({ ...prev, guessedPlayerIds: newGuessedIds }));
        return newPlayers;
      });
    }
  }, [isDrawer, me, gameState, room, wordToDraw, endRound, addSystemMessage, playSound]);

  const createRoom = useCallback((roomName: string, isPrivate: boolean, settings: GameSettings) => {
    const newRoom: Room = {
      id: 'local',
      name: roomName,
      isPrivate,
      settings,
    };
    setRoom(newRoom);
    setGameState(initialGameState);
    setPlayers([]);
    setChatMessages([]);
  }, []);

  const addPlayer = useCallback((playerName: string) => {
    setPlayers(prev => {
        // Prevent duplicate names by adding a number
        let newName = playerName;
        let counter = 2;
        while(prev.some(p => p.nickname === newName)) {
            newName = `${playerName} ${counter}`;
            counter++;
        }
        const newPlayer: Player = { id: newName, nickname: newName, score: 0, isHost: false };
        return [...prev, newPlayer];
    });
  }, []);

  const setHost = useCallback(() => {
      setPlayers(prev => {
          if (prev.length > 0 && !prev.some(p => p.isHost)) {
              const newPlayers = [...prev];
              newPlayers[0].isHost = true;
              return newPlayers;
          }
          return prev;
      })
  }, []);

  const setNickname = useCallback((name: string) => {
    setNicknameState(name);
  }, [setNicknameState]);

  const clearCanvas = useCallback(() => {
      setDrawingHistory([]);
  }, []);

  const undoLastDraw = useCallback(() => {
      setDrawingHistory(prev => prev.slice(0, -1));
  }, []);

  const resetGame = useCallback(() => {
      setIsLeaderboardOpen(false);
      setFinalScores([]);
      startGame();
  }, [startGame]);

  return {
    room,
    players,
    gameState,
    me,
    isDrawer,
    wordToDraw,
    wordDisplay,
    wordChoices,
    finalScores,
    isLeaderboardOpen,
    startGame,
    selectWord,
    submitGuess,
    createRoom,
    addPlayer,
    setHost,
    chatMessages,
    drawingHistory,
    setDrawingHistory,
    clearCanvas,
    undoLastDraw,
    resetGame,
    isNicknameSet: !!nickname,
    setNickname,
  };
};

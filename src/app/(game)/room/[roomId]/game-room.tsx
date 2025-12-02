
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSocket } from '@/contexts/socket-context';
import Canvas from './canvas';
import Chat from './chat';
import PlayerList from './player-list';
import WordChoiceModal from './word-choice-modal';
import LeaderboardDialog from './leaderboard-dialog';
import { Button } from '@/components/ui/button';
import { Copy, Users, Home, Loader2, Play, MessageSquare, Volume2, VolumeX } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import NicknameDialog from './nickname-dialog';
import { useToast } from '@/hooks/use-toast';
import useLocalStorage from '@/hooks/use-local-storage';
import { useAudio } from '@/hooks/use-audio';

export default function GameRoom() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { socket, room, me, isConnected, setRoomId, chatMessages, finalScores, setFinalScores } = useSocket();
  const { isMuted, toggleMute } = useAudio();
  const [nickname, setNickname] = useLocalStorage('nickname', '');
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  
  const roomId = params.roomId as string;

  useEffect(() => {
    if (roomId) {
        setRoomId(roomId);
    }
    
    if (isConnected && !nickname) {
        setIsNicknameModalOpen(true);
    } else if (isConnected && nickname && roomId && !me) {
        socket?.emit('joinRoom', { roomId: roomId, nickname });
    }
  }, [isConnected, nickname, roomId, setRoomId, me, socket]);
  
  // Re-join if disconnected and reconnected
  useEffect(() => {
    if (isConnected && socket && roomId && !me && nickname) {
        socket.emit('joinRoom', { roomId, nickname });
    }
  }, [isConnected, socket, me, nickname, roomId]);

  useEffect(() => {
    if (!socket) return;
    
    const handleChooseWord = (words: string[]) => {
      setWordChoices(words);
    };

    const handleFinalScores = (scores: any) => {
        setFinalScores(scores);
        setIsLeaderboardOpen(true);
    };
    
    const handleJoinedRoom = () => {
        // Successfully joined, can close nickname modal if it was open for re-joining
        setIsNicknameModalOpen(false);
    }

    socket.on('chooseWord', handleChooseWord);
    socket.on('finalScores', handleFinalScores);
    socket.on('joinedRoom', handleJoinedRoom);

    return () => {
      socket.off('chooseWord', handleChooseWord);
      socket.off('finalScores', handleFinalScores);
      socket.off('joinedRoom', handleJoinedRoom);
    };
  }, [socket, setFinalScores]);

  useEffect(() => {
    if (room?.gameState.status === 'ended') {
      setIsLeaderboardOpen(true);
    } else {
      setIsLeaderboardOpen(false);
    }
  }, [room?.gameState.status]);

  const handleStartGame = () => {
    socket?.emit('startGame', room?.id);
  };

  const handleWordSelect = (selectedWord: string) => {
    socket?.emit('wordChosen', { roomId: room?.id, word: selectedWord });
    setWordChoices([]);
  };
  
  const handlePlayAgain = () => {
    socket?.emit('resetGame', room?.id);
    setIsLeaderboardOpen(false);
  }
  
  const handleConfirmNickname = (name: string) => {
    setNickname(name);
    setIsNicknameModalOpen(false);
    if(roomId) {
        socket?.emit('joinRoom', { roomId: roomId, nickname: name });
    }
  }

  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: 'Invite link copied!' });
  };
  
  const { gameState, players, settings, drawingHistory } = room || {};
  const isDrawer = me?.id === gameState?.currentDrawerId;
  const currentDrawer = players?.find(p => p.id === gameState?.currentDrawerId);

  const wordDisplay = useMemo(() => {
    if (!gameState?.word) return '';
    if (isDrawer || gameState.status === 'ended_round' || gameState.status === 'ended') return gameState.word;
    
    const revealedLetters = new Set<number>();
    gameState.word.split('').forEach((char, index) => {
        if (char === ' ') revealedLetters.add(index);
    });

    if (settings?.hints && settings.hints > 0 && gameState.timer > 0) {
        const timePerHint = Math.floor(settings.drawTime / (settings.hints + 1));
        const hintsToShow = Math.floor((settings.drawTime - gameState.timer) / timePerHint);

        if (hintsToShow > 0) {
            const wordWithoutSpaces = gameState.word.replace(/ /g, '');
            const lettersToRevealCount = Math.floor(wordWithoutSpaces.length * (0.2 * hintsToShow));
            const availableIndices = gameState.word.split('').map((_, i) => i).filter(i => gameState.word[i] !== ' ');
            
            while(revealedLetters.size < lettersToRevealCount + (gameState.word.split(' ').length - 1) && revealedLetters.size < gameState.word.length) {
                const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
                if(!revealedLetters.has(randomIndex)) {
                    revealedLetters.add(randomIndex);
                }
            }
        }
    }

    return gameState.word.split('').map((char, index) => {
        return revealedLetters.has(index) ? char : '_';
    }).join('');
  }, [gameState?.word, isDrawer, gameState?.status, gameState?.timer, settings?.drawTime, settings?.hints]);

  if (!isConnected || !room || !me) {
    return (
        <>
         <NicknameDialog 
            isOpen={isNicknameModalOpen}
            onConfirm={handleConfirmNickname}
        />
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4">{isConnected ? 'Joining room...' : 'Connecting to game...'}</p>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col p-2 sm:p-4 gap-4">
      <header className="flex-shrink-0 flex justify-between items-center rounded-lg bg-card p-2 border">
        <h1 className="text-lg sm:text-xl font-bold text-primary">{room.name}</h1>
        <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="outline" size="sm" onClick={toggleMute}>
                {isMuted ? <VolumeX className="w-4 h-4"/> : <Volume2 className="w-4 h-4"/>}
            </Button>
            <Button variant="outline" size="sm" onClick={copyInviteLink}><Copy className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Invite</span></Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/')}><Home className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Lobby</span></Button>
        </div>
      </header>
      
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        <aside className="hidden lg:flex lg:col-span-1 order-2 lg:order-1 flex-col gap-4 min-h-0">
          <PlayerList players={players} currentDrawerId={gameState.currentDrawerId} guessedPlayerIds={gameState.guessedPlayerIds} />
        </aside>
        
        <main className="lg:col-span-2 order-1 lg:order-2 bg-card rounded-lg border flex flex-col min-h-0">
            <div className="flex-shrink-0 flex justify-around items-center p-2 text-center border-b">
                <div><span className="text-xs sm:text-sm text-muted-foreground">Round</span><br/><span className="font-bold text-sm sm:text-base">{Math.min(gameState.currentRound + 1, settings.rounds)} / {settings.rounds}</span></div>
                <div className="text-base sm:text-lg font-bold tracking-widest text-center flex-1 px-2">
                    {wordDisplay.split('').join(' ')}
                </div>
                <div><span className="text-xs sm:text-sm text-muted-foreground">Time</span><br/><span className="font-bold text-sm sm:text-base">{gameState.timer}</span></div>
            </div>
            
            <div className="flex-grow relative">
                 {gameState.status === 'waiting' && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10 rounded-b-lg">
                        <p className="text-xl sm:text-2xl text-white mb-2">Waiting for players...</p>
                        <p className="text-white mb-4"><Users className="inline h-4 w-4 mr-1"/> {players.length} / {settings.maxPlayers}</p>
                        {me?.isHost && players.length > 1 && (
                            <Button onClick={handleStartGame} size="lg"><Play className="h-5 w-5 mr-2"/> Start Game</Button>
                        )}
                         {me?.isHost && players.length < 2 && (
                            <p className="text-white">You need at least 2 players to start.</p>
                        )}
                    </div>
                 )}
                 {gameState.status === 'choosing_word' && !isDrawer && currentDrawer && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10 rounded-b-lg">
                        <p className="text-xl sm:text-2xl text-white mb-2">{currentDrawer.nickname} is choosing a word...</p>
                        <Loader2 className="h-8 w-8 animate-spin text-white"/>
                    </div>
                 )}
                  {gameState.status === 'ended_round' && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10 rounded-b-lg">
                        <p className="text-xl sm:text-2xl text-white mb-2">Round Over!</p>
                        <p className="text-white mb-4">The word was: <span className="font-bold">{gameState.word}</span></p>
                    </div>
                 )}
                <Canvas 
                    isDrawer={!!isDrawer}
                    drawingHistory={drawingHistory}
                />
            </div>
        </main>
        
        <aside className="hidden lg:flex lg:col-span-1 order-3 flex-col min-h-0">
          <Chat isDrawer={!!isDrawer} />
        </aside>
      </div>

       <div className="lg:hidden fixed bottom-4 right-4 z-20">
          <Sheet>
            <SheetTrigger asChild>
                <Button size="icon" className="rounded-full h-14 w-14 shadow-lg">
                    <MessageSquare className="h-7 w-7" />
                </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[75vh] p-0 flex flex-col">
                <PlayerList players={players} currentDrawerId={gameState.currentDrawerId} guessedPlayerIds={gameState.guessedPlayerIds} />
                <Chat isDrawer={!!isDrawer} />
            </SheetContent>
          </Sheet>
       </div>
      
      <WordChoiceModal
        isOpen={gameState.status === 'choosing_word' && !!isDrawer}
        words={wordChoices}
        onSelectWord={handleWordSelect}
        time={5}
      />
      
      <LeaderboardDialog
        isOpen={isLeaderboardOpen}
        scores={finalScores}
        onPlayAgain={handlePlayAgain}
        isHost={me?.isHost || false}
      />

       <NicknameDialog 
            isOpen={isNicknameModalOpen && !me}
            onConfirm={handleConfirmNickname}
        />
    </div>
  );
}

    

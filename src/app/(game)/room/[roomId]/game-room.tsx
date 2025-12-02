
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/contexts/socket-context';
import useLocalStorage from '@/hooks/use-local-storage';
import { useToast } from '@/hooks/use-toast';
import type { Room, Player, SystemMessage } from '@/types';
import Canvas from './canvas';
import Chat from './chat';
import PlayerList from './player-list';
import WordChoiceModal from './word-choice-modal';
import LeaderboardDialog from './leaderboard-dialog';
import { Button } from '@/components/ui/button';
import { Copy, Users, Home, Loader2, Play, MessageSquare, Eye } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import NicknameDialog from './nickname-dialog';


export default function GameRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { socket, isConnected } = useSocket();
  const [nickname, setNickname] = useLocalStorage('nickname', '');
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [wordToDraw, setWordToDraw] = useState('');
  const [revealedWord, setRevealedWord] = useState('');
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [finalScores, setFinalScores] = useState<Player[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isNicknameDialogOpen, setIsNicknameDialogOpen] = useState(false);

  const me = room?.players.find(p => p.id === socket?.id);
  const isDrawer = me?.id === room?.gameState.currentDrawer;
  
  useEffect(() => {
    if (!nickname) {
        setIsNicknameDialogOpen(true);
    }
  }, [nickname]);
  
  useEffect(() => {
    if (!isConnected || !socket || !nickname) return;

    socket.emit('joinRoom', { roomId, player: { nickname } }, (response: { status: string; room?: Room; message?: string }) => {
      if (response.status !== 'ok') {
        toast({ variant: 'destructive', title: 'Could not join room', description: response.message });
        router.push('/');
      } else if (response.room) {
        setRoom(response.room);
      }
    });

    const onRoomState = (newRoom: Room) => setRoom(newRoom);
    const onTimerUpdate = (time: number) => setTimeLeft(time);
    const onWordUpdate = ({ word, forDrawer }: { word: string, forDrawer?: boolean }) => {
      if (isDrawer || forDrawer) {
        setWordToDraw(word);
      } else {
        setWordToDraw(word);
      }
    };
    const onChooseWord = (choices: string[]) => setWordChoices(choices);
    const onGameOver = (scores: Player[]) => {
      setFinalScores(scores);
      setIsLeaderboardOpen(true);
    };
    const onRoundEnd = ({ word }: { word: string }) => {
        setRevealedWord(word);
        setTimeout(() => setRevealedWord(''), 5000);
    }
    const onSystemMessage = (msg: SystemMessage) => {
        // Prevent toast spam by checking message content
        if (!msg.content.includes("guessed the word")) {
            toast({ title: msg.content, duration: 2000 });
        }
    };

    socket.on('roomState', onRoomState);
    socket.on('timerUpdate', onTimerUpdate);
    socket.on('wordUpdate', onWordUpdate);
    socket.on('chooseWord', onChooseWord);
    socket.on('gameOver', onGameOver);
    socket.on('roundEnd', onRoundEnd);
    socket.on('systemMessage', onSystemMessage);
    
    return () => {
      socket.off('roomState', onRoomState);
      socket.off('timerUpdate', onTimerUpdate);
      socket.off('wordUpdate', onWordUpdate);
      socket.off('chooseWord', onChooseWord);
      socket.off('gameOver', onGameOver);
      socket.off('roundEnd', onRoundEnd);
      socket.off('systemMessage', onSystemMessage);
    };
  }, [isConnected, socket, roomId, nickname, router, toast, isDrawer]);

  const handleStartGame = () => {
    socket?.emit('startGame', { roomId });
  };
  
  const handleWordSelect = (word: string) => {
    socket?.emit('wordChosen', { roomId, word });
    setWordToDraw(word);
    setWordChoices([]);
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: 'Invite link copied!' });
  };
  
  if (!nickname) {
    return <NicknameDialog 
                isOpen={isNicknameDialogOpen} 
                setIsOpen={setIsNicknameDialogOpen} 
                onConfirm={setNickname} 
            />;
  }
  
  if (!room) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4">Joining room...</p>
      </div>
    );
  }

  const { gameState, players, settings } = room;
  const wordDisplay = revealedWord ? revealedWord : (isDrawer ? wordToDraw : wordToDraw.split('').join(' '));

  return (
    <div className="flex h-screen flex-col p-2 sm:p-4 gap-4">
      <header className="flex-shrink-0 flex justify-between items-center rounded-lg bg-card p-2 border">
        <h1 className="text-lg sm:text-xl font-bold text-primary">{room.name}</h1>
        <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="outline" size="sm" onClick={copyInviteLink}><Copy className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Invite</span></Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/')}><Home className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Lobby</span></Button>
        </div>
      </header>
      
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        <aside className="hidden lg:flex lg:col-span-1 order-2 lg:order-1 flex-col gap-4 min-h-0">
          <PlayerList players={players} currentDrawerId={gameState.currentDrawer} />
        </aside>
        
        <main className="lg:col-span-2 order-1 lg:order-2 bg-card rounded-lg border flex flex-col min-h-0">
            <div className="flex-shrink-0 flex justify-around items-center p-2 text-center border-b">
                <div><span className="text-xs sm:text-sm text-muted-foreground">Round</span><br/><span className="font-bold text-sm sm:text-base">{gameState.currentRound} / {settings.rounds}</span></div>
                <div className="text-base sm:text-lg font-bold tracking-widest text-center flex-1 px-2">
                    {gameState.status === 'playing' ? wordDisplay : 'Waiting...'}
                </div>
                <div><span className="text-xs sm:text-sm text-muted-foreground">Time</span><br/><span className="font-bold text-sm sm:text-base">{timeLeft}</span></div>
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
                <Canvas roomId={roomId} isDrawer={!!isDrawer} />
            </div>
        </main>
        
        <aside className="hidden lg:flex lg:col-span-1 order-3 flex-col min-h-0">
          <Chat roomId={roomId} players={players} me={me} isDrawer={!!isDrawer} />
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
                <PlayerList players={players} currentDrawerId={gameState.currentDrawer} />
                <Chat roomId={roomId} players={players} me={me} isDrawer={!!isDrawer} />
            </SheetContent>
          </Sheet>
       </div>
      
      <WordChoiceModal
        isOpen={wordChoices.length > 0 && !!isDrawer}
        words={wordChoices}
        onSelectWord={handleWordSelect}
        time={15}
      />
      
      <LeaderboardDialog
        isOpen={isLeaderboardOpen}
        onOpenChange={setIsLeaderboardOpen}
        scores={finalScores}
        onPlayAgain={handleStartGame}
        isHost={me?.isHost || false}
      />
    </div>
  );
}

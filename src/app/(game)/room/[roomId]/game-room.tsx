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
import { Copy, Users, Home, Loader2, Play } from 'lucide-react';

export default function GameRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { socket, isConnected } = useSocket();
  const [nickname] = useLocalStorage('nickname', '');
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [wordToDraw, setWordToDraw] = useState('');
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [finalScores, setFinalScores] = useState<Player[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const me = room?.players.find(p => p.id === socket?.id);
  const isDrawer = me?.id === room?.gameState.currentDrawer;
  
  useEffect(() => {
    if (!isConnected || !socket) return;
    if (!nickname) {
      router.push('/');
      return;
    }

    socket.emit('joinRoom', { roomId, player: { nickname } }, (response: { status: string; room?: Room; message?: string }) => {
      if (response.status === 'ok' && response.room) {
        setRoom(response.room);
        setTimeLeft(response.room.gameState.timer)
      } else {
        toast({ variant: 'destructive', title: 'Could not join room', description: response.message });
        router.push('/');
      }
    });

    const onRoomState = (newRoom: Room) => setRoom(newRoom);
    const onTimerUpdate = (time: number) => setTimeLeft(time);
    const onWordUpdate = (word: string) => setWordToDraw(word);
    const onChooseWord = (choices: string[]) => setWordChoices(choices);
    const onGameOver = (scores: Player[]) => {
      setFinalScores(scores);
      setIsLeaderboardOpen(true);
    };
    const onSystemMessage = (msg: SystemMessage) => {
        toast({ title: msg.content, duration: 2000 });
    };

    socket.on('roomState', onRoomState);
    socket.on('timerUpdate', onTimerUpdate);
    socket.on('wordUpdate', onWordUpdate);
    socket.on('chooseWord', onChooseWord);
    socket.on('gameOver', onGameOver);
    socket.on('systemMessage', onSystemMessage);
    
    return () => {
      socket.off('roomState', onRoomState);
      socket.off('timerUpdate', onTimerUpdate);
      socket.off('wordUpdate', onWordUpdate);
      socket.off('chooseWord', onChooseWord);
      socket.off('gameOver', onGameOver);
      socket.off('systemMessage', onSystemMessage);
    };
  }, [isConnected, socket, roomId, nickname, router, toast]);

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
  
  if (!room) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const { gameState } = room;

  return (
    <div className="flex h-screen flex-col p-4 gap-4">
      <header className="flex-shrink-0 flex justify-between items-center rounded-lg bg-card p-2 border">
        <h1 className="text-xl font-bold text-primary">{room.name}</h1>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyInviteLink}><Copy className="w-4 h-4 mr-2" /> Invite</Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/')}><Home className="w-4 h-4 mr-2" /> Lobby</Button>
        </div>
      </header>
      
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        <aside className="lg:col-span-1 order-2 lg:order-1 flex flex-col gap-4 min-h-0">
          <PlayerList players={room.players} currentDrawerId={gameState.currentDrawer} />
        </aside>
        
        <main className="lg:col-span-2 order-1 lg:order-2 bg-card rounded-lg border flex flex-col min-h-0">
            <div className="flex-shrink-0 flex justify-around items-center p-2 text-center border-b">
                <div><span className="text-sm text-muted-foreground">Round</span><br/><span className="font-bold">{gameState.currentRound} / {room.settings.rounds}</span></div>
                <div className="text-lg font-bold tracking-widest">{wordToDraw.split('').join(' ')}</div>
                <div><span className="text-sm text-muted-foreground">Time</span><br/><span className="font-bold">{timeLeft}</span></div>
            </div>
            
            <div className="flex-grow relative">
                 {gameState.status === 'waiting' && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10 rounded-b-lg">
                        <p className="text-2xl text-white mb-2">Waiting for players...</p>
                        <p className="text-white mb-4"><Users className="inline h-4 w-4 mr-1"/> {room.players.length} / {room.settings.maxPlayers}</p>
                        {me?.isHost && room.players.length > 1 && (
                            <Button onClick={handleStartGame} size="lg"><Play className="h-5 w-5 mr-2"/> Start Game</Button>
                        )}
                    </div>
                 )}
                <Canvas roomId={roomId} isDrawer={isDrawer} />
            </div>
        </main>
        
        <aside className="lg:col-span-1 order-3 lg:order-3 flex flex-col min-h-0">
          <Chat roomId={roomId} players={room.players} me={me} isDrawer={isDrawer} />
        </aside>
      </div>
      
      <WordChoiceModal
        isOpen={wordChoices.length > 0 && isDrawer}
        words={wordChoices}
        onSelectWord={handleWordSelect}
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

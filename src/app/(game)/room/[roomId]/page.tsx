'use client';
import { useParams } from 'next/navigation';
import GameRoom from './game-room';
import { SocketProvider } from '@/contexts/socket-context';


export default function GameRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  
  return (
    <SocketProvider roomId={roomId}>
        <GameRoom />
    </SocketProvider>
  );
}

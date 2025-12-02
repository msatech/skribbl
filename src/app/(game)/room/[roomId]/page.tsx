import GameRoom from './game-room';

type GameRoomPageProps = {
  params: {
    roomId: string;
  };
};

export default function GameRoomPage({ params }: GameRoomPageProps) {
  return <GameRoom roomId={params.roomId} />;
}

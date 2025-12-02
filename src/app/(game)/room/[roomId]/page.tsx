import GameRoom from './game-room';

// This page is now a client component to access hooks and context
// The roomID from the URL isn't strictly necessary for offline mode,
// but we keep the structure for potential future enhancements.
export default function GameRoomPage() {
  return <GameRoom />;
}

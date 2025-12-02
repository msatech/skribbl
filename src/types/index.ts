
import { type DrawingAction as CanvasDrawingAction, type Line as CanvasLine } from "@/app/(game)/room/[roomId]/canvas";

// Re-exporting with a more specific name if needed, or just use it directly
export type DrawingAction = CanvasDrawingAction;
export type Line = CanvasLine;

export type Player = {
  id: string; // socket.id
  uuid: string; // persistent unique id
  nickname: string;
  score: number;
  isHost: boolean;
  connected: boolean;
};

export type Message = {
  player: Player;
  message: string;
};

export type SystemMessage = {
  content: string;
  isCorrectGuess?: boolean;
}

export type ChatMessage = ({ type: 'user' } & Message) | ({ type: 'system' } & SystemMessage);

export type GameSettings = {
  rounds: number;
  drawTime: number;
  maxPlayers: number;

  wordCount: number;
  wordLength: number;
  gameMode: 'normal' | 'combination';
  hints: number;
};

export type GameState = {
  status: 'waiting' | 'choosing_word' | 'playing' | 'ended_round' | 'ended';
  currentRound: number;
  currentDrawerId: string | null; // socket.id
  timer: number;
  guessedPlayerIds: string[]; // array of socket.id
  word: string;
  turn: number;
};

export type Room = {
  id: string;
  name: string;
  isPrivate: boolean;
  settings: GameSettings;
  players: Player[];
  gameState: GameState;
  drawingHistory: DrawingAction[];
  finalScores: Player[];
};

export type PublicRoom = {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

import { type DrawingAction } from "@/app/(game)/room/[roomId]/canvas";

export type Player = {
  id: string;
  nickname: string;
  score: number;
  isHost: boolean;
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
  currentDrawerId: string | null;
  timer: number;
  guessedPlayerIds: string[];
};

export type Room = {
  id: string;
  name: string;
  isPrivate: boolean;
  settings: GameSettings;
};

export type PublicRoom = {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

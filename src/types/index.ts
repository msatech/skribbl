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
}

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
  status: 'waiting' | 'playing' | 'ended';
  currentRound: number;
  currentDrawer: string | null;
  currentWord: string;
  timer: number;
  hintsUsed: number;
};

export type Room = {
  id: string;
  name: string;
  isPrivate: boolean;
  players: Player[];
  settings: GameSettings;
  gameState: GameState;
  drawingData: any[];
  guessedPlayers?: Set<string>;
};

export type PublicRoom = {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

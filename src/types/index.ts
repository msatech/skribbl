
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
  status: 'waiting' | 'choosing_word' | 'playing' | 'ended_round' | 'ended';
  currentRound: number;
  turn: number; // Index of the current player in the players array
  currentDrawer: string | null;
  currentWord: string;
  timer: number;
  hintsUsed: number;
  guessedPlayers: string[];
};

export type Room = {
  id: string;
  name: string;
  isPrivate: boolean;
  players: Player[];
  settings: GameSettings;
  gameState: GameState;
  drawingData: any[];
};

export type PublicRoom = {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

'use client';

import { Crown, Paintbrush, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Player } from '@/types';

type PlayerListProps = {
  players: Player[];
  currentDrawerId: string | null;
};

export default function PlayerList({ players, currentDrawerId }: PlayerListProps) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <Card className="flex-grow flex flex-col min-h-0">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary"/>
            Players
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto p-3">
        <ul className="space-y-3">
          <TooltipProvider>
          {sortedPlayers.map((player, index) => (
            <li key={`${player.id}-${index}`} className="flex items-center justify-between p-2 rounded-md bg-secondary">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{player.nickname.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{player.nickname}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-primary">{player.score}</span>
                {player.id === currentDrawerId && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Paintbrush className="h-5 w-5 text-accent" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Drawing</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {player.isHost && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Crown className="h-5 w-5 text-yellow-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Host</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </li>
          ))}
          </TooltipProvider>
        </ul>
      </CardContent>
    </Card>
  );
}

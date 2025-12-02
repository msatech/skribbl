'use client';

import { Crown, Paintbrush, Users, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Player } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type PlayerListProps = {
  players: Player[];
  currentDrawerId: string | null;
  guessedPlayerIds?: string[];
};

export default function PlayerList({ players, currentDrawerId, guessedPlayerIds = [] }: PlayerListProps) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <Card className="flex-grow flex flex-col min-h-0 lg:h-full">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary"/>
            Players ({players.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto p-3">
        <ScrollArea className="h-full">
          <ul className="space-y-3">
            <TooltipProvider>
            {sortedPlayers.map((player, index) => {
              const hasGuessed = guessedPlayerIds.includes(player.id);
              return (
              <li key={`${player.id}-${index}`} className={cn(
                  "flex items-center justify-between p-2 rounded-md bg-secondary transition-colors",
                  hasGuessed && "bg-green-100 dark:bg-green-900/30"
              )}>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{player.nickname.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium truncate">{player.nickname}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-primary">{player.score}</span>
                  {hasGuessed && player.id !== currentDrawerId && <CheckCircle2 className="h-5 w-5 text-green-500" />}
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
            )})}
            </TooltipProvider>
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Play, LogOut } from 'lucide-react';
import type { Player } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';


type LeaderboardDialogProps = {
  isOpen: boolean;
  scores: Player[];
  onPlayAgain: () => void;
  onLeave: () => void;
  isHost: boolean;
};

export default function LeaderboardDialog({ isOpen, scores, onPlayAgain, onLeave, isHost }: LeaderboardDialogProps) {
  if (scores.length === 0) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">Game Over!</DialogTitle>
          <DialogDescription className="text-center">Here are the final results.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <ul className="space-y-2">
            {scores.map((player, index) => (
              <li
                key={player.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg",
                  index === 0 && "bg-yellow-100 dark:bg-yellow-900/50 border-2 border-yellow-400",
                  index === 1 && "bg-gray-100 dark:bg-gray-800/50",
                  index === 2 && "bg-orange-100 dark:bg-orange-900/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg w-6 text-center">{index + 1}</span>
                   <Avatar className="h-8 w-8">
                    <AvatarFallback>{player.nickname.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{player.nickname}</span>
                </div>
                <div className="flex items-center gap-2">
                   {index === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
                  <span className="font-bold text-lg">{player.score}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        
        <DialogFooter className="sm:justify-between gap-2">
          {isHost ? (
            <Button onClick={onPlayAgain} className="w-full">
                <Play className="mr-2 h-4 w-4"/> Play Again
            </Button>
          ) : (
             <>
              <p className="text-sm text-muted-foreground text-center sm:text-left flex-1">Waiting for the host to start the next game...</p>
              <div className="flex gap-2 w-full sm:w-auto">
                 <Button onClick={onLeave} variant="outline" className="w-full sm:w-auto">
                    <LogOut className="mr-2 h-4 w-4"/> Leave
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
       
      </DialogContent>
    </Dialog>
  );
}


'use client';

import { useState, useEffect, useRef } from 'react';
import { useGame } from '@/contexts/game-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Player, ChatMessage } from '@/types';

type ChatProps = {
  players: Player[];
  me: Player | undefined;
  isDrawer: boolean;
  onSendMessage: (guess: string) => void;
};

export default function Chat({ players, me, isDrawer, onSendMessage }: ChatProps) {
  const [newMessage, setNewMessage] = useState('');
  const { chatMessages } = useGame();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if(viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && !isDrawer) {
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };

  return (
    <div className="bg-card rounded-lg border flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 p-3 border-b flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary"/>
        <h2 className="font-semibold">Chat & Guesses</h2>
      </div>
      <ScrollArea className="flex-grow p-3" ref={scrollAreaRef}>
        <div className="space-y-4">
          {chatMessages.map((msg, index) => (
            <div key={index} className={cn('flex items-start gap-3', msg.type === 'system' && 'justify-center')}>
              {msg.type === 'user' ? (
                <>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{msg.player.nickname.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{msg.player.nickname}</p>
                    <p className="text-sm bg-secondary p-2 rounded-md">{msg.message}</p>
                  </div>
                </>
              ) : (
                <p className={cn("text-sm italic text-muted-foreground bg-muted px-2 py-1 rounded-md", msg.isCorrectGuess && "bg-green-200 text-green-800")}>{msg.content}</p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="flex-shrink-0 p-3 border-t">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isDrawer ? "You're the drawer!" : 'Type your guess...'}
            disabled={isDrawer}
            autoComplete="off"
          />
          <Button type="submit" size="icon" disabled={isDrawer || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

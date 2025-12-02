'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Room, Player, ChatMessage, DrawingAction, Line } from '@/types';
import { useAudio, Sound } from '@/hooks/use-audio';
import { useToast } from '@/hooks/use-toast';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  room: Room | null;
  me: Player | null;
  roomId: string | null;
  setRoomId: (id: string | null) => void;
  chatMessages: ChatMessage[];
  finalScores: Player[];
  setFinalScores: (scores: Player[]) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export const SocketProvider = ({ children, roomId: initialRoomId }: { children: ReactNode, roomId?: string }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId || null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [finalScores, setFinalScores] = useState<Player[]>([]);
  const { playSound } = useAudio();
  const { toast } = useToast();

  useEffect(() => {
    const socketInstance = io(SERVER_URL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('Connected to socket server');
      setIsConnected(true);
      if(roomId && localStorage.getItem('nickname')) {
          socketInstance.emit('joinRoom', { roomId, nickname: localStorage.getItem('nickname') });
      }
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from socket server');
      setIsConnected(false);
      setRoom(null);
      setChatMessages(prev => [...prev, { type: 'system', content: 'You have been disconnected. Attempting to reconnect...' }]);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [roomId]);
  
  useEffect(() => {
    if(!socket) return;
    
    const handleRoomState = (newRoomState: Room) => {
        setRoom(newRoomState);
    };

    const handleSystemMessage = (message: { content: string, isCorrectGuess?: boolean }) => {
        setChatMessages(prev => [...prev, { type: 'system', ...message }]);
    };
    
    const handleChatMessage = (message: { player: Player, message: string }) => {
        setChatMessages(prev => [...prev, { type: 'user', ...message }]);
    };

    const handleDrawingAction = (action: DrawingAction) => {
      setRoom(prevRoom => {
        if (!prevRoom) return null;
        let newHistory = [...prevRoom.drawingHistory];
        
        if (action.tool === 'clear') {
          newHistory = [];
        } else if (action.tool === 'undo') {
           // Server now sends the complete history on undo, so we just replace it
           // This is a placeholder, as the main 'roomState' event should handle this more cleanly.
           // However, for immediate visual feedback, we can try to replicate server logic.
           const lastLineStartIndex = newHistory.map(a => a.tool === 'pencil' || a.tool === 'eraser').lastIndexOf(true);
           if (lastLineStartIndex !== -1) {
             newHistory = newHistory.slice(0, lastLineStartIndex);
           } else {
             newHistory = [];
           }
        } else if (action.tool === 'pencil' || action.tool === 'eraser') {
          const lastAction = newHistory[newHistory.length - 1];
          // If the last action was a point in the same continuous stroke, append to it.
          if (isDrawingContinuousLine(lastAction, action)) {
            (lastAction as Line).points.push(...(action as Line).points);
          } else {
            // Otherwise, it's a new line segment.
            newHistory.push(action);
          }
        } else {
          // For 'fill', just add the action. Redraw will handle it.
          newHistory.push(action);
        }
        
        return { ...prevRoom, drawingHistory: newHistory };
      });
    };

    const isDrawingContinuousLine = (lastAction: DrawingAction | undefined, currentAction: DrawingAction): boolean => {
        if (!lastAction || lastAction.tool !== currentAction.tool) return false;
        if (lastAction.tool !== 'pencil' && lastAction.tool !== 'eraser') return false;
        if (currentAction.tool !== 'pencil' && currentAction.tool !== 'eraser') return false;
        // This is a simple check. A more robust system might use stroke IDs.
        return true;
    }


    const handleTimerUpdate = (time: number) => {
        setRoom(prev => prev ? { ...prev, gameState: {...prev.gameState, timer: time} } : null);
    };

    const handleSound = (sound: Sound) => {
        playSound(sound);
    };
    
    const handleError = ({ message }: { message: string }) => {
        toast({ variant: 'destructive', title: 'Error', description: message });
    };

    socket.on('roomState', handleRoomState);
    socket.on('systemMessage', handleSystemMessage);
    socket.on('chatMessage', handleChatMessage);
    socket.on('drawingAction', handleDrawingAction);
    socket.on('timerUpdate', handleTimerUpdate);
    socket.on('sound', handleSound);
    socket.on('error', handleError);

    return () => {
        socket.off('roomState', handleRoomState);
        socket.off('systemMessage', handleSystemMessage);
        socket.off('chatMessage', handleChatMessage);
        socket.off('drawingAction', handleDrawingAction);
        socket.off('timerUpdate', handleTimerUpdate);
        socket.off('sound', handleSound);
        socket.off('error', handleError);
    }

  }, [socket, playSound, toast]);

  const me = room && socket ? room.players.find(p => p.id === socket.id) : null;

  const value = {
    socket,
    isConnected,
    room,
    me,
    roomId,
    setRoomId,
    chatMessages,
    finalScores,
    setFinalScores,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

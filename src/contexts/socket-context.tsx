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
  }, []);
  
  useEffect(() => {
    if(!socket) return;
    
    const handleRoomState = (newRoomState: Room) => {
        // When drawing history is cleared or undone, the server sends the whole new history.
        // We can directly set it.
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
            const lastLineStartIndex = findLastContinuousStrokeIndex(newHistory);
            if (lastLineStartIndex !== -1) {
              // If it was a continuous line, slice off the whole segment
               newHistory = newHistory.slice(0, lastLineStartIndex);
            } else {
              // Otherwise, just pop the last action (dot, or something else)
              newHistory.pop();
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

    const findLastContinuousStrokeIndex = (history: DrawingAction[]): number => {
       const lastAction = history[history.length - 1];
       if (!lastAction || (lastAction.tool !== 'pencil' && lastAction.tool !== 'eraser')) return -1;
       
       if(lastAction.points.length > 1) { // This action itself is a line
          return history.length -1;
       }

       // Find the start of the line this single point belongs to
       for(let i = history.length - 2; i >= 0; i--) {
          const current = history[i];
          if(current.tool !== 'pencil' && current.tool !== 'eraser') return history.length -1;
           if(current.points.length > 1) return i; // Found the start of a previous line segment
       }
       return history.length - 1; // It's a single dot
    }

    const isDrawingContinuousLine = (lastAction: DrawingAction | undefined, currentAction: DrawingAction): boolean => {
        if (!lastAction || lastAction.tool !== currentAction.tool) return false;
        if (lastAction.tool !== 'pencil' && lastAction.tool !== 'eraser') return false;
        if (currentAction.tool !== 'pencil' && currentAction.tool !== 'eraser') return false;
        // This is a simple check. A more robust system might use stroke IDs.
        // It assumes sequential points of the same tool are part of the same line.
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


'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Room, Player, ChatMessage, DrawingAction } from '@/types';
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

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [finalScores, setFinalScores] = useState<Player[]>([]);
  const { playSound } = useAudio();
  const { toast } = useToast();
  
  useEffect(() => {
    const socketInstance = io(SERVER_URL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket'],
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
    
    socketInstance.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        if(err.message.includes('xhr poll error') || err.message.includes('timeout') || err.message.includes('websocket error')) {
            toast({ variant: 'destructive', title: 'Connection Error', description: 'Could not connect to the game server. Is it running?' });
        }
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [toast]);
  
  useEffect(() => {
    if(!socket) return;
    
    const handleRoomState = (newRoomState: Room) => {
        // When game restarts (goes from 'ended' to 'waiting'), clear local finalScores
        if (room?.gameState.status === 'ended' && newRoomState.gameState.status === 'waiting') {
            setFinalScores([]);
        }
        setRoom(newRoomState);
        // Clear chat when returning to the waiting state
        if(newRoomState.gameState.status === 'waiting') {
            setChatMessages([]);
        }
    };

    const handleSystemMessage = (message: { content: string, isCorrectGuess?: boolean }) => {
        setChatMessages(prev => [...prev, { type: 'system', ...message }]);
    };
    
    const handleChatMessage = (message: { player: Player, message: string }) => {
        setChatMessages(prev => [...prev, { type: 'user', ...message }]);
    };

    const handleDrawingAction = (action: DrawingAction) => {
      // Don't apply actions if you are the drawer, to prevent double-drawing
      if (socket.id === room?.gameState.currentDrawerId) return;
      
      setRoom(prevRoom => {
        if (!prevRoom) return null;

        // This is a full state replacement from the server, we just apply it
        if (action.tool === 'undo' || action.tool === 'clear') {
            // Server will send a full roomState update for undo/clear
            return prevRoom;
        }

        const newHistory = [...prevRoom.drawingHistory, action];
        return { ...prevRoom, drawingHistory: newHistory };
      });
    };

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

  }, [socket, playSound, toast, room?.gameState.currentDrawerId, room?.gameState.status]);

  const me = room && socket ? room.players.find(p => p.id === socket.id) || null : null;

  const value: SocketContextType = {
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

'use client';

import { useRef, useEffect, useState } from 'react';
import { useSocket } from '@/contexts/socket-context';
import Toolbar from './toolbar';

type CanvasProps = {
  roomId: string;
  isDrawer: boolean;
};

export default function Canvas({ roomId, isDrawer }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { socket } = useSocket();
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  
  const draw = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, size: number) => {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    
    // Resize canvas to fit container
    const resizeCanvas = () => {
        const parent = canvas.parentElement;
        if(parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const onDrawing = (data: any) => {
      const { fromX, fromY, toX, toY, color, size } = data;
      draw(context, fromX, fromY, toX, toY, color, size);
    };

    const onClearCanvas = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
    
    socket?.on('drawing', onDrawing);
    socket?.on('clearCanvas', onClearCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      socket?.off('drawing', onDrawing);
      socket?.off('clearCanvas', onClearCanvas);
    };
  }, [socket]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    const { offsetX, offsetY } = getCoords(e);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.beginPath();
    context.moveTo(offsetX, offsetY);
  };

  const stopDrawing = () => {
    if (!isDrawer) return;
    setIsDrawing(false);
  };

  const handleDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isDrawer) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { offsetX, offsetY } = getCoords(e);
    const lastX = context.canvas.dataset.lastX ? parseFloat(context.canvas.dataset.lastX) : offsetX;
    const lastY = context.canvas.dataset.lastY ? parseFloat(context.canvas.dataset.lastY) : offsetY;
    
    draw(context, lastX, lastY, offsetX, offsetY, brushColor, brushSize);

    socket?.emit('drawing', {
      roomId,
      data: { fromX: lastX, fromY: lastY, toX: offsetX, toY: offsetY, color: brushColor, size: brushSize },
    });

    context.canvas.dataset.lastX = offsetX.toString();
    context.canvas.dataset.lastY = offsetY.toString();
  };
  
  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { offsetX: 0, offsetY: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e.nativeEvent) {
      return {
        offsetX: e.nativeEvent.touches[0].clientX - rect.left,
        offsetY: e.nativeEvent.touches[0].clientY - rect.top,
      };
    }
    return { offsetX: e.nativeEvent.offsetX, offsetY: e.nativeEvent.offsetY };
  };

  const handleClearCanvas = () => {
    socket?.emit('clearCanvas', { roomId });
  };

  return (
    <div className={`w-full h-full relative ${isDrawer ? 'cursor-crosshair' : 'cursor-not-allowed'}`}>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onMouseMove={handleDrawing}
        onTouchStart={startDrawing}
        onTouchEnd={stopDrawing}
        onTouchMove={handleDrawing}
        className="w-full h-full bg-white rounded-b-lg"
      />
      {isDrawer && (
        <Toolbar 
            brushColor={brushColor}
            setBrushColor={setBrushColor}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            onClear={handleClearCanvas}
        />
      )}
    </div>
  );
}

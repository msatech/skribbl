'use client';

import { useRef, useEffect, useState } from 'react';
import { useSocket } from '@/contexts/socket-context';
import Toolbar from './toolbar';

type CanvasProps = {
  roomId: string;
  isDrawer: boolean;
};

type DrawingPoint = { x: number; y: number };
type Line = {
  tool: 'pencil' | 'eraser';
  points: DrawingPoint[];
  color: string;
  size: number;
}
type Fill = {
  tool: 'fill';
  x: number;
  y: number;
  color: string;
}
type DrawingAction = Line | Fill;

export default function Canvas({ roomId, isDrawer }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { socket } = useSocket();
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [drawingHistory, setDrawingHistory] = useState<DrawingAction[]>([]);
  const [currentTool, setCurrentTool] = useState('pencil');
  
  const getContext = () => canvasRef.current?.getContext('2d', { willReadFrequently: true });
  
  const redrawCanvas = (history: DrawingAction[]) => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      history.forEach(action => {
        if (action.tool === 'pencil' || action.tool === 'eraser') {
          drawSingleLine(ctx, action);
        } else if (action.tool === 'fill') {
          performFloodFill(ctx, action.x, action.y, hexToRgb(action.color));
        }
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        redrawCanvas(drawingHistory);
      }
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    const onDrawing = (data: DrawingAction) => {
      setDrawingHistory(prev => [...prev, data]);
      const ctx = getContext();
      if(!ctx) return;
      if (data.tool === 'pencil' || data.tool === 'eraser') {
        drawSingleLine(ctx, data);
      } else if (data.tool === 'fill') {
        performFloodFill(ctx, data.x, data.y, hexToRgb(data.color));
      }
    };

    const onClearCanvas = () => {
      const ctx = getContext();
      if(ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      setDrawingHistory([]);
    };
    
    const onUndo = ({ history }: {history: DrawingAction[]}) => {
        setDrawingHistory(history);
        redrawCanvas(history);
    }
    
    const onDrawingHistory = (history: DrawingAction[]) => {
      setDrawingHistory(history);
      redrawCanvas(history);
    }

    socket?.on('drawing', onDrawing);
    socket?.on('clearCanvas', onClearCanvas);
    socket?.on('undo', onUndo);
    socket?.on('drawingHistory', onDrawingHistory);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      socket?.off('drawing', onDrawing);
      socket?.off('clearCanvas', onClearCanvas);
      socket?.off('undo', onUndo);
      socket?.off('drawingHistory', onDrawingHistory);
    };
  }, [socket, drawingHistory]);
  
  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const event = 'touches' in e.nativeEvent ? e.nativeEvent.touches[0] : e.nativeEvent;
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer) return;
    const { x, y } = getCoords(e);
    
    if (currentTool === 'pencil' || currentTool === 'eraser') {
      setIsDrawing(true);
      const color = currentTool === 'eraser' ? '#FFFFFF' : brushColor;
      const newLine: Line = { tool: currentTool, points: [{ x, y }], color, size: brushSize };
      setDrawingHistory(prev => [...prev, newLine]);
    }
    else if (currentTool === 'fill') {
       handleFill(x, y);
    }
  };
  
  const handleFill = (x: number, y: number) => {
    const ctx = getContext();
    if(!ctx) return;
    
    const color = brushColor;
    const fillAction: Fill = { tool: 'fill', x, y, color };

    performFloodFill(ctx, x, y, hexToRgb(color));
    setDrawingHistory(prev => [...prev, fillAction]);
    socket?.emit('drawing', { roomId, data: fillAction });
  }
  
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isDrawer) return;
    const ctx = getContext();
    if (!ctx) return;

    const { x, y } = getCoords(e);
    const currentLine = drawingHistory[drawingHistory.length - 1];

    if (currentLine && (currentLine.tool === 'pencil' || currentLine.tool === 'eraser')) {
      currentLine.points.push({ x, y });
      drawSingleLine(ctx, currentLine);
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    const currentLine = drawingHistory[drawingHistory.length - 1];
    if(currentLine && (currentLine.tool === 'pencil' || currentLine.tool === 'eraser')) {
       socket?.emit('drawing', { roomId, data: currentLine });
    }
  };

  const drawSingleLine = (ctx: CanvasRenderingContext2D, line: Line) => {
    if (line.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(line.points[0].x, line.points[0].y);
    for (let i = 1; i < line.points.length; i++) {
      ctx.lineTo(line.points[i].x, line.points[i].y);
    }
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const handleClearCanvas = () => socket?.emit('clearCanvas', { roomId });
  const handleUndo = () => {
    const newHistory = drawingHistory.slice(0, -1);
    setDrawingHistory(newHistory);
    redrawCanvas(newHistory);
    socket?.emit('undo', {roomId, history: newHistory});
  }

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
  }
  
 const performFloodFill = (ctx: CanvasRenderingContext2D, x: number, y: number, fillColor: {r:number, g:number, b:number} | null) => {
    if (!fillColor) return;
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const { width, height, data } = imageData;
    const startPos = (Math.round(y) * width + Math.round(x)) * 4;
    const startColor = { r: data[startPos], g: data[startPos + 1], b: data[startPos + 2], a: data[startPos + 3] };

    if (fillColor.r === startColor.r && fillColor.g === startColor.g && fillColor.b === startColor.b) return;

    const pixelStack = [[Math.round(x), Math.round(y)]];

    while (pixelStack.length) {
      const newPos = pixelStack.pop();
      if(!newPos) continue;
      let [currentX, currentY] = newPos;
      let pixelPos = (currentY * width + currentX) * 4;

      while (currentY >= 0 && matchStartColor(pixelPos, startColor, data)) {
        currentY -= 1;
        pixelPos -= width * 4;
      }
      pixelPos += width * 4;
      currentY += 1;
      let reachLeft = false;
      let reachRight = false;

      while (currentY < height && matchStartColor(pixelPos, startColor, data)) {
        colorPixel(pixelPos, fillColor, data);

        if (currentX > 0) {
          if (matchStartColor(pixelPos - 4, startColor, data)) {
            if (!reachLeft) {
              pixelStack.push([currentX - 1, currentY]);
              reachLeft = true;
            }
          } else if (reachLeft) {
            reachLeft = false;
          }
        }

        if (currentX < width - 1) {
          if (matchStartColor(pixelPos + 4, startColor, data)) {
            if (!reachRight) {
              pixelStack.push([currentX + 1, currentY]);
              reachRight = true;
            }
          } else if (reachRight) {
            reachRight = false;
          }
        }
        currentY += 1;
        pixelPos += width * 4;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };
  
  const matchStartColor = (pixelPos: number, color: {r:number, g:number, b:number, a:number}, data: Uint8ClampedArray) => {
    // Tolerance for color matching
    const tolerance = 10;
    return (
      Math.abs(data[pixelPos] - color.r) <= tolerance &&
      Math.abs(data[pixelPos + 1] - color.g) <= tolerance &&
      Math.abs(data[pixelPos + 2] - color.b) <= tolerance &&
      Math.abs(data[pixelPos + 3] - color.a) <= tolerance
    );
  };
  
  const colorPixel = (pixelPos: number, color: {r:number, g:number, b:number}, data: Uint8ClampedArray) => {
    data[pixelPos] = color.r;
    data[pixelPos + 1] = color.g;
    data[pixelPos + 2] = color.b;
    data[pixelPos + 3] = 255;
  };

  return (
    <div className={`w-full h-full relative touch-none ${isDrawer ? `cursor-crosshair` : 'cursor-not-allowed'}`}>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onMouseMove={draw}
        onTouchStart={startDrawing}
        onTouchEnd={stopDrawing}
        onTouchMove={draw}
        className="w-full h-full bg-white rounded-b-lg"
        style={{ cursor: isDrawer ? (currentTool === 'pencil' ? 'crosshair' : (currentTool === 'eraser' ? 'cell' : 'copy')) : 'not-allowed' }}
      />
      {isDrawer && (
        <Toolbar 
            brushColor={brushColor}
            setBrushColor={setBrushColor}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            onClear={handleClearCanvas}
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            onUndo={handleUndo}
            canUndo={drawingHistory.length > 0}
        />
      )}
    </div>
  );
}

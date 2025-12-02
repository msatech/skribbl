'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Toolbar from './toolbar';
import { useSocket } from '@/contexts/socket-context';

type DrawingPoint = { x: number; y: number };
export type Line = {
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
export type DrawingAction = Line | Fill | { tool: 'clear' } | { tool: 'undo' };

type CanvasProps = {
  isDrawer: boolean;
  drawingHistory: DrawingAction[];
};

export default function Canvas({ isDrawer, drawingHistory }: CanvasProps) {
  const { socket, roomId } = useSocket();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [currentTool, setCurrentTool] = useState<'pencil' | 'eraser' | 'fill'>('pencil');
  
  const getContext = useCallback(() => canvasRef.current?.getContext('2d', { willReadFrequently: true }), []);
  
  const redrawCanvas = useCallback((history: DrawingAction[]) => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      history.forEach(action => {
        applyAction(ctx, action);
      });
    }
  }, [getContext]);

  const applyAction = useCallback((ctx: CanvasRenderingContext2D, action: DrawingAction) => {
    if (!ctx) return;
    if (action.tool === 'pencil' || action.tool === 'eraser') {
      drawSingleLine(ctx, action);
    } else if (action.tool === 'fill') {
      performFloodFill(ctx, action.x, action.y, hexToRgb(action.color));
    } else if (action.tool === 'clear') {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }, []);
  
  // Effect to handle canvas resizing and initial draw
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

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [drawingHistory, redrawCanvas]);

  // Effect to redraw canvas when history changes from server
  useEffect(() => {
    redrawCanvas(drawingHistory);
  }, [drawingHistory, redrawCanvas]);
  
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
    const ctx = getContext();
    if (!ctx) return;
    
    if (currentTool === 'pencil' || currentTool === 'eraser') {
      setIsDrawing(true);
      const color = currentTool === 'eraser' ? '#FFFFFF' : brushColor;
      const newLine: Line = { tool: currentTool, points: [{ x, y }], color, size: brushSize };
      
      // Optimistic update for the drawer
      applyAction(ctx, newLine);

      socket?.emit('drawingAction', { roomId, action: newLine });
    }
    else if (currentTool === 'fill') {
       handleFill(x, y);
    }
  };
  
  const handleFill = (x: number, y: number) => {
    const color = brushColor;
    const fillAction: Fill = { tool: 'fill', x, y, color };
    const ctx = getContext();

    // Optimistic update
    if (ctx) {
      applyAction(ctx, fillAction);
    }
    
    socket?.emit('drawingAction', { roomId, action: fillAction });
  }
  
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isDrawer) return;
    const ctx = getContext();
    if (!ctx) return;
    
    const { x, y } = getCoords(e);
    
    const color = currentTool === 'eraser' ? '#FFFFFF' : brushColor;
    // We emit an action with a single point. The server will aggregate them.
    const drawAction: Line = { tool: currentTool, points: [{ x, y }], color, size: brushSize };
    
    // Optimistic update for the drawer
    applyAction(ctx, drawAction);

    socket?.emit('drawingAction', { roomId, action: drawAction });
  };

  const stopDrawing = () => {
    if (!isDrawing || !isDrawer) return;
    setIsDrawing(false);
  };

  const drawSingleLine = (ctx: CanvasRenderingContext2D, line: Line) => {
    if (line.points.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(line.points[0].x, line.points[0].y);

    for (let i = 1; i < line.points.length; i++) {
        const point = line.points[i];
        ctx.lineTo(point.x, point.y);
    }
    
    ctx.strokeStyle = line.tool === 'eraser' ? '#FFFFFF' : line.color;
    ctx.lineWidth = line.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

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
  
  const handleClear = () => {
    const clearAction = { tool: 'clear' };
    const ctx = getContext();
    // Optimistic update
    if (ctx) {
      applyAction(ctx, clearAction);
    }
    socket?.emit('drawingAction', { roomId, action: clearAction });
  }

  const handleUndo = () => {
      socket?.emit('drawingAction', { roomId, action: { tool: 'undo' } });
  }

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
            onClear={handleClear}
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            onUndo={handleUndo}
            canUndo={drawingHistory.length > 0}
        />
      )}
    </div>
  );
}

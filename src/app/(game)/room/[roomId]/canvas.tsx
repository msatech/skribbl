
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
};

export default function Canvas({ isDrawer }: CanvasProps) {
  const { socket, roomId, room } = useSocket();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [currentTool, setCurrentTool] = useState<'pencil' | 'eraser' | 'fill'>('pencil');
  
  // Buffer for drawing points
  const pointsBuffer = useRef<DrawingPoint[]>([]);
  // Interval ref
  const drawIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getContext = useCallback(() => canvasRef.current?.getContext('2d', { willReadFrequently: true }), []);
  
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

  const redrawCanvas = useCallback((history: DrawingAction[]) => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      history.forEach(action => {
        applyAction(ctx, action);
      });
    }
  }, [getContext, applyAction]);
  
  // Effect to handle canvas resizing and initial draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        // Save current drawing
        const currentDrawing = canvas.toDataURL();
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        // Restore drawing
        const img = new Image();
        img.src = currentDrawing;
        img.onload = () => {
            getContext()?.drawImage(img, 0, 0);
        }
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    // Full redraw when history changes
    if (room?.drawingHistory) {
      redrawCanvas(room.drawingHistory);
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [room?.drawingHistory, redrawCanvas, getContext]);

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
    if (!isDrawer || currentTool === 'fill') return;
    
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    pointsBuffer.current = [{x, y}]; // Start new line

     // Draw the initial dot
    const color = currentTool === 'eraser' ? '#FFFFFF' : brushColor;
    const initialLine: Line = { tool: currentTool, points: [{ x, y }, {x,y}], color, size: brushSize };
    const ctx = getContext();
    if (ctx) {
        applyAction(ctx, initialLine);
    }
    
    // Start interval to send points
    if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
    drawIntervalRef.current = setInterval(sendPoints, 20); // Send points every 20ms
  };
  
  const sendPoints = () => {
      if (pointsBuffer.current.length === 0) return;
      
      const color = currentTool === 'eraser' ? '#FFFFFF' : brushColor;
      const lineToSend: Line = {
          tool: currentTool,
          points: [...pointsBuffer.current],
          color,
          size: brushSize,
      };

      socket?.emit('drawingAction', { roomId, action: lineToSend });
      
      // Keep last point for smooth connection
      pointsBuffer.current = [pointsBuffer.current[pointsBuffer.current.length-1]];
  };

  const handleFill = (e: React.MouseEvent) => {
    if(!isDrawer || currentTool !== 'fill') return;
    const { x, y } = getCoords(e);

    const color = brushColor;
    const fillAction: Fill = { tool: 'fill', x, y, color };
    const ctx = getContext();

    if (ctx) {
      applyAction(ctx, fillAction);
    }
    
    socket?.emit('drawingAction', { roomId, action: fillAction });
  }
  
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isDrawer) return;
    
    const { x, y } = getCoords(e);
    const lastPoint = pointsBuffer.current[pointsBuffer.current.length - 1];

    // Create a line segment for local rendering
    const color = currentTool === 'eraser' ? '#FFFFFF' : brushColor;
    const lineSegment: Line = { tool: currentTool, points: [lastPoint, { x, y }], color, size: brushSize };

    const ctx = getContext();
    if(ctx) {
        applyAction(ctx, lineSegment);
    }
    
    pointsBuffer.current.push({ x, y });
  };

  const stopDrawing = () => {
    if (!isDrawing || !isDrawer) return;
    setIsDrawing(false);
    
    // Stop the interval
    if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = null;
    }

    // Send any remaining points
    sendPoints();

    pointsBuffer.current = []; // Clear buffer
  };

  const drawSingleLine = (ctx: CanvasRenderingContext2D, line: Line) => {
    if (line.points.length < 1) return;
    
    ctx.strokeStyle = line.tool === 'eraser' ? '#FFFFFF' : line.color;
    ctx.lineWidth = line.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(line.points[0].x, line.points[0].y);
    
    for (let i = 1; i < line.points.length; i++) {
        ctx.lineTo(line.points[i].x, line.points[i].y);
    }
    
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
        onClick={handleFill}
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
            canUndo={room?.drawingHistory.length > 0}
        />
      )}
    </div>
  );
}

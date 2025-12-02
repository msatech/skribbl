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
  const [drawingHistory, setDrawingHistory] = useState<ImageData[]>([]);
  const [currentTool, setCurrentTool] = useState('pencil');
  const [lastPos, setLastPos] = useState<{x: number, y: number} | null>(null);

  const getContext = () => canvasRef.current?.getContext('2d');

  const draw = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, size: number) => {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  
  const saveState = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if(canvas && ctx) {
        setDrawingHistory(prev => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    }
  };

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if(canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawingHistory.forEach(imageData => {
        ctx.putImageData(imageData, 0, 0);
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    
    const resizeCanvas = () => {
        const parent = canvas.parentElement;
        if(parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
            redrawCanvas();
        }
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const onDrawing = (data: any) => {
      const { fromX, fromY, toX, toY, color, size, tool } = data;
      if (tool === 'pencil' || tool === 'eraser') {
        draw(context, fromX, fromY, toX, toY, color, size);
      } else if (tool === 'fill') {
        const { x, y, fillColor } = data;
        floodFill(context, x, y, hexToRgb(fillColor));
      }
    };

    const onClearCanvas = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      setDrawingHistory([]);
    };

    const onUndo = () => {
      setDrawingHistory(prev => {
        const newHistory = prev.slice(0, -1);
        const lastState = newHistory[newHistory.length - 1];
        if (lastState) {
            context.putImageData(lastState, 0, 0);
        } else {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
        return newHistory;
      });
    }
    
    socket?.on('drawing', onDrawing);
    socket?.on('clearCanvas', onClearCanvas);
    socket?.on('undo', onUndo);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      socket?.off('drawing', onDrawing);
      socket?.off('clearCanvas', onClearCanvas);
      socket?.off('undo', onUndo);
    };
  }, [socket, drawingHistory]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer) return;
    const { offsetX, offsetY } = getCoords(e);
    
    if (currentTool === 'pencil' || currentTool === 'eraser') {
      setIsDrawing(true);
      setLastPos({ x: offsetX, y: offsetY });
    }
    else if (currentTool === 'fill') {
       handleFill(offsetX, offsetY);
    }
  };

  const stopDrawing = () => {
    if (!isDrawer || !isDrawing) return;
    setIsDrawing(false);
    setLastPos(null);
    saveState();
  };

  const handleDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isDrawer || !lastPos) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = getContext();
    if (!context) return;

    const { offsetX, offsetY } = getCoords(e);
    const colorToUse = currentTool === 'eraser' ? '#FFFFFF' : brushColor;
    
    draw(context, lastPos.x, lastPos.y, offsetX, offsetY, colorToUse, brushSize);

    socket?.emit('drawing', {
      roomId,
      data: { fromX: lastPos.x, fromY: lastPos.y, toX: offsetX, toY: offsetY, color: colorToUse, size: brushSize, tool: currentTool },
    });

    setLastPos({ x: offsetX, y: offsetY });
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

  const handleUndo = () => {
    socket?.emit('undo', {roomId});
  }

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
  }

  const handleFill = (x: number, y: number) => {
    const ctx = getContext();
    if(!ctx) return;

    const fillColorRgb = hexToRgb(brushColor);
    if (!fillColorRgb) return;

    floodFill(ctx, x, y, fillColorRgb);
    saveState();

    socket?.emit('drawing', {
      roomId,
      data: { tool: 'fill', x, y, fillColor: brushColor },
    });
  }

 const floodFill = (ctx: CanvasRenderingContext2D, x: number, y: number, fillColor: {r:number, g:number, b:number}) => {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const { width, height, data } = imageData;
    const startPos = (y * width + x) * 4;
    const startColor = {
      r: data[startPos],
      g: data[startPos + 1],
      b: data[startPos + 2],
      a: data[startPos + 3],
    };

    if (
      fillColor.r === startColor.r &&
      fillColor.g === startColor.g &&
      fillColor.b === startColor.b
    ) {
      return;
    }

    const pixelStack = [[x, y]];

    while (pixelStack.length) {
      const newPos = pixelStack.pop();
      if(!newPos) continue;
      const [currentX, currentY] = newPos;
      let pixelPos = (currentY * width + currentX) * 4;

      while (currentY >= 0 && matchStartColor(pixelPos, startColor, data)) {
        pixelPos -= width * 4;
      }
      pixelPos += width * 4;
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
        pixelPos += width * 4;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };
  
  const matchStartColor = (pixelPos: number, color: {r:number, g:number, b:number, a:number}, data: Uint8ClampedArray) => {
    return (
      data[pixelPos] === color.r &&
      data[pixelPos + 1] === color.g &&
      data[pixelPos + 2] === color.b &&
      data[pixelPos + 3] === color.a
    );
  };
  
  const colorPixel = (pixelPos: number, color: {r:number, g:number, b:number}, data: Uint8ClampedArray) => {
    data[pixelPos] = color.r;
    data[pixelPos + 1] = color.g;
    data[pixelPos + 2] = color.b;
    data[pixelPos + 3] = 255;
  };

  return (
    <div className={`w-full h-full relative ${isDrawer ? `cursor-crosshair` : 'cursor-not-allowed'}`}>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onMouseMove={handleDrawing}
        onTouchStart={startDrawing}
        onTouchEnd={stopDrawing}
        onTouchMove={handleDrawing}
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
        />
      )}
    </div>
  );
}

'use client';

import { Brush, Circle, Trash2, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';

type ToolbarProps = {
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  onClear: () => void;
};

const colors = [
  '#000000', '#FFFFFF', '#EF4444', '#F97316', '#EAB308', 
  '#84CC16', '#22C55E', '#14B8A6', '#0EA5E9', '#3B82F6',
  '#8B5CF6', '#EC4899'
];

export default function Toolbar({ brushColor, setBrushColor, brushSize, setBrushSize, onClear }: ToolbarProps) {
  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card/80 backdrop-blur-sm border rounded-lg p-2 flex items-center gap-2 shadow-lg">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" title="Brush color">
            <Circle className="h-5 w-5" style={{ fill: brushColor, color: brushColor }}/>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-6 gap-1">
            {colors.map(color => (
              <button
                key={color}
                onClick={() => setBrushColor(color)}
                className={`w-6 h-6 rounded-md border ${brushColor === color ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" title="Brush size">
            <Brush className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-4">
            <Slider
              min={1}
              max={50}
              step={1}
              value={[brushSize]}
              onValueChange={(value) => setBrushSize(value[0])}
            />
        </PopoverContent>
      </Popover>

       <Button variant="outline" size="icon" onClick={() => setBrushColor('#FFFFFF')} title="Eraser">
          <Eraser className="h-5 w-5" />
        </Button>

      <Button variant="destructive" size="icon" onClick={onClear} title="Clear canvas">
        <Trash2 className="h-5 w-5" />
      </Button>
    </div>
  );
}

'use client';
import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface DateTimePickerProps {
  value: string; // ISO datetime-local string "YYYY-MM-DDTHH:mm"
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

export function DateTimePicker({ value, onChange, className }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const date = value ? new Date(value) : undefined;

  const timeStr = value ? value.slice(11, 16) : '00:00';

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const [h, m] = timeStr.split(':');
    day.setHours(Number(h), Number(m), 0, 0);
    onChange(toLocal(day));
    setOpen(false);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!date) return;
    const [h, m] = e.target.value.split(':');
    const next = new Date(date);
    next.setHours(Number(h), Number(m), 0, 0);
    onChange(toLocal(next));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 w-full justify-start gap-2 font-normal text-sm',
            !date && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />
          {date ? format(date, "dd/MM/yyyy 'às' HH:mm") : 'Selecionar data e hora'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px]">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDaySelect}
          disabled={{ before: new Date() }}
        />
        <div className="border-t border-border px-3 pb-3 pt-2.5">
          <p className="text-xs text-muted-foreground mb-1.5">Hora</p>
          <input
            type="time"
            value={timeStr}
            onChange={handleTimeChange}
            className="h-8 w-full rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function toLocal(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

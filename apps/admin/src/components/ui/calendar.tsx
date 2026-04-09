'use client';
import * as React from 'react';
import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export type CalendarProps = DayPickerProps;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col sm:flex-row gap-4',
        month: 'space-y-3',
        month_caption: 'flex justify-center pt-1 items-center h-8',
        caption_label: 'text-sm font-medium text-foreground',
        nav: 'absolute top-0 left-0 right-0 flex justify-between items-center px-1 h-8',
        button_previous: cn(
          'inline-flex items-center justify-center h-7 w-7 rounded-md border border-border bg-transparent',
          'text-muted-foreground hover:bg-accent hover:text-foreground transition-colors'
        ),
        button_next: cn(
          'inline-flex items-center justify-center h-7 w-7 rounded-md border border-border bg-transparent',
          'text-muted-foreground hover:bg-accent hover:text-foreground transition-colors'
        ),
        table: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground w-10 font-normal text-[0.75rem] text-center',
        weeks: 'space-y-1 mt-1',
        week: 'flex w-full',
        day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:rounded-md [&:has([aria-selected])]:bg-primary/10',
        day_button: cn(
          'inline-flex items-center justify-center h-10 w-10 rounded-md text-sm font-normal',
          'text-foreground hover:bg-accent hover:text-foreground transition-colors',
          'aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary'
        ),
        today: 'border border-primary/40',
        outside: 'text-muted-foreground opacity-40',
        disabled: 'text-muted-foreground opacity-25 cursor-not-allowed pointer-events-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left'
            ? <ChevronLeft className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}

Calendar.displayName = 'Calendar';

export { Calendar };

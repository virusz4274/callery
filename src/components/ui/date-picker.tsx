"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, Popover } from "@heroui/react"
import { Calendar } from "@/components/ui/calendar"

interface DatePickerProps {
    date?: Date
    setDate: (date: Date | undefined) => void
    className?: string
    placeholder?: string
    showTime?: boolean
}

export function DatePicker({ date, setDate, className, placeholder = "Pick a date", showTime = false }: DatePickerProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const [hours, minutes] = e.target.value.split(':').map(Number);
        const newDate = date ? new Date(date) : new Date();
        newDate.setHours(hours);
        newDate.setMinutes(minutes);
        setDate(newDate);
    };

    const timeValue = date ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : "00:00";

    return (
        <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
            <Popover.Trigger>
                <Button
                    variant="outline"
                    className={cn(
                        "w-[240px] justify-start text-left font-normal bg-background/50",
                        !date && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, showTime ? "PPP HH:mm" : "PPP") : <span>{placeholder}</span>}
                </Button>
            </Popover.Trigger>
            <Popover.Content placement="bottom start" className="w-auto p-4 flex flex-col gap-4">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                        if (!d) return;
                        const newDate = new Date(d);
                        if (date) {
                            newDate.setHours(date.getHours());
                            newDate.setMinutes(date.getMinutes());
                        }
                        setDate(newDate);
                        if (!showTime) setIsOpen(false);
                    }}
                    initialFocus
                />
                {showTime && (
                    <div className="flex items-center gap-2 border-t pt-4 border-default-100">
                        <span className="text-xs font-medium text-default-500">Time:</span>
                        <input
                            type="time"
                            value={timeValue}
                            onChange={handleTimeChange}
                            className="bg-transparent border border-default-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                )}
            </Popover.Content>
        </Popover>
    );
}

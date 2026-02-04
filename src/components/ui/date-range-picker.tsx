"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"
import { Button, Popover } from "@heroui/react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"

interface DatePickerWithRangeProps {
    className?: string
    date?: DateRange
    setDate: (date: DateRange | undefined) => void
}

export function DatePickerWithRange({
    className,
    date,
    setDate,
}: DatePickerWithRangeProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <div className={cn("grid gap-2", className)}>
            <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
                <Popover.Trigger>
                    <Button
                        variant="outline"
                        className={cn(
                            "w-[260px] justify-start text-left font-normal bg-background/50",
                            !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "LLL dd, y")} -{" "}
                                    {format(date.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y")
                            )
                        ) : (
                            <span>Pick a date range</span>
                        )}
                    </Button>
                </Popover.Trigger>
                <Popover.Content placement="bottom start" className="w-auto p-0">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                    />
                </Popover.Content>
            </Popover>
        </div>
    )
}

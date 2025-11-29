"use client";
import React, { useMemo } from 'react';
import type { CallRecording, Contact } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RecordingsTable } from '@/components/recordings-table';
import { Users, Phone, Clock, BarChart } from 'lucide-react';
import { format, subMonths } from 'date-fns';

type RecordingsDashboardProps = {
  allRecordings: CallRecording[];
  allContacts: Contact[];
  searchQuery: string;
  filter: { type: string | null; value: string | null };
};

export function RecordingsDashboard({ allRecordings, allContacts, searchQuery, filter }: RecordingsDashboardProps) {
    const filteredRecordings = useMemo(() => {
        return allRecordings.filter(rec => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = searchQuery === '' ||
                rec.contactName?.toLowerCase().includes(searchLower) ||
                rec.phoneNumber.includes(searchLower) ||
                rec.transcriptSnippet.toLowerCase().includes(searchLower);

            if (!filter.type) {
                return matchesSearch;
            }
            
            let matchesFilter = false;
            if (filter.type === 'contact') {
                if (filter.value === 'Unknown') {
                    matchesFilter = !rec.contactName;
                } else {
                    matchesFilter = rec.contactName === filter.value;
                }
            } else if (filter.type === 'date') {
                const recDate = new Date(rec.date);
                const [filterMonth, filterYear] = filter.value?.split(' ') || [];
                matchesFilter = recDate.toLocaleString('default', { month: 'long' }) === filterMonth &&
                                recDate.getFullYear().toString() === filterYear;
            }

            return matchesSearch && matchesFilter;
        });
    }, [allRecordings, searchQuery, filter]);

    const summaryStats = useMemo(() => {
        const now = new Date();
        const oneMonthAgo = subMonths(now, 1);
        const knownNumbers = new Set(allContacts.map(c => c.phoneNumber));
        
        const totalRecordings = allRecordings.length;
        const newThisMonth = allRecordings.filter(r => new Date(r.date) > oneMonthAgo).length;
        const unknownCallers = allRecordings.filter(r => !knownNumbers.has(r.phoneNumber)).length;
        const totalDuration = allRecordings.reduce((acc, r) => acc + r.duration, 0);
        
        return {
            totalRecordings,
            newThisMonth,
            unknownCallers,
            avgDuration: totalRecordings > 0 ? Math.round(totalDuration / totalRecordings) : 0,
        };
    }, [allRecordings, allContacts]);
    
    return (
        <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Recordings</CardTitle>
                        <Phone className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summaryStats.totalRecordings}</div>
                        <p className="text-xs text-muted-foreground">Across all contacts and numbers</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">New This Month</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">+{summaryStats.newThisMonth}</div>
                        <p className="text-xs text-muted-foreground">In the last 30 days</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Unknown Callers</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summaryStats.unknownCallers}</div>
                        <p className="text-xs text-muted-foreground">Not in your contact list</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Call Duration</CardTitle>
                        <BarChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Math.floor(summaryStats.avgDuration / 60)}m {summaryStats.avgDuration % 60}s</div>
                        <p className="text-xs text-muted-foreground">Average across all recordings</p>
                    </CardContent>
                </Card>
            </div>
            
            <RecordingsTable recordings={filteredRecordings} />
        </div>
    );
}


"use client"

import React, { useMemo } from 'react';
import { subMonths } from 'date-fns';
import type { CallRecording, Contact } from '@/lib/types';
import { Card } from '@heroui/react';
import { RecordingsTable } from '@/components/recordings-table';
import { Users, Phone, Clock, BarChart } from 'lucide-react';

type RecordingsDashboardProps = {
    allRecordings: CallRecording[];
    allContacts: Contact[];
    filter: { type: string | null; value: string | null };
    searchQuery: string;
    stats: {
        totalRecordings: number;
        newThisMonth: number;
        unknownCallers: number;
        avgDuration: number;
    } | null;
    page: number;
    setPage: (page: number) => void;
    totalCount: number;
    itemsPerPage: number;
    onRecordingsChange?: () => void;
};

export function RecordingsDashboard({ allRecordings, allContacts, filter, searchQuery, stats, page, setPage, totalCount, itemsPerPage, onRecordingsChange }: RecordingsDashboardProps) {

    const filteredRecordings = React.useMemo(() => {
        if (!allRecordings) return [];
        return allRecordings.filter(rec => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = searchQuery === '' ||
                rec.contactName?.toLowerCase().includes(searchLower) ||
                rec.phoneNumber.includes(searchLower) ||
                rec.transcriptSnippet.toLowerCase().includes(searchLower);

            if (!filter.type || !filter.value) {
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
        return stats || { totalRecordings: 0, newThisMonth: 0, unknownCallers: 0, avgDuration: 0 };
    }, [stats]);

    return (
        <div className="space-y-8 relative">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
            </div>

            <div className="flex flex-col gap-2">
                <h2 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    Dashboard
                </h2>
                <p className="text-default-500 text-lg">
                    Overview of your call analytics and history
                </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {/* Total Recordings */}
                <Card className="border-none bg-gradient-to-br from-content1/50 to-content2/50 backdrop-blur-xl shadow-medium hover:shadow-lg transition-all duration-300">
                    <Card.Content className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-default-500 uppercase tracking-wider">Total Recordings</p>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-foreground">{summaryStats.totalRecordings}</span>
                                    <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">+2.5%</span>
                                </div>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-sm">
                                <Phone className="h-6 w-6" />
                            </div>
                        </div>
                        <div className="mt-6 h-2 w-full rounded-full bg-default-100/50 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 shadow-[0_0_10px_rgba(var(--primary),0.5)]" style={{ width: '70%' }} />
                        </div>
                    </Card.Content>
                </Card>

                {/* New This Month */}
                <Card className="border-none bg-gradient-to-br from-content1/50 to-content2/50 backdrop-blur-xl shadow-medium hover:shadow-lg transition-all duration-300">
                    <Card.Content className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-default-500 uppercase tracking-wider">New This Month</p>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-foreground">+{summaryStats.newThisMonth}</span>
                                    <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">+12%</span>
                                </div>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/20 text-secondary shadow-sm">
                                <Clock className="h-6 w-6" />
                            </div>
                        </div>
                        <div className="mt-6 h-2 w-full rounded-full bg-default-100/50 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-secondary to-secondary/60 shadow-[0_0_10px_rgba(var(--secondary),0.5)]" style={{ width: '45%' }} />
                        </div>
                    </Card.Content>
                </Card>

                {/* Unknown Callers */}
                <Card className="border-none bg-gradient-to-br from-content1/50 to-content2/50 backdrop-blur-xl shadow-medium hover:shadow-lg transition-all duration-300">
                    <Card.Content className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-default-500 uppercase tracking-wider">Unknown Callers</p>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-foreground">{summaryStats.unknownCallers}</span>
                                    {/* Using a static negative trend for now, matching the others structure */}
                                    <span className="text-xs font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">-5%</span>
                                </div>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/20 text-warning shadow-sm">
                                <Users className="h-6 w-6" />
                            </div>
                        </div>
                        <div className="mt-6 h-2 w-full rounded-full bg-default-100/50 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-warning to-warning/60 shadow-[0_0_10px_rgba(var(--warning),0.5)]" style={{ width: '30%' }} />
                        </div>
                    </Card.Content>
                </Card>

                {/* Avg Duration */}
                <Card className="border-none bg-gradient-to-br from-content1/50 to-content2/50 backdrop-blur-xl shadow-medium hover:shadow-lg transition-all duration-300">
                    <Card.Content className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-default-500 uppercase tracking-wider">Avg. Duration</p>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-foreground">
                                        {Math.floor(summaryStats.avgDuration / 60)}m {summaryStats.avgDuration % 60}s
                                    </span>
                                    <span className="text-xs font-semibold text-default-400 bg-default-200/50 px-2 py-0.5 rounded-full">Stable</span>
                                </div>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/20 text-success shadow-sm">
                                <BarChart className="h-6 w-6" />
                            </div>
                        </div>
                        <div className="mt-6 h-2 w-full rounded-full bg-default-100/50 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-success to-success/60 shadow-[0_0_10px_rgba(var(--success),0.5)]" style={{ width: '85%' }} />
                        </div>
                    </Card.Content>
                </Card>
            </div>

            <Card className="border-none bg-background/40 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300">
                <RecordingsTable
                    recordings={filteredRecordings}
                    contacts={allContacts || []}
                    page={page}
                    setPage={setPage}
                    totalCount={totalCount}
                    itemsPerPage={itemsPerPage}
                    onRecordingsChange={onRecordingsChange}
                />
            </Card>
        </div>
    );
}

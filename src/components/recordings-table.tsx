"use client";

import React, { useState } from 'react';
import type { CallRecording } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MoreHorizontal, Play, Download, Trash2, FileText } from 'lucide-react';
import { ClientFormattedDate } from './client-formatted-date';
import { RecordingDetailsDialog } from './recording-details-dialog';

type RecordingsTableProps = {
  recordings: CallRecording[];
};

const ITEMS_PER_PAGE = 10;

export function RecordingsTable({ recordings }: RecordingsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [activeRecording, setActiveRecording] = useState<CallRecording | null>(null);

  const totalPages = Math.ceil(recordings.length / ITEMS_PER_PAGE);
  const paginatedRecordings = recordings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(recordings.map(r => r.id)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSelectedRows = new Set(selectedRows);
    if (checked) {
      newSelectedRows.add(id);
    } else {
      newSelectedRows.delete(id);
    }
    setSelectedRows(newSelectedRows);
  };
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const openDialog = (recording: CallRecording) => {
    setActiveRecording(recording);
  };

  const closeDialog = () => {
    setActiveRecording(null);
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox 
                    onCheckedChange={handleSelectAll}
                    checked={selectedRows.size > 0 && selectedRows.size === recordings.length}
                    aria-label="Select all rows"
                  />
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Recording Details</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRecordings.length > 0 ? (
                paginatedRecordings.map((rec) => (
                  <TableRow key={rec.id} data-state={selectedRows.has(rec.id) ? 'selected' : ''}>
                    <TableCell>
                      <Checkbox 
                        onCheckedChange={(checked) => handleSelectRow(rec.id, !!checked)}
                        checked={selectedRows.has(rec.id)}
                        aria-label={`Select row for ${rec.contactName || rec.phoneNumber}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>{rec.contactName ? rec.contactName.charAt(0) : '#'}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{rec.contactName || 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">{rec.phoneNumber}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{formatDuration(rec.duration)}</div>
                      <div className="text-sm text-muted-foreground truncate max-w-xs">{rec.transcriptSnippet}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <ClientFormattedDate date={rec.date} formatString="PPp" />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openDialog(rec)}><Play /> Play</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openDialog(rec)}><FileText /> View Transcript</DropdownMenuItem>
                          <DropdownMenuItem><Download /> Download</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive"><Trash2 /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No recordings found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedRows.size} of {recordings.length} row(s) selected.
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
      {activeRecording && (
        <RecordingDetailsDialog 
          recording={activeRecording}
          onOpenChange={(isOpen) => !isOpen && closeDialog()}
        />
      )}
    </>
  );
}

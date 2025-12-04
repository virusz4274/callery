
"use client";

import React, { useState, useTransition } from 'react';
import type { CallRecording } from '@/lib/types';
import { useRouter } from 'next/navigation';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MoreHorizontal, Play, Download, Trash2, FileText, Loader2 } from 'lucide-react';
import { ClientFormattedDate } from './client-formatted-date';
import { RecordingDetailsDialog } from './recording-details-dialog';
import { useToast } from '@/hooks/use-toast';
import { deleteRecordings } from '@/app/actions/delete-recordings';

type RecordingsTableProps = {
  recordings: CallRecording[];
};

const ITEMS_PER_PAGE = 10;

export function RecordingsTable({ recordings }: RecordingsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [activeRecording, setActiveRecording] = useState<CallRecording | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordingsToDelete, setRecordingsToDelete] = useState<{ id: string, filePath: string }[]>([]);
  const [isDeleting, startDeleteTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();


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

  const handleDeleteRequest = (recs: CallRecording[]) => {
    if (recs.length === 0) return;
    setRecordingsToDelete(recs.map(r => ({ id: r.id, filePath: r.filePath })));
    setShowDeleteConfirm(true);
  }

  const executeDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteRecordings(recordingsToDelete);
      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        });
        setSelectedRows(new Set());
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message,
        });
      }
      setShowDeleteConfirm(false);
      setRecordingsToDelete([]);
    });
  }
  
  const selectedRecordings = recordings.filter(r => selectedRows.has(r.id));

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedRows.size > 0 
              ? `${selectedRows.size} of ${recordings.length} row(s) selected.`
              : `Total ${recordings.length} recordings.`}
          </div>
          {selectedRows.size > 0 && (
             <Button variant="destructive" size="sm" onClick={() => handleDeleteRequest(selectedRecordings)} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete ({selectedRows.size})
            </Button>
          )}
        </div>
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox 
                    onCheckedChange={handleSelectAll}
                    checked={recordings.length > 0 && selectedRows.size === recordings.length}
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
                          <DropdownMenuItem onSelect={() => openDialog(rec)}><Play className="mr-2"/> Play Audio</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openDialog(rec)}><FileText className="mr-2"/> View Transcript</DropdownMenuItem>
                          <DropdownMenuItem><Download className="mr-2"/> Download</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => handleDeleteRequest([rec])}><Trash2 className="mr-2"/> Delete</DropdownMenuItem>
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
          <div className="flex items-center justify-end">
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
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {recordingsToDelete.length} recording(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={executeDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

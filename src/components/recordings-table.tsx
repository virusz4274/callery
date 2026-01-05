
"use client";

import { useToast } from '@/components/toast-provider';

import React, { useState, useTransition, useMemo } from 'react';
import type { CallRecording, Contact } from '@/lib/types';
import { useRouter } from 'next/navigation';
import {
  Dropdown,
  Button,
  Avatar,
  Checkbox,
  Modal,
  Card
} from '@heroui/react';
import { MoreHorizontal, Play, Download, Trash2, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ClientFormattedDate } from './client-formatted-date';
import { RecordingDetailsDialog } from './recording-details-dialog';
import { deleteRecordings } from '@/app/actions/delete-recordings';
import { PlaceHolderImages } from '@/lib/placeholder-images';

type RecordingsTableProps = {
  recordings: CallRecording[];
  contacts: Contact[];
  page: number;
  setPage: (page: number) => void;
  totalCount: number;
  itemsPerPage: number;
  onRecordingsChange?: () => void;
};

export function RecordingsTable({ recordings, contacts, page, setPage, totalCount, itemsPerPage, onRecordingsChange }: RecordingsTableProps) {
  const { toast } = useToast();
  // const [currentPage, setCurrentPage] = useState(1); // Controlled by parent
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeRecording, setActiveRecording] = useState<CallRecording | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordingsToDelete, setRecordingsToDelete] = useState<string[]>([]);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();


  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const paginatedRecordings = recordings; // Already paginated from backend

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
    console.log('handleDeleteRequest called with:', recs);
    if (recs.length === 0) {
      console.log('No recordings to delete');
      return;
    }
    const ids = recs.map(r => r.id);
    console.log('Setting recordingsToDelete to:', ids);
    setRecordingsToDelete(ids);
    console.log('Setting showDeleteConfirm to true');
    setShowDeleteConfirm(true);
  }

  const executeDelete = () => {
    console.log('executeDelete called with IDs:', recordingsToDelete);
    startDeleteTransition(async () => {
      try {
        console.log('Calling deleteRecordings with:', recordingsToDelete);
        const result = await deleteRecordings(recordingsToDelete);
        console.log('Delete result:', result);
        if (result.success) {
          toast({ title: 'Success', description: result.message, status: 'success' });
          setSelectedIds(new Set());
          // Refresh the recordings list
          if (onRecordingsChange) {
            await onRecordingsChange();
          }
          router.refresh();
        } else {
          toast({ title: 'Error', description: result.message, status: 'danger' });
        }
      } catch (error) {
        console.error('Delete error:', error);
        toast({ title: 'Error', description: 'Failed to delete recordings', status: 'danger' });
      }
      setShowDeleteConfirm(false);
      setRecordingsToDelete([]);
    });
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedRecordings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedRecordings.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectedCount = selectedIds.size;
  const isAllSelected = paginatedRecordings.length > 0 && selectedIds.size === paginatedRecordings.length;

  return (
    <>
      <div className="space-y-4">
        <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl transition-all duration-300">
          {/* Table Controls / Header */}
          <Card.Header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-default-100/50">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent Recordings</h2>
              <p className="text-sm text-default-500">
                {selectedCount > 0
                  ? `${selectedCount} item(s) selected`
                  : `Showing ${recordings.length} of ${totalCount} recordings`}
              </p>
            </div>

            {selectedCount > 0 && (
              <Button
                variant="danger"
                size="sm"
                onPress={() => {
                  const recs = recordings.filter(r => selectedIds.has(r.id));
                  handleDeleteRequest(recs);
                }}
                isDisabled={isDeleting}
                className="animate-appearance-in font-medium"
              >
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete Selection ({selectedCount})
              </Button>
            )}
          </Card.Header>

          <Card.Content className="p-0">
            <div className="relative w-full overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase tracking-wider text-default-500 font-semibold bg-default-50/50 border-b border-default-200/50">
                  <tr>
                    <th className="h-14 w-14 px-4 align-middle">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          isSelected={isAllSelected}
                          onChange={toggleSelectAll}
                          aria-label="Select all"
                          className="group-data-[selected=true]:border-primary"
                        />
                      </div>
                    </th>
                    <th className="h-14 px-4 align-middle">Contact</th>
                    <th className="h-14 px-4 align-middle">Recording Details</th>
                    <th className="h-14 px-4 align-middle hidden md:table-cell">Date</th>
                    <th className="h-14 px-4 align-middle text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-100/50">
                  {paginatedRecordings.length > 0 ? (
                    paginatedRecordings.map((rec) => {
                      const contact = contacts.find(c => c.name === rec.contactName);
                      const contactIndex = contact ? contacts.indexOf(contact) : -1;
                      const avatar = contactIndex !== -1 ? PlaceHolderImages[contactIndex % PlaceHolderImages.length] : undefined;
                      const isSelected = selectedIds.has(rec.id);

                      return (
                        <tr
                          key={rec.id}
                          className={`group transition-all duration-200 ${isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-default-100/50'}`}
                        >
                          <td className="p-4 align-middle">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                isSelected={isSelected}
                                onChange={() => toggleSelect(rec.id)}
                                aria-label="Select row"
                              />
                            </div>
                          </td>
                          <td className="p-4 align-middle">
                            <div className="flex items-center gap-4">
                              <Avatar
                                className={`h-10 w-10 transition-transform group-hover:scale-105 ring-2 ${isSelected ? 'ring-primary' : 'ring-transparent group-hover:ring-default-200'}`}
                                color={isSelected ? "success" : "default"}
                              >
                                <Avatar.Image src={avatar?.imageUrl} alt={rec.contactName || "Unknown"} />
                                <Avatar.Fallback>{rec.contactName ? rec.contactName.charAt(0) : '#'}</Avatar.Fallback>
                              </Avatar>
                              <div>
                                <div className={`font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                  {rec.contactName || 'Unknown Caller'}
                                </div>
                                <div className="text-xs text-default-500 font-mono">{rec.phoneNumber}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 align-middle">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-full bg-default-100 text-[10px] font-bold text-default-600 uppercase tracking-wide">
                                  {formatDuration(rec.duration)}
                                </span>
                              </div>
                              <div className="text-sm text-default-500 truncate max-w-[200px] lg:max-w-xs opacity-80 group-hover:opacity-100 transition-opacity">
                                {rec.transcriptSnippet || "No transcript available..."}
                              </div>
                            </div>
                          </td>
                          <td className="p-4 align-middle hidden md:table-cell">
                            <div className="text-sm text-default-600">
                              <ClientFormattedDate date={rec.date} formatString="MMM d, yyyy" />
                            </div>
                            <div className="text-xs text-default-400">
                              <ClientFormattedDate date={rec.date} formatString="h:mm a" />
                            </div>
                          </td>
                          <td className="p-4 align-middle text-right">
                            <div className="relative flex justify-end items-center gap-2">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                className="text-default-400 data-[hover=true]:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                onPress={() => openDialog(rec)}
                              >
                                <Play className="h-4 w-4 fill-current" />
                              </Button>
                              <Dropdown>
                                <Button variant="ghost" isIconOnly size="sm" className="text-default-400 data-[hover=true]:text-foreground">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                                <Dropdown.Popover>
                                  <Dropdown.Menu aria-label="Recording actions">
                                    <Dropdown.Item
                                      key="play"
                                      textValue="Play Audio"
                                      onPress={() => openDialog(rec)}
                                    >
                                      <div className="flex items-center gap-2"><Play className="h-4 w-4 text-primary" /> Play Audio</div>
                                    </Dropdown.Item>
                                    <Dropdown.Item
                                      key="view"
                                      textValue="View Transcript"
                                      onPress={() => openDialog(rec)}
                                    >
                                      <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-secondary" /> View Transcript</div>
                                    </Dropdown.Item>
                                    <Dropdown.Item key="download" textValue="Download">
                                      <div className="flex items-center gap-2"><Download className="h-4 w-4 text-success" /> Download</div>
                                    </Dropdown.Item>
                                    <Dropdown.Item
                                      key="delete"
                                      className="text-danger"
                                      textValue="Delete"
                                      onPress={() => {
                                        console.log('Delete pressed for recording:', rec.id);
                                        handleDeleteRequest([rec]);
                                      }}
                                    >
                                      <div className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete</div>
                                    </Dropdown.Item>
                                  </Dropdown.Menu>
                                </Dropdown.Popover>
                              </Dropdown>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-24 text-center">
                        <div className="flex flex-col items-center justify-center gap-4">
                          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-default-100 to-default-50 shadow-inner border border-default-200/50 flex items-center justify-center mb-2">
                            <FileText className="h-10 w-10 text-default-400" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-foreground">No recordings found</h3>
                            <p className="text-default-500 mt-1 max-w-[250px] mx-auto">
                              Upload new calls or wait for them to appear here.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card.Content>

          {totalPages > 1 && (
            <Card.Footer className="flex items-center justify-between px-6 py-4 border-t border-default-100/50">
              <span className="text-xs text-default-400 uppercase tracking-widest font-semibold">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setPage(Math.max(1, page - 1))}
                  isDisabled={page === 1}
                  className="bg-default-100/50 backdrop-blur-md"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setPage(Math.min(totalPages, page + 1))}
                  isDisabled={page === totalPages}
                  className="bg-default-100/50 backdrop-blur-md"
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </Card.Footer>
          )}
        </Card>

      </div>

      {activeRecording && (
        <RecordingDetailsDialog
          recording={activeRecording}
          onOpenChange={(isOpen) => !isOpen && closeDialog()}
        />
      )}

      {showDeleteConfirm && (
        <Modal isOpen={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog className="bg-card/70 backdrop-blur-xl border border-default-200 shadow-2xl">
                <Modal.Header><Modal.Heading>Are you sure?</Modal.Heading></Modal.Header>
                <Modal.Body>
                  This will permanently delete {recordingsToDelete.length} recording(s). This action cannot be undone.
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="ghost" onPress={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  <Button variant="danger" onPress={executeDelete} isPending={isDeleting}>
                    Delete
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </>
  );
}

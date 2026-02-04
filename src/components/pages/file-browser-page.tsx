
"use client";

import React, { useState, useMemo } from 'react';
import type { FileSystemNode, Recording } from '@/lib/types';
import { Card, Button, Dropdown, Spinner } from '@heroui/react';
import { Folder, FileText, ChevronRight, MoreVertical, Trash2, PlayCircle } from 'lucide-react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/firebase/provider';
import { RecordingDetailsDialog } from '@/components/recording-details-dialog';
import { authFetch } from '@/lib/api-client';
import { deleteRecordings } from '@/app/actions/delete-recordings';
import { DeleteConfirmationModal } from '@/components/recordings-table/delete-confirmation-modal';
import { useToast } from '@/components/toast-provider';

type FileBrowserPageProps = {
  rootNode: FileSystemNode;
  onRefresh?: () => void;
};

export function FileBrowserPage({ rootNode, onRefresh }: FileBrowserPageProps) {
  const [path, setPath] = useState<string[]>([]);
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  // State for recording details
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // State for deletion
  const [recordingToDelete, setRecordingToDelete] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();

  // Protect the page
  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [user, isUserLoading, router]);

  const { currentNode, breadcrumbItems } = useMemo(() => {
    let currentNode: FileSystemNode = rootNode;
    const breadcrumbItems = [{ name: 'Home', newPath: [] as string[] }];

    path.forEach((segment, index) => {
      const nextNode = currentNode.children?.find(child => child.name === segment);
      if (nextNode) {
        currentNode = nextNode;
        breadcrumbItems.push({ name: segment, newPath: path.slice(0, index + 1) });
      }
    });

    return { currentNode, breadcrumbItems };
  }, [rootNode, path]);

  const handleNodeClick = async (node: FileSystemNode) => {
    if (node.type === 'folder') {
      setPath([...path, node.name]);
    } else {
      // It's a file, try to fetch recording details
      const recordingId = node.id.replace('file-', '');
      await openRecordingDetails(recordingId);
    }
  };

  const openRecordingDetails = async (recordingId: string) => {
    setIsLoadingDetails(true);
    try {
      const response = await authFetch(`/api/recordings/${recordingId}`);
      if (!response.ok) throw new Error('Failed to fetch recording details');
      const data = await response.json();

      if (!data.recording) {
        throw new Error('Invalid response format');
      }

      setSelectedRecording(data.recording);
      setIsDetailsOpen(true);
    } catch (error) {
      console.error('Error fetching recording details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load recording details. Please try again.',
        status: 'danger',
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleBreadcrumbClick = (newPath: string[]) => {
    setPath(newPath);
  }

  const items = useMemo(() => {
    return currentNode.children?.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    }) || [];
  }, [currentNode]);

  const handleDeleteClick = (node: FileSystemNode) => {
    if (node.type === 'file') {
      const recordingId = node.id.replace('file-', '');
      setRecordingToDelete(recordingId);
      setIsDeleteModalOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (!recordingToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteRecordings([recordingToDelete]);
      if (result.success) {
        setIsDeleteModalOpen(false);
        setRecordingToDelete(null);
        // Refresh the file tree
        if (onRefresh) {
          onRefresh();
        }
      } else {
        console.error('Failed to delete:', result.message);
      }
    } catch (error) {
      console.error('Error deleting recording:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isUserLoading || !user) {
    return <div className="flex h-[50vh] items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="relative space-y-8">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
          File Browser
        </h2>
        <p className="text-default-500 text-lg">
          Explore and manage your recordings
        </p>
      </div>

      <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl overflow-visible transition-all duration-300">
        <Card.Header className="flex flex-col items-start px-6 pt-6 pb-0">
          <div className="pt-2 pb-4 flex items-center flex-wrap gap-1 text-sm text-default-500">
            {breadcrumbItems.map((item, index) => {
              const isLast = index === breadcrumbItems.length - 1;
              return (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight className="h-4 w-4" />}
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => handleBreadcrumbClick(item.newPath)}
                    isDisabled={isLast}
                    className={`min-w-0 px-2 h-7 ${isLast ? "font-semibold text-foreground opacity-100" : "text-default-500 hover:text-primary"}`}
                  >
                    {item.name}
                  </Button>
                </React.Fragment>
              );
            })}
          </div>
        </Card.Header>
        <Card.Content className="pb-8 px-0 sm:px-6">
          <div className="rounded-xl border border-default-200/50 overflow-hidden mt-4 bg-background/40 shadow-sm backdrop-blur-md">
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="text-default-500 font-medium bg-default-50/50 border-b border-default-100/50">
                <tr>
                  <th className="h-12 px-4 align-middle pl-6 w-full sm:w-[400px]">Name</th>
                  <th className="h-12 px-4 align-middle hidden sm:table-cell w-[100px]">Type</th>
                  <th className="h-12 px-4 align-middle hidden sm:table-cell w-[100px]">Size</th>
                  <th className="h-12 px-4 align-middle text-right pr-6 hidden sm:table-cell w-[150px]">Last Modified</th>
                  <th className="h-12 px-4 align-middle w-[50px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100">
                {items.length > 0 ? (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className={`transition-colors group ${item.type === 'folder' ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-default-50'}`}
                    >
                      <td className="p-4 align-middle pl-6 truncate" onClick={() => handleNodeClick(item)}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg flex-shrink-0 ${item.type === 'folder' ? 'bg-primary/10 text-primary' : 'bg-default-100 text-default-500'}`}>
                            {item.type === 'folder' ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          </div>
                          <span className={`font-medium truncate ${item.type === 'folder' ? 'text-foreground group-hover:text-primary transition-colors' : 'text-default-700'}`}>
                            {item.name}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 align-middle capitalize text-default-500 hidden sm:table-cell" onClick={() => handleNodeClick(item)}>
                        <span className="px-2 py-1 rounded-md bg-default-100/50 text-xs font-medium">
                          {item.type}
                        </span>
                      </td>
                      <td className="p-4 align-middle text-default-500 font-mono text-xs hidden sm:table-cell" onClick={() => handleNodeClick(item)}>
                        {item.size || '—'}
                      </td>
                      <td className="p-4 align-middle text-right text-default-500 pr-6 hidden sm:table-cell" onClick={() => handleNodeClick(item)}>
                        <ClientFormattedDate date={item.lastModified} formatString="PP" />
                      </td>
                      <td className="p-0 align-middle text-right pr-2 w-[50px]">
                        {item.type === 'file' && (
                          <Dropdown>
                            <Button isIconOnly variant="ghost" size="sm" className="text-default-400 hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                            <Dropdown.Popover>
                              <Dropdown.Menu aria-label="File Actions">
                                <Dropdown.Item key="view" textValue="View Details" onPress={() => handleNodeClick(item)}>
                                  <div className="flex items-center gap-2"><PlayCircle className="h-4 w-4" /> View Details</div>
                                </Dropdown.Item>
                                <Dropdown.Item key="delete" className="text-danger" textValue="Delete" onPress={() => handleDeleteClick(item)}>
                                  <div className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete</div>
                                </Dropdown.Item>
                              </Dropdown.Menu>
                            </Dropdown.Popover>
                          </Dropdown>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-16 text-center text-default-500">
                      <div className="flex flex-col items-center gap-2">
                        <Folder className="h-10 w-10 text-default-200" />
                        <p>This folder is empty.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card.Content>
      </Card>

      {/* Recording Details Dialog */}
      {selectedRecording && (
        <RecordingDetailsDialog
          recording={selectedRecording}
          onOpenChange={(open) => {
            setIsDetailsOpen(open);
            if (!open) setSelectedRecording(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
        count={1}
      />

      {/* Loading Overlay */}
      {isLoadingDetails && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-[200] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 p-6 bg-card rounded-xl shadow-xl border border-default-200">
            <Spinner size="lg" />
            <p className="text-default-500 font-medium">Loading recording...</p>
          </div>
        </div>
      )}

    </div>
  );
}

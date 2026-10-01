
"use client";

import React, { useState, useMemo } from 'react';
import type { FileSystemNode, Recording } from '@/lib/types';
import { Card, Button } from '@heroui/react';
import { Folder, FileText, ChevronRight } from 'lucide-react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import { RecordingDetailsDialog } from '@/components/recording-details-dialog';
import { useToast } from '@/components/toast-provider';
import { authFetch } from '@/lib/api-client';
import { useRouter } from 'next/navigation';

type FileBrowserPageProps = {
  rootNode: FileSystemNode;
  truncated?: boolean;
};

import { useUser } from '@/lib/auth/client';
import { Spinner } from '@heroui/react';

export function FileBrowserPage({ rootNode, truncated }: FileBrowserPageProps) {
  const [path, setPath] = useState<string[]>([]);
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
  const { toast } = useToast();
  const router = useRouter(); // Use explicit router import if not present, checking imports...

  const { user, isUserLoading } = useUser();

  // Protect the page
  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login'); // Assuming router is available
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
      return;
    }
    if (!node.recordingId) return;
    try {
      const response = await authFetch(`/api/recordings/${node.recordingId}`);
      if (!response.ok) {
        throw new Error('Recording not found');
      }
      const recording = await response.json();
      setActiveRecording(recording as Recording);
    } catch (error) {
      console.error('Failed to open recording:', error);
      toast({ title: 'Could not open recording', description: 'Please try again.', status: 'danger' });
    }
  };

  const handleBreadcrumbClick = (newPath: string[]) => {
    setPath(newPath);
  }

  const items = useMemo(() => {
    // Copy before sorting: sort() is in-place and must not mutate props.
    return [...(currentNode.children || [])].sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [currentNode]);


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
        {truncated && (
          <p className="text-sm text-warning">
            Showing the 1,000 most recent recordings. Use search on the dashboard to find older ones.
          </p>
        )}
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
        <Card.Content className="pb-8">
          <div className="rounded-xl border border-default-200/50 overflow-hidden mt-4 bg-background/40 shadow-sm backdrop-blur-md">
            <table className="w-full text-sm text-left">
              <thead className="text-default-500 font-medium bg-default-50/50 border-b border-default-100/50">
                <tr>
                  <th className="h-12 px-4 align-middle w-[400px] pl-6">Name</th>
                  <th className="h-12 px-4 align-middle">Type</th>
                  <th className="h-12 px-4 align-middle">Size</th>
                  <th className="h-12 px-4 align-middle text-right pr-6">Last Modified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100">
                {items.length > 0 ? (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className={`transition-colors group ${item.type === 'folder' ? 'cursor-pointer hover:bg-primary/5' : 'cursor-pointer hover:bg-default-50'}`}
                      onClick={() => handleNodeClick(item)}
                    >
                      <td className="p-4 align-middle pl-6">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${item.type === 'folder' ? 'bg-primary/10 text-primary' : 'bg-default-100 text-default-500'}`}>
                            {item.type === 'folder' ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          </div>
                          <span className={`font-medium ${item.type === 'folder' ? 'text-foreground group-hover:text-primary transition-colors' : 'text-default-700'}`}>{item.name}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle capitalize text-default-500">
                        <span className="px-2 py-1 rounded-md bg-default-100/50 text-xs font-medium">
                          {item.type}
                        </span>
                      </td>
                      <td className="p-4 align-middle text-default-500 font-mono text-xs">{item.size || '—'}</td>
                      <td className="p-4 align-middle text-right text-default-500 pr-6">
                        <ClientFormattedDate date={item.lastModified} formatString="PP" />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-16 text-center text-default-500">
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

      {activeRecording && (
        <RecordingDetailsDialog
          key={activeRecording.id}
          recording={activeRecording}
          onOpenChange={(isOpen) => !isOpen && setActiveRecording(null)}
        />
      )}
    </div>
  );
}

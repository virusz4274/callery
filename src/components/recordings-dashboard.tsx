"use client";

import React, { useState, useMemo } from 'react';
import type { FileSystemNode } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Folder, FileText, ChevronRight } from 'lucide-react';
import { ClientFormattedDate } from './client-formatted-date';

type FileBrowserPageProps = {
  rootNode: FileSystemNode;
};

export function FileBrowserPage({ rootNode }: FileBrowserPageProps) {
  const [path, setPath] = useState<string[]>([]);

  const { currentNode, breadcrumbItems } = useMemo(() => {
    let currentNode: FileSystemNode = rootNode;
    const breadcrumbItems = [{ name: 'Home', newPath: [] }];

    path.forEach((segment, index) => {
      const nextNode = currentNode.children?.find(child => child.name === segment);
      if (nextNode) {
        currentNode = nextNode;
        breadcrumbItems.push({ name: segment, newPath: path.slice(0, index + 1) });
      }
    });

    return { currentNode, breadcrumbItems };
  }, [rootNode, path]);

  const handleNodeClick = (node: FileSystemNode) => {
    if (node.type === 'folder') {
      setPath([...path, node.name]);
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


  return (
    <Card>
      <CardHeader>
        <CardTitle>File Browser</CardTitle>
        <div className="text-sm text-muted-foreground pt-2">
            <Breadcrumb>
                <BreadcrumbList>
                    {breadcrumbItems.map((item, index) => (
                        <React.Fragment key={index}>
                           <BreadcrumbItem>
                                <BreadcrumbLink 
                                    onClick={() => handleBreadcrumbClick(item.newPath)}
                                    className="cursor-pointer"
                                >
                                    {item.name}
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                           {index < breadcrumbItems.length - 1 && <BreadcrumbSeparator />}
                        </React.Fragment>
                    ))}
                </BreadcrumbList>
            </Breadcrumb>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[400px]">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Last Modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length > 0 ? items.map(item => (
                <TableRow 
                    key={item.id}
                    onClick={() => handleNodeClick(item)} 
                    className={item.type === 'folder' ? 'cursor-pointer' : ''}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                        {item.type === 'folder' ? <Folder className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                        <span>{item.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{item.type}</TableCell>
                  <TableCell className="text-muted-foreground">{item.size || '—'}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <ClientFormattedDate date={item.lastModified} formatString="PP" />
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        This folder is empty.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
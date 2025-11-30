
import type { FileSystemNode } from './types';

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);


export const fileSystemData: FileSystemNode = {
  id: 'root',
  name: 'Home',
  type: 'folder',
  lastModified: twoDaysAgo.toISOString(),
  children: [
     {
      id: 'folder-injest',
      name: 'injest',
      type: 'folder',
      lastModified: today.toISOString(),
      children: [],
    },
    {
      id: 'folder-alice',
      name: 'Alice_Johnson',
      type: 'folder',
      lastModified: yesterday.toISOString(),
      children: [
        {
          id: 'folder-alice-2024',
          name: '2024',
          type: 'folder',
          lastModified: yesterday.toISOString(),
          children: [
            {
              id: 'folder-alice-2024-07',
              name: '07',
              type: 'folder',
              lastModified: today.toISOString(),
              children: [
                {
                  id: 'file-1',
                  name: 'Alice_Johnson_240715_103000.m4a',
                  type: 'file',
                  size: '2.1 MB',
                  lastModified: today.toISOString(),
                },
                {
                  id: 'file-2',
                  name: 'Alice_Johnson_240714_164510.m4a',
                  type: 'file',
                  size: '5.8 MB',
                  lastModified: yesterday.toISOString(),
                }
              ]
            }
          ]
        }
      ],
    },
    {
      id: 'folder-bob',
      name: 'Bob_Williams',
      type: 'folder',
      lastModified: twoDaysAgo.toISOString(),
      children: [],
    },
    {
      id: 'folder-unknown',
      name: '+1-202-555-0111',
      type: 'folder',
      lastModified: twoDaysAgo.toISOString(),
      children: [
         {
          id: 'folder-unknown-2024',
          name: '2024',
          type: 'folder',
          lastModified: twoDaysAgo.toISOString(),
          children: [
            {
                id: 'folder-unknown-2024-06',
                name: '06',
                type: 'folder',
                lastModified: twoDaysAgo.toISOString(),
                children: [
                    {
                        id: 'file-3',
                        name: '+1-202-555-0111_240628_091230.m4a',
                        type: 'file',
                        size: '850 KB',
                        lastModified: twoDaysAgo.toISOString(),
                    }
                ]
            }
          ]
        }
      ],
    },
  ],
};

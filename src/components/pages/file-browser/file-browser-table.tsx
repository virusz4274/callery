'use client';

import { Accordion, Breadcrumbs, Button, Card, Dropdown, Table } from '@heroui/react';
import { ArrowLeft, FileText, Folder, MoreVertical } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import type { FileSystemNode } from '@/lib/types';
import { ClientFormattedDate } from '@/components/client-formatted-date';

type FileBrowserTableProps = {
    items: FileSystemNode[];
    breadcrumbItems: { name: string; newPath: string[] }[];
    onBreadcrumbClick: (newPath: string[]) => void;
    onNodeClick: (node: FileSystemNode) => void | Promise<void>;
    onDeleteClick: (node: FileSystemNode) => void;
};

export function FileBrowserTable({ items, breadcrumbItems, onBreadcrumbClick, onNodeClick, onDeleteClick }: FileBrowserTableProps) {
    const isMobile = useIsMobile();
    const currentLocation = breadcrumbItems.at(-1)?.name || 'Root';
    const breadcrumbs = <Breadcrumbs aria-label="Folder breadcrumbs" className="flex-wrap">
        {breadcrumbItems.map((item, index) => <Breadcrumbs.Item key={index} onPress={() => onBreadcrumbClick(item.newPath)} className="min-h-11 max-w-full break-words">{item.name}</Breadcrumbs.Item>)}
    </Breadcrumbs>;
    const openButton = (item: FileSystemNode) => <Button variant="ghost" className="h-auto min-h-11 min-w-0 max-w-full justify-start whitespace-normal text-left" aria-label={`Open ${item.name}`} onPress={() => void onNodeClick(item)}>
        {item.type === 'folder' ? <Folder className="size-5 shrink-0 text-accent" /> : <FileText className="size-5 shrink-0 text-muted" />}
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.name}</span>
    </Button>;
    const actions = (item: FileSystemNode) => item.type === 'file' && <Dropdown>
        <Button isIconOnly variant="ghost" className="size-11 shrink-0" aria-label={`Actions for ${item.name}`}><MoreVertical className="size-5" /></Button>
        <Dropdown.Popover><Dropdown.Menu aria-label="File actions">
            <Dropdown.Item id="view" onPress={() => void onNodeClick(item)}>Open recording</Dropdown.Item>
            <Dropdown.Item id="delete" className="text-danger" onPress={() => onDeleteClick(item)}>Delete</Dropdown.Item>
        </Dropdown.Menu></Dropdown.Popover>
    </Dropdown>;

    if (isMobile) return <Card className="min-w-0">
        <Card.Header className="flex flex-row items-center gap-2">
            {breadcrumbItems.length > 1 && <Button isIconOnly variant="ghost" className="size-11 shrink-0" aria-label="Parent folder" onPress={() => onBreadcrumbClick(breadcrumbItems[breadcrumbItems.length - 2].newPath)}><ArrowLeft className="size-5" /></Button>}
            <h2 className="min-w-0 flex-1 break-words text-base font-semibold">{currentLocation}</h2>
            <span className="shrink-0 text-xs text-muted">{items.length} items</span>
        </Card.Header>
        <Card.Content className="min-w-0">
            {breadcrumbItems.length > 1 && <Accordion><Accordion.Item id="path">
                <Accordion.Heading><Accordion.Trigger className="min-h-11">Folder path<Accordion.Indicator /></Accordion.Trigger></Accordion.Heading>
                <Accordion.Panel><Accordion.Body>{breadcrumbs}</Accordion.Body></Accordion.Panel>
            </Accordion.Item></Accordion>}
            <ul className="divide-y divide-border">
                {items.map(item => <li key={item.id} className="flex min-w-0 items-start gap-2 py-3">
                    <div className="min-w-0 flex-1">{openButton(item)}<p className="mt-1 pl-3 text-xs text-muted">{item.type === 'folder' ? 'Folder' : <>{item.size || '—'} · <ClientFormattedDate date={item.lastModified} formatString="MMM d, yyyy · p" /></>}</p></div>
                    {actions(item)}
                </li>)}
                {!items.length && <li className="py-6 text-center text-sm text-muted">This folder is empty</li>}
            </ul>
        </Card.Content>
    </Card>;

    return <Card className="min-w-0">
        <Card.Header className="flex flex-col items-start gap-3">
            <div className="flex w-full items-center justify-between gap-3"><h2 className="min-w-0 break-words text-xl font-semibold">{currentLocation}</h2><span className="shrink-0 text-sm text-muted">{items.length} items</span></div>
            {breadcrumbs}
        </Card.Header>
        <Card.Content className="min-w-0">
            <Table><Table.ScrollContainer><Table.Content aria-label="Files">
                <Table.Header><Table.Column id="name" isRowHeader>Name</Table.Column><Table.Column id="type">Type</Table.Column><Table.Column id="size">Size</Table.Column><Table.Column id="date">Call date</Table.Column><Table.Column id="actions" aria-label="Actions">Actions</Table.Column></Table.Header>
                <Table.Body renderEmptyState={() => <p className="py-8 text-center text-muted">This folder is empty</p>}>
                    {items.map(item => <Table.Row key={item.id} id={item.id} textValue={item.name}>
                        <Table.Cell className="max-w-sm">{openButton(item)}</Table.Cell>
                        <Table.Cell className="capitalize text-muted">{item.type}</Table.Cell>
                        <Table.Cell className="text-muted">{item.size || '—'}</Table.Cell>
                        <Table.Cell className="text-muted">{item.type === 'file' ? <ClientFormattedDate date={item.lastModified} formatString="PP · p" /> : '—'}</Table.Cell>
                        <Table.Cell>{actions(item)}</Table.Cell>
                    </Table.Row>)}
                </Table.Body>
            </Table.Content></Table.ScrollContainer></Table>
        </Card.Content>
    </Card>;
}

"use client";

import React, { useMemo, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Archive, Clock, Users, FileUp, Loader2, LayoutDashboard, Phone } from 'lucide-react';
import type { CallRecording } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ingestFiles } from '@/app/actions/ingest-files';

type AppSidebarProps = {
  onFilterChange: (filter: { type: string | null; value: string | null }) => void;
  allRecordings: CallRecording[];
  currentFilter: { type: string | null, value: string | null };
};

export function AppSidebar({ onFilterChange, allRecordings, currentFilter }: AppSidebarProps) {
  const { toast } = useToast();
  const [isSyncing, startSyncTransition] = useTransition();
  const [isIngesting, startIngestTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();

  const handleSync = () => {
    startSyncTransition(() => {
      toast({
        title: "Syncing Contacts",
        description: "Checking for updates with Google Contacts...",
      });
      setTimeout(() => {
        toast({
          title: "Sync Complete",
          description: "Your contacts are up to date.",
        });
      }, 2000);
    });
  };
  
  const handleIngest = () => {
    startIngestTransition(async () => {
      toast({
        title: "Ingesting files...",
        description: "Checking /injest/ for new audio files.",
      });
      try {
        const result = await ingestFiles();
        console.log('Ingest result:', result);
        if (result.error) {
          throw new Error(result.error);
        }
        toast({
          title: "Ingest Complete",
          description: `${result.processedCount} new file(s) ingested successfully. Refreshing...`,
        });
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Ingest Failed",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
      }
    });
  };

  const dateHierarchy = useMemo(() => {
    const hierarchy: Record<string, Set<string>> = {};
    allRecordings.forEach(rec => {
      const date = new Date(rec.date);
      const year = date.getFullYear().toString();
      const month = date.toLocaleString('default', { month: 'long' });
      if (!hierarchy[year]) {
        hierarchy[year] = new Set();
      }
      hierarchy[year].add(month);
    });
    // Sort months chronologically within each year
    for (const year in hierarchy) {
        const months = Array.from(hierarchy[year]);
        months.sort((a, b) => {
            return new Date(`01 ${b} 2000`) .getTime() - new Date(`01 ${a} 2000`).getTime()
        });
        hierarchy[year] = new Set(months);
    }
    return hierarchy;
  }, [allRecordings]);

  const handleFilterClick = (e: React.MouseEvent, filter: { type: string | null; value: string | null }) => {
    e.preventDefault();
    onFilterChange(filter);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Logo className="size-8 text-sidebar-primary" />
          <h1 className="text-lg font-semibold text-sidebar-foreground">CallOrganizer</h1>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/" passHref legacyBehavior>
              <SidebarMenuButton 
                as="a"
                onClick={(e) => handleFilterClick(e, { type: null, value: null })} 
                isActive={pathname === '/' && !currentFilter.type}
              >
                <LayoutDashboard />
                Dashboard
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <Link href="/contacts" passHref legacyBehavior>
               <SidebarMenuButton as="a" isActive={pathname === '/contacts'}>
                <Users />
                Contacts
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>

        <Accordion type="multiple" defaultValue={['recordings-nav']} className="w-full">
          <SidebarGroup>
            <AccordionItem value="recordings-nav" className="border-none">
              <AccordionTrigger className="px-2 hover:no-underline hover:bg-sidebar-accent rounded-md">
                <SidebarGroupLabel className="p-0 h-auto font-semibold text-sidebar-foreground">
                  <Archive className="mr-2"/>
                  Recordings
                </SidebarGroupLabel>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <SidebarGroupContent>
                  <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton 
                          onClick={(e) => handleFilterClick(e, { type: null, value: null })} 
                          isActive={pathname ==='/' && !currentFilter.type} 
                          size="sm"
                        >
                          All Recordings
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton 
                          onClick={(e) => handleFilterClick(e, { type: 'contact', value: 'Unknown' })}
                          isActive={currentFilter.type === 'contact' && currentFilter.value === 'Unknown'}
                          size="sm"
                          className="font-normal"
                          >
                          <Phone />
                          Unknown Numbers
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                  </SidebarMenu>
                   <Accordion type="multiple" className="w-full">
                    {Object.entries(dateHierarchy).sort((a,b) => parseInt(b[0]) - parseInt(a[0])).map(([year, months]) => (
                      <AccordionItem value={year} key={year} className="border-none">
                        <AccordionTrigger className="py-1 px-2 text-sm hover:no-underline text-sidebar-foreground/80 hover:text-sidebar-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {year}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                           <SidebarMenu>
                            {Array.from(months).map(month => (
                               <SidebarMenuItem key={month}>
                                  <SidebarMenuButton 
                                    onClick={(e) => handleFilterClick(e, { type: 'date', value: `${month} ${year}` })}
                                    isActive={currentFilter.type === 'date' && currentFilter.value === `${month} ${year}`}
                                    size="sm"
                                    className="font-normal"
                                  >
                                    {month}
                                  </SidebarMenuButton>
                              </SidebarMenuItem>
                            ))}
                          </SidebarMenu>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </SidebarGroupContent>
              </AccordionContent>
            </AccordionItem>
          </SidebarGroup>
        </Accordion>
      </SidebarContent>
      <SidebarFooter>
        <Separator className="mb-2" />
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={handleIngest} disabled={isIngesting}>
          {isIngesting ? <Loader2 className="animate-spin" /> : <FileUp />}
          Ingest Files
        </Button>
        <Button variant="default" className="w-full bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/90" onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? <Loader2 className="animate-spin" /> : <Users />}
          Sync Contacts
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

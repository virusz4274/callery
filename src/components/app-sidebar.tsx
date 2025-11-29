"use client";

import React, { useMemo } from 'react';
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
import { Archive, Clock, Contact, Phone, Users, FileUp } from 'lucide-react';
import type { CallRecording, Contact as ContactType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

type AppSidebarProps = {
  onFilterChange: (filter: { type: string | null; value: string | null }) => void;
  allRecordings: CallRecording[];
  allContacts: ContactType[];
  currentFilter: { type: string | null, value: string | null };
};

export function AppSidebar({ onFilterChange, allRecordings, allContacts, currentFilter }: AppSidebarProps) {
  const { toast } = useToast();

  const handleSync = () => {
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
    return hierarchy;
  }, [allRecordings]);
  
  const unknownNumbers = useMemo(() => {
    const knownNumbers = new Set(allContacts.map(c => c.phoneNumber));
    const unknown = new Set(allRecordings.filter(r => !knownNumbers.has(r.phoneNumber)).map(r => r.phoneNumber));
    return Array.from(unknown);
  }, [allRecordings, allContacts]);

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
            <SidebarMenuButton onClick={() => onFilterChange({ type: null, value: null })} isActive={!currentFilter.type}>
              <Archive />
              All Recordings
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <Accordion type="multiple" defaultValue={['contacts', 'dates']} className="w-full">
          <SidebarGroup>
            <AccordionItem value="contacts" className="border-none">
              <AccordionTrigger className="px-2 hover:no-underline hover:bg-sidebar-accent rounded-md">
                <SidebarGroupLabel className="p-0 h-auto font-semibold text-sidebar-foreground">
                  <Users className="mr-2"/>
                  Contacts
                </SidebarGroupLabel>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <SidebarGroupContent>
                  <SidebarMenu>
                    {allContacts.map(contact => (
                      <SidebarMenuItem key={contact.phoneNumber}>
                        <SidebarMenuButton 
                          onClick={() => onFilterChange({ type: 'contact', value: contact.name })}
                          isActive={currentFilter.type === 'contact' && currentFilter.value === contact.name}
                          size="sm"
                          className="font-normal"
                        >
                          <Contact />
                          {contact.name}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                    {unknownNumbers.length > 0 && (
                      <SidebarMenuItem>
                        <SidebarMenuButton 
                          onClick={() => onFilterChange({ type: 'contact', value: 'Unknown' })}
                          isActive={currentFilter.type === 'contact' && currentFilter.value === 'Unknown'}
                          size="sm"
                          className="font-normal"
                          >
                          <Phone />
                          Unknown Numbers
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </AccordionContent>
            </AccordionItem>
          </SidebarGroup>
          <SidebarGroup>
            <AccordionItem value="dates" className="border-none">
              <AccordionTrigger className="px-2 hover:no-underline hover:bg-sidebar-accent rounded-md">
                <SidebarGroupLabel className="p-0 h-auto font-semibold text-sidebar-foreground">
                  <Clock className="mr-2"/>
                  Dates
                </SidebarGroupLabel>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <SidebarGroupContent>
                   <Accordion type="multiple" className="w-full">
                    {Object.entries(dateHierarchy).sort((a,b) => parseInt(b[0]) - parseInt(a[0])).map(([year, months]) => (
                      <AccordionItem value={year} key={year} className="border-none">
                        <AccordionTrigger className="py-1 px-2 text-sm hover:no-underline text-sidebar-foreground/80 hover:text-sidebar-foreground">
                          {year}
                        </AccordionTrigger>
                        <AccordionContent>
                           <SidebarMenu>
                            {Array.from(months).map(month => (
                               <SidebarMenuItem key={month}>
                                <SidebarMenuButton 
                                  onClick={() => onFilterChange({ type: 'date', value: `${month} ${year}` })}
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
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => {
            toast({
              title: "Ingesting files...",
              description: "Checking /ingest/ for new audio files.",
            });
        }}>
            <FileUp />
            Ingest Files
        </Button>
        <Button variant="default" className="w-full bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/90" onClick={handleSync}>
          <Users />
          Sync Contacts
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

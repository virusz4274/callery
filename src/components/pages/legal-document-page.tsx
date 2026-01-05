
"use client";

import { Card } from '@heroui/react';

type LegalDocumentPageProps = {
  title: string;
  sections: {
    title: string;
    content: string[];
  }[];
  lastUpdated: string;
};

export function LegalDocumentPage({ title, sections, lastUpdated }: LegalDocumentPageProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 relative">
      {/* Background Elements */}
      <div className="absolute top-0 left-[-20%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl opacity-50 -z-10 pointer-events-none" />
      <div className="absolute top-[20%] right-[-20%] w-[600px] h-[600px] rounded-full bg-secondary/5 blur-3xl opacity-50 -z-10 pointer-events-none" />

      <div className="text-center py-12">
        <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-foreground mb-4">{title}</h1>
        <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-default-100/80 backdrop-blur-sm text-sm text-default-500 font-medium">
          Last Updated: {lastUpdated}
        </div>
      </div>
      <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-2xl">
        <Card.Content className="pt-12 px-8 md:px-12 pb-12">
          <div className="prose prose-lg dark:prose-invert max-w-none hover:prose-a:text-primary">
            {sections.map((section, index) => (
              <div key={index} className="mb-10 last:mb-0">
                <h2 className="text-2xl font-bold border-b border-default-100 pb-2 mb-6 text-foreground tracking-tight">{section.title}</h2>
                {section.content.map((paragraph, pIndex) => (
                  <p key={pIndex} className="text-default-600 leading-relaxed mb-4 text-justify">{paragraph}</p>
                ))}
              </div>
            ))}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}


'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2">Last Updated: {lastUpdated}</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none">
            {sections.map((section, index) => (
              <div key={index} className="mb-6">
                <h2 className="text-2xl font-semibold border-b pb-2 mb-4">{section.title}</h2>
                {section.content.map((paragraph, pIndex) => (
                  <p key={pIndex}>{paragraph}</p>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import React from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react';
import { FileText } from 'lucide-react';

export function RecordingsTableEmptyState() {
    return (
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
                    <Link href="/upload">
                        <Button variant="secondary" className="rounded-full">
                            Upload recordings
                        </Button>
                    </Link>
                </div>
            </td>
        </tr>
    );
}

import { ActionLink } from '@/components/action-link';
import { Button } from '@heroui/react';
import { FileText } from 'lucide-react';
import type { RecordingEmptyState } from '../types';

export function RecordingsEmptyContent({ kind = 'library', onClear }: RecordingEmptyState) {
    const library = kind === 'library';
    return <div className="flex flex-col items-center justify-center gap-3 text-center">
        <FileText className="size-8 text-muted" aria-hidden="true" />
        <h3 className="text-lg font-semibold">{library ? 'Your recording library is empty' : 'No matching recordings'}</h3>
        <p className="max-w-sm text-sm text-muted">{library ? 'Upload a recording to start reviewing your conversations.' : kind === 'semantic' ? 'Try a different description, or return to your library.' : 'Try another search or clear your filters.'}</p>
        {library ? <ActionLink href="/upload" variant="secondary" className="min-h-11">Upload recordings</ActionLink> :
            onClear && <Button variant="secondary" className="min-h-11" onPress={onClear}>{kind === 'semantic' ? 'Clear search' : 'Clear filters'}</Button>}
    </div>;
}

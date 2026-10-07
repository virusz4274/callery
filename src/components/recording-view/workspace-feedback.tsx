'use client';

import { Button, Modal, Spinner } from '@heroui/react';

export function WorkspaceFeedback({ error, onClose, onRetry }: {
  error?: unknown; onClose: () => void; onRetry: () => void;
}) {
  return (
    <Modal.Backdrop isOpen onOpenChange={open => { if (!open) onClose(); }}>
      <Modal.Container className="p-0 md:p-4">
        <Modal.Dialog className="flex h-dvh w-full max-w-none flex-col rounded-none bg-background p-4 md:h-auto md:max-w-md md:rounded-xl">
          <Modal.Heading>{error ? 'Recording unavailable' : 'Opening recording'}</Modal.Heading>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8" role="status">
            {error ? <><p>This recording could not be loaded. Try again or return to your list.</p><Button onPress={onRetry}>Try again</Button></> : <Spinner aria-label="Loading recording" />}
          </div>
          <Button variant="ghost" onPress={onClose}>Back</Button>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

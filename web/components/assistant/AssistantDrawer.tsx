"use client";

/** Placeholder: implemented in the generate/assistant work item. */
export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void; needsSignIn: boolean }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Security assistant" className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l
                                                                  border-border bg-surface-raised p-6">
      <button type="button" onClick={onClose}>Close</button>
    </div>
  );
}

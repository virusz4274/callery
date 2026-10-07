'use client';

import type { AdminFieldErrors } from '@/lib/admin-validation';

export function FieldError({ errors, name }: { errors: AdminFieldErrors; name: string }) {
    return errors[name] ? <p id={`${name}-error`} role="alert" className="text-sm text-danger">{errors[name]}</p> : null;
}

export function focusInvalid(container: HTMLElement | null) {
    requestAnimationFrame(() => container?.querySelector<HTMLElement>('[aria-invalid="true"] input, input[aria-invalid="true"], textarea[aria-invalid="true"], [aria-invalid="true"] button, [aria-invalid="true"] [role="spinbutton"]')?.focus());
}

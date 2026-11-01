import { useEffect, useRef } from 'react';
import { useForm, useWatch, type FieldValues, type Path, type PathValue, type UseFormProps } from 'react-hook-form';

/** Refresh clean fields while protecting edits, and reset drafts on account changes. */
export function useSettingsForm<T extends FieldValues>(subject: string | undefined, values: T, options?: UseFormProps<T>) {
    const form = useForm<T>({ ...options, values, resetOptions: { keepDirtyValues: true } });
    // keepDirtyValues requires subscribing to the dirty-field state.
    const { dirtyFields } = form.formState;
    void dirtyFields;
    const previousSubject = useRef(subject);
    useEffect(() => {
        if (previousSubject.current !== subject) {
            previousSubject.current = subject;
            form.reset(values, { keepDirtyValues: false });
        }
    }, [form, subject, values]);
    const state = useWatch({ control: form.control }) as T;
    const setState = (next: T) => {
        for (const name of Object.keys(next) as Path<T>[]) form.setValue(name, next[name] as PathValue<T, typeof name>, { shouldDirty: true });
    };
    return { form, state, setState };
}

import { useState } from 'react';
import type { PlanResponse } from '@/lib/db/types';
import type { PlanFormValues } from './types';

export const DEFAULT_PLAN_FORM_VALUES: PlanFormValues = {
    key: '',
    name: '',
    description: '',
    stripePriceId: '',
    stripeStoragePriceId: '',
    stripeTranscriptionPriceId: '',
    price: '0',
    interval: 'monthly',
    storageGB: '5',
    transcriptionMinutes: '60',
    featuresInput: '',
    isDefault: false,
    isActive: true,
};

function toFormValues(plan: PlanResponse): PlanFormValues {
    return {
        key: plan.key,
        name: plan.name,
        description: plan.description || '',
        stripePriceId: plan.stripePriceId || '',
        stripeStoragePriceId: plan.stripeStoragePriceId || '',
        stripeTranscriptionPriceId: plan.stripeTranscriptionPriceId || '',
        price: plan.price.toString(),
        interval: plan.interval,
        storageGB: (plan.limits.storage / (1024 * 1024 * 1024)).toString(),
        transcriptionMinutes: (plan.limits.transcription / 60).toString(),
        featuresInput: plan.features.join('\n'),
        isDefault: plan.isDefault,
        isActive: plan.isActive,
    };
}

export function getInitialPlanFormValues(planToEdit?: PlanResponse | null): PlanFormValues {
    if (planToEdit) {
        return toFormValues(planToEdit);
    }

    return DEFAULT_PLAN_FORM_VALUES;
}

export function usePlanFormState(initialValues: PlanFormValues) {
    const [values, setValues] = useState<PlanFormValues>(initialValues);

    const setField = <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    };

    return {
        values,
        setField,
    };
}

export function buildPlanPayload(values: PlanFormValues) {
    return {
        key: values.key.trim(),
        name: values.name,
        description: values.description,
        stripePriceId: values.stripePriceId,
        stripeStoragePriceId: values.stripeStoragePriceId,
        stripeTranscriptionPriceId: values.stripeTranscriptionPriceId,
        price: parseFloat(values.price),
        currency: 'USD',
        interval: values.interval,
        limits: {
            storage: parseFloat(values.storageGB) * 1024 * 1024 * 1024,
            transcription: parseFloat(values.transcriptionMinutes) * 60,
        },
        features: values.featuresInput.split('\n').filter((feature) => feature.trim()),
        isDefault: values.isDefault,
        isActive: values.isActive,
    };
}

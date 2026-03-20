import { ObjectId } from 'mongodb';

/**
 * Plan document stored in MongoDB.
 */
export interface Plan {
    _id: ObjectId;
    key: string;
    name: string;
    description?: string;
    stripePriceId: string; // ID of the Price in Stripe (e.g., price_H5ggY...)
    stripeStoragePriceId?: string; // ID for Metered Storage
    stripeTranscriptionPriceId?: string; // ID for Metered Transcription
    price: number;
    currency: string;
    interval: 'monthly' | 'yearly' | 'lifetime';
    limits: {
        storage: number; // in bytes
        transcription: number; // in seconds
    };
    features: string[];
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export type CreatePlanInput = Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdatePlanInput = Partial<Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>>;

export interface PlanResponse {
    id: string;
    key: string;
    name: string;
    description?: string;
    stripePriceId: string;
    stripeStoragePriceId?: string;
    stripeTranscriptionPriceId?: string;
    price: number;
    currency: string;
    interval: 'monthly' | 'yearly' | 'lifetime';
    limits: {
        storage: number;
        transcription: number;
    };
    features: string[];
    isDefault: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

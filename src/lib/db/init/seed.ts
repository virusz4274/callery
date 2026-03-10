import type { Db } from 'mongodb';
import type { Plan } from '@/lib/db/types';

type CollectionsMap = {
    PLANS: string;
    SYSTEM_SETTINGS: string;
};

type PlanSeedDefinition = Omit<
    Plan,
    '_id' | 'createdAt' | 'updatedAt' | 'stripeStoragePriceId' | 'stripeTranscriptionPriceId'
> & {
    stripeStoragePriceId?: string;
    stripeTranscriptionPriceId?: string;
};

const PLAN_DEFINITIONS: PlanSeedDefinition[] = [
    {
        name: 'Free Trial',
        description: '30 days of full access without credit card',
        price: 0,
        currency: 'USD',
        interval: 'monthly',
        limits: { storage: 100 * 1024 * 1024, transcription: 10 * 60 },
        features: ['Standard Storage', 'Community Support', '30-Day Limit'],
        isDefault: true,
        isActive: true,
        stripePriceId: '',
    },
    {
        name: 'Standard',
        description: 'For regular usage',
        price: 10,
        currency: 'USD',
        interval: 'monthly',
        limits: { storage: 2 * 1024 * 1024 * 1024, transcription: 60 * 60 },
        features: ['Standard Storage', 'Email Support'],
        isDefault: false,
        isActive: true,
        stripePriceId: '',
        stripeStoragePriceId: '',
        stripeTranscriptionPriceId: '',
    },
    {
        name: 'Pro',
        description: 'Power user access',
        price: 20,
        currency: 'USD',
        interval: 'monthly',
        limits: { storage: 5 * 1024 * 1024 * 1024, transcription: 120 * 60 },
        features: ['10 GB Storage', 'Advanced AI Transcription', 'Priority Email Support', 'Data Export', 'Detailed Analytics'],
        isDefault: false,
        isActive: true,
        stripePriceId: '',
        stripeStoragePriceId: '',
        stripeTranscriptionPriceId: '',
    },
    {
        name: 'Lifetime',
        description: 'One-time payment for platform access',
        price: 299,
        currency: 'USD',
        interval: 'lifetime',
        limits: { storage: 0, transcription: 0 },
        features: ['Lifetime Access', 'Pay-as-you-go Storage', 'Pay-as-you-go Transcription'],
        isDefault: false,
        isActive: true,
        stripePriceId: '',
        stripeStoragePriceId: '',
        stripeTranscriptionPriceId: '',
    },
    {
        name: 'Internal',
        description: 'Team & Family unrestricted access',
        price: 0,
        currency: 'USD',
        interval: 'lifetime',
        limits: { storage: 1024 * 1024 * 1024 * 1024, transcription: 99999 * 60 },
        features: ['Unlimited Access', 'Internal Use'],
        isDefault: false,
        isActive: true,
        stripePriceId: '',
    },
    {
        name: 'Custom',
        description: 'Enterprise needs',
        price: 0,
        currency: 'USD',
        interval: 'yearly',
        limits: { storage: 0, transcription: 0 },
        features: ['Talk to Sales', 'Custom SLA'],
        isDefault: false,
        isActive: true,
        stripePriceId: '',
    },
];

export async function seedPlans(db: Db, collections: CollectionsMap): Promise<void> {
    console.log('🌱 Seeding/Updating plans...');
    const now = new Date();

    for (const definition of PLAN_DEFINITIONS) {
        await db.collection(collections.PLANS).updateOne(
            { name: definition.name },
            {
                $setOnInsert: {
                    description: definition.description,
                    price: definition.price,
                    currency: definition.currency,
                    interval: definition.interval,
                    limits: definition.limits,
                    features: definition.features,
                    isDefault: definition.isDefault,
                    isActive: definition.isActive,
                    stripePriceId: definition.stripePriceId,
                    stripeStoragePriceId: definition.stripeStoragePriceId,
                    stripeTranscriptionPriceId: definition.stripeTranscriptionPriceId,
                    createdAt: now,
                    updatedAt: now,
                },
            },
            { upsert: true }
        );
    }

    console.log('✅ Plans seeded/updated');
}

export async function seedSystemSettings(db: Db, collections: CollectionsMap): Promise<void> {
    try {
        await db.collection(collections.SYSTEM_SETTINGS).updateOne(
            {},
            {
                $setOnInsert: {
                    allowSignups: true,
                    maintenanceMode: false,
                    transcriptionMultipliers: {
                        soniox: 1.0,
                        elevenlabs: 6.0,
                    },
                    updatedAt: new Date(),
                },
            },
            { upsert: true }
        );
        console.log('✅ System Settings seeded');
    } catch (error) {
        console.error('⚠️ System Settings seeding failed:', error);
    }
}

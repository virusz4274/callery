import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { stripe } from '@/lib/stripe';
import type { User } from '@/lib/db/types';
import { buildUserSearchQuery, serializeUser, toInvoiceStatus } from './shared';

export async function getUsersQuery(page: number = 1, limit: number = 10, search?: string) {
    await requireCurrentAdmin();

    const db = await getMongoDb();
    const skip = (page - 1) * limit;
    const query = buildUserSearchQuery(search);

    const totalUsers = await db.collection(Collections.USERS).countDocuments(query);
    const users = await db
        .collection<User>(Collections.USERS)
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

    return {
        users: users.map(serializeUser),
        total: totalUsers,
        page,
        limit,
        totalPages: Math.ceil(totalUsers / limit),
    };
}

export async function getUserByIdQuery(userId: string) {
    await requireCurrentAdmin();

    const db = await getMongoDb();

    try {
        const user = await db.collection<User>(Collections.USERS).findOne({
            _id: parseObjectId(userId, 'userId'),
        });

        if (!user) {
            return null;
        }

        return serializeUser(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        return null;
    }
}

export async function getUserInvoicesQuery(userId: string, limit: number = 20) {
    await requireCurrentAdmin();

    const db = await getMongoDb();
    const user = await db.collection<User>(Collections.USERS).findOne({
        _id: parseObjectId(userId, 'userId'),
    });

    if (!user?.stripeCustomerId || !process.env.STRIPE_SECRET_KEY) {
        return [];
    }

    const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit,
    });

    return invoices.data.map((invoice) => ({
        id: invoice.id,
        date: new Date(invoice.created * 1000).toISOString(),
        amount: (invoice.amount_paid || invoice.amount_due || 0) / 100,
        status: toInvoiceStatus(invoice.status),
    }));
}

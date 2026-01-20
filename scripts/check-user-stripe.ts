
import * as dotenv from 'dotenv';
dotenv.config();
import { getMongoDb, Collections } from '@/lib/mongodb';

async function check() {
    const db = await getMongoDb();
    const users = await db.collection(Collections.USERS).find({}).toArray();
    console.log('Users found:', users.length);
    for (const u of users) {
        console.log(`User: ${u.email} | Plan: ${u.plan} | StripeID: ${u.stripeCustomerId}`);
    }
    process.exit(0);
}
check();

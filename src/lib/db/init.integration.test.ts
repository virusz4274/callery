import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { MongoClient, ObjectId } from 'mongodb';
import type { Plan, SystemSettings } from './types';
import { initializeDatabase } from './init';
import { inspectInitialization } from './init/report';
import { seedPlans, seedSystemSettings } from './init/seed';
import { INITIAL_SYSTEM_SETTINGS_ID } from './system-settings-singleton';
import { INSTALLATION_PLANS } from '@/lib/installation-defaults';
import { Collections } from '@/lib/mongodb';
import { usageTariffFixture } from '@/lib/stripe/usage-test-support';
import type { BillingCatalogBundle, CatalogState } from '@/lib/stripe/catalog-bundle';
import type { PublishedCatalog } from '@/lib/stripe/catalog-publication';
import { BILLING_CATALOG } from '@/lib/stripe/catalog';

test('standalone Mongo initialization is additive, read-only when requested, and safe under retries and concurrency', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    const previous = process.env.NEXT_PUBLIC_ENABLE_BILLING; process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_seed_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
    const options = { db, printSearchInstructions: false };
    try {
        await client.connect();
        await t.test('fresh dry-run creates no collection, index, settings or financial evidence', async () => {
            const before = await db.listCollections().toArray();
            const report = await initializeDatabase({ ...options, dryRun: true, managed: true });
            assert.equal(report.plans.create.length, 6); assert.ok(report.indexes.missing.length > 10);
            assert.equal(report.settings, 'create'); assert.equal(report.catalog, 'not-configured'); assert.deepEqual(report.errors, []);
            const isolatedUri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!); isolatedUri.pathname = `/${db.databaseName}`;
            const cli = spawnSync(process.execPath, ['--import', 'tsx', 'src/lib/db/init.ts', '--dry-run'], {
                env: { ...process.env, MONGODB_URI: isolatedUri.toString(), NEXT_PUBLIC_ENABLE_BILLING: 'false' }, encoding: 'utf8', timeout: 60_000,
            });
            assert.equal(cli.status, 0, `${cli.stdout}\n${cli.stderr}`);
            assert.match(cli.stdout, /dry-run \(read-only\)/);
            assert.deepEqual(await db.listCollections().toArray(), before);
        });
        await t.test('fresh init creates exact defaults and no paid or published state', async () => {
            const failedDb = new Proxy(db, { get(target, property) {
                if (property === 'collection') return (name: string) => {
                    const collection = target.collection(name);
                    if (name !== 'search_embedding_cache') return collection;
                    return new Proxy(collection, { get(current, field) {
                        if (field === 'createIndexes') return async () => { throw new Error('Injected index creation failure.'); };
                        const value = Reflect.get(current, field, current);
                        return typeof value === 'function' ? value.bind(current) : value;
                    } });
                };
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            } });
            await assert.rejects(initializeDatabase({ ...options, db: failedDb }), /Injected index creation failure/);
            assert.equal(await db.collection(Collections.PLANS).countDocuments(), 0);
            assert.equal(await db.collection(Collections.SYSTEM_SETTINGS).countDocuments(), 0);
            await initializeDatabase(options);
            const plans = await db.collection<Plan>(Collections.PLANS).find({}).toArray();
            assert.equal(plans.length, 6);
            for (const expected of INSTALLATION_PLANS) {
                const actual = plans.find(plan => plan.key === expected.key)!;
                assert.equal(actual.price, expected.price); assert.deepEqual(actual.limits, expected.limits);
                assert.equal(actual.stripePriceId, ''); assert.equal(actual.billingCatalogVersion, undefined);
            }
            const settings = (await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({}))!;
            assert.ok(settings._id.equals(INITIAL_SYSTEM_SETTINGS_ID)); assert.equal(settings.transcriptionMultipliers, undefined);
            assert.equal(plans.find(plan => plan._id.equals(settings.defaultPlanId))?.key, 'free-trial');
            for (const collection of ['billing_catalog_state', 'billing_catalog_bundles', 'billing_catalog_versions', 'billing_operations', 'billing_prepaid_topups', 'users']) {
                assert.equal(await db.collection(collection).countDocuments(), 0, collection);
            }
        });
        await t.test('fresh concurrent initialization creates one complete installation without financial evidence', async () => {
            const concurrent = client.db(`vt_seed_concurrent_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
            try {
                assert.deepEqual(await concurrent.listCollections().toArray(), []);
                await Promise.all(Array.from({ length: 3 }, () => initializeDatabase({ db: concurrent, managed: true, printSearchInstructions: false })));
                const plans = await concurrent.collection<Plan>(Collections.PLANS).find({}).toArray();
                assert.equal(plans.length, 6);
                assert.deepEqual(plans.map(plan => plan.key).sort(), INSTALLATION_PLANS.map(plan => plan.key).sort());
                for (const expected of INSTALLATION_PLANS) {
                    const actual = plans.find(plan => plan.key === expected.key)!;
                    const { _id, createdAt, updatedAt, ...definition } = actual;
                    assert.ok(_id instanceof ObjectId);
                    assert.ok(createdAt instanceof Date); assert.ok(updatedAt instanceof Date);
                    assert.deepEqual(definition, expected, `Concurrent initialization must preserve the complete ${expected.key} template.`);
                }
                const settings = await concurrent.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).find({}).toArray();
                assert.equal(settings.length, 1);
                assert.ok(settings[0]._id.equals(INITIAL_SYSTEM_SETTINGS_ID));
                assert.equal(settings[0].transcriptionMultipliers, undefined);
                assert.equal(plans.find(plan => plan._id.equals(settings[0].defaultPlanId))?.key, 'free-trial');
                const collections = await concurrent.listCollections({}, { nameOnly: true }).toArray();
                for (const { name } of collections.filter(collection => collection.name !== Collections.PLANS && collection.name !== Collections.SYSTEM_SETTINGS)) {
                    assert.equal(await concurrent.collection(name).countDocuments(), 0, `Concurrent initialization must not manufacture ${name} records.`);
                }
            } finally { await concurrent.dropDatabase(); }
        });
        await t.test('reruns preserve operator settings, mappings, paid history, snapshots and users', async () => {
            await db.collection(Collections.PLANS).updateOne({ key: 'standard' }, { $set: { price: 17, stripePriceId: 'price_operator', 'limits.storage': 12345 } });
            await db.collection(Collections.SYSTEM_SETTINGS).updateOne({}, { $set: { maintenanceMode: true, transcriptionMultipliers: { gemini: 0.25 } } });
            const rows = { billing_catalog_versions: { _id: 'snapshot', immutable: true }, billing_catalog_bundles: { _id: 'published', state: 'published', immutable: true },
                billing_catalog_state: { _id: 'active', bundleId: 'published', revision: 7 }, billing_prepaid_topups: { _id: 'paid', state: 'complete', amountMinor: 500 },
                users: { _id: new ObjectId(), authSubject: 'existing', lifetimePurchase: { invoiceId: 'in_existing' }, billingAccount: { prepaidFundedMicros: 5000000 } } };
            for (const [name, row] of Object.entries(rows)) await db.collection(name).insertOne(row as never);
            const watched = [...Object.keys(rows), Collections.PLANS, Collections.SYSTEM_SETTINGS];
            const snapshot = await Promise.all(watched.map(name => db.collection(name).find({}).sort({ _id: 1 }).toArray()));
            const dry = await initializeDatabase({ ...options, dryRun: true });
            assert.ok(dry.plans.differences.some(plan => plan.key === 'standard' && plan.fields.includes('price')));
            await initializeDatabase(options);
            assert.deepEqual(await Promise.all(watched.map(name => db.collection(name).find({}).sort({ _id: 1 }).toArray())), snapshot);
        });
        await t.test('duplicate settings and invalid defaults are reported without writes', async () => {
            const rows = db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS), settings = (await rows.findOne({}))!;
            const duplicate = { ...settings, _id: new ObjectId() }; await rows.insertOne(duplicate);
            const before = await rows.find({}).toArray();
            await assert.rejects(initializeDatabase(options), /Multiple system settings/);
            await assert.rejects(seedSystemSettings(db, Collections), /Multiple system settings/);
            assert.deepEqual(await rows.find({}).toArray(), before);
            await rows.deleteOne({ _id: duplicate._id });
            await rows.updateOne({ _id: settings._id }, { $set: { defaultPlanId: new ObjectId() } });
            await assert.rejects(initializeDatabase({ ...options, dryRun: true }), /Default plan document is missing/);
            await rows.updateOne({ _id: settings._id }, { $set: { defaultPlanId: settings.defaultPlanId } });
            const managed = await inspectInitialization(db, Collections, true);
            assert.ok(managed.errors.some(error => /catalog pointer/.test(error)));
        });
        await t.test('local catalog inspection requires matching archived terms and valid tariffs without writing', async () => {
            const id = 'checked-catalog', now = new Date();
            const recurring = usageTariffFixture('recurring', { catalogVersion: id }), lifetime = usageTariffFixture('lifetime', { catalogVersion: id });
            const plans = await db.collection<Plan>(Collections.PLANS).find({ key: { $in: ['standard', 'pro', 'lifetime'] } }).toArray();
            const bundle: BillingCatalogBundle = { _id: id, schemaVersion: 1, state: 'published', createdAt: now, publishedAt: now,
                stripeAccountId: 'acct_isolated_fixture', livemode: false, costVersion: 'fixture-cost', costFingerprint: 'fixture-fingerprint',
                stripeObjects: { prices: [], meters: [] }, plans: plans.map(plan => {
                    const pair = plan.interval === 'lifetime' ? lifetime : recurring, catalogVersion = `${id}:${plan.key}`;
                    return { catalogVersion, usageTariffs: pair, plan: { ...plan, stripePriceId: `price_fixture_${plan.key}`, billingCatalogVersion: catalogVersion,
                        billingCatalogBundleId: id, stripeStoragePriceId: pair.storage.priceId, stripeTranscriptionPriceId: pair.transcription.priceId, usageTariffs: pair } };
                }) };
            const archives: PublishedCatalog[] = bundle.plans.map(entry => ({ _id: entry.catalogVersion, bundleId: id,
                tariffVersion: BILLING_CATALOG.version, tariff: BILLING_CATALOG, costVersion: bundle.costVersion, costFingerprint: bundle.costFingerprint,
                effectiveAt: now, publishedAt: now, plan: entry.plan, usageTariffs: entry.usageTariffs }));
            const state = db.collection<CatalogState>('billing_catalog_state'), versions = db.collection<PublishedCatalog>('billing_catalog_versions');
            const previousState = (await state.findOne({ _id: 'active' }))!;
            try {
                await db.collection<BillingCatalogBundle>('billing_catalog_bundles').insertOne(bundle);
                await versions.insertMany(archives);
                await state.updateOne({ _id: 'active' }, { $set: { bundleId: id } });
                const watched = ['billing_catalog_state', 'billing_catalog_versions', 'billing_catalog_bundles'];
                const before = await Promise.all(watched.map(name => db.collection(name).find({}).sort({ _id: 1 }).toArray()));
                assert.equal((await inspectInitialization(db, Collections, true)).catalog, 'published');
                assert.deepEqual(await Promise.all(watched.map(name => db.collection(name).find({}).sort({ _id: 1 }).toArray())), before);
                await versions.deleteOne({ _id: archives[0]._id });
                const missingArchive = await inspectInitialization(db, Collections, true);
                assert.equal(missingArchive.catalog, 'invalid'); assert.ok(missingArchive.errors.some(error => /catalog archive/.test(error)));
                await versions.insertOne(archives[0]);
                await db.collection<BillingCatalogBundle>('billing_catalog_bundles').updateOne({ _id: id }, { $set: { 'plans.0.usageTariffs.transcription.unitPriceAtoms': '1' } });
                const malformed = await inspectInitialization(db, Collections, true);
                assert.equal(malformed.catalog, 'invalid'); assert.ok(malformed.errors.some(error => /usage tariff/.test(error)));
            } finally {
                await state.replaceOne({ _id: 'active' }, previousState);
                await db.collection<BillingCatalogBundle>('billing_catalog_bundles').deleteOne({ _id: id });
                await versions.deleteMany({ bundleId: id });
            }
        });
        await t.test('interrupted seeding resumes and simultaneous runs keep one singleton', async () => {
            await db.collection(Collections.SYSTEM_SETTINGS).deleteMany({});
            await db.collection(Collections.PLANS).deleteMany({ key: { $nin: ['free-trial', 'standard'] } });
            await seedPlans(db, Collections);
            assert.equal(await db.collection(Collections.PLANS).countDocuments(), 6);
            await Promise.all(Array.from({ length: 3 }, () => initializeDatabase(options)));
            assert.equal(await db.collection(Collections.SYSTEM_SETTINGS).countDocuments(), 1);
            assert.equal(await db.collection(Collections.PLANS).countDocuments(), 6);
        });
        await t.test('an existing singleton keeps its original ID', async () => {
            const rows = db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS), original = (await rows.findOne({}))!;
            await rows.deleteMany({}); const custom = { ...original, _id: new ObjectId(), transcriptionMultipliers: { soniox: 2, elevenlabs: 4 } };
            await rows.insertOne(custom); await initializeDatabase(options);
            assert.deepEqual(await rows.findOne({}), custom);
        });
    } finally {
        await db.dropDatabase(); await client.close();
        if (previous === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = previous;
    }
});

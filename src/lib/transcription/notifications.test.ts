import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { MongoServerError, ObjectId } from 'mongodb';
import type { Notification, Recording } from '@/lib/db/types';

type Fixture={recording:Partial<Recording>|null;notifications:Notification[];pushes:number;failBeforeInsert:boolean;deleted:boolean;database:unknown};
const key=Symbol.for('vosift.test.processing-notifications');
const root=globalThis as typeof globalThis & {[key]:Fixture};
const prelude=`const s=()=>globalThis[Symbol.for('vosift.test.processing-notifications')];`;
const modules:Record<string,string>={
    '@/lib/mongodb':`export const Collections={NOTIFICATIONS:'notifications',USERS:'users'};export async function getMongoDb(){return s().database;}`,
    '@/lib/db/recordings':`export async function getRecordingById(){return structuredClone(s().recording);}`,
    '@/lib/db/users':`export async function findUserByAuthSubject(){return {_id:'fixture-user',softDelete:{isDeleted:s().deleted}};}`,
    '@/lib/web-push':`export async function sendWebPushNotification(){s().pushes++;return {success:true};}`,
    '@/lib/access-control-common':`export function checkUserAccess(){return {allowed:true};}`,
    '@/lib/logger':`export const logger={error(){},warn(){}};`,
};
const hook=registerHooks({resolve(specifier,context,next){const source=/(?:\/lib\/notifications|\/lib\/push-delivery|\/transcription\/notifications)\.ts$/.test(context.parentURL||'')?modules[specifier]:undefined;return source?{url:'data:text/javascript,'+encodeURIComponent(prelude+source),shortCircuit:true}:next(specifier,context);}});
const {notifyProcessingOutcome}=await import('./notifications');
after(()=>hook.deregister());
function setup(){const f:Fixture={recording:{_id:new ObjectId(),transcriptionAttemptId:'attempt',transcriptionResultAttemptId:'original-result',
    transcriptionStatus:'failed',transcriptionEnrichmentPending:true,fullTranscript:[],standardizedDisplayName:'Fictional demo'},
    notifications:[],pushes:0,failBeforeInsert:false,deleted:false,database:{collection(name:string){return {
        async insertOne(notification:Notification){if(f.failBeforeInsert){f.failBeforeInsert=false;throw new Error('Insert unavailable');}if(f.notifications.some(n=>n.userId===notification.userId&&n.eventKey===notification.eventKey))throw new MongoServerError({message:'Duplicate event',code:11000});f.notifications.push(notification);},
        async findOne(filter:Partial<Notification>){return name==='users'?{pushSubscriptions:[{type:'web',endpoint:'https://push.invalid',keys:{}}]}:f.notifications.find(n=>n.userId===filter.userId&&n.eventKey===filter.eventKey)||null;}
    };}}};root[key]=f;return f;}

test('callback redelivery and concurrent completion produce one truthful in-app partial notice and push',async()=>{
    const f=setup();await Promise.all([notifyProcessingOutcome('owner','recording','partial','attempt'),notifyProcessingOutcome('owner','recording','partial','attempt')]);
    assert.equal(f.notifications.length,1);assert.equal(f.notifications[0].type,'warning');assert.equal(f.notifications[0].title,'Transcript Saved');assert.equal(f.pushes,1);
    Object.assign(f.recording!,{transcriptionStatus:'completed',transcriptionEnrichmentPending:false});
    await notifyProcessingOutcome('owner','recording','completed','attempt');await notifyProcessingOutcome('owner','recording','completed','attempt');
    assert.equal(f.notifications.length,2);assert.equal(f.notifications[1].title,'Transcription Ready');assert.equal(f.pushes,2);
});

test('failed in-app insert is recoverable without paying for another provider call',async()=>{
    const f=setup();f.failBeforeInsert=true;await notifyProcessingOutcome('owner','recording','partial','attempt');assert.equal(f.notifications.length,0);
    await notifyProcessingOutcome('owner','recording','partial','attempt');assert.equal(f.notifications.length,1);assert.equal(f.pushes,1);
});

test('stale or deleted content never emits a fresh processing notification',async()=>{
    const f=setup();await notifyProcessingOutcome('owner','recording','partial','old-attempt');assert.equal(f.notifications.length,0);
    f.deleted=true;await notifyProcessingOutcome('owner','recording','partial','attempt');assert.equal(f.notifications.length,0);
    f.deleted=false;f.recording=null;await notifyProcessingOutcome('owner','recording','completed','attempt');assert.equal(f.notifications.length,0);
});

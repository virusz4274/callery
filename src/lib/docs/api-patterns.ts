/**
 * @fileoverview API Pattern Documentation
 * 
 * This documents the patterns used for data fetching and mutations
 * in the vosift application.
 * 
 * @module docs/api-patterns
 */

/**
 * # API Patterns Overview
 * 
 * ## Server Actions (Mutations)
 * 
 * Server Actions are used for all data mutations (create, update, delete).
 * They provide direct access to the database without an HTTP layer.
 * 
 * Location: `src/app/actions/`
 * 
 * Files:
 * - `upload-recordings.ts` - Upload audio files to R2 and create recordings
 * - `delete-recordings.ts` - Delete recordings from R2 and MongoDB
 * - `contacts.ts` - Create/update contacts
 * - `save-contacts.ts` - Bulk sync contacts from Google
 * - `update-contact-plan.ts` - Update user plan
 * - `google-auth.ts` - Google OAuth token handling
 * 
 * Pattern:
 * ```typescript
 * 'use server';
 * 
 * export async function actionName(data: InputType): Promise<ResultType> {
 *     const firebaseUid = await getFirebaseUidFromSession();
 *     if (!firebaseUid) {
 *         return { success: false, error: 'Not authenticated' };
 *     }
 *     
 *     // Perform mutation
 *     await dbOperation(...);
 *     
 *     return { success: true };
 * }
 * ```
 * 
 * ## API Routes (Data Fetching)
 * 
 * API Routes are used for data fetching (GET requests).
 * They return JSON responses and are called via `authFetch`.
 * 
 * Location: `src/app/api/`
 * 
 * Endpoints:
 * - `/api/recordings` - List recordings with pagination
 * - `/api/recordings/[id]` - Get single recording with playback URL
 * - `/api/contacts` - List contacts
 * - `/api/user/profile` - Get/update user profile
 * - `/api/stats` - Dashboard statistics
 * - `/api/transcribe` - Trigger transcription
 * - `/api/auth/*` - Session management
 * 
 * Pattern:
 * ```typescript
 * import { verifySession } from '@/lib/firebase/session';
 * 
 * export async function GET(req: NextRequest) {
 *     const { uid } = await verifySession(req);
 *     if (!uid) {
 *         return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *     }
 *     
 *     const data = await fetchData(uid);
 *     return NextResponse.json(data);
 * }
 * ```
 * 
 * ## Client-Side Data Fetching
 * 
 * Use custom hooks that wrap the API client utilities:
 * 
 * ```typescript
 * import { authFetchJson, ApiError } from '@/lib/api-client';
 * 
 * const { data, error, isLoading } = useRecordings();
 * ```
 * 
 * ## Error Handling
 * 
 * All API calls should use the centralized error handling:
 * 
 * ```typescript
 * import { authFetchJson, ApiError } from '@/lib/api-client';
 * 
 * try {
 *     const data = await authFetchJson<DataType>('/api/endpoint');
 * } catch (error) {
 *     if (error instanceof ApiError) {
 *         if (error.isAuthError) {
 *             // Redirect to login
 *         }
 *         // Handle other errors
 *     }
 * }
 * ```
 */

export { };

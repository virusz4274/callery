# Firebase Cutover Runbook

This runbook is the supported replacement flow when retiring the old Firebase project and starting fresh.

## Target Model

- one Google Cloud project
- Firebase enabled on that project
- Firebase Auth for app identity
- Google People API and OAuth clients in that same project
- no migration of old Firebase users or `firebaseUid` values

## Provisioning Sequence

1. Create the new Google Cloud project.
2. Enable Firebase on that project.
3. Create the Firebase web app and copy the client config into `.env`.
4. Enable Firebase Auth providers:
   - `Email/Password`
   - `Google`
5. Add the production origin to Firebase authorized domains.
6. Register the Android package `com.coarde.vosift`.
7. Add the required Android SHA fingerprints.
8. Create the Firebase Admin service account and supply it through `service-account.json` or `FIREBASE_SERVICE_ACCOUNT`.
9. Enable `Google People API`.
10. Configure the OAuth consent screen.
11. Create the Contacts-sync OAuth web client and add:
   - `https://<your-domain>/api/auth/google/callback`
   - `http://localhost:9000/api/auth/google/callback`
12. Set or rotate:
   - `NEXT_PUBLIC_FIREBASE_*`
   - `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXT_PUBLIC_GOOGLE_REDIRECT_URI`
   - `GOOGLE_TOKEN_ENCRYPTION_KEY`
   - `ADMIN_BOOTSTRAP_EMAILS`

## Fresh-Start Cutover

1. Wipe MongoDB.
2. Wipe R2 objects for the app bucket or prefix.
3. Run `npm run db:init`.
4. Start the app with the new env.
5. Sign in with an email listed in `ADMIN_BOOTSTRAP_EMAILS`.
6. Confirm the first profile is created as `admin`.
7. Verify signup, login, Google sign-in, Contacts sync, and Android sign-in.

## Notes

- Firebase Google sign-in is the app-auth flow.
- Google Contacts sync is a separate OAuth consent flow.
- Both flows should live under the same Google Cloud project.
- Existing users must sign up or sign in again after cutover because the Firebase project has changed.

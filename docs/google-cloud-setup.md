# Google Cloud & Firebase Setup Guide

This guide details how to set up a fresh environment for the application. The application relies on a unified Google Cloud Project that handles both Firebase Authentication and Google API access (specifically the People API for contacts).

## 1. Create a Firebase Project

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Click **Add project**.
3.  Name your project (e.g., `call-memo-app`).
4.  Enable Google Analytics if desired (optional).
5.  Click **Create Project**.

## 2. Configure Authentication

1.  In the Firebase Console, go to **Build** > **Authentication**.
2.  Click **Get Started**.
3.  Select **Google** as a Sign-in provider.
4.  Enable it.
5.  For **Project support email**, select your email.
6.  Click **Save**.

## 3. Enable Google People API (Critical)

This step is required for the "Sync Google Contacts" feature.

1.  In the Firebase Console, click the **Gear icon** (Project Settings) > **Integrations**.
2.  Click **Google Cloud Settings** (or navigate directly to the [Google Cloud Console](https://console.cloud.google.com/)).
3.  Ensure your new project is selected in the top bar.
4.  In the search bar, type **"Google People API"**.
5.  Select it and click **ENABLE**.

## 4. Configure OAuth Consent Screen

1.  In the Google Cloud Console, go to **APIs & Services** > **OAuth consent screen**.
2.  Select **External** for User Type (unless you are a Google Workspace organization).
3.  Click **Create**.
4.  **App Information**:
    *   **App Name**: (This is what users will see when logging in, e.g., "Call Memo").
    *   **User support email**: Your email.
    *   **Developer contact information**: Your email.
5.  Click **Save and Continue**.
6.  **Scopes**:
    *   Click **Add or Remove Scopes**.
    *   Manually add this scope URL in the "Manually add scopes" box or search for it:
        `https://www.googleapis.com/auth/contacts.readonly`
    *   Click **Add to Table** and then **Update**.
    *   Ensure `userinfo.email` and `userinfo.profile` are also selected (default).
7.  **Test Users**:
    *   Add your own email address to the list of Test Users. This is required while the app is in "Testing" mode.

## 5. Get Credentials & Update Environment

You need to update two places in your code: the `.env` file (frontend/public config) and the `service-account.json` (backend/admin config).

### A. Frontend Credentials (.env)

1.  **Firebase Config**:
    *   In Firebase Console, go to **Project Settings** > **General**.
    *   Scroll down to "Your apps". Click the `</>` (Web) icon to create a web app.
    *   Register the app (hosting is optional).
    *   Copy the `firebaseConfig` values into your `.env` file:
        ```bash
        NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
        NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
        NEXT_PUBLIC_FIREBASE_APP_ID="1:..."
        ```

2.  **Google OAuth Config**:
    *   In Google Cloud Console, go to **APIs & Services** > **Credentials**.
    *   You should see an "OAuth 2.0 Client ID" labeled "Web client (auto created by Google Service)" or similar. You can use this one, or create a new "Web Application" client.
    *   **Redirect URIs**: Ensure you add your app's callback URL:
        *   Local: `http://localhost:9000/api/auth/google/callback`
        *   Production: `https://your-domain.com/api/auth/google/callback`
    *   Copy the Client ID and Secret to your `.env` file:
        ```bash
        NEXT_PUBLIC_GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
        GOOGLE_CLIENT_SECRET="GOCSPX-..."
        NEXT_PUBLIC_GOOGLE_REDIRECT_URI="http://localhost:9000/api/auth/google/callback"
        ```

### B. Backend Credentials (service-account.json)

1.  In Firebase Console, go to **Project Settings** > **Service accounts**.
2.  Click **Generate new private key**.
3.  This will download a JSON file.
4.  **Rename** this file to `service-account.json`.
5.  **Replace** the existing `service-account.json` in your project root with this new file.

## 6. Verification

1.  Stop your development server (`Ctrl+C`).
2.  Run `npm run dev`.
3.  Try logging in (Tests Firebase Auth).
4.  Try syncing contacts (Tests People API & OAuth Scopes).

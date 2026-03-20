# Setup Guide (Step-by-Step)

Welcome to Callery! This guide is written for anyone—whether you are an experienced developer or a complete beginner—to comfortably get this application up and running on your local machine. 

By following these instructions step-by-step, you will create the necessary free accounts, fill in your secret keys, and start the app.

---

## Prerequisites Checklist

Before you start, make sure you have installed:
- [Node.js (version 20 or higher)](https://nodejs.org/) - The environment that runs our code.
- [Git](https://git-scm.com/downloads) - To copy the code to your machine.

---

## Step 1: Get the Code and Prepare

First, you need to download the code to your computer and install the necessary dependencies.

1. Open your terminal (or Command Prompt).
2. Clone the repository and move into its folder:
   ```bash
   git clone <repo-url>
   cd Callery
   ```
3. Install the application dependencies:
   ```bash
   npm install
   ```
4. Create your secret configuration file by copying the template we provided:
   ```bash
   cp .env.example .env
   ```

You will spend most of this guide replacing the placeholder values on the right side of the equals sign (`=`) inside the new `.env` file you just created.

> [!IMPORTANT]
> Callery now validates environment variables strictly at startup and build time. Do not delete required keys or leave them commented out. If you are not ready to configure an integration yet, leave the key present and keep a placeholder value such as `replace-me` until you wire the real service.

**Generate Random Secrets:**
In your `.env` file, there are three keys that just need a random, secure string of text:
- `UPLOAD_SESSION_SECRET`
- `SHARE_LINK_SECRET`
- `MOBILE_SYNC_SESSION_SECRET`

You can use a password generator or run `openssl rand -hex 32` in your terminal to create random strings. Save a different random string for each of these values.

> [!IMPORTANT]
> **Store these secrets safely!** For security reasons, do not reuse the same value for all three. More importantly, **do not change these once you have live users**, as it will immediately log everyone out and break any existing share links or active uploads.


---

## Step 2: Database (MongoDB Atlas)

Callery uses MongoDB to store data. The easiest way to get a database is using MongoDB's free tier.

**How to set it up:**
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and sign up for a free account.
2. Create a "Shared" (free) Cluster.
3. Under "Database Access", create a Database User with a username and password. **Save this password!**
4. Under "Network Access", add your IP address (or `0.0.0.0/0` to allow access from anywhere for testing purposes).
5. Go back to "Databases", click **Connect**, then choose **Connect your application**.
6. Copy the connection string. It will look like this: `mongodb+srv://<username>:<password>@cluster0...`
7. Replace `<password>` in the connection string with the password you created in step 3.

**Update your `.env` file:**
Paste your connection string into your `.env` file:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/callery
MONGODB_CONNECTION_MODE=default
```

---

## Step 3: Authentication (Firebase)

Callery uses Firebase to handle user logins securely. You get this for free with a Google account.

**How to set it up:**
1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add project**.
2. Give your project a name and follow the prompts to create it. (This also creates an underlying Google Cloud Project with the same name).
3. Once in your project dashboard, click the **Web icon (</>)** to add a Web App. Register the app (you don't need Firebase Hosting).
4. Firebase will show you a block of code with your **firebaseConfig**. Keep this window open.

**Update your `.env` file:**
Copy the values from the **firebaseConfig** block into your `.env` file:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

**Enable Email/Password and Google Login:**
1. In the Firebase console left menu, click **Authentication**, then **Get Started**.
2. Go to the **Sign-in method** tab.
3. Click **Email/Password**, toggle it to **Enable**, and click **Save**.
4. Click **Add new provider** and select **Google**.
5. Toggle it to **Enable**, select your project support email from the dropdown, and click **Save**.
6. While still in the Google provider settings, expand the **Web SDK configuration** dropdown, copy your **Web client ID**, and add it to your `.env` file:
   ```env
   NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
   ```

**Get the Admin Security Key:**
For the app to verify users securely, it needs an "Admin" key.
1. In the Firebase console, click the **Settings Gear** next to "Project Overview" (top left) and select **Project settings**.
2. Go to the **Service accounts** tab.
3. Click **Generate new private key**. This will download a JSON file to your computer.
4. Open the downloaded JSON file in a text editor. Copy all of the contents.
5. In your `.env` file, paste the ENTIRE JSON content (best kept as a single, long line) into:
   ```env
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
   ```
   *(Alternatively, rename the downloaded file to `service-account.json` and save it directly in your project's main folder, leaving `FIREBASE_SERVICE_ACCOUNT` blank in your `.env` file).*

---

## Step 4: Storage (Cloudflare R2)

Recordings are stored in Cloudflare R2, which offers generous free storage.

**How to set it up:**
1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/sign-up) and create an account.
2. In the left menu, click **R2**. (You may need to add a payment method, but they won't charge you for the free tier).
3. Click **Create bucket**. Name it whatever you like (e.g., `callery-audio`) and click **Create bucket**.
4. Go back to the main R2 page. Look to the right side and click **Manage R2 API Tokens**.
5. Click **Create API token**. 
   - Give it a name like `Callery App`.
   - Set Permissions to **Object Read & Write**.
   - Click **Create API Token**.
6. Cloudflare will show you your Access Key ID, Secret Access Key, and your specific Endpoint URL.

**Update your `.env` file:**
Paste the credentials into your `.env` file:
```env
R2_ENDPOINT=https://<your-account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=callery-audio
R2_REGION=auto
R2_FORCE_PATH_STYLE=false
```

**Set up Lifecycle Rules (Crucial for Storage Costs):**
When users export their data from the app, it generates temporary `.zip` files in an `exports/` folder. To ensure these files don't consume your storage quota forever, you must add an auto-delete rule:
1. In your R2 bucket settings, go to the **Settings** tab.
2. Scroll down to **Object lifecycle rules** and click **Add rule**.
3. Name it `Delete Expired Exports`.
4. Under **Apply to specific prefix**, enter: `exports/`
5. Under **Action**, select **Delete uploaded objects** and set it to **7 days** after upload.
6. Click **Save**.

**Abort Incomplete Multipart Uploads (Crucial for Storage Costs):**
Large file transfers often use "Multipart Uploads". If an upload is interrupted, the partial parts stay in your bucket and cost you money until aborted.
1. Click **Add rule** again.
2. Name it `Abort Incomplete Uploads`.
3. Under **Apply to all objects**, toggle the switch.
4. Under **Action**, select **Abort incomplete multipart uploads** and set it to **7 days** after upload.
5. Click **Save**.

**Set up CORS (Cross-Origin Resource Sharing):**
This allows the app to upload files directly from your browser.
1. Go back to your bucket settings in Cloudflare R2.
2. Scroll down to **CORS Policy** and click **Add CORS policy**.
3. Paste the following JSON configuration and save:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:9000", "https://your-production-domain.com"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

---

## Step 5: Final Bootstrapping

Before starting the app, make sure every required key in `.env` still exists and has some explicit value. For services you are not enabling yet, keep the placeholder values from `.env.example` instead of removing the keys.

1. **Set yourself as an admin:**
   In your `.env` file, find `ADMIN_BOOTSTRAP_EMAILS` and add your email:
   ```env
   ADMIN_BOOTSTRAP_EMAILS=your.email@example.com
   ```

   > [!WARNING]
   > **Security Note:** Currently, anyone who signs up with an email listed here can be granted admin access, even if their email is not yet verified in Firebase. It is recommended to remove your email from this list once you have successfully signed up and confirmed your admin status.
2. **Initialize the Database:**
   In your terminal, run the following command to set up the default collections and settings in MongoDB:
   ```bash
   npm run db:init
   ```
3. **Start the App!**
   Start the local development server:
   ```bash
   npm run dev
   ```
4. **Login:**
   Open your browser and navigate to [http://localhost:9000](http://localhost:9000). Click Sign up, and use the exact email address you put in `ADMIN_BOOTSTRAP_EMAILS`. You will now have administrative access.

**Congratulations! Your Callery app is now successfully running.**

---

## Additional Service Configuration

These services unlock important product features. The current env validator still expects explicit values for their keys, so either configure them properly now or keep the placeholder values in place until you are ready.

### Step 6: Google Contacts Sync

To allow users to synchronize their contacts with Callery, you need to configure the Google People API.
**CRITICAL:** This *must* be done inside the **same Google Cloud Project** that you created for Firebase in Step 3. Creating a new, separate project will break authentication.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. At the top left of the screen, make sure the project selected is the **same project name** you created in Firebase.
3. In the search bar at the top, search for **Google People API** and click on it. Click **Enable**.
4. In the left-hand menu, click **APIs & Services**, then **OAuth consent screen**.
   - Select **External** (or Internal if you have a Google Workspace) and click Create.
   - Fill in the required standard app details (App name, Support email) and save.
   - Under the **Scopes** section, click **Add or Remove Scopes**.
   - In the "Manually add scopes" box at the bottom, paste: `https://www.googleapis.com/auth/contacts.readonly`
   - Click **Add to Table**, then click **Update** at the bottom of the drawer.
   - Scroll to the bottom and click **Save and Continue**.
   
   > [!NOTE]
   > The `contacts.readonly` scope is the only one required for Callery's contacts synchronization. 
   > - **Firebase Auth:** Handles its own scopes (`email`, `profile`, `openid`) automatically within its own setup.
   > - **Gemini AI:** Uses an API key and does not require manual OAuth scope configuration.
5. In the left-hand menu, click **Credentials**.
   - Click **Create Credentials** at the top, and select **OAuth client ID**.
   - Application Type: **Web application**.
   - Under "Authorized redirect URIs", click **Add URI** and enter: 
     `http://localhost:9000/api/auth/google/callback` 
     *(Remember to add your live website URL here later when you deploy it).*
   - Click **Create**.
6. Google will give you a **Client ID** and a **Client Secret**.

**Update your `.env` file:**
Paste the generated credentials:
```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION=v1
```
You also need an encryption key so the app securely stores contact tokens. Generate another random 32-character string (like you did in Step 1) and add it here:
```env
GOOGLE_TOKEN_ENCRYPTION_KEY=your-random-encryption-key
```

> [!IMPORTANT]
> **Do not change this key once you have users!** This key is used to encrypt Google integration tokens. If you change it later, the application will no longer be able to decrypt the existing tokens in your database, and all users will have to disconnect and re-connect their Google accounts to use sync features.

### Step 7: AI and Transcription Providers

Callery uses AI for intelligent meeting summaries, audio transcription, and document transliteration.

#### Gemini (Summaries & Transliteration)
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Click **Get API key** on the left menu, then click **Create API key**.
3. Choose the Google Cloud Project you created earlier, or create a new one.
4. Copy the API key and update your `.env` file:
```env
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key
GEMINI_MODEL_SUMMARY=gemini-2.5-flash-lite
GEMINI_MODEL_TRANSLITERATION=gemini-2.5-flash-lite
GEMINI_MODEL_EMBEDDING=gemini-embedding-001
```

#### Soniox or ElevenLabs (Advanced Audio Transcription)
If you are processing audio recordings longer than 5 minutes, you'll need one of our supported transcription backends.

**For Soniox:**
1. Sign up at [Soniox](https://soniox.com/).
2. Find your API Key in your dashboard.
3. Set `NEXT_PUBLIC_APP_URL` to your live app origin so the server can generate a public webhook URL like `https://your-live-domain.com/api/webhooks/soniox` for each async transcription request.
4. Choose a shared secret value for webhook authentication and add it to your environment as `SONIOX_WEBHOOK_SECRET`. The app sends it to Soniox as a custom header on each async transcription request, and verifies the same header on callback.
5. Update your `.env` file:
```env
SONIOX_API_KEY=your-soniox-key
SONIOX_API_BASE_URL=https://api.soniox.com
SONIOX_MODEL_ID=stt-async-v4
SONIOX_WEBHOOK_SECRET=your-soniox-webhook-secret
```

**For ElevenLabs (Alternative to Soniox):**
1. Sign up at [ElevenLabs](https://elevenlabs.io/).
2. Grab your API Key from your profile settings.
3. Update your `.env` file:
```env
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_API_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_MODEL_ID=scribe_v2
ELEVENLABS_WEBHOOK_SECRET=your-elevenlabs-webhook-secret
```

If you are not using one of these transcription providers yet, leave its required keys in `.env` with placeholder values until you finish that integration.

### Step 8: Stripe Billing Setup

To charge users for processing time and storage, you can enable Stripe integration.

1. Create a free account at [Stripe](https://stripe.com/).
2. Ensure you are in "Test Mode" (toggle at the top right of the Stripe dashboard).
3. Open the **Developers** tab and look for your **Secret key**.
4. Keep the **Developers** tab open, switch to the **Webhooks** section, and click **Add an endpoint**.
   - Endpoint URL: `http://localhost:9000/api/stripe/webhook` (Update this when deploying live).
   - Events to listen to (match the app webhook handler):
     - Checkout: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
     - Subscriptions: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.trial_will_end`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired`
     - Invoices: `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.payment_succeeded`, `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible`
     - Customers: `customer.deleted`
   - Once created, Stripe will reveal a **Signing secret** (it starts with `whsec_`).
5. Update your `.env` file:
```env
NEXT_PUBLIC_ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

*Note: For a fully functioning billing cycle, you must also create Pricing Products and Meters inside Stripe for "storage_usage_bytes" and "transcription_usage_seconds". For deep details on creating pricing tiers, see our specific [billing.md](billing.md) guide.*

### Step 9: Push, Email, and Cron Configuration

These settings are also required by the current env contract:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_CONTACT_EMAIL=admin@example.com

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM="Callery <no-reply@example.com>"
SUPPORT_EMAIL=support@example.com

CRON_SECRET=your-random-cron-secret
EXPORT_JOB_STALE_MINUTES=90
EXPORT_INLINE_PROCESSING=false
SOFT_DELETE_RESTORE_DAYS=30
NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU=false
CSP_REPORT_ONLY=false
```

### Step 10: Custom Firebase Auth Domain (Optional Proxy)

If you don't want the Google Login popup to redirect users to the default `your-project.firebaseapp.com` domain, Callery has a built-in Next.js proxy to seamlessly hide it behind your own domain.

1. Go to Firebase Console -> **Authentication** -> **Settings** -> **Authorized domains**.
2. Click **Add domain** and type your live custom domain (e.g., `yourwebsite.com`).
3. In your `.env` file, change `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to your custom domain, and then set `FIREBASE_AUTH_HELPER_ORIGIN` to the original Firebase domain you replaced.
```env
# Change this to your actual custom domain
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=yourwebsite.com

# Tell Next.js where to proxy the /__/auth/ requests under the hood
FIREBASE_AUTH_HELPER_ORIGIN=https://your-project.firebaseapp.com
```

With this configured, Next.js will automatically proxy the authentication traffic, keeping your users on your custom domain the entire time!

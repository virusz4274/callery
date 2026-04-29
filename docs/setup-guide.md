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

   > [!NOTE]
   > The admin role is only granted when the account's email is verified in Firebase. Signing up with an unverified email address that matches a bootstrap email will create a regular user account, not an admin. Verify your email in Firebase before your first login to receive admin access. Once you have confirmed your admin account is working, you can safely remove your email from this list — it has no effect on existing admin accounts.
2. **Initialize the Database:**
   In your terminal, run the following command to set up the default collections and settings in MongoDB:
   ```bash
   npm run db:init
   ```

3. **Create Atlas Search Indexes (Required for Search):**
   After the database has been initialized, you must **manually** create two search indexes in the [MongoDB Atlas UI](https://cloud.mongodb.com/). These cannot be created automatically because Atlas Search indexes are managed by the Atlas control plane, not by the MongoDB driver.

   > [!IMPORTANT]
   > Without these indexes, keyword search and semantic/AI search will not function. The `db:init` script prints these same instructions in your terminal for reference.

   **Atlas Search Index** (for keyword / full-text search):
   - Go to your cluster in Atlas → **Atlas Search** tab → **Create Index**.
   - Choose **JSON Editor** for the configuration method.
   - **Index name:** `recordings_text_search`
   - **Collection:** `recordings`
   - Paste the following JSON configuration:
   ```json
   {
     "mappings": {
       "dynamic": false,
       "fields": {
         "firebaseUid": { "type": "string" },
         "summary": { "type": "string" },
         "contactName": { "type": "string" },
         "fileName": { "type": "string" },
         "fullTranscript": {
           "type": "document",
           "fields": {
             "text": { "type": "string" }
           }
         },
         "tags": { "type": "string" },
         "standardizedDisplayName": { "type": "string" }
       }
     }
   }
   ```

   **Atlas Vector Search Index** (for semantic / AI search):
   - Still on the **Atlas Search** tab, click **Create Index** again.
   - Choose **JSON Editor** for the configuration method.
   - **Index name:** `recordings_vector_search`
   - **Collection:** `recordings`
   - Paste the following JSON configuration:
   ```json
   {
     "fields": [
       {
         "numDimensions": 3072,
         "path": "summaryEmbedding",
         "similarity": "cosine",
         "type": "vector"
       },
       {
         "path": "firebaseUid",
         "type": "filter"
       },
       {
         "path": "isArchived",
         "type": "filter"
       }
     ]
   }
   ```

   > [!NOTE]
   > Both indexes will take a minute or two to build. Their status will show as **Active** once ready.
4. **Start the App!**
   Start the local development server:
   ```bash
   npm run dev
   ```
5. **Login:**
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
3. **Configure Webhooks (Required for long recordings):**
   - Navigate to your [webhooks settings](https://elevenlabs.io/app/settings/webhooks) in the ElevenLabs dashboard.
   - Click **Create Webhook**.
   - Configure your webhook with:
     - **Name**: `Callery Webhook` (or any descriptive name).
     - **Callback URL**: `https://your-public-domain.com/api/webhooks/elevenlabs`
     - **Webhook Auth Method**: `HMAC`.
   - Once created, navigate to the webhook events section and link your webhook to the following events:
     - `speech_to_text.completed`
     - `speech_to_text.failed`
   - Copy the **Signing Secret** (HMAC secret) revealed by ElevenLabs.
4. Update your `.env` file:
```env
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_API_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_MODEL_ID=scribe_v2
ELEVENLABS_WEBHOOK_SECRET=your-elevenlabs-signing-secret
```

> [!NOTE]
> Callery automatically includes `webhook=true` and correlation metadata in its API requests to ElevenLabs. You only need to ensure the webhook is correctly configured in your dashboard as described above.

If you are not using one of these transcription providers yet, leave its required keys in `.env` with placeholder values until you finish that integration.

### Step 8: Stripe Billing Setup

Stripe billing is optional but requires completing all sub-steps below before any user can pay. The app validates that plan price IDs are non-empty before creating a checkout session, so skipping any sub-step means checkout returns an error for every plan.

> [!NOTE]
> For a complete technical reference on how billing works, see [billing.md](billing.md). This section covers the setup steps in order.

#### 8a. Create a Stripe account and get your API keys

1. Create a free account at [Stripe](https://stripe.com/).
2. Make sure you are in **Test Mode** (toggle at the top right of the Stripe Dashboard). Do everything below in test mode first, then repeat in live mode when you are ready to accept real payments.
3. Go to **Developers → API keys**.
4. Copy your **Secret key** (starts with `sk_test_`).
5. Update your `.env` file:
```env
NEXT_PUBLIC_ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_test_...
```

#### 8b. Create the two Billing Meters

Meters are what Stripe uses to track per-user storage and transcription usage. **If you skip this step, metered overage billing will silently fail.**

1. In the Stripe Dashboard, go to **Billing → Meters** (or search for "Meters").
2. Click **Create meter**. Fill in:
   - **Display name**: `Storage Usage`
   - **Event name**: `storage_usage_bytes` ← must match exactly
   - **Default aggregation formula**: **Last** (not Sum — storage is billed as the peak amount stored in a period, not the running total)
   - Click **Create meter**.
3. Click **Create meter** again. Fill in:
   - **Display name**: `Transcription Usage`
   - **Event name**: `transcription_usage_seconds` ← must match exactly
   - **Default aggregation formula**: **Sum** (transcription is cumulative)
   - Click **Create meter**.

> [!WARNING]
> The event names `storage_usage_bytes` and `transcription_usage_seconds` are hardcoded in the app. Do not change them. Using "Sum" for storage would cause customers to be charged for the accumulated total of all storage reports rather than their peak usage — resulting in massive over-billing.

#### 8c. Create products and prices in Stripe

For each plan you want to sell, you need Stripe Prices. Here is the full set for the standard plans:

**For Standard (monthly recurring, $10/month):**
1. Go to **Product Catalog → Add product**.
2. Name: `Standard`. Click **Add a price**.
3. Price model: **Standard pricing**, Recurring, Monthly, amount `10.00 USD`. Click **Save product**.
4. Copy the **Price ID** (e.g. `price_abc123`). This is the `stripePriceId` for the Standard plan.
5. Add a metered price for storage overage: on the same product, click **Add another price**.
   - Price model: **Standard pricing**, Recurring, Monthly.
   - Billing scheme: **Per unit**, Usage type: **Metered**, Meter: `Storage Usage`.
   - Set your desired per-GB rate. Click **Add price**.
   - Copy the Price ID. This is the `stripeStoragePriceId` for Standard.
6. Repeat step 5 for transcription overage — choose Meter: `Transcription Usage`, set your per-second rate.
   - Copy the Price ID. This is the `stripeTranscriptionPriceId` for Standard.

**For Pro (monthly recurring, $20/month):**
Repeat the same process as Standard with `20.00 USD` and your desired overage rates.

**For Lifetime (one-time payment, $250):**
1. Go to **Product Catalog → Add product**. Name: `Lifetime`. Click **Add a price**.
2. Price model: **Standard pricing**, **One time**, amount `250.00 USD`. Click **Save product**.
3. Copy the Price ID. This is the `stripePriceId` for the Lifetime plan.
4. Add metered prices (same as Standard/Pro) for storage and transcription — the Lifetime plan creates a separate usage-only subscription after purchase to bill ongoing usage.

> [!NOTE]
> The `internal` and `custom` plans intentionally have no Stripe prices. They are for admin-assigned access only.

#### 8d. Register the webhook endpoint

1. In Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `http://localhost:9000/api/stripe/webhook` for local testing. Change this to your live URL when deploying.
3. Select the following events:
   - Checkout: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Subscriptions: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.trial_will_end`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired`
   - Invoices: `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.payment_succeeded`, `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible`
   - Customers: `customer.deleted`
4. Click **Add endpoint**. Stripe reveals a **Signing secret** (starts with `whsec_`).
5. Update your `.env` file:
```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

For local testing, forward events with the Stripe CLI:
```bash
stripe listen --forward-to localhost:9000/api/stripe/webhook
```

#### 8e. Configure the Billing Portal

The Billing Portal is the Stripe-hosted page where users can update their payment method, cancel, or change their subscription. Without configuring it, the "Manage Subscription" button in Settings will fail.

1. In Stripe Dashboard, go to **Settings → Billing → Customer portal**.
2. Under **Features**, enable at minimum:
   - Update payment methods
   - Cancel subscriptions
   - View billing history
3. Under **Business information**, add your business name and a support email.
4. Click **Save**.

> [!NOTE]
> You need to do this separately for **test mode** and **live mode** — portal configuration is not shared between them.

#### 8f. Map price IDs into the plan documents

After running `npm run db:init`, all plans have empty `stripePriceId` values in MongoDB. **No user can check out until you fill these in.** The checkout route returns HTTP 400 for any plan with an empty price ID.

1. Start the app and log in with your admin account.
2. Go to `/admin/plans`.
3. Click **Edit** on the Standard plan. Paste in the three Price IDs you copied in step 8c:
   - `stripePriceId` (the fixed monthly base price)
   - `stripeStoragePriceId` (the metered storage price)
   - `stripeTranscriptionPriceId` (the metered transcription price)
4. Click **Save**. Repeat for Pro and Lifetime.

> [!TIP]
> Plans will not appear on the public pricing page until they have a non-empty `stripePriceId` and `isActive` is true. This is by design — it prevents placeholder plans from being visible before you finish configuring Stripe.

#### 8g. Go live (production only)

When you are ready to accept real payments:

1. In Stripe Dashboard, switch from **Test Mode** to **Live Mode** (toggle at top right).
2. Go to **Developers → API keys** and copy your **live secret key** (starts with `sk_live_`).
3. Repeat steps 8b–8f in live mode: create meters, products, prices, webhook endpoint, and portal configuration. Live and test mode do not share any objects.
4. Update your `.env` file with the live credentials:
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...   # the signing secret from your LIVE webhook endpoint
```
5. In the live webhook endpoint settings, make sure the URL points to your production domain, not localhost.

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
SOFT_DELETE_RESTORE_DAYS=30
NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU=false
CSP_REPORT_ONLY=false
```

If you use the provided Docker Compose file, its `cron` sidecar reads the same `CRON_SECRET` and schedules only `process-exports` and `cleanup-recordings`.

> [!NOTE]
> **`CSP_REPORT_ONLY`** controls how the Content Security Policy header behaves in production:
> - **`false`** (recommended for production) — the browser **enforces** the policy and **blocks** any requests, scripts, or resources that violate it. This protects against XSS and data-injection attacks.
> - **`true`** — the browser sends the policy as `Content-Security-Policy-Report-Only`, which **logs** violations to the browser console but **does not block** them. Use this when first deploying to test that the CSP rules don't accidentally break legitimate app functionality.
>
> On **Vercel preview and development deployments** (`VERCEL_ENV` is not `production`), report-only mode is automatically enabled regardless of this setting, so previews are never blocked by CSP.
>
> This setting has no effect in local development (`NODE_ENV !== 'production'`), where CSP headers are not sent at all.

### Step 10: Optional Deployment Customizations

Some integrations in this repo are used by the first-party hosted service and are not required for self-hosting. Monitoring is one of those deployment-owned concerns.

If you self-host Callery and want error monitoring in your own deployment, configure it in your copy of the app. The upstream app does not require Sentry and the standard self-host `.env` contract does not include Sentry variables.

#### Optional: Add your own Sentry

1. Clone or deploy your own copy of the app first.
2. Run the Sentry wizard inside your deployment copy:

```bash
npx @sentry/wizard@latest -i nextjs
```

3. Follow the wizard using your own Sentry account, project, and deployment settings.

> [!NOTE]
> The hosted Callery service may use its own monitoring separately. That configuration is not part of the public self-host setup flow.
>
> If you want Sentry in a self-hosted deployment, it is owned by your deployment. You can either let the wizard scaffold the integration or manually adapt the existing Sentry files/config to your own DSNs and build settings.

### Step 11: Custom Firebase Auth Domain (Optional Proxy)

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

# Setup Guide (Step-by-Step)

Welcome to Vosift! This guide is written for anyone—whether you are an experienced developer or a complete beginner—to comfortably get this application up and running on your local machine. 

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
   cd Vosift
   ```
3. Install the application dependencies:
   ```bash
   npm install
   ```
4. Create your secret configuration file by copying the template we provided:
   ```bash
   cp .env.example .env
   ```

You will spend most of this guide filling in the blank values in right side of the equals sign (`=`) inside the new `.env` file you just created.

**Generate Random Secrets:**
In your `.env` file, there are three keys that just need a random, secure string of text:
- `UPLOAD_SESSION_SECRET`
- `SHARE_LINK_SECRET`
- `MOBILE_SYNC_SESSION_SECRET`

You can use a password generator or run `openssl rand -hex 32` in your terminal to create a random string, and paste the same string or three different strings for these values.

---

## Step 2: Database (MongoDB Atlas)

Vosift uses MongoDB to store data. The easiest way to get a database is using MongoDB's free tier.

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
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/vosift
```

---

## Step 3: Authentication (Firebase)

Vosift uses Firebase to handle user logins securely. You get this for free with a Google account.

**How to set it up:**
1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add project**.
2. Give your project a name and follow the prompts to create it.
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

**Enable Email/Password Login:**
1. In the Firebase console left menu, click **Authentication**, then **Get Started**.
2. Go to the **Sign-in method** tab.
3. Click **Email/Password**, toggle it to **Enable**, and click **Save**.

**Get the Admin Security Key:**
For the app to verify users securely, it needs an "Admin" key.
1. In the Firebase console, click the **Settings Gear** next to "Project Overview" (top left) and select **Project settings**.
2. Go to the **Service accounts** tab.
3. Click **Generate new private key**. This will download a JSON file to your computer.
4. Open the downloaded JSON file in a text editor. Copy all of the contents.
5. In your `.env` file, paste the ENTIRE JSON content (wrapped in quotes or just exactly as is if formatting allows, but best as a single line JSON) into:
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
3. Click **Create bucket**. Name it whatever you like (e.g., `vosift-audio`) and click **Create bucket**.
4. Go back to the main R2 page. Look to the right side and click **Manage R2 API Tokens**.
5. Click **Create API token**. 
   - Give it a name like `Vosift App`.
   - Set Permissions to **Object Read & Write**.
   - Click **Create API Token**.
6. Cloudflare will show you your Access Key ID, Secret Access Key, and your specific Endpoint URL.

**Update your `.env` file:**
Paste the credentials into your `.env` file:
```env
R2_ENDPOINT=https://<your-account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=vosift-audio
```

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

You should now have the minimum necessary values filled out in your `.env` file to start the app!

1. **Set yourself as an admin:**
   In your `.env` file, find `ADMIN_BOOTSTRAP_EMAILS` and add your email:
   ```env
   ADMIN_BOOTSTRAP_EMAILS=your.email@example.com
   ```
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

**Congratulations! Your Vosift app is now successfully running.**

---

## Optional: Advanced Integrations

You don't need these to run the app, but you can configure them later as needed. We recommend getting the basic app running first before diving into these.

- **AI Summaries & Transliteration:** Get an API key from [Google AI Studio (Gemini)](https://aistudio.google.com/) and paste it into `GOOGLE_GENERATIVE_AI_API_KEY`.
- **Advanced Transcription:** The app supports [Soniox](https://soniox.com/) or [ElevenLabs](https://elevenlabs.io/) for high-quality, long-form audio transcription. Update the respective keys in the `.env` file.
- **Stripe Billing:** Switch `NEXT_PUBLIC_ENABLE_BILLING=true` and input your Stripe keys to enable paid subscriptions. See [Stripe Billing docs](billing.md).
- **Google Contacts Sync:** Enable the Google People API from your Google Cloud Console to let users synchronize their contacts.

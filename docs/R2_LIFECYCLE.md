# Cloudflare R2 Lifecycle Policy

To prevent storage costs from accumulating, you should configure a lifecycle rule to automatically delete export archives after 7 days.

## Instructions

1.  **Log in** to your [Cloudflare Dashboard](https://dash.cloudflare.com).
2.  Navigate to **R2** and select your bucket (e.g., `call-memo-storage`).
3.  Click on the **Settings** tab.
4.  Scroll down to the **Object Lifecycle** section.
5.  Click **Add Rule**.
6.  Configure the rule as follows:
    *   **Rule Name**: `Delete Exports after 7 Days`
    *   **Apply to**: `Prefix`
    *   **Prefix**: `exports/`
    *   **Action**: `Delete object`
    *   **Duration**: `7 days`
7.  Click **Create Rule**.

## Verification
Any file uploaded to the `exports/` folder will now be automatically deleted by Cloudflare 7 days after its creation. This matches the 7-day expiration we set for the download links in the application.

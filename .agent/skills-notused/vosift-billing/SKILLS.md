name: vosift-billing description: Manages the Stripe hybrid billing lifecycle for Vosift (SaaS). Handles product catalog setup, multi-item subscription creation (Fixed + Metered), and usage reporting for Storage (Stateful/Max) and Transcription (Transactional/Sum).
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Vosift Billing Skill
====================

This skill provides the comprehensive toolset for implementing "Fixed Fee + Overage" billing. It is designed for a Next.js/TypeScript environment.

When to use this skill
----------------------

*   **Infrastructure Setup:** When initializing the Stripe environment (Product Catalog, Prices, Tax settings).
    
*   **Customer Onboarding:** When creating a new subscription that requires both a base license and metered overage tracking.
    
*   **Usage Reporting:** When a file is uploaded (Storage) or a call is processed (Transcription).
    
*   **Billing Management:** When handling plan upgrades/downgrades or updating payment methods.
    

How to use it
-------------

### 1\. Catalog Initialization

Run the setup script to ensure Stripe Products and Prices exist with the correct graduated tiering and aggregate\_usage settings.

*   **Script:** scripts/setup\_stripe\_catalog.ts
    
*   **Reference:** See resources/STRIPE\_API\_SPEC.md for the specific Price JSON structure.
    

### 2\. Subscription Creation

Subscriptions must be created with **three** price items:

1.  **Base License:** The fixed monthly fee (e.g., Pro Plan $29).
    
2.  **Transcription Meter:** Usage-based price (Sum aggregation).
    
3.  **Storage Meter:** Usage-based price (Max aggregation).
    

**Agent Rule:** Always use payment\_behavior: 'default\_incomplete' to handle 3D Secure (SCA) verification correctly.

### 3\. Usage Reporting

*   **Transcription:** Report strictly using action: 'increment' with an idempotency key (e.g., job\_id).
    
*   **Storage:** Report using action: 'set' to update the current total usage. Stripe will calculate the max usage for the billing period automatically.
    

Resources
---------

\-(resources/STRIPE\_API\_SPEC.md) - **CRITICAL:** Read this for exact endpoint and payload definitions. -(resources/subscription\_lifecycle.md) - Logic for handling upgrades and swaps.
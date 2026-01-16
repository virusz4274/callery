Subscription Lifecycle & Webhook Handling
=========================================

1\. Handling invoice.created
----------------------------

When a billing cycle ends, Stripe generates an invoice.

*   **Agent Task:** Create a Webhook Endpoint listening for invoice.created.
    
*   **Logic:**
    
    *   This event allows you to see the _final_ usage for the month before the customer is charged.
        
    *   The lines.data array will contain the metered usage.
        
    *   **Verification:** Check that quantity matches your internal logs.
        

2\. Handling Plan Upgrades
--------------------------

When a user upgrades from "Basic" to "Pro":

1.  **Don't Cancel:** Do not cancel the subscription.
    
2.  **Swap Items:** You must update the existing subscription items.
    
3.  **Proration:**
    
    *   **Fixed Fee:** Stripe prorates this automatically (credits remaining Basic time, charges Pro time).
        
    *   **Meters:** Stripe resets the meters for the _new_ price. The usage on the _old_ price is billed immediately.
        
    *   _Warning:_ If you switch Meter Price IDs, the "Free Tier" (e.g., first 1000 mins) resets. If this is undesirable, you must handle the logic manually or accept that upgrades refresh the allowance.
        

3\. Handling Payment Failures
-----------------------------

*   Listen for invoice.payment\_failed.
    
*   **Action:** Downgrade the user in your database to "ReadOnly".
    
*   Do not delete the data immediately; give a grace period (e.g., 14 days) before purging storage.
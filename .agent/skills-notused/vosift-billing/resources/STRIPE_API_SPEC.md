Vosift Stripe API Reference for AI Agents
=========================================

This document is the authoritative source for the Stripe API endpoints and JSON payloads required to build Vosift's billing engine.

1\. Product & Price Configuration (Setup)
-----------------------------------------

**Context:** Vosift uses a "Hybrid" model. You must create one Product ("Vosift Platform") and attach multiple Prices to it.

### Create Transcription Meter Price (Graduated)

*   **Endpoint:** POST /v1/prices
    
*   **Logic:** Charges $0 for first 1,000 mins, $0.05/min after.
    
*   **Required Parameter:** billing\_scheme='tiered', tiers\_mode='graduated'.
    
*   {"currency": "usd","product": "{{PRODUCT\_ID}}","recurring": {"interval": "month","usage\_type": "metered","aggregate\_usage": "sum"},"billing\_scheme": "tiered","tiers\_mode": "graduated","tiers": \[{ "up\_to": 1000, "unit\_amount": 0 },{ "up\_to": "inf", "unit\_amount": 5 }\],"nickname": "Transcription Overage (Pro)"}
    

``   ### Create Storage Meter Price (Stateful)  *   **Endpoint:** `POST /v1/prices`  *   **Logic:** Charges $0 for first 10GB, $0.20/GB after.  *   **Aggregation:** `max` (Critical for storage: bills for peak usage in the month).[1][2]  ```json  {    "currency": "usd",    "product": "{{PRODUCT_ID}}",    "recurring": {      "interval": "month",      "usage_type": "metered",      "aggregate_usage": "max"     },    "billing_scheme": "tiered",    "tiers_mode": "graduated",    "tiers": [      { "up_to": 10, "unit_amount": 0 },      { "up_to": "inf", "unit_amount": 20 }    ],    "nickname": "Storage Overage (Pro)"  }   ``

2\. Customer & Subscription Management
--------------------------------------

### Create Customer

*   **Endpoint:** POST /v1/customers
    
*   **Agent Note:** Store the returned id (cus\_...) in the Vosift database organizations table.
    

JSON

`   {    "email": "user@example.com",    "name": "Acme Corp",    "metadata": { "vosift_org_id": "org_123" }  }   `

### Create Hybrid Subscription (The "3-Item" Rule)

*   **Endpoint:** POST /v1/subscriptions
    
*   **Agent Note:** You must pass the Fixed Price, Transcription Price, and Storage Price in the items array.
    

JSON

`   {    "customer": "{{CUSTOMER_ID}}",    "items":,    "payment_behavior": "default_incomplete",    "expand": ["latest_invoice.payment_intent"]  }   `

### Update Subscription (Upgrade Plan)

*   **Endpoint:** POST /v1/subscriptions/{{SUBSCRIPTION\_ID}}
    
*   **Logic:** You must map the _existing_ item IDs to the _new_ price IDs. Do not just add new items; you must update the specific subscription\_item.
    
JSON
`{    "items":,    "proration_behavior": "always_invoice"  }   `

3\. Usage Reporting (Metering)
------------------------------

### Report Transcription (Transactional)

*   **Endpoint:** POST /v1/subscription\_items/{{SUB\_ITEM\_ID}}/usage\_records
    
*   **Method:** Incremental reporting.
    
*   **Idempotency:** Required. Use SHA256(job\_id + "transcription").
    

JSON
`   {    "quantity": 45,    "timestamp": 1715421200,    "action": "increment"  }   `

### Report Storage (Stateful)

*   **Endpoint:** POST /v1/subscription\_items/{{SUB\_ITEM\_ID}}/usage\_records
    
*   **Method:** Absolute reporting.
    
*   **Agent Note:** Since aggregation is max, send the **total current size** of the user's storage every time it changes (or nightly).
    

JSON

`   {    "quantity": 150,     "timestamp": 1715421200,    "action": "set"  }   `

_Note: action: 'set' works best with max aggregation to ensure the peak is captured accurately._ 3

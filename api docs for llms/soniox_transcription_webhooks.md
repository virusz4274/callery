# Webhooks
URL: /stt/async/webhooks

Learn how to setup webhooks for Soniox Speech-to-Text API.

## Overview

Soniox supports webhooks to notify your service when a transcription job is complete or
if an error occurs. This enables fully asynchronous processing — no need to poll the API.

When you provide a webhook URL in your transcription request, Soniox will send a POST request
to that URL once the transcription finishes or fails.

***

## How it works

1. You start an asynchronous transcription job with a webhook URL.
2. Soniox processes the audio in the background.
3. When the job completes (or if an error occurs), Soniox sends a POST request to your webhook endpoint with the result.

***

## Set up a webhook for a transcription

To use a webhook, simply pass the `webhook_url` parameter when creating a transcription job.
The URL must be publicly accessible from Soniox servers.

```json
{
  "webhook_url": "https://example.com/webhook"
}
```

<Callout>
  During development, you can test webhooks on your local machine using tools like [Cloudflare
  tunnel](https://developers.cloudflare.com/pages/how-to/preview-with-cloudflare-tunnel/),
  [ngrok](https://ngrok.com/) or [VS Code port
  forwarding](https://code.visualstudio.com/docs/editor/port-forwarding).
</Callout>

***

## Handle webhook requests

When a transcription is complete (or if an error occurs), Soniox sends a POST
request to your webhook URL with the following parameters:

<ApiParams>
  <ApiParam name="id" type="string">
    The transcription ID that was assigned when the job was created.
  </ApiParam>

  <ApiParam name="status" type="string" noBorder>
    Status of the transcription. Possible values: <code>completed</code> or <code>error</code>.
  </ApiParam>
</ApiParams>

### Example

```json
{
  "id": "548d023b-2b3d-4dc2-a3ef-cca26d05fd9a",
  "status": "completed"
}
```

***

## Add authentication to webhooks

You can secure your webhook endpoint by requiring an authentication header. Soniox allows you to include
a custom HTTP header in every webhook request by setting the following parameters when creating a transcription:

<ApiParams>
  <ApiParam name="webhook_auth_header_name" type="string">
    The name of the HTTP header to include in the webhook request. For example, use <code>Authorization</code> for standard auth headers.
  </ApiParam>

  <ApiParam name="webhook_auth_header_value" type="string" noBorder>
    The value of the header to include. This could be an API key, bearer token, or any secret that your server expects.
  </ApiParam>
</ApiParams>

When Soniox sends the webhook request, it will include the specified header,
allowing your server to verify that the request came from Soniox.

### Example

```json
{
  "webhook_url": "https://example.com/webhook",
  "webhook_auth_header_name": "Authorization",
  "webhook_auth_header_value": "Bearer <my-secret-token>"
}
```

***

## Add metadata to webhook deliveries

You can attach custom metadata (e.g. customer ID, request ID) to the webhook by
encoding it in the URL as query parameters:

```text
https://example.com/webhook?customer_id=1234&order_id=5678
```

These parameters will be included in the webhook request URL, helping you
associate the callback with the original request.

***

## Failed webhook delivery and retries

Webhook delivery may fail if your server is unavailable or does not respond in time.

If delivery fails, Soniox will automatically retry multiple times over a short period.
If all attempts fail, the delivery is considered permanently failed.

You can still retrieve the transcription result manually using the transcription
ID returned when the job was created.

<Callout>
  We recommend logging transcription IDs on your side in case webhook delivery fails
  and you need to fetch results manually.
</Callout>

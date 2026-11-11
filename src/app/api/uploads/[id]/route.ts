import { NextRequest } from 'next/server';
import { browserUploadApi } from '@/lib/integrations/browser-api';
type Context = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: Context) { return browserUploadApi(request, [(await context.params).id]); }
export async function DELETE(request: NextRequest, context: Context) { return browserUploadApi(request, [(await context.params).id]); }

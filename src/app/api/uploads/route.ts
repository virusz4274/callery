import { NextRequest } from 'next/server';
import { browserUploadApi } from '@/lib/integrations/browser-api';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) { return browserUploadApi(request, []); }

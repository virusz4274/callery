
import 'dotenv/config';
import { getSignedR2Url } from '../src/lib/r2';

async function testUrl() {
    try {
        console.log('Testing getSignedR2Url...');
        const url = await getSignedR2Url('test-key.mp3');
        console.log('Generated URL:', url);

        if (url.startsWith('https:/') && !url.startsWith('https://')) {
            console.log('❌ DETECTED MALFORMED URL (Single slash)');
        } else if (url.startsWith('https://')) {
            console.log('✅ URL format looks correct (Double slash)');
        } else {
            console.log('⚠️ URL format unrecognized');
        }

    } catch (error) {
        console.error('Error generating URL:', error);
    }
}

testUrl();

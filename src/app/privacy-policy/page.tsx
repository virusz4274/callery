
import { LegalDocumentPage } from '@/components/pages/legal-document-page';

const sections = [
  {
    title: '1. Introduction',
    content: [
      'vosift ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.',
      'By using the Service, you agree to the collection and use of information in accordance with this policy.',
    ],
  },
  {
    title: '2. Information We Collect',
    content: [
      'We may collect personal information that you provide to us directly, such as your name, email address, and payment information when you create an account or subscribe to our Service.',
      'We also collect information automatically when you use the Service, such as your IP address, browser type, and usage data. The call recordings and any associated data you upload are also stored and processed by our Service.',
    ],
  },
  {
    title: '3. How We Use Your Information',
    content: [
      'We use the information we collect to provide, maintain, and improve our Service, including to process transactions, manage user accounts, and provide customer support.',
      'We may also use your information to communicate with you about product updates, promotions, and other information related to our Service.',
      'Your call recordings are used solely to provide the Service to you, including storage, transcription, and search functionalities. We do not listen to or access your recordings unless required for support purposes, with your explicit consent.',
    ],
  },
  {
    title: '4. Data Security',
    content: [
      'We implement a variety of security measures to maintain the safety of your personal information and your uploaded content. However, no method of transmission over the Internet or method of electronic storage is 100% secure.',
    ],
  },
  {
    title: '5. Changes to This Policy',
    content: [
      'We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      title="Privacy Policy"
      sections={sections}
      lastUpdated="October 26, 2023"
    />
  );
}

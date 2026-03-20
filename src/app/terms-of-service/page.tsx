
import { LegalDocumentPage } from '@/components/pages/legal-document-page';

const sections = [
  {
    title: '1. Introduction',
    content: [
      'Welcome to vosift ("we", "our", "us"). These Terms of Service ("Terms") govern your use of our website and services (collectively, the "Service"). By accessing or using our Service, you agree to be bound by these Terms.',
      'Please read these Terms carefully before using the Service. If you do not agree to these Terms, you may not use the Service.',
    ],
  },
  {
    title: '2. Your Account',
    content: [
      'To use certain features of the Service, you must create an account. You are responsible for maintaining the confidentiality of your account password and for all activities that occur under your account.',
      'You agree to provide accurate and complete information when creating your account and to keep this information up to date. You must notify us immediately of any unauthorized use of your account.',
    ],
  },
  {
    title: '3. Use of the Service',
    content: [
      'You agree to use the Service only for lawful purposes and in accordance with these Terms. You are responsible for any content you upload, post, or otherwise transmit through the Service.',
      'You agree not to use the Service to upload or store any content that is illegal, infringes on the rights of others, or is otherwise objectionable.',
    ],
  },
  {
    title: '4. Fees and Payment',
    content: [
      'Certain features of the Service may be provided for a fee. You agree to pay all applicable fees as described on our pricing page.',
      'We reserve the right to change our prices at any time. Any price changes will be communicated to you in advance.',
    ],
  },
  {
    title: '5. Limitation of Liability',
    content: [
      'To the fullest extent permitted by law, in no event will vosift, its affiliates, officers, employees, agents, suppliers or licensors be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.',
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      title="Terms of Service"
      sections={sections}
      lastUpdated="October 26, 2023"
    />
  );
}

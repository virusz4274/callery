import { people } from '@googleapis/people';
import type { OAuth2Client } from 'google-auth-library';

export async function getGoogleContacts(auth: OAuth2Client) {
  const peopleService = people({ version: 'v1', auth });

  const { data } = await peopleService.people.connections.list({
    resourceName: 'people/me',
    personFields: 'names,emailAddresses,phoneNumbers',
    pageSize: 500, // Adjust as needed
  });

  const connections = data.connections || [];
  if (connections.length === 0) {
    return [];
  }

  const contacts = connections
    .map((person) => {
      const name = person.names?.[0]?.displayName;
      const phoneNumber = person.phoneNumbers?.[0]?.value;

      if (name && phoneNumber) {
        return {
          name,
          phoneNumber,
          email: person.emailAddresses?.[0]?.value || null,
        };
      }
      return null;
    })
    .filter(Boolean); // Filter out null entries

  return contacts as { name: string; phoneNumber: string; email: string | null }[];
}

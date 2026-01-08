import { people, people_v1 } from '@googleapis/people';
import type { OAuth2Client } from 'google-auth-library';

export async function getGoogleContacts(auth: OAuth2Client) {
  // @ts-expect-error - Version mismatch in google-auth-library types
  const peopleService = people({ version: 'v1', auth });

  let connections: people_v1.Schema$Person[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const response = await peopleService.people.connections.list({
      resourceName: 'people/me',
      personFields: 'names,emailAddresses,phoneNumbers,organizations',
      pageSize: 1000,
      pageToken: nextPageToken,
    }) as { data: people_v1.Schema$ListConnectionsResponse };
    const data = response.data;

    if (data.connections) {
      connections = connections.concat(data.connections);
    }
    nextPageToken = data.nextPageToken || undefined;
  } while (nextPageToken);

  if (connections.length === 0) {
    return [];
  }

  const contacts = connections
    .map((person) => {
      const name = person.names?.[0]?.displayName;
      const phoneNumbers = person.phoneNumbers?.map(p => p.value).filter(Boolean) as string[];

      if (name && phoneNumbers && phoneNumbers.length > 0) {
        const organization = person.organizations?.[0];

        return {
          googleContactId: person.resourceName,
          name,
          phoneNumbers,
          email: person.emailAddresses?.[0]?.value || null,
          jobTitle: organization?.title || undefined,
          company: organization?.name || undefined,
        };
      }
      return null;
    })
    .filter(Boolean); // Filter out null entries

  return contacts as {
    googleContactId?: string;
    name: string;
    phoneNumbers: string[];
    email: string | null;
    jobTitle?: string;
    company?: string;
  }[];
}

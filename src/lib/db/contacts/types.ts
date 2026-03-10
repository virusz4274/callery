export type UpsertContactInput = {
    googleContactId?: string;
    name: string;
    phoneNumbers: string[];
    email: string | null;
    jobTitle?: string;
    company?: string;
};

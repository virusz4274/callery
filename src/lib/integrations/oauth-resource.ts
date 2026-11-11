import { getConfiguredPublicAppOrigin } from '@/lib/public-url';

export type IntegrationResource = 'api' | 'mcp';
export function integrationResource(resource: IntegrationResource) { return `${getConfiguredPublicAppOrigin()}${resource === 'mcp' ? '/mcp/v1' : '/api/v1'}`; }
export function integrationOAuthChallenge(resource: IntegrationResource) {
    return `Bearer resource_metadata="${getConfiguredPublicAppOrigin()}/.well-known/oauth-protected-resource${resource === 'mcp' ? '/mcp/v1' : '/api/v1'}"`;
}

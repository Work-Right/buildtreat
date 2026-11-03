// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { OAuthSession } from '@atcute/oauth-node-client';
import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import type { CfProperties, D1Database, ExecutionContext, KVNamespace, R2Bucket } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Locals {
			session: OAuthSession | null;
			client: Client | null;
			did: Did | null;
		}
		interface Platform {
			env: {
				ORIGIN?: string;
				DEADLINE?: string;
				REG_DEADLINE?: string;
				ORGANIZER_DIDS?: string;
				EMAIL_FROM?: string;
				COMAIL_DID?: string;
				COMAIL_API_KEY?: string;
				BSKY_DM_HANDLE?: string;
				BSKY_DM_APP_PASSWORD?: string;
				BSKY_DM_PDS?: string;
				OAUTH_SESSIONS: KVNamespace;
				OAUTH_STATES: KVNamespace;
				PROFILE_CACHE: KVNamespace;
				DB: D1Database;
				/** Retreat-site photos (private bucket; served via /media/site/[id]). Optional until provisioned. */
				SITE_MEDIA?: R2Bucket;
			};
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};

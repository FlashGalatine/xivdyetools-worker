/**
 * Test utilities and mocks for the presets API tests
 */

import { expect } from 'vitest';
import type { Env, PresetRow, CategoryRow, VoteRow, CommunityPreset, PresetSubmission, AuthContext } from '../src/types';

// ============================================
// MOCK ENVIRONMENT
// ============================================

/**
 * Create mock environment with all bindings
 */
// Default signing secret for tests that need signature validation
export const TEST_SIGNING_SECRET = 'test-signing-secret';

export function createMockEnv(overrides: Partial<Env> = {}): Env {
    return {
        DB: createMockD1Database(),
        ENVIRONMENT: 'development',
        API_VERSION: 'v1',
        CORS_ORIGIN: 'http://localhost:3000',
        BOT_API_SECRET: 'test-bot-secret',
        // Note: BOT_SIGNING_SECRET is NOT set by default
        // This allows bot auth to work without signatures for most tests
        // Tests that specifically test signature validation should override this
        BOT_SIGNING_SECRET: undefined,
        MODERATOR_IDS: '123456789,987654321',
        JWT_SECRET: 'test-jwt-secret',
        PERSPECTIVE_API_KEY: undefined,
        MODERATION_WEBHOOK_URL: undefined,
        OWNER_DISCORD_ID: undefined,
        DISCORD_BOT_TOKEN: undefined,
        DISCORD_WORKER: undefined,
        DISCORD_BOT_WEBHOOK_URL: undefined,
        INTERNAL_WEBHOOK_SECRET: undefined,
        ...overrides,
    };
}

/**
 * Create mock authenticated context
 */
export function createAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
    return {
        isAuthenticated: true,
        isModerator: false,
        userDiscordId: '123456789',
        userName: 'TestUser',
        authSource: 'bot',
        ...overrides,
    };
}

/**
 * Create mock moderator context
 */
export function createModeratorContext(overrides: Partial<AuthContext> = {}): AuthContext {
    return {
        isAuthenticated: true,
        isModerator: true,
        userDiscordId: '123456789',
        userName: 'ModeratorUser',
        authSource: 'bot',
        ...overrides,
    };
}

/**
 * Create unauthenticated context
 */
export function createUnauthenticatedContext(): AuthContext {
    return {
        isAuthenticated: false,
        isModerator: false,
        authSource: 'none',
    };
}

// ============================================
// MOCK DATA FACTORIES
// ============================================

let presetIdCounter = 0;
let categoryIdCounter = 0;

/**
 * Create a mock preset submission
 */
export function createMockSubmission(overrides: Partial<PresetSubmission> = {}): PresetSubmission {
    return {
        name: 'Test Preset',
        description: 'A test preset description that is long enough.',
        category_id: 'aesthetics',
        dyes: [1, 2, 3],
        tags: ['test', 'mock'],
        ...overrides,
    };
}

/**
 * Create a mock preset row (as returned from DB)
 */
export function createMockPresetRow(overrides: Partial<PresetRow> = {}): PresetRow {
    presetIdCounter++;
    const now = new Date().toISOString();
    return {
        id: `preset-${presetIdCounter}`,
        name: 'Test Preset',
        description: 'A test preset description',
        category_id: 'aesthetics',
        dyes: JSON.stringify([1, 2, 3]),
        tags: JSON.stringify(['test', 'mock']),
        author_discord_id: '123456789',
        author_name: 'TestUser',
        vote_count: 0,
        status: 'approved',
        is_curated: 0,
        created_at: now,
        updated_at: now,
        dye_signature: JSON.stringify([1, 2, 3]),
        previous_values: null,
        ...overrides,
    };
}

/**
 * Create a mock category row
 */
export function createMockCategoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
    categoryIdCounter++;
    return {
        id: `category-${categoryIdCounter}`,
        name: 'Test Category',
        description: 'A test category description',
        icon: null,
        is_curated: 0,
        display_order: categoryIdCounter,
        ...overrides,
    };
}

/**
 * Create a mock vote row
 */
export function createMockVoteRow(overrides: Partial<VoteRow> = {}): VoteRow {
    return {
        preset_id: 'preset-1',
        user_discord_id: '123456789',
        created_at: new Date().toISOString(),
        ...overrides,
    };
}

/**
 * Create a mock CommunityPreset (domain object)
 */
export function createMockPreset(overrides: Partial<CommunityPreset> = {}): CommunityPreset {
    presetIdCounter++;
    const now = new Date().toISOString();
    return {
        id: `preset-${presetIdCounter}`,
        name: 'Test Preset',
        description: 'A test preset description',
        category_id: 'aesthetics',
        dyes: [1, 2, 3],
        tags: ['test', 'mock'],
        author_discord_id: '123456789',
        author_name: 'TestUser',
        vote_count: 0,
        status: 'approved',
        is_curated: false,
        created_at: now,
        updated_at: now,
        ...overrides,
    };
}

// ============================================
// MOCK D1 DATABASE
// ============================================

interface MockD1PreparedStatement {
    bind: (...values: unknown[]) => MockD1PreparedStatement;
    first: <T = unknown>() => Promise<T | null>;
    all: <T = unknown>() => Promise<{ results: T[]; success: boolean }>;
    run: () => Promise<{ success: boolean; meta: { changes: number } }>;
}

interface MockD1Database {
    prepare: (query: string) => MockD1PreparedStatement;
    batch: (statements: MockD1PreparedStatement[]) => Promise<unknown[]>;
    _queries: string[];
    _bindings: unknown[][];
    _setupMock: (fn: (query: string, bindings: unknown[]) => unknown) => void;
    _mockFn?: (query: string, bindings: unknown[]) => unknown;
}

/**
 * Create a mock D1 database for testing
 */
export function createMockD1Database(): D1Database & MockD1Database {
    const queries: string[] = [];
    const bindings: unknown[][] = [];
    let mockFn: ((query: string, bindings: unknown[]) => unknown) | undefined;

    const createStatement = (query: string): MockD1PreparedStatement => {
        let boundValues: unknown[] = [];

        const statement: MockD1PreparedStatement = {
            bind: (...values: unknown[]) => {
                boundValues = values;
                bindings.push(values);
                return statement;
            },
            first: async <T = unknown>() => {
                queries.push(query);
                if (mockFn) {
                    return mockFn(query, boundValues) as T | null;
                }
                return null;
            },
            all: async <T = unknown>() => {
                queries.push(query);
                if (mockFn) {
                    const result = mockFn(query, boundValues);
                    if (Array.isArray(result)) {
                        return { results: result as T[], success: true };
                    }
                }
                return { results: [] as T[], success: true };
            },
            run: async () => {
                queries.push(query);
                if (mockFn) {
                    const result = mockFn(query, boundValues);
                    if (result && typeof result === 'object' && 'meta' in result) {
                        return result as { success: boolean; meta: { changes: number } };
                    }
                }
                return { success: true, meta: { changes: 1 } };
            },
        };

        return statement;
    };

    return {
        prepare: createStatement,
        batch: async (statements: MockD1PreparedStatement[]) => {
            return Promise.all(statements.map((s) => s.run()));
        },
        _queries: queries,
        _bindings: bindings,
        _setupMock: (fn: (query: string, bindings: unknown[]) => unknown) => {
            mockFn = fn;
        },
        _mockFn: mockFn,
    } as unknown as D1Database & MockD1Database;
}

// ============================================
// JWT HELPERS
// ============================================

/**
 * Create a valid JWT for testing
 */
export async function createTestJWT(
    secret: string,
    payload: {
        sub: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
    },
    expiresInSeconds = 3600
): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);

    const fullPayload = {
        ...payload,
        iat: now,
        exp: now + expiresInSeconds,
        iss: 'xivdyetools-oauth-worker',
    };

    const encoder = new TextEncoder();

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureInput));

    const encodedSignature = base64UrlEncode(
        String.fromCharCode(...new Uint8Array(signature))
    );

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Create an expired JWT for testing
 */
export async function createExpiredJWT(secret: string): Promise<string> {
    return createTestJWT(secret, { sub: '123', username: 'test' }, -3600);
}

function base64UrlEncode(str: string): string {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ============================================
// REQUEST HELPERS
// ============================================

/**
 * Create a mock request for testing handlers
 */
export function createMockRequest(
    method: string,
    url: string,
    options: {
        headers?: Record<string, string>;
        body?: unknown;
    } = {}
): Request {
    const init: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    };

    if (options.body && method !== 'GET') {
        init.body = JSON.stringify(options.body);
    }

    return new Request(url, init);
}

/**
 * Create HMAC signature for bot authentication
 */
export async function createBotSignature(
    timestamp: string,
    userDiscordId: string,
    userName: string,
    secret: string = TEST_SIGNING_SECRET
): Promise<string> {
    const message = `${timestamp}:${userDiscordId}:${userName}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Create authenticated request headers with signature
 */
export async function authHeadersWithSignature(
    token: string,
    userId?: string,
    userName?: string
): Promise<Record<string, string>> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const userIdStr = userId || '';
    const userNameStr = userName || '';

    const signature = await createBotSignature(timestamp, userIdStr, userNameStr);

    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'X-Request-Signature': signature,
        'X-Request-Timestamp': timestamp,
    };
    if (userId) {
        headers['X-User-Discord-ID'] = userId;
    }
    if (userName) {
        headers['X-User-Discord-Name'] = userName;
    }
    return headers;
}

/**
 * Create authenticated request headers (without signature - for JWT auth tests)
 */
export function authHeaders(token: string, userId?: string, userName?: string): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
    };
    if (userId) {
        headers['X-User-Discord-ID'] = userId;
    }
    if (userName) {
        headers['X-User-Discord-Name'] = userName;
    }
    return headers;
}

// ============================================
// ASSERTION HELPERS
// ============================================

/**
 * Assert response has expected status and body shape
 */
export async function assertJsonResponse<T>(
    response: Response,
    expectedStatus: number
): Promise<T> {
    expect(response.status).toBe(expectedStatus);
    const body = await response.json();
    return body as T;
}

// Reset counters between tests
export function resetCounters(): void {
    presetIdCounter = 0;
    categoryIdCounter = 0;
}

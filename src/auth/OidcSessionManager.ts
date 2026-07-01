import {
  AuthorizationRequest,
  OidcTokens,
  SURFCONEXT_SCOPES,
  SurfConextOidcClient,
} from './OidcClient.js';
import { LoopbackCallbackServer } from './LoopbackCallbackServer.js';
import { logger } from '../logger.js';

const SECRET_KEY = 'workflow.surfconext.tokens';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;

export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export interface AccountDetails {
  id: string;
  label: string;
}

export interface StoredCredentials {
  accessToken: string;
  refreshToken?: string;
  idToken: string;
  expiresAt: number;
  account: AccountDetails;
}

export interface WorkflowAuthenticationSession {
  id: string;
  accessToken: string;
  account: AccountDetails;
  scopes: string[];
}

export type CredentialsChanged = (
  previous: StoredCredentials | undefined,
  current: StoredCredentials | undefined,
) => void;

export class AuthenticationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

interface PendingCallback {
  request: AuthorizationRequest;
  resolve(callbackUrl: URL): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class OidcSessionManager {
  private credentials: StoredCredentials | undefined;
  private credentialsLoaded = false;
  private loginPromise: Promise<WorkflowAuthenticationSession> | undefined;
  private pendingCallback: PendingCallback | undefined;
  private loginGeneration = 0;
  private readonly oidcClient = new SurfConextOidcClient();
  private readonly callbackServer = new LoopbackCallbackServer();

  public constructor(
    private readonly secrets: SecretStore,
    private readonly openExternal: (url: URL) => Promise<boolean>,
    private readonly credentialsChanged: CredentialsChanged = () => undefined,
  ) {}

  public async getSession(interactive: boolean): Promise<WorkflowAuthenticationSession | undefined> {
    const stored = await this.loadCredentials();
    if (stored && stored.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
      logger.info('Reusing the stored SURFconext access token.');
      return this.toSession(stored);
    }

    if (stored?.refreshToken) {
      logger.info('Stored access token is near expiry; attempting refresh.');
      const generation = this.loginGeneration;
      try {
        return this.toSession(await this.refresh(stored, generation));
      } catch {
        logger.warn('Stored SURFconext session could not be refreshed; removing it.');
        await this.replaceCredentials(undefined);
      }
    } else if (stored) {
      logger.info('Stored access token expired without a refresh token; removing it.');
      await this.replaceCredentials(undefined);
    }

    if (!interactive) {
      logger.info('No active SURFconext session is available.');
      return undefined;
    }

    return this.login();
  }

  private handleCallback(callbackUrl: URL): void {
    const pending = this.pendingCallback;
    if (!pending) {
      logger.warn('Received a callback without an active sign-in request.');
      return;
    }

    if (callbackUrl.searchParams.get('state') !== pending.request.state) {
      logger.warn('Rejected a SURFconext callback with mismatched state.');
      pending.reject(new AuthenticationError('SURFconext sign-in returned an invalid state. Please try again.'));
      return;
    }

    pending.resolve(callbackUrl);
    logger.info('Accepted the SURFconext callback state.');
  }

  public async invalidateAccessToken(): Promise<void> {
    const stored = await this.loadCredentials();
    if (stored) {
      logger.info('Invalidating the stored access token after an unauthorized API response.');
      await this.replaceCredentials({ ...stored, expiresAt: 0 });
    }
  }

  public async signOut(): Promise<void> {
    logger.info('Signing out locally and removing stored SURFconext credentials.');
    this.cancelLogin('SURFconext sign-in was cancelled.');
    await this.replaceCredentials(undefined);
  }

  public cancelLogin(message = 'SURFconext sign-in was cancelled.'): void {
    this.loginGeneration++;
    this.pendingCallback?.reject(new AuthenticationError(message));
  }

  private login(): Promise<WorkflowAuthenticationSession> {
    if (this.loginPromise) {
      logger.info('Joining the SURFconext sign-in already in progress.');
      return this.loginPromise;
    }

    const login = this.performLogin();
    this.loginPromise = login;
    void login.finally(() => {
      if (this.loginPromise === login) {
        this.loginPromise = undefined;
      }
    }).catch(() => undefined);
    return login;
  }

  private async performLogin(): Promise<WorkflowAuthenticationSession> {
    logger.info('Starting interactive SURFconext sign-in.');
    const generation = this.loginGeneration;
    let request: AuthorizationRequest;
    try {
      request = await this.oidcClient.createAuthorizationRequest();
    } catch {
      logger.error('Could not prepare SURFconext sign-in.');
      throw new AuthenticationError('Could not connect to SURFconext. Check your network connection and try again.');
    }
    this.ensureLoginActive(generation);

    const callback = this.waitForCallback(request);
    let callbackServerHandle: { dispose(): void } | undefined;
    try {
      callbackServerHandle = await this.callbackServer.start(callbackUrl => this.handleCallback(callbackUrl));
    } catch {
      logger.error('Loopback callback listener failed to start.');
      this.cancelLogin('Could not listen for the SURFconext callback on localhost port 3000. Close any application using that port and try again.');
    }
    if (callbackServerHandle) {
      try {
        const opened = await this.openExternal(request.url);
        if (!opened) {
          logger.warn('The system declined to open the SURFconext authorization page.');
          this.cancelLogin('SURFconext sign-in was cancelled before the browser opened.');
        } else {
          logger.info('Opened the SURFconext authorization page in the system browser.');
        }
      } catch {
        logger.error('Could not open the SURFconext authorization page.');
        this.cancelLogin('Could not open the browser for SURFconext sign-in.');
      }
    }

    let callbackUrl: URL;
    try {
      callbackUrl = await callback;
    } finally {
      callbackServerHandle?.dispose();
    }
    let tokens: OidcTokens;
    try {
      tokens = await this.oidcClient.exchangeAuthorizationCode(callbackUrl, request);
    } catch {
      logger.error('SURFconext authorization code exchange failed.');
      throw new AuthenticationError('SURFconext could not complete sign-in. Please try again.');
    }
    this.ensureLoginActive(generation);

    const credentials = this.createCredentials(tokens);
    const committed = await this.commitCredentials(credentials, generation);
    logger.info('Interactive SURFconext sign-in completed and credentials were stored.');
    return this.toSession(committed);
  }

  private async commitCredentials(credentials: StoredCredentials, generation: number): Promise<StoredCredentials> {
    await this.replaceCredentials(credentials);
    if (generation !== this.loginGeneration) {
      await this.replaceCredentials(undefined);
      this.ensureLoginActive(generation);
    }
    return credentials;
  }

  private ensureLoginActive(generation: number): void {
    if (generation !== this.loginGeneration) {
      throw new AuthenticationError('SURFconext sign-in was cancelled.');
    }
  }

  private waitForCallback(request: AuthorizationRequest): Promise<URL> {
    return new Promise((resolve, reject) => {
      const finish = (action: () => void): void => {
        if (this.pendingCallback?.request === request) {
          clearTimeout(this.pendingCallback.timer);
          this.pendingCallback = undefined;
        }
        action();
      };
      const timer = setTimeout(
        () => finish(() => {
          logger.warn('SURFconext sign-in timed out while waiting for the callback.');
          reject(new AuthenticationError('SURFconext sign-in timed out after five minutes.'));
        }),
        DEFAULT_TIMEOUT_MS,
      );
      this.pendingCallback = {
        request,
        timer,
        resolve: callbackUrl => finish(() => resolve(callbackUrl)),
        reject: error => finish(() => reject(error)),
      };
    });
  }

  private async refresh(stored: StoredCredentials, generation: number): Promise<StoredCredentials> {
    let tokens: OidcTokens;
    try {
      tokens = await this.oidcClient.refresh(stored.refreshToken!);
    } catch {
      logger.error('SURFconext token refresh failed.');
      throw new AuthenticationError('The saved SURFconext session could not be refreshed.');
    }
    this.ensureLoginActive(generation);

    if (!tokens.accessToken) {
      throw new AuthenticationError('SURFconext returned an invalid refreshed session.');
    }

    const refreshed: StoredCredentials = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? stored.refreshToken,
      idToken: tokens.idToken ?? stored.idToken,
      expiresAt: this.expiryFrom(tokens),
      account: tokens.subject
        ? {
          id: tokens.subject,
          label: tokens.accountLabel
            ?? (tokens.subject === stored.account.id ? stored.account.label : tokens.subject),
        }
        : stored.account,
    };
    const committed = await this.commitCredentials(refreshed, generation);
    logger.info('Stored SURFconext session refreshed.');
    return committed;
  }

  private createCredentials(tokens: OidcTokens): StoredCredentials {
    if (!tokens.accessToken || !tokens.idToken || !tokens.subject) {
      throw new AuthenticationError('SURFconext returned an incomplete session. Please try again.');
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      idToken: tokens.idToken,
      expiresAt: this.expiryFrom(tokens),
      account: {
        id: tokens.subject,
        label: tokens.accountLabel ?? tokens.subject,
      },
    };
  }

  private expiryFrom(tokens: OidcTokens): number {
    const expiresIn = typeof tokens.expiresIn === 'number' && tokens.expiresIn > 0 ? tokens.expiresIn : 0;
    return Date.now() + expiresIn * 1000;
  }

  private async loadCredentials(): Promise<StoredCredentials | undefined> {
    if (this.credentialsLoaded) {
      return this.credentials;
    }

    this.credentialsLoaded = true;
    const serialized = await this.secrets.get(SECRET_KEY);
    if (!serialized) {
      logger.info('No stored SURFconext credentials were found.');
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(serialized);
      if (isStoredCredentials(parsed)) {
        this.credentials = parsed;
        logger.info('Restored SURFconext credentials from secure storage.');
        return parsed;
      }
    } catch {
      // Invalid local state is removed below.
    }

    await this.secrets.delete(SECRET_KEY);
    logger.warn('Removed invalid SURFconext credentials from secure storage.');
    return undefined;
  }

  private async replaceCredentials(next: StoredCredentials | undefined): Promise<void> {
    const previous = await this.loadCredentials();
    if (next) {
      await this.secrets.store(SECRET_KEY, JSON.stringify(next));
    } else {
      await this.secrets.delete(SECRET_KEY);
    }
    this.credentials = next;
    this.credentialsLoaded = true;
    this.credentialsChanged(previous, next);
  }

  public toSession(credentials: StoredCredentials): WorkflowAuthenticationSession {
    return {
      id: credentials.account.id,
      accessToken: credentials.accessToken,
      account: credentials.account,
      scopes: [...SURFCONEXT_SCOPES],
    };
  }
}

function isStoredCredentials(value: unknown): value is StoredCredentials {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<StoredCredentials>;
  return typeof candidate.accessToken === 'string'
    && typeof candidate.idToken === 'string'
    && typeof candidate.expiresAt === 'number'
    && !!candidate.account
    && typeof candidate.account.id === 'string'
    && typeof candidate.account.label === 'string'
    && (candidate.refreshToken === undefined || typeof candidate.refreshToken === 'string');
}

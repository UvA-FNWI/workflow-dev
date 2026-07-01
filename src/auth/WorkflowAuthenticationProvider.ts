import * as vscode from 'vscode';
import { AccessTokenProvider } from '../workflowApi.js';
import { logger } from '../logger.js';
import {
  OidcSessionManager,
  StoredCredentials,
  WorkflowAuthenticationSession,
} from './OidcSessionManager.js';

export const AUTHENTICATION_PROVIDER_ID = 'workflow.surfconext';
export const AUTHENTICATION_PROVIDER_LABEL = 'SURFconext';

export class WorkflowAuthenticationProvider implements vscode.AuthenticationProvider, AccessTokenProvider {
  private readonly sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private readonly sessionManager: OidcSessionManager;

  public readonly onDidChangeSessions = this.sessionChangeEmitter.event;

  public constructor(secrets: vscode.SecretStorage) {
    this.sessionManager = new OidcSessionManager(
      secrets,
      url => Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url.toString()))),
      (previous, current) => this.emitCredentialsChanged(previous, current),
    );
  }

  public async getSessions(_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
    logger.info('VS Code requested available SURFconext sessions.');
    const session = await this.sessionManager.getSession(false);
    return session ? [this.toVscodeSession(session)] : [];
  }

  public async createSession(_scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
    logger.info('VS Code requested a new SURFconext session.');
    const session = await this.sessionManager.getSession(true);
    if (!session) {
      throw new Error('SURFconext sign-in did not return a session.');
    }
    return this.toVscodeSession(session);
  }

  public async removeSession(_sessionId: string): Promise<void> {
    logger.info('VS Code requested SURFconext sign-out.');
    await this.sessionManager.signOut();
  }

  public async getAccessToken(): Promise<string> {
    logger.info('Workflow debugger requested an access token.');
    const session = await this.sessionManager.getSession(true);
    if (!session) {
      throw new Error('SURFconext sign-in did not return an access token.');
    }
    return session.accessToken;
  }

  public invalidateAccessToken(): Promise<void> {
    return this.sessionManager.invalidateAccessToken();
  }

  public dispose(): void {
    this.sessionManager.cancelLogin('SURFconext sign-in was cancelled because the extension stopped.');
    this.sessionChangeEmitter.dispose();
  }

  private emitCredentialsChanged(
    previous: StoredCredentials | undefined,
    current: StoredCredentials | undefined,
  ): void {
    const previousSession = previous ? this.toVscodeSession(this.sessionManager.toSession(previous)) : undefined;
    const currentSession = current ? this.toVscodeSession(this.sessionManager.toSession(current)) : undefined;
    this.sessionChangeEmitter.fire({
      added: !previousSession && currentSession ? [currentSession] : [],
      removed: previousSession && !currentSession ? [previousSession] : [],
      changed: previousSession && currentSession ? [currentSession] : [],
    });
  }

  private toVscodeSession(session: WorkflowAuthenticationSession): vscode.AuthenticationSession {
    return {
      id: session.id,
      accessToken: session.accessToken,
      account: session.account,
      scopes: session.scopes,
    };
  }
}

import * as oidc from 'openid-client';
import { logger } from '../logger.js';

export interface SurfConextConfiguration {
  authority: URL;
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
}

export interface AuthorizationRequest {
  url: URL;
  state: string;
  codeVerifier: string;
}

export interface OidcTokens {
  accessToken: string;
  idToken?: string;
  expiresIn?: number;
  subject?: string;
  accountLabel?: string;
}

type Configuration = oidc.Configuration;

export class SurfConextOidcClient {
  private configurationPromise: Promise<Configuration> | undefined;

  public constructor(private readonly settings: SurfConextConfiguration) {}

  public async createAuthorizationRequest(): Promise<AuthorizationRequest> {
    logger.info('Preparing SURFconext authorization request.');
    const configuration = await this.getConfiguration();
    const state = oidc.randomState();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const url = oidc.buildAuthorizationUrl(configuration, {
      client_id: this.settings.clientId,
      redirect_uri: this.settings.redirectUri,
      response_type: 'code',
      scope: this.settings.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    logger.info('SURFconext authorization request prepared with PKCE.');
    return { url, state, codeVerifier };
  }

  public async exchangeAuthorizationCode(callbackUrl: URL, request: AuthorizationRequest): Promise<OidcTokens> {
    logger.info('Exchanging SURFconext authorization code.');
    const configuration = await this.getConfiguration();
    const tokens = await oidc.authorizationCodeGrant(
      configuration,
      callbackUrl,
      {
        pkceCodeVerifier: request.codeVerifier,
        expectedState: request.state,
        idTokenExpected: true,
      },
    );

    logger.info('SURFconext authorization code exchanged successfully.');
    const result = this.toTokens(tokens);
    if (result.subject) {
      try {
        logger.info('Requesting the signed-in account profile from SURFconext UserInfo.');
        const userInfo = await oidc.fetchUserInfo(configuration, result.accessToken, result.subject);
        result.accountLabel = accountLabel(userInfo) ?? result.accountLabel;
        logger.info('SURFconext UserInfo profile retrieved successfully.');
      } catch {
        logger.warn('SURFconext UserInfo request failed; using the ID-token account label.');
      }
    }
    return result;
  }

  private getConfiguration(): Promise<Configuration> {
    if (!this.configurationPromise) {
      logger.info(`Discovering OIDC metadata from ${this.settings.authority.origin}.`);
      this.configurationPromise = oidc.discovery(
        this.settings.authority,
        this.settings.clientId,
        undefined,
        oidc.None(),
      ).catch(error => {
        logger.error('OIDC discovery failed.');
        this.configurationPromise = undefined;
        throw error;
      });
      void this.configurationPromise.then(
        () => logger.info('OIDC discovery completed successfully.'),
        () => undefined,
      );
    }
    return this.configurationPromise;
  }

  private toTokens(tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers): OidcTokens {
    const claims = tokens.claims();

    return {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      expiresIn: tokens.expiresIn(),
      subject: claims?.sub,
      accountLabel: claims ? accountLabel(claims) : undefined,
    };
  }
}

function accountLabel(claims: Record<string, unknown>): string | undefined {
  const fullName = [stringClaim(claims.given_name), stringClaim(claims.family_name)]
    .filter((part): part is string => !!part)
    .join(' ');

  return stringClaim(claims.name)
    ?? (fullName || undefined)
    ?? stringClaim(claims.preferred_username)
    ?? stringClaim(claims.email)
    ?? stringClaim(claims.eduperson_principal_name);
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

import { logger } from './logger.js';

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  invalidateAccessToken(): Promise<void>;
}

export interface WorkflowUploadRequest {
  api: string;
  version: string;
  files: Record<string, string>;
}

export async function uploadWorkflowAuthenticated(
  request: WorkflowUploadRequest,
  tokenProvider: AccessTokenProvider,
  initialAccessToken?: string,
): Promise<Response> {
  let accessToken = initialAccessToken ?? await tokenProvider.getAccessToken();
  logger.info('Uploading workflow files to the Workflow API.');
  let response = await safelyUploadWorkflow(request, accessToken);
  logger.info(`Workflow API responded with HTTP ${response.status}.`);

  if (response.status === 401) {
    logger.warn('Workflow API returned 401; signing in again and retrying once.');
    await tokenProvider.invalidateAccessToken();
    accessToken = await tokenProvider.getAccessToken();
    response = await safelyUploadWorkflow(request, accessToken);
    logger.info(`Workflow API retry responded with HTTP ${response.status}.`);
  }

  return response;
}

export function workflowLaunchOutput(api: string, version: string): string {
  const url = new URL('https://milestones-tst.fnwi.uva.nl/develop');
  url.searchParams.set('version', version);
  url.searchParams.set('api', api);
  logger.info(`Workflow UI URL prepared: ${url.toString()}`);
  return `Running. View the workflow at ${url.toString()}`;
}

async function safelyUploadWorkflow(
  request: WorkflowUploadRequest,
  accessToken: string,
): Promise<Response> {
  try {
    return await uploadWorkflow(request, accessToken);
  } catch {
    logger.error('Workflow API request failed before receiving a response.');
    throw new Error('Could not connect to the Workflow API. Check your network connection and try again.');
  }
}

async function uploadWorkflow(
  request: WorkflowUploadRequest,
  accessToken: string,
): Promise<Response> {
  const api = request.api.replace(/\/+$/, '');
  logger.info(`POST ${api}/Versions/{version}`);
  return fetch(`${api}/Versions/${encodeURIComponent(request.version)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request.files),
  });
}

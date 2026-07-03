import { InitializedEvent, LoggingDebugSession, OutputEvent } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import path from "path";
import * as vscode from 'vscode';
import { AccessTokenProvider, uploadWorkflowAuthenticated, workflowLaunchOutput } from './workflowApi.js';
import { logger } from './logger.js';

interface WorkflowLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  version: string;
  api: string;
}

export class WorkflowDebugSession extends LoggingDebugSession {
  private _configurationDone = false;

  public constructor(private readonly tokenProvider: AccessTokenProvider) {
    super();
  }
  
  protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
    this.sendResponse(response);

    this.sendEvent(new InitializedEvent());
  }

  protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		super.configurationDoneRequest(response, args);

    logger.info('Debug session configuration completed.');
		this._configurationDone = true;
	}

  protected async attachRequest(response: DebugProtocol.AttachResponse, args: WorkflowLaunchRequestArguments) {
		logger.warn('Attach request is not implemented.');
	}

  protected async launchRequest(launchResponse: DebugProtocol.LaunchResponse, args: WorkflowLaunchRequestArguments, request?: DebugProtocol.Request) {
    logger.info(`Starting workflow launch for version "${args.version}" against ${args.api}.`);
    try {
      // Gather the workspace files and authenticate concurrently. The upload below still awaits
      // the token, so a failed or abandoned login never starts an upload.
      const [accessToken, fileMap] = await Promise.all([
        this.tokenProvider.getAccessToken(),
        this.collectWorkflowFiles(),
      ]);

      const response = await uploadWorkflowAuthenticated(
        { api: args.api, version: args.version, files: fileMap },
        this.tokenProvider,
        accessToken,
      );

      if (!response.ok) {
          const details = (await response.text()).trim();
          logger.warn(`Workflow launch stopped because the API returned HTTP ${response.status}.`);
          this.sendErrorResponse(launchResponse, {
            id: response.status,
            format: `Workflow API rejected the upload (${response.status})${details ? `: ${details}` : '.'}`
          });
          return;
      }

      this.sendResponse(launchResponse);
      logger.info('Workflow upload completed successfully.');
      this.sendEvent(new OutputEvent(workflowLaunchOutput(args.api, args.version)));
    } catch (error) {
      logger.error('Workflow launch failed.');
      this.sendErrorResponse(launchResponse, {
        id: 1001,
        format: error instanceof Error ? error.message : 'Could not authenticate or upload the workflow.',
      });
    }
  }

  private async collectWorkflowFiles(): Promise<Record<string, string>> {
    const fileMap: Record<string, string> = {};

    // Find all files in the workspace
    const files = await vscode.workspace.findFiles("**/*.yaml");
    logger.info(`Found ${files.length} YAML file(s) in the workspace.`);

    // Read each file
    for (const fileUri of files) {
      try {
        // Read file content as Uint8Array
        const content = await vscode.workspace.fs.readFile(fileUri);

        // Convert to string (assuming UTF-8 encoding)
        const textContent = Buffer.from(content).toString('utf-8');

        // Get relative path from workspace root
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
        const relativePath = workspaceFolder
          ? path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath)
          : fileUri.fsPath;

        fileMap[relativePath.replaceAll("\\", "/")] = textContent;
      } catch (error) {
        logger.error(`Error reading file ${fileUri.fsPath}:`, error);
        // Continue with other files even if one fails
      }
    }
    logger.info(`Prepared ${Object.keys(fileMap).length} workflow file(s) for upload.`);
    return fileMap;
  }

}

import { InitializedEvent, LoggingDebugSession, OutputEvent } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import path from "path";
import * as vscode from 'vscode';

interface WorkflowLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  version: string;
  api: string;
}

export class WorkflowDebugSession extends LoggingDebugSession {
  private _configurationDone = false;

  public constructor() {
    super();
  }
  
  protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
    this.sendResponse(response);

    this.sendEvent(new InitializedEvent());
  }

  protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		super.configurationDoneRequest(response, args);

    console.log('configuration done');
		this._configurationDone = true;
	}

  protected async attachRequest(response: DebugProtocol.AttachResponse, args: WorkflowLaunchRequestArguments) {
		console.log('attach request not implemented');
	}

  protected async launchRequest(launchResponse: DebugProtocol.LaunchResponse, args: WorkflowLaunchRequestArguments, request?: DebugProtocol.Request) {
    console.log("launching debug session");
    const fileMap: { [filename: string]: string } = {};
        
    // Find all files in the workspace
    const files = await vscode.workspace.findFiles("**/*.yaml");
    
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
        
        fileMap[relativePath] = textContent;
      } catch (error) {
        console.error(`Error reading file ${fileUri.fsPath}:`, error);
        // Continue with other files even if one fails
      }
    }
    
    const response = await fetch(`${args.api}/Versions/${args.version}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(fileMap)
    });

    if (!response.ok) {
        this.sendErrorResponse(launchResponse, {
          id: response.status,
          format: `Error connecting to backend (${response.status}): ${await response.text()}`
        });
    } else {
      this.sendResponse(launchResponse);
      this.sendEvent(new OutputEvent(`Running. View the workflow at https://workflow-dummy-ui.datanose.nl/instances?version=${args.version}&api=${args.api}`));
    }
  }
}
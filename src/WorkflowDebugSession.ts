import { InitializedEvent, LoggingDebugSession } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import path from "path";
import * as vscode from 'vscode';

interface WorkflowLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	/** An absolute path to the workflow. */
	target: string;
}

export class WorkflowDebugSession extends LoggingDebugSession {
  public constructor() {
    super();
    console.log('Create debug session');
  }
  
  protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
    this.sendResponse(response);

    this.sendEvent(new InitializedEvent());
    console.log('Init debug session');
  }

  protected async launchRequest(launchResponse: DebugProtocol.LaunchResponse, args: WorkflowLaunchRequestArguments, request?: DebugProtocol.Request) {
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
    
    const response = await fetch('http://localhost:5025/Versions/bla', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(fileMap)
    });

    if (!response.ok) {
        this.sendErrorResponse(launchResponse, {
          id: response.status,
          format: await response.text()
        });
    } else {
      this.sendResponse(launchResponse);
    }
  }
}
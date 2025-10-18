import { InitializedEvent, LoggingDebugSession } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";

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

  protected launchRequest(response: DebugProtocol.LaunchResponse, args: WorkflowLaunchRequestArguments, request?: DebugProtocol.Request): void {
    console.log('launchRequest', args);
  }
}
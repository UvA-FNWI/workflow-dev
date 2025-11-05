// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DebugConfiguration, ProviderResult, WorkspaceFolder } from 'vscode';
import { WorkflowDebugSession } from './WorkflowDebugSession.js';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log("loading extension");

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('workflow', new InlineDebugAdapterFactory()));

	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('workflow', {
		provideDebugConfigurations(folder: WorkspaceFolder | undefined): ProviderResult<DebugConfiguration[]> {
			return [
				{
					name: "Launch workflow",
					request: "launch",
					type: "workflow"
				}
			];
		}
	}, vscode.DebugConfigurationProviderTriggerKind.Dynamic));
}

// This method is called when your extension is deactivated
export function deactivate() {}


class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new WorkflowDebugSession());
	}
}

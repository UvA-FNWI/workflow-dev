// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DebugConfiguration, ProviderResult, WorkspaceFolder } from 'vscode';
import { WorkflowDebugSession } from './WorkflowDebugSession';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('workflow', new InlineDebugAdapterFactory()));

	context.subscriptions.push(
		vscode.commands.registerCommand('workflow-dev.runEditorContents', (resource: vscode.Uri) => {
			let targetResource = resource;
			if (!targetResource && vscode.window.activeTextEditor) {
				targetResource = vscode.window.activeTextEditor.document.uri;
			}
			if (targetResource) {
				vscode.debug.startDebugging(undefined, {
					type: 'workflow',
					name: 'Run workflow file',
					request: 'launch'
				},
					{ noDebug: true }
				);
			}
		})
	);

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

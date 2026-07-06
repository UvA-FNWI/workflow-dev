// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DebugConfiguration, ProviderResult, WorkspaceFolder } from 'vscode';
import { WorkflowDebugSession } from './WorkflowDebugSession.js';
import { logger } from './logger.js';
import {
	AUTHENTICATION_PROVIDER_ID,
	AUTHENTICATION_PROVIDER_LABEL,
	WorkflowAuthenticationProvider,
} from './auth/WorkflowAuthenticationProvider.js';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	logger.info('Activating extension.');

	const authenticationProvider = new WorkflowAuthenticationProvider(context.secrets);
	context.subscriptions.push(authenticationProvider);
	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
		AUTHENTICATION_PROVIDER_ID,
		AUTHENTICATION_PROVIDER_LABEL,
		authenticationProvider,
		{ supportsMultipleAccounts: false },
	));
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory(
		'workflow',
		new InlineDebugAdapterFactory(authenticationProvider),
	));
	logger.info('Authentication provider and workflow debugger registered.');

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
export function deactivate() {
	logger.info('Deactivating extension.');
}


class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
	public constructor(private readonly authenticationProvider: WorkflowAuthenticationProvider) {}

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new WorkflowDebugSession(this.authenticationProvider));
	}
}

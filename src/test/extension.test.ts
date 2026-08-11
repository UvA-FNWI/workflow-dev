import { equal, ok } from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Workflow Dev', () => {
	test('activates', async () => {
		const extension = vscode.extensions.getExtension('amsuni.workflow-dev');
		ok(extension);
		await extension.activate();
		equal(extension.isActive, true);
	});
});

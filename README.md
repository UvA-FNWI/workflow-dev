# Workflow Dev

VS Code extension for uploading and running workflows from a local workspace.

## Installation

Install **Workflow Dev** from the VS Code Marketplace, or run:

```sh
code --install-extension amsuni.workflow-dev
```

The extension also installs the Red Hat YAML extension used for workflow schemas.

## Run a workflow

1. Open the workflow configuration root in VS Code. This is the folder containing `Common/` and `Layouts/default.html`; workflow definitions can sit anywhere below it.
2. Add a `.vscode/launch.json` with a `workflow` debug configuration. The `api` and `version` fields are required:

   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "workflow",
         "request": "launch",
         "name": "Launch workflow",
         "api": "https://api.milestones-tst.fnwi.uva.nl/",
         "version": "testing-1"
       }
     ]
   }
   ```

3. Open **Run and Debug** and start **Launch workflow**. On the first launch, complete the SURFconext sign-in in your browser. The extension then uploads the workspace YAML files and `Layouts/default.html`, and prints the launched workflow URL in the debug console.

## Authentication

The first workflow launch signs in through SURFconext using the authorization-code flow with PKCE.

- OIDC issuer: `https://connect.test.surfconext.nl/`
- Client ID: `milestones-tst.fnwi.uva.nl`
- Callback: `http://127.0.0.1:53682/callback`
- Scopes: `openid profile`

The extension temporarily listens on port 53682, opens SURFconext in the system browser, validates the callback, and exchanges the authorization code. It then requests UserInfo for the account display name.

Access and ID tokens are stored in VS Code SecretStorage. An access token is reused until it is close to expiry, then the extension starts browser sign-in again. Workflow API requests include the access token as a bearer token.

Port 53682 must be available, and the callback URL must be registered for the client. These values can be overridden under the `workflow.surfconext` extension settings; reload VS Code after changing them.

To sign out, open the **Accounts/Profile** menu in the bottom-left of VS Code, select the account marked **SURFconext**, and choose **Sign Out**. This removes locally stored tokens but does not end the browser's SURFconext SSO session.

## Development

1. Install dependencies and compile:

   ```sh
   npm ci
   npm run compile
   ```

   Use `npm run watch` instead of `compile` if you want TypeScript to rebuild on save.

2. Open this repository in VS Code.
3. Open **Run and Debug** and start the **Extension** launch configuration (or press F5). A second VS Code window opens—the **Extension Development Host**, which has this extension loaded.
4. In that window, follow the **Run a workflow** steps above.

During extension development, logs are written to the parent VS Code window's **Debug Console** with the `[workflow-dev]` prefix.

## Releases

Until `DN-3950` is completed, releases are published manually.

1. Update the version in `package.json` and `package-lock.json`:

   ```sh
   npm version <major.minor.patch> --no-git-tag-version
   ```

2. Install dependencies, test, and package the extension:

   ```sh
   npm ci
   npm test
   npx --no-install vsce package --out workflow-dev.vsix
   ```

3. Upload `workflow-dev.vsix` through the [`amsuni` Marketplace publisher page](https://marketplace.visualstudio.com/manage/publishers/amsuni).

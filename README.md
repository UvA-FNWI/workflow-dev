# Workflow Dev

VS Code extension for uploading and running workflows from a local workspace.

## Development

1. Install dependencies and compile:

   ```sh
   npm ci
   npm run compile
   ```

   Use `npm run watch` instead of `compile` if you want TypeScript to rebuild on save.

2. Open this repository in VS Code.
3. Open **Run and Debug** and start the **Extension** launch configuration (or press F5). A second VS Code window opens—the **Extension Development Host**, which has this extension loaded.
4. In that window, open a workflow project folder. The repo includes `test-workspace/` as a minimal example.
5. Add a `.vscode/launch.json` in that folder with a `workflow` debug configuration. Two fields are required:
   - `api` — base URL of the Workflow API (e.g. `https://milestones-tst.fnwi.uva.nl/`)
   - `version` — version name used when uploading and running the workflow (e.g. `testing-1`)

   Then start it from **Run and Debug**. Example configuration:

   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "workflow",
         "request": "launch",
         "name": "Launch workflow",
         "api": "https://milestones-tst.fnwi.uva.nl/",
         "version": "testing-1"
       }
     ]
   }
   ```

## Authentication

The first workflow launch signs in through SURFconext using the authorization-code flow with PKCE.

- OIDC issuer: `https://connect.test.surfconext.nl/`
- Client ID: `datanose.local`
- Callback: `http://localhost:3000/callback`
- Scopes: `openid profile`

The extension temporarily listens on port 3000, opens SURFconext in the system browser, validates the callback, and exchanges the authorization code. It then requests UserInfo for the account display name.

Access, refresh, and ID tokens are stored in VS Code SecretStorage. An access token is reused until it is close to expiry. If possible, the extension refreshes it; otherwise it starts browser sign-in again. Workflow API requests include the access token as a bearer token.

Port 3000 must be available, and the callback URL must be registered for the client.

## Sign out

Open the **Accounts/Profile** menu in the bottom-left of VS Code, select the account marked **SURFconext**, and choose **Sign Out**.

This removes the locally stored tokens. It does not end the browser's SURFconext SSO session.

During extension development, logs are written to the parent VS Code window's **Debug Console** with the `[workflow-dev]` prefix.

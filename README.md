# DSH Enterprise Auth

This plugin provides the DSH Desktop enterprise account control. The user enters an account and password; the configured external identity service authenticates them and returns its original JWT. The DSH management backend validates that JWT, resolves its signed account and work ID against LDAP, and applies the existing model authorization assigned to the resulting AD `objectGUID`. Desktop authentication does not require the account to be synchronized into the management-admin user list.

The account control is registered in the official `sidebar.footer.action` slot, immediately above Settings. It offers Login, display name, and Logout. Configure the management backend with `DSH_MANAGEMENT_API` (default `http://10.56.0.242:8080`) and the identity provider with `DSH_IDENTITY_API` (default `http://10.56.0.190:7263`). The plugin calls:

- `POST {DSH_IDENTITY_API}/api/Login/` for identity authentication
- `GET /api/desktop/models` for the user's authorized model names
- `POST /api/desktop/models/{model_id}/chat` for server-side model invocation
- `GET /dsh-enterprise-auth/token` for trusted plugins that need the current desktop identity token

The store uses Electron `safeStorage` when that API is available. In the current isolated plugin process it falls back to memory, so restarting DSH requires a new login until the desktop host exposes a secure-storage bridge. API keys and provider URLs are never returned to the desktop plugin. Trusted plugins can obtain the current identity token through the bridge documented in `docs/identity-bridge.md` and connect to their own backends independently.

`npm run migrate-model` creates a timestamped backup and removes the local `intbio` provider only after the token-backed LLM adapter is ready. User-added providers remain unchanged.

Run `npm test` in this repository. Install locally with the bundled DSH CLI using `dsh plugin --profile web add <absolute path to this directory>` and restart Harness. No Git push is required for local testing.

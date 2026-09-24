# DSH Desktop Identity Bridge

Trusted plugins can request the current desktop identity token through the host route:

```text
GET /dsh-enterprise-auth/token
```

The response is:

```json
{
  "access_token": "<external-identity-jwt>",
  "token_type": "Bearer"
}
```

The token is the original JWT returned by the configured external identity provider; the authentication plugin does not exchange or re-sign it. A plugin must not persist the token itself or request any encryption/signing secret. The current issuer uses HS256, so its signing secret must remain only with the issuer and trusted server-side validators. A plugin should forward the token to its own backend over HTTPS; that backend can call DSH management `GET /api/desktop/auth/me` with the token as its Bearer credential to validate it and read the LDAP-resolved identity.

Consumers should use the `subject` returned by `/api/desktop/auth/me` as the stable AD `objectGUID`; the external JWT itself identifies the user through its signed account and work-ID claims. A future RS256/JWKS issuer can enable independent signature validation without sharing any private key.

Employee number, account, department, and display name are identity lookup hints. Every consuming platform must apply its own permissions and must not treat the identity token as an authorization grant for unrelated resources.

The bridge returns `401 not_authenticated` when the desktop user is signed out or the desktop token has expired.

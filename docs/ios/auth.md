> The full documentation index: https://palbase.studio/llms.txt

# Auth

`pb.auth` signs a person in and keeps them signed in. It is in the core product, `Palbase`. Every flow that ends in tokens starts the session, and every call that acts for the user carries it from then on: to the project's modules, to your backend, and on the realtime socket. The flows an app writes most are methods here: email and password, guests, passkeys, Sign in with Apple, Google, second factors, magic links, phone codes, passwords, the user's sessions. Every other client operation of the auth module is reachable, typed, as `pb.auth.api`.

## Quick example

```swift
import Palbase
import SwiftUI

struct SignInView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var problem = ""
    @State private var mfaToken: String?

    var body: some View {
        Form {
            TextField("Email", text: $email).textContentType(.username).textInputAutocapitalization(.never)
            SecureField("Password", text: $password).textContentType(.password)
            Button("Sign in") { Task { await signIn() } }
            Button("Sign in with a passkey") { Task { await passkey() } }
            if let reason = pb.auth.state.sessionEndReason, reason == .userBanned {
                Text("This account is suspended.")
            }
            Text(problem)
        }
    }

    private func signIn() async {
        do {
            switch try await pb.auth.signIn(email: email, password: password) {
            case .signedIn: problem = ""
            case .mfaRequired(let token, _): mfaToken = token // finish with pb.auth.mfa.challenge(...)
            }
        } catch {
            problem = "\(error)"
        }
    }

    private func passkey() async {
        do {
            try await pb.auth.passkeys.signIn()
        } catch let error where pb.auth.wasCancelled(error) {
            // The sheet was dismissed: nothing to show.
        } catch {
            problem = "\(error)"
        }
    }
}
```

## Who is signed in

`pb.auth.state` is an `@Observable` object on the main actor. A SwiftUI view that reads it is drawn again when it changes, with no listener to write:

```swift
import Palbase
import SwiftUI

struct Root: View {
    var body: some View {
        if let user = pb.auth.state.user {
            Text("Hello \(user.email ?? user.id)")
        } else {
            SignInView()
        }
    }
}
```

| Member | What it is |
|---|---|
| `isSignedIn` | Whether someone is signed in. It does not change when the token is refreshed. |
| `userId` | The signed-in user's id, or `nil`. |
| `user` | The user as auth last answered (`AuthAPI.User`: `id`, `email`, `emailVerified`, `isAnonymous`, `roles`, `metadata`, …), or `nil`. |
| `session` | The `Session` (`accessToken`, `refreshToken`, `expiresAt`, `userId`, `user`); it changes with every refresh. Printed or logged, it shows no token. |
| `sessionEndReason` | Why the last session ended without the app signing out: `.expired`, `.revoked`, `.userDeleted` or `.userBanned`; `nil` once someone signs in or the app signs out. |

It holds the session kept on the device from the first frame: the keychain is read when the client is made. It follows a sign-out in another process too, such as the app's widget, and a session that auth ended (the account deleted or suspended, signed out everywhere) is seen within one token's lifetime while the app is in the foreground, even when it makes no call.

Outside SwiftUI:

| Member | What it does |
|---|---|
| `currentSession()` | The session now, or `nil`. |
| `currentUser()` | The user as auth last answered, without a call. |
| `getUser()` | Reads the profile fresh (`GET /auth/me`): `AuthAPI.MeProfile`, with `emailVerified`, `hasPassword`, `hasMfa`, `isAnonymous`, `providers` and `locale`. |
| `refreshSession()` | Renews the session now. |
| `changes` | An `AsyncStream<AuthEvent>` of every change: `.signedIn`, `.tokenRefreshed`, `.userUpdated`, `.signedOut`, `.sessionExpired`. |
| `sessionEndReason()` | The same reason as `state.sessionEndReason`, read from any thread. |

```swift
import Palbase

func followSession() async {
    for await event in pb.auth.changes where event == .sessionExpired {
        let why = await pb.auth.sessionEndReason()
        print("signed out by the project:", why.map { "\($0)" } ?? "unknown")
    }
}
```

When someone signs out, or someone else signs in, the realtime socket closes and every module forgets what it held for the last user: the next user's flags, inbox and purchases are read for them.

## Email and password

```swift
import Palbase

func createAccount() async throws {
    let created = try await pb.auth.signUp(email: "ada@example.com", password: "correct-horse-battery-staple")
    if created.accessToken == nil {
        // The project asks for the address to be confirmed before a sign-in.
        print("check your email")
    }
}
```

`signUp(email:password:locale:)` creates the account (`POST /auth/signup`), and starts the session when the project lets a new account sign in before it confirms its address. `locale` is the language auth writes this user's emails in; with none given, it is the language the app itself is shown in, so an English app on a Turkish phone gets English mail. `signUp(_:)` takes the whole `AuthAPI.SignupRequest`, with its `redirectTo`.

`signIn(email:password:)` (`POST /auth/login`) answers a `SignInResult`: `.signedIn(user)`, or `.mfaRequired(mfaToken:factors:)` when the account has a second factor.

The password rules, and whether an email must be confirmed first, are the project's auth settings: Studio's Auth screens, or [`palbase auth:settings:set`](https://palbase.studio/docs/cli/reference#palbase-authsettingsset).

### Confirming an email

```swift
import Palbase

func confirm(code: String) async throws {
    try await pb.auth.email.verify(.init(code: code, email: "ada@example.com"))
}

func resend() async throws {
    _ = try await pb.auth.email.resendVerification(email: "ada@example.com")
}
```

`email.verify(_:)` takes the link's `token`, or the `code` with the `email`, as the project sends them.

## Guests

```swift
import Palbase

func continueAsGuest() async throws {
    let guest = try await pb.auth.signInAnonymously()
    print(guest.id, guest.isAnonymous) // a real user id, true
}
```

`signInAnonymously(locale:)` (`POST /auth/anonymous`) makes an account with no email or password and signs it in on this device. Its session is held and renewed like any other, and what the guest buys or writes is theirs. The project turns guests on (the auth setting `anonymous_sign_ins`); off, the call is refused with `403 anonymous_sign_ins_disabled`.

A guest becomes an account, keeping its id, with an address and a password: `pb.auth.api.convertAnonymousUser(body: .init(email:password:))` mails a code to the address (`POST /auth/anonymous/convert`), and `pb.auth.api.verifyAnonymousConversion(body: .init(code:))` confirms it.

## Passkeys

A passkey signs in with Face ID or Touch ID, and nothing is typed. The app needs the **Associated Domains** capability with the `webcredentials:` entry its client document names (`auth.associated_domains` in `palbase/environments/<env>/<app>.json`, `webcredentials:<ref>.palbase.studio`). The project publishes the app at `/.well-known/apple-app-site-association` once its bundle is set in the environment ([`apps:env:set`](https://palbase.studio/docs/cli/reference#palbase-appsenvset)); Apple caches that file, so a device can take a day to see a change.

```swift
import Palbase

func passkeyAccount() async throws {
    // A new account whose only credential is a passkey, then a sign-in with it.
    switch try await pb.auth.passkeys.signUp(email: "ada@example.com", displayName: "Ada") {
    case .signedIn(let user): print("signed in", user.id)
    case .confirmationRequired(let userId): print("confirm the address first", userId)
    }
}

func addPasskey() async throws {
    // For the signed-in user: the next sign-in is one tap.
    let credential = try await pb.auth.passkeys.register(name: "iPhone")
    print(credential.id, credential.isPasskey)
}
```

| Method | What it does |
|---|---|
| `passkeys.signIn()` | Signs in with any passkey this device, the user's iCloud Keychain or a phone nearby holds for the project: the sheet lists them. |
| `passkeys.signUp(email:displayName:)` | Opens an account with a passkey and no password, then signs in with that passkey. `email` is the account's identifier, an address or a phone number as the project's passkey settings ask, or `nil` when it asks for none (then `displayName` is required). Answers `.signedIn(user)`, or `.confirmationRequired(userId:)` when the project asks for the address to be confirmed before a sign-in. |
| `passkeys.register(name:userName:)` | Adds a passkey to the signed-in account. Auth asks for a recent sign-in (`reauthentication_required` otherwise). `userName` is what the sheet shows, needed only by an account with no address or phone. |

The user's passkeys are listed with `pb.auth.api.webauthnListCredentials()`, renamed with `webauthnRenameCredential(id:body:)` and removed with `webauthnDeleteCredential(id:)`. A sheet the user dismisses throws `passkey_cancelled`; a relying party that is not the one the client document names throws `passkey_relying_party_mismatch`, and running `palbase apps:sync` again fixes it.

## Sign in with Apple and Google

```swift
import Palbase

func apple() async {
    do {
        if case .mfaRequired(let token, let factors) = try await pb.auth.signInWithApple() {
            print("second factor needed", token, factors)
        }
    } catch let error where pb.auth.wasCancelled(error) {
        // The sheet was dismissed.
    } catch {
        print(error)
    }
}
```

`signInWithApple(variant:)` shows Apple's own sheet; `signInWithGoogle(variant:)` opens Google's page in the system's browser sheet and exchanges its code on the device, with no client secret in the app. Each starts the session, or answers `.mfaRequired`. The provider must be on for the project, with a **native client** for this app in Studio's **Auth › Providers**:

| Field | Value |
|---|---|
| Application key | The app's slug (`shop`), as `palbase apps:create` registered it. |
| Platform | `ios` |
| Variant | `release`, or a label of the build's own: the `variant:` the app passes (default `"release"`). |
| Flow | Native OAuth |
| Apple | **Bundle ID**: the app's bundle. The app also needs the **Sign in with Apple** capability. |
| Google | **Bundle ID**, the Google Cloud **iOS Client ID**, and the **Native redirect URI**: a URI whose scheme is that client's iOS URL scheme (`com.googleusercontent.apps.1234-abcd:/oauth2redirect`). |

The SDK signs in with the native client alone. With no native client for the app, platform and variant, or one set up for another bundle than the running app's, the call throws `auth_client_not_configured` or `auth_client_mismatch` before any sheet opens. A sheet the user dismisses throws `oauth_cancelled`; `wasCancelled(_:)` is true for it, for a dismissed passkey sheet and for a cancelled task.

Once the provider has answered, the SDK keeps the answer in the keychain until auth has taken it, and sends it again while the answer is "not now". A sign-in interrupted before then is never finished into a later one: the next sign-in with that provider cancels it.

## Second factors

A sign-in that needs a second factor answers `.mfaRequired(mfaToken:factors:)`, `factors` being among `totp`, `sms`, `email` and `webauthn`. Finish it:

```swift
import Palbase

func finish(mfaToken: String, code: String) async throws {
    try await pb.auth.mfa.challenge(mfaToken: mfaToken, type: .totp, code: code)
}
```

| Method | What it does |
|---|---|
| `mfa.challenge(mfaToken:type:code:)` | Completes the sign-in with a code: `type` is `.totp`, `.sms` or `.email`. |
| `mfa.recovery(mfaToken:code:)` | Completes it with a recovery code. |
| `mfa.sendSmsCode(mfaToken:)`, `mfa.sendEmailCode(mfaToken:)` | Sends the code first, for `.sms` and `.email`. |

For the signed-in user:

| Method | What it does |
|---|---|
| `mfa.enrollTotp()` | Starts a TOTP factor: `secret`, `otpUrl`, a `qrCode` and the `recoveryCodes`, shown once. |
| `mfa.verifyTotp(code:)` | Confirms it with the first code the authenticator shows. |
| `mfa.enrollSms(phone:)`, `mfa.verifySms(code:)` | Adds a phone: auth texts it a code, which confirms it. |
| `mfa.enrollEmail()` | Adds the account's address. |
| `mfa.factors()` | The factors: each one's `id`, `type`, `verified`. |
| `mfa.removeFactor(id:currentPassword:)` | Removes one; it asks for the account's password. |

New recovery codes are `pb.auth.api.mfaRegenerateRecoveryCodes()`.

## Magic links and phone codes

```swift
import Palbase

func magicLink(token: String?) async throws {
    if let token {
        try await pb.auth.magicLink.verify(token: token) // the token the email's link carried
    } else {
        try await pb.auth.magicLink.send(email: "ada@example.com")
    }
}

func phone(code: String?) async throws {
    if let code {
        if case .mfaRequired = try await pb.auth.phone.verifyCode(phone: "+905551234567", code: code) {
            print("a second factor is needed")
        }
    } else {
        _ = try await pb.auth.phone.sendCode(phone: "+905551234567")
    }
}
```

A magic link lands where the project's links land ([Where email links land](https://palbase.studio/docs/web/auth#where-email-links-land)), with its `token` in the query: an app that sends them opens that address as a universal link and passes the token to `verify(token:)`. Phone sign-in must be on for the project (`provider_not_enabled` otherwise); `sendCode(phone:)` texts a code through the project's SMS provider and answers the same whether or not the number has an account.

## Passwords

```swift
import Palbase

func passwords() async throws {
    // Forgot it: the email's link carries a token for confirmReset.
    try await pb.auth.password.requestReset(email: "ada@example.com")

    // Signed in: change it, or add a first one to an account that has none (passkey, guest, social).
    let me = try await pb.auth.getUser()
    if me.hasPassword {
        try await pb.auth.password.change(.init(currentPassword: "old-long-passphrase", newPassword: "a-new-long-passphrase"))
    } else {
        try await pb.auth.password.set(.init(newPassword: "a-first-long-passphrase"))
    }
}
```

`password.confirmReset(token:newPassword:)` finishes a reset with the link's token.

## The user's sessions

```swift
import Palbase

func devices() async throws {
    let list = try await pb.auth.sessions.list()
    for s in list.sessions { print(s.id, s.current, s.userAgent ?? "", s.lastActivity) }
    try await pb.auth.sessions.revokeAll() // signed out everywhere
}
```

`sessions.revoke(id:)` ends one of them.

## Signing out and deleting the account

`signOut()` ends the session on the server (`POST /auth/logout`) and on the device; a failed call still signs out here. If another process of the app (its extension) signed someone else in meanwhile, theirs is the session that ends.

`deleteAccount(password:)` deletes the account (`DELETE /auth/user`) and ends the session. An account with a password gives it (`getUser().hasPassword` says whether it has one): missing or wrong, the call is refused with `401 reauth_required` and the user stays signed in. An account without one is deleted on the strength of its session.

## A session from tokens of your own

`setSession(accessToken:refreshToken:expiresIn:)` starts the session from a token pair the app has from a flow it runs itself, step by step, through `pb.auth.api`.

## `pb.auth.api`

Every client operation of the auth contract, typed, through the session's transport. A few an app reaches for:

| Call | Path |
|---|---|
| `pb.auth.api.updateMe(body: .init(locale: "tr"))` | `PATCH /auth/me` |
| `pb.auth.api.listIdentities()` | `GET /auth/identities` |
| `pb.auth.api.unlinkIdentity(id:)` | `DELETE /auth/identities/{id}` |
| `pb.auth.api.webauthnListCredentials()` | `GET /auth/webauthn/credentials` |

An operation of the contract that needs the secret key cannot be made from an app.

## Proof of work

Auth may answer a sign-up, a sign-in or a code request with a proof-of-work challenge when the address looks like a bot. The SDK solves it on the device and sends the request once more; the app never sees it.

## Related

- [Overview](https://palbase.studio/docs/ios/overview): the client, the session in the keychain, errors
- [Calling Your Backend](https://palbase.studio/docs/ios/backend-calls): the user's token on your own routes
- [Web Auth](https://palbase.studio/docs/web/auth): the same flows in a browser, and where email links land
- [Authentication in your backend](https://palbase.studio/docs/backend/authentication): how a machine checks the token
- [Test Users](https://palbase.studio/docs/backend/test-users): accounts made with the secret key

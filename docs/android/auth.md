> The full documentation index: https://palbase.studio/llms.txt

# Auth

`pb.auth` signs a person in and keeps them signed in. Every flow that ends in tokens starts the client's session, and every call that acts for the user carries the access token from then on. The flows an app writes most are methods here: email and password, guests, second factors, magic links, phone codes, password and email changes, the user's sessions. Every other client call of the auth module is reachable typed as `pb.auth.api`.

Every method that reaches the server is a `suspend` function: call it from a coroutine (`lifecycleScope`, `viewModelScope`, `rememberCoroutineScope()`).

## Quick example

```kotlin
import studio.palbase.Auth
import studio.palbase.AuthAPI

// Create the account. When the project signs new users in at once, the session starts too.
val created = pb.auth.signUp("ada@example.com", "correct-horse-battery-staple")
println(if (created.accessToken != null) "signed in" else "confirm your email first")

// Sign in. A second factor, when the account has one, comes back as MfaRequired.
when (val result = pb.auth.signIn("ada@example.com", "correct-horse-battery-staple")) {
    is Auth.SignInResult.SignedIn -> println("signed in as ${result.user.id}")
    is Auth.SignInResult.MfaRequired -> {
        val code = askForCode() // the code from the authenticator app
        pb.auth.mfa.challenge(result.mfaToken, AuthAPI.MFAChallengeRequest.Type.TOTP, code)
    }
}
```

`AuthAPI` (package `studio.palbase.generated`) holds the auth module's request and answer types, generated from its contract.

## Email and password

`signUp(email, password, locale)` creates the account. `signUp(AuthAPI.SignupRequest(…))` takes the whole body, with `redirectTo`, the address the verification link lands on. What comes back is an `AuthAPI.SignupResult`: its `user`, and its tokens only when the project lets a new account sign in before it confirms its address. With email confirmation required, the user confirms first and then signs in.

`signIn(email, password)` answers one of two:

| Result | What it is |
|---|---|
| `Auth.SignInResult.SignedIn(user)` | Signed in: the session has started. |
| `Auth.SignInResult.MfaRequired(mfaToken, factors)` | The account has a second factor: finish with `mfa.challenge` or `mfa.recovery` ([Second factors](#second-factors)). `factors` names the ones it has (`totp`, `sms`, `email`, `webauthn`). |

A wrong password is a `PalbaseError` with status 401. After 10 failures in 30 minutes the account is locked for a while: `429` with `retryAfter`. The password rules are the project's auth settings, in Studio's Auth screens or `palbase auth:settings:set`.

### Confirming an email

The confirmation email carries a link, or a code when the project uses codes:

```kotlin
// The link's token, from the link the app was opened with:
pb.auth.email.verify(AuthAPI.VerifyEmailRequest(token = token))
// Or the code, with the address:
pb.auth.email.verify(AuthAPI.VerifyEmailRequest(email = "ada@example.com", code = "482913"))

// The email did not arrive:
pb.auth.email.resendVerification("ada@example.com")
```

Where an email's link lands is the project's auth settings, the same for every app: [Where email links land](https://palbase.studio/docs/web/auth#where-email-links-land).

## Guests

A guest is an account with no email or password, signed in on this device. Its session is kept and renewed like any other, and what the guest does or buys stays theirs when they become an account:

```kotlin
val guest = pb.auth.signInAnonymously()
println(guest.isAnonymous) // true

// Later: become an account under the same id. A code is mailed to the address.
pb.auth.api.convertAnonymousUser(AuthAPI.AnonymousConvertRequest(email = "ada@example.com", password = "correct-horse-battery-staple"))
pb.auth.api.verifyAnonymousConversion(AuthAPI.AnonymousConvertVerifyRequest(code = "482913"))
pb.auth.refreshSession() // the next tokens no longer say is_anonymous
```

The project must have turned guests on (its `anonymous_sign_ins` setting): otherwise sign-in is refused with `403 anonymous_sign_ins_disabled`. Until the code is redeemed the account is still a guest, and five wrong codes end the conversion.

## Second factors

A sign-in that needs a second factor answers `MfaRequired(mfaToken, factors)`. Finish it with one of these, each of which starts the session and returns the user:

| Method | What it does |
|---|---|
| `mfa.challenge(mfaToken, type, code)` | Completes the sign-in with a code. `type` is `AuthAPI.MFAChallengeRequest.Type.TOTP`, `.SMS` or `.EMAIL`. |
| `mfa.recovery(mfaToken, code)` | Completes it with a recovery code instead. |
| `mfa.sendSmsCode(mfaToken)` / `mfa.sendEmailCode(mfaToken)` | Sends the sign-in code; then `challenge(mfaToken, …SMS or …EMAIL, code)`. |

Enrolling, for the signed-in user:

```kotlin
// TOTP: the secret for the authenticator app, its otpauth:// URL and a QR code, and the recovery codes, shown once.
val totp = pb.auth.mfa.enrollTotp()
showQr(totp.otpUrl)
showOnce(totp.recoveryCodes)
pb.auth.mfa.verifyTotp("123456") // the first code the app shows confirms it

val factors = pb.auth.mfa.factors()

// Removing a factor asks for the account's password.
pb.auth.mfa.removeFactor("fac_01", currentPassword = "correct-horse-battery-staple")
```

`enrollSms(phone)` and `verifySms(code)` enroll a phone, and `enrollEmail()` the account's address.

### Stepping up

A backend route that asks for a second factor (`auth { aal: "aal2" }`), or for a recent one (`maxAge`), refuses a password sign-in with `StepUpRequired(acrValues, maxAge, …)`. Step the signed-in user up and call again:

| Method | What it does |
|---|---|
| `mfa.stepUp(code)` | With the authenticator app's code. Returns the session. |
| `mfa.sendStepUpSmsCode()`, `mfa.stepUpWithSms(code)` | By text: the first sends the code to the user's SMS factor, the second steps up with it. |
| `passkeys.stepUp(context)` | With one of the account's passkeys: the fingerprint, the face or the screen lock. |

Each keeps the session's refresh token; its refreshes stay at the new level (`TOKEN_REFRESHED` is told), and a route's `maxAge` counts from the step-up. An email code is not a way up ([Second factors and their strength](https://palbase.studio/docs/backend/authentication#second-factors-and-their-strength)).

## Passkeys

`pb.auth.passkeys` runs the system's passkey sheet through Credential Manager: the fingerprint, the face or the device's screen lock. The project publishes its registered Android apps' certificates for it ([Registering the app](https://palbase.studio/docs/android/overview#registering-the-app)).

```kotlin
// Adds a passkey to the signed-in account.
pb.auth.passkeys.register(context)

// Signs in with one of the device's passkeys for the project.
val user = pb.auth.passkeys.signIn(context)

// Opens an account with a passkey (an email is optional when the project allows it).
when (val result = pb.auth.passkeys.signUp(context, email = "ada@example.com")) {
    is Auth.Passkeys.SignUpResult.SignedIn -> showHome(result.user)
    is Auth.Passkeys.SignUpResult.ConfirmationRequired -> askToConfirm(result.userId)
}
```

| Method | What it does |
|---|---|
| `passkeys.register(context, name, userName)` | Adds a passkey to the signed-in account; asks for a recent sign-in. Returns the registered credential. |
| `passkeys.signIn(context)` | Signs in with a passkey the device holds for the project. Returns the user. |
| `passkeys.signUp(context, email, displayName)` | Opens an account with a passkey: `SignedIn(user)`, or `ConfirmationRequired(userId)` when the address is to be confirmed first. |
| `passkeys.stepUp(context)` | Steps the signed-in session up ([Stepping up](#stepping-up)). |

A sheet the user dismisses throws `passkey_cancelled` (`pb.auth.wasCancelled(e)` is true); `passkey_unavailable` is a device with no passkey or no credential provider; `passkey_exists`, a passkey the account already has on this device; `passkey_failed`, one the system refused (the app's certificate not in the project's `assetlinks.json`, most often).

## Magic links

```kotlin
pb.auth.magicLink.send("ada@example.com")

// The token from the link the email carried:
val user = pb.auth.magicLink.verify(token)
```

`send` answers the same whether or not the address has an account.

## Phone codes

```kotlin
pb.auth.phone.sendCode("+905551234567")
when (val result = pb.auth.phone.verifyCode("+905551234567", "482913")) {
    is Auth.SignInResult.SignedIn -> println("signed in as ${result.user.id}")
    is Auth.SignInResult.MfaRequired -> println("a second factor is needed")
}
```

Phone sign-in must be enabled for the project (`provider_not_enabled` otherwise). The code is texted through the project's own SMS provider or verification service — with neither, through Palbase's Twilio Verify.

## Passwords

```kotlin
// Forgot it: the email's link carries a token.
pb.auth.password.requestReset("ada@example.com")
pb.auth.password.confirmReset(token, "a-new-long-passphrase")

// Signed in: change it, or add one to an account that has none.
pb.auth.password.change(AuthAPI.PasswordChangeRequest(currentPassword = "a-new-long-passphrase", newPassword = "another-long-passphrase"))
if (!pb.auth.getUser().hasPassword) {
    pb.auth.password.set(AuthAPI.PasswordSetRequest(newPassword = "a-first-long-passphrase"))
}
```

## Who is signed in

The session is observable. Each of these is a `StateFlow`, so a composable that collects one is drawn again when it changes: a sign-in, a sign-out, a session auth ended (the user deleted, suspended, signed out everywhere), another process of the app signing out.

| Member | What it holds |
|---|---|
| `isSignedIn` | Whether someone is signed in. It does not change when the token is refreshed. |
| `userId` | The signed-in user's id; `null` when no one is. |
| `user` | The signed-in user as auth last answered (`AuthAPI.User`: `id`, `email`, `emailVerified`, `isAnonymous`, `roles`, `metadata`). |
| `state` | The `Session` itself: `accessToken`, `refreshToken`, `expiresAt` (epoch milliseconds), `userId`, `user`. It changes with every refresh. |
| `sessionEndReason` | Why the last session ended without the app signing out: `EXPIRED`, `REVOKED`, `USER_DELETED` or `USER_BANNED`. Set before the change is told, and `null` again once someone signs in or the app signs out. |

```kotlin
@Composable
fun Root() {
    val signedIn by pb.auth.isSignedIn.collectAsState()
    val ended by pb.auth.sessionEndReason.collectAsState()
    if (signedIn) Home() else SignIn(notice = ended?.let { "You were signed out: ${it.name.lowercase()}" })
}
```

The same changes come as events: `pb.auth.changes` is a `Flow<AuthEvent>`, and `pb.auth.onChange { event, session -> }` calls a listener and returns what stops it.

| Event | When |
|---|---|
| `SIGNED_IN` | A flow started a session. |
| `TOKEN_REFRESHED` | The access token was refreshed. |
| `USER_UPDATED` | The user's profile was read and kept with the session. |
| `SIGNED_OUT` | `signOut()`, `deleteAccount()`, or a sign-out in another process of the app. |
| `SESSION_EXPIRED` | The refresh token was refused: `sessionEndReason` says why. |

`currentSession()` reads the session without waiting. `currentUser()` is the user as auth last answered. `getUser()` reads the profile fresh (`GET /auth/me`, an `AuthAPI.MeProfile`): whether the email is verified, whether the account has a password and a second factor, its linked providers and its language. `refreshSession()` refreshes now rather than when the token is about to lapse.

### How the session is kept

The session is kept encrypted, with an AES key the Android keystore holds, in the app's no-backup files ([The client](https://palbase.studio/docs/android/overview#the-client)). While the app is in the foreground the access token is renewed a minute before it lapses, so no call waits for a refresh, and a session that auth ended is noticed within a token's lifetime without a call. In the background nothing is renewed ahead: a process woken for a push renews only when a call needs it. Before renewing, the store is read again, because another process of the app (a widget's, a push handler's) may have renewed it or signed out.

A session is bound to this device. The calls that start or renew it carry a proof signed by a key the Android keystore holds (DPoP, RFC 9449), and auth refuses to renew the session without one. A refresh token copied off the device renews nothing, and the key never leaves it.

## Signing out and deleting the account

`signOut()` ends the session on the server and here. A failed call still signs out locally. What a module must undo while the user can still be named runs first. For example, [notify](https://palbase.studio/docs/android/notifications) forgets this device for them.

`deleteAccount(password)` deletes the account, everything tied to it and its sessions, and ends the session here. An account with a password gives it, and a password missing or wrong is `401 reauth_required` with the session kept. An account without one (a guest, a phone or social account) passes nothing:

```kotlin
val me = pb.auth.getUser()
pb.auth.deleteAccount(if (me.hasPassword) askForPassword() else null)
```

## `pb.auth.api`

Every client call of the auth contract, typed (`AuthAPI.Client`), through the session's transport. A few an app reaches for:

| Call | Path |
|---|---|
| `pb.auth.api.updateMe(AuthAPI.MeUpdateRequest(locale = "tr"))` | `PATCH /auth/me` |
| `pb.auth.api.listIdentities()` | `GET /auth/identities` |
| `pb.auth.api.unlinkIdentity(id)` | `DELETE /auth/identities/{id}` |
| `pb.auth.sessions.list()`, `.revoke(id)`, `.revokeAll()` | The user's sessions on every device |

Google's sign-in is one call, `pb.auth.signInWithGoogle(context, variant)` (Google's sheet through Credential Manager). Apple, GitHub and Microsoft have none in the Android SDK at this version: their calls are in `pb.auth.api` (`socialConfig`, `socialBegin`, `socialComplete`), and a token pair a flow of the app's own ends in starts the session with `setSession(accessToken, refreshToken, expiresIn)`.

## Proof of work

The auth module may answer a sign-in, a sign-up or a code request with `403 pow_required` and a challenge when the address looks like a bot. The client solves it and sends the same request once more with the answer. You never see the challenge. One the client cannot solve comes back as `pow_unsolved`.

## Related

- [Overview](https://palbase.studio/docs/android/overview): the client, its errors and retries
- [Calling Your Backend](https://palbase.studio/docs/android/backend-calls): the access token on your own routes
- [Authentication in your backend](https://palbase.studio/docs/backend/authentication): how a machine checks the token
- [Test Users](https://palbase.studio/docs/backend/test-users): accounts made with the secret key

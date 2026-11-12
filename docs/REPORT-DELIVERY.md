# Sealed report delivery: 48h code + end-to-end encrypted reports

Requirement: the owner receives an email with a special code valid for 48 hours; the report files are encrypted so staff cannot read them; the owner downloads and decrypts with the code.

This document is the implementation contract. It is folded into `docs/HOSTING-PLAN.md` as Workstream I.

## 1. What "even we cannot see the report" means (honest boundary)

The scan and the report are produced by our AI workers, so plaintext exists transiently during the run and during report generation. That is unavoidable without client-side report generation or a confidential-computing enclave, which are out of scope.

What we guarantee:
- After the run finishes, the delivered bundle (HTML, PDF, findings JSON, evidence index) is encrypted to a public key whose private half never reaches our servers.
- The plaintext bundle is created in a locked temp directory, encrypted, then securely deleted. It is never written to the artifact store, email, logs or backups in plaintext.
- Staff, support, and anyone with database or storage access can download only ciphertext. They cannot open a stored report.
- Email contains no findings, no report content, no evidence, and no target details beyond the domain.

What we must not claim:
- That the scanning process is zero-knowledge. Our agents and model provider process public target data and any data the scan retrieves.
- That we never hold plaintext. Plaintext exists in worker memory and on a locked temp disk between generation and encryption.

If a customer contractually requires zero-knowledge of all scan data, offer **sealed mode**: purge raw findings and transcripts immediately after the encrypted bundle is produced, accepting that support and report regeneration are unavailable.

## 2. Key management (customer-held)

At account setup, before the first paid run:
1. Browser generates an RSA-OAEP 3072 key pair with WebCrypto.
2. Customer chooses a **report passphrase** (minimum 12 characters; strength meter; no recovery by us).
3. The private key (PKCS#8) is exported and encrypted with AES-256-GCM using a key derived from the passphrase with PBKDF2-SHA-256 (600,000 iterations, 16-byte per-user salt).
4. The public key (SPKI, base64) and the encrypted private-key blob (ciphertext + salt + IV + tag) are stored server-side. The passphrase and derived key never leave the browser.
5. The customer downloads a **recovery kit** (the encrypted private-key blob + key id) and is warned: losing the passphrase makes old reports unrecoverable. Key rotation creates a new key id; old reports keep their old key id.

No server escrow, no master key, no admin decrypt. Support can only re-issue access codes, never read reports.

## 3. Artifact envelope

A completed run produces one ZIP bundle:

```
report.html
report.pdf
findings.json
evidence/index.json
scan-summary.json
```

Encryption:
- Random 32-byte AES-256-GCM file key.
- Encrypt the ZIP with AES-256-GCM (12-byte IV, 16-byte auth tag).
- Wrap the file key with the customer's RSA-OAEP public key (SHA-256).
- Store one envelope JSON:

```json
{
  "v": 1,
  "alg": "RSA-OAEP-3072+SHA256/AES-256-GCM",
  "keyId": "key-...",
  "wrappedKey": "base64",
  "iv": "base64",
  "tag": "base64",
  "sha256": "hex",
  "ciphertext": "base64 or object-store key"
}
```

- Verify `sha256` before decrypting. Any failure must show a clean error, not partial output.
- Bundle size limit defaults to 250 MB; larger reports are split into parts with the same scheme.
- Encrypted bundles live in object storage with server-side encryption as a second layer. The customer-facing path serves only ciphertext.

## 4. 48-hour delivery code

On report completion:
1. Generate a 12-character Crockford-base32 code (for example `K7QM-3XPD-9RTA`, 60 bits) and a separate high-entropy URL token.
2. Store only `HMAC-SHA256(server_pepper, code)` and `sha256(token)`; never store or log the raw code.
3. Set `expires_at = now + 48h`, `max_downloads = 5`, `max_attempts = 10`.
4. Email the owner a link to `/delivery/<token>` plus the code, the expiry timestamp, and the passphrase reminder. No report content in the email.
5. The code is single-purpose: it authenticates a download of ciphertext. It does not decrypt anything.
6. Rate-limit by IP, account and delivery id; constant-time comparison; lock and alert after max attempts. A leaked code exposes only encrypted bytes.
7. After expiry the code and token stop working. The encrypted report remains in the account; a logged-in owner can issue a new 48-hour code at any time. Support cannot decrypt or preview it.

Resend / support path:
- Logged-in owner: "Email me a new code" (new code, new 48-hour window, old code invalidated).
- Support: can only trigger a reissue after account verification; audit-logged; cannot read report content.

## 5. Customer flow

1. Email: "Your security assessment for `<domain>` is ready. Code valid until `<timestamp>`."
2. Open the link or enter the code on `/delivery`.
3. Browser fetches the envelope, asks for the report passphrase, decrypts the private key locally, unwraps the file key, decrypts the ZIP.
4. Actions: preview the HTML in a sandboxed iframe, open/download the PDF, download the ZIP, download the encrypted `.hmw.enc` for offline storage.
5. Wrong passphrase or tampered bundle: clear error; no partial file; attempt counter.
6. If the passphrase is lost: the report is unrecoverable. The UI offers a new run or a new report encrypted to a new key, with the data retention rules explained.

## 6. Data model additions

- `user_keys(id, user_id, key_id, public_key_spki, encrypted_private_key, kdf_salt, kdf_iters, created_at, rotated_from, revoked_at)`
- `report_bundles(id, run_id, key_id, envelope_json, storage_key, sha256, bytes, created_at, plaintext_deleted_at)`
- `delivery_codes(id, bundle_id, user_id, code_hmac, token_hash, expires_at, max_downloads, downloads, attempts, locked_at, created_at, last_used_at, ip, user_agent)`
- `delivery_events(id, delivery_id, kind, ip, user_agent, created_at)` for audit.

## 7. Email requirements

- From a dedicated subdomain with SPF, DKIM, DMARC and a monitored abuse mailbox.
- No findings, evidence or severity counts in the email.
- Link uses HTTPS; code is text, never a query parameter.
- Bounce handling: mark the email invalid, show "email bounced" in the account, allow the owner to update the address.
- Optional encrypted ZIP attachment only if under 10 MB and the customer enables it; the same passphrase is required.

## 8. Edge cases

| Case | Behavior |
|---|---|
| Customer has no key at completion | Run can complete, but delivery is `pending_key`; email says "set your passphrase to receive the report"; no plaintext retained beyond the temp window |
| Code expired | Reissue from the account; encrypted bundle unchanged |
| Code leaked | Attacker can download ciphertext only; decryption still needs the passphrase |
| Passphrase forgotten | Unrecoverable; offer sealed-mode deletion or a new run |
| Key rotated | Old bundles keep old key id; decryption uses the old passphrase |
| Tampered or truncated bundle | SHA-256 mismatch; refuse to decrypt; alert |
| Very large bundle | Split into parts; same envelope per part; ZIP64 support |
| Mobile / no download manager | Streamed Blob download; no server-side decryption |
| Customer wants files emailed as attachments | Optional encrypted ZIP attachment under 10 MB; otherwise link only |
| Abuse / brute force | Attempt and rate limits; lock; alert; audit |
| Legal hold / deletion request | Delete ciphertext and codes; note that we cannot decrypt it either |

## 9. Acceptance tests

- Browser key setup, passphrase change, recovery-kit import.
- Encrypt/decrypt round trip for HTML, PDF, JSON; wrong passphrase fails cleanly.
- Tamper one byte in ciphertext; SHA-256/GCM fails; no partial output.
- Code: correct code works, wrong code counts an attempt, expiry blocks, max downloads blocks, lock after attempts, raw code never appears in DB/logs.
- After finalize, search the run directory, logs, email payloads and object store for a known report phrase: zero plaintext matches.
- Email content contains no findings/evidence/severity; contains code, expiry and passphrase reminder.
- Reissue invalidates the old code; audit rows written.
- Sealed mode deletes raw findings/transcripts after encryption and the report still decrypts.

## 10. Dependencies and phasing

- Needs the account/DB/payments base from Workstream D (P1).
- Can be prototyped before P1 with fixture bundles and a local key pair.
- Ships with P1 for the first paying customers. Until then, the existing local portal may keep plaintext reports for the owner's own debug runs, clearly out of the customer path.

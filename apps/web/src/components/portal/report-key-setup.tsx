"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

const ITERATIONS = 600_000;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export type ReportKeyData = {
  keyId: string;
  publicKeySpki: string;
  encryptedPrivateKey: string;
  kdfSalt: string;
  kdfIters: number;
  createdAt: string;
};

export function ReportKeySetup({ hasKey, keyId, keyData }: { hasKey: boolean; keyId?: string | null; keyData?: ReportKeyData | null }) {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(hasKey);
  const [savedKeyId, setSavedKeyId] = useState(keyId || "");

  async function createKey() {
    setError(null);
    if (passphrase.length < 12) {
      setError("Use at least 12 characters. A longer phrase is better.");
      return;
    }
    if (passphrase !== confirmation) {
      setError("The two passphrases do not match.");
      return;
    }
    if (!window.crypto?.subtle) {
      setError("This browser does not support WebCrypto. Use a current browser over HTTPS.");
      return;
    }
    setBusy(true);
    try {
      const pair = await window.crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"],
      );
      const spki = new Uint8Array(await window.crypto.subtle.exportKey("spki", pair.publicKey));
      const pkcs8 = new Uint8Array(await window.crypto.subtle.exportKey("pkcs8", pair.privateKey));
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const material = await window.crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"],
      );
      const aesKey = await window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"],
      );
      const encryptedPrivateKey = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, pkcs8);

      const response = await fetch("/api/report-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicKeySpki: toBase64(spki),
          encryptedPrivateKey: JSON.stringify({
            iv: toBase64(iv),
            ciphertext: toBase64(new Uint8Array(encryptedPrivateKey)),
          }),
          kdfSalt: toBase64(salt),
          kdfIters: ITERATIONS,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { keyId?: string; error?: string };
      if (!response.ok) {
        if (data.error === "already_configured" && data.keyId) {
          setSavedKeyId(data.keyId);
          setDone(true);
          router.refresh();
          return;
        }
        throw new Error(data.error || "Could not save the report key.");
      }
      setSavedKeyId(data.keyId || "");
      setDone(true);
      setPassphrase("");
      setConfirmation("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the report key.");
    } finally {
      setBusy(false);
    }
  }

  function downloadRecoveryKit() {
    if (!keyData) return;
    let encrypted: unknown;
    try { encrypted = JSON.parse(keyData.encryptedPrivateKey); } catch { encrypted = keyData.encryptedPrivateKey; }
    const kit = {
      format: "hackmywebsite-ai-report-key",
      version: 1,
      keyId: keyData.keyId,
      publicKeySpki: keyData.publicKeySpki,
      encryptedPrivateKey: encrypted,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: keyData.kdfIters,
        salt: keyData.kdfSalt,
      },
      createdAt: keyData.createdAt,
      warning: "This file does not contain your passphrase. Without your passphrase this key cannot decrypt reports. Store the passphrase separately.",
    };
    const blob = new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hackmywebsite-report-key-${keyData.keyId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (done) {
    return (
      <div className="rounded-[2px] border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-start gap-3">
          <Icon name="key" size={22} className="mt-0.5 text-emerald-700" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-emerald-900">Report key is ready</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              Final reports for this account are encrypted to this key. Keep your passphrase safe. We cannot recover it.
            </p>
            {savedKeyId ? <p className="mt-3 font-mono text-[11px] text-emerald-700">key id {savedKeyId}</p> : null}
            {keyData ? (
              <button
                type="button"
                onClick={downloadRecoveryKit}
                className="mt-4 inline-flex items-center gap-2 rounded-[2px] border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:border-emerald-500"
              >
                <Icon name="download" size={15} />
                Download recovery kit
              </button>
            ) : null}
            <p className="mt-3 max-w-lg text-xs leading-5 text-emerald-800">
              The recovery kit contains the encrypted private key and key metadata. It does not contain your passphrase. Store both separately.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[2px] border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Create your report passphrase</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
        The browser generates a key pair. The private key is encrypted with your passphrase before it leaves this device.
        The server can store the encrypted key, but it cannot open a report.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Passphrase</span>
          <input
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            className="mt-1.5 w-full rounded-[2px] border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-700"
            placeholder="At least 12 characters"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Repeat passphrase</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-1.5 w-full rounded-[2px] border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-700"
            placeholder="Same passphrase"
          />
        </label>
      </div>
      <div className="mt-4 rounded-[2px] border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        There is no passphrase reset. If you lose it, old reports cannot be decrypted. Store it in your password manager and download a recovery kit when it becomes available.
      </div>
      {error ? <p className="mt-4 rounded-[2px] border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <button
        type="button"
        onClick={() => void createKey()}
        disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:bg-slate-400"
      >
        <Icon name={busy ? "hourglass_top" : "lock"} size={17} />
        {busy ? "Generating key..." : "Create report key"}
      </button>
    </div>
  );
}

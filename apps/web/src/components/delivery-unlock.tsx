"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

type UnlockResponse = {
  report: { host: string; createdAt: string };
  envelope: {
    version: number;
    alg: string;
    keyAlg: string;
    wrappedKey: string;
    iv: string;
    tag: string;
    filename: string;
    contentType: string;
    plaintextSha256: string;
  };
  ciphertext: string;
  key: {
    publicKeySpki: string;
    encryptedPrivateKey: string;
    kdfSalt: string;
    kdfIters: number;
  };
  delivery: { expiresAt: string; downloads: number; maxDownloads: number };
};

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function decryptReport(data: UnlockResponse, passphrase: string) {
  if (!window.crypto?.subtle) throw new Error("This browser does not support WebCrypto.");
  const encryptedKey = JSON.parse(data.key.encryptedPrivateKey) as { iv: string; ciphertext: string };
  if (!encryptedKey.iv || !encryptedKey.ciphertext) throw new Error("The report key is malformed.");

  const material = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(data.key.kdfSalt),
      iterations: data.key.kdfIters,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(encryptedKey.iv) },
      aesKey,
      fromBase64(encryptedKey.ciphertext),
    );
  } catch {
    throw new Error("Wrong passphrase. The report was not decrypted.");
  }

  const privateKey = await window.crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const fileKeyRaw = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    fromBase64(data.envelope.wrappedKey),
  );
  const fileKey = await window.crypto.subtle.importKey(
    "raw",
    fileKeyRaw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const ciphertext = fromBase64(data.ciphertext);
  const tag = fromBase64(data.envelope.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  const plain = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(data.envelope.iv), tagLength: 128 },
    fileKey,
    combined,
  );
  const digest = toHex(await window.crypto.subtle.digest("SHA-256", plain));
  if (data.envelope.plaintextSha256 && digest !== data.envelope.plaintextSha256) {
    throw new Error("The report integrity check failed. The bundle may be damaged.");
  }
  return {
    html: new TextDecoder().decode(plain),
    filename: data.envelope.filename || "hackmywebsite-report.html",
    host: data.report.host,
    createdAt: data.report.createdAt,
    expiresAt: data.delivery.expiresAt,
    downloads: data.delivery.downloads,
    maxDownloads: data.delivery.maxDownloads,
  };
}

export function DeliveryUnlock({ token, devCode }: { token: string; devCode?: string }) {
  const [code, setCode] = useState(devCode || "");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    html: string;
    filename: string;
    host: string;
    createdAt: string;
    expiresAt: string;
    downloads: number;
    maxDownloads: number;
  }>(null);

  async function unlock() {
    setError(null);
    if (!code.trim()) {
      setError("Enter the 48-hour delivery code.");
      return;
    }
    if (!passphrase) {
      setError("Enter your report passphrase.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/delivery/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<UnlockResponse> & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not open this delivery link.");
      setResult(await decryptReport(data as UnlockResponse, passphrase));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decrypt the report.");
    } finally {
      setBusy(false);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function download() {
    if (!result) return;
    downloadBlob(new Blob([result.html], { type: "text/html;charset=utf-8" }), result.filename);
  }

  async function downloadZip() {
    if (!result) return;
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const base = result.filename.replace(/\.html?$/i, "") || "hackmywebsite-report";
    zip.file(`${base}.html`, result.html);
    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          format: "hackmywebsite-sealed-report",
          version: 1,
          host: result.host,
          createdAt: result.createdAt,
          downloadedAt: new Date().toISOString(),
          expiresAt: result.expiresAt,
          note: "Decrypted locally in the customer browser. The server stores only ciphertext.",
        },
        null,
        2,
      ),
    );
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    downloadBlob(blob, `${base}.zip`);
  }

  function printPdf() {
    if (!result) return;
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      setError("Allow popups to print or save the report as PDF.");
      return;
    }
    reportWindow.opener = null;
    reportWindow.document.open();
    reportWindow.document.write(result.html);
    reportWindow.document.close();
    reportWindow.setTimeout(() => {
      reportWindow.focus();
      reportWindow.print();
    }, 350);
  }

  if (result) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-3">
            <Icon name="lock_open" size={20} className="text-emerald-700" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Report decrypted for {result.host}</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                {result.downloads} of {result.maxDownloads} downloads used. Code expires {new Date(result.expiresAt).toLocaleString("en-GB")}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-[2px] bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
              <Icon name="download" size={16} />
              HTML
            </button>
            <button type="button" onClick={() => void downloadZip()} className="inline-flex items-center gap-2 rounded-[2px] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-500">
              <Icon name="folder_zip" size={16} />
              ZIP
            </button>
            <button type="button" onClick={printPdf} className="inline-flex items-center gap-2 rounded-[2px] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-500">
              <Icon name="picture_as_pdf" size={16} />
              Print / PDF
            </button>
          </div>
        </div>
        <iframe
          title={`Sealed report for ${result.host}`}
          sandbox=""
          srcDoc={result.html}
          className="mt-5 h-[70vh] w-full rounded-[2px] border border-slate-200 bg-white"
        />
      </div>
    );
  }

  return (
    <div className="rounded-[2px] border border-slate-200 bg-white p-6">
      {devCode ? (
        <div className="mb-5 rounded-[2px] border border-amber-200 bg-amber-50 p-3 font-mono text-[11px] text-amber-800">
          Local delivery code: {devCode}
        </div>
      ) : null}
      <label className="block">
        <span className="text-xs font-medium text-slate-700">48-hour delivery code</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          className="mt-1.5 w-full rounded-[2px] border border-slate-300 px-3 py-2.5 font-mono text-sm uppercase tracking-[0.08em] outline-none focus:border-blue-700"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-slate-700">Report passphrase</span>
        <input
          type="password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          autoComplete="current-password"
          placeholder="Your report passphrase"
          className="mt-1.5 w-full rounded-[2px] border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-700"
        />
      </label>
      {error ? <p className="mt-4 rounded-[2px] border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <button
        type="button"
        onClick={() => void unlock()}
        disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-wait disabled:bg-slate-400"
      >
        <Icon name={busy ? "hourglass_top" : "lock_open"} size={17} />
        {busy ? "Decrypting..." : "Open sealed report"}
      </button>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Decryption happens in this browser. Your passphrase is never sent to the server.
      </p>
    </div>
  );
}

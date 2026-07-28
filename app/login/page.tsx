"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "הכניסה נכשלה");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1>כניסה</h1>
        <input
          className="field"
          type="password"
          inputMode="text"
          placeholder="סיסמה"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
        <div className="error">{error}</div>
        <button className="btn primary" onClick={submit} disabled={busy}>
          {busy ? "רגע..." : "היכנס"}
        </button>
      </div>
    </div>
  );
}

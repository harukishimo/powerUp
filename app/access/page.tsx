"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AccessPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setError("アクセスコードが正しくありません。");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("通信できませんでした。時間をおいて再試行してください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="access-page">
      <section className="access-card">
        <div className="brand-mark large">p<span>U</span></div>
        <p className="eyebrow">PRIVATE SPACE</p>
        <h1>powerUpへアクセス</h1>
        <p>個人のコンディションログを守るため、アクセスコードを入力してください。</p>
        <form onSubmit={submit}>
          <label htmlFor="access-token">アクセスコード</label>
          <input id="access-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoFocus />
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button full-button" type="submit" disabled={loading || !token}>
            {loading ? "確認中…" : "入室する"}
          </button>
        </form>
      </section>
    </main>
  );
}

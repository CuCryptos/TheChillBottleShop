"use client";

import { useState } from "react";
import { AGE_COOKIE } from "@/lib/age";

export function AgeGate() {
  const [answer, setAnswer] = useState<"ask" | "yes" | "no">("ask");
  if (answer === "yes") return null;

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-card">
        <p className="wordmark wordmark-dark">The Chill Bottle Shop</p>
        {answer === "ask" ? (
          <>
            <h2 id="gate-title">Are you 21 or older?</h2>
            <p>You must be of legal drinking age to visit this site.</p>
            <div className="gate-actions">
              <button className="button" autoFocus onClick={() => {
                document.cookie = `${AGE_COOKIE}=1; max-age=${60 * 60 * 24 * 30}; path=/; samesite=lax`;
                setAnswer("yes");
              }}>
                Yes, I&apos;m 21+
              </button>
              <button className="button button-ghost" onClick={() => setAnswer("no")}>No</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="gate-title">Come back when you&apos;re 21.</h2>
            <p>We&apos;ll keep it cold for you.</p>
          </>
        )}
      </div>
    </div>
  );
}

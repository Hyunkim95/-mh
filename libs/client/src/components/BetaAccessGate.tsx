import React, { useState, useEffect } from "react";

const BETA_PASSWORD = "enigma2025";
export const BETA_ACCESS_STORAGE_KEY = "mh_beta_v2";

interface BetaAccessGateProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BetaAccessGate: React.FC<BetaAccessGateProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setError(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === BETA_PASSWORD) {
      localStorage.setItem(BETA_ACCESS_STORAGE_KEY, "true");
      onSuccess();
    } else {
      setError(true);
      setPassword("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-4 p-6 sm:p-8 bg-black rounded-2xl border border-mh-yellow/30"
        style={{
          boxShadow:
            "0 0 15px rgba(251, 255, 105, 0.15), 0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-mh-yellow/40 hover:text-mh-yellow transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Beta badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-mh-yellow/10 border border-mh-yellow/30 rounded-full">
            <div className="w-2 h-2 bg-mh-yellow rounded-full animate-pulse" />
            <span className="text-mh-yellow text-sm font-medium">
              Beta Access
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-medium text-mh-yellow text-center mb-3">
          Private Beta Testing
        </h2>

        {/* Description */}
        <p className="text-mh-yellow/60 text-sm sm:text-base text-center mb-6 leading-relaxed">
          We are currently in beta testing and bug fixing. To get access,
          contact{" "}
          <a
            href="https://t.me/enigmafund"
            target="_blank"
            rel="noopener noreferrer"
            className="text-mh-yellow hover:underline"
          >
            @enigmafund
          </a>{" "}
          on Telegram or{" "}
          <a
            href="https://x.com/enigmafund"
            target="_blank"
            rel="noopener noreferrer"
            className="text-mh-yellow hover:underline"
          >
            X
          </a>
          .
        </p>

        {/* Password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-mh-yellow/60 text-sm mb-2">
              Access Code
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="Enter your access code"
              className={`w-full px-4 py-3 bg-black/50 border rounded-xl text-mh-yellow placeholder-mh-yellow/30 focus:outline-none transition-colors ${
                error
                  ? "border-red-500 focus:border-red-500"
                  : "border-mh-yellow/20 focus:border-mh-yellow/50"
              }`}
              autoFocus
            />
            {error && (
              <p className="text-red-400 text-sm mt-2">
                Invalid access code. Please try again.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-mh-yellow text-black font-semibold rounded-xl hover:brightness-110 transition-all"
          >
            Enter Beta
          </button>
        </form>

        {/* Social links */}
        <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t border-mh-yellow/10">
          <a
            href="https://t.me/enigmafund"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-mh-yellow/50 hover:text-mh-yellow transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.442-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.333-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.12.098.153.228.166.331.014.103.031.336.018.52z" />
            </svg>
            Telegram
          </a>
          <a
            href="https://x.com/enigmafund"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-mh-yellow/50 hover:text-mh-yellow transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X / Twitter
          </a>
        </div>
      </div>
    </div>
  );
};

export const isBetaUnlocked = (): boolean => {
  return localStorage.getItem(BETA_ACCESS_STORAGE_KEY) === "true";
};

export default BetaAccessGate;

import React from "react";

const STORAGE_KEY = "multihopper_beta_access";

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
  const handleUnderstand = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onSuccess();
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
        className="relative w-full max-w-md mx-4 p-6 sm:p-8 bg-[#1D2022] rounded-2xl border border-white/10"
        style={{
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
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
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBFF69]/10 border border-[#FBFF69]/30 rounded-full">
            <div className="w-2 h-2 bg-[#FBFF69] rounded-full animate-pulse" />
            <span className="text-[#FBFF69] text-sm font-medium">
              Beta Access
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-medium text-white text-center mb-3">
          Welcome to the Beta
        </h2>

        {/* Beta welcome message */}
        <p className="text-white/60 text-sm sm:text-base text-center mb-8 leading-relaxed">
          Welcome to the MultiHopper beta. It does not completely remove
          traceability YET. It makes your actions abstracted from the casual
          observer and tools like BubbleMaps.
        </p>

        {/* I UNDERSTAND button */}
        <button
          onClick={handleUnderstand}
          className="w-full py-3 bg-[#FBFF69] text-black font-semibold rounded-xl hover:brightness-110 transition-all"
        >
          I UNDERSTAND
        </button>
      </div>
    </div>
  );
};

export const isBetaUnlocked = (): boolean => {
  return localStorage.getItem(STORAGE_KEY) === "true";
};

export default BetaAccessGate;

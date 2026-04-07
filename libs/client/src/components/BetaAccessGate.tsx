import React, { useEffect } from "react";
import LogoIcon from "../assets/navbar/logo.svg";
import { router } from "../router";

interface BetaAccessGateProps {
  isOpen: boolean;
  onClose: () => void;
}

const BETA_GATE_BYPASS_KEY = "betaGateBypass";

const progressDots = Array.from({ length: 5 });

export const BetaAccessGate: React.FC<BetaAccessGateProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        try {
          window.sessionStorage.setItem(BETA_GATE_BYPASS_KEY, "true");
        } catch {
          // sessionStorage may be unavailable; ignore
        }
        onClose();
        router.navigate({ to: "/login" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#161616]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="routing-upgrade-title"
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        aria-hidden="true"
        data-testid="routing-upgrade-backdrop"
      />

      <div
        className="relative min-h-[100dvh] w-full overflow-hidden bg-[#161616]"
        style={{
          background:
            "linear-gradient(180deg, #fbff69 0%, #fbff69 31%, rgba(251,255,105,0.88) 46%, rgba(251,255,105,0.34) 58%, rgba(34,34,29,0.92) 78%, #161616 100%)",
        }}
      >
        <div className="absolute inset-x-0 top-[10%] h-[260px] bg-[radial-gradient(circle_at_center,rgba(255,255,200,0.45)_0%,rgba(255,255,200,0.16)_38%,rgba(255,255,200,0)_72%)] blur-3xl sm:h-[320px]" />
        <div className="absolute inset-x-0 top-[35%] h-[240px] bg-[radial-gradient(circle_at_center,rgba(251,255,105,0.2)_0%,rgba(251,255,105,0.08)_45%,rgba(251,255,105,0)_78%)] blur-3xl sm:h-[280px]" />
        <div className="absolute inset-x-0 bottom-0 h-[340px] bg-gradient-to-t from-[#161616] via-[#161616]/95 to-transparent" />

        <div className="relative flex min-h-[100dvh] w-full cursor-pointer flex-col items-center px-5 pt-[9vh] pb-8 text-center sm:px-10 sm:pt-[8vh] lg:px-16">
          <div className="relative flex w-full max-w-[1400px] flex-1 flex-col items-center">
            <div className="inline-flex items-center gap-2.5 rounded-[4px] bg-[#111111] px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.28)] sm:gap-3 sm:px-6 sm:py-4">
              <img
                src={LogoIcon}
                alt="MultiHopper"
                className="h-6 w-auto sm:h-7"
              />
              <span
                className="text-base font-medium text-white sm:text-[1.75rem]"
                style={{ fontFamily: "Rowdies" }}
              >
                MultiHopper
              </span>
            </div>

            <div className="relative mt-16 w-full max-w-[1240px] px-2 sm:mt-20 sm:px-0 lg:mt-24">
              <div className="absolute left-1/2 top-[58%] h-[220px] w-[min(100vw,980px)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(251,255,105,0.22)_0%,rgba(251,255,105,0.1)_46%,rgba(251,255,105,0)_76%)] blur-3xl sm:h-[260px]" />
              <h2
                id="routing-upgrade-title"
                className="relative text-[2.2rem] font-semibold leading-[0.94] tracking-[-0.06em] text-[#000000] sm:text-[4rem] lg:text-[5.75rem]"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Routing upgrade in process
              </h2>
              <p
                className="relative mt-3 text-[1.5rem] font-normal leading-[0.98] tracking-[-0.05em] text-[#000000] sm:text-[2.8rem] lg:text-[3.9rem]"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Services resuming shortly...
              </p>
            </div>

            <div className="relative mt-auto flex w-full justify-center px-4 pb-3 sm:px-6 sm:pb-5">
              <div className="relative w-full max-w-[790px]">
                <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#d9da7d]/75" />
                <div className="relative flex items-center justify-between">
                  {progressDots.map((_, index) => (
                    <div
                      key={index}
                      className="flex h-12 w-12 items-center justify-center"
                    >
                      <div
                        data-testid="routing-upgrade-dot"
                        className={`h-5 w-5 rounded-full border sm:h-7 sm:w-7 ${
                          index < 3
                            ? "border-[#fff7a8] bg-[#fff328] shadow-[0_0_18px_rgba(255,243,40,0.78),0_0_34px_rgba(255,243,40,0.42)]"
                            : "border-[#f2edb4] bg-[#efeab5]"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const isBetaGateEnabled = (): boolean => {
  if (import.meta.env.VITE_BETA_GATE_ENABLED !== "true") {
    return false;
  }
  try {
    if (
      typeof window !== "undefined" &&
      window.sessionStorage?.getItem(BETA_GATE_BYPASS_KEY) === "true"
    ) {
      return false;
    }
  } catch {
    // sessionStorage may be unavailable; fall through
  }
  return true;
};

export default BetaAccessGate;

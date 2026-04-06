import React, { useEffect } from "react";
import LogoIcon from "../assets/navbar/logo.svg";

export const BETA_ACCESS_STORAGE_KEY = "mh_routing_upgrade_bypass_v1";

interface BetaAccessGateProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const progressDots = [true, true, true, false, false];

export const BetaAccessGate: React.FC<BetaAccessGateProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
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
    >
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
        data-testid="routing-upgrade-backdrop"
      />

      <div className="relative flex min-h-[100dvh] items-stretch justify-center overflow-hidden px-0 py-0 sm:min-h-screen sm:px-8 sm:py-6">
        <div
          className="relative flex min-h-[100dvh] w-full max-w-[1150px] flex-col items-center justify-center gap-16 overflow-hidden bg-[#161616] px-5 py-8 text-center sm:min-h-[760px] sm:justify-between sm:gap-0 sm:rounded-[32px] sm:px-12 sm:py-14"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(251,255,105,1)_0%,rgba(251,255,105,0.98)_18%,rgba(251,255,105,0.78)_38%,rgba(251,255,105,0.26)_58%,rgba(22,22,22,0.95)_82%,#161616_100%)]" />
          <div className="absolute inset-x-0 top-[12%] h-[180px] bg-[radial-gradient(circle_at_center,rgba(251,255,105,0.52)_0%,rgba(251,255,105,0.18)_48%,rgba(251,255,105,0)_75%)] blur-3xl sm:top-[18%] sm:h-[220px]" />
          <div className="absolute inset-x-0 bottom-0 h-[220px] bg-gradient-to-t from-[#161616] via-[#161616]/94 to-transparent sm:h-[240px]" />

          <div className="relative flex flex-1 flex-col items-center justify-center">
            <div className="inline-flex items-center gap-2.5 rounded-[10px] bg-[#111111] px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.28)] sm:gap-3 sm:px-5 sm:py-3">
              <img
                src={LogoIcon}
                alt="MultiHopper"
                className="h-6 w-auto sm:h-8"
              />
              <span
                className="text-base font-medium text-white sm:text-[1.75rem]"
                style={{ fontFamily: "Rowdies" }}
              >
                MultiHopper
              </span>
            </div>

            <div className="mt-14 max-w-[920px] px-2 sm:mt-20 sm:px-0">
              <div className="absolute left-1/2 top-[44%] h-[140px] w-[min(110vw,700px)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(251,255,105,0.4)_0%,rgba(251,255,105,0.12)_42%,rgba(251,255,105,0)_72%)] blur-3xl sm:top-[46%] sm:h-[180px] sm:w-[700px]" />
              <h2
                id="routing-upgrade-title"
                className="relative text-[2.1rem] font-semibold leading-[0.94] tracking-[-0.06em] text-black sm:text-[3.5rem] lg:text-[4.75rem]"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Routing upgrade in process
              </h2>
              <p
                className="relative mt-3 text-[1.45rem] font-normal leading-[0.96] tracking-[-0.05em] text-black/92 sm:text-[2.4rem] lg:text-[3.35rem]"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Services resuming shortly...
              </p>
            </div>
          </div>

          <div className="relative mb-2 w-full max-w-[900px] px-4 sm:mb-6 sm:px-8">
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#f3ef9d]/60" />
            <div className="relative flex items-center justify-between gap-3 sm:gap-4">
              {progressDots.map((isActive, index) => (
                <div
                  key={index}
                  data-testid="routing-upgrade-dot"
                  className={`relative h-5 w-5 rounded-full border sm:h-7 sm:w-7 ${
                    isActive
                      ? "border-[#fff65b] bg-[#fff328] shadow-[0_0_24px_rgba(251,255,105,0.95)]"
                      : "border-[#f2edb4] bg-[#efeab5]"
                  }`}
                >
                  {isActive ? (
                    <div className="absolute inset-[-6px] rounded-full bg-[#fbff69]/55 blur-md sm:inset-[-8px]" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const isBetaUnlocked = (): boolean => {
  return localStorage.getItem(BETA_ACCESS_STORAGE_KEY) === "true";
};

export default BetaAccessGate;

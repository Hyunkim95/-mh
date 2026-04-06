import React, { useEffect } from "react";
import LogoIcon from "../assets/navbar/logo.svg";

export const BETA_ACCESS_STORAGE_KEY = "mh_routing_upgrade_bypass_v1";

interface BetaAccessGateProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const progressDots = Array.from({ length: 5 });

export const BetaAccessGate: React.FC<BetaAccessGateProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const handleDismiss = () => {
    localStorage.setItem(BETA_ACCESS_STORAGE_KEY, "true");
    onSuccess();
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleDismiss();
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
      onClick={handleDismiss}
    >
      <div
        className="absolute inset-0"
        aria-hidden="true"
        data-testid="routing-upgrade-backdrop"
      />

      <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#161616]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_6%,rgba(251,255,105,1)_0%,rgba(251,255,105,0.98)_18%,rgba(251,255,105,0.82)_36%,rgba(251,255,105,0.28)_56%,rgba(22,22,22,0.92)_80%,#161616_100%)]" />
        <div className="absolute inset-x-0 top-[6%] h-[240px] bg-[radial-gradient(circle_at_center,rgba(251,255,105,0.58)_0%,rgba(251,255,105,0.2)_48%,rgba(251,255,105,0)_75%)] blur-3xl sm:h-[280px]" />
        <div className="absolute inset-x-0 bottom-0 h-[280px] bg-gradient-to-t from-[#161616] via-[#161616]/92 to-transparent" />

        <div className="relative flex min-h-[100dvh] w-full flex-col items-center px-5 pt-[7vh] pb-8 text-center sm:px-10 sm:pt-[6vh] lg:px-16">
          <div className="relative flex w-full max-w-[1400px] flex-1 flex-col items-center">
            <div className="inline-flex items-center gap-2.5 rounded-[12px] bg-[#111111] px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.3)] sm:gap-3 sm:px-6 sm:py-4">
              <img
                src={LogoIcon}
                alt="MultiHopper"
                className="h-6 w-auto sm:h-8"
              />
              <span
                className="text-base font-medium text-white sm:text-[1.85rem]"
                style={{ fontFamily: "Rowdies" }}
              >
                MultiHopper
              </span>
            </div>

            <div className="relative mt-12 w-full max-w-[1240px] px-2 sm:mt-16 sm:px-0 lg:mt-20">
              <div className="absolute left-1/2 top-[52%] h-[180px] w-[min(100vw,860px)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(251,255,105,0.42)_0%,rgba(251,255,105,0.15)_42%,rgba(251,255,105,0)_74%)] blur-3xl sm:h-[240px] lg:w-[980px]" />
              <h2
                id="routing-upgrade-title"
                className="relative text-[2.15rem] font-semibold leading-[0.92] tracking-[-0.065em] text-[#000000] sm:text-[3.9rem] lg:text-[6rem]"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Routing upgrade in process
              </h2>
              <p
                className="relative mt-3 text-[1.48rem] font-normal leading-[0.96] tracking-[-0.055em] text-[#000000] sm:text-[2.8rem] lg:text-[4rem]"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Services resuming shortly...
              </p>
            </div>

            <div className="relative mt-auto w-full max-w-[1500px] px-2 pb-2 sm:px-6 sm:pb-4">
              <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#f3ef9d]/60" />
              <div className="relative flex justify-center">
                <div className="flex items-center gap-3 bg-[#161616] px-4 sm:gap-4 sm:px-6">
                  {progressDots.map((_, index) => (
                  <div
                    key={index}
                    data-testid="routing-upgrade-dot"
                    className="h-5 w-5 rounded-full border border-[#f2edb4] bg-[#efeab5] sm:h-7 sm:w-7"
                  >
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

export const isBetaUnlocked = (): boolean => {
  return localStorage.getItem(BETA_ACCESS_STORAGE_KEY) === "true";
};

export default BetaAccessGate;

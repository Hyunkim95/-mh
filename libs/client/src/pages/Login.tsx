import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../components/Card";
import { NavBar } from "../components/NavBar";
import { useSolanaAuth } from "../hooks/useSolanaAuth";
import { router } from "../router";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { ReactComponent as CheckIcon } from "../../assets/icons/check-icon.svg";
import Logo from "../assets/navbar/logo.svg";
import { BetaAccessGate, isBetaUnlocked } from "../components/BetaAccessGate";

export const Login: React.FC = () => {
  const {
    wallets,
    wallet: currentWallet,
    select,
    connect,
    publicKey,
    connecting,
    connected,
  } = useWallet();
  const {
    authenticate,
    userData,
    isPending,
    isLoading,
    isVerifyUserWithSignaturePending,
    isWaitingForSignature,
  } = useSolanaAuth();
  const initialBetaAccess = isBetaUnlocked();
  const [hasBetaAccess, setHasBetaAccess] = useState(initialBetaAccess);
  const [showBetaGate, setShowBetaGate] = useState(false);
  const [pendingWalletName, setPendingWalletName] = useState<WalletName | null>(null);

  // Navigate when authenticated
  useEffect(() => {
    if (hasBetaAccess && userData && publicKey) {
      router.navigate({ to: "/my-assets" });
    }
  }, [hasBetaAccess, userData, publicKey]);

  const desiredWallets = useMemo(() => {
    const allowedWallets = ['phantom', 'backpack', 'magic eden'];
    if (import.meta.env.VITE_TEST_WALLET === 'true') {
      allowedWallets.push('test wallet');
    }
    return wallets
      .filter((w) => allowedWallets.some((name) => w.adapter.name.toLowerCase().includes(name)))
      .map((w) => ({
        label: w.adapter.name,
        wallet: w,
      }));
  }, [wallets]);

  const shortAddress = (addr?: string) =>
    addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "";

  const handleSelectWallet = async (name: WalletName | undefined) => {
    if (!name) return;
    if (!hasBetaAccess) {
      setPendingWalletName(name);
      setShowBetaGate(true);
      return;
    }
    try {
      select(name);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      await connect();
    } catch {
      // Intentionally swallow to keep UI calm; adapter handles toasts
    }
  };

  const handleBetaSuccess = async () => {
    setHasBetaAccess(true);
    setShowBetaGate(false);
    if (pendingWalletName) {
      try {
        select(pendingWalletName);
        await connect();
      } catch {
        // Intentionally swallow
      }
      setPendingWalletName(null);
    }
  };

  const handleBetaClose = () => {
    setShowBetaGate(false);
    setPendingWalletName(null);
    if (!hasBetaAccess) {
      router.navigate({ to: "/" });
    }
  };

  const isSelectedTile = (label: string) => {
    return currentWallet?.adapter?.name
      ?.toLowerCase()
      .includes(label.toLowerCase());
  };

  const loginCardBody = (
    <div className="flex flex-col h-full md:gap-8">
      <div className="text-center mb-12 md:mb-0">
        <h2 className="not-italic font-medium text-xl md:text-2xl md:leading-7 text-center mb-2">
          Connect Wallet
        </h2>
        <p className="not-italic font-light text-sm md:text-base leading-4 text-center text-[var(--white-100)]">
          Select the wallet you’d like to connect
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {desiredWallets.map(({ label, wallet }, i) => {
          const selected = isSelectedTile(label) && !!publicKey;
          const disabled = !wallet;
          const icon = wallet?.adapter?.icon;
          const address =
            selected && publicKey ? shortAddress(publicKey.toString()) : "";

          return (
            <button
              key={`${label}-${i}`}
              type="button"
              data-testid={`wallet-tile-${label.toLowerCase().replace(/\s+/g, '-')}`}
              disabled={disabled || connecting}
              onClick={() => handleSelectWallet(wallet?.adapter?.name)}
              className={`w-full rounded-3xl px-5  py-5 md:py-4 flex items-center gap-4 border border-[var(--dark-charcoal-500-transparency-58)] transition ${
                selected
                  ? "bg-[var(--chinese-black-800)] border-[var(--chinese-black-800))]"
                  : "bg-[var(--dark-gunmetal-500)] hover:bg-[var(--chinese-black-800)] hover:border-[var(--chinese-black-800))]"
              } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
              style={{
                boxShadow: "inset 0px 1px 0px var(--white-100-transparency-08)",
              }}
            >
              <div className="h-14 w-14 rounded-full md:h-12 md:w-12 flex items-center justify-center overflow-hidden">
                <img
                  src={icon}
                  alt={`${label}-icon`}
                  className="h-full w-full object-contain"
                />
              </div>

              <div className="flex-1 text-left">
                <div className="flex flex-row items-center justify-between w-full">
                  <div className="not-italic font-medium text-sm leading-4 text-[var(--white-100)]">
                    {label}
                  </div>
                  {selected ? (
                    <div className="h-3 w-3 flex items-center justify-start">
                      <CheckIcon className="h-full w-full object-contain" />
                    </div>
                  ) : null}
                </div>
                {address ? (
                  <div className="not-italic font-light text-sm leading-4 text-[var(--white-100)] mt-2">
                    {address}
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const loginCardFooter = (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
      <div className="not-italic font-light text-xs leading-4 text-[var(--white-100-transparency-58)] w-[210px]">
        By connecting your wallet, you agree to Multihopper’s{" "}
        <a
          href="https://www.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--laser-lemon-500)] hover:underline"
        >
          Terms
        </a>{" "}
        <span className="text-[var(--laser-lemon-500)]">& </span>
        <a
          href="https://www.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--laser-lemon-500)] hover:underline"
        >
          Privacy Policy
        </a>
      </div>
      <button
        type="button"
        data-testid="sign-message-btn"
        onClick={() => {
          authenticate();
        }}
        disabled={
          !connected ||
          !publicKey ||
          isPending ||
          isVerifyUserWithSignaturePending ||
          isWaitingForSignature
        }
        className={`flex items-center justify-center rounded-3xl text-[var(--black-900)] not-italic font-semibold text-base leading-5 text-center px-6 py-3 w-56 transition -order-1 sm:order-1 ${
          connected &&
          publicKey &&
          !isPending &&
          !isVerifyUserWithSignaturePending &&
          !isWaitingForSignature
            ? "bg-[var(--laser-lemon-500)] hover:brightness-95"
            : "bg-[var(--laser-lemon-500-transparency-30)] cursor-not-allowed"
        }`}
      >
        {isPending
          ? "Preparing..."
          : isWaitingForSignature
          ? "Sign in Wallet"
          : isVerifyUserWithSignaturePending
          ? "Verifying..."
          : connected
          ? "Sign Message"
          : "Connect Wallet"}
      </button>
      {(isPending || isVerifyUserWithSignaturePending || isWaitingForSignature) && (
        <div className="w-full text-center text-sm text-[var(--white-100-transparency-58)] sm:hidden">
          {isWaitingForSignature
            ? "Check your wallet to continue."
            : isVerifyUserWithSignaturePending
            ? "Verifying your signature..."
            : "Preparing sign-in..."}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen text-[var(--white-100)] flex flex-col items-center gap-10 w-full relative py-12 sm:py-0">
      <div className="min-h-screen flex w-full fixed">
        <div className="app-gradient-bg">
          <div className="ellipse-bg-one" />
          <div className="ellipse-bg-two" />
        </div>
      </div>
      <div className="hidden sm:block w-full">
        <NavBar />
      </div>
      <div className="flex sm:hidden">
        <img src={Logo} className="relative w-[auto] h-[31px] object-contain" />
      </div>
      <BetaAccessGate
        isOpen={showBetaGate && !hasBetaAccess}
        onClose={handleBetaClose}
        onSuccess={handleBetaSuccess}
      />
      {hasBetaAccess ? (
        <Card
          cardClasses={{
            mainCardContainer:
              "sm:!w-[90%] md:!w-full px-14 py-0 md:px-20 md:pt-20 md:pb-16",
            cardBodyContainer: "flex flex-col justify-center",
          }}
          cardBody={loginCardBody}
          cardFooter={loginCardFooter}
          cardHeight={"617px"}
          cardStyle={{
            background:
              'linear-gradient(#1F2224, #1F2224) padding-box, linear-gradient(0deg, rgba(255,255,255,0) 23%, rgba(255,255,255,0.5) 49%, rgba(255,255,255,0) 75%) border-box',
            border: '1px solid transparent',
          }}
        />
      ) : null}
    </div>
  );
};

export default Login;

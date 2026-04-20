import React, { useState } from "react";
import { router } from "../router";
import { useWallet } from "@solana/wallet-adapter-react";
import { BetaAccessGate, isBetaGateEnabled } from "../components/BetaAccessGate";

// Import SVG assets
import LogoIcon from "../assets/landing/logo-icon.svg";
import TagStars from "../assets/landing/tag-stars.svg";
import PrivacyIcon from "../assets/landing/privacy-icon.svg";
import MotionIcon from "../assets/landing/motion-icon.svg";
import CollaborateIcon from "../assets/landing/collaborate-icon.svg";
import LtsBunnyIcon from "../assets/landing/lts-bunny-icon.svg";
import FooterEmailArrow from "../assets/landing/footer-email-arrow.svg";
import CheckmarkIcon from "../assets/landing/checkmark-icon.svg";
import TumbellingIcon from "../../assets/icons/tumbelling.svg";
import ControlIcon from "../../assets/icons/control.svg";

export const LandingPage: React.FC = () => {
  const { connected } = useWallet();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    company: "",
    xHandle: "",
    tgHandle: "",
    reason: "",
    newsletterEmail: "",
  });

  const [showBetaGate, setShowBetaGate] = useState(false);

  const handleConnectWallet = () => {
    if (isBetaGateEnabled()) {
      setShowBetaGate(true);
      return;
    }
    router.navigate({ to: "/login" });
  };

  const [formStatus, setFormStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  // Formspree form ID
  const FORMSPREE_FORM_ID = "mgoollwj";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus("submitting");

    try {
      const response = await fetch(`https://formspree.io/f/${FORMSPREE_FORM_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          company: formData.company,
          xHandle: formData.xHandle,
          tgHandle: formData.tgHandle,
          reason: formData.reason,
        }),
      });

      if (response.ok) {
        setFormStatus("success");
        setFormData({
          ...formData,
          fullName: "",
          email: "",
          company: "",
          xHandle: "",
          tgHandle: "",
          reason: "",
        });
      } else {
        setFormStatus("error");
      }
    } catch {
      setFormStatus("error");
    }
  };

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterStatus("submitting");

    try {
      const response = await fetch(`https://formspree.io/f/${FORMSPREE_FORM_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.newsletterEmail,
          type: "newsletter",
        }),
      });

      if (response.ok) {
        setNewsletterStatus("success");
        setFormData({ ...formData, newsletterEmail: "" });
      } else {
        setNewsletterStatus("error");
      }
    } catch {
      setNewsletterStatus("error");
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const faqs = [
    {
      question: "Why are we building the multihopper?",
      answer:
        "While we are advocates of privacy, inherently we are concerned that mixers may be perceived by regulators to be performing a potential laundering function, and most of them are limited to a $100,000 maximum. Private blockchains are complex and most of them get into trouble for going off-chain.",
    },
    {
      question: "How does MultiHopper work?",
      answer:
        "Our mission is to provide privacy-preserving onchain transfers that remain fully compliant and transparent.",
    },
    {
      question: "Our Roadmap",
      answer:
        "We are continuously expanding our features and supported networks. Stay tuned for updates.",
    },
  ];

  return (
    <div
      className="min-h-screen text-white font-roboto overflow-x-hidden relative"
      style={{
        backgroundImage: `url(/grid.png), linear-gradient(to bottom right, rgba(24, 27, 29, 0.95), rgba(18, 20, 22, 0.95), rgba(13, 15, 16, 0.95))`,
        backgroundRepeat: "repeat, no-repeat",
        backgroundSize: "auto, cover",
      }}
    >
      <BetaAccessGate
        isOpen={showBetaGate}
        onClose={() => setShowBetaGate(false)}
      />

      {/* Left and Right background images - Hidden on mobile */}
      <div className="hidden lg:block absolute top-64 left-0 w-auto h-auto pointer-events-none z-0">
        <div
          style={{
            backgroundImage: "url(/left_bg.png)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
            backgroundPosition: "top left",
            width: "400px",
            height: "500px",
          }}
        />
      </div>

      <div className="hidden lg:block absolute top-64 right-0 w-auto h-auto pointer-events-none z-0">
        <div
          style={{
            backgroundImage: "url(/right_bg.png)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
            backgroundPosition: "top right",
            width: "400px",
            height: "500px",
          }}
        />
      </div>

      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#FBFF69]/[0.03] rounded-full blur-[150px] animate-pulse"
          style={{ animationDuration: "8s" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#9B59B6]/[0.04] rounded-full blur-[120px] animate-pulse"
          style={{ animationDuration: "10s", animationDelay: "2s" }}
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center justify-center">
            <div className="relative flex items-center justify-between px-6 py-3 rounded-[24px] backdrop-blur-md bg-[#FAFAFA] bg-opacity-[0.01] w-[100%] max-w-[850px] header-border-gradient">
              {/* Left Side: Logo + Nav Links */}
              <div className="flex items-center gap-12 z-10">
                {/* Logo */}
                <div className="flex items-center gap-2">
                  <img src={LogoIcon} alt="MultiHopper" className="w-4 h-5" />
                  <span
                    className="not-italic font-normal text-base leading-5 text-white tracking-wide"
                    style={{ fontFamily: "Rowdies" }}
                  >
                    MultiHopper
                  </span>
                </div>

                {/* Nav Links */}
                <div className="flex items-center gap-10">
                  <a
                    href="https://business.multihopper.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="not-italic font-medium text-xs leading-3 text-[var(--laser-lemon-500)] hover:text-white transition-colors duration-300"
                    style={{ fontFamily: "Roboto, sans-serif" }}
                  >
                    Business
                  </a>
                  <a
                    href="https://business.multihopper.com/developers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="not-italic font-medium text-xs leading-3 text-[var(--laser-lemon-500)] hover:text-white transition-colors duration-300"
                    style={{ fontFamily: "Roboto, sans-serif" }}
                  >
                    Build
                  </a>
                  <a
                    href="#how-it-works"
                    className="flex items-center gap-1 not-italic font-medium text-xs leading-3 text-[#7E7F83] hover:text-white transition-colors duration-300"
                    style={{ fontFamily: "Roboto, sans-serif" }}
                  >
                    How it Works
                    <svg
                      width="10"
                      height="6"
                      viewBox="0 0 10 6"
                      fill="none"
                      className="ml-0.5 opacity-60"
                    >
                      <path
                        d="M1 1L5 5L9 1"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                  <a
                    href="#faq"
                    className="not-italic font-medium text-xs leading-3 text-[#7E7F83] hover:text-white transition-colors duration-300"
                    style={{ fontFamily: "Roboto, sans-serif" }}
                  >
                    FAQ
                  </a>
                </div>
              </div>

              {/* Connect Wallet Button */}
              <div className="z-10">
                <button
                  onClick={handleConnectWallet}
                  className='px-5 py-2 rounded-xl not-italic font-medium text-xs text-center text-white shadow-[0_0_15px_rgba(251,255,105,0.1)] bg-[url("/cnnt-wllt-bg-btn.png")] bg-no-repeat bg-center bg-contain hover:bg-none hover:bg-mh-yellow hover:text-black transition-all duration-300'
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden">
            <div className="rounded-3xl bg-gradient-to-r from-white/20 via-white/10 to-white/20 p-[1px]">
              <div className="flex items-center justify-between px-4 py-3 rounded-3xl backdrop-blur-xl bg-[#1a1c1e]/50">
                <button
                  onClick={() => router.navigate({ to: "/" })}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <img src={LogoIcon} alt="MultiHopper" className="w-4 h-6" />
                  <span className="font-rowdies text-base">MultiHopper</span>
                </button>
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 rounded-lg bg-white/5 border border-white/10"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {mobileMenuOpen ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 p-4 bg-mh-dark-300/95 backdrop-blur-xl border border-white/10 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col gap-4">
                <a
                  href="https://business.multihopper.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--laser-lemon-500)] hover:text-white py-2 transition-colors"
                >
                  Business
                </a>
                <a
                  href="https://business.multihopper.com/developers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--laser-lemon-500)] hover:text-white py-2 transition-colors"
                >
                  Build
                </a>
                <a
                  href="#how-it-works"
                  className="text-white/80 hover:text-white py-2 transition-colors"
                >
                  How it Works
                </a>
                <a
                  href="#faq"
                  className="text-white/80 hover:text-white py-2 transition-colors"
                >
                  FAQ
                </a>
                <button
                  onClick={handleConnectWallet}
                  className="w-full py-3 bg-mh-yellow text-black font-semibold rounded-xl"
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 lg:pt-12 pb-12 sm:pb-20 lg:pb-20">
        <div className="max-w-7xl mx-auto">
          {/* Hero Content */}
          <div className="relative z-10 text-center">
            {/* Tag Badge */}
            <div
              className="inline-flex items-center gap-3 mb-6 sm:mb-8 px-3 sm:px-3 py-2 sm:py-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl"
              style={{ animation: "fadeInUp 0.6s ease-out" }}
            >
              <img src={TagStars} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span
                className="text-xs sm:text-base not-italic font-medium leading-5 text-white"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                VPN For Sending Digital Assets
              </span>
            </div>

            {/* Main Heading */}
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal leading-[1.05] mb-4 sm:mb-8 tracking-tight"
              style={{ animation: "fadeInUp 0.6s ease-out 0.1s both" }}
            >
              Send Private, <span className="text-mh-yellow">Programmable</span> Money
            </h1>

            <h2
              className="not-italic font-normal text-base leading-5 text-center mb-8 sm:mb-10"
              style={{
                color: "#FFFFFF",
                fontFamily: "Roboto, sans-serif",
              }}
            >
              Regulator-Ready On-Chain Asset Routing in Seconds
            </h2>

            {/* Main Feature Card */}
            <div
              className="relative w-full max-w-[551px] mx-auto"
              style={{ animation: "fadeInUp 0.6s ease-out 0.3s both" }}
            >
              <div
                className="relative p-5 sm:p-7 lg:p-8 bg-[#1D2022] rounded-2xl sm:rounded-3xl backdrop-blur-xl"
                style={{
                  boxShadow: "23.58px 27.16px 56.39px rgba(0, 0, 0, 0.08)",
                  border: "1px solid transparent",
                  background:
                    "linear-gradient(#1D2022, #1D2022) padding-box, linear-gradient(0deg, rgba(255,255,255,0) 23%, rgba(255,255,255,0.5) 49%, rgba(255,255,255,0) 75%) border-box",
                }}
              >
                {/* Blurred Overlay - Shows when wallet is not connected */}
                {/* {!connected && (
                  <div
                    className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl sm:rounded-3xl"
                    style={{
                      backdropFilter: "blur(2px)",
                      backgroundColor: "rgba(0, 0, 0, 0.75)",
                    }}
                  >
                    <div className="w-full px-5 sm:px-7 lg:px-8">
                      <button
                        onClick={handleConnectWallet}
                        className="w-full py-4 sm:py-5 bg-mh-yellow text-black font-bold rounded-2xl hover:brightness-110 hover:shadow-lg hover:shadow-mh-yellow/20 transition-all duration-300 text-base sm:text-lg"
                      >
                        CONNECT WALLET
                      </button>
                    </div>
                  </div>
                )} */}

                {/* Token Input Card */}
                <div className="relative bg-[#121416] rounded-2xl sm:rounded-3xl p-8 sm:p-10 mb-5">
                  {/* Gradient Blur Overlay Container */}
                  <div
                    className="absolute inset-0 rounded-2xl sm:rounded-3xl overflow-hidden"
                    style={{ zIndex: 10 }}
                  >
                    {/* Gradient layers for progressive blur effect */}
                    <div className="absolute inset-0">
                      {/* Top section - minimal blur */}
                      <div
                        className="absolute inset-x-0 top-0 h-1/3"
                        style={{
                          backdropFilter: "blur(1.6px)",
                          background:
                            "linear-gradient(to bottom, rgba(18, 20, 22, 0.016), rgba(18, 20, 22, 0.032))",
                        }}
                      />

                      {/* Middle section - medium blur */}
                      <div
                        className="absolute inset-x-0 top-1/3 h-1/3"
                        style={{
                          backdropFilter: "blur(4.8px)",
                          background:
                            "linear-gradient(to bottom, rgba(18, 20, 22, 0.032), rgba(18, 20, 22, 0.064))",
                        }}
                      />

                      {/* Bottom section - heavy blur */}
                      <div
                        className="absolute inset-x-0 bottom-0 h-1/3"
                        style={{
                          backdropFilter: "blur(9.6px)",
                          background:
                            "linear-gradient(to bottom, rgba(18, 20, 22, 0.064), rgba(18, 20, 22, 0.12))",
                        }}
                      />

                      {/* Additional overlay for smoother transition */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(to bottom, transparent 0%, rgba(18, 20, 22, 0.32) 100%)",
                        }}
                      />
                    </div>

                    {/* Animated Arrows at the bottom */}
                    <div className="absolute inset-0 flex items-end justify-center pb-16">
                      <div className="relative">
                        {/* Floating animation */}
                        <img
                          src="/blurred-arrows.png"
                          alt="Overlay"
                          className="w-24 h-24 object-contain relative z-20 animate-float"
                        />
                        {/* Pulsing glow effect */}
                        <div className="absolute inset-0 animate-pulse-slow">
                          <img
                            src="/blurred-arrows.png"
                            alt="Overlay"
                            className="w-24 h-24 object-contain opacity-50 blur-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Original Content (now blurred in background) */}
                  <div className="flex flex-col items-center justify-center mb-10">
                    <div className="flex items-center gap-4 mb-3">
                      {/* SOL Token Icon */}
                      <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white/10">
                        <img
                          src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                          alt="SOL"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-5xl sm:text-6xl lg:text-7xl font-medium text-white tracking-tight">
                          0 SOL
                        </span>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-white/40 mt-2"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>

                    <div className="text-base text-white/40 font-medium tracking-wide">
                      Total Value $0
                    </div>
                  </div>

                  {/* Slider */}
                  <div className="w-full px-2 mb-10">
                    <div className="relative w-full h-2 bg-white/10 rounded-full">
                      <div
                        className="absolute left-0 top-0 h-full bg-mh-yellow rounded-full"
                        style={{ width: "40%" }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-mh-yellow rounded-full border-[3px] border-[#121416] cursor-pointer shadow-[0_0_15px_rgba(251,255,105,0.5)]"
                        style={{ left: "40%" }}
                      />
                    </div>
                  </div>

                  {/* Percentage Buttons */}
                  <div className="flex justify-center gap-4">
                    {["25%", "50%", "Max"].map((label) => (
                      <button
                        key={label}
                        className="w-16 py-3 bg-white/[0.03] hover:bg-white/[0.08] hover:text-white border border-transparent hover:border-white/[0.1] rounded-2xl text-xs font-bold text-mh-yellow transition-all duration-200"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Get Started Button */}
                <button
                  onClick={handleConnectWallet}
                  className="w-full py-3 bg-mh-yellow rounded-[18px] hover:brightness-110 hover:shadow-lg hover:shadow-mh-yellow/20 transition-all duration-300 not-italic font-semibold text-base leading-5 text-center text-[#1F200D]"
                  style={{ fontFamily: "Roboto, sans-serif" }}
                >
                  Connect To Explore
                </button>
              </div>
            </div>

            {/* Subtext */}
            <p
              className="mt-8 sm:mt-12 text-sm sm:text-base md:text-base not-italic font-semibold leading-5 text-center text-white mx-auto px-4"
              style={{
                fontFamily: "Roboto, sans-serif",
                animation: "fadeInUp 0.6s ease-out 0.4s both",
              }}
            >
              Send any digital asset, bouncing it off any wallets <br /> across
              Web3{" "}
              <span className="font-light italic">even ones you don't own</span>
            </p>

            {/* Beta Disclaimer */}
            <p
              className="mt-3 text-xs sm:text-sm not-italic font-medium leading-5 text-center text-[var(--laser-lemon-500)] mx-auto px-4"
              style={{
                fontFamily: "Roboto, sans-serif",
                animation: "fadeInUp 0.6s ease-out 0.45s both",
              }}
            >
              [MultiHopper is stable in beta and pre-audit.]
            </p>

            {/* Scroll Indicator */}
            <div
              className="mt-12 sm:mt-16 flex justify-center"
              style={{ animation: "fadeInUp 0.6s ease-out 0.5s both" }}
            >
              <img
                src="/scroll.svg"
                alt="Scroll down"
                className="w-18 h-18 animate-bounce"
                style={{ animationDuration: "2s" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Without Complexity Section */}
      <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-14">
            <div
              className="inline-flex items-center gap-3 mb-6 sm:mb-8 px-3 sm:px-3 py-2 sm:py-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl"
              style={{ animation: "fadeInUp 0.6s ease-out" }}
            >
              <img src={PrivacyIcon} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span
                className="text-xs sm:text-base not-italic font-medium leading-5 text-white"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Privacy Without Complexity
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-5xl not-italic font-light leading-10 text-center">
              Why users choose <span className="font-normal">MultiHopper</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:items-center lg:justify-center gap-4 sm:gap-8">
            {[
              {
                title: "No Private Blockchains",
                icon: CheckmarkIcon,
              },
              {
                title: "No Tumbling of Assets",
                icon: TumbellingIcon,
              },
              {
                title: "Total Control",
                icon: ControlIcon,
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="group p-6 sm:pl-6 sm:pr-10 backdrop-blur-sm rounded-2xl md:rounded-[34px] card-border-gradient bg-[#1D2022] transition-all duration-500 lg:max-w-[226px] lg:max-h-[155px] w-[100%] h-[100%]"
                style={{
                  animation: `fadeInUp 0.5s ease-out ${0.1 * idx}s both`,
                }}
              >
                <div className="w-10 h-10 sm:w-[45px] sm:h-[45px] mb-4 sm:mb-5 group-hover:scale-110 transition-transform duration-300">
                  <img src={feature.icon} alt="" className="w-full h-full" />
                </div>
                <h3
                  className="font-roboto font-medium"
                  style={{
                    color: "#FFFFFF",
                    fontSize: "18px",
                    lineHeight: "24px",
                    maxWidth: idx == 2 ? "100px" : "120px",
                  }}
                >
                  {feature.title}
                </h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Programmable Infrastructure for Institutional Digital Assets / Programmable Money Section */}
      <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-14">
            <div
              className="inline-flex items-center gap-3 mb-6 sm:mb-8 px-3 sm:px-3 py-2 sm:py-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl"
              style={{ animation: "fadeInUp 0.6s ease-out" }}
            >
              <img src={MotionIcon} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span
                className="text-xs sm:text-base not-italic font-medium leading-5 text-white"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Programmable Infrastructure for Institutional Digital Assets
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-5xl not-italic font-normal leading-10 text-center">
              Welcome to <br />programmable money
            </h2>
          </div>

          {/* Program Images with Text Overlays */}
          <div className="grid justify-items-center grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                image: "/program1.png",
                title: "Send any amount of",
                subtitle: "tokens onchain privately",
              },
              {
                image: "/program2n.png",
                title: "Route through any",
                subtitle: "wallets you can imagine",
              },
              {
                image: "/program3.png",
                title: "Control how long assets",
                subtitle: "stay in each hop wallet",
              },
            ].map((program, idx) => {
              const isCenterCard = idx === 1;
              const borderThickness = isCenterCard ? 2 : 1;

              return (
                <div
                  key={idx}
                  className="group relative h-[360px] sm:h-[345px] w-full max-w-[301px] rounded-[32px]"
                  style={{
                    animation: `fadeInUp 0.5s ease-out ${0.1 * idx}s both`,
                    padding: `${borderThickness}px`,
                    background: "#16181A",
                  }}
                >
                  {isCenterCard ? (
                    <>
                      <div
                        className="absolute left-0 top-[32px] bottom-[32px] w-[1px] bg-[#FBFF69] pointer-events-none"
                        style={{ zIndex: 0 }}
                      />
                      <div
                        className="absolute left-[32px] top-0 right-[32px] h-[1px] bg-gradient-to-r from-[#FBFF69] to-[#FFFFFF] pointer-events-none"
                        style={{ zIndex: 0 }}
                      />
                      <div
                        className="absolute right-0 top-[32px] bottom-[32px] w-[1px] bg-[#FFFFFF] pointer-events-none"
                        style={{ zIndex: 0 }}
                      />
                      <div
                        className="absolute left-[32px] bottom-0 right-[32px] h-[1px] bg-gradient-to-r from-[#FBFF69] to-[#FFFFFF] pointer-events-none"
                        style={{ zIndex: 0 }}
                      />
                      <div
                        className="absolute top-0 left-0 w-[32px] h-[32px] pointer-events-none overflow-hidden"
                        style={{ zIndex: 0 }}
                      >
                        <div
                          className="absolute top-0 left-0 w-[34px] h-[34px] border-t-[2px] border-l-[2px] border-[#FBFF69] rounded-tl-[32px]"
                          style={{ marginTop: "-1px", marginLeft: "-1px" }}
                        />
                      </div>
                      <div
                        className="absolute top-0 right-0 w-[32px] h-[32px] pointer-events-none overflow-hidden"
                        style={{ zIndex: 0 }}
                      >
                        <div
                          className="absolute top-0 right-0 w-[34px] h-[34px] border-t-[2px] border-r-[2px] border-[#FFFFFF] rounded-tr-[32px]"
                          style={{ marginTop: "-1px", marginRight: "-1px" }}
                        />
                      </div>
                      <div
                        className="absolute bottom-0 left-0 w-[32px] h-[32px] pointer-events-none overflow-hidden"
                        style={{ zIndex: 0 }}
                      >
                        <div
                          className="absolute bottom-0 left-0 w-[34px] h-[34px] border-b-[2px] border-l-[2px] border-[#FBFF69] rounded-bl-[32px]"
                          style={{ marginBottom: "-1px", marginLeft: "-1px" }}
                        />
                      </div>
                      <div
                        className="absolute bottom-0 right-0 w-[32px] h-[32px] pointer-events-none overflow-hidden"
                        style={{ zIndex: 0 }}
                      >
                        <div
                          className="absolute bottom-0 right-0 w-[34px] h-[34px] border-b-[2px] border-r-[2px] border-[#FFFFFF] rounded-br-[32px]"
                          style={{ marginBottom: "-1px", marginRight: "-1px" }}
                        />
                      </div>
                    </>
                  ) : (
                    <div
                      className="card-border-gradient-large-border absolute inset-0 pointer-events-none"
                      style={{ zIndex: 0 }}
                    />
                  )}

                  <div
                    className="relative w-full h-full overflow-hidden rounded-[30px] bg-[#16181A] group-hover:scale-[1.02] transition-transform duration-500"
                    style={{
                      zIndex: 1,
                      transformOrigin: "center center",
                    }}
                  >
                    <img
                      src={program.image}
                      alt={program.title}
                      className="absolute inset-0 w-full h-full object-cover scale-[1] group-hover:scale-[1.15] transition-transform duration-500"
                      style={{ transformOrigin: "center center" }}
                    />

                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-transparent" />

                    <div className="absolute top-8 left-8 max-w-[80%] text-lg text-white not-italic">
                      <h3 className="drop-shadow-lg font-medium leading-5">
                        {program.title}
                      </h3>
                      <p className="drop-shadow-md font-extralight">
                        {program.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center w-[100%] mt-16 ">
            <button
              onClick={handleConnectWallet}
              className="not-italic font-medium text-sm text-center max-w-[124px] w-full py-2 bg-mh-yellow text-black rounded-xl hover:brightness-110 hover:shadow-lg hover:shadow-mh-yellow/20 transition-all duration-300"
              style={{
                // fontFamily: 'Clash Grotesk Variable',
                fontFamily: "Space Grotesk",
              }}
            >
              Send Assets
            </button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how-it-works"
        className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-20"
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8 sm:mb-14">
            <div
              className="inline-flex items-center gap-3 mb-6 sm:mb-8 px-3 sm:px-3 py-2 sm:py-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl"
              style={{ animation: "fadeInUp 0.6s ease-out" }}
            >
              <img src={MotionIcon} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span
                className="text-xs sm:text-base not-italic font-medium leading-5 text-white"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Programmable Infrastructure for Institutional Digital Assets
              </span>
            </div>

            <h2
              className="not-italic font-normal leading-10 text-center text-2xl sm:text-4xl lg:text-5xl"
              style={{
                fontFamily: "Roboto, sans-serif",
              }}
            >
              How it all works
            </h2>
          </div>

          {/* Vertical Flowchart - Responsive */}
          <div className="relative flex flex-col items-center">
            {/* Step 1 */}
            <div className='relative z-10 w-full min-w-[256px] max-w-[312px] sm:max-w-[240px] md:max-w-[226px] p-4 sm:p-6 bg-[#1D2022] backdrop-blur-xl card-border-gradient rounded-[34px]'>
              <div className='flex items-center justify-between mb-3'>
                <span
                  className="not-italic font-medium leading-6 text-center text-lg sm:text-xl text-[#FBFF69] bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg"
                  style={{
                    fontFamily: "Roboto, sans-serif",
                  }}
                >
                  1
                </span>
                <button
                  onClick={handleConnectWallet}
                  className='text-sm not-italic font-medium text-center px-[24px] py-[6px] rounded-[10px] bg-[url("/cnnt-bg-btn.png")] bg-no-repeat bg-center bg-contain hover:bg-none hover:bg-mh-yellow hover:text-black transition-all duration-300'
                >
                  Connect
                </button>
              </div>
              <p
                className='not-italic font-medium leading-6 text-sm sm:text-base'
                style={{
                  fontFamily: "Roboto, sans-serif",
                }}
              >
                Connect <br className='hidden sm:block' /> your wallet
              </p>
            </div>

            {/* Connector 1->2 */}
            <div>
              <img
                src="/howitworks1.svg"
                alt=""
                className="h-[52px] w-auto opacity-80 mt-[-4px] mb-[-10px]"
              />
            </div>

            {/* Step 2 */}
            <div className='relative z-10 w-full min-w-[256px] max-w-[312px] sm:max-w-[240px] md:max-w-[226px] p-4 sm:p-6 bg-[#1D2022] backdrop-blur-xl card-border-gradient rounded-[34px]'>
              <span
                className="not-italic font-medium leading-6 text-center text-lg sm:text-xl text-[#FBFF69] bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg mb-3"
                style={{
                  fontFamily: "Roboto, sans-serif",
                }}
              >
                2
              </span>
              <p
                className="not-italic font-medium leading-6 text-sm sm:text-base"
                style={{
                  fontFamily: "Roboto, sans-serif",
                }}
              >
                Choose easy mode <br className='hidden sm:block' /> or design
                your route
              </p>
            </div>

            {/* Branching Connectors */}
            <div className="relative w-full max-w-[800px] h-[60px] hidden lg:block mt-[-22px]">
              {/* Left Branch */}
              <img
                src="/howitworksleft.svg"
                alt=""
                className="absolute right-1/2 top-0 h-full w-auto -translate-x-[1.25px]"
              />
              {/* Right Branch */}
              <img
                src="/howitworksright.svg"
                alt=""
                className="absolute left-1/2 top-0 h-full w-auto translate-x-[1.25px]"
              />
            </div>

            {/* Mobile Connector (Simple Vertical) */}
            <div className="lg:hidden w-1.5 h-8 bg-gradient-to-b from-mh-yellow/30 to-mh-yellow/10" />

            {/* Branching Section */}
            <div className="relative w-full">
              {/* Cards Row */}
              <div className="flex flex-col lg:flex-row gap-8 justify-center items-center lg:items-start px-4">
                {/* Easy Mode Card */}
                <div className='relative z-10 w-full min-w-[256px] max-w-[312px] h-[201px] p-4 sm:p-6 bg-[#1D2022] backdrop-blur-xl card-border-gradient rounded-[34px]'>
                  <span
                    className="not-italic font-medium leading-6 text-center text-lg sm:text-xl text-[#FBFF69] bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg mb-3"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    3
                  </span>
                  <p
                    className='not-italic text-base leading-[22px] w-full sm-w-[255px]'
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    <span className="text-mh-yellow font-medium">
                      Easy mode:
                    </span>{" "}
                    <span className="text-white font-light">
                      Privacy in 3 clicks. Our system selects random wallets,
                      hops and you set completion time.
                    </span>
                  </p>
                </div>

                {/* Mobile Connector (Simple Vertical) */}
                <div className="absolute lg:hidden w-1.5 h-8 bg-gradient-to-b from-mh-yellow/30 to-mh-yellow/10" />
                {/* Design Mode Card */}
                <div className='relative z-10 w-full min-w-[256px] max-w-[312px] h-[201px] p-4 sm:p-6 bg-[#1D2022] backdrop-blur-xl card-border-gradient rounded-[34px]'>
                  <span
                    className="not-italic font-medium leading-6 text-center text-lg sm:text-xl text-[#FBFF69] bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg mb-3"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    3
                  </span>
                  <p
                    className='not-italic text-base leading-[22px] w-full sm-w-[250px]'
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    <span className="text-mh-yellow font-medium">
                      Design mode:
                    </span>{" "}
                    <span className="text-white font-light">
                      Select the wallets you want to hop through and how long
                      tokens stay in each hop wallet before moving on
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Connector 3->4 */}
            <div className="hidden lg:block">
              <img
                src="/howitworks4.svg"
                alt=""
                className="h-[52px] w-auto opacity-80 mb-[-14px]"
              />
            </div>

            {/* Mobile Connector (Simple Vertical) */}
            <div className="lg:hidden w-1.5 h-8 bg-gradient-to-b from-mh-yellow/30 to-mh-yellow/10" />

            {/* Step 4 */}
            <div className='relative z-10 w-full min-w-[256px] max-w-[312px] sm:max-w-[286px] md:max-w-[286px] h-[140px] p-4 sm:p-6 bg-[#1D2022] backdrop-blur-xl card-border-gradient rounded-[34px]'>
              <span
                className="not-italic font-medium leading-6 text-center text-lg sm:text-xl text-[#FBFF69] bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg mb-3"
                style={{
                  fontFamily: "Roboto, sans-serif",
                }}
              >
                4
              </span>
              <p
                className="not-italic font-medium leading-6 text-sm sm:text-base"
                style={{
                  fontFamily: "Roboto, sans-serif",
                }}
              >
                Send your assets
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section
        id="faq"
        className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-20"
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8 sm:mb-10">
            <div className="inline-flex items-center gap-2 mb-4 sm:mb-8 px-4 sm:px-6 py-2 sm:py-2.5 bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl">
              <span className="text-xs sm:text-sm not-italic font-medium leading-5">
                FAQ
              </span>
            </div>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl mb-7 not-italic font-normal leading-10 text-center"
              style={{
                fontFamily: "Roboto, sans-serif",
              }}
            >
              Frequently asked questions
            </h2>
            <p
              className="text-sm sm:text-base text-white/50 not-italic font-normal leading-6 text-center"
              style={{
                fontFamily: "Roboto, sans-serif",
              }}
            >
              Have questions? We're here to help.
            </p>
          </div>

          {/* Search Bar */}
          <div className="mb-6 sm:mb-8">
            <div
              className="flex items-center rounded-xl sm:rounded-2xl overflow-hidden"
              style={{
                backgroundColor: "#242728",
              }}
            >
              <svg
                className="w-5 h-5 ml-6 sm:ml-6 text-white/30 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search questions..."
                className="flex-1 pl-2 sm:pl-3 pr-3 sm:pr-4 py-4 sm:py-5 bg-transparent not-italic font-medium leading-6 text-sm sm:text-base text-white placeholder-white/40 focus:outline-none"
                style={{
                  fontFamily: "Roboto, sans-serif",
                }}
              />
              <button className="mr-4 px-4 sm:px-6 py-2 sm:py-2.5 bg-mh-yellow text-black font-semibold rounded-lg sm:rounded-xl hover:brightness-110 transition-all text-sm">
                Search
              </button>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-[22px]">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl hover:border-white/[0.15] transition-all duration-300 ${
                  expandedFaq === idx ? "bg-[#151719]" : "bg-[#202224]"
                }`}
              >
                <button
                  onClick={() =>
                    setExpandedFaq(expandedFaq === idx ? null : idx)
                  }
                  className="w-full flex items-center justify-between text-left gap-4"
                >
                  <h3
                    className="text-sm sm:text-base lg:text-lg font-medium text-white leading-5"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    {faq.question}
                  </h3>
                  <div
                    className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all duration-300 ${
                      expandedFaq === idx
                        ? "bg-mh-yellow border-mh-yellow text-black rotate-45"
                        : "bg-transparent border-white/20 text-white"
                    }`}
                  >
                    <span className="text-lg sm:text-xl font-light select-none">
                      +
                    </span>
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    expandedFaq === idx
                      ? "max-h-40 opacity-100 mt-3"
                      : "max-h-0 opacity-0"
                  }`}
                >
                  <p
                    className="text-sm text-white/65 not-italic font-light leading-[18px]"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    {faq.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center w-[100%] mt-16 ">
            <a
              href="https://docs.multihopper.com"
              target="_blank"
              rel="noopener noreferrer"
              className='max-w-[124px] w-full py-2 font-medium rounded-xl text-white bg-[url("/sm-bg-btn.png")] bg-no-repeat bg-center bg-contain hover:bg-none hover:bg-mh-yellow hover:text-black transition-all duration-300 text-sm flex items-center justify-center font-grotesk'
            >
              Show more
            </a>
          </div>
        </div>
      </section>

      {/* Collaborate / Hop with Us Section */}
      <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-10">
            <div
              className="inline-flex items-center gap-3 mb-6 sm:mb-8 px-3 sm:px-3 py-2 sm:py-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl"
              style={{ animation: "fadeInUp 0.6s ease-out" }}
            >
              <img
                src={CollaborateIcon}
                alt=""
                className="w-4 h-4 sm:w-5 sm:h-5"
              />
              <span
                className="text-xs sm:text-base not-italic font-medium leading-5 text-white"
                style={{ fontFamily: "Roboto, sans-serif" }}
              >
                Collaborate
              </span>
            </div>

            <h2
              className="text-2xl sm:text-3xl lg:text-4xl not-italic font-normal leading-10 text-center"
              style={{
                fontFamily: "Roboto, sans-serif",
              }}
            >
              Hop with Us
            </h2>
          </div>

          <div
            className='max-w-2xl mx-auto p-6 sm:p-8 lg:p-10 bg-[#16181A] border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-2xl'
            style={{
              background:
                "linear-gradient(#1D2022, #1D2022) padding-box, linear-gradient(0deg, rgba(255,255,255,0) 23%, rgba(255,255,255,0.5) 49%, rgba(255,255,255,0) 75%) border-box",
            }}
          >
            <div className='flex gap-5 items-start justify-between mb-6 sm:mb-8'>
              <div className='flex flex-col gap-3'>
                <h3
                  className='text-xl sm:text-2xl not-italic font-normal leading-6'
                  style={{
                    fontFamily: 'Roboto, sans-serif',
                  }}
                >
                  Let's Talk
                </h3>
                <p
                  className='text-sm sm:text-base text-white/60 not-italic font-light leading-6 w-full sm:w-[290px]'
                  style={{
                    fontFamily: 'Roboto, sans-serif',
                  }}
                >
                  Looking to partner with us, or resell the{' '}
                  <br className='hidden sm:block' /> MultiHopper to your
                  clients?
                </p>
              </div>

              {/* Bunny Icon Top Right */}
              <div className='w-[72px] h-[72px] bg-[#fbff69] bg-opacity-[0.26] flex items-center justify-center rounded-[17px]'>
                <div className='w-[59px] h-[59px] rounded-[17px] bg-mh-yellow  flex items-center justify-center'>
                  <img
                    src={LtsBunnyIcon}
                    alt=''
                    className='w-[33px] h-[47px]'
                  />
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className='space-y-4 sm:space-y-6'>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6'>
                <div>
                  <label
                    className="block text-xs sm:text-sm text-white/60 mb-2 not-italic font-normal leading-6"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    Full Name*
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="w-5 h-5 text-white/30"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Kai Ipsum"
                      value={formData.fullName}
                      onChange={(e) =>
                        setFormData({ ...formData, fullName: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-2 sm:py-2 bg-[#232628] border border-white/[0.06] rounded-2xl text-sm sm:text-base text-white placeholder-[rgba(255,255,255,0.18)] focus:outline-none focus:border-mh-yellow/30 transition-colors not-italic leading-5"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label
                    className="block text-xs sm:text-sm text-white/60 mb-2 not-italic font-normal leading-6"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    Email*
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="w-5 h-5 text-white/30"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <input
                      type="email"
                      placeholder="Hi@KRD.com"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-2 sm:py-2 bg-[#232628] border border-white/[0.06] rounded-2xl text-sm sm:text-base text-white placeholder-[rgba(255,255,255,0.18)] focus:outline-none focus:border-mh-yellow/30 transition-colors not-italic leading-5"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label
                  className="block text-xs sm:text-sm text-white/60 mb-2 not-italic font-normal leading-6"
                  style={{
                    fontFamily: "Roboto, sans-serif",
                  }}
                >
                  Company
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                      className="w-5 h-5 text-white/30"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="KRD Collective"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-2 sm:py-2 bg-[#232628] border border-white/[0.06] rounded-2xl text-sm sm:text-base text-white placeholder-[rgba(255,255,255,0.18)] focus:outline-none focus:border-mh-yellow/30 transition-colors not-italic leading-5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label
                    className="block text-xs sm:text-sm text-white/60 mb-2 not-italic font-normal leading-6"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    X Handle*
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      {/* Simple X/Twitter Icon */}
                      <svg
                        className="w-4 h-4 text-white/30"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="@KRD.Collective"
                      value={formData.xHandle}
                      onChange={(e) =>
                        setFormData({ ...formData, xHandle: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-2 sm:py-2 bg-[#232628] border border-white/[0.06] rounded-2xl text-sm sm:text-base text-white placeholder-[rgba(255,255,255,0.18)] focus:outline-none focus:border-mh-yellow/30 transition-colors not-italic leading-5"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label
                    className="block text-xs sm:text-sm text-white/60 mb-2 not-italic font-normal leading-6"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    TG Handle*
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="w-[14px] h-[12px] text-white/30"
                        width="14"
                        height="12"
                        viewBox="0 0 14 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M3.39062 6.53186L4.91656 10.7554C4.91656 10.7554 5.10734 11.1506 5.31163 11.1506C5.51592 11.1506 8.55439 7.98963 8.55439 7.98963L11.9333 1.46338L3.44507 5.44161L3.39062 6.53186Z"
                          fill="#4A4A4A"
                        />
                        <path
                          d="M5.41524 7.61523L5.12232 10.7284C5.12232 10.7284 4.9997 11.6823 5.9534 10.7284C6.90709 9.7745 7.81996 9.03892 7.81996 9.03892"
                          fill="#2A2A2A"
                        />
                        <path
                          d="M3.41721 6.68282L0.278305 5.6601C0.278305 5.6601 -0.0968282 5.5079 0.0239647 5.16278C0.0488307 5.09161 0.0989913 5.03105 0.249045 4.92698C0.944542 4.4422 13.1221 0.0652481 13.1221 0.0652481C13.1221 0.0652481 13.466 -0.0506145 13.6687 0.0264487C13.7189 0.0419778 13.7641 0.0705542 13.7996 0.109254C13.8351 0.147954 13.8596 0.195388 13.8708 0.246706C13.8927 0.337345 13.9019 0.430598 13.898 0.523768C13.897 0.604368 13.8873 0.679074 13.8799 0.796222C13.8057 1.9929 11.5862 10.9241 11.5862 10.9241C11.5862 10.9241 11.4534 11.4467 10.9776 11.4646C10.8607 11.4684 10.7442 11.4486 10.6351 11.4064C10.526 11.3642 10.4265 11.3004 10.3426 11.2189C9.40895 10.4158 6.18194 8.24712 5.46887 7.77017C5.45278 7.75921 5.43924 7.74493 5.42914 7.72829C5.41904 7.71164 5.41264 7.69303 5.41034 7.67371C5.40038 7.62344 5.45504 7.56116 5.45504 7.56116C5.45504 7.56116 11.0741 2.56653 11.2236 2.0422C11.2352 2.00158 11.1915 1.98154 11.1327 1.99933C10.7595 2.13663 4.28988 6.22226 3.57584 6.67317C3.52444 6.68872 3.47011 6.69202 3.41721 6.68282Z"
                          fill="#7F8081"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="TG Handle"
                      value={formData.tgHandle}
                      onChange={(e) =>
                        setFormData({ ...formData, tgHandle: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-2 sm:py-2 bg-[#232628] border border-white/[0.06] rounded-2xl text-sm sm:text-base text-white placeholder-[rgba(255,255,255,0.18)] focus:outline-none focus:border-mh-yellow/30 transition-colors not-italic leading-5"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label
                  className="block text-xs sm:text-sm text-white/60 mb-2 not-italic font-normal leading-6"
                  style={{
                    fontFamily: "Roboto, sans-serif",
                  }}
                >
                  Reasons for contacting?
                </label>
                <textarea
                  placeholder="Describe reasoning ..."
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  rows={4}
                  className="w-full px-4 py-3 sm:py-3.5 bg-[#232628] border border-white/[0.06] rounded-2xl text-sm sm:text-base text-white placeholder-[rgba(255,255,255,0.18)] focus:outline-none focus:border-mh-yellow/30 transition-colors resize-none not-italic leading-5"
                />
              </div>

              {/* Error Message */}
              {formStatus === "error" && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-red-400">Something went wrong. Please try again or contact us on Telegram.</span>
                </div>
              )}

              {/* Success Message */}
              {formStatus === "success" && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-green-400">Message sent successfully! We'll get back to you soon.</span>
                </div>
              )}

              <div className='flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-1 pt-2'>
                <a
                  href="https://x.com/multihopper"
                  target="_blank"
                  rel="noopener noreferrer"
                  className='flex items-center gap-2 text-sm font-medium text-white hover:text-mh-yellow transition-colors'
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>@multihopper</span>
                </a>
                <button
                  type="submit"
                  disabled={formStatus === "submitting"}
                  className={`min-w-[132px] px-8 py-3 font-medium rounded-xl transition-all duration-300 text-sm font-grotesk ${
                    formStatus === "submitting"
                      ? "bg-gray-500 text-white cursor-not-allowed"
                      : 'text-white bg-[url("/sbmt-bg-btn.png")] bg-no-repeat bg-center bg-contain hover:bg-none hover:bg-mh-yellow hover:text-black'
                  }`}
                >
                  {formStatus === "submitting" ? "Sending..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative mt-20">
        <div className="relative w-full h-[60px] leading-none overflow-hidden sticky-top">
          <div
            className="absolute top-0 left-0 h-full bg-[#222426] border-t border-[#FBFF69]"
            style={{ width: "calc(50% - 110px)" }}
          />
          <div
            className="absolute top-0 right-0 h-full bg-[#222426] border-t border-[#FBFF69]"
            style={{ width: "calc(50% - 110px)" }}
          />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[220px] h-[60px]">
            <svg
              width="220"
              height="60"
              viewBox="0 0 220 60"
              xmlns="http://www.w3.org/2000/svg"
              className="block"
            >
              <path
                d="M0 0 H69 A20 20 0 0 1 89 20 A24 24 0 0 0 100 31 H120 A24 24 0 0 0 131 20 A20 20 0 0 1 151 0 H220 V60 H0 Z"
                fill="#222426"
              />
              <path
                d="M0 0 H69 A20 20 0 0 1 89 20 A24 24 0 0 0 100 31 H120 A24 24 0 0 0 131 20 A20 20 0 0 1 151 0 H220"
                fill="none"
                stroke="#FBFF69"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <svg
              width="18"
              height="18"
              viewBox="0 0 22 22"
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-1/2 -translate-x-1/2 cursor-pointer hover:opacity-80 transition-all duration-300"
              style={{ top: "-1px", pointerEvents: "all" }}
              onClick={scrollToTop}
            >
              <path
                d="M10.7483 19.9209L10.7483 1.57275M10.7483 1.57275L1.57422 10.7468M10.7483 1.57275L19.9224 10.7468"
                stroke="white"
                strokeWidth="3.1454"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="hover:stroke-[#FBFF69] transition-colors duration-300"
              />
            </svg>
          </div>
        </div>

        {/* Main Footer Body */}
        <div className="w-full bg-[#222426] px-4 sm:px-6 lg:px-8 pb-10 sm:pb-12 lg:pb-16 pt-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col gap-11 mb-11 sm:mb-14">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-12">
                {/* Logo and Description (Left - Spans 5 cols) */}
                <div className="lg:col-span-5">
                  <button
                    onClick={() => router.navigate({ to: "/" })}
                    className="flex items-center gap-2.5 mb-4 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <img src={LogoIcon} alt="MultiHopper" className="w-7 h-9" />
                    <span
                      className="text-xl sm:text-2xl not-italic font-normal leading-9"
                      style={{
                        fontFamily: "Rowdies",
                      }}
                    >
                      MultiHopper
                    </span>
                  </button>
                  <div
                    className="text-sm mb-8 max-w-sm not-italic leading-[18px]"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    <span className="text-white font-medium">
                      Smart Privacy for Onchain Transfers
                    </span>
                    <p className="text-white/80 font-light">
                      Full control, total privacy, 100% onchain.
                    </p>
                  </div>
                </div>

                {/* Spacers */}
                <div className="lg:col-span-1"></div>

                {/* Links Sections (Right - Spans 6 cols split into 3) */}
                <div className="lg:col-span-2">
                  <h4
                    className="mb-5 not-italic font-medium text-base leading-5"
                    style={{
                      fontFamily: "Grotesk, sans-serif",
                    }}
                  >
                    Info
                  </h4>
                  <ul
                    className="space-y-4 text-sm not-italic font-light leading-[18px] text-white/50"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    <li>
                      <a
                        href="https://business.multihopper.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        Business
                      </a>
                    </li>
                    <li>
                      <a
                        href="#how-it-works"
                        className="hover:text-white transition-colors"
                      >
                        How it Works
                      </a>
                    </li>
                    <li>
                      <a
                        href="#collaborate"
                        className="hover:text-white transition-colors"
                      >
                        Collaborate
                      </a>
                    </li>
                    <li>
                      <a
                        href="#faq"
                        className="hover:text-white transition-colors"
                      >
                        FAQ
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.strategic-super-reserve.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        Strategic Super Reserve
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.enigmafund.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        EnigmaFund Venture Capital
                      </a>
                    </li>
                  </ul>
                </div>

                <div className="lg:col-span-2">
                  <h4
                    className="mb-5 not-italic font-medium text-base leading-5"
                    style={{
                      fontFamily: "Grotesk, sans-serif",
                    }}
                  >
                    Resources
                  </h4>
                  <ul
                    className="space-y-4 text-sm not-italic font-light leading-[18px] text-white/50"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    <li>
                      <a
                        href="https://docs.multihopper.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        Docs
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://docs.multihopper.com/Terms-of-Service-and-Conditions-2eabf5d9f7db80879010ca300c13cbcb"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        Terms & Conditions
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://docs.multihopper.com/Privacy-Policy-2eabf5d9f7db8012b945ed3963dcc524"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        Privacy Policy
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://docs.multihopper.com/Compliance-Clauses-Privacy-Routing-and-Lawful-Use-Disclaimers-Sanctions-and-Restricted-Persons-Ann-2eabf5d9f7db805496f3e43cef977cb2"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        Compliance Policy
                      </a>
                    </li>
                  </ul>
                </div>

                <div className="lg:col-span-2">
                  <h4
                    className="mb-5 not-italic font-medium text-base leading-5"
                    style={{
                      fontFamily: "Grotesk, sans-serif",
                    }}
                  >
                    Social Media
                  </h4>
                  <ul
                    className="space-y-4 text-sm not-italic font-light leading-[18px] text-white/50"
                    style={{
                      fontFamily: "Roboto, sans-serif",
                    }}
                  >
                    <li>
                      <a
                        href="https://x.com/multihopper"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        Twitter/X
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://t.me/multihopperportal"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        Telegram
                      </a>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Newsletter */}
              <div>
                <p
                  className="text-white mb-2 not-italic font-medium text-sm leading-6"
                  style={{
                    fontFamily: "Roboto, sans-serif",
                  }}
                >
                  Stay up to date & Join our newsletter
                </p>
                <form
                  onSubmit={handleNewsletter}
                  className="flex flex-col gap-3 w-[96%]"
                >
                  <div className="flex flex-col sm:flex-row items-center gap-[18px]">
                    <div className="relative flex-1 w-full sm:w-auto">
                      <div className="absolute inset-y-0 left-1 pl-3 flex items-center pointer-events-none">
                        <img
                          src={FooterEmailArrow}
                          alt=""
                          className="w-[14px] h-[14px]"
                        />
                      </div>
                      <input
                        type="email"
                        placeholder="Enter Email"
                        value={formData.newsletterEmail}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            newsletterEmail: e.target.value,
                          })
                        }
                        className="rounded-xl w-full pl-10 pr-4 py-2 bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder-white/44 focus:outline-none focus:border-mh-yellow/30 transition-colors"
                        required
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-5 w-full sm:w-auto">
                      <button
                        type="submit"
                        disabled={newsletterStatus === "submitting"}
                        className={`rounded-xl px-6 py-2 text-sm font-medium not-italic text-center transition-all duration-300 w-[165px] ${
                          newsletterStatus === "submitting"
                            ? "bg-gray-500 text-white cursor-not-allowed"
                            : 'text-white bg-[url("/sbscb-bg-btn.png")] bg-no-repeat bg-center bg-cover hover:bg-none hover:bg-mh-yellow hover:text-black'
                        }`}
                      >
                        {newsletterStatus === "submitting" ? "..." : "Subscribe"}
                      </button>
                      <button
                        onClick={handleConnectWallet}
                        className="rounded-xl px-6 py-2 text-sm bg-mh-yellow text-black font-semibold hover:brightness-110 transition-all w-[165px] sm:w-[118px]"
                      >
                        Connect
                      </button>
                    </div>
                  </div>
                  {/* Newsletter Status Messages */}
                  {newsletterStatus === "success" && (
                    <p className="text-sm text-green-400">Thanks for subscribing!</p>
                  )}
                  {newsletterStatus === "error" && (
                    <p className="text-sm text-red-400">Something went wrong. Please try again.</p>
                  )}
                </form>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="pt-3 border-t border-white/[0.06] flex flex-col items-center w-full">
              <p
                className="not-italic font-normal text-xs leading-[17px] text-[var(--laser-lemon-500)] text-center w-full"
                style={{
                  fontFamily: "Grotesk, sans-serif",
                }}
              >
                MultiHopper is stable in beta and pre-audit.
              </p>
              <p
                className="not-italic font-normal text-xs leading-[17px] text-white/[0.22] text-center w-full mt-1"
                style={{
                  fontFamily: "Grotesk, sans-serif",
                }}
              >
                © 2025 Multihopper by Strategic Super Reserve and EnigmaFund, All rights reserved.
              </p>
              <p
                className="not-italic font-normal text-xs leading-[17px] text-white/[0.22] text-center w-full mt-1"
                style={{
                  fontFamily: "Grotesk, sans-serif",
                }}
              >
                20A Tanjong Pagar Road, Singapore 088443
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Global Styles for Animations */}
      <style>
        {" "}
        {`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-in {
          animation-fill-mode: both;
        }

        .fade-in {
          animation: fadeIn 0.2s ease-out;
        }

        .slide-in-from-top-2 {
          animation: slideInFromTop 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideInFromTop {
          from { transform: translateY(-8px); }
          to { transform: translateY(0); }
        }

        /* Floating animation for arrows */
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        /* Slow pulse for glow effect */
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.5;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.1);
          }
        }

        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}
      </style>

    </div>
  );
};

export default LandingPage;

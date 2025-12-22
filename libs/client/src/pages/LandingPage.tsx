import React, { useState } from "react";
import { router } from "../router";
import { useWallet } from "@solana/wallet-adapter-react";

// Import SVG assets
import LogoIcon from "../assets/landing/logo-icon.svg";
import TagStars from "../assets/landing/tag-stars.svg";
import CheckmarkIcon from "../assets/landing/checkmark-icon.svg";
import SocialIcons from "../assets/landing/social-icons.svg";
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

  const handleConnectWallet = () => {
    router.navigate({ to: "/login" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
  };

  const handleNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Newsletter subscription:", formData.newsletterEmail);
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
            <div className="relative flex items-center justify-between px-8 py-4 rounded-[24px] backdrop-blur-md bg-[#FAFAFA] bg-opacity-[0.01] w-[100%] max-w-[850px] header-border-gradient">
              {/* Left Side: Logo + Nav Links */}
              <div className="flex items-center gap-12 z-10">
                {/* Logo */}
                <div className="flex items-center gap-3">
                  <img src={LogoIcon} alt="MultiHopper" className="w-6 h-8" />
                  <span className="font-rowdies text-base text-white tracking-wide">
                    MultiHopper
                  </span>
                </div>

                {/* Nav Links */}
                <div className="flex items-center gap-10">
                  <a
                    href="#how-it-works"
                    className="flex items-center gap-1.5 text-sm font-medium text-white/60 hover:text-white transition-colors duration-300"
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
                    className="text-sm font-medium text-white/60 hover:text-white transition-colors duration-300"
                  >
                    FAQ
                  </a>
                </div>
              </div>

              {/* Connect Wallet Button */}
              <div className="z-10">
                <button
                  onClick={handleConnectWallet}
                  className="px-6 py-2.5 rounded-xl text-sm font-medium text-white hover:brightness-110 transition-all duration-300 bg-[#25282B] border border-[#FBFF69] shadow-[0_0_15px_rgba(251,255,105,0.1)]"
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
      <section className="relative w-full px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 lg:pt-12 pb-12 sm:pb-16 lg:pb-20">
        <div className="max-w-7xl mx-auto">
          {/* Hero Content */}
          <div className="relative z-10 text-center">
            {/* Tag Badge */}
            <div
              className="inline-flex items-center gap-2 mb-6 sm:mb-8 px-4 sm:px-6 py-2.5 sm:py-3 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-full"
              style={{ animation: "fadeInUp 0.6s ease-out" }}
            >
              <img src={TagStars} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-medium text-white/90">
                VPN For Sending Digital Assets
              </span>
            </div>

            {/* Main Heading */}
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal leading-[1.05] mb-4 sm:mb-6 tracking-tight"
              style={{ animation: "fadeInUp 0.6s ease-out 0.1s both" }}
            >
              Send Crypto, <span className="text-mh-yellow">Privately</span>
            </h1>

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
                <h2
                  className="font-roboto font-medium mb-8 sm:mb-10 text-left"
                  style={{
                    fontSize: "19.37px",
                    lineHeight: "1.17em",
                    color: "#FFFFFF",
                  }}
                >
                  Create Private Routes in Seconds
                </h2>

                {/* Token Input Card */}
                <div className="relative bg-[#121416] rounded-2xl sm:rounded-3xl p-8 sm:p-10 mb-8">
                  {/* Blurred Overlay Container */}
                  <div
                    className="absolute inset-0 rounded-2xl sm:rounded-3xl flex items-end justify-center pb-16"
                    style={{
                      backdropFilter: "blur(12px)",
                      backgroundColor: "rgba(18, 20, 22, 0.06)",
                      zIndex: 10,
                    }}
                  >
                    <img
                      src="/blurred-arrows.png"
                      alt="Overlay"
                      className="w-24 h-24 object-contain"
                    />
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
                  className="w-full py-4 sm:py-5 bg-mh-yellow text-black font-bold rounded-2xl hover:brightness-110 hover:shadow-lg hover:shadow-mh-yellow/20 transition-all duration-300 text-base sm:text-lg"
                >
                  Connect To Explore
                </button>
              </div>
            </div>

            {/* Subtext */}
            <p
              className="mt-8 sm:mt-12 text-sm sm:text-base md:text-base font-medium text-white mx-auto leading-relaxed px-4 font-roboto font-semibold"
              style={{ animation: "fadeInUp 0.6s ease-out 0.4s both" }}
            >
              Send any digital asset, bouncing it off any wallets <br /> across
              Web3{" "}
              <span className="font-light italic text-white/70">
                even ones you don't own
              </span>
            </p>

            {/* Scroll Indicator */}
            <div
              className="mt-12 sm:mt-16 flex justify-center"
              style={{ animation: "fadeInUp 0.6s ease-out 0.5s both" }}
            >
              <img
                src="/scroll.svg"
                alt="Scroll down"
                className="w-18 h-18 opacity-70 hover:opacity-100 transition-opacity duration-300 animate-bounce"
                style={{ animationDuration: "2s" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Without Complexity Section */}
      <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-14">
            <div className="inline-flex items-center gap-2 mb-4 sm:mb-8 px-4 sm:px-5 py-2 sm:py-2.5 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-full">
              <img src={TagStars} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-medium">
                Privacy Without Complexity
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl leading-[41px] font-light">
              Why users choose <span className="font-medium">MultiHopper</span>
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
                className="group p-6 sm:pl-6 sm:pr-10 backdrop-blur-sm rounded-2xl md:rounded-[34px] card-border-gradient hover:bg-white/[0.04] transition-all duration-500 lg:max-w-[226px] lg:max-h-[155px] w-[100%] h-[100%] "
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
                    color: "#FFF",
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

      {/* Privacy in Motion / Programmable Money Section */}
      <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-14">
            <div className="inline-flex items-center gap-2 mb-4 sm:mb-8 px-4 sm:px-5 py-2 sm:py-2.5 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-full">
              <img src={TagStars} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-medium">
                Privacy in Motion
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl leading-[41px] font-light">
              Welcome to programmable money
            </h2>
          </div>

          {/* Program Images with Text Overlays */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                image: "/program1.png",
                title: "Send any amount of",
                subtitle: "tokens onchain privately",
              },
              {
                image: "/program2.png",
                title: "Route through any",
                subtitle: "wallets you can imagine",
              },
              {
                image: "/program3.png",
                title: "Control how long assets",
                subtitle: "stay in each hop wallet",
              },
            ].map((program, idx) => (
              <div
                key={idx}
                className="group relative h-[360px] sm:h-[400px] w-full overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#16181A] hover:scale-[1.02] transition-all duration-500"
                style={{
                  animation: `fadeInUp 0.5s ease-out ${0.1 * idx}s both`,
                }}
              >
                {/* Full Width Background Image */}
                <img
                  src={program.image}
                  alt={program.title}
                  className="inset-0 w-full h-full object-cover z-0 scale-[1] group-hover:scale-[1.15] transition-transform duration-500"
                />

                {/* Gradient Overlay for Text Readability */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-transparent z-10" />

                {/* Text Overlay */}
                <div className="absolute top-8 left-8 z-20 max-w-[80%]">
                  <h3 className="text-xl font-medium text-white mb-2 leading-tight drop-shadow-lg">
                    {program.title}
                  </h3>
                  <p className="text-white/80 text-base drop-shadow-md font-medium">
                    {program.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center w-[100%] mt-16 ">
            <button
              onClick={() => {
                console.log("Send assets CTA");
              }}
              className="max-w-[124px] w-full py-2 sm:py-3 bg-mh-yellow text-black font-medium text-base rounded-[10px] hover:brightness-110 hover:shadow-lg hover:shadow-mh-yellow/20 transition-all duration-300 font-grotesk"
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
            <div className="inline-flex items-center gap-2 mb-4 sm:mb-8 px-4 sm:px-5 py-2 sm:py-2.5 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-full">
              <img src={TagStars} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-medium">
                Privacy in Motion
              </span>
            </div>
            <h2 className="ext-2xl sm:text-3xl lg:text-5xl leading-[41px] font-light">
              How it all works
            </h2>
          </div>

          {/* Vertical Flowchart - Responsive */}
          <div className="relative flex flex-col items-center">
            {/* Step 1 */}
            <div className="relative z-10 w-full max-w-[240px] md:max-w-[226px] p-4 sm:p-6 bg-gradient-to-br from-[#1E2023]/90 to-[#141618]/90 backdrop-blur-xl card-border-gradient rounded-[34px]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg sm:text-xl font-bold text-mh-yellow bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg">
                  1
                </span>
                <button
                  onClick={handleConnectWallet}
                  className="px-3 sm:px-4 py-2 bg-mh-dark-200 border border-white/[0.1] rounded-[10px] text-xs sm:text-sm font-medium hover:bg-mh-dark-100 transition-colors hover:border-mh-yellow/20"
                >
                  Connect
                </button>
              </div>
              <p className="text-sm sm:text-base font-medium leading-snug">
                Connect <br /> your wallet
              </p>
            </div>

            {/* Connector 1->2 */}
            <div>
              <img
                src="/howitworks1.svg"
                alt=""
                className="h-12 w-auto opacity-80"
              />
            </div>

            {/* Step 2 */}
            <div className="relative z-10 w-full max-w-[260px] md:max-w-[226px] p-4 sm:p-5 bg-gradient-to-br from-[#1E2023]/90 to-[#141618]/90 backdrop-blur-xl card-border-gradient rounded-[34px]">
              <span className="text-lg sm:text-xl font-bold text-mh-yellow bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg mb-3 inline-block">
                2
              </span>
              <p className="text-sm sm:text-base font-medium leading-snug">
                Choose easy mode <br /> or design your route
              </p>
            </div>

            {/* Branching Connectors */}
            <div className="relative w-full max-w-[800px] h-[60px] hidden lg:block">
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
                <div className="relative z-10 w-full max-w-sm lg:w-[312px] h-[-webkit-fill-available] p-4 sm:p-6 bg-gradient-to-br from-[#1E2023]/90 to-[#141618]/90 backdrop-blur-xl card-border-gradient rounded-[34px]">
                  <span className="text-lg sm:text-xl font-bold text-mh-yellow bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg mb-3 inline-block">
                    3
                  </span>
                  <p className="text-base leading-relaxed">
                    <span className="text-mh-yellow font-semibold">
                      Easy mode:
                    </span>{" "}
                    <span className="text-white/90">
                      Privacy in 3 clicks. Our system selects random wallets and
                      hops and you set completion time.
                    </span>
                  </p>
                </div>

                {/* Mobile Connector (Simple Vertical) */}
                <div className="absolute lg:hidden w-1.5 h-8 bg-gradient-to-b from-mh-yellow/30 to-mh-yellow/10" />
                {/* Design Mode Card */}
                <div className="relative z-10 w-full max-w-sm lg:w-[312px] h-[-webkit-fill-available] p-4 sm:p-6 bg-gradient-to-br from-[#1E2023]/90 to-[#141618]/90 backdrop-blur-xl card-border-gradient rounded-[34px]">
                  <span className="text-lg sm:text-xl font-bold text-mh-yellow bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg mb-3 inline-block">
                    3
                  </span>
                  <p className="text-base leading-relaxed">
                    <span className="text-mh-yellow font-semibold">
                      Design mode:
                    </span>{" "}
                    <span className="text-white/80">
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
                className="h-12 w-auto opacity-80"
              />
            </div>

             {/* Mobile Connector (Simple Vertical) */}
            <div className="lg:hidden w-1.5 h-8 bg-gradient-to-b from-mh-yellow/30 to-mh-yellow/10" />

            {/* Step 4 */}
            <div className="relative z-10 w-full max-w-[240px] sm:max-w-[286px] p-4 sm:p-6 sm:pl-14 bg-gradient-to-br from-[#1E2023]/90 to-[#141618]/90 backdrop-blur-xl card-border-gradient rounded-[34px] flex flex-col justify-center">
              <span className="text-lg sm:text-xl font-bold text-mh-yellow bg-[#232724] w-[45px] h-[45px] flex items-center justify-center rounded-lg mb-3 inline-block">
                4
              </span>
              <p className="text-sm sm:text-base font-medium leading-snug">
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
            <div className="inline-flex items-center gap-2 mb-4 sm:mb-8 px-4 sm:px-5 py-2 sm:py-2.5 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-full">
              <span className="text-xs sm:text-sm font-medium">FAQ</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium mb-2">
              Frequently asked questions
            </h2>
            <p className="text-sm sm:text-base text-white/50">
              Have questions? We're here to help.
            </p>
          </div>

          {/* Search Bar */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center bg-mh-dark-400/40 border border-white/[0.06] rounded-xl sm:rounded-2xl overflow-hidden">
              <svg
                className="w-5 h-5 ml-4 sm:ml-6 text-white/30 flex-shrink-0"
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
                className="flex-1 px-3 sm:px-4 py-3.5 sm:py-4 bg-transparent text-sm sm:text-base text-white placeholder-white/30 focus:outline-none"
              />
              <button className="mr-2 px-4 sm:px-6 py-2 sm:py-2.5 bg-mh-yellow text-black font-semibold rounded-lg sm:rounded-xl hover:brightness-110 transition-all text-sm">
                Search
              </button>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="p-4 sm:p-6 bg-[#16181A] border border-white/[0.08] rounded-2xl sm:rounded-3xl hover:border-white/[0.15] transition-colors duration-300"
              >
                <button
                  onClick={() =>
                    setExpandedFaq(expandedFaq === idx ? null : idx)
                  }
                  className="w-full flex items-center justify-between text-left gap-4"
                >
                  <h3 className="text-sm sm:text-base lg:text-lg font-medium text-white">
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
                      ? "max-h-40 opacity-100 mt-4"
                      : "max-h-0 opacity-0"
                  }`}
                >
                  <p className="text-sm text-white/60 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center w-[100%] mt-16 ">
            <button
              onClick={() => {
                console.log("show more CTA");
              }}
              className="max-w-[124px] w-full py-2 border border-mh-yellow bg-[#25282b] text-white font-medium rounded-xl hover:bg-mh-yellow hover:text-black transition-all duration-300 text-sm flex items-center justify-center font-grotesk"
            >
              Show more
            </button>
          </div>
        </div>
      </section>

      {/* Collaborate / Hop with Us Section */}
      <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-10">
            <div className="inline-flex items-center gap-2 mb-4 sm:mb-8 px-4 sm:px-5 py-2 sm:py-2.5 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-full">
              <img src={TagStars} alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-medium">
                Collaborate
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium">
              Hop with Us
            </h2>
          </div>

          <div
            className="relative max-w-2xl mx-auto p-6 sm:p-8 lg:p-10 bg-[#16181A] border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-2xl"
            style={{
              background:
                "linear-gradient(#1D2022, #1D2022) padding-box, linear-gradient(0deg, rgba(255,255,255,0) 23%, rgba(255,255,255,0.5) 49%, rgba(255,255,255,0) 75%) border-box",
            }}
          >
            {/* Bunny Icon Top Right */}
            <div className="absolute top-8 right-8 w-[72px] h-[72px] bg-[#fbff69] bg-opacity-[0.26] flex items-center justify-center rounded-[17px]">
              <div className="w-[59px] h-[59px] rounded-[17px] bg-mh-yellow  flex items-center justify-center">
                <img
                  src="/formbunny.png"
                  alt=""
                  className="w-[27px] h-[40px]"
                />
              </div>
            </div>

            <h3 className="text-xl sm:text-2xl font-semibold mb-3">
              Let's Talk
            </h3>
            <p className="text-sm sm:text-base text-white/50 mb-6 sm:mb-8 pr-16">
              Looking to partner with us, or resell the <br /> MultiHopper to
              your clients?
            </p>

            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-xs sm:text-sm text-white/50 mb-2">
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
                      className="w-full pl-10 pr-4 py-3 sm:py-3.5 bg-[#1E2023] border border-white/[0.06] rounded-xl text-sm sm:text-base text-white placeholder-white/30 focus:outline-none focus:border-mh-yellow/30 transition-colors"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm text-white/50 mb-2">
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
                      className="w-full pl-10 pr-4 py-3 sm:py-3.5 bg-[#1E2023] border border-white/[0.06] rounded-xl text-sm sm:text-base text-white placeholder-white/30 focus:outline-none focus:border-mh-yellow/30 transition-colors"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm text-white/50 mb-2">
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
                    className="w-full pl-10 pr-4 py-3 sm:py-3.5 bg-[#1E2023] border border-white/[0.06] rounded-xl text-sm sm:text-base text-white placeholder-white/30 focus:outline-none focus:border-mh-yellow/30 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-xs sm:text-sm text-white/50 mb-2">
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
                      className="w-full pl-10 pr-4 py-3 sm:py-3.5 bg-[#1E2023] border border-white/[0.06] rounded-xl text-sm sm:text-base text-white placeholder-white/30 focus:outline-none focus:border-mh-yellow/30 transition-colors"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm text-white/50 mb-2">
                    TG Handle*
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
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
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
                      className="w-full pl-10 pr-4 py-3 sm:py-3.5 bg-[#1E2023] border border-white/[0.06] rounded-xl text-sm sm:text-base text-white placeholder-white/30 focus:outline-none focus:border-mh-yellow/30 transition-colors"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm text-white/50 mb-2">
                  Reasons for contacting?
                </label>
                <textarea
                  placeholder="Describe reasoning ..."
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  rows={4}
                  className="w-full px-4 py-3 sm:py-3.5 bg-[#1E2023] border border-white/[0.06] rounded-xl text-sm sm:text-base text-white placeholder-white/30 focus:outline-none focus:border-mh-yellow/30 transition-colors resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <span>@MULTIHOPPERDEV</span>
                </div>
                <button
                  type="submit"
                  className="min-w-[132px] px-8 py-3 border border-mh-yellow  bg-[#25282b] text-white font-medium rounded-xl hover:bg-mh-yellow hover:text-black transition-all duration-300 text-sm font-grotesk"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative mt-20">
        {/* Helper SVG for filtering/definitions if needed, or just the Shape */}

        {/* Top Wave Cap */}
        <div className="w-full h-[40px] leading-none overflow-hidden sticky-top">
          <svg
            className="block w-full h-full"
            viewBox="0 0 1440 40"
            preserveAspectRatio="none"
          >
            {/* 1. Fill Path (Background Color #222426) */}
            <path
              d="M0,1 L680,1 C710,1 710,38 720,38 C730,38 730,1 760,1 L1440,1 V42 H0 Z"
              fill="#222426"
              stroke="none"
            />

            {/* 2. Stroke Path (Yellow Line) */}
            <path
              d="M0,1 L680,1 C710,1 710,38 720,38 C730,38 730,1 760,1 L1440,1"
              fill="none"
              stroke="#FBFF69"
              strokeWidth="2"
            />

            {/* Arrow Icon - Scroll to Top Button */}
            <g
              transform="translate(712, 12) scale(0.6)"
              className="cursor-pointer hover:opacity-80 transition-all duration-300"
              onClick={scrollToTop}
              style={{ pointerEvents: "all" }}
            >
              <circle
                cx="12"
                cy="12"
                r="11"
                fill="transparent"
                className="hover:fill-white/10 transition-all duration-300"
              />
              <path
                d="M12 19V5M5 12l7-7 7 7"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="hover:stroke-[#FBFF69] transition-colors duration-300"
              />
            </g>
          </svg>
        </div>

        {/* Main Footer Body */}
        <div className="w-full bg-[#222426] px-4 sm:px-6 lg:px-8 pb-10 sm:pb-12 lg:pb-16 pt-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-12 mb-10 sm:mb-12">
              {/* Logo and Description (Left - Spans 5 cols) */}
              <div className="lg:col-span-5">
                <button
                  onClick={() => router.navigate({ to: "/" })}
                  className="flex items-center gap-2.5 mb-4 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <img src={LogoIcon} alt="MultiHopper" className="w-7 h-9" />
                  <span className="text-xl sm:text-2xl font-rowdies">
                    MultiHopper
                  </span>
                </button>
                <p className="text-sm text-white/50 mb-8 max-w-sm leading-relaxed">
                  Smart Privacy for Onchain Transfers. Full control, total
                  privacy, 100% onchain.
                </p>

                {/* Newsletter */}
                <div>
                  <p className="text-sm font-semibold text-white mb-3">
                    Stay up to date & Join our newsletter
                  </p>
                  <form
                    onSubmit={handleNewsletter}
                    className="flex gap-2 max-w-md"
                  >
                    <div className="relative flex-1">
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
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
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
                        className="w-full pl-10 pr-4 py-3 bg-[#16181A] border border-white/[0.08] rounded-full text-sm text-white placeholder-white/30 focus:outline-none focus:border-mh-yellow/30 transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-6 py-3 border border-white text-white text-sm font-medium rounded-full hover:bg-white hover:text-black transition-colors flex-shrink-0"
                    >
                      Subscribe
                    </button>
                  </form>
                </div>
              </div>

              {/* Spacers */}
              <div className="lg:col-span-1"></div>

              {/* Links Sections (Right - Spans 6 cols split into 3) */}
              <div className="lg:col-span-2">
                <h4 className="font-semibold mb-6 text-sm">Info</h4>
                <ul className="space-y-4 text-sm text-white/50 ">
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
                </ul>
              </div>

              <div className="lg:col-span-2">
                <h4 className="font-semibold mb-6 text-sm">Resources</h4>
                <ul className="space-y-4 text-sm text-white/50">
                  <li>
                    <a
                      href="#collaborate"
                      className="hover:text-white transition-colors"
                    >
                      Hop with us
                    </a>
                  </li>
                  <li>
                    <a
                      href="#medium"
                      className="hover:text-white transition-colors"
                    >
                      Medium
                    </a>
                  </li>
                  <li>
                    <a
                      href="#terms"
                      className="hover:text-white transition-colors"
                    >
                      Terms & Conditions
                    </a>
                  </li>
                </ul>
              </div>

              <div className="lg:col-span-2">
                <h4 className="font-semibold mb-6 text-sm">Social Media</h4>
                <ul className="space-y-4 text-sm text-white/50">
                  <li>
                    <a
                      href="#twitter"
                      className="hover:text-white transition-colors"
                    >
                      Twitter/X
                    </a>
                  </li>
                  <li>
                    <a
                      href="#telegram"
                      className="hover:text-white transition-colors"
                    >
                      Telegram
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs sm:text-sm text-white/40">
                © 2025 Multihopper, All rights reserved.
              </p>

              <button
                onClick={handleConnectWallet}
                className="px-6 py-2.5 bg-mh-yellow text-black font-semibold rounded-full hover:brightness-110 transition-all text-sm"
              >
                Connect
              </button>
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
      `}
      </style>
    </div>
  );
};

export default LandingPage;

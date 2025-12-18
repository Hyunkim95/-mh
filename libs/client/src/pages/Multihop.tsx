import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { useNavigate } from "@tanstack/react-router";
import { useInitializeTokenConfig } from "../hooks/useInitializeTokenConfig";
import { trpc } from "../trpc";
import { TokenConfigForm } from "../components/TokenConfigForm";
import { RouteCreateForm } from "../components/RouteCreateForm";
import { HopsTab } from "../components/HopsTab";
import { useSubmitRoute } from "../hooks/useSubmitRoute";
import { TokenConfigsTable } from "../components/TokenConfigsTable";
import { useSolanaAuth } from "../hooks/useSolanaAuth";

function App() {
  const { publicKey } = useWallet();
  const navigate = useNavigate();
  const {
    handleIntiaizlizeTokenConfig,
    handleIntiaizlizeTokenConfigSOL,
    tokenConfigPending,
    solTokenConfigPending,
    tokenConfigError,
    solTokenConfigError,
  } = useInitializeTokenConfig({ publicKey });
  const initializeRoute = trpc.contract.initializeRoute.useMutation();
  const _splTokens = trpc.tokens.getTokenAccounts.useQuery();

  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation();
  const { data: tokenConfigs, isLoading: tokenConfigsLoading } =
    trpc.tokenConfigs.getTokenConfigs.useQuery();
  const [activeTab, setActiveTab] = useState<
    "token-config" | "routes" | "hops"
  >("token-config");
  
  const handleViewTokenConfig = (config: any) => {
    navigate({ to: "/token-config/$tokenConfigId", params: { tokenConfigId: config.id.toString() } });
  };
  const { logout, userData } = useSolanaAuth();
  const { handleRouteSubmit } = useSubmitRoute({ publicKey });

  return (
    <div className="min-h-screen bg-gray-100 w-full">
      <Toaster position="top-right" />
      <header className="bg-white shadow-sm border-b">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">Multihopper</h1>
            <button
              onClick={() => {
                logout();
                window.location.reload();
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <>
          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-8 bg-gray-200 p-1 rounded-lg max-w-lg">
            <button
              onClick={() => setActiveTab("token-config")}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === "token-config"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Token Config
            </button>
            <button
              onClick={() => setActiveTab("routes")}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === "routes"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Routes
            </button>
            <button
              onClick={() => setActiveTab("hops")}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === "hops"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Hops
            </button>
          </div>

          {/* Token Config Tab */}
          {activeTab === "token-config" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <TokenConfigForm
                  creator={userData?.publicKey || ""}
                  feeTreasury={userData?.publicKey || ""}
                  type="SPL"
                  onSubmit={async (data) => {
                    await handleIntiaizlizeTokenConfig(data);
                  }}
                  isLoading={tokenConfigPending}
                  error={tokenConfigError?.message}
                />

                <TokenConfigForm
                  type="SOL"
                  creator={userData?.publicKey || ""}
                  feeTreasury={userData?.publicKey || ""}
                  onSubmit={async (data) => {
                    await handleIntiaizlizeTokenConfigSOL(data);
                  }}
                  isLoading={solTokenConfigPending}
                  error={solTokenConfigError?.message}
                />
              </div>

              <TokenConfigsTable
                tokenConfigs={tokenConfigs || []}
                loading={tokenConfigsLoading}
                onView={handleViewTokenConfig}
              />
            </div>
          )}

          {/* Routes Tab */}
          {activeTab === "routes" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <RouteCreateForm
                  type="SPL"
                  onSubmit={(data) => handleRouteSubmit(data, "SPL")}
                  isLoading={initializeRoute.isPending}
                  error={initializeRoute.error?.message}
                />

                <RouteCreateForm
                  type="SOL"
                  onSubmit={(data) => handleRouteSubmit(data, "SOL")}
                  isLoading={initializeRouteSOL.isPending}
                  error={initializeRouteSOL.error?.message}
                />
              </div>
            </div>
          )}

          {/* Hops Tab */}
          {activeTab === "hops" && <HopsTab />}
        </>
      </div>
    </div>
  );
}

export default App;

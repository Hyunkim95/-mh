import { trpc } from "../trpc";
import { PublicKey } from "@solana/web3.js";

interface TokenConfigProps {
  publicKey: PublicKey;
  splMint: string;
  setSplMint: (splMint: string) => void;
}

export const ViewTokenConfig = ({
  publicKey,
  splMint,
  setSplMint,
}: TokenConfigProps) => {
  const getTokenConfigSOL = trpc.contract.getTokenConfigSOL.useQuery(
    {
      creator: publicKey?.toBase58() ?? "",
    },
    {
      enabled: !!publicKey && !!splMint,
    }
  );

  const getTokenConfigSPL = trpc.contract.getTokenConfigSPL.useQuery(
    {
      splMint: splMint,
      creator: publicKey?.toBase58() ?? "",
    },
    {
      enabled: !!publicKey && !!splMint,
    }
  );

  return (
    <>
      {/* Token Config Display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SPL Token Config */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">SPL Token Config</h3>
          <input
            type="text"
            value={splMint}
            onChange={(e) => setSplMint(e.target.value)}
            placeholder="Enter SPL mint address"
            className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
          />
          <button
            onClick={() => getTokenConfigSPL.refetch()}
            className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Get SPL Token Config
          </button>
          {getTokenConfigSPL.data && (
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-800">Min Transfer:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSPL.data.data?.minTransfer}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-800">SPL Mint:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSPL.data.data?.splMint}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Fee Bps:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSPL.data.data?.feeBps}
                </span>{" "}
                %{" "}
              </div>
              <div>
                <span className="font-medium text-gray-800">Max Hops:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSPL.data.data?.maxHops}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Max Delay:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSPL.data.data?.maxDelaySeconds}s
                </span>
              </div>
            </div>
          )}
        </div>

        {/* SOL Token Config */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">SOL Token Config</h3>
          <button
            onClick={() => getTokenConfigSOL.refetch()}
            className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Get SOL Token Config
          </button>
          {getTokenConfigSOL.data && (
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-800">Min Transfer:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSOL.data.data?.minTransfer}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Fee Bps:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSOL.data.data?.feeBps}
                </span>{" "}
                %{" "}
              </div>
              <div>
                <span className="font-medium text-gray-800">Max Hops:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSOL.data.data?.maxHops}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Max Delay:</span>{" "}
                <span className="font-mono text-xs text-gray-800">
                  {getTokenConfigSOL.data.data?.maxDelaySeconds}s
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

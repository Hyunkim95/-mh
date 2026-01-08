import { trpc } from "../trpc";
import { PublicKey } from "@solana/web3.js";

interface TokenConfigProps {
  publicKey: PublicKey;
  splMint: string;
  setSplMint: (splMint: string) => void;
}

export const ViewTokenConfig = ({
  splMint,
  setSplMint,
}: TokenConfigProps) => {

  const getTokenConfigSPL = trpc.contract.getTokenConfigSPL.useQuery();

  return (
    <>
      {/* Token Config Display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SPL Token Config */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Token Config</h3>
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
            Get Token Config
          </button>
          {getTokenConfigSPL.data && (
            <div className="space-y-2 text-sm">
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
            </div>
          )}
        </div>
      </div>
    </>
  );
};

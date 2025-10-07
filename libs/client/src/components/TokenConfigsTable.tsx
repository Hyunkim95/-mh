import React from "react";

interface TokenConfigsTableProps {
  tokenConfigs: Array<{
    id: number;
    tokenConfigAddress: string;
    creator: string;
    minTransferAmount: number;
    feeBps: number;
    feeTreasury: string;
    maxHops: number;
    maxDelaySeconds: number;
    timelockSeconds: number;
    flatFeeLamports: number;
    pairAddress: string;
  }>;
  loading?: boolean;
}

export const TokenConfigsTable: React.FC<TokenConfigsTableProps> = ({
  tokenConfigs,
  loading = false,
}) => {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  };

  const formatLamports = (lamports: number) => {
    return (lamports / 1_000_000_000).toFixed(6);
  };

  const formatFeeBps = (bps: number) => {
    return (bps / 100).toFixed(2);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (tokenConfigs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No token configurations found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200 rounded-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Config Address
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Creator
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Min Transfer
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Fee %
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Fee Treasury
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Max Hops
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Max Delay
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Timelock
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Flat Fee (SOL)
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Pair Address
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tokenConfigs.map((config) => (
            <tr key={config.id} className="hover:bg-gray-50">
              <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {config.id}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                <span className="font-mono" title={config.tokenConfigAddress}>
                  {formatAddress(config.tokenConfigAddress)}
                </span>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                <span className="font-mono" title={config.creator}>
                  {formatAddress(config.creator)}
                </span>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {config.minTransferAmount.toLocaleString()}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatFeeBps(config.feeBps)}%
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                <span className="font-mono" title={config.feeTreasury}>
                  {formatAddress(config.feeTreasury)}
                </span>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {config.maxHops}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDuration(config.maxDelaySeconds)}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDuration(config.timelockSeconds)}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatLamports(config.flatFeeLamports)}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                <span className="font-mono" title={config.pairAddress}>
                  {formatAddress(config.pairAddress)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
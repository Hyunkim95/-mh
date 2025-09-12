import React, { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import { ExecutorWallet } from './ExecutorWallet';
import { useTriggerHop } from '../hooks';
import { PublicKey } from '@solana/web3.js';
import toast from 'react-hot-toast';
import { useDeploy } from '../hooks/useDeploy';
import { convertTimestampHopsToIHopInput, TimestampHopInput } from '../types/route';
import { TimezoneAwareDateDisplay } from './TimezoneAwareDatePicker';

interface Route {
  id: number;
  routeId: number;
  name?: string | null;
  description?: string | null;
  tokenType: string;
  tokenMint?: string | null;
  tokenDecimals: number;
  hopAmountTokens: string;
  hopAmountRaw: string;
  hops?: TimestampHopInput[];
  creator: string;
  status: string;
  createdAt: string;
  deployedAt?: string | null;
  deploymentTxHash?: string | null;
  routeConfigPda?: string | null;
  canDeploy: boolean;
  deploymentStatus: 'draft' | 'deploying' | 'deployed' | 'failed';
}

interface RouteDetailViewProps {
  route?: Route;
  onBack: () => void;
}

const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export const RouteDetailView: React.FC<RouteDetailViewProps> = ({ route, onBack }) => {
  const [queryEnabled, setQueryEnabled] = useState<boolean>(false);
  const { deploy } = useDeploy();

  // Initialize trigger hop hook with state refresh callback
  const { mutateAsync, isPending: isTriggering, error: triggerError, isSuccess, data: triggerData, reset } = useTriggerHop(() => {
    // Refetch both route state and config after successful hop
    setTimeout(() => {
      routeStateQuery.refetch();
      routeConfigQuery.refetch();
    }, 1000);
  });

  // tRPC queries for onchain data (only if deployed)
  const routeConfigQuery = trpc.contract.getRouteConfig.useQuery(
    {
      routeId: route?.routeId || 0,
    },
    {
      enabled: queryEnabled && !!route && route.status === 'deployed'
    }
  );

  const routeStateQuery = trpc.contract.getRouteState.useQuery(
    {
      routeId: route?.routeId || 0,
    },
    {
      enabled: queryEnabled && !!route && route.status === 'deployed'
    }
  );

  // Auto-fetch onchain data if route is deployed
  useEffect(() => {
    if (route && route.status === 'deployed') {
      setQueryEnabled(true);
    }
  }, [route]);

  // Handle trigger hop
  const handleTriggerHop = async () => {
    if (!route) return;
    
    try {
      reset();
      await mutateAsync({
        routeId: route.routeId,
        creator: route.creator,
        splMint: route.tokenMint || NATIVE_MINT.toBase58(),
      });
      routeStateQuery.refetch();
    } catch (error) {
      console.error('Failed to trigger hop:', error);
    }
  };

  const handleDeploy = async () => {
    if (!route || !route.hops) return;    
    try {
      toast.success(`Deploying route ${route.routeId}... (Implementation pending)`);
      
      // Convert timestamp-based hops to IHopInput format
      const convertedHops = convertTimestampHopsToIHopInput(route.hops);
      
      await deploy({
        routeId: route.routeId,
        routes: convertedHops,
        hopAmount: route.hopAmountTokens,
        splMint: route.tokenMint || NATIVE_MINT.toBase58(),
      }, route.tokenType === 'SPL' ? 'SPL' : 'SOL');
    } catch (error) {
      console.error('Deploy failed:', error);
      toast.error(`Deploy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Calculate delay from timestamp differences for display
  const calculateDelay = (currentIndex: number): string => {
    if (!route?.hops || currentIndex === 0) return 'Immediate';
    
    const currentTime = new Date(route.hops[currentIndex].scheduledAt).getTime();
    const prevTime = new Date(route.hops[currentIndex - 1].scheduledAt).getTime();
    const diffMinutes = Math.round((currentTime - prevTime) / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes} minutes`;
    } else if (diffMinutes < 24 * 60) {
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      return `${hours}h ${mins}m`;
    } else {
      const days = Math.floor(diffMinutes / (24 * 60));
      const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
      return `${days}d ${hours}h`;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      draft: 'bg-gray-100 text-gray-800',
      deploying: 'bg-yellow-100 text-yellow-800',
      deployed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[status as keyof typeof statusColors] || statusColors.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



  if (!route) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-red-500">Route not found</div>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            Back to Routes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {route.name || `Route #${route.routeId}`}
            </h1>
            {route.description && (
              <p className="text-gray-600 mt-1">{route.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {getStatusBadge(route.status)}
          {route.canDeploy && (
            <button
              onClick={handleDeploy}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Deploy Route
            </button>
          )}
        </div>
      </div>

      {/* Route Information Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-blue-800">Route Information</h3>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600">Route ID</p>
              <p className="font-semibold text-gray-900">{route.routeId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Token Type</p>
              <p className="font-semibold text-gray-900">{route.tokenType}</p>
            </div>
            {route.tokenMint && (
              <div>
                <p className="text-sm text-gray-600">Token Mint</p>
                <p className="font-mono text-sm text-gray-900 break-all">{route.tokenMint}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-600">Hop Amount</p>
              <p className="font-semibold text-gray-900">{route.hopAmountTokens} {route.tokenType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Number of Hops</p>
              <p className="font-semibold text-gray-900">{route.hops?.length || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Creator</p>
              <p className="font-mono text-sm text-gray-900 break-all">{route.creator}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Created At</p>
              <p className="font-semibold text-gray-900">{formatDate(route.createdAt)}</p>
            </div>
            {route.deployedAt && (
              <div>
                <p className="text-sm text-gray-600">Deployed At</p>
                <p className="font-semibold text-gray-900">{formatDate(route.deployedAt)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Deployment Information */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-purple-800">Deployment Information</h3>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600">Status</p>
              {getStatusBadge(route.status)}
            </div>
            {route.deploymentTxHash && (
              <div>
                <p className="text-sm text-gray-600">Deployment Transaction</p>
                <div className="flex items-center space-x-2">
                  <p className="font-mono text-sm text-gray-900 truncate">{route.deploymentTxHash}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(route.deploymentTxHash || '')}
                    className="text-blue-600 hover:text-blue-800 text-xs"
                  >
                    Copy
                  </button>
                  <a
                    href={`https://explorer.solana.com/tx/${route.deploymentTxHash}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-xs"
                  >
                    View
                  </a>
                </div>
              </div>
            )}
            {route.routeConfigPda && (
              <div>
                <p className="text-sm text-gray-600">Route Config PDA</p>
                <p className="font-mono text-sm text-gray-900 break-all">{route.routeConfigPda}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hops Configuration */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4 text-green-800">Hops Schedule</h3>
        <div className="space-y-3">
          {route.hops && route.hops.length > 0 ? route.hops.map((hop, index) => (
            <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-gray-700">Hop {index + 1}</span>
                {routeStateQuery.data?.data?.currentHopIndex === index + 1 && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                    Current
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Recipient</p>
                  <p className="font-mono text-sm text-gray-900 break-all">{hop.recipient}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Scheduled Time</p>
                  <TimezoneAwareDateDisplay 
                    utcTimestamp={hop.scheduledAt}
                    format="schedule"
                    className="font-semibold text-gray-900"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Delay from Previous</p>
                  <p className="font-semibold text-gray-900">{calculateDelay(index)}</p>
                </div>
              </div>
            </div>
          )) : <div className="text-gray-500">No hops configured</div>}
        </div>
      </div>

      {/* Onchain Data (only show if deployed and data is available) */}
      {route.status === 'deployed' && (routeConfigQuery.data || routeStateQuery.data) && (
        <>
          {/* Route Configuration from Chain */}
          {routeConfigQuery.data && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-xl font-semibold mb-4 text-green-800">Onchain Route Configuration</h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Creator</p>
                    <p className="font-mono text-sm break-all text-blue-600">{routeConfigQuery.data.data?.creator}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Token Config</p>
                    <p className="font-mono text-sm break-all text-blue-600">{routeConfigQuery.data.data?.tokenConfig}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Source Owner</p>
                    <p className="font-mono text-sm break-all text-blue-600">{routeConfigQuery.data.data?.sourceOwner}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Executor</p>
                    <p className="font-mono text-sm break-all text-blue-600">{routeConfigQuery.data.data?.executor}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Hop Amount</p>
                    <p className="font-semibold text-blue-600">{routeConfigQuery.data.data?.hopAmount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Is Finalized</p>
                    <p className={`font-semibold ${routeConfigQuery.data.data?.isFinalized ? 'text-green-600' : 'text-yellow-600'}`}>
                      {routeConfigQuery.data.data?.isFinalized ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Route State from Chain */}
          {routeStateQuery.data && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-xl font-semibold mb-4 text-purple-800">Onchain Route State</h3>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Current Hop Index</p>
                    <p className="text-2xl font-bold text-purple-800">{routeStateQuery.data.data?.currentHopIndex || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Progress</p>
                    <p className="text-lg font-semibold">
                      {(routeStateQuery.data.data?.currentHopIndex || 0)} / {routeConfigQuery.data?.data?.hops.length || (route.hops?.length || 0)}
                    </p>
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${(((routeStateQuery.data.data?.currentHopIndex || 0)) / (routeConfigQuery.data?.data?.hops.length || (route.hops?.length || 0))) * 100}%`
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.round(((routeStateQuery.data.data?.currentHopIndex || 0)) / (routeConfigQuery.data?.data?.hops.length || (route.hops?.length || 0))) * 100}% Complete
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Hop Control Section */}
          {routeStateQuery.data && routeConfigQuery.data && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-xl font-semibold mb-4 text-orange-800">Hop Control</h3>
              
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                {/* Success Message */}
                {isSuccess && triggerData?.success && (
                  <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                    <p className="font-semibold">🎉 Hop triggered successfully!</p>
                    <div className="mt-2">
                      <p className="text-sm font-medium mb-1">Transaction Signature:</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-white px-2 py-1 rounded border break-all">
                          {triggerData.data?.signature}
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(triggerData.data?.signature || '')}
                          className="px-2 py-1 bg-green-200 text-green-800 rounded text-xs hover:bg-green-300 transition-colors"
                        >
                          Copy
                        </button>
                        <a
                          href={`https://explorer.solana.com/tx/${triggerData.data?.signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs hover:bg-blue-300 transition-colors"
                        >
                          View on Explorer
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {triggerError && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    <p className="font-semibold">Error triggering hop:</p>
                    <p>{triggerError.message}</p>
                  </div>
                )}

                {/* Trigger Button */}
                {(() => {
                  const currentHopIndex = routeStateQuery.data.data?.currentHopIndex || 0;
                  const totalHops = routeConfigQuery.data.data?.hops.length || (route.hops?.length || 0);
                  const isComplete = currentHopIndex >= totalHops;

                  return (
                    <button
                      onClick={handleTriggerHop}
                      disabled={isTriggering || isComplete}
                      className={`w-full py-3 px-6 rounded-md font-semibold transition-colors ${
                        isComplete
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : isTriggering
                          ? 'bg-orange-300 text-orange-700 cursor-not-allowed'
                          : 'bg-orange-500 text-white hover:bg-orange-600'
                      }`}
                    >
                      {isComplete
                        ? 'Route Complete'
                        : isTriggering
                        ? 'Triggering Hop...'
                        : 'Trigger Next Hop'
                      }
                    </button>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {/* Executor Wallet (only show if deployed) */}
      {route.status === 'deployed' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold mb-4 text-indigo-800">Executor Wallet</h3>
          <ExecutorWallet routeId={route.routeId} />
        </div>
      )}
    </div>
  );
};

// Export is already done above 
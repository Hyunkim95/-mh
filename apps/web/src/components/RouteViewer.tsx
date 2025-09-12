import React, { useState } from 'react';
import { trpc } from '../lib/trpc';
import { ExecutorWallet } from './ExecutorWallet';
import { useTriggerHop } from '../hooks';
import { PublicKey } from '@solana/web3.js';

export interface RouteViewerProps {}

const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export const RouteViewer: React.FC<RouteViewerProps> = () => {
  const [routeId, setRouteId] = useState<string>('');
  const [splMint, setSplMint] = useState<string>(NATIVE_MINT.toBase58());
  const [queryEnabled, setQueryEnabled] = useState<boolean>(false);

  // Initialize trigger hop hook with state refresh callback
  const { mutateAsync, isPending: isTriggering, error: triggerError, isSuccess, data: triggerData, reset } = useTriggerHop(() => {
    // Refetch both route state and config after successful hop
    setTimeout(() => {
      routeStateQuery.refetch();
      routeConfigQuery.refetch();
    }, 1000); // Small delay to allow blockchain state to update
  });
  // tRPC queries
  const routeConfigQuery = trpc.contract.getRouteConfig.useQuery(
    {
      routeId: parseInt(routeId) || 0,
    },
    {
      enabled: queryEnabled && !!routeId
    }
  );

  const routeStateQuery = trpc.contract.getRouteState.useQuery(
    {
      routeId: parseInt(routeId) || 0,
    },
    {
      enabled: queryEnabled && !!routeId
    }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (routeId) {
      setQueryEnabled(true);
      routeConfigQuery.refetch();
      routeStateQuery.refetch();
    }
  };

  // Handle trigger hop
  const handleTriggerHop = async () => {
    try {
      reset(); // Reset any previous states
      await mutateAsync({
        routeId: parseInt(routeId),
        creator: routeConfigQuery.data?.data?.creator ?? '',
        splMint: splMint,
      });
      // Refetch route state after successful hop trigger
      routeStateQuery.refetch();
    } catch (error) {
      console.error('Failed to trigger hop:', error);
    }
  };

  const baseInputStyles = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelStyles = 'block text-sm font-medium text-gray-700 mb-1';
  const containerStyles = 'mb-4';
  console.log(routeConfigQuery.data)

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-blue-800">
        Route Viewer
      </h2>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={containerStyles}>
            <label className={labelStyles}>Route ID</label>
            <input
              type="number"
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              placeholder="Enter route ID"
              className={baseInputStyles}
              required
            />
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>SPL Mint</label>
            <input
              type="text"
              value={splMint}
              onChange={(e) => setSplMint(e.target.value)}
              placeholder="Enter SPL mint"
              className={baseInputStyles}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          Search Route
        </button>
      </form>

      {/* Loading States */}
      {(routeConfigQuery.isLoading || routeStateQuery.isLoading) && (
        <div className="text-center py-8">
          <div className="text-gray-600">Loading route information...</div>
        </div>
      )}

      {/* Error States */}
      {(routeConfigQuery.error || routeStateQuery.error) && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          <p className="font-semibold">Error loading route:</p>
          <p>{routeConfigQuery.error?.message || routeStateQuery.error?.message}</p>
        </div>
      )}

      {/* Route Configuration */}
      {routeConfigQuery.data && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-green-800">Route Configuration</h3>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Creator</p>
                <p className="font-mono text-sm break-all text-blue-600">{routeConfigQuery.data.data?.creator}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Route ID</p>
                <p className="font-semibold text-blue-600">{routeConfigQuery.data.data?.routeId}</p>
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
              <div>
                <p className="text-sm text-gray-600">Created At</p>
                <p className="font-semibold text-blue-600">{new Date(parseInt(routeConfigQuery.data.data?.createdAt || '0') * 1000).toLocaleString()}</p>
              </div>
            </div>

            {/* Hops */}
            <div className="mt-6">
              <h4 className="text-lg font-semibold mb-3 text-gray-800">Route Hops ({routeConfigQuery.data.data?.hops.length || 0})</h4>
              <div className="space-y-3">
                {routeConfigQuery.data.data?.hops.map((hop, index) => (
                  <div key={index} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-gray-700">Hop {index + 1}</span>
                      {routeStateQuery.data?.data?.currentHopIndex === index + 1 && (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500">Recipient</p>
                        <p className="font-mono text-sm break-all text-blue-600">{hop.recipient}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Delay (seconds)</p>
                        <p className="font-semibold text-blue-600">{hop.delaySeconds}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Route State */}
      {routeStateQuery.data && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-purple-800">Route State</h3>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Current Hop Index</p>
                <p className="text-2xl font-bold text-purple-800">{routeStateQuery.data.data?.currentHopIndex || 0}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Progress</p>
                <p className="text-lg font-semibold">
                  {(routeStateQuery.data.data?.currentHopIndex || 0)} / {routeConfigQuery.data?.data?.hops.length || '?'}
                </p>
              </div>
            </div>
            
            {routeConfigQuery.data && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(((routeStateQuery.data.data?.currentHopIndex || 0)) / (routeConfigQuery.data.data?.hops.length || 0)) * 100}%`
                    }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {Math.round(((routeStateQuery.data.data?.currentHopIndex || 0)) / (routeConfigQuery.data.data?.hops.length || 0)) * 100}% Complete
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trigger Hop Section */}
      {routeStateQuery.data && routeConfigQuery.data && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-orange-800">Hop Control</h3>
          
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            {/* Current Hop Information */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold mb-3 text-gray-800">Current Hop Details</h4>
              {(() => {
                const currentHopIndex = routeStateQuery.data.data?.currentHopIndex || 0;
                const currentHop = routeConfigQuery.data.data?.hops[currentHopIndex];
                const totalHops = routeConfigQuery.data.data?.hops.length || 0;
                const isComplete = currentHopIndex >= totalHops;

                if (isComplete) {
                  return (
                    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                      <p className="font-semibold">Route Complete!</p>
                      <p>All hops have been executed successfully.</p>
                    </div>
                  );
                }

                return (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Hop Number</p>
                        <p className="font-semibold text-orange-600">{currentHopIndex} of {totalHops}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Recipient</p>
                        <p className="font-mono text-sm break-all text-blue-600">{currentHop?.recipient}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Delay (seconds)</p>
                        <p className="font-semibold text-orange-600">{currentHop?.delaySeconds}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Amount</p>
                        <p className="font-semibold text-orange-600">{routeConfigQuery.data.data?.hopAmount} lamports</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

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
                      title="Copy transaction signature"
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
                <p className="mt-2 text-sm">Route state will be updated automatically in a few seconds.</p>
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
              const totalHops = routeConfigQuery.data.data?.hops.length || 0;
              const isComplete = currentHopIndex >= totalHops;

              return (
                <button
                  onClick={handleTriggerHop}
                  disabled={isTriggering || isComplete || !routeId}
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

      {/* No Data State */}
      {queryEnabled && !routeConfigQuery.isLoading && !routeStateQuery.isLoading && 
       !routeConfigQuery.data && !routeStateQuery.data && !routeConfigQuery.error && !routeStateQuery.error && (
        <div className="text-center py-8">
          <div className="text-gray-500">No route found with the provided parameters.</div>
        </div>
      )}

      <ExecutorWallet routeId={parseInt(routeId)} />
    </div>
  );
};
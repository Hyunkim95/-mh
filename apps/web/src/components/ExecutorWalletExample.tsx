import React from 'react';
import { ExecutorWallet } from './ExecutorWallet';

/**
 * Example component showing how to use the ExecutorWallet component
 * This can be used as a reference or removed when integrating into your actual app
 */
export const ExecutorWalletExample: React.FC = () => {
  // Example route ID - this would come from your app's state/props
  const routeId = 1;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Executor Wallet Management</h1>
      
      <div className="grid gap-6">
        {/* Single executor wallet */}
        <ExecutorWallet 
          routeId={routeId}
          className="max-w-2xl"
        />

        {/* Multiple executor wallets for different routes */}
        <div className="grid md:grid-cols-2 gap-6">
          <ExecutorWallet routeId={1} />
          <ExecutorWallet routeId={2} />
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="mt-8 p-6 bg-gray-100 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Usage Instructions</h2>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>• The ExecutorWallet component automatically loads the public key and balance for the specified route</li>
          <li>• Click "Refresh Balance" to update the current SOL balance</li>
          <li>• Use the "Withdraw" button to transfer funds from the executor wallet to another address</li>
          <li>• The component handles all the tRPC calls automatically using the useExecutor hook</li>
          <li>• Error states are handled and displayed to the user</li>
          <li>• All inputs are validated before submission</li>
        </ul>
      </div>
    </div>
  );
};
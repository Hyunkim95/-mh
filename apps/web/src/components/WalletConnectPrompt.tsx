import React from 'react';
import { WalletButton } from '@libs/solana-client';

export const WalletConnectPrompt: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md mx-auto text-center p-8 bg-white rounded-lg shadow-lg">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
            <svg 
              className="w-8 h-8 text-white" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600 mb-6">
            Please connect your Solana wallet to access the Multihopper application. 
            You'll need a connected wallet to create token configurations, routes, and manage your hops.
          </p>
        </div>
        
        <div className="space-y-4">
          <WalletButton />
          
          <div className="text-sm text-gray-500">
            <p>Supported wallets:</p>
            <div className="flex justify-center space-x-4 mt-2">
              <span className="px-2 py-1 bg-gray-100 rounded text-xs">Phantom</span>
              <span className="px-2 py-1 bg-gray-100 rounded text-xs">Solflare</span>
              <span className="px-2 py-1 bg-gray-100 rounded text-xs">Torus</span>
            </div>
          </div>
        </div>
        
        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                New to Solana wallets?
              </h3>
              <div className="mt-1 text-sm text-blue-700">
                <p>
                  We recommend{' '}
                  <a 
                    href="https://phantom.app/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-800"
                  >
                    Phantom
                  </a>{' '}
                  for beginners. It's easy to set up and use.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
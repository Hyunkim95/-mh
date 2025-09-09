import './App.css';
import { trpc } from './lib/trpc';
import { TokenConfigForm } from './components/TokenConfigForm';
import { RouteCreateForm } from './components/RouteCreateForm';
import { RouteViewer } from './components/RouteViewer';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { WalletButton } from '@libs/solana-client';
import { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");

function App() {
  const initializeTokenConfig = trpc.contract.initializeTokenConfig.useMutation();
  const initializeTokenConfigSOL = trpc.contract.initializeTokenConfigSOL.useMutation();
  const initializeRoute = trpc.contract.initializeRoute.useMutation();
  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation();

  const { sendTransaction, publicKey } = useWallet();
  const [hopAmount, setHopAmount] = useState('');
  const { connection } = useConnection();
  const [splMint, setSplMint] = useState('');
  const [activeTab, setActiveTab] = useState<'token-config' | 'routes'>('token-config');
  
  const getTokenConfigSOL = trpc.contract.getTokenConfigSOL.useQuery({
    creator: publicKey?.toBase58() ?? '',
  }, {
    enabled: !!publicKey && !!splMint,
  });

  const getTokenConfigSPL = trpc.contract.getTokenConfigSPL.useQuery({
    splMint: splMint,
    creator: publicKey?.toBase58() ?? '',
  }, {
    enabled: !!publicKey && !!splMint,
  });

  const handleRouteSubmit = async (data: {
    routeId: number;
    routes: {
      recipient: string;
      delaySeconds: string;
    }[];
    hopAmount: string;
    splMint?: string;
  }, type: 'SPL' | 'SOL') => {
    try {
      const mutation = type === 'SPL' ? initializeRoute : initializeRouteSOL;
      
      const transactionSignature = await mutation.mutateAsync({
        ...data,
        splMint: data.splMint ?? NATIVE_MINT.toBase58(),
        creator: publicKey?.toBase58() ?? '',
      });
      
      const transaction = Transaction.from(Buffer.from(transactionSignature.data.transaction, "base64"));
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
      });
      
      const confirmation = await connection.confirmTransaction({
        signature: signature,
        blockhash: transaction.recentBlockhash!,
        lastValidBlockHeight: transaction.lastValidBlockHeight!,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }
      
      toast.success(`Route created successfully! Signature: ${signature.slice(0, 8)}...`);
      console.log('Route created with signature:', signature);
    } catch (error) {
      console.error('Route creation failed:', error);
      toast.error(`Route creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  console.log(getTokenConfigSOL.data)

  return <div className="min-h-screen bg-gray-100">
    <Toaster position="top-right" />
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <h1 className="text-2xl font-bold text-gray-900">Multihopper</h1>
          <WalletButton />
        </div>
      </div>
    </header>

    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-8 bg-gray-200 p-1 rounded-lg max-w-md">
        <button
          onClick={() => setActiveTab('token-config')}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'token-config'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Token Config
        </button>
        <button
          onClick={() => setActiveTab('routes')}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'routes'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Routes
        </button>
      </div>

      {/* Token Config Tab */}
      {activeTab === 'token-config' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <TokenConfigForm
              type="SPL"
              onSubmit={async (data) => {
                try {
                  const { address, tokenConfig } = data;
                  const transactionSignature = await initializeTokenConfig.mutateAsync({
                    splMint: address,
                    tokenConfig,
                    creator: publicKey?.toBase58() ?? '',
                  });
                  const transaction = Transaction.from(Buffer.from(transactionSignature.data.transaction, "base64"));
                  const signature = await sendTransaction(transaction, connection, {
                    skipPreflight: true,
                  });
                  const confirmation = await connection.confirmTransaction({
                    signature: signature,
                    blockhash: transaction.recentBlockhash!,
                    lastValidBlockHeight: transaction.lastValidBlockHeight!,
                  }, 'confirmed');
                  
                  if (confirmation.value.err) {
                    throw new Error(`Transaction failed: ${confirmation.value.err}`);
                  }
                  
                  toast.success(`SPL Token config created successfully! Signature: ${signature.slice(0, 8)}...`);
                } catch (error) {
                  console.error('SPL Token config creation failed:', error);
                  toast.error(`SPL Token config creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  throw error;
                }
              }}
              isLoading={initializeTokenConfig.isPending}
              error={initializeTokenConfig.error?.message}
            />

            <TokenConfigForm
              type="SOL"
              onSubmit={async (data) => {
                try {
                  const { tokenConfig } = data;
                  const transactionSignature = await initializeTokenConfigSOL.mutateAsync({
                    tokenConfig,
                    creator: publicKey?.toBase58() ?? '',
                  });
                  const transaction = Transaction.from(Buffer.from(transactionSignature.data.transaction, "base64"));
                  const signature = await sendTransaction(transaction, connection, {
                    skipPreflight: true,
                  });
                  const confirmation = await connection.confirmTransaction({
                    signature: signature,
                    blockhash: transaction.recentBlockhash!,
                    lastValidBlockHeight: transaction.lastValidBlockHeight!,
                  }, 'confirmed');
                  
                  if (confirmation.value.err) {
                    throw new Error(`Transaction failed: ${confirmation.value.err}`);
                  }
                  
                  toast.success(`SOL Token config created successfully! Signature: ${signature.slice(0, 8)}...`);
                } catch (error) {
                  console.error('SOL Token config creation failed:', error);
                  toast.error(`SOL Token config creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  throw error;
                }
              }}
              isLoading={initializeTokenConfigSOL.isPending}
              error={initializeTokenConfigSOL.error?.message}
            />
          </div>

          {/* Token Config Display */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                  <div><span className="font-medium text-gray-800">Creator:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSOL.data.data?.creator}</span></div>
                  <div><span className="font-medium text-gray-800">Min Transfer:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSOL.data.data?.minTransfer}</span></div>
                  <div><span className="font-medium text-gray-800">Pair Mint:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSOL.data.data?.pairMint}</span></div>
                  <div><span className="font-medium text-gray-800">Fee Bps:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSOL.data.data?.feeBps}</span> %</div>
                  <div><span className="font-medium text-gray-800">Max Hops:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSOL.data.data?.maxHops}</span></div>
                  <div><span className="font-medium text-gray-800">Max Delay:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSOL.data.data?.maxDelaySeconds}s</span></div>
                </div>
              )}
            </div>

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
                  <div><span className="font-medium text-gray-800">Creator:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSPL.data.data?.creator}</span></div>
                  <div><span className="font-medium text-gray-800">Min Transfer:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSPL.data.data?.minTransfer}</span></div>
                  <div><span className="font-medium text-gray-800">SPL Mint:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSPL.data.data?.splMint}</span></div>
                  <div><span className="font-medium text-gray-800">Fee Bps:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSPL.data.data?.feeBps}</span> % </div>
                  <div><span className="font-medium text-gray-800">Max Hops:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSPL.data.data?.maxHops}</span></div>
                  <div><span className="font-medium text-gray-800">Max Delay:</span> <span className="font-mono text-xs text-gray-800">{getTokenConfigSPL.data.data?.maxDelaySeconds}s</span></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Routes Tab */}
      {activeTab === 'routes' && (
        <div className="space-y-8">

          <input
            type="text"
            value={hopAmount}
            onChange={(e) => setHopAmount(e.target.value)}
            placeholder="Enter hop amount"
            className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <RouteCreateForm
              type="SPL"
              onSubmit={(data) => handleRouteSubmit(data, 'SPL')}
              isLoading={initializeRoute.isPending}
              error={initializeRoute.error?.message}
              hopAmount={hopAmount}
            />

            <RouteCreateForm
              type="SOL"
              onSubmit={(data) => handleRouteSubmit(data, 'SOL')}
              isLoading={initializeRouteSOL.isPending}
              error={initializeRouteSOL.error?.message}
              hopAmount={hopAmount}
            />
          </div>

          <RouteViewer publicKey={publicKey?.toBase58()} />
        </div>
      )}
    </div>
  </div>
}

export default App

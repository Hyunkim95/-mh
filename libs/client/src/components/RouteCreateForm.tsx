import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { 
  IHop,
  HumanReadableRouteInput, 
  HumanReadableHopInput, 
  convertHumanReadableToRouteInput,
  InitializeRouteInput
} from '../types/route';

export interface RouteCreateFormProps {
  type: 'SPL' | 'SOL';
  onSubmit: (data: {
    routes: IHop[];
    splMint?: string;
    hopAmount: string;
  }) => Promise<void>;
  isLoading?: boolean;
  error?: string;
  connection?: any; // Solana connection for detecting decimals
  onDecimalsDetected?: (decimals: number) => void; // Callback when decimals are detected
}

export const RouteCreateForm: React.FC<RouteCreateFormProps> = ({
  type,
  onSubmit,
  isLoading = false,
  error,
  connection,
  onDecimalsDetected
}) => {
  const [detectedDecimals, setDetectedDecimals] = useState<number>(type === 'SOL' ? 9 : 6);
  const [isDetectingDecimals, setIsDetectingDecimals] = useState(false);
  const [decimalsError, setDecimalsError] = useState<string>('');
  
  const [humanReadableRoute, setHumanReadableRoute] = useState<HumanReadableRouteInput>({
    hopAmountTokens: '0.1', // Human readable: 0.1 tokens
    splMint: type === 'SPL' ? '' : undefined,
    hops: [
      { recipient: '', delayMinutes: '0' } // Human readable: 0 minutes delay
    ]
  });

  // Detect token decimals when SPL mint address changes
  useEffect(() => {
    const detectDecimals = async () => {
      if (type !== 'SPL' || !humanReadableRoute.splMint || !connection) {
        const defaultDecimals = type === 'SOL' ? 9 : 6;
        setDetectedDecimals(defaultDecimals);
        return;
      }

      try {
        setIsDetectingDecimals(true);
        setDecimalsError('');
        
        // Dynamic import to avoid bundling issues
        const { PublicKey } = await import('@solana/web3.js');
        const { getMint } = await import('@solana/spl-token');
        
        const mintPublicKey = new PublicKey(humanReadableRoute.splMint);
        const mintInfo = await getMint(connection, mintPublicKey);
        
        setDetectedDecimals(mintInfo.decimals);
        onDecimalsDetected?.(mintInfo.decimals);
        console.log(`Detected ${mintInfo.decimals} decimals for token ${humanReadableRoute.splMint}`);
      } catch (error) {
        console.warn('Could not fetch token decimals:', error);
        setDecimalsError('Could not detect token decimals. Using default (6).');
        setDetectedDecimals(6);
      } finally {
        setIsDetectingDecimals(false);
      }
    };

    // Debounce the detection to avoid too many API calls
    const timeoutId = setTimeout(detectDecimals, 500);
    return () => clearTimeout(timeoutId);
  }, [humanReadableRoute.splMint, type, connection, onDecimalsDetected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Convert human-readable input to internal format using detected decimals
      const internalRouteInput: InitializeRouteInput = convertHumanReadableToRouteInput(
        humanReadableRoute, 
        detectedDecimals
      );
      
      // Convert to the format expected by the parent component
      const convertedHops: IHop[] = internalRouteInput.routes.map(hop => ({
        recipient: new PublicKey(hop.recipient),
        delaySeconds: new BN(hop.delaySeconds)
      }));

      await onSubmit({
        routes: convertedHops,
        splMint: internalRouteInput.splMint,
        hopAmount: internalRouteInput.hopAmount
      });
      
      // Reset form on success
      setHumanReadableRoute({
        hopAmountTokens: '0.1',
        splMint: type === 'SPL' ? '' : undefined,
        hops: [{ recipient: '', delayMinutes: '0' }]
      });
    } catch (err) {
      console.error('Form submission error:', err);
    }
  };

  const addHop = () => {
    setHumanReadableRoute(prev => ({
      ...prev,
      hops: [...prev.hops, { recipient: '', delayMinutes: '0' }]
    }));
  };

  const removeHop = (index: number) => {
    if (humanReadableRoute.hops.length > 1) {
      setHumanReadableRoute(prev => ({
        ...prev,
        hops: prev.hops.filter((_, i) => i !== index)
      }));
    }
  };

  const updateHop = (index: number, field: keyof HumanReadableHopInput, value: string) => {
    setHumanReadableRoute(prev => ({
      ...prev,
      hops: prev.hops.map((hop, i) => 
        i === index ? { ...hop, [field]: value } : hop
      )
    }));
  };

  const updateRouteField = (field: keyof HumanReadableRouteInput, value: string | number) => {
    setHumanReadableRoute(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const baseInputStyles = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500';
  const labelStyles = 'block text-sm font-medium text-gray-700 mb-1';
  const containerStyles = 'mb-4';

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-green-800">
        Create {type} Route
      </h2>
      
      <form onSubmit={handleSubmit}>
        {/* Basic Route Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">          
          <div className={containerStyles}> 
            <label className={labelStyles}>
              Hop Amount
              <span className="text-xs text-gray-500 ml-1">
                ({type === 'SPL' ? 'tokens' : 'SOL'})
              </span>
            </label>
            <input
              type="number"
              step="any"
              value={humanReadableRoute.hopAmountTokens}
              onChange={(e) => updateRouteField('hopAmountTokens', e.target.value)}
              placeholder="0.1"
              className={baseInputStyles}
              required
              min="0"
            />
            <p className="text-xs text-gray-500 mt-1">
              Amount transferred in each hop
              {type === 'SPL' && detectedDecimals !== 6 && (
                <span className="text-blue-600"> (using {detectedDecimals} decimals)</span>
              )}
            </p>
          </div>

          {type === 'SPL' && (
            <div className={containerStyles}>
              <label className={labelStyles}>SPL Token Address</label>
              <input
                type="text"
                value={humanReadableRoute.splMint || ''}
                onChange={(e) => updateRouteField('splMint', e.target.value)}
                placeholder="SPL token mint address"
                className={baseInputStyles}
                required
              />
              
              {/* Token Decimals Detection Info */}
              {connection && (
                <div className="mt-2">
                  {isDetectingDecimals ? (
                    <p className="text-xs text-blue-600">🔍 Detecting token decimals...</p>
                  ) : decimalsError ? (
                    <p className="text-xs text-orange-600">⚠️ {decimalsError}</p>
                  ) : detectedDecimals !== 6 ? (
                    <p className="text-xs text-green-600">
                      ✅ Detected {detectedDecimals} decimal places for this token
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Using {detectedDecimals} decimal places
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hops Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Route Hops</h3>
            <button
              type="button"
              onClick={addHop}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              Add Hop
            </button>
          </div>

          {humanReadableRoute.hops.map((hop, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-medium text-gray-700">Hop {index + 1}</h4>
                {humanReadableRoute.hops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeHop(index)}
                    className="text-red-500 hover:text-red-700 font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelStyles}>Recipient Address</label>
                  <input
                    type="text"
                    value={hop.recipient}
                    onChange={(e) => updateHop(index, 'recipient', e.target.value)}
                    placeholder="Recipient wallet address"
                    className={baseInputStyles}
                    required
                  />
                </div>

                <div>
                  <label className={labelStyles}>
                    Delay
                    <span className="text-xs text-gray-500 ml-1">(minutes)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={hop.delayMinutes}
                    onChange={(e) => updateHop(index, 'delayMinutes', e.target.value)}
                    placeholder="0"
                    className={baseInputStyles}
                    required
                    min="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Time to wait before this hop executes
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || (type === 'SPL' && isDetectingDecimals) || humanReadableRoute.hops.some(hop => !hop.recipient)}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            isLoading || (type === 'SPL' && isDetectingDecimals) || humanReadableRoute.hops.some(hop => !hop.recipient)
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500'
          } text-white`}
        >
          {isLoading ? 'Creating Route...' : 
           (type === 'SPL' && isDetectingDecimals) ? 'Detecting decimals...' :
           `Create ${type} Route`}
        </button>
      </form>
    </div>
  );
}; 
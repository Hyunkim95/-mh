import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { IHop } from '@libs/client';

export interface RouteCreateFormProps {
  type: 'SPL' | 'SOL';
  onSubmit: (data: {
    routeId: number;
    routes: IHop[];
    splMint?: string;
    hopAmount: string;
  }) => Promise<void>;
  isLoading?: boolean;
  error?: string;
  hopAmount: string;
}

interface HopFormData {
  recipient: string;
  delaySeconds: string;
}

export const RouteCreateForm: React.FC<RouteCreateFormProps> = ({
  type,
  onSubmit,
  isLoading = false,
  error,
  hopAmount
}) => {
  const [routeId, setRouteId] = useState<string>('1');
  const [splMint, setSplMint] = useState<string>('');
  const [hops, setHops] = useState<HopFormData[]>([
    { recipient: '', delaySeconds: '0' }
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Convert hop form data to IHop format
      const convertedHops: IHop[] = hops.map(hop => ({
        recipient: new PublicKey(hop.recipient),
        delaySeconds: new BN(hop.delaySeconds)
      }));

      await onSubmit({
        routeId: parseInt(routeId),
        routes: convertedHops,
        splMint: type === 'SPL' ? splMint : undefined,
        hopAmount: hopAmount
      });
      
      // Reset form on success
      setHops([{ recipient: '', delaySeconds: '0' }]);
      setRouteId('1');
      setSplMint('');
    } catch (err) {
      console.error('Form submission error:', err);
    }
  };

  const addHop = () => {
    setHops([...hops, { recipient: '', delaySeconds: '0' }]);
  };

  const removeHop = (index: number) => {
    if (hops.length > 1) {
      setHops(hops.filter((_, i) => i !== index));
    }
  };

  const updateHop = (index: number, field: keyof HopFormData, value: string) => {
    const updatedHops = [...hops];
    updatedHops[index][field] = value;
    setHops(updatedHops);
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
            <label className={labelStyles}>Route ID</label>
            <input
              type="number"
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              placeholder="Enter unique route ID"
              className={baseInputStyles}
              required
              min="1"
            />
          </div>

          {type === 'SPL' && (
            <div className={containerStyles}>
              <label className={labelStyles}>SPL Token Address</label>
              <input
                type="text"
                value={splMint}
                onChange={(e) => setSplMint(e.target.value)}
                placeholder="SPL token mint address"
                className={baseInputStyles}
                required
              />
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

          {hops.map((hop, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-medium text-gray-700">Hop {index + 1}</h4>
                {hops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeHop(index)}
                    className="text-red-500 hover:text-red-700 transition-colors"
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
                  <label className={labelStyles}>Delay (Seconds)</label>
                  <input
                    type="number"
                    value={hop.delaySeconds}
                    onChange={(e) => updateHop(index, 'delaySeconds', e.target.value)}
                    placeholder="Delay in seconds"
                    className={baseInputStyles}
                    required
                    min="0"
                  />
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
          disabled={isLoading || hops.some(hop => !hop.recipient)}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            isLoading || hops.some(hop => !hop.recipient)
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500'
          } text-white`}
        >
          {isLoading ? 'Creating Route...' : `Create ${type} Route`}
        </button>
      </form>
    </div>
  );
};
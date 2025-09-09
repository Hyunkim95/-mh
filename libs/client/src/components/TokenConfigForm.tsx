import React, { useState } from 'react';
import { TokenConfigInput } from '../types/tokenConfig';

export interface TokenConfigFormProps {
  type: 'SPL' | 'SOL';
  onSubmit: (data: { address: string; tokenConfig: TokenConfigInput }) => void;
  isLoading?: boolean;
  error?: string;
}

export const TokenConfigForm: React.FC<TokenConfigFormProps> = ({
  type,
  onSubmit,
  isLoading = false,
  error
}) => {
  const [address, setAddress] = useState('');
  const [tokenConfig, setTokenConfig] = useState<TokenConfigInput>({
    minTransfer: '1000000', // 0.001 tokens (assuming 6 decimals)
    feeBps: '500', // 5%
    feeTreasury: '',
    maxHops: '5',
    maxDelaySeconds: '3600', // 1 hour
    timelockSeconds: '0',
    flatFeeLamports: '1000000' // 0.001 SOL
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ address, tokenConfig });
  };

  const handleConfigChange = (field: keyof TokenConfigInput, value: string) => {
    setTokenConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const baseInputStyles = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelStyles = 'block text-sm font-medium text-gray-700 mb-1';
  const containerStyles = 'mb-4';

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">
        Initialize {type} Token Config
      </h2>
      
      <form onSubmit={handleSubmit}>
        {/* Address Input */}
        <div className={containerStyles}>
          <label className={labelStyles}>
            {type === 'SPL' ? 'SPL Token Address' : 'Creator Address'}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={type === 'SPL' ? 'Enter SPL token mint address' : 'Enter creator wallet address'}
            className={baseInputStyles}
            required
          />
        </div>

        {/* Token Config Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={containerStyles}>
            <label className={labelStyles}>Min Transfer</label>
            <input
              type="text"
              value={tokenConfig.minTransfer}
              onChange={(e) => handleConfigChange('minTransfer', e.target.value)}
              placeholder="Minimum transfer amount"
              className={baseInputStyles}
              required
            />
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>Fee (Basis Points)</label>
            <input
              type="text"
              value={tokenConfig.feeBps}
              onChange={(e) => handleConfigChange('feeBps', e.target.value)}
              placeholder="Fee in basis points (500 = 5%)"
              className={baseInputStyles}
              required
            />
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>Fee Treasury</label>
            <input
              type="text"
              value={tokenConfig.feeTreasury}
              onChange={(e) => handleConfigChange('feeTreasury', e.target.value)}
              placeholder="Treasury wallet address"
              className={baseInputStyles}
              required
            />
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>Max Hops</label>
            <input
              type="text"
              value={tokenConfig.maxHops}
              onChange={(e) => handleConfigChange('maxHops', e.target.value)}
              placeholder="Maximum number of hops"
              className={baseInputStyles}
              required
            />
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>Max Delay (Seconds)</label>
            <input
              type="text"
              value={tokenConfig.maxDelaySeconds}
              onChange={(e) => handleConfigChange('maxDelaySeconds', e.target.value)}
              placeholder="Maximum delay in seconds"
              className={baseInputStyles}
              required
            />
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>Timelock (Seconds)</label>
            <input
              type="text"
              value={tokenConfig.timelockSeconds}
              onChange={(e) => handleConfigChange('timelockSeconds', e.target.value)}
              placeholder="Timelock duration in seconds"
              className={baseInputStyles}
              required
            />
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>Flat Fee (Lamports)</label>
            <input
              type="text"
              value={tokenConfig.flatFeeLamports}
              onChange={(e) => handleConfigChange('flatFeeLamports', e.target.value)}
              placeholder="Flat fee in lamports"
              className={baseInputStyles}
              required
            />
          </div>
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
          disabled={isLoading}
          className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500'
          } text-white`}
        >
          {isLoading ? 'Creating...' : `Initialize ${type} Token Config`}
        </button>
      </form>
    </div>
  );
};
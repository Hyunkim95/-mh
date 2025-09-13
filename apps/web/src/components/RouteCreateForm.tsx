import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import {
  TimestampRouteInput, 
  TimestampHopInput, 
  convertTimestampToRouteInput,
  InitializeRouteInput
} from '../types/route';
import { useConnection } from '@solana/wallet-adapter-react';
import { getMint } from '@solana/spl-token';
import { TimezoneAwareDatePicker, TimezoneAwareDateDisplay } from './TimezoneAwareDatePicker';
import { useTimezone } from '../hooks/useTimezone';

// Custom styles for react-datepicker
const datePickerStyles = `
  .react-datepicker-wrapper {
    width: 100%;
  }
  
  .react-datepicker__input-container input {
    width: 100% !important;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
  
  .react-datepicker__input-container input:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
    border-color: transparent;
    box-shadow: 0 0 0 2px #10b981;
  }
  
  .react-datepicker {
    font-family: inherit;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }
  
  .react-datepicker__header {
    background-color: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    border-radius: 0.5rem 0.5rem 0 0;
  }
  
  .react-datepicker__current-month {
    color: #374151;
    font-weight: 600;
  }
  
  .react-datepicker__day--selected {
    background-color: #10b981 !important;
    color: white !important;
  }
  
  .react-datepicker__day--keyboard-selected {
    background-color: #059669 !important;
    color: white !important;
  }
  
  .react-datepicker__time-container {
    border-left: 1px solid #e5e7eb;
  }
  
  .react-datepicker__time-list-item--selected {
    background-color: #10b981 !important;
    color: white !important;
  }
`;

export interface RouteCreateFormProps {
  type: 'SPL' | 'SOL';
  isLoading?: boolean;
  error?: string;
  onSubmit: (route: any) => void;
}

export const RouteCreateForm: React.FC<RouteCreateFormProps> = ({
  type,
  isLoading = false,
  error,
  onSubmit
}) => {
  const [detectedDecimals, setDetectedDecimals] = useState<number>(type === 'SOL' ? 9 : 6);
  const [isDetectingDecimals, setIsDetectingDecimals] = useState(false);
  const [decimalsError, setDecimalsError] = useState<string>('');
  const { connection } = useConnection();
  const { scheduleFromNow } = useTimezone();
  
  const [isCreatingRoute, setIsCreatingRoute] = useState(false);
  const [createRouteError, setCreateRouteError] = useState<string | null>(null);

  // Get default scheduled time as UTC string
  const getDefaultScheduledTime = (minutesFromNow: number = 5) => {
    return scheduleFromNow(minutesFromNow).utcIsoString;
  };

  const [timestampRoute, setTimestampRoute] = useState<TimestampRouteInput>({
    hopAmountTokens: '0.1',
    splMint: type === 'SPL' ? 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr' : undefined,
    hops: [
      { recipient: '', scheduledAt: getDefaultScheduledTime(5) }
    ]
  });

  // Detect token decimals when SPL mint address changes
  useEffect(() => {
    const detectDecimals = async () => {
      if (type !== 'SPL' || !timestampRoute.splMint || !connection) {
        setDetectedDecimals(type === 'SOL' ? 9 : 6);
        return;
      }

      try {
        setIsDetectingDecimals(true);
        setDecimalsError('');
        
        const mintPublicKey = new PublicKey(timestampRoute.splMint);
        const mintInfo = await getMint(connection, mintPublicKey);
        
        setDetectedDecimals(mintInfo.decimals);
        console.log(`Detected ${mintInfo.decimals} decimals for token ${timestampRoute.splMint}`);
      } catch (error) {
        console.warn('Could not fetch token decimals:', error);
        setDecimalsError('Could not detect token decimals. Using default (6).');
        setDetectedDecimals(6);
      } finally {
        setIsDetectingDecimals(false);
      }
    };

    const timeoutId = setTimeout(detectDecimals, 500);
    return () => clearTimeout(timeoutId);
  }, [timestampRoute.splMint, type, connection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const internalRouteInput: InitializeRouteInput = convertTimestampToRouteInput(
        timestampRoute, 
        detectedDecimals
      );
      
      const routeData = {
        tokenType: type,
        tokenMint: internalRouteInput.splMint,
        tokenDecimals: detectedDecimals,
        hopAmountTokens: timestampRoute.hopAmountTokens,
        hopAmountRaw: internalRouteInput.hopAmount,
        hops: timestampRoute.hops.map(hop => ({
          recipient: hop.recipient,
          scheduledAt: hop.scheduledAt,
        })),
      };

      setIsCreatingRoute(true);
      setCreateRouteError(null);
      
      console.log('Creating route with timestamp-based hops:', routeData);
      onSubmit(routeData); // Send the data directly, not wrapped in result
      
    } catch (err) {
      console.error('Error creating route:', err);
      setCreateRouteError(err instanceof Error ? err.message : 'Failed to create route');
    } finally {
      setIsCreatingRoute(false);
    }
  };

  const updateHop = (index: number, field: keyof TimestampHopInput, value: string | Date) => {
    setTimestampRoute(prev => ({
      ...prev,
      hops: prev.hops.map((hop, i) => 
        i === index ? { ...hop, [field]: value } : hop
      )
    }));
  };

  const addHop = () => {
    const lastHop = timestampRoute.hops[timestampRoute.hops.length - 1];
    const lastHopTime = new Date(lastHop.scheduledAt).getTime();
    const nextScheduledTime = new Date(lastHopTime + 30 * 60 * 1000).toISOString(); // 30 minutes after last hop
    
    setTimestampRoute(prev => ({
      ...prev,
      hops: [...prev.hops, { recipient: '', scheduledAt: nextScheduledTime }]
    }));
  };

  const removeHop = (index: number) => {
    setTimestampRoute(prev => ({
      ...prev,
      hops: prev.hops.filter((_, i) => i !== index)
    }));
  };



  // Calculate delay from previous hop for display
  const calculateDelay = (currentIndex: number): string => {
    if (currentIndex === 0) return 'Immediate';
    
    const currentTime = new Date(timestampRoute.hops[currentIndex].scheduledAt).getTime();
    const prevTime = new Date(timestampRoute.hops[currentIndex - 1].scheduledAt).getTime();
    const diffMinutes = Math.round((currentTime - prevTime) / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes} minutes after previous hop`;
    } else if (diffMinutes < 24 * 60) {
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      return `${hours}h ${mins}m after previous hop`;
    } else {
      const days = Math.floor(diffMinutes / (24 * 60));
      const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
      return `${days}d ${hours}h after previous hop`;
    }
  };

  const baseInputStyles = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent";
  const labelStyles = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      {/* Inject custom styles */}
      <style dangerouslySetInnerHTML={{ __html: datePickerStyles }} />
      
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Create {type} Route</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Amount Section */}
        <div className="mb-6">
          <label className={labelStyles}>
            Amount per hop
            <span className="text-xs text-gray-500 ml-1">({type} tokens)</span>
          </label>
          <input
            type="number"
            step="0.000001"
            value={timestampRoute.hopAmountTokens}
            onChange={(e) => setTimestampRoute(prev => ({ ...prev, hopAmountTokens: e.target.value }))}
            placeholder="0.1"
            className={baseInputStyles}
            required
            min="0"
          />
          <p className="text-xs text-gray-500 mt-1">
            Amount of {type} tokens to send in each hop
          </p>
        </div>

        {/* SPL Token Configuration */}
        <div className="mb-6">
          {type === 'SPL' && (
            <div>
              <label className={labelStyles}>SPL Token Mint Address</label>
              <input
                type="text"
                value={timestampRoute.splMint || ''}
                onChange={(e) => setTimestampRoute(prev => ({ ...prev, splMint: e.target.value }))}
                placeholder="Token mint address"
                className={baseInputStyles}
                required
              />
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
            </div>
          )}
        </div>

        {/* Hops Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Route Hops</h3>
            <div className="flex items-center space-x-4">
              <div className="text-xs text-gray-500">
                Current time: {new Date().toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                  month: 'short',
                  day: 'numeric'
                })}
              </div>
              <button
                type="button"
                onClick={addHop}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
              >
                Add Hop
              </button>
            </div>
          </div>

          {timestampRoute.hops.map((hop, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-medium text-gray-700">Hop {index + 1}</h4>
                {timestampRoute.hops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeHop(index)}
                    className="text-red-500 hover:text-red-700 font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
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
                    Scheduled Execution Time
                    <span className="text-xs text-gray-500 ml-2">(Your Timezone)</span>
                  </label>
                  <TimezoneAwareDatePicker
                    utcValue={hop.scheduledAt}
                    onUtcChange={(utcString) => updateHop(index, 'scheduledAt', utcString || getDefaultScheduledTime(5))}
                    showTimeSelect={true}
                    minDate={new Date()}
                    placeholderText="Select date and time"
                    showTimezoneSelector={false}
                    className={baseInputStyles}
                  />
                  
                  {/* Quick Time Presets */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs text-gray-600 mr-2 self-center">Quick set:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const in5Min = new Date(now.getTime() + 5 * 60 * 1000);
                        updateHop(index, 'scheduledAt', in5Min);
                      }}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      +5min
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const in15Min = new Date(now.getTime() + 15 * 60 * 1000);
                        updateHop(index, 'scheduledAt', in15Min);
                      }}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      +15min
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
                        updateHop(index, 'scheduledAt', in1Hour);
                      }}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      +1hr
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const in1Day = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                        updateHop(index, 'scheduledAt', in1Day);
                      }}
                      className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                    >
                      +1day
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                        updateHop(index, 'scheduledAt', nextWeek);
                      }}
                      className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                    >
                      +1week
                    </button>
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-2">
                    <strong>{calculateDelay(index)}</strong>
                    {index > 0 && (
                      <span className="block mt-1">
                        Executes on <TimezoneAwareDateDisplay 
                          utcTimestamp={hop.scheduledAt}
                          format="short"
                          className="font-medium"
                        />
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Error Display */}
        {(error || createRouteError) && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error || createRouteError}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || isCreatingRoute || (type === 'SPL' && isDetectingDecimals) || timestampRoute.hops.some(hop => !hop.recipient)}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            isLoading || isCreatingRoute || (type === 'SPL' && isDetectingDecimals) || timestampRoute.hops.some(hop => !hop.recipient)
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500'
          } text-white`}
        >
          {isLoading || isCreatingRoute ? 'Saving Route...' : 
           (type === 'SPL' && isDetectingDecimals) ? 'Detecting decimals...' :
           `Save ${type} Route`}
        </button>
        
        <p className="text-sm text-gray-500 mt-2 text-center">
          Your route will be saved to the database. You can deploy it later from the Routes tab.
        </p>
      </form>
    </div>
  );
};
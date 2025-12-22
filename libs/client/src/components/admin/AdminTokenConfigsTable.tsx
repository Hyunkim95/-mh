import React from 'react'

interface AdminTokenConfigsTableProps {
  tokenConfigs: Array<{
    id: number
    tokenConfigAddress: string
    creator: string
    tokenMint: string
    minTransferAmount: number
    feeBps: number
    feeTreasury: string
    maxHops: number
    maxDelaySeconds: number
    timelockSeconds: number
    flatFeeLamports: number
    pairAddress: string
  }>
  loading?: boolean
  onView?: (config: {
    id: number
    tokenConfigAddress: string
    creator: string
    minTransferAmount: number
    feeBps: number
    feeTreasury: string
    maxHops: number
    maxDelaySeconds: number
    timelockSeconds: number
    flatFeeLamports: number
    pairAddress: string
  }) => void
}

export const AdminTokenConfigsTable: React.FC<AdminTokenConfigsTableProps> = ({
  tokenConfigs,
  loading = false,
  onView,
}) => {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`
    if (minutes > 0) return `${minutes}m ${remainingSeconds}s`
    return `${remainingSeconds}s`
  }

  const formatLamports = (lamports: number) =>
    (lamports / 1_000_000_000).toFixed(6)
  const formatFeeBps = (bps: number) => (bps / 100).toFixed(2)

  if (loading) {
    return (
      <div className='text-center py-12 text-[var(--white-100-transparency-60)]'>
        Loading token configurations...
      </div>
    )
  }

  if (!tokenConfigs?.length) {
    return (
      <div className='text-center py-12 text-[var(--white-100-transparency-60)]'>
        No token configurations found
      </div>
    )
  }

  return (
    <div className='rounded-3xl border border-[var(--white-100-transparency-08)] bg-[var(--chinese-black-800)] overflow-hidden'>
      {/* Mobile view - Cards */}
      <div className='md:hidden'>
        <div className='divide-y divide-[var(--white-100-transparency-06)]'>
          {tokenConfigs.map(config => (
            <div key={config.id} className='p-4 space-y-3'>
              <div className='flex justify-between items-start'>
                <div>
                  <div className='text-xs text-[var(--white-100-transparency-60)]'>ID</div>
                  <div className='font-medium'>#{config.id}</div>
                </div>
                {onView && (
                  <button
                    onClick={() => onView(config)}
                    className='rounded-2xl px-3 py-1 bg-[var(--laser-lemon-500)] text-black text-xs'
                  >
                    View
                  </button>
                )}
              </div>
              
              <div className='grid grid-cols-1 gap-2 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Config:</span>
                  <span className='font-mono text-xs'>{formatAddress(config.tokenConfigAddress)}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Token:</span>
                  <span className='font-mono text-xs'>{formatAddress(config.tokenMint)}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Creator:</span>
                  <span className='font-mono text-xs'>{formatAddress(config.creator)}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Min Transfer:</span>
                  <span>{config.minTransferAmount}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Fee:</span>
                  <span>{formatFeeBps(config.feeBps)}%</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Max Hops:</span>
                  <span>{config.maxHops}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Max Delay:</span>
                  <span>{formatDuration(config.maxDelaySeconds)}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Timelock:</span>
                  <span>{formatDuration(config.timelockSeconds)}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-[var(--white-100-transparency-60)]'>Flat Fee:</span>
                  <span>{formatLamports(config.flatFeeLamports)} SOL</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop/Tablet view - Table with horizontal scroll */}
      <div className='hidden md:block overflow-x-auto'>
        <table className='min-w-full text-sm'>
          <thead className='bg-[var(--eerie-black-700)] text-[var(--white-100-transparency-70)]'>
            <tr>
              {[
                'ID',
                'Config',
                'Token',
                'Creator',
                'Min Transfer',
                'Fee %',
                'Fee Treasury',
                'Max Hops',
                'Max Delay',
                'Timelock',
                'Flat Fee (SOL)',
                'Pair',
                'Actions',
              ].map(h => (
                <th key={h} className='px-4 py-3 text-left font-medium'>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y divide-[var(--white-100-transparency-06)] text-[var(--white-100-transparency-80)]'>
            {tokenConfigs.map(config => (
              <tr key={config.id} className='hover:bg-white/5'>
                <td className='px-4 py-3'>{config.id}</td>
                <td className='px-4 py-3 font-mono'>
                  {formatAddress(config.tokenConfigAddress)}
                </td>
                <td className='px-4 py-3 font-mono'>
                  {formatAddress(config.tokenMint)}
                </td>
                <td className='px-4 py-3 font-mono'>
                  {formatAddress(config.creator)}
                </td>
                <td className='px-4 py-3'>{config.minTransferAmount}</td>
                <td className='px-4 py-3'>{formatFeeBps(config.feeBps)}%</td>
                <td className='px-4 py-3 font-mono'>
                  {formatAddress(config.feeTreasury)}
                </td>
                <td className='px-4 py-3'>{config.maxHops}</td>
                <td className='px-4 py-3'>
                  {formatDuration(config.maxDelaySeconds)}
                </td>
                <td className='px-4 py-3'>
                  {formatDuration(config.timelockSeconds)}
                </td>
                <td className='px-4 py-3'>
                  {formatLamports(config.flatFeeLamports)}
                </td>
                <td className='px-4 py-3 font-mono'>
                  {formatAddress(config.pairAddress)}
                </td>
                <td className='px-4 py-3'>
                  {onView && (
                    <button
                      onClick={() => onView(config)}
                      className='rounded-2xl px-3 py-1 bg-[var(--laser-lemon-500)] text-black text-xs'
                    >
                      View
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

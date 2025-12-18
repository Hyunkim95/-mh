import React from 'react'
import { HopRow } from './HopRow'
import { HopCustomPicker } from './HopCustomPicker'
import type { HopConfigItem } from '../../store/atoms'
import type { RowError } from '../../utils/csv/parseHopsCsv'

interface HopsSectionProps {
  hops: HopConfigItem[]
  name: string,
  setRouteName: (name: string) => void;
  openCustomIdx: number | null
  csvErrors: RowError[]
  csvShowAll: boolean
  hopRowErrors: Record<number, string | null>
  canAddRow: boolean
  onWalletChange: (idx: number, wallet: string) => void
  onWalletValidate: (idx: number, wallet: string) => void
  onDelayChange: (idx: number, minutes: number) => void
  onCustomClick: (idx: number) => void
  onCustomDateChange: (idx: number, utcString: string) => void
  onCustomError: (idx: number, errorMsg: string | null) => void
  onRemoveRow: (idx: number) => void
  onAddRow: () => void
  onUploadClick: () => void
  onDownloadTemplate: () => void
  onCsvShowAll: (show: boolean) => void
}

export const HopsSection: React.FC<HopsSectionProps> = ({
  hops,
  name,
  setRouteName,
  openCustomIdx,
  csvErrors,
  csvShowAll,
  hopRowErrors,
  canAddRow,
  onWalletChange,
  onWalletValidate,
  onDelayChange,
  onCustomClick,
  onCustomDateChange,
  onCustomError,
  onRemoveRow,
  onAddRow,
  onUploadClick,
  onDownloadTemplate,
  onCsvShowAll,
}) => {
  return (
    <>
      <div className='mb-6'>
        <h2 className='not-italic font-medium text-xl leading-6 text-[var(--white-100)] mb-2'>
          Add Hops & Delays
        </h2>
        <p className='not-italic font-light text-base leading-5 text-[var(--philippine-gray-500)]'>
          Add wallets your tokens will pass through before the destination. Set
          how long tokens wait in each wallet before moving on.
        </p>
      </div>
      <div
        className='relative flex flex-col bg-[var(--chinese-black-800)] rounded-3xl p-6 border border-[var(--white-100-transparency-05)]'
        style={{ boxShadow: 'inset 0px 1px 0px rgba(255,255,255,0.08)' }}
      >
        {/* Route Naming */}
        <div className='flex flex-col gap-2 mb-4'>
          <div className='not-italic font-medium text-base leading-4 text-[var(--white-100)]'>
            Route Name
          </div>
          <input
            value={name}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder='Name your Route'
            className='w-full h-[56px] rounded-2xl bg-[var(--chinese-black-500)] border border-[var(--white-100-transparency-10)] px-5 text-white placeholder-[var(--white-100-transparency-30)] outline-none shadow-[inset_0_1px_0_var(--white-100-transparency-06)]'
          />
        </div>
        {/* CSV inline errors */}
        {csvErrors.length > 0 && (
          <div className='mb-4 rounded-2xl border border-[var(--red-pastel-500)]/40 bg-[var(--black-900-transparency-40)] p-3'>
            <div className='text-[var(--red-pastel-500)] not-italic font-medium text-sm leading-4 mb-2'>
              Encontramos {csvErrors.length} problema(s) en el CSV:
            </div>
            <ul className='list-disc pl-5 text-xs text-[var(--white-100-transparency-80)] space-y-1'>
              {(csvShowAll ? csvErrors : csvErrors.slice(0, 5)).map((err, i) => (
                <li key={`csv-err-${i}`}>
                  {err.line > 0 ? `Línea ${err.line}: ` : ''}
                  {err.message}
                </li>
              ))}
            </ul>
            {csvErrors.length > 5 && (
              <button
                type='button'
                onClick={() => onCsvShowAll(!csvShowAll)}
                className='mt-2 text-xs text-[var(--laser-lemon-500)] hover:underline'
              >
                {csvShowAll ? 'Show less' : `Show more (${csvErrors.length - 5} more)`}
              </button>
            )}
          </div>
        )}

        {/* Scrollable content with sticky header */}
        <div className='flex flex-col max-h-[360px] overflow-visible overflow-x-hidden pr-1 gap-5'>
          <div className='sticky top-0 z-10 bg-[var(--chinese-black-800-transparency-95)] backdrop-blur-sm pb-3'>
            <div className='grid grid-cols-[177px_auto] gap-3 items-center text-[17px] text-[var(--white-100-transparency-70)]'>
              <div>Hops</div>
              <div>Delays</div>
            </div>
          </div>

          {hops.map((hop, idx) => (
            <div key={`hop-row-${idx}`}>
              <HopRow
                index={idx}
                hop={hop}
                hops={hops}
                error={hopRowErrors?.[idx] || null}
                isCustomOpen={openCustomIdx === idx}
                onWalletChange={onWalletChange}
                onWalletBlur={onWalletValidate}
                onDelayChange={onDelayChange}
                onCustomClick={onCustomClick}
                onRemove={onRemoveRow}
              />
              {openCustomIdx === idx && (
                <HopCustomPicker
                  index={idx}
                  hops={hops}
                  onUtcChange={onCustomDateChange}
                  onError={onCustomError}
                  onClose={() => onCustomClick(idx)}
                />
              )}
            </div>
          ))}
        </div>

        {/* Add row */}
        <div className='mt-5 flex justify-end w-full'>
          <button
            type='button'
            onClick={onAddRow}
            disabled={!canAddRow}
            title={
              !canAddRow ? 'Complete all rows to add a new hop' : undefined
            }
            className={`w-12 h-12 rounded-full text-[var(--black-900)] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition ${
              canAddRow
                ? 'bg-[var(--laser-lemon-500)] hover:brightness-95'
                : 'bg-[var(--laser-lemon-500-transparency-30)] cursor-not-allowed'
            }`}
          >
            +
          </button>
        </div>
      </div>
    </>
  )
}

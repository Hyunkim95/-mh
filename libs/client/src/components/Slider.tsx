import React from 'react'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  className?: string
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
}) => {
  const percentFill = React.useMemo(() => {
    if (!isFinite(max) || max <= min) return 0
    const clamped = Math.max(min, Math.min(value, max))
    return ((clamped - min) / (max - min)) * 100
  }, [value, min, max])

  return (
    <>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={Math.max(min, Math.min(value, max))}
        onChange={e => onChange(Number(e.target.value))}
        className={`w-full mh-slider ${className || ''}`}
        style={{ ['--fill' as any]: `${percentFill}%` }}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      <style>{`
        .mh-slider{appearance:none; height:12px; border-radius:9999px; background:transparent;}
        .mh-slider:focus{outline:none;}
        /* WebKit track with left progress and right gradient */
        .mh-slider::-webkit-slider-runnable-track{
          height:10px;
          border-radius:9999px;
          background:
            linear-gradient(90deg, #fbff69 33%, rgba(251, 255, 105, 0.3) 51%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .mh-slider::-webkit-slider-thumb{
          appearance:none; width:23px; height:23px; border-radius:9999px;
          background: radial-gradient(circle at 50% 50%, #fbff69 0%, #fbff69 60%, #f6f16a 100%);
          box-shadow: 0 0 32px rgba(251,255,105,.45), 0 2px 6px rgba(0,0,0,.5);
          border:0; margin-top:-5px;
        }
        /* Firefox */
        .mh-slider::-moz-range-track{
          height:12px; border-radius:9999px;
          background: linear-gradient(90deg, rgba(251,255,105,0.22) 0%, rgba(42,44,47,1) 40%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
          border:1px solid rgba(255,255,255,0.06);
        }
        .mh-slider::-moz-range-progress{height:12px; border-radius:9999px; background:#fbff69;}
        .mh-slider::-moz-range-thumb{width:22px; height:22px; border-radius:9999px; background: radial-gradient(circle at 50% 50%, #fbff69 0%, #fbff69 60%, #f6f16a 100%); box-shadow: 0 0 32px rgba(251,255,105,.45), 0 2px 6px rgba(0,0,0,.5); border:0;}
      `}</style>
    </>
  )
}

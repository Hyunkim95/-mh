import Papa from 'papaparse'
import type { HopConfigItem } from '../../store/atoms'

export type RowError = {
  line: number
  field?: 'wallet' | 'timeInMinutes' | 'header' | 'file'
  message: string
  raw?: string
}

const normalizeHeader = (h: string) =>
  (h || '').toLowerCase().replace(/\s+/g, '').trim()

export async function parseHopsCsv(
  file: File
): Promise<{ rows: HopConfigItem[]; errors: RowError[] }> {
  return new Promise(resolve => {
    const errors: RowError[] = []

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h: string) => {
        const n = normalizeHeader(h)
        if (n === 'timeinminutes') return 'timeInMinutes'
        return n
      },
      complete: results => {
        // Validate header
        const meta: any = results.meta || {}
        const fields: string[] = Array.isArray(meta.fields) ? meta.fields : []
        const normalizedFields = fields.map(normalizeHeader)
        const expected = ['wallet', 'timeinminutes']
        const hasAll = expected.every(e => normalizedFields.includes(e))
        if (!hasAll) {
          errors.push({
            line: 1,
            field: 'header',
            message: 'Invalid CSV header. Expected: wallet,timeInMinutes',
          })
        }

        const rows: HopConfigItem[] = []
        const data = (results.data as any[]) || []

        data.forEach((row, idx) => {
          const line = idx + 2 // header is line 1
          const wallet = String(row.wallet ?? '').trim()
          const timeVal =
            row.timeInMinutes ??
            row.timeinminutes ??
            row['time in minutes'] ??
            row['time_in_minutes']

          const delay =
            typeof timeVal === 'number'
              ? timeVal
              : Number(String(timeVal ?? '').trim())

          if (!wallet && (delay === null || !Number.isFinite(delay))) {
            errors.push({
              line,
              message: 'Missing wallet and invalid timeInMinutes',
              raw: JSON.stringify(row),
            })
            return
          }
          if (!wallet) {
            errors.push({
              line,
              field: 'wallet',
              message: 'Wallet is required',
              raw: JSON.stringify(row),
            })
            return
          }
          if (!Number.isFinite(delay)) {
            errors.push({
              line,
              field: 'timeInMinutes',
              message: 'timeInMinutes must be a number',
              raw: JSON.stringify(row),
            })
            return
          }

          const delayInt = Math.floor(Number(delay))
          if (delayInt < 0) {
            errors.push({
              line,
              field: 'timeInMinutes',
              message: 'timeInMinutes must be >= 0',
              raw: JSON.stringify(row),
            })
            return
          }

          rows.push({ wallet, delayMinutes: delayInt })
        })

        resolve({ rows, errors })
      },
      error: err => {
        resolve({
          rows: [],
          errors: [
            {
              line: 0,
              field: 'file',
              message: 'Error parsing CSV file',
              raw: String((err as any)?.message || err),
            },
          ],
        })
      },
    })
  })
}

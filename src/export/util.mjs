import { SerialDate } from 'googlejs/sheets'

export function exportDecimal (x) {
  return x ? x.toNumber() : 0
}

export function makeCSV (arr) {
  return (
    arr
      .map(v => {
        if (typeof v === 'number') return v.toString()
        if (v == null) return ''
        return '"' + v.toString().replaceAll('"', '""') + '"'
      })
      .join(',') + '\n'
  )
}

export function exportDate (x) {
  if (typeof x !== 'string') return x
  const m = /^(\d\d\d\d)-(\d\d)-(\d\d)/.exec(x)
  if (!m) return x
  const parts = m.slice(1).map(x => Number(x))
  return SerialDate.fromParts(parts).serial
}

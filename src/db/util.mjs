import tinydate from 'tinydate'

import decimal from 'decimal'

export function clean (x) {
  return Object.fromEntries(
    Object.entries(x).filter(([, v]) => v !== undefined)
  )
}

export function readDecimal (x, prec) {
  if (x == null) return undefined
  const d = decimal(x)
  if (prec != null) return d.precision(prec)
  return d
}

export function writeDecimal (x) {
  return x ? x.number : undefined
}

const asPlainDate = tinydate('{YYYY}-{MM}-{DD}')

export function readDate (x) {
  return x instanceof Date ? asPlainDate(x) : x
}

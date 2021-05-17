import log from 'logjs'
import teme from 'teme'

import { fetchIndex, fetchSector, fetchPrice } from './fetch-lse.mjs'

const debug = log
  .prefix('fetch:')
  .colour()
  .level(2)

// first try to load prices via collections - indices and sectors
const attempts = [
  ['ftse-all-share', fetchIndex],
  ['ftse-aim-all-share', fetchIndex],
  ['closed-end-investments', fetchSector]
]

export async function updatePrices (stocks) {
  const tickers = [...stocks.values()].map(s => s.ticker)
  const prices = getPrices(tickers)
  for await (const item of prices) {
    stocks.set(item)
  }
}

async function * getPrices (tickers) {
  const needed = new Set(tickers)
  const isNeeded = ({ ticker }) => needed.delete(ticker)

  for (const [name, fetchFunc] of attempts) {
    let n = 0
    const prices = teme(fetchFunc(name))
      .filter(isNeeded)
      .each(() => n++)
    yield * prices
    debug('%d prices from %s', n, name)

    if (!needed.size) return
  }

  // now pick up the remaining ones
  for (const ticker of needed) {
    yield await fetchPrice(ticker)
  }
  debug('%d prices individually: %s', needed.size, [...needed].join(', '))
}

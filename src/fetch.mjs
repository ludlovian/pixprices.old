import log from 'logjs'

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

export async function fetchPrices (stocks) {
  const neededTickers = new Set([...stocks.values()].map(s => s.ticker))

  for (const [name, fetchFunc] of attempts) {
    const items = await fetchFunc(name)
    let count = 0
    for (const item of items) {
      if (!neededTickers.has(item.ticker)) continue
      stocks.set(item)
      neededTickers.delete(item.ticker)
      count++
    }
    debug('%d prices from %s', count, name)
    if (!neededTickers.size) break
  }

  // now pick up the remaining ones
  for (const ticker of neededTickers) {
    const item = await fetchPrice(ticker)
    stocks.set(item)
  }

  if (neededTickers) {
    debug(
      '%d prices individually: %s',
      neededTickers.size,
      [...neededTickers].join(', ')
    )
  }
}

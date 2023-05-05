import * as sheets from 'googlejs/sheets'
import { log } from './util.mjs'

const PRICES_SHEET_ID = '1UdNhJNLWriEJtAJdbxwswGTl8CBcDK1nkEmJvwbc_5c'

export default class PriceStore {
  constructor () {
    this.store = new Map()
  }

  async load () {
    this.store.clear()
    const data = await sheets.getRange({
      sheet: PRICES_SHEET_ID,
      range: 'Prices!A2:E',
      scopes: sheets.scopes.rw
    })

    for (const row of data) {
      const [ticker, name, price, source, updatedSerial] = row
      const updated = sheets.toDate(updatedSerial)
      this.store.set(ticker, { ticker, name, price, source, updated })
    }
    log(`${this.store.size} loaded`)
  }

  async write (prevSize = 0) {
    const data = Array.from(this.store.keys())
      .sort()
      .map(ticker => this.store.get(ticker))
      .map(({ ticker, name, price, source, updated }) => [
        ticker,
        name,
        price,
        source,
        updated
      ])

    while (data.length < prevSize) {
      data.push(Array.from({ length: 5 }).map(() => ''))
    }

    await sheets.updateRange({
      sheet: PRICES_SHEET_ID,
      range: `Prices!A2:E${data.length + 1}`,
      data,
      scopes: sheets.scopes.rw
    })
  }

  async updatePrices ({ source, prices }) {
    const updated = new Date()
    const prevSize = this.store.size
    for (const { ticker, name, price } of prices) {
      this.store.set(ticker, { ticker, name, price, source, updated })
    }
    this.cleanup()
    await this.write(prevSize)
    log(`Applied ${prices.length} prices from ${source}`)
  }

  cleanup (days = 7) {
    const oneDay = 24 * 60 * 60 * 1000
    const ago = new Date(Date.now() - days * oneDay)
    Array.from(this.store.entries())
      .filter(([_, { updated }]) => updated < ago)
      .forEach(([ticker]) => this.store.delete(ticker))
  }
}

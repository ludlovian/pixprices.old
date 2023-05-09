import * as sheets from 'googlejs/sheets'
import { log } from './util.mjs'

import createSerial from 'pixutil/serial'

import config from './config.mjs'

export default class PriceStore {
  constructor () {
    this.store = new Map()
    const serial = createSerial()
    this.exec = serial.exec.bind(serial)
  }

  async load () {
    const { id, range } = config.priceSheet

    this.store.clear()
    const data = await sheets.getRange({
      sheet: id,
      range: range(),
      scopes: sheets.scopes.rw
    })

    for (const row of data) {
      const [ticker, name, price, source, updatedSerial] = row
      const updated = sheets.toDate(updatedSerial)
      this.store.set(ticker, { ticker, name, price, source, updated })
    }
  }

  async write (prevSize = 0) {
    const { id, range } = config.priceSheet

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
      sheet: id,
      range: range(data.length),
      data,
      scopes: sheets.scopes.rw
    })
  }

  updatePrices ({ source, prices }) {
    return this.exec(async () => {
      // if (config.isTest) {
      //   log(`TEST: received ${prices.length} prices from ${source}`)
      //   return
      // }
      const updated = new Date()

      await this.load()
      const prevSize = this.store.size

      for (const { ticker, name, price } of prices) {
        this.store.set(ticker, { ticker, name, price, source, updated })
      }

      this.cleanup()

      await this.write(prevSize)

      log(`Applied ${prices.length} prices from ${source}`)
    })
  }

  cleanup (days = 7) {
    const oneDay = 24 * 60 * 60 * 1000
    const ago = new Date(Date.now() - days * oneDay)
    Array.from(this.store.entries())
      .filter(([_, { updated }]) => updated < ago)
      .forEach(([ticker]) => this.store.delete(ticker))
  }
}

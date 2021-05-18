import Portfolio from './portfolio.mjs'
import {
  importFromPortfolioSheet,
  importFromTradesSheet,
  importFromStocksSheet
} from './import.mjs'
import { updatePrices } from './fetch.mjs'
import { exportPositions, exportTrades, exportStocks } from './export.mjs'

export async function update (options) {
  const portfolio = new Portfolio()
  await portfolio.load()

  if (options['import-portfolio']) {
    await importFromPortfolioSheet(portfolio)
  }

  if (options['import-trades']) {
    await importFromTradesSheet(portfolio)
  }

  if (options['import-stocks']) {
    await importFromStocksSheet(portfolio)
  }

  if (options['fetch-prices']) {
    await updatePrices(portfolio)
  }

  await portfolio.save()

  if (options['export-positions']) {
    await exportPositions(portfolio)
  }
  if (options['export-trades']) {
    await exportTrades(portfolio)
  }

  if (options['export-stocks']) {
    await exportStocks(portfolio)
  }
}

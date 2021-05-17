import Portfolio from './portfolio.mjs'
import { importFromPortfolioSheet, importFromTradesSheet } from './import.mjs'
import { updatePrices } from './fetch.mjs'
import { exportPositions, exportTrades } from './export.mjs'

export async function update (options) {
  const portfolio = new Portfolio()
  await portfolio.load()

  if (options['import-portfolio']) {
    await importFromPortfolioSheet(portfolio)
  }

  if (options['import-trades']) {
    await importFromTradesSheet(portfolio)
  }

  if (options['fetch-prices']) {
    await updatePrices(portfolio.stocks)
  }

  await portfolio.save()

  if (options['export-positions']) {
    await exportPositions(portfolio)
  }
  if (options['export-trades']) {
    await exportTrades(portfolio)
  }
}

import log from 'logjs'
import once from 'pixutil/once'

import * as sheets from 'googlejs/sheets'
import * as drive from 'googlejs/drive'

const debug = log
  .prefix('sheets:')
  .colour()
  .level(3)

const INVESTMENTS_FOLDER = '0B_zDokw1k2L7VjBGcExJeUxLSlE'

export async function getPortfolioSheet () {
  const data = await getSheetData('Portfolio', 'Investments!A:AM')
  debug('Portfolio data retrieved')
  return data
}

export async function getTradesSheet () {
  const data = await getSheetData('Trades', 'Trades!A2:F')
  debug('Trade data retrieved')
  return data
}

export async function getStocksSheet () {
  const data = await getSheetData('Stocks', 'Stocks!A:D')
  debug('Stocks data retrieved')
  return data
}

export async function updatePositionsSheet (data) {
  await overwriteSheetData('Positions', 'Positions!A2:I', data)
  await putSheetData('Positions', 'Positions!K1', [[new Date()]])
  debug('Positions data updated')
}

export async function updateTradesSheet (data) {
  await overwriteSheetData('Positions', 'Trades!A2:G', data)
  debug('Trades data updated')
}

async function overwriteSheetData (sheetName, range, data) {
  const currData = await getSheetData(sheetName, range)
  const lastRow = findLastRow(currData || [[]])
  const firstRow = data[0]
  while (data.length < lastRow + 1) {
    data.push(firstRow.map(() => ''))
  }

  const newRange = range.replace(/\d+$/, '') + (data.length + 1)
  await putSheetData(sheetName, newRange, data)
}

export async function getSheetData (sheetName, range) {
  const sheetList = await locateSheets()
  const sheet = sheetList.get(sheetName).id

  return sheets.getRange({ sheet, range, scopes: sheets.scopes.rw })
}

async function putSheetData (sheetName, range, data) {
  const sheetList = await locateSheets()
  const sheet = sheetList.get(sheetName).id

  await sheets.updateRange({ sheet, range, data, scopes: sheets.scopes.rw })
}

const locateSheets = once(async function locateSheets () {
  const m = new Map()
  const files = drive.list({ folder: INVESTMENTS_FOLDER })
  for await (const file of files) {
    m.set(file.name, file)
  }
  return m
})

function findLastRow (rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].some(Boolean)) {
      return i
    }
  }
  return -1
}

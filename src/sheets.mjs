import log from 'logjs'

import * as sheets from 'googlejs/sheets'
import * as drive from 'googlejs/drive'

import { once } from './util.mjs'

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

export async function updatePositionsSheet (data) {
  const currData = await getSheetData('Positions', 'Positions!A2:I')
  const lastRow = findLastRow(currData)
  const firstRow = data[0]
  while (data.length < lastRow + 1) {
    data.push(firstRow.map(x => ''))
  }

  const range = `Positions!A2:I${data.length + 1}`
  await putSheetData('Positions', range, data)
  await putSheetData('Positions', 'Positions!K1', [[new Date()]])
  debug('Positions data updated')
}

async function getSheetData (sheetName, range) {
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

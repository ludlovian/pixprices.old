'use strict'

import Debug from 'debug'

import { getGoogleDrive, getGoogleSheets } from './google'
import { once, jsDateToSerialDate } from './util'

const debug = Debug('pixprices:sheets')

const INVESTMENTS_FOLDER = '0B_zDokw1k2L7VjBGcExJeUxLSlE'

const locateSheets = once(async function locateSheets () {
  const drive = await getGoogleDrive()
  const response = await drive.files.list({
    q: `'${INVESTMENTS_FOLDER}' in parents`
  })

  if (response.status !== 200) {
    throw new Error(`bad result: ${response}`)
  }

  return response.data.files.reduce((m, item) => {
    m.set(item.name, item)
    return m
  }, new Map())
})

export async function getPortfolioSheet () {
  const data = await getSheetData('Portfolio', 'Investments!A:AM')
  debug('Portfolio data retrieved')
  return data
}

export async function updatePositionsSheet (data) {
  const currData = await getSheetData('Positions', 'Positions!A2:H')
  const lastRow = findLastRow(currData)
  const firstRow = data[0]
  while (data.length < lastRow + 1) {
    data.push(firstRow.map(x => ''))
  }

  const range = `Positions!A2:H${data.length + 1}`
  await putSheetData('Positions', range, data)
  await putSheetData('Positions', 'Positions!J1', [
    [jsDateToSerialDate(new Date())]
  ])

  debug('Positions data updated')
}

async function getSheetData (sheetName, rangeName) {
  const sheets = await getGoogleSheets()
  const sheetList = await locateSheets()
  const sheetId = sheetList.get(sheetName).id

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: rangeName,
    valueRenderOption: 'UNFORMATTED_VALUE'
  })

  if (response.status !== 200) {
    const err = new Error(`Failed to get ${sheetName}`)
    err.response = response
    throw err
  }
  return response.data.values
}

async function putSheetData (sheetName, rangeName, data) {
  const sheets = await getGoogleSheets()
  const sheetList = await locateSheets()
  const sheetId = sheetList.get(sheetName).id

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: rangeName,
    valueInputOption: 'RAW',
    resource: {
      range: rangeName,
      majorDimension: 'ROWS',
      values: data
    }
  })

  if (response.status !== 200) {
    const err = new Error(`Failed to put ${sheetName}`)
    err.response = response
    throw err
  }
}

function findLastRow (rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].some(Boolean)) {
      return i
    }
  }
  return -1
}

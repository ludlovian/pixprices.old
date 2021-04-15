'use strict'

import { once } from './util'

const DEFAULT_CREDENTIALS = process.cwd() + '/credentials.json'

export const getGoogleDrive = once(async function getGoogleDrive (
  options = {}
) {
  const { credentials = DEFAULT_CREDENTIALS } = options
  const driveApi = await import('@googleapis/drive')
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials
  const auth = new driveApi.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  })
  const authClient = await auth.getClient()
  const drive = await driveApi.drive({
    version: 'v3',
    auth: authClient
  })

  return drive
})

export const getGoogleSheets = once(async function getGoogleSheets (
  options = {}
) {
  const { credentials = DEFAULT_CREDENTIALS } = options
  const sheetsApi = await import('@googleapis/sheets')
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials
  const auth = new sheetsApi.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
  const authClient = await auth.getClient()
  const sheets = await sheetsApi.sheets({
    version: 'v4',
    auth: authClient
  })

  return sheets
})

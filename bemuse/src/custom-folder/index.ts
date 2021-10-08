import _ from 'lodash'
import { get, set } from 'idb-keyval'
import {
  CustomFolderChartFile,
  CustomFolderFolderEntry,
  CustomFolderState,
} from './types'

export interface CustomFolderContext {
  get: (key: string) => Promise<CustomFolderState | undefined>
  set: (key: string, value: CustomFolderState) => Promise<void>
}

export class CustomFolderContextImpl implements CustomFolderContext {
  get = get
  set = set
}

const CUSTOM_FOLDER_KEYVAL_KEY = 'custom-folder-1'

export async function setCustomFolder(
  context: CustomFolderContext,
  folder: FileSystemDirectoryHandle
) {
  await context.set(CUSTOM_FOLDER_KEYVAL_KEY, {
    handle: folder,
  })
}

export async function getCustomFolderState(context: CustomFolderContext) {
  return context.get(CUSTOM_FOLDER_KEYVAL_KEY)
}

export const getDefaultCustomFolderContext = _.once(
  () => new CustomFolderContextImpl()
)

type CustomFolderScanIO = {
  log: (message: string) => void
  setStatus: (message: string) => void
}

export async function scanFolder(
  context: CustomFolderContext,
  io: CustomFolderScanIO
) {
  let state = await getCustomFolderState(context)
  const { log, setStatus } = io
  for (let i = 1; ; i++) {
    log(`Iteration #${i} start`)
    const result = await scanIteration(state, context, io)
    if (!result) {
      break
    }
    if (result.nextState) {
      state = result.nextState
      await context.set(CUSTOM_FOLDER_KEYVAL_KEY, state)
    }
    if (!result.moreIterationsNeeded) {
      break
    }
  }
  setStatus('Done scanning.')
}

async function scanIteration(
  state: CustomFolderState | undefined,
  context: CustomFolderContext,
  io: CustomFolderScanIO
): Promise<ScanIterationResult | undefined> {
  const { log, setStatus } = io
  if (!state) {
    log('No custom folder set.')
    setStatus('No custom folder set.')
    return
  }

  const { handle } = state
  if (!handle) {
    log('No folder selected.')
    setStatus('No folder selected.')
    return
  }

  // Check permissions.
  let permission = await handle.queryPermission({ mode: 'read' })
  if (permission === 'prompt') {
    setStatus('Waiting for permission — please grant access to the folder.')
    permission = await handle.requestPermission({ mode: 'read' })
  }
  if (permission !== 'granted') {
    log('Unable to read the folder due to lack of permissions.')
    setStatus('Unable to read the folder due to lack of permissions.')
    return
  }

  // Enumerate all the files.
  if (!state.chartFilesScanned) {
    const chartFileScanner = new ChartFileScanner(state.chartFiles, true)
    let entriesRead = 0
    const searchForChartFiles = async (
      directoryHandle: FileSystemDirectoryHandle,
      parentPath: string[] = []
    ) => {
      for await (let [name, handle] of directoryHandle) {
        const childPath = [...parentPath, name]
        try {
          if (handle.kind === 'directory') {
            await searchForChartFiles(handle, childPath)
          } else if (/\.(bms|bme|bml|bmson)$/i.test(name)) {
            const fileHandle = handle
            await chartFileScanner.addPath(childPath, {
              getModifiedDate: async () => {
                const file = await fileHandle.getFile()
                return file.lastModified
              },
            })
          }
        } catch (error) {
          log(`Error while processing ${childPath.join('/')}: ${error}`)
          console.error(error)
        }
        entriesRead++
        const childPathStr = formatPath(childPath)
        setStatus(
          `Scanning for chart files. ${entriesRead} entries read. Just processed: ${childPathStr}`
        )
      }
    }
    await searchForChartFiles(handle)

    const newChartFiles = chartFileScanner.getNewChartFiles()
    const foldersToUpdate = chartFileScanner.getFoldersToUpdate()
    const foldersToRemove = chartFileScanner.getFoldersToRemove()
    const message =
      'Scanning done. ' +
      [
        `Charts: ${newChartFiles.length}`,
        `Folders: ${chartFileScanner.getFolderCount()}`,
        `Folders to update: ${foldersToUpdate.length}`,
        `Folders to remove: ${foldersToRemove.length}`,
      ].join('; ')
    log(message)
    setStatus(message)

    return {
      nextState: {
        ...state,
        chartFiles: newChartFiles,
        chartFilesScanned: true,
        foldersToUpdate,
        foldersToRemove,
      },
      moreIterationsNeeded: true,
    }
  }

  if (state.foldersToUpdate && state.foldersToUpdate.length > 0) {
    const foldersToUpdate = [...state.foldersToUpdate]
    const n = foldersToUpdate.length
    for (const [i, folder] of foldersToUpdate.entries()) {
      const pathStr = formatPath(folder.path)
      log(`Updating folder ${i + 1}/${n}: ${pathStr}`)
      setStatus(`Updating folder ${i + 1}/${n}: ${pathStr}`)
    }
  }
}

type ScanIterationResult = {
  nextState?: CustomFolderState
  moreIterationsNeeded: boolean
}

class ChartFileScanner {
  private existingMap: Map<string, CustomFolderChartFile>
  private existingFolderSet: Set<string>
  private foundFolderSet = new Set<string>()
  private updatedFolderSet = new Set<string>()
  private newChartFiles: CustomFolderChartFile[] = []
  private changedPaths: { path: string[]; lastModified: number }[] = []

  constructor(
    private previous: CustomFolderState['chartFiles'] = [],
    private fast: boolean
  ) {
    this.existingMap = new Map(
      _.map(this.previous, file => [JSON.stringify(file.path), file])
    )
    this.existingFolderSet = new Set(
      _.map(this.previous, file => JSON.stringify(file.path.slice(0, -1)))
    )
  }

  async addPath(
    childPath: string[],
    io: {
      getModifiedDate: () => Promise<number>
    }
  ) {
    const key = JSON.stringify(childPath)
    const folderKey = JSON.stringify(childPath.slice(0, -1))
    const existing = this.existingMap.get(key)
    this.foundFolderSet.add(folderKey)
    if (existing) {
      if (!this.fast) {
        const lastModified = await io.getModifiedDate()
        if (lastModified > existing.lastModified) {
          this.changedPaths.push({ path: childPath, lastModified })
          this.newChartFiles.push({ path: childPath, lastModified })
          this.updatedFolderSet.add(folderKey)
        } else {
          this.newChartFiles.push(existing)
        }
      } else {
        this.newChartFiles.push(existing)
      }
    } else {
      const lastModified = await io.getModifiedDate()
      this.changedPaths.push({ path: childPath, lastModified })
      this.newChartFiles.push({ path: childPath, lastModified })
      this.updatedFolderSet.add(folderKey)
    }
  }

  getNewChartFiles() {
    return this.newChartFiles
  }

  getFoldersToUpdate(): CustomFolderFolderEntry[] {
    return [...this.updatedFolderSet].map(folderKey => ({
      path: JSON.parse(folderKey) as string[],
    }))
  }

  getFoldersToRemove(): CustomFolderFolderEntry[] {
    return [...this.existingFolderSet]
      .filter(folderKey => !this.foundFolderSet.has(folderKey))
      .map(folderKey => ({
        path: JSON.parse(folderKey) as string[],
      }))
  }

  getFolderCount() {
    return this.foundFolderSet.size
  }
}
function formatPath(childPath: string[]) {
  return childPath.join('¥')
}

import * as fs from 'fs'
import * as path from 'path'
import { listStrictNullCheckEligibleFiles, getCheckedFiles } from './getStrictNullCheckEligibleFiles'
import { ErrorCounter } from './errorCounter'

const tsconfigPath = path.resolve(process.argv[2])
const srcRoot = path.dirname(tsconfigPath)

tryAutoAddStrictNulls()

async function tryAutoAddStrictNulls() {
  patchNgneat()

  try {
    let hasAddedFile = true
    const checkedFiles = await getCheckedFiles(tsconfigPath, srcRoot)
  
    const errorCounter = new ErrorCounter(tsconfigPath)
  
    // As long as auto-add adds a file, it's possible there's a new file that
    // depends on one of the newly-added files that can now be strict null checked
    while (hasAddedFile) {
      hasAddedFile = false
  
      const eligibleFiles = await listStrictNullCheckEligibleFiles(srcRoot, checkedFiles)
  
      errorCounter.start()
      for (let i = 0; i < eligibleFiles.length; i++) {
        const relativeFilePath = path.relative(srcRoot, eligibleFiles[i])
        console.log(`Trying to auto add '${relativeFilePath}' (file ${i+1}/${eligibleFiles.length})`)
  
        const errorCount = await errorCounter.tryCheckingFile(relativeFilePath)
        if (errorCount === 0) {
          console.log(`👍`)
          addFileToConfig(relativeFilePath)
          hasAddedFile = true
        }
        else {
          console.log(`💥 - ${errorCount}`)
        }
  
        // No point in trying to whitelist the file twice, regardless or success or failure
        checkedFiles.add(eligibleFiles[i])
      }
      errorCounter.end()
    }
  } finally {
    patchNgneat(true);
  }
}

function addFileToConfig(relativeFilePath: string) {
  const config = JSON.parse(fs.readFileSync(tsconfigPath).toString())
  const path = `./${relativeFilePath}`
  const excludeIndex = config.exclude.indexOf(path)
  if (excludeIndex >= 0) {
    config.exclude.splice(excludeIndex, 1)
  } else {
    config.files = Array.from(new Set(config.files.concat(`./${relativeFilePath}`).sort()))
  }
  fs.writeFileSync(tsconfigPath, JSON.stringify(config, null, 2))
}

function patchNgneat(isRestore = false): void {
  const filePath = path.join(srcRoot, '/node_modules/@ngneat/spectator/lib/mock.d.ts');
  const file = fs.readFileSync(filePath).toString();
  fs.writeFileSync(filePath, file.replace(
    isRestore ? 'types="jest"' : 'types="jasmine"',
    isRestore ? 'types="jasmine"' : 'types="jest"',
  ));
}

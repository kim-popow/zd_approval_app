import path from 'node:path'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import glob from 'fast-glob'

export default function StaticCopy({ targets }) {
  let config = null
  return {
    name: 'static-copy',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    async writeBundle() {
      const rootPath = config.build.outDir
      await Promise.all(
        targets.map(async ({ src, dest, modifier = (data) => data }) => {
          const paths = await resolveSourcePaths(src)
          const destinationPath = path.resolve(rootPath, dest)
          await processFiles(paths, destinationPath, modifier)
        })
      )
    }
  }
}

async function processFiles(paths, dest, modifier) {
  await Promise.all(
    paths.map(async (src) => {
      const isDirectory = (await fs.stat(src)).isDirectory()
      if (isDirectory) {
        return
      }

      const file = await fs.readFile(src)
      const fileName = path.basename(src)
      const modifiedFile = modifier(file, fileName)

      await ensureDirectory(dest)
      await fs.writeFile(path.resolve(dest, fileName), modifiedFile)
    })
  )
}

async function ensureDirectory(src) {
  try {
    await fs.mkdir(src, { recursive: true })
  } catch (error) {
    console.error(`Error creating directory ${src}: ${error}`)
  }
}

function hasGlobPattern(input) {
  return /[*?[\]{}()!+@]/.test(input);
}

async function resolveSourcePaths(src) {
  if (!hasGlobPattern(src) && fsSync.existsSync(src)) {
    return [src];
  }

  const normalizedPattern = src.replace(/\\/g, '/');
  return glob(normalizedPattern, {
    absolute: true,
    onlyFiles: true,
    dot: true,
    windowsPathsNoEscape: true
  });
}

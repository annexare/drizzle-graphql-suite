import { copyFile, exists, mkdir, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '..')
const packagesDir = join(rootDir, 'packages')

const FIELDS_TO_COPY = [
  'name',
  'version',
  'description',
  'license',
  'author',
  'repository',
  'homepage',
  'keywords',
  'type',
] as const

async function preparePackage(packageDir: string) {
  const srcPkg = await Bun.file(join(packageDir, 'package.json')).json()
  const distDir = join(packageDir, 'dist')

  if (!(await exists(distDir))) {
    await mkdir(distDir, { recursive: true })
  }

  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const publishPkg: Record<string, any> = {}

  for (const field of FIELDS_TO_COPY) {
    if (srcPkg[field] !== undefined) {
      publishPkg[field] = srcPkg[field]
    }
  }

  publishPkg.publishConfig = { access: 'public' }
  publishPkg.main = './index.js'
  publishPkg.types = './index.d.ts'
  publishPkg.exports = {
    '.': {
      types: './index.d.ts',
      import: './index.js',
    },
  }

  if (srcPkg.dependencies) {
    publishPkg.dependencies = srcPkg.dependencies
  }

  if (srcPkg.peerDependencies) {
    publishPkg.peerDependencies = srcPkg.peerDependencies
  }

  await Bun.write(join(distDir, 'package.json'), `${JSON.stringify(publishPkg, null, 2)}\n`)

  // Copy README if it exists
  const readmePath = join(packageDir, 'README.md')
  if (await exists(readmePath)) {
    await copyFile(readmePath, join(distDir, 'README.md'))
  }

  // Copy root LICENSE
  const licensePath = join(rootDir, 'LICENSE')
  if (await exists(licensePath)) {
    await copyFile(licensePath, join(distDir, 'LICENSE'))
  }

  console.log(`Prepared ${srcPkg.name} for publishing`)
}

async function main() {
  const entries = await readdir(packagesDir, { withFileTypes: true })
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => join(packagesDir, e.name))

  await Promise.all(packageDirs.map(preparePackage))
  console.log('All packages prepared for publishing')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

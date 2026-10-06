import esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const config = {
    entryPoints: ['nyaasi/index.js'],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    outfile: 'dist/nyaasi.js',
    minify: false,
    legalComments: 'none',
    sourcemap: false,
    logLevel: 'info'
}

if (watch) {
    const ctx = await esbuild.context(config)
    await ctx.watch()
} else {
    await esbuild.build(config)
}    